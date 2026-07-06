import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rowsOf } from "@/lib/db/exec";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Columns exported — same shape the import route expects back. */
const COLUMNS = [
  "url",
  "title",
  "h1",
  "meta_description",
  "content_type",
  "course_type",
  "category",
  "subcategory",
  "tags",
  "lastmod",
] as const;

/**
 * GET /api/pages/export — stream the corpus (respecting the same filters as
 * /api/pages) as a CSV attachment. No pagination: exports every matching row.
 * Session-gated by the auth proxy like the rest of the dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim();
    const type = (params.get("type") ?? "").trim();
    const courseType = (params.get("courseType") ?? "").trim();
    const category = (params.get("category") ?? "").trim();
    const tag = (params.get("tag") ?? "").trim();
    const like = `%${q}%`;

    const res = await db.execute(sql`
      SELECT url, title, h1, meta_description, content_type, course_type,
             category, subcategory, tags, lastmod
      FROM pages
      WHERE (${q}          = '' OR title ILIKE ${like} OR url ILIKE ${like})
        AND (${type}       = '' OR content_type = ${type})
        AND (${courseType} = '' OR course_type = ${courseType})
        AND (${category}   = '' OR category    = ${category})
        AND (${tag}        = '' OR ${tag} = ANY(tags))
      ORDER BY id
    `);

    const rows = rowsOf<Record<string, unknown>>(res);
    const csv = toCsv(rows, COLUMNS as unknown as (keyof (typeof rows)[number] & string)[]);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="corpus-export.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
