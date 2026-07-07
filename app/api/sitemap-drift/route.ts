import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isJunkUrl } from "@/lib/sitemap";
import { fetchSitemapUrls } from "@/lib/sitemap-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/sitemap-drift?host=https://www.edstellar.com
 *
 * Fetches the live sitemap.xml, diffs against pages.url in the corpus, and
 * returns:
 *   - publishedNotIngested: URLs in live sitemap but missing from pages
 *                            (i.e. the team published things and the
 *                            ingest cron hasn't picked them up yet)
 *   - removedFromSitemap:   URLs in pages but not in the live sitemap
 *                            (i.e. unpublished/404 but still scoring as
 *                            conflicts)
 *
 * Both lists are filtered through the same junk-URL pattern the sitemap
 * loader uses so noise (tag archives, file downloads) doesn't show up as
 * 'drift'.
 *
 * Cheap to run - one fetch + one DB query. No cron needed; it's a snapshot
 * computed on demand from the dashboard.
 */

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const host = u.searchParams.get("host") || "https://www.edstellar.com";
    const live = (await fetchSitemapUrls(host)).filter((url) => !isJunkUrl(url));
    const liveSet = new Set(live);

    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql.query(
      "SELECT url FROM pages",
    )) as { url: string }[];
    const corpusSet = new Set(rows.map((r) => r.url));

    const publishedNotIngested = live
      .filter((url) => !corpusSet.has(url))
      .slice(0, 500);
    const removedFromSitemap = rows
      .map((r) => r.url)
      .filter((url) => !liveSet.has(url) && !isJunkUrl(url))
      .slice(0, 500);

    return NextResponse.json({
      liveCount: live.length,
      corpusCount: rows.length,
      publishedNotIngested,
      removedFromSitemap,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
