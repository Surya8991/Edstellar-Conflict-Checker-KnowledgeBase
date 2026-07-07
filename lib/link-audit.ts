/**
 * Link Audit - probes the corpus for 301/308 ("permanent move") and 404/410
 * (permanently gone) URLs, and mirrors the current set into the
 * `excluded_series` exclusion list (type 'url') so they drop out of Content
 * Clusters + Conflict Checker matches. Pages stay in the Database + GSC -
 * this only affects the two matching views, same contract as every other
 * exclusion (lib/exclusions.ts).
 *
 * Distinct from `lib/http-status.refreshHttpStatus`: that helper follows
 * redirects (`redirect: "follow"`) to record the FINAL status a URL resolves
 * to, for the dead-page filter in Keyword Cannibalization (§18L). This module
 * needs the raw FIRST-HOP status to tell a 301 apart from whatever it points
 * to, so it probes with `redirect: "manual"` (same technique as
 * `scripts/detect-redirects.ts`) and deliberately does NOT touch
 * `pages.http_status`, so the two probes' different semantics never collide
 * on the same column.
 *
 * Self-healing by construction: every run recomputes the full exclude-worthy
 * set from a fresh probe and REPLACES the tracked exclusion entry's patterns
 * (not append-only) - a page that starts resolving 200 again automatically
 * drops out next run with no extra bookkeeping. `limit` defaults to comfortably
 * more than the whole corpus so a daily run always sees the full picture.
 */
import { neon } from "@neondatabase/serverless";
import { setAppSetting, getAppSettings } from "@/lib/app-settings";
import { invalidateExclusionsCache } from "@/lib/exclusions";

/** 301 Moved Permanently / 308 Permanent Redirect - "permanent move". */
export const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);
/** 404 Not Found / 410 Gone - permanently missing. */
export const DEAD_STATUSES = new Set([404, 410]);

/** Pure classifier, unit-tested. Temporary redirects (302/303/307) and 5xx are
 *  deliberately excluded - they may resolve on their own. */
export function isExcludeWorthy(status: number): boolean {
  return PERMANENT_REDIRECT_STATUSES.has(status) || DEAD_STATUSES.has(status);
}

/** Name of the single exclusion row this module owns end-to-end. Find-by-name
 *  keeps the write idempotent without needing a DB-level unique constraint. */
export const LINK_AUDIT_EXCLUSION_NAME = "Auto: dead/redirected pages (link audit)";

const LAST_RUN_KEY = "link_audit.last_run";

async function probeRaw(url: string): Promise<number> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  try {
    let res = await fetch(url, { method: "HEAD", signal: c.signal, redirect: "manual" });
    // Some servers reject HEAD - retry with GET before giving up.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", signal: c.signal, redirect: "manual" });
    }
    return res.status;
  } catch {
    return 0; // network error / timeout - not classified as dead, just skipped
  } finally {
    clearTimeout(t);
  }
}

export interface LinkAuditResult {
  checked: number;
  redirects: number;
  dead: number;
  excluded: number;
  at: string;
}

export async function auditLinksAndExclude({
  limit = 5000,
  concurrency = 20,
}: { limit?: number; concurrency?: number } = {}): Promise<LinkAuditResult> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(`SELECT url FROM pages ORDER BY id LIMIT $1`, [limit])) as {
    url: string;
  }[];

  let redirects = 0;
  let dead = 0;
  const toExclude = new Set<string>();

  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++;
      const { url } = rows[i]!;
      const status = await probeRaw(url);
      if (PERMANENT_REDIRECT_STATUSES.has(status)) redirects++;
      else if (DEAD_STATUSES.has(status)) dead++;
      if (isExcludeWorthy(status)) toExclude.add(url);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const patterns = [...toExclude].sort();
  const existing = (await sql.query(
    `SELECT id FROM excluded_series WHERE name = $1 LIMIT 1`,
    [LINK_AUDIT_EXCLUSION_NAME],
  )) as { id: number }[];
  if (existing[0]) {
    await sql.query(
      `UPDATE excluded_series SET patterns = $1::text[], updated_at = now() WHERE id = $2`,
      [patterns, existing[0].id],
    );
  } else if (patterns.length > 0) {
    await sql.query(
      `INSERT INTO excluded_series (name, patterns, type, enabled) VALUES ($1, $2::text[], 'url', true)`,
      [LINK_AUDIT_EXCLUSION_NAME, patterns],
    );
  }
  invalidateExclusionsCache();

  const result: LinkAuditResult = {
    checked: rows.length,
    redirects,
    dead,
    excluded: patterns.length,
    at: new Date().toISOString(),
  };
  await setAppSetting(LAST_RUN_KEY, JSON.stringify(result));
  return result;
}

/** Last-run metadata for the Settings page - null if it has never run. */
export async function getLastLinkAuditRun(): Promise<LinkAuditResult | null> {
  const map = await getAppSettings();
  const raw = map[LAST_RUN_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LinkAuditResult;
  } catch {
    return null;
  }
}
