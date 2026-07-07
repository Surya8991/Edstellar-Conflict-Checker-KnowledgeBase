/**
 * Populate `gsc_metrics` with per-page full-calendar-month totals (1m/3m/6m) and
 * the top-5 queries per page, for the Content Clusters GSC panel (PROJECTLOG
 * §17O). Bulk GSC calls only (a handful total), so it scales to the whole
 * corpus without blowing GSC quota. Called by the daily gsc-snapshot cron and by
 * scripts/gsc-metrics-snapshot.ts for a manual refresh.
 */
import { google } from "googleapis";
import { neon } from "@neondatabase/serverless";
import { getAuthorizedClient, resolveSiteUrl, resolveFullMonths } from "@/lib/gsc";

/** Full-month windows stored as page-total rows (range_label). */
const WINDOWS = [
  { label: "1m", n: 1 },
  { label: "3m", n: 3 },
  { label: "6m", n: 6 },
] as const;
/** Top queries are taken over the last full calendar month (§17Q). */
const TOPQ_MONTHS = 1;
const TOPQ_PER_PAGE = 5;
/** GSC caps a single call at 25k rows; paginate a little for query coverage. */
const ROW_LIMIT = 25000;
const MAX_QUERY_ROWS = 75000;

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface PageTotal { page: string; range: string; clicks: number; impr: number; ctr: number; pos: number }
interface QueryRow { page: string; query: string; clicks: number; impr: number; ctr: number; pos: number }

/** Ensure the read-path index exists (idempotent). */
export async function ensureGscMetricsIndex(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(`CREATE INDEX IF NOT EXISTS gsc_metrics_page_idx ON gsc_metrics (page)`);
}

export async function snapshotGscMetrics(): Promise<{ pageRows: number; queryRows: number }> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to GSC.");
  const siteUrl = await resolveSiteUrl(client);
  const webmasters = google.webmasters({ version: "v3", auth: client });
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Per-page totals for each full-month window.
  const pageRows: PageTotal[] = [];
  for (const w of WINDOWS) {
    const { startDate, endDate } = resolveFullMonths(w.n);
    const res = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions: ["page"], rowLimit: ROW_LIMIT },
    });
    for (const r of (res.data.rows ?? []) as GscRow[]) {
      const page = r.keys?.[0];
      if (!page) continue;
      pageRows.push({
        page, range: w.label,
        clicks: Math.round(r.clicks ?? 0),
        impr: Math.round(r.impressions ?? 0),
        ctr: r.ctr ?? 0,
        pos: Number((r.position ?? 0).toFixed(2)),
      });
    }
  }

  // 2. Top-5 queries per page over the top-query window. GSC returns rows sorted
  //    by clicks DESC, so the first N per page ARE its top queries.
  const { startDate: qs, endDate: qe } = resolveFullMonths(TOPQ_MONTHS);
  const byPage = new Map<string, QueryRow[]>();
  for (let startRow = 0; startRow < MAX_QUERY_ROWS; startRow += ROW_LIMIT) {
    const res = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: qs, endDate: qe, dimensions: ["page", "query"], rowLimit: ROW_LIMIT, startRow },
    });
    const rows = (res.data.rows ?? []) as GscRow[];
    for (const r of rows) {
      const page = r.keys?.[0];
      const query = r.keys?.[1];
      if (!page || !query) continue;
      const arr = byPage.get(page) ?? [];
      if (arr.length < TOPQ_PER_PAGE) {
        arr.push({
          page, query,
          clicks: Math.round(r.clicks ?? 0),
          impr: Math.round(r.impressions ?? 0),
          ctr: r.ctr ?? 0,
          pos: Number((r.position ?? 0).toFixed(2)),
        });
        byPage.set(page, arr);
      }
    }
    if (rows.length < ROW_LIMIT) break; // last page
  }
  const queryRows: QueryRow[] = [...byPage.values()].flat();

  // 3. Full refresh: drop the labels we own, then bulk-insert. (neon-http is
  //    stateless - no cross-call transaction - but this runs in a daily cron at
  //    5:30am, so the sub-second gap is fine.)
  await ensureGscMetricsIndex();
  await sql.query(`DELETE FROM gsc_metrics WHERE site_url = $1 AND range_label = ANY($2::text[])`, [
    siteUrl,
    ["1m", "3m", "6m", "q"],
  ]);

  if (pageRows.length) {
    await sql.query(
      `INSERT INTO gsc_metrics (site_url, page, query, clicks, impressions, ctr, position, range_label, fetched_at)
       SELECT $1, p, NULL, c, i, ct, po, rl, now()
       FROM unnest($2::text[], $3::int[], $4::int[], $5::real[], $6::real[], $7::text[]) AS t(p, c, i, ct, po, rl)`,
      [
        siteUrl,
        pageRows.map((r) => r.page),
        pageRows.map((r) => r.clicks),
        pageRows.map((r) => r.impr),
        pageRows.map((r) => r.ctr),
        pageRows.map((r) => r.pos),
        pageRows.map((r) => r.range),
      ],
    );
  }
  if (queryRows.length) {
    await sql.query(
      `INSERT INTO gsc_metrics (site_url, page, query, clicks, impressions, ctr, position, range_label, fetched_at)
       SELECT $1, p, q, c, i, ct, po, 'q', now()
       FROM unnest($2::text[], $3::text[], $4::int[], $5::int[], $6::real[], $7::real[]) AS t(p, q, c, i, ct, po)`,
      [
        siteUrl,
        queryRows.map((r) => r.page),
        queryRows.map((r) => r.query),
        queryRows.map((r) => r.clicks),
        queryRows.map((r) => r.impr),
        queryRows.map((r) => r.ctr),
        queryRows.map((r) => r.pos),
      ],
    );
  }

  return { pageRows: pageRows.length, queryRows: queryRows.length };
}
