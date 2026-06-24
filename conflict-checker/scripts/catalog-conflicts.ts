import "dotenv/config";
import { neon } from "@neondatabase/serverless";

/**
 * Precompute near-duplicate page pairs across the whole corpus. For each page,
 * find its nearest neighbor by cosine similarity (pgvector) and store pairs
 * above a threshold. De-duplicates A↔B / B↔A by keeping a_id < b_id.
 *
 * Flags: --threshold=0.85  --limit=N (cap pages scanned)
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  let threshold = 0.85;
  let limit: number | null = null;
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    if (k === "threshold") threshold = Number(v);
    if (k === "limit") limit = Number(v);
  }

  await sql.query("DELETE FROM catalog_conflicts");

  const pages = (await sql.query(
    `SELECT id FROM pages WHERE embedding IS NOT NULL ORDER BY id ${limit ? `LIMIT ${limit}` : ""}`,
  )) as any[];
  console.log(`Scanning ${pages.length} pages · threshold=${threshold}`);

  let found = 0;
  const seen = new Set<string>();

  for (const { id } of pages) {
    // Top 3 neighbors for this page (k-NN via the HNSW index).
    const neighbors = (await sql.query(
      `SELECT p2.id, p2.url, p2.title, p2.content_type,
              1 - (p1.embedding <=> p2.embedding) AS similarity,
              p1.url AS a_url, p1.title AS a_title, p1.content_type AS a_type
       FROM pages p1
       JOIN pages p2 ON p2.id <> p1.id AND p2.embedding IS NOT NULL
       WHERE p1.id = $1
       ORDER BY p1.embedding <=> p2.embedding
       LIMIT 3`,
      [id],
    )) as any[];

    for (const n of neighbors) {
      if (Number(n.similarity) < threshold) continue;
      const a = Math.min(id, n.id);
      const b = Math.max(id, n.id);
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pairType =
        n.similarity >= 0.95
          ? "duplicate"
          : n.content_type !== n.a_type
            ? `${n.a_type}↔${n.content_type}`
            : "overlap";

      await sql.query(
        `INSERT INTO catalog_conflicts
           (a_id, a_url, a_title, a_type, b_id, b_url, b_title, b_type, similarity, pair_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          n.a_url,
          n.a_title,
          n.a_type,
          n.id,
          n.url,
          n.title,
          n.content_type,
          n.similarity,
          pairType,
        ],
      );
      found++;
    }
    if ((found && found % 50 === 0) || false) console.log(`  ${found} pairs…`);
  }

  console.log(`\n✓ Stored ${found} conflicting pairs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
