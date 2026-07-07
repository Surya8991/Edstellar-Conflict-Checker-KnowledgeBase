/**
 * Editable blog-series exclusion list (PROJECTLOG §17P). Pages whose slug
 * contains any enabled pattern are hidden from the ANALYSIS features - Content
 * Clusters and Conflict Checker matches - but kept in the corpus/Database and in
 * GSC. Patterns are managed from the Settings page (excluded_series table).
 */
import { neon } from "@neondatabase/serverless";

export interface ExcludedSeries {
  id: number;
  name: string;
  patterns: string[];
  enabled: boolean;
}

let cache: { patterns: string[]; at: number } | null = null;
const TTL_MS = 60_000;

/** Flattened, lowercased patterns from all ENABLED rows. Cached ~60s; empty on
 *  any error (missing table / no DB) so a failure never blocks a query. */
export async function getExclusionPatterns(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.patterns;
  if (!process.env.DATABASE_URL) return [];
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(
      `SELECT patterns FROM excluded_series WHERE enabled = true`,
    )) as { patterns: string[] | null }[];
    const patterns = rows
      .flatMap((r) => r.patterns ?? [])
      .map((p) => String(p).trim().toLowerCase())
      .filter(Boolean);
    cache = { patterns, at: now };
    return patterns;
  } catch {
    return [];
  }
}

/** Drop the per-instance cache (call after a write from the Settings API). */
export function invalidateExclusionsCache(): void {
  cache = null;
}

/** True if `url` contains any excluded pattern (case-insensitive substring). */
export function isExcludedUrl(url: string | null | undefined, patterns: string[]): boolean {
  if (!url || patterns.length === 0) return false;
  const u = url.toLowerCase();
  return patterns.some((p) => u.includes(p));
}
