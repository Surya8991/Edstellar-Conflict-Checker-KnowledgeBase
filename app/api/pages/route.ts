import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rowsOf } from "@/lib/db/exec";
import { fetchGscForUrls } from "@/lib/gsc-cluster-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim();
    const type = (params.get("type") ?? "").trim();
    const courseType = (params.get("courseType") ?? "").trim();
    const category = (params.get("category") ?? "").trim();
    const tag = (params.get("tag") ?? "").trim();
    const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
    const page  = Math.max(Number(params.get("page")) || 1, 1);
    const offset = Number(params.get("offset")) || (page - 1) * limit;

    const like = `%${q}%`;

    // A page belongs in the virtual "Redirect / 404" bucket when it 301/302
    // redirects elsewhere (canonical_url points to a different URL) or returns a
    // 4xx/5xx (http_status). COALESCE keeps it a real boolean so NULL statuses
    // don't fall out of BOTH buckets. §29.
    const redir404 = sql`(
      COALESCE(http_status, 0) >= 400
      OR (canonical_url IS NOT NULL AND rtrim(canonical_url, '/') <> rtrim(url, '/'))
    )`;
    const isRedirView = type === "redirect-404";

    const search = sql`(${q} = '' OR title ILIKE ${like} OR url ILIKE ${like})`;
    // In the normal views (all + each content type) redirect/404 pages are
    // pulled OUT (NOT redir404) so they live only in their own bucket.
    const filters = isRedirView
      ? sql`${search} AND ${redir404}`
      : sql`${search}
          AND NOT ${redir404}
          AND (${type}       = '' OR content_type = ${type})
          AND (${courseType} = '' OR course_type = ${courseType})
          AND (${category}   = '' OR category    = ${category})
          AND (${tag}        = '' OR ${tag} = ANY(tags))`;

    const rows = await db.execute(sql`
      SELECT id, url, title, h1, meta_description, content_type, course_type,
             category, subcategory, tags, lastmod, token_count,
             (embedding IS NOT NULL) AS embedded,
             owner_url, canonical_url, http_status, image_count, images_no_alt,
             is_stale, stale_reason
      FROM pages
      WHERE ${filters}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRows = await db.execute(sql`
      SELECT count(*)::int AS total FROM pages WHERE ${filters}
    `);

    const byType = await db.execute(sql`
      SELECT content_type, count(*)::int AS n
      FROM pages
      WHERE NOT ${redir404}
      GROUP BY content_type
      ORDER BY n DESC
    `);

    const redirRows = await db.execute(sql`
      SELECT count(*)::int AS n FROM pages WHERE ${redir404}
    `);

    const byCourseType = await db.execute(sql`
      SELECT course_type, count(*)::int AS n
      FROM pages
      WHERE course_type IS NOT NULL
      GROUP BY course_type
      ORDER BY n DESC
    `);

    const topCategories = await db.execute(sql`
      SELECT category, count(*)::int AS n
      FROM pages
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY n DESC
      LIMIT 25
    `);

    const data = rowsOf<Record<string, unknown>>(rows);

    // Primary keyword per page: the #1 GSC query by clicks over the LAST FULL
    // MONTH (gsc_metrics 'q' rows use TOPQ_MONTHS=1), branded/excluded terms
    // already stripped by fetchGscForUrls. One batched read for this page. The
    // query row carries its own last-month clicks / impressions / position.
    const urls = data.map((r) => String(r.url));
    const gsc = await fetchGscForUrls(urls);
    for (const r of data) {
      const top = gsc.get(String(r.url))?.topQueries[0];
      r.primary_keyword = top
        ? { query: top.query, clicks: top.clicks, impressions: top.impressions, position: top.position }
        : null;
    }

    const total = rowsOf<{ total: number }>(totalRows)[0]?.total ?? 0;
    const byTypeArr = rowsOf<{ content_type: string; n: number }>(byType);
    const byCourseTypeArr = rowsOf<{ course_type: string; n: number }>(byCourseType);
    const topCategoriesArr = rowsOf<{ category: string; n: number }>(topCategories);
    const redirect404 = rowsOf<{ n: number }>(redirRows)[0]?.n ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({
      total,
      rows: data,
      byType: byTypeArr,
      byCourseType: byCourseTypeArr,
      topCategories: topCategoriesArr,
      redirect404,
      page,
      pageSize: limit,
      totalPages,
      offset,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, rows: [], total: 0, byType: [], byCourseType: [], topCategories: [], redirect404: 0, page: 1, totalPages: 1 },
      { status: 500 },
    );
  }
}
