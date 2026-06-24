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
      const rows = await db.execute(sql`
        SELECT id, url, title, content_type, http_status, last_audited_at
        FROM pages
        WHERE http_status IS NOT NULL AND http_status >= 400
        ORDER BY http_status DESC, id
        LIMIT ${limit}
      `);
      const audited = await db.execute(sql`
        SELECT count(*)::int AS n FROM pages WHERE http_status IS NOT NULL
      `);
      return NextResponse.json({
        rows: (rows as any).rows ?? rows,
        audited: ((audited as any).rows ?? audited)[0]?.n ?? 0,
      });
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
