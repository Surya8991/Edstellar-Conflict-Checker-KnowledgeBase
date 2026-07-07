import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getExclusions, isExcludedUrl, isExcludedQuery } from "@/lib/exclusions";
import { THRESHOLDS } from "@/lib/thresholds";
import { RANGE_LABEL } from "@/lib/cannibalization-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cannibalization
 *
 * Reads the pre-computed `keyword_conflicts` table (populated offline by the
 * gsc-snapshot cron / `npm run cannibalization`) and returns the enriched
 * conflict groups. Tabs 1-3 (near-position / all / cross-type) are all derived
 * from this one set on the client via `positionGap`/`crossType`; the thresholds
 * used for the "near" filter are returned so the UI stays in sync.
 *
 * Exclusions are applied HERE (read time) so editing them in Settings takes
 * effect without a re-snapshot: excluded queries drop out, excluded pages are
 * removed from each group, and a group that falls below 2 pages disappears.
 * Branded queries are hidden (multiple pages ranking for your brand is normal).
 *
 * Tab 4 (merge-blogs) is served separately by /api/groups (content-based), not
 * from this table.
 */
export async function GET(_req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ groups: [], counts: { all: 0, near: 0, crossType: 0 }, lastComputed: null });
    }
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(
      `SELECT query, total_clicks, total_impressions, page_count, position_gap, best_position,
              cross_type, branded, commercial_at_risk, severity, primary_page,
              recommended_action, pages, computed_at
         FROM keyword_conflicts
        WHERE range_label = $1
        ORDER BY CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
                 total_clicks DESC, total_impressions DESC`,
      [RANGE_LABEL],
    )) as any[];

    const { url: urlPatterns, query: queryPatterns, exception } = await getExclusions();
    const nearGap = THRESHOLDS.cannibalNearGap;
    const maxPos = THRESHOLDS.cannibalMaxPos;

    const groups: any[] = [];
    for (const r of rows) {
      if (r.branded) continue;
      if (isExcludedQuery(r.query, queryPatterns)) continue;
      const pages = (Array.isArray(r.pages) ? r.pages : []).filter(
        (p: any) => !isExcludedUrl(p.page, urlPatterns, exception),
      );
      if (pages.length < 2) continue;
      groups.push({
        query: r.query,
        totalClicks: r.total_clicks,
        totalImpressions: r.total_impressions,
        pageCount: pages.length,
        positionGap: r.position_gap,
        bestPosition: r.best_position,
        crossType: r.cross_type,
        commercialAtRisk: r.commercial_at_risk,
        severity: r.severity,
        primaryPage: r.primary_page,
        action: r.recommended_action,
        pages,
      });
    }

    const near = groups.filter((g) => g.positionGap <= nearGap && g.bestPosition <= maxPos).length;
    const crossType = groups.filter((g) => g.crossType).length;

    return NextResponse.json({
      lastComputed: rows[0]?.computed_at ?? null,
      thresholds: { nearGap, maxPos },
      counts: { all: groups.length, near, crossType },
      groups,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
