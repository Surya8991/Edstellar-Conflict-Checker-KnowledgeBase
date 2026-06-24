/**
 * GSC analytics that go beyond "top queries" — cannibalization, striking
 * distance, movers (period-over-period), untapped queries, and catalog gap.
 * Single entry point: buildInsights() — one set of API calls, many derived views.
 */
import { google } from "googleapis";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAuthorizedClient, resolveRange, type RangeKey } from "@/lib/gsc";

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
  matchKind?: "course" | "blog" | "category" | "subcategory";
  matchUrl?: string;
}

export interface Insights {
  range: RangeKey;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: GscRow[];
  topPages: GscRow[];
  trend: GscRow[];
  cannibalization: CannibalGroup[];
  striking: StrikingRow[];
  movers: { winners: MoverRow[]; losers: MoverRow[] };
  untapped: UntappedRow[];
  gap: GapRow[];
  byCountry: GscRow[];
  byDevice: GscRow[];
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

function previousRange(range: RangeKey, today = new Date()) {
  const { startDate, endDate } = resolveRange(range, today);
  const d1 = new Date(startDate);
  const days = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - d1.getTime()) / 86_400_000),
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

// --- Catalog index for the "gap" detector ---------------------------------
interface CourseRow { name: string; link: string; category?: string; subcategory?: string }
interface BlogRow { url: string; title: string; category?: string | null }
let catalogTokens: { kind: "course" | "blog" | "category" | "subcategory"; tokens: Set<string>; url: string }[] | null = null;

function readJson<T>(file: string, fallback: T): T {
  const p = join(process.cwd(), "data", "taxonomy", file);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf8")) as T } catch { return fallback }
}
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
const STOP = new Set(["the","and","for","with","from","that","this","you","your","are","training","course","program","programs","best","top","how","what","why"]);

function loadCatalog() {
  if (catalogTokens) return catalogTokens;
  const courses = readJson<CourseRow[]>("courses.json", []);
  const blogs = readJson<BlogRow[]>("blogs.json", []);
  const out: NonNullable<typeof catalogTokens> = [];
  for (const c of courses) {
    out.push({ kind: "course", tokens: tokenize(c.name), url: c.link });
    if (c.category) out.push({ kind: "category", tokens: tokenize(c.category), url: c.link });
    if (c.subcategory) out.push({ kind: "subcategory", tokens: tokenize(c.subcategory), url: c.link });
  }
  for (const b of blogs) {
    out.push({ kind: "blog", tokens: tokenize(b.title), url: b.url });
  }
  catalogTokens = out;
  return out;
}
function bestCatalogMatch(query: string): { kind: GapRow["matchKind"]; url: string; score: number } | null {
  const q = tokenize(query);
  if (q.size < 2) return null;
  let best: { kind: GapRow["matchKind"]; url: string; score: number } | null = null;
  for (const entry of loadCatalog()) {
    let hits = 0;
    for (const t of q) if (entry.tokens.has(t)) hits++;
    const score = hits / q.size;
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { kind: entry.kind, url: entry.url, score };
    }
  }
  return best;
}

// --- Public entry point ---------------------------------------------------
export async function buildInsights(range: RangeKey): Promise<Insights> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL is not set.");

  const { startDate, endDate } = resolveRange(range);
  const prev = previousRange(range);

  // Parallel fetch: 7 narrow queries.
  const [byQuery, byPage, byDate, byQueryPage, byCountry, byDevice, byQueryPrev] =
    await Promise.all([
      runQuery(client, siteUrl, startDate, endDate, ["query"], 1000),
      runQuery(client, siteUrl, startDate, endDate, ["page"], 500),
      runQuery(client, siteUrl, startDate, endDate, ["date"], 400),
      runQuery(client, siteUrl, startDate, endDate, ["query", "page"], 2000),
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

  // 1. Cannibalization — same query, multiple ranking pages.
  const groups = new Map<string, CannibalGroup>();
  for (const r of byQueryPage) {
    const q = r.keys?.[0] ?? ""; const p = r.keys?.[1] ?? "";
    if (!q || !p) continue;
    let g = groups.get(q);
    if (!g) { g = { query: q, totalImpressions: 0, totalClicks: 0, pages: [] }; groups.set(q, g) }
    g.totalImpressions += r.impressions;
    g.totalClicks += r.clicks;
    g.pages.push({ page: p, clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr });
  }
  const cannibalization = [...groups.values()]
    .filter((g) => g.pages.length >= 2 && g.totalImpressions >= 50)
    .map((g) => ({ ...g, pages: g.pages.sort((a, b) => b.impressions - a.impressions) }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, 50);

  // 2. Striking distance — positions 8..20, decent impressions.
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

  // 3. Movers — period over period.
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

  // 4. Untapped — high impressions, CTR well below expected for position.
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

  // 5. Gap — queries with no matching course/blog/category in the catalog.
  const gap: GapRow[] = byQuery
    .slice(0, 300) // cap LLM-free fuzzy match work
    .map((r) => {
      const q = r.keys?.[0] ?? "";
      const m = bestCatalogMatch(q);
      return {
        query: q,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position,
        matched: !!m,
        matchKind: m?.kind,
        matchUrl: m?.url,
      };
    })
    .filter((g) => !g.matched && g.impressions >= 30)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40);

  return {
    range,
    startDate,
    endDate,
    totals,
    topQueries: byQuery.slice(0, 50),
    topPages: byPage.slice(0, 50),
    trend: byDate,
    cannibalization,
    striking,
    movers: { winners, losers },
    untapped,
    gap,
    byCountry: byCountry.slice(0, 20),
    byDevice,
  };
}
