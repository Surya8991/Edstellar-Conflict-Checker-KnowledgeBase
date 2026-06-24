import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim();
    const type = (params.get("type") ?? "").trim();
    const tag = (params.get("tag") ?? "").trim();
    const limit = Math.min(Number(params.get("limit")) || 50, 200);
    const offset = Number(params.get("offset")) || 0;

    const like = `%${q}%`;
    const rows = await db.execute(sql`
      SELECT id, url, title, content_type, course_type, category, subcategory,
             tags, lastmod, token_count, (embedding IS NOT NULL) AS embedded
      FROM pages
      WHERE (${q}    = '' OR title ILIKE ${like} OR url ILIKE ${like})
        AND (${type} = '' OR content_type = ${type})
        AND (${tag}  = '' OR ${tag} = ANY(tags))
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRows = await db.execute(sql`
      SELECT count(*)::int AS total FROM pages
      WHERE (${q}    = '' OR title ILIKE ${like} OR url ILIKE ${like})
        AND (${type} = '' OR content_type = ${type})
        AND (${tag}  = '' OR ${tag} = ANY(tags))
    `);

    const byType = await db.execute(sql`
      SELECT content_type, count(*)::int AS n
      FROM pages
      GROUP BY content_type
      ORDER BY n DESC
    `);

    const data = (rows as any).rows ?? rows;
    const total = ((totalRows as any).rows ?? totalRows)[0]?.total ?? 0;
    const byTypeArr = ((byType as any).rows ?? byType) as { content_type: string; n: number }[];
    return NextResponse.json({ total, rows: data, byType: byTypeArr });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, rows: [], total: 0, byType: [] },
      { status: 500 },
    );
  }
}
