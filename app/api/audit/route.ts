import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit?kind=meta|links|health|duplicates
 *   meta       — title/meta length issues (<25 or >65 title; <70 or >160 desc)
 *   links      — pages with non-2xx http_status (run audit:links first)
 *   health     — composite per-page score (0–100)
 *   duplicates — duplicate H1s and titles in the catalog
 */
export async function GET(request: NextRequest) {
  try {
    const kind = (request.nextUrl.searchParams.get("kind") ?? "meta").toLowerCase();
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 200, 1000);

    if (kind === "meta") {
      const rows = await db.execute(sql`
        SELECT id, url, title, meta_description,
               length(coalesce(title,'')) AS title_len,
               length(coalesce(meta_description,'')) AS meta_len,
               content_type
        FROM pages
        WHERE title IS NULL
           OR meta_description IS NULL
           OR length(coalesce(title,'')) < 25
           OR length(coalesce(title,'')) > 65
           OR length(coalesce(meta_description,'')) < 70
           OR length(coalesce(meta_description,'')) > 160
        ORDER BY content_type, id
        LIMIT ${limit}
      `);
      const data = (rows as any).rows ?? rows;
      const issues = data.map((r: any) => ({
        ...r,
        flags: metaFlags(r.title_len, r.meta_len, r.title, r.meta_description),
      }));
      return NextResponse.json({ rows: issues });
    }

    if (kind === "links") {
      // Return every audited row (http_status NOT NULL) so the UI can
      // distinguish broken from working, not just the 4xx/5xx slice.
      // Pages that were never audited (http_status IS NULL) are excluded —
      // they'd swamp the list and aren't a finding either way.
      const rows = await db.execute(sql`
        SELECT id, url, title, content_type, http_status, last_audited_at
        FROM pages
        WHERE http_status IS NOT NULL
        ORDER BY
          CASE
            WHEN http_status = 0 OR http_status >= 500 THEN 0
            WHEN http_status >= 400 THEN 1
            WHEN http_status >= 300 THEN 2
            ELSE 3
          END,
          http_status DESC,
          id
        LIMIT ${limit}
      `);
      const breakdown = await db.execute(sql`
        SELECT
          count(*)::int                                                    AS audited,
          count(*) FILTER (WHERE http_status = 0)::int                     AS unreachable,
          count(*) FILTER (WHERE http_status BETWEEN 500 AND 599)::int     AS server_error,
          count(*) FILTER (WHERE http_status BETWEEN 400 AND 499)::int     AS client_error,
          count(*) FILTER (WHERE http_status BETWEEN 300 AND 399)::int     AS redirect,
          count(*) FILTER (WHERE http_status BETWEEN 200 AND 299)::int     AS ok
        FROM pages WHERE http_status IS NOT NULL
      `);
      const b = ((breakdown as any).rows ?? breakdown)[0] ?? {};
      return NextResponse.json({
        rows: (rows as any).rows ?? rows,
        audited: b.audited ?? 0,
        breakdown: {
          ok: b.ok ?? 0,
          redirect: b.redirect ?? 0,
          clientError: b.client_error ?? 0,
          serverError: b.server_error ?? 0,
          unreachable: b.unreachable ?? 0,
        },
      });
    }

    if (kind === "canonical") {
      // Pages whose <link rel="canonical"> points somewhere else (or is missing
      // entirely). Two flavours:
      //   - 'self-canonical missing' — no canonical at all.
      //   - 'cross-canonical' — canonical_url != page url. Both either valid
      //     redirect signals OR a CMS bug. SEO eyeballs which.
      const rows = await db.execute(sql`
        SELECT id, url, title, content_type, canonical_url,
               CASE
                 WHEN canonical_url IS NULL THEN 'missing'
                 WHEN canonical_url <> url  THEN 'cross-canonical'
                 ELSE 'self'
               END AS canonical_state
        FROM pages
        WHERE canonical_url IS NULL
           OR canonical_url <> url
        ORDER BY content_type, id
        LIMIT ${limit}
      `);
      return NextResponse.json({ rows: (rows as any).rows ?? rows });
    }

    if (kind === "images") {
      // Pages with images missing alt text (#41).
      const rows = await db.execute(sql`
        SELECT id, url, title, content_type, image_count, images_no_alt,
               CASE WHEN image_count > 0 THEN images_no_alt::float / image_count
                    ELSE 0 END AS pct_missing
        FROM pages
        WHERE images_no_alt IS NOT NULL AND images_no_alt > 0
        ORDER BY images_no_alt DESC, image_count DESC
        LIMIT ${limit}
      `);
      return NextResponse.json({ rows: (rows as any).rows ?? rows });
    }

    if (kind === "clusters") {
      // Topic-cluster health (#43). For each (course_type, category) bucket
      // in the catalog, count courses, blogs that match by category, and
      // subcategory rows. A cluster is 'thin' if it has many courses but
      // few blogs (no awareness content) — that's the actionable signal.
      const rows = await db.execute(sql`
        SELECT
          course_type,
          category,
          count(*) FILTER (WHERE content_type = 'course')      ::int AS courses,
          count(*) FILTER (WHERE content_type = 'blog')        ::int AS blogs,
          count(*) FILTER (WHERE content_type = 'subcategory') ::int AS subcategories,
          sum(coalesce(gsc_clicks_28d, 0))                     ::int AS clicks_28d,
          count(*) FILTER (WHERE is_stale = true)              ::int AS stale_pages
        FROM pages
        WHERE course_type IS NOT NULL AND category IS NOT NULL
        GROUP BY course_type, category
        HAVING count(*) > 0
        ORDER BY course_type, category
      `);
      return NextResponse.json({ rows: (rows as any).rows ?? rows });
    }

    if (kind === "stale") {
      // Stale-content snapshot (#28) — populated by gsc-snapshot cron.
      const rows = await db.execute(sql`
        SELECT id, url, title, content_type, lastmod,
               gsc_clicks_28d, gsc_impressions_28d, gsc_position_28d, stale_reason
        FROM pages
        WHERE is_stale = true
        ORDER BY gsc_clicks_28d ASC NULLS FIRST, lastmod ASC NULLS FIRST
        LIMIT ${limit}
      `);
      return NextResponse.json({ rows: (rows as any).rows ?? rows });
    }

    if (kind === "duplicates") {
      const titles = await db.execute(sql`
        SELECT title, count(*)::int AS n,
               array_agg(url ORDER BY id) AS urls
        FROM pages
        WHERE title IS NOT NULL AND length(title) > 10
        GROUP BY title HAVING count(*) > 1
        ORDER BY n DESC LIMIT ${limit}
      `);
      const h1s = await db.execute(sql`
        SELECT h1, count(*)::int AS n,
               array_agg(url ORDER BY id) AS urls
        FROM pages
        WHERE h1 IS NOT NULL AND length(h1) > 10
        GROUP BY h1 HAVING count(*) > 1
        ORDER BY n DESC LIMIT ${limit}
      `);
      return NextResponse.json({
        duplicateTitles: (titles as any).rows ?? titles,
        duplicateH1s: (h1s as any).rows ?? h1s,
      });
    }

    // health — composite per-page score
    const rows = await db.execute(sql`
      SELECT id, url, title, content_type, token_count, http_status,
             length(coalesce(title,'')) AS title_len,
             length(coalesce(meta_description,'')) AS meta_len,
             length(coalesce(content_text,'')) AS body_len,
             (embedding IS NOT NULL) AS embedded
      FROM pages
      ORDER BY id
      LIMIT ${limit}
    `);
    const data = (rows as any).rows ?? rows;
    const scored = data.map((r: any) => ({
      ...r,
      health: healthScore(r),
    }));
    scored.sort((a: any, b: any) => a.health - b.health);
    return NextResponse.json({ rows: scored });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function metaFlags(titleLen: number, metaLen: number, title: string | null, meta: string | null) {
  const f: string[] = [];
  if (!title) f.push("missing-title");
  else {
    if (titleLen < 25) f.push("title-too-short");
    if (titleLen > 65) f.push("title-too-long");
  }
  if (!meta) f.push("missing-meta");
  else {
    if (metaLen < 70) f.push("meta-too-short");
    if (metaLen > 160) f.push("meta-too-long");
  }
  return f;
}

function healthScore(r: any): number {
  let score = 100;
  if (!r.title) score -= 20;
  else if (r.title_len < 25 || r.title_len > 65) score -= 8;
  if (!r.meta_len) score -= 15;
  else if (r.meta_len < 70 || r.meta_len > 160) score -= 6;
  if (!r.embedded) score -= 10;
  if (r.body_len < 600) score -= 10;
  if (r.http_status && r.http_status >= 400) score -= 30;
  if (!r.token_count || r.token_count < 150) score -= 8;
  return Math.max(0, Math.min(100, score));
}
