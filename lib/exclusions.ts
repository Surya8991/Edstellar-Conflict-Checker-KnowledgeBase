/**
 * Editable exclusion lists (PROJECTLOG §17P/§17Q). Two types:
 *   - 'url'   : slug substrings OR full URLs. A page is hidden from Content
 *               Clusters + Conflict Checker matches when its URL contains any.
 *               (Pages stay in the corpus/Database + GSC.)
 *   - 'query' : GSC keyword-query substrings. Matching queries are hidden from
 *               the clusters GSC panel's top-queries.
 * Managed from the Settings page (excluded_series table).
 */
import { neon } from "@neondatabase/serverless";

export interface ExclusionSets {
  url: string[];
  query: string[];
}

let cache: { sets: ExclusionSets; at: number } | null = null;
const TTL_MS = 60_000;
const EMPTY: ExclusionSets = { url: [], query: [] };

/** Enabled patterns grouped by type, lowercased. Cached ~60s; empty on any
 *  error (missing table / no DB) so a failure never blocks a query. */
export async function getExclusions(): Promise<ExclusionSets> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.sets;
  if (!process.env.DATABASE_URL) return EMPTY;
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(
      `SELECT type, patterns FROM excluded_series WHERE enabled = true`,
    )) as { type: string | null; patterns: string[] | null }[];
    const sets: ExclusionSets = { url: [], query: [] };
    for (const r of rows) {
      const bucket = r.type === "query" ? sets.query : sets.url;
      for (const p of r.patterns ?? []) {
        const v = String(p).trim().toLowerCase();
        if (v) bucket.push(v);
      }
    }
    cache = { sets, at: now };
    return sets;
  } catch {
    return EMPTY;
  }
}

/** Back-compat: enabled URL-type patterns only. */
export async function getExclusionPatterns(): Promise<string[]> {
  return (await getExclusions()).url;
}

/** Drop the per-instance cache (call after a write from the Settings API). */
export function invalidateExclusionsCache(): void {
  cache = null;
}

/** True if `url` contains any excluded URL pattern (case-insensitive substring).
 *  A full URL entered as a pattern matches only that page. */
export function isExcludedUrl(url: string | null | undefined, patterns: string[]): boolean {
  if (!url || patterns.length === 0) return false;
  const u = url.toLowerCase();
  return patterns.some((p) => u.includes(p));
}

/** True if `query` contains any excluded keyword pattern (case-insensitive). */
export function isExcludedQuery(query: string | null | undefined, patterns: string[]): boolean {
  if (!query || patterns.length === 0) return false;
  const q = query.toLowerCase();
  return patterns.some((p) => q.includes(p));
}
