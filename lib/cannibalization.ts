/**
 * Keyword cannibalization - pure grouping/classification logic (PROJECTLOG §18).
 *
 * Turns raw GSC `["query","page"]` rows into conflict groups (a query that 2+ of
 * our pages rank for), then classifies each group: severity, the page that
 * SHOULD win (primary) vs the cannibals, cross-content-type detection, and a
 * rule-based recommended action. No I/O here so it's unit-testable.
 *
 * SEO rationale baked in (reviewed as an SEO manager, not just "2 pages = bad"):
 *  - A page needs REAL impressions to count as a competitor. A URL that shows up
 *    twice with 2 impressions isn't cannibalizing anything - it's noise. So each
 *    page must clear `minPageImpr` before the group is even considered.
 *  - Branded queries are FLAGGED, not treated as problems: several of your own
 *    pages ranking for "edstellar ..." is expected. The read layer hides them.
 *  - GSC reports URL variants (trailing slash, #fragment, ?utm=) as different
 *    pages; `normalizeUrl` collapses them so one page can't cannibalize itself.
 *  - Cross-type clashes (a blog and a course ranking for the same query) are
 *    detected (`crossType`) and surfaced on their own tab; the recommended
 *    action for them is `monitor` (near) or `differentiate` (far apart).
 *  - `intentMismatch` (BACKEND-ONLY - never rendered as a label in the UI): a
 *    higher-funnel page (blog) outranks the conversion-intent page (course/
 *    category) for the same query. It boosts severity to `high` and keeps the
 *    conversion page as `primaryPage`, so the ranking/advice stays SEO-correct
 *    (never 301 across intents) without any user-facing wording.
 *  - "Near position" (the two pages are close together AND both actually rank)
 *    is where consolidation pays off most - Google is genuinely undecided.
 */
import type { Thresholds } from "./thresholds";

export interface RawRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type Severity = "high" | "medium" | "low";
export type ConflictAction = "consolidate" | "differentiate" | "monitor";
export type PageRole = "primary" | "cannibal";

export interface ConflictPage {
  page: string;
  contentType: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  role: PageRole;
}

export interface ConflictGroup {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  pageCount: number;
  bestPosition: number;
  positionGap: number; // gap between the top-2 pages' avg positions
  crossType: boolean;
  branded: boolean;
  /** Backend-only SEO signal: the conversion-intent page is being outranked by a
   *  higher-funnel page. Boosts severity; NEVER surfaced as a label in the UI
   *  and not included in the /api/cannibalization payload. */
  intentMismatch: boolean;
  severity: Severity;
  primaryPage: string;
  action: ConflictAction;
  pages: ConflictPage[];
}

export interface BuildOpts {
  minImpr: number; // group-total impressions floor
  minPageImpr: number; // per-page impressions floor to count as a real competitor
  nearGap: number; // max avg-position DIFFERENCE (±) for the top-2 pages to be "near"
  brandTerms: string[];
}

/** Relative value of a content type - a course/category is higher-value, a blog
 *  is TOFU. Used only to pick which page to keep as primary when types collide
 *  (cross-type groups). Higher = higher value. */
const CONTENT_VALUE_RANK: Record<string, number> = {
  course: 3,
  "managed-training": 3,
  platform: 3,
  consulting: 3,
  category: 2,
  subcategory: 2,
  templates: 1,
  blog: 1,
};
function commercialRank(t: string | null): number {
  return CONTENT_VALUE_RANK[t ?? ""] ?? 1;
}

/** Collapse GSC URL variants (protocol/case/trailing-slash/#frag/?query) so a
 *  page never appears twice and can't "cannibalize itself". */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return u
      .replace(/[#?].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

/**
 * Should a competing page still be shown? A conflict page is "live" only if it
 * exists in the corpus and isn't returning a 4xx/5xx. Callers pass the page's
 * `pages.http_status`:
 *   - `undefined` → the URL isn't in the corpus at all (removed / 404 / never
 *     ingested) → NOT live.
 *   - `null`      → in the corpus but never audited (status unknown) → keep.
 *   - `>= 400`    → in the corpus but broken (4xx/5xx) → NOT live.
 * This is what keeps dead URLs GSC still has impressions for out of the
 * Keyword Cannibalization view (§18L).
 */
export function isLivePageStatus(status: number | null | undefined): boolean {
  if (status === undefined) return false;
  if (status != null && status >= 400) return false;
  return true;
}

/** Levenshtein distance, capped for speed (returns cap+1 once it's exceeded). */
function editDistance(a: string, b: string, cap = 3): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > cap) return cap + 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[n];
}

/**
 * Branded when the query contains a brand term OR is a near-miss of one.
 * Normalizes away spaces/punctuation ("ed stellar", "www.edstellar.com") and
 * catches common misspellings ("edsteller", "edstella") within edit-distance 2,
 * so brand-navigational SERPs (many pages all ranking ~#1 with sitelinks) aren't
 * mistaken for content cannibalization.
 */
export function isBrandedQuery(q: string, brandTerms: string[]): boolean {
  const norm = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm) return false;
  return brandTerms.some((t) => {
    const bt = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!bt) return false;
    if (norm.includes(bt)) return true;
    // fuzzy only when the query is brand-dominant (similar length), so we don't
    // flag long informational queries that merely share a few letters.
    return Math.abs(norm.length - bt.length) <= 2 && editDistance(norm, bt, 2) <= 2;
  });
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function buildConflicts(
  rows: RawRow[],
  pageType: Map<string, string | null>,
  _t: Thresholds,
  opts: BuildOpts,
): ConflictGroup[] {
  // 1. Group rows by query, folding URL variants into one page each.
  const byQuery = new Map<string, Map<string, ConflictPage>>();
  for (const r of rows) {
    if (!r.query || !r.page) continue;
    const nurl = normalizeUrl(r.page);
    let pages = byQuery.get(r.query);
    if (!pages) {
      pages = new Map();
      byQuery.set(r.query, pages);
    }
    const prev = pages.get(nurl);
    if (prev) {
      const totalImpr = prev.impressions + r.impressions;
      // impression-weighted average position across the merged variants
      prev.position =
        totalImpr > 0
          ? (prev.position * prev.impressions + r.position * r.impressions) / totalImpr
          : prev.position;
      prev.clicks += r.clicks;
      prev.impressions = totalImpr;
      prev.ctr = prev.impressions ? prev.clicks / prev.impressions : 0;
    } else {
      pages.set(nurl, {
        page: nurl,
        contentType: pageType.get(nurl) ?? null,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        role: "cannibal",
      });
    }
  }

  const out: ConflictGroup[] = [];
  for (const [query, pmap] of byQuery) {
    // 2. Keep only pages that actually rank (real impressions).
    const pages = [...pmap.values()].filter((p) => p.impressions >= opts.minPageImpr);
    if (pages.length < 2) continue;
    const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
    if (totalImpressions < opts.minImpr) continue;
    // 3. Classify the qualified page set.
    out.push(classifyGroup(query, pages, opts));
  }

  return sortConflicts(out);
}

export function sortConflicts(groups: ConflictGroup[]): ConflictGroup[] {
  const sevRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  return groups.sort(
    (a, b) =>
      sevRank[b.severity] - sevRank[a.severity] ||
      b.totalClicks - a.totalClicks ||
      b.totalImpressions - a.totalImpressions,
  );
}

/**
 * Classify one already-grouped set of ≥2 competing pages for a query - severity,
 * the page to keep (primary) vs cannibals, cross-type, and the recommended
 * action. Pure over the given pages, so the read layer can RE-classify after
 * exclusions drop some pages (otherwise the stored gap/severity/action would
 * describe pages that are no longer shown - PROJECTLOG §18G).
 */
export function classifyGroup(
  query: string,
  input: ConflictPage[],
  opts: { nearGap: number; brandTerms: string[] },
): ConflictGroup {
  const totalImpressions = input.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = input.reduce((s, p) => s + p.clicks, 0);

  // Order by best (lowest) position first.
  const pages = input.slice().sort((a, b) => a.position - b.position);
  const bestPosition = pages[0].position;
  const positionGap = pages[1].position - pages[0].position;

  const crossType = new Set(pages.map((p) => p.contentType ?? "unknown")).size >= 2;
  const branded = isBrandedQuery(query, opts.brandTerms);
  const maxCommercial = Math.max(...pages.map((p) => commercialRank(p.contentType)));

  // Intent mismatch (backend-only): the highest-value page is NOT the one winning.
  const intentMismatch = maxCommercial > commercialRank(pages[0].contentType);

  // Primary page = who we recommend to keep/win. For a cross-type clash we keep
  // the higher-value content type (even if it's currently losing); else the best
  // current performer (position, then clicks).
  let primary: ConflictPage;
  if (crossType && maxCommercial > 1) {
    primary = pages
      .filter((p) => commercialRank(p.contentType) === maxCommercial)
      .sort((a, b) => a.position - b.position || b.clicks - a.clicks)[0];
  } else {
    primary = pages.slice().sort((a, b) => a.position - b.position || b.clicks - a.clicks)[0];
  }
  const scored = pages.map((p) => ({ ...p, role: (p.page === primary.page ? "primary" : "cannibal") as PageRole }));

  // Action (rule-based). "near" = the top-2 avg positions are within ±nearGap.
  const near = positionGap <= opts.nearGap;
  let action: ConflictAction;
  if (crossType && maxCommercial > 1) {
    action = near ? "monitor" : "differentiate";
  } else if (near) {
    action = "consolidate";
  } else {
    action = "differentiate";
  }

  // Severity (explainable). An intent mismatch is lost revenue, not just split
  // equity, so it always ranks high - the UI just shows "high", no special label.
  let severity: Severity = "low";
  if (intentMismatch || totalClicks >= 50 || (near && totalClicks >= 10)) severity = "high";
  else if (near || totalClicks >= 10 || totalImpressions >= 500) severity = "medium";

  return {
    query,
    totalClicks,
    totalImpressions,
    pageCount: scored.length,
    bestPosition: round2(bestPosition),
    positionGap: round2(positionGap),
    crossType,
    branded,
    intentMismatch,
    severity,
    primaryPage: primary.page,
    action,
    pages: scored.map((p) => ({ ...p, position: round2(p.position), ctr: Number(p.ctr.toFixed(4)) })),
  };
}
