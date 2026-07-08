/**
 * GSC analytics that go beyond "top queries" - cannibalization, striking
 * distance, movers (period-over-period), untapped queries, and catalog gap.
 * Single entry point: buildInsights() - one set of API calls, many derived views.
 */
import { google } from "googleapis";
import { getAuthorizedClient, resolveRange, resolveSiteUrl, type RangeKey } from "@/lib/gsc";
import { getEmbedder } from "@/lib/ai";
import { vectorSearchPages } from "@/lib/search";

export interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface CannibalGroup {
  query: string;
  totalImpressions: number;
  totalClicks: number;
  pages: { page: string; clicks: number; impressions: number; position: number; ctr: number }[];
}

export interface StrikingRow {
  query: string;
  page?: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  potentialClicks: number; // est. clicks if we hit top-3
}

export interface MoverRow {
  query: string;
  clicksNow: number;
  clicksPrev: number;
  deltaClicks: number;
  positionNow: number;
  positionPrev: number;
  deltaPosition: number; // negative = improved
}

export interface UntappedRow {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  expectedCtr: number;
  lostClicks: number;
}

export interface GapRow {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  matched: boolean;
  /** content_type of the nearest corpus page (when matched). */
  matchKind?: string;
  matchUrl?: string;
  /** Cosine similarity (0..1) of the nearest corpus page - low = real gap. */
  bestSim?: number;
}

export interface BrandedSplit {
  branded:   { clicks: number; impressions: number; ctr: number };
  nonBranded:{ clicks: number; impressions: number; ctr: number };
  brandTerms: string[];
}

export interface StaleRow {
  page: string;
  recentClicks: number;
  priorClicks: number;
  decline: number;       // negative number; lower = more stale
  declinePct: number;    // -1 to 0
}

export interface Insights {
  range: RangeKey;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: GscRow[];
  topPages: GscRow[];
  trend: GscRow[];
  striking: StrikingRow[];
  movers: { winners: MoverRow[]; losers: MoverRow[] };
  untapped: UntappedRow[];
  byCountry: GscRow[];
  byDevice: GscRow[];
  branded: BrandedSplit;
  stale: StaleRow[];
}

// Approximate Google CTR-by-position curve (industry benchmarks).
const CTR_CURVE = [
  0.275, 0.155, 0.110, 0.080, 0.060, 0.045, 0.035, 0.027, 0.022, 0.018,
  0.015, 0.012, 0.010, 0.009, 0.008, 0.007, 0.006, 0.005, 0.005, 0.005,
];
function expectedCtr(position: number): number {
  const i = Math.max(0, Math.min(CTR_CURVE.length - 1, Math.round(position) - 1));
  return CTR_CURVE[i];
}

/**
 * Compute the prior-period window the same length as the current one,
 * ending the day before `startDate`. Works for both preset ranges and
 * fully custom (startDate, endDate) windows.
 */
function previousRange(currentStart: string, currentEnd: string) {
  const d1 = new Date(currentStart);
  const days = Math.max(
    1,
    Math.round((new Date(currentEnd).getTime() - d1.getTime()) / 86_400_000),
  );
  const prevEnd = new Date(d1);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

async function runQuery(
  client: any,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 1000,
): Promise<GscRow[]> {
  const webmasters = google.webmasters({ version: "v3", auth: client });
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions, rowLimit },
  });
  return (res.data.rows ?? []) as GscRow[];
}

// --- Semantic catalog-gap detector (§25) ----------------------------------
// A query is a GAP when NO corpus page is semantically close to it (pgvector
// cosine, not string-token overlap). Env-overridable floor; a page must clear
// it to count the query as "covered". Calibrated live on the corpus: genuine
// matches score ~0.76-0.82 while tangential "nearest" pages land ~0.55-0.64, so
// 0.68 cleanly separates covered from gap (bge-small compresses cosine into a
// high band - don't drop this below ~0.65 or tangential matches hide real gaps).
const GAP_MIN_SIM = Number(process.env.GSC_GAP_MIN_SIM) || 0.68;
const GAP_MAX_CANDIDATES = 80;

/** Run an async fn over items with bounded concurrency (keeps the per-candidate
 *  pgvector round-trips from opening 80 connections at once). */
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

/**
 * Semantic catalog gap: the queries you already rank for that have NO closely-
 * matching corpus page (by embedding cosine, so wording differences don't hide a
 * real gap the way string-token overlap did). Each surviving query is a concrete
 * "create dedicated content" opportunity. Lazy/on-demand (its own route) because
 * embedding + per-candidate vector search is heavier than the other sections.
 */
export async function semanticCatalogGap(
  range: RangeKey,
  custom?: { startDate?: string; endDate?: string },
): Promise<GapRow[]> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = await resolveSiteUrl(client);
  const { startDate, endDate } = resolveRange(range, new Date(), custom);

  const byQuery = await runQuery(client, siteUrl, startDate, endDate, ["query"], 1000);
  const candidates = byQuery
    .filter((r) => r.impressions >= 30 && (r.keys?.[0] ?? "").trim().length > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, GAP_MAX_CANDIDATES);
  if (!candidates.length) return [];

  const embeddings = await getEmbedder().embed(candidates.map((c) => c.keys?.[0] ?? ""));

  const rows = await mapPool(candidates, 10, async (c, i) => {
    const [top] = await vectorSearchPages(embeddings[i], { limit: 1 });
    const bestSim = top?.similarity ?? 0;
    const matched = bestSim >= GAP_MIN_SIM;
    return {
      query: c.keys?.[0] ?? "",
      impressions: c.impressions,
      clicks: c.clicks,
      position: c.position,
      matched,
      matchKind: matched ? top?.contentType ?? undefined : undefined,
      matchUrl: matched ? top?.url : undefined,
      bestSim: Number(bestSim.toFixed(3)),
    } satisfies GapRow;
  });

  return rows.filter((r) => !r.matched).sort((a, b) => b.impressions - a.impressions).slice(0, 50);
}

// --- Public entry point ---------------------------------------------------
export async function buildInsights(
  range: RangeKey,
  custom?: { startDate?: string; endDate?: string },
): Promise<Insights> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = await resolveSiteUrl(client);

  const { startDate, endDate } = resolveRange(range, new Date(), custom);
  const prev = previousRange(startDate, endDate);

  // Parallel fetch: 6 narrow queries. (Cannibalization was removed - the
  // dedicated /keyword-cannibalization tool supersedes it, §25.)
  const [byQuery, byPage, byDate, byCountry, byDevice, byQueryPrev] =
    await Promise.all([
      runQuery(client, siteUrl, startDate, endDate, ["query"], 1000),
      runQuery(client, siteUrl, startDate, endDate, ["page"], 500),
      runQuery(client, siteUrl, startDate, endDate, ["date"], 400),
      runQuery(client, siteUrl, startDate, endDate, ["country"], 50),
      runQuery(client, siteUrl, startDate, endDate, ["device"], 5),
      runQuery(client, siteUrl, prev.startDate, prev.endDate, ["query"], 1000),
    ]);

  // Totals
  const totals = byDate.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      ctr: 0,
      position: 0,
    }),
    { clicks: 0, impressions: 0, ctr: 0, position: 0 },
  );
  totals.ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
  totals.position = byDate.length
    ? byDate.reduce((s, r) => s + r.position, 0) / byDate.length
    : 0;

  // Striking distance - positions 8..20, decent impressions.
  const striking: StrikingRow[] = byQuery
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 20)
    .map((r) => {
      const top3Ctr = (CTR_CURVE[0] + CTR_CURVE[1] + CTR_CURVE[2]) / 3;
      const potentialClicks = Math.round(r.impressions * top3Ctr);
      return {
        query: r.keys?.[0] ?? "",
        position: r.position,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        potentialClicks,
      };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50);

  // 3. Movers - period over period.
  const prevMap = new Map<string, GscRow>();
  for (const r of byQueryPrev) prevMap.set(r.keys?.[0] ?? "", r);
  const movers: MoverRow[] = byQuery
    .map((r) => {
      const q = r.keys?.[0] ?? "";
      const p = prevMap.get(q);
      return {
        query: q,
        clicksNow: r.clicks,
        clicksPrev: p?.clicks ?? 0,
        deltaClicks: r.clicks - (p?.clicks ?? 0),
        positionNow: r.position,
        positionPrev: p?.position ?? r.position,
        deltaPosition: r.position - (p?.position ?? r.position),
      };
    })
    .filter((m) => m.clicksNow + m.clicksPrev >= 5);
  const winners = movers.slice().sort((a, b) => b.deltaClicks - a.deltaClicks).slice(0, 25);
  const losers  = movers.slice().sort((a, b) => a.deltaClicks - b.deltaClicks).slice(0, 25);

  // 4. Untapped - high impressions, CTR well below expected for position.
  const untapped: UntappedRow[] = byQuery
    .filter((r) => r.impressions >= 100)
    .map((r) => {
      const exp = expectedCtr(r.position);
      const lostClicks = Math.max(0, Math.round((exp - r.ctr) * r.impressions));
      return {
        query: r.keys?.[0] ?? "",
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        position: r.position,
        expectedCtr: exp,
        lostClicks,
      };
    })
    .filter((u) => u.lostClicks >= 5)
    .sort((a, b) => b.lostClicks - a.lostClicks)
    .slice(0, 40);

  // Branded vs non-branded split. (Catalog gap moved to the lazy, semantic
  // `semanticCatalogGap` / `/api/gsc/catalog-gap` route - §25.)
  const branded = computeBrandedSplit(byQuery);

  // 7. Stale-content detector - current period vs previous period per page.
  const prevPages = await runQuery(client, siteUrl, prev.startDate, prev.endDate, ["page"], 500);
  const prevPageMap = new Map(prevPages.map((r) => [r.keys?.[0] ?? "", r.clicks]));
  const stale: StaleRow[] = byPage
    .map((r) => {
      const page = r.keys?.[0] ?? "";
      const prev = prevPageMap.get(page) ?? 0;
      const decline = r.clicks - prev;
      const declinePct = prev > 0 ? decline / prev : 0;
      return { page, recentClicks: r.clicks, priorClicks: prev, decline, declinePct };
    })
    .filter((s) => s.priorClicks >= 10 && s.declinePct <= -0.3)
    .sort((a, b) => a.decline - b.decline)
    .slice(0, 30);

  return {
    range,
    startDate,
    endDate,
    totals,
    topQueries: byQuery.slice(0, 50),
    topPages: byPage.slice(0, 50),
    trend: byDate,
    striking,
    movers: { winners, losers },
    untapped,
    byCountry: byCountry.slice(0, 20),
    byDevice,
    branded,
    stale,
  };
}

const DEFAULT_BRAND_TERMS = ["edstellar"];
function computeBrandedSplit(byQuery: GscRow[]): BrandedSplit {
  const terms = (process.env.BRAND_TERMS || DEFAULT_BRAND_TERMS.join(","))
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let b = { clicks: 0, impressions: 0 };
  let nb = { clicks: 0, impressions: 0 };
  for (const r of byQuery) {
    const q = (r.keys?.[0] ?? "").toLowerCase();
    const isBranded = terms.some((t) => q.includes(t));
    const tgt = isBranded ? b : nb;
    tgt.clicks += r.clicks;
    tgt.impressions += r.impressions;
  }
  const ctr = (x: { clicks: number; impressions: number }) =>
    x.impressions ? x.clicks / x.impressions : 0;
  return {
    branded: { ...b, ctr: ctr(b) },
    nonBranded: { ...nb, ctr: ctr(nb) },
    brandTerms: terms,
  };
}

/** Page drilldown - queries / countries / devices for a single page. */
export async function pageDrilldown(page: string, range: RangeKey) {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = await resolveSiteUrl(client);
  const { startDate, endDate } = resolveRange(range);
  const dim = (d: string[]) =>
    google.webmasters({ version: "v3", auth: client }).searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate, endDate, dimensions: d, rowLimit: 200,
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: page }] }],
      },
    }).then((r) => r.data.rows ?? []);
  const [queries, countries, devices, dates] = await Promise.all([
    dim(["query"]), dim(["country"]), dim(["device"]), dim(["date"]),
  ]);
  return { page, range, startDate, endDate, queries, countries, devices, trend: dates };
}

/**
 * Cannibalization groups that contain a specific URL.
 * Single GSC API call (query+page breakdown), filtered to groups where this URL ranks.
 * Used by the conflict-checker to show an inline banner when the input URL is
 * competing with sibling pages for the same query.
 */
export async function pageCannibalization(
  url: string,
  range: RangeKey = "28d",
): Promise<CannibalGroup[]> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = await resolveSiteUrl(client);
  const { startDate, endDate } = resolveRange(range);

  const rows = await runQuery(client, siteUrl, startDate, endDate, ["query", "page"], 5000);

  const groups = new Map<string, CannibalGroup>();
  for (const r of rows) {
    const q = r.keys?.[0] ?? "";
    const p = r.keys?.[1] ?? "";
    if (!q || !p) continue;
    let g = groups.get(q);
    if (!g) { g = { query: q, totalImpressions: 0, totalClicks: 0, pages: [] }; groups.set(q, g) }
    g.totalImpressions += r.impressions;
    g.totalClicks += r.clicks;
    g.pages.push({ page: p, clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr });
  }

  return [...groups.values()]
    .filter((g) => g.pages.length >= 2 && g.totalImpressions >= 50)
    .filter((g) => g.pages.some((p) => p.page === url))
    .map((g) => ({ ...g, pages: g.pages.sort((a, b) => b.impressions - a.impressions) }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, 10);
}

/**
 * Index coverage - for each sitemap URL, ask GSC if it's indexed.
 * Quota: 600 inspections / 24h per site. Caller should batch / pass a slice.
 */
export async function indexCoverage(urls: string[]) {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = await resolveSiteUrl(client);
  const sc = google.searchconsole({ version: "v1", auth: client });
  const out: { url: string; verdict: string; coverageState: string; lastCrawl?: string }[] = [];
  for (const url of urls) {
    try {
      const res = await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: url, siteUrl },
      });
      const r = res.data.inspectionResult?.indexStatusResult;
      out.push({
        url,
        verdict: r?.verdict ?? "UNKNOWN",
        coverageState: r?.coverageState ?? "",
        lastCrawl: r?.lastCrawlTime ?? undefined,
      });
    } catch (e) {
      out.push({ url, verdict: "ERROR", coverageState: (e as Error).message });
    }
  }
  return out;
}
