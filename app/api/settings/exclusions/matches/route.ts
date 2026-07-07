import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getExclusions } from "@/lib/exclusions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The actual corpus URLs currently matched by the enabled URL-type exclusion
 * patterns, paginated - so the Settings page can show exactly what's excluded.
 */
export async function GET(request: NextRequest) {
  try {
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 25));
    const { url: patterns } = await getExclusions();
    if (patterns.length === 0) return NextResponse.json({ urls: [], total: 0, page, pageSize });

    const sql = neon(process.env.DATABASE_URL!);
    const where = `EXISTS (SELECT 1 FROM unnest($1::text[]) ex(pat) WHERE lower(pages.url) LIKE '%' || ex.pat || '%')`;
    const countRows = (await sql.query(
      `SELECT count(*)::int n FROM pages WHERE ${where}`,
      [patterns],
    )) as { n: number }[];
    const total = countRows[0]?.n ?? 0;
    const rows = (await sql.query(
      `SELECT url, title, content_type FROM pages WHERE ${where} ORDER BY url LIMIT $2 OFFSET $3`,
      [patterns, pageSize, (page - 1) * pageSize],
    )) as { url: string; title: string | null; content_type: string | null }[];

    return NextResponse.json({ urls: rows, total, page, pageSize });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, urls: [], total: 0 }, { status: 500 });
  }
}
