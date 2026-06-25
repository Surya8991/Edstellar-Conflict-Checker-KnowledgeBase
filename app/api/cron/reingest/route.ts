/**
 * Weekly cron — only re-fetch URLs whose sitemap lastmod changed since the
 * last crawl. Intended for Vercel Cron (see vercel.json). Quick wrapper that
 * delegates to scripts/ingest.ts logic by running it inline.
 *
 * Vercel sends a "Authorization: Bearer <CRON_SECRET>" header when CRON_SECRET
 * is set; reject if it doesn't match.
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { readSitemapCsv } from "@/lib/sitemap";
import { fetchAndExtract, estimateTokens } from "@/lib/extract";
import { tagUrl } from "@/lib/taxonomy";
import { getEmbedder } from "@/lib/ai";
import { toVectorLiteral } from "@/lib/search";
import { requireCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;
  const sql = neon(process.env.DATABASE_URL!);
  const embedder = getEmbedder();
  const entries = readSitemapCsv();
  let done = 0, skipped = 0, failed = 0;
  for (const e of entries) {
    try {
      const existing = (await sql.query(
        "SELECT lastmod FROM pages WHERE url = $1", [e.url],
      )) as any[];
      if (existing[0]?.lastmod && e.lastmod && existing[0].lastmod === e.lastmod) {
        skipped++; continue;
      }
      const page = await fetchAndExtract(e.url);
      const text = [page.title, page.h1, page.contentText].filter(Boolean).join("\n").slice(0, 12000);
      if (!text.trim()) { failed++; continue }
      const [emb] = await embedder.embed([text]);
      const t = tagUrl(e.url, page.title);
      await sql.query(
        `INSERT INTO pages (url, title, meta_description, h1, content_text,
            content_type, course_type, category, subcategory, tags,
            lastmod, embedding, token_count, crawled_at,
            canonical_url, image_count, images_no_alt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13, now(), $14,$15,$16)
         ON CONFLICT (url) DO UPDATE SET
           title=EXCLUDED.title, meta_description=EXCLUDED.meta_description, h1=EXCLUDED.h1,
           content_text=EXCLUDED.content_text, content_type=EXCLUDED.content_type,
           course_type=EXCLUDED.course_type, category=EXCLUDED.category, subcategory=EXCLUDED.subcategory,
           tags=EXCLUDED.tags, lastmod=EXCLUDED.lastmod, embedding=EXCLUDED.embedding,
           token_count=EXCLUDED.token_count, crawled_at=now(),
           canonical_url=EXCLUDED.canonical_url, image_count=EXCLUDED.image_count, images_no_alt=EXCLUDED.images_no_alt`,
        [e.url, page.title, page.metaDescription, page.h1, page.contentText.slice(0, 20000),
         t.contentType, t.courseType, t.category, t.subcategory, t.tags,
         e.lastmod, toVectorLiteral(emb), estimateTokens(page.contentText),
         page.canonicalUrl, page.imageCount, page.imagesNoAlt],
      );
      done++;
    } catch { failed++ }
  }
  // #10 — return 5xx if too many rows failed so Vercel's cron dashboard
  // shows the job as failed and the team sees it. Threshold: more than 25%
  // of attempted (done+failed) rows. 'skipped' isn't a failure.
  const attempted = done + failed;
  const failureRate = attempted > 0 ? failed / attempted : 0;
  const status = failureRate > 0.25 ? 500 : 200;
  return NextResponse.json({ done, skipped, failed, failureRate: Number(failureRate.toFixed(3)) }, { status });
}
