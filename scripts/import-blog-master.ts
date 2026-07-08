import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";
import { getEmbedder } from "@/lib/ai";
import { toVectorLiteral } from "@/lib/search";
import { estimateTokens, normalizeWhitespace, classifyUrl } from "@/lib/extract";
import { tagUrl } from "@/lib/taxonomy";
import { createHash } from "node:crypto";

/**
 * Import the Blog Master Data export (§33) into the corpus for a set of blogs.
 *
 * Unlike the crawler, the source here is the CMS body HTML - no nav/footer/
 * related-post noise, no root-guessing, and NOT truncated at 12k. For each blog
 * we:
 *   - overwrite content_text with the clean body + re-embed the FULL body,
 *   - populate meta_title, headings, internal/outbound links, word/table counts,
 *     content_hash,
 *   - split by H2 and store one section-level embedding per chunk in page_chunks.
 *
 * Idempotent: upsert by url (pages) and (url, chunk_index) (page_chunks); old
 * chunks for a url are deleted before re-insert so a shrink can't leave orphans.
 *
 * Reads scripts/data/blog-master-seed.json (committed) so there is no xlsx
 * dependency and no machine-specific absolute path. Regenerate that file from
 * the workbook when the blog set changes.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedBlog {
  name: string | null;
  url: string;
  metaTitle: string | null;
  contentHtml: string;
}

interface DerivedSignals {
  bodyText: string;
  h1: string | null;
  metaDescription: string | null;
  headings: { h2: string[]; h3: string[] };
  internalLinks: string[];
  outboundLinks: string[];
  wordCount: number;
  tableCount: number;
  imageCount: number;
  imagesNoAlt: number;
  contentHash: string;
  sections: { heading: string | null; text: string }[];
}

const EDSTELLAR_HOST = "edstellar.com";

/** Parse the CMS body HTML into the signals we persist. */
function deriveSignals(html: string): DerivedSignals {
  const $ = cheerio.load(html);
  const txt = (el: cheerio.Cheerio<any>) => normalizeWhitespace(el.text());

  const h1 = txt($("h1").first()) || null;
  const metaDescription =
    $("meta[name='description']").attr("content")?.trim() || null;

  const h2: string[] = [];
  const h3: string[] = [];
  $("h2").each((_, el) => {
    const t = normalizeWhitespace($(el).text());
    if (t) h2.push(t);
  });
  $("h3").each((_, el) => {
    const t = normalizeWhitespace($(el).text());
    if (t) h3.push(t);
  });

  const internal = new Set<string>();
  const outbound = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
    if (href.startsWith("/") || href.includes(EDSTELLAR_HOST)) internal.add(href);
    else if (/^https?:\/\//i.test(href)) outbound.add(href);
  });

  let imageCount = 0;
  let imagesNoAlt = 0;
  $("img").each((_, el) => {
    imageCount++;
    const alt = $(el).attr("alt");
    if (!alt || !alt.trim()) imagesNoAlt++;
  });
  const tableCount = $("table").length;

  const bodyText = normalizeWhitespace($.root().text());
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const contentHash = createHash("sha256").update(bodyText).digest("hex");

  // Section split: everything from one H2 up to the next H2 is one chunk.
  const sections = splitByH2($);

  return {
    bodyText,
    h1,
    metaDescription,
    headings: { h2, h3 },
    internalLinks: [...internal],
    outboundLinks: [...outbound],
    wordCount,
    tableCount,
    imageCount,
    imagesNoAlt,
    contentHash,
    sections,
  };
}

/**
 * Split the body into one section per H2. H2s in this CMS export are top-level
 * siblings of the surrounding <p>/<div> blocks, so we section by sibling range:
 * everything before the first H2 is an intro chunk; each H2 owns its following
 * siblings up to the next H2. Falls back to a single whole-body chunk when there
 * are no H2s.
 */
function splitByH2($: cheerio.CheerioAPI): { heading: string | null; text: string }[] {
  const out: { heading: string | null; text: string }[] = [];
  const h2s = $("h2").toArray();

  if (h2s.length === 0) {
    const text = normalizeWhitespace($.root().text());
    return text ? [{ heading: null, text }] : [];
  }

  // Intro: siblings before the first H2 (prevAll is reverse document order).
  const introParts: string[] = [];
  $(h2s[0])
    .prevAll()
    .each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t) introParts.unshift(t);
    });
  const intro = normalizeWhitespace(introParts.join(" "));
  if (intro) out.push({ heading: null, text: intro });

  for (const h2 of h2s) {
    const heading = normalizeWhitespace($(h2).text());
    const bodyParts: string[] = [];
    $(h2)
      .nextUntil("h2")
      .each((_, el) => {
        const t = normalizeWhitespace($(el).text());
        if (t) bodyParts.push(t);
      });
    const text = normalizeWhitespace([heading, ...bodyParts].join(" "));
    if (text) out.push({ heading, text });
  }
  return out;
}

async function main() {
  const dry = process.argv.includes("--dry");

  const seedPath = join(__dirname, "data", "blog-master-seed.json");
  const blogs: SeedBlog[] = JSON.parse(readFileSync(seedPath, "utf8"));

  // Dry run: derive + print signals only. No DB, no embedder (no model download).
  if (dry) {
    for (const blog of blogs) {
      const d = deriveSignals(blog.contentHtml);
      console.log(`\n${blog.url}`);
      console.log(`  title=${(blog.name || d.h1)?.slice(0, 60)}`);
      console.log(`  metaTitle=${blog.metaTitle}`);
      console.log(
        `  words=${d.wordCount} h2=${d.headings.h2.length} h3=${d.headings.h3.length} ` +
          `internal=${d.internalLinks.length} outbound=${d.outboundLinks.length} tables=${d.tableCount} imgs=${d.imageCount} chunks=${d.sections.length}`,
      );
      console.log(`  hash=${d.contentHash.slice(0, 16)}…`);
      console.log(
        `  sections: ${d.sections.map((s) => (s.heading ? s.heading.slice(0, 32) : "(intro)")).join(" | ")}`,
      );
    }
    console.log("\n(dry run - nothing written)");
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");
  const sql = neon(dbUrl);
  const embedder = getEmbedder();
  console.log(`Importing ${blogs.length} blog(s) · embedder=${embedder.name}`);

  for (const blog of blogs) {
    const d = deriveSignals(blog.contentHtml);
    const title = blog.name || d.h1;
    const tagged = tagUrl(blog.url, title);
    const contentType = tagged.contentType || classifyUrl(blog.url);

    // Full-body embedding (untruncated) - the point of the CMS import.
    const [pageEmb] = await embedder.embed([
      [title, blog.metaTitle, d.h1, d.bodyText].filter(Boolean).join("\n"),
    ]);
    const pageVec = toVectorLiteral(pageEmb);

    const rows = (await sql.query(
      `INSERT INTO pages
         (url, title, meta_title, meta_description, h1, content_text,
          content_type, course_type, category, subcategory, tags,
          embedding, token_count, crawled_at,
          image_count, images_no_alt,
          headings, internal_links, outbound_links,
          word_count, table_count, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10,$11,
               $12::vector,$13, now(), $14,$15,
               $16::jsonb,$17,$18, $19,$20,$21)
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         meta_title = EXCLUDED.meta_title,
         meta_description = COALESCE(EXCLUDED.meta_description, pages.meta_description),
         h1 = EXCLUDED.h1,
         content_text = EXCLUDED.content_text,
         content_type = EXCLUDED.content_type,
         course_type = EXCLUDED.course_type,
         category = EXCLUDED.category,
         subcategory = EXCLUDED.subcategory,
         tags = EXCLUDED.tags,
         embedding = EXCLUDED.embedding,
         token_count = EXCLUDED.token_count,
         crawled_at = now(),
         image_count = EXCLUDED.image_count,
         images_no_alt = EXCLUDED.images_no_alt,
         headings = EXCLUDED.headings,
         internal_links = EXCLUDED.internal_links,
         outbound_links = EXCLUDED.outbound_links,
         word_count = EXCLUDED.word_count,
         table_count = EXCLUDED.table_count,
         content_hash = EXCLUDED.content_hash,
         is_stale = false,
         stale_reason = NULL
       RETURNING id`,
      [
        blog.url,
        title,
        blog.metaTitle,
        d.metaDescription,
        d.h1,
        d.bodyText,
        contentType,
        tagged.courseType,
        tagged.category,
        tagged.subcategory,
        tagged.tags,
        pageVec,
        estimateTokens(d.bodyText),
        d.imageCount,
        d.imagesNoAlt,
        JSON.stringify(d.headings),
        d.internalLinks,
        d.outboundLinks,
        d.wordCount,
        d.tableCount,
        d.contentHash,
      ],
    )) as any[];
    const pageId = rows[0].id as number;

    // Section chunks: replace-then-insert so a shrink leaves no orphans.
    await sql.query("DELETE FROM page_chunks WHERE url = $1", [blog.url]);
    const chunkEmbs = await embedder.embed(
      d.sections.map((s) => [s.heading, s.text].filter(Boolean).join("\n")),
    );
    for (let i = 0; i < d.sections.length; i++) {
      const s = d.sections[i];
      await sql.query(
        `INSERT INTO page_chunks
           (page_id, url, heading, chunk_index, chunk_text, embedding, token_count)
         VALUES ($1,$2,$3,$4,$5,$6::vector,$7)`,
        [
          pageId,
          blog.url,
          s.heading,
          i,
          s.text,
          toVectorLiteral(chunkEmbs[i]),
          estimateTokens(s.text),
        ],
      );
    }

    console.log(
      `  ✓ ${blog.url}\n      pageId=${pageId} words=${d.wordCount} h2=${d.headings.h2.length} h3=${d.headings.h3.length} ` +
        `internal=${d.internalLinks.length} outbound=${d.outboundLinks.length} tables=${d.tableCount} imgs=${d.imageCount} chunks=${d.sections.length}`,
    );
  }

  console.log("\n✓ Blog Master import complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
