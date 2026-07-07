import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isJunkUrl } from "@/lib/sitemap";
import { fetchSitemapUrls } from "@/lib/sitemap-live";
import { tagUrl } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HOST = process.env.GSC_SITE_URL || "https://www.edstellar.com";

/** URLs in the live sitemap that aren't in `pages` yet (junk filtered). */
async function missingUrls(): Promise<{ missing: string[]; liveCount: number; corpusCount: number }> {
  const live = (await fetchSitemapUrls(HOST)).filter((u) => !isJunkUrl(u));
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(`SELECT url FROM pages`)) as { url: string }[];
  const have = new Set(rows.map((r) => r.url));
  const missing = live.filter((u) => !have.has(u));
  return { missing, liveCount: live.length, corpusCount: rows.length };
}

/** GET → how many sitemap pages are missing from the DB (a preview, no writes). */
export async function GET() {
  try {
    const { missing, liveCount, corpusCount } = await missingUrls();
    const byType: Record<string, number> = {};
    for (const u of missing) {
      const t = tagUrl(u).contentType;
      byType[t] = (byType[t] ?? 0) + 1;
    }
    return NextResponse.json({
      missingCount: missing.length,
      liveCount,
      corpusCount,
      byType,
      sample: missing.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, missingCount: 0 }, { status: 500 });
  }
}

/** POST → insert the missing sitemap URLs into `pages` with their derived type. */
export async function POST() {
  try {
    const { missing } = await missingUrls();
    if (missing.length === 0) return NextResponse.json({ added: 0, byType: {} });

    const urls: string[] = [];
    const types: string[] = [];
    const courseTypes: (string | null)[] = [];
    const categories: (string | null)[] = [];
    const subcats: (string | null)[] = [];
    const byType: Record<string, number> = {};
    for (const u of missing) {
      const t = tagUrl(u);
      urls.push(u);
      types.push(t.contentType);
      courseTypes.push(t.courseType);
      categories.push(t.category);
      subcats.push(t.subcategory);
      byType[t.contentType] = (byType[t.contentType] ?? 0) + 1;
    }

    const sql = neon(process.env.DATABASE_URL!);
    // Type info only - no content/embedding, so they show in the Edstellar
    // Database but stay out of Clusters/Checker until the next `npm run ingest`.
    const inserted = (await sql.query(
      `INSERT INTO pages (url, content_type, course_type, category, subcategory)
       SELECT u, ct, crt, cat, sub
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(u, ct, crt, cat, sub)
       ON CONFLICT (url) DO NOTHING
       RETURNING url`,
      [urls, types, courseTypes, categories, subcats],
    )) as { url: string }[];

    return NextResponse.json({ added: inserted.length, byType });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
