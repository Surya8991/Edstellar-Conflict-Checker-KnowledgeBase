import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getExclusions } from "@/lib/exclusions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The actual corpus URLs currently matched by the enabled URL-type exclusion
 * patterns, paginated - so the Settings page can show exactly what's excluded.
 *
 * Each row also carries WHY it's excluded (the owning `excluded_series.name`)
 * and WHEN (that row's `updated_at`) - joins through `excluded_series`
 * directly instead of the flattened pattern list from `lib/exclusions`, since
 * that's the only way to attribute a match back to a specific row. A URL
 * matching 2+ enabled rows picks the most-recently-updated one (both for the
 * displayed reason and for the default latest-first sort) - `DISTINCT ON`
 * per URL, ordered by `updated_at DESC`.
 *
 * Note for the Link Audit auto-row specifically: its patterns are fully
 * REPLACED on every daily run (self-healing, §21), so `updated_at` reads as
 * "last confirmed still excluded", not strictly "first excluded" - the two
 * only diverge if a URL keeps failing the same probe across multiple days.
 */
export async function GET(request: NextRequest) {
  try {
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 25));
    const { url: patterns, exception: exceptions } = await getExclusions();
    if (patterns.length === 0) {
      return NextResponse.json({ urls: [], total: 0, page, pageSize, exceptions });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const matchedCte = `
      matched AS (
        SELECT p.url, p.title, p.content_type, es.name AS reason, es.updated_at AS excluded_at
          FROM pages p
          JOIN excluded_series es
            ON es.type = 'url' AND es.enabled = true
           AND EXISTS (SELECT 1 FROM unnest(es.patterns) pat WHERE lower(p.url) LIKE '%' || pat || '%')
         WHERE NOT EXISTS (SELECT 1 FROM unnest($1::text[]) al(u) WHERE lower(p.url) LIKE '%' || al.u || '%')
      ),
      best AS (
        SELECT DISTINCT ON (url) url, title, content_type, reason, excluded_at
          FROM matched
         ORDER BY url, excluded_at DESC
      )
    `;

    const countRows = (await sql.query(
      `WITH ${matchedCte} SELECT count(*)::int n FROM best`,
      [exceptions],
    )) as { n: number }[];
    const total = countRows[0]?.n ?? 0;

    const rows = (await sql.query(
      `WITH ${matchedCte}
       SELECT url, title, content_type, reason, excluded_at
         FROM best
        ORDER BY excluded_at DESC NULLS LAST, url
        LIMIT $2 OFFSET $3`,
      [exceptions, pageSize, (page - 1) * pageSize],
    )) as {
      url: string;
      title: string | null;
      content_type: string | null;
      reason: string;
      excluded_at: string | null;
    }[];

    return NextResponse.json({ urls: rows, total, page, pageSize, exceptions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, urls: [], total: 0 }, { status: 500 });
  }
}
