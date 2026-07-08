/**
 * Read per-page GSC metrics (populated by lib/gsc-metrics.snapshotGscMetrics)
 * for the Content Clusters panel: 1m/3m/6m full-month totals + top-5 queries,
 * for a batch of member URLs in one query. Pure DB read - no live GSC calls.
 */
import { neon } from "@neondatabase/serverless";
import { getExclusions, isExcludedQuery } from "@/lib/exclusions";
import { isBrandedQuery } from "@/lib/cannibalization";

export interface GscWindow {
  clicks: number;
  impressions: number;
  position: number;
}
export interface GscQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}
export interface PageGsc {
  m1: GscWindow | null;
  m3: GscWindow | null;
  m6: GscWindow | null;
  m12: GscWindow | null;
  topQueries: GscQuery[];
}

interface Row {
  page: string;
  query: string | null;
  range_label: string | null;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
}

const win = (r: Row): GscWindow => ({
  clicks: Math.round(Number(r.clicks ?? 0)),
  impressions: Math.round(Number(r.impressions ?? 0)),
  position: Number(Number(r.position ?? 0).toFixed(1)),
});

/** Map<url, PageGsc> for the given member URLs (empty map if none/no DB). */
export async function fetchGscForUrls(urls: string[]): Promise<Map<string, PageGsc>> {
  const out = new Map<string, PageGsc>();
  if (!urls.length || !process.env.DATABASE_URL) return out;
  const sql = neon(process.env.DATABASE_URL);
  let rows: Row[];
  try {
    rows = (await sql.query(
      `SELECT page, query, range_label, clicks, impressions, position
       FROM gsc_metrics WHERE page = ANY($1::text[])`,
      [urls],
    )) as Row[];
  } catch {
    return out; // table missing / not populated yet - degrade to no data
  }

  const get = (page: string): PageGsc => {
    let g = out.get(page);
    if (!g) {
      g = { m1: null, m3: null, m6: null, m12: null, topQueries: [] };
      out.set(page, g);
    }
    return g;
  };

  for (const r of rows) {
    const g = get(r.page);
    if (r.range_label === "q" && r.query) {
      g.topQueries.push({
        query: r.query,
        clicks: Math.round(Number(r.clicks ?? 0)),
        impressions: Math.round(Number(r.impressions ?? 0)),
        position: Number(Number(r.position ?? 0).toFixed(1)),
      });
    } else if (r.range_label === "1m") g.m1 = win(r);
    else if (r.range_label === "3m") g.m3 = win(r);
    else if (r.range_label === "6m") g.m6 = win(r);
    else if (r.range_label === "12m") g.m12 = win(r);
  }

  // Drop excluded keyword queries (Settings, §17Q) AND branded queries (brand
  // navigational terms + misspellings that the substring exclude-list can't catch,
  // e.g. "edsteller", "ed stellar"), then keep the 5 best per page (clicks desc,
  // then impressions).
  const { query: queryExclusions } = await getExclusions();
  const brandTerms = (process.env.BRAND_TERMS || "edstellar")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const g of out.values()) {
    g.topQueries = g.topQueries.filter(
      (q) => !isExcludedQuery(q.query, queryExclusions) && !isBrandedQuery(q.query, brandTerms),
    );
    g.topQueries.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    g.topQueries = g.topQueries.slice(0, 5);
  }
  return out;
}
