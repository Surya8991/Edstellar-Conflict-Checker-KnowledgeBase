/**
 * Populate `keyword_conflicts` from a GSC `["query","page"]` pull (PROJECTLOG
 * §18). One narrow, paginated GSC call over the last 3 complete calendar months
 * (the SEO sweet spot for cannibalization - enough impressions to be stable,
 * recent enough to act on), joined to each page's content_type, classified by
 * lib/cannibalization, then bulk-upserted. Called by Job 5 of the daily
 * gsc-snapshot cron and by scripts/cannibalization.ts for a manual refresh.
 */
import { google } from "googleapis";
import { neon } from "@neondatabase/serverless";
import { getAuthorizedClient, resolveSiteUrl, resolveFullMonths } from "@/lib/gsc";
import { THRESHOLDS } from "@/lib/thresholds";
import { buildConflicts, normalizeUrl, type RawRow } from "@/lib/cannibalization";

export const RANGE_LABEL = "3m";
const RANGE_MONTHS = 3;
const ROW_LIMIT = 25000; // GSC hard cap per call
const MAX_ROWS = 100000; // paginate up to 4 pages of query×page

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/** Idempotent - mirrors drizzle/0012 so a manual refresh works before migrate. */
export async function ensureKeywordConflictsTable(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS keyword_conflicts (
      id                 serial PRIMARY KEY,
      site_url           text,
      query              text NOT NULL,
      range_label        text NOT NULL DEFAULT '3m',
      total_clicks       integer NOT NULL DEFAULT 0,
      total_impressions  integer NOT NULL DEFAULT 0,
      page_count         integer NOT NULL DEFAULT 0,
      position_gap       real,
      best_position      real,
      cross_type         boolean NOT NULL DEFAULT false,
      branded            boolean NOT NULL DEFAULT false,
      commercial_at_risk boolean NOT NULL DEFAULT false,
      severity           text NOT NULL DEFAULT 'low',
      primary_page       text,
      recommended_action text,
      pages              jsonb NOT NULL DEFAULT '[]',
      computed_at        timestamp DEFAULT now()
    )`);
  await sql.query(
    `CREATE INDEX IF NOT EXISTS keyword_conflicts_range_sev_idx ON keyword_conflicts (range_label, severity)`,
  );
}

export async function snapshotKeywordConflicts(): Promise<{ groups: number; rowsScanned: number }> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to GSC.");
  const siteUrl = await resolveSiteUrl(client);
  const webmasters = google.webmasters({ version: "v3", auth: client });
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Paginated query×page pull.
  const { startDate, endDate } = resolveFullMonths(RANGE_MONTHS);
  const raw: RawRow[] = [];
  for (let startRow = 0; startRow < MAX_ROWS; startRow += ROW_LIMIT) {
    const res = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions: ["query", "page"], rowLimit: ROW_LIMIT, startRow },
    });
    const rows = (res.data.rows ?? []) as GscRow[];
    for (const r of rows) {
      const query = r.keys?.[0];
      const page = r.keys?.[1];
      if (!query || !page) continue;
      raw.push({
        query,
        page,
        clicks: Math.round(r.clicks ?? 0),
        impressions: Math.round(r.impressions ?? 0),
        ctr: r.ctr ?? 0,
        position: Number((r.position ?? 0).toFixed(2)),
      });
    }
    if (rows.length < ROW_LIMIT) break;
  }

  // 2. page URL → content_type (normalized keys so GSC variants line up).
  const typeRows = (await sql.query(`SELECT url, content_type FROM pages`)) as {
    url: string;
    content_type: string | null;
  }[];
  const pageType = new Map<string, string | null>();
  for (const t of typeRows) pageType.set(normalizeUrl(t.url), t.content_type);

  // 3. Classify.
  const brandTerms = (process.env.BRAND_TERMS || "edstellar")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const groups = buildConflicts(raw, pageType, THRESHOLDS, {
    minImpr: THRESHOLDS.cannibalMinImpr,
    minPageImpr: THRESHOLDS.cannibalMinPageImpr,
    nearGap: THRESHOLDS.cannibalNearGap,
    brandTerms,
  });

  // 4. Full refresh for this range (neon-http is stateless - the sub-second gap
  //    between DELETE and INSERT is fine for a cron/manual refresh).
  await ensureKeywordConflictsTable();
  await sql.query(`DELETE FROM keyword_conflicts WHERE site_url = $1 AND range_label = $2`, [
    siteUrl,
    RANGE_LABEL,
  ]);

  if (groups.length) {
    await sql.query(
      `INSERT INTO keyword_conflicts
         (site_url, query, range_label, total_clicks, total_impressions, page_count,
          position_gap, best_position, cross_type, branded, commercial_at_risk,
          severity, primary_page, recommended_action, pages, computed_at)
       SELECT $1, q, $2, tc, ti, pc, pg, bp, ct, br, car, sev, pp, act, pj::jsonb, now()
       FROM unnest(
         $3::text[], $4::int[], $5::int[], $6::int[], $7::real[], $8::real[],
         $9::bool[], $10::bool[], $11::bool[], $12::text[], $13::text[], $14::text[], $15::text[]
       ) AS t(q, tc, ti, pc, pg, bp, ct, br, car, sev, pp, act, pj)`,
      [
        siteUrl,
        RANGE_LABEL,
        groups.map((g) => g.query),
        groups.map((g) => g.totalClicks),
        groups.map((g) => g.totalImpressions),
        groups.map((g) => g.pageCount),
        groups.map((g) => g.positionGap),
        groups.map((g) => g.bestPosition),
        groups.map((g) => g.crossType),
        groups.map((g) => g.branded),
        groups.map((g) => g.commercialAtRisk),
        groups.map((g) => g.severity),
        groups.map((g) => g.primaryPage),
        groups.map((g) => g.action),
        groups.map((g) => JSON.stringify(g.pages)),
      ],
    );
  }

  return { groups: groups.length, rowsScanned: raw.length };
}
