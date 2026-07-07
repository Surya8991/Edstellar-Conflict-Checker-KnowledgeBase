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
 *  - The WORST conflict is a low-value page (blog) outranking a commercial page
 *    (course/category) for the same query - that's lost revenue, not just split
 *    equity. That's `commercialAtRisk` and it forces severity to `high`.
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
export type ConflictAction = "consolidate" | "protect-commercial" | "differentiate" | "monitor";
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
  commercialAtRisk: boolean;
  severity: Severity;
  primaryPage: string;
  action: ConflictAction;
  pages: ConflictPage[];
}

export interface BuildOpts {
  minImpr: number; // group-total impressions floor
  minPageImpr: number; // per-page impressions floor to count as a real competitor
  nearGap: number; // avg-position gap under which the top-2 pages are "near"
  maxPos: number; // best position must be <= this for a group to be "near"
  brandTerms: string[];
}

/** Commercial value of a content type - a course is the money page, a blog is TOFU.
 *  Used to decide who to protect when types collide. Higher = more commercial. */
const COMMERCIAL_RANK: Record<string, number> = {
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
  return COMMERCIAL_RANK[t ?? ""] ?? 1;
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
    let pages = [...pmap.values()].filter((p) => p.impressions >= opts.minPageImpr);
    if (pages.length < 2) continue;
    const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
    if (totalImpressions < opts.minImpr) continue;
    const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);

    // 3. Order by best (lowest) position first.
    pages = pages.sort((a, b) => a.position - b.position);
    const bestPosition = pages[0].position;
    const positionGap = pages[1].position - pages[0].position;

    const crossType = new Set(pages.map((p) => p.contentType ?? "unknown")).size >= 2;
    const branded = isBrandedQuery(query, opts.brandTerms);

    // 4. Commercial-at-risk: the most commercial page is NOT the one winning.
    const maxCommercial = Math.max(...pages.map((p) => commercialRank(p.contentType)));
    const topCommercial = commercialRank(pages[0].contentType);
    const commercialAtRisk = maxCommercial > topCommercial;

    // 5. Primary page = who we recommend to keep/win. For a cross-type clash we
    //    protect the most commercial page (even if it's currently losing); else
    //    the best current performer (position, then clicks).
    let primary: ConflictPage;
    if (crossType && maxCommercial > 1) {
      primary = pages
        .filter((p) => commercialRank(p.contentType) === maxCommercial)
        .sort((a, b) => a.position - b.position || b.clicks - a.clicks)[0];
    } else {
      primary = pages.slice().sort((a, b) => a.position - b.position || b.clicks - a.clicks)[0];
    }
    for (const p of pages) p.role = p.page === primary.page ? "primary" : "cannibal";

    // 6. Action (rule-based, SEO best practice).
    const near = positionGap <= opts.nearGap && bestPosition <= opts.maxPos;
    let action: ConflictAction;
    if (crossType && maxCommercial > 1) {
      // don't 301 across intents - link/deoptimize toward the money page
      action = commercialAtRisk ? "protect-commercial" : "monitor";
    } else if (near) {
      action = "consolidate"; // same intent, fighting each other → 301 losers → primary
    } else {
      action = "differentiate"; // same type but far apart → distinct angles/keywords
    }

    // 7. Severity (explainable to an SEO, not a black box).
    let severity: Severity = "low";
    if (commercialAtRisk || totalClicks >= 50 || (near && totalClicks >= 10)) severity = "high";
    else if (near || totalClicks >= 10 || totalImpressions >= 500) severity = "medium";

    out.push({
      query,
      totalClicks,
      totalImpressions,
      pageCount: pages.length,
      bestPosition: round2(bestPosition),
      positionGap: round2(positionGap),
      crossType,
      branded,
      commercialAtRisk,
      severity,
      primaryPage: primary.page,
      action,
      pages: pages.map((p) => ({ ...p, position: round2(p.position), ctr: Number(p.ctr.toFixed(4)) })),
    });
  }

  const sevRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  return out.sort(
    (a, b) =>
      sevRank[b.severity] - sevRank[a.severity] ||
      b.totalClicks - a.totalClicks ||
      b.totalImpressions - a.totalImpressions,
  );
}
