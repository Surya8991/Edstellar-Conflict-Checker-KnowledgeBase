import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { classifyIntent } from "@/lib/intent";

/**
 * Precompute near-duplicate page pairs across the whole corpus and store them
 * in `catalog_conflicts` for the Catalog Conflicts dashboard.
 *
 * Session 11 rewrite — solidified:
 *   - **One query, not N.** A single pgvector top-k lateral join replaces the
 *     old per-page loop (2,400+ round-trips). Same result, ~1-2 s, and it can't
 *     half-finish and leave a torn table.
 *   - **Intent-aware pair typing.** Two pages that share *search intent* (not
 *     just `content_type`) and rank-compete are the real cannibalization risk,
 *     so the taxonomy now keys off `classifyIntent` as well as content_type.
 *   - **All current content types included** (managed-training / platform /
 *     consulting / templates were added after the previous run). Only `static`
 *     is excluded, per the original false-positive policy (CTA-copy pairs).
 *
 * Noise filters kept from the original:
 *   1. `static` pages excluded on BOTH sides ("Enquire Now" ↔ "Get a Free Demo").
 *   2. Template-noise: sim ≥ 0.97 where either page has < min-body chars.
 *   3. Redirected/canonicalized-away pages excluded on BOTH sides — a page
 *      scripts/detect-redirects.ts marked `is_stale` must never appear as its
 *      own row (matches the `LIVE` predicate in app/api/groups/route.ts).
 *
 * Known follow-up: pairType() below predates the Session 11 multi-signal
 * evidence rule in lib/cluster.ts (evaluatePair) — it uses raw content_type +
 * intent only, not the type-aware body floors or lexical corroboration. If
 * this page is un-hidden, port it to evaluatePair so the two dashboards agree.
 *
 * Pair-type taxonomy:
 *   - 'duplicate'         sim ≥ 0.95, same content_type
 *   - 'cannibalization'   sim ≥ 0.85, same *intent* (the dangerous one)
 *   - 'category-bleed'    category ↔ course/blog
 *   - 'subcategory-bleed' subcategory ↔ course/blog
 *   - 'overlap'           everything else above threshold
 *
 * Flags: --threshold=0.85  --min-body=1500  --topk=5
 */

const EXCLUDED_CONTENT_TYPES = new Set(["static"]);
const MIN_BODY_FOR_HIGH_SIM = 1500; // chars

interface PairRow {
  a_id: number; a_url: string; a_title: string | null; a_type: string | null; a_body: number;
  b_id: number; b_url: string; b_title: string | null; b_type: string | null; b_body: number;
  sim: number;
}

function pairType(
  sim: number,
  a: { type: string | null; url: string; title: string | null },
  b: { type: string | null; url: string; title: string | null },
): string {
  const sameType = a.type && a.type === b.type;
  const sameIntent =
    classifyIntent({ title: a.title, slug: a.url, contentType: a.type }).label ===
    classifyIntent({ title: b.title, slug: b.url, contentType: b.type }).label;

  if (sameType && sim >= 0.95) return "duplicate";
  if (sameIntent && sim >= 0.85) return "cannibalization";
  if (a.type === "category" || b.type === "category") return "category-bleed";
  if (a.type === "subcategory" || b.type === "subcategory") return "subcategory-bleed";
  return "overlap";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  let threshold = 0.85;
  let minBody = MIN_BODY_FOR_HIGH_SIM;
  let topk = 5;
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    if (k === "threshold") threshold = Number(v);
    if (k === "min-body") minBody = Number(v);
    if (k === "topk") topk = Number(v);
  }

  console.log(`Scanning corpus · threshold=${threshold} · topk=${topk} · min-body=${minBody}`);

  // One query: for every page, probe its top-k nearest neighbours via the HNSW
  // index and keep those that clear the threshold. Both sides' metadata + body
  // length come back in the same row.
  // Live pages only on both sides — a redirected/canonicalized-away page
  // (scripts/detect-redirects.ts) must never form a conflict pair.
  const LIVE = (alias: string) =>
    `COALESCE(${alias}.is_stale, false) = false
     AND (${alias}.canonical_url IS NULL
          OR rtrim(${alias}.canonical_url, '/') = rtrim(${alias}.url, '/'))`;

  const rows = (await sql.query(
    `SELECT p1.id a_id, p1.url a_url, p1.title a_title, p1.content_type a_type,
            length(coalesce(p1.content_text,'')) a_body,
            p2.id b_id, p2.url b_url, p2.title b_title, p2.content_type b_type,
            length(coalesce(p2.content_text,'')) b_body,
            1 - (p1.embedding <=> p2.embedding) sim
     FROM pages p1
     CROSS JOIN LATERAL (
       SELECT id, url, title, content_type, content_text, embedding, is_stale, canonical_url
       FROM pages p2
       WHERE p2.embedding IS NOT NULL AND p2.id <> p1.id AND ${LIVE("p2")}
       ORDER BY p1.embedding <=> p2.embedding
       LIMIT $2
     ) p2
     WHERE p1.embedding IS NOT NULL
       AND ${LIVE("p1")}
       AND 1 - (p1.embedding <=> p2.embedding) >= $1`,
    [threshold, topk],
  )) as PairRow[];

  let found = 0, skippedStatic = 0, skippedTemplateNoise = 0;
  const seen = new Set<string>();
  const inserts: PairRow[] = [];

  for (const r of rows) {
    // Filter 1: static on either side.
    if (EXCLUDED_CONTENT_TYPES.has(r.a_type ?? "") || EXCLUDED_CONTENT_TYPES.has(r.b_type ?? "")) {
      skippedStatic++;
      continue;
    }
    // Dedupe A↔B / B↔A.
    const lo = Math.min(r.a_id, r.b_id);
    const hi = Math.max(r.a_id, r.b_id);
    const key = `${lo}-${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Filter 2: template-noise high-similarity pairs.
    if (r.sim >= 0.97 && (r.a_body < minBody || r.b_body < minBody)) {
      skippedTemplateNoise++;
      continue;
    }
    inserts.push(r);
  }

  // Bulk replace as ONE statement — a `WITH del AS (DELETE ...)` CTE runs the
  // delete and the insert in the same query, so it's atomic even though
  // neon's HTTP driver is stateless (each separate sql.query() call is its
  // own auto-committed request — a DELETE followed by a failing INSERT would
  // otherwise leave catalog_conflicts empty).
  if (inserts.length) {
    const pts = inserts.map((r) =>
      pairType(
        r.sim,
        { type: r.a_type, url: r.a_url, title: r.a_title },
        { type: r.b_type, url: r.b_url, title: r.b_title },
      ),
    );
    await sql.query(
      `WITH del AS (DELETE FROM catalog_conflicts)
       INSERT INTO catalog_conflicts
         (a_id, a_url, a_title, a_type, b_id, b_url, b_title, b_type, similarity, pair_type)
       SELECT * FROM unnest(
         $1::int[], $2::text[], $3::text[], $4::text[], $5::int[],
         $6::text[], $7::text[], $8::text[], $9::real[], $10::text[]
       )`,
      [
        inserts.map((r) => r.a_id), inserts.map((r) => r.a_url), inserts.map((r) => r.a_title),
        inserts.map((r) => r.a_type), inserts.map((r) => r.b_id), inserts.map((r) => r.b_url),
        inserts.map((r) => r.b_title), inserts.map((r) => r.b_type), inserts.map((r) => r.sim), pts,
      ],
    );
    found = inserts.length;
  } else {
    // No qualifying pairs — still clear the table so a shrinking corpus
    // doesn't leave last run's rows behind.
    await sql.query("DELETE FROM catalog_conflicts");
  }

  console.log(`\n✓ Stored ${found} conflicting pairs.`);
  console.log(`  Skipped (static): ${skippedStatic}`);
  console.log(`  Skipped (template-noise high-sim): ${skippedTemplateNoise}`);

  const breakdown = (await sql.query(
    "SELECT pair_type, count(*)::int AS n FROM catalog_conflicts GROUP BY pair_type ORDER BY n DESC",
  )) as { pair_type: string; n: number }[];
  console.log("\nBy pair_type:");
  breakdown.forEach((r) => console.log(`  ${r.pair_type.padEnd(22)} ${r.n}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
