/**
 * Add the brand term "edstellar" to the exclude KEYWORD list (query-type
 * exclusion) so branded queries - "edstellar" as a prefix, suffix, or anywhere -
 * drop out of both Keyword Cannibalization (`isExcludedQuery`) and the Content
 * Clusters top-queries panel. Substring match (see `isExcludedQuery`), so
 * "edstellar reviews", "training edstellar", etc. are all caught.
 *
 * Idempotent: does nothing if a query-type exclusion already covers "edstellar".
 * Manageable/removable afterwards from /settings like any other exclusion.
 *
 * Run: npx tsx scripts/seed-brand-exclusion.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const NAME = "Brand: edstellar (branded queries)";
const TERM = "edstellar";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const sql = neon(process.env.DATABASE_URL);

  const existing = (await sql.query(
    `SELECT id, name, patterns FROM excluded_series
      WHERE type = 'query' AND EXISTS (
        SELECT 1 FROM unnest(patterns) p WHERE lower(p) = $1
      )
      LIMIT 1`,
    [TERM],
  )) as { id: number; name: string; patterns: string[] }[];

  if (existing.length > 0) {
    console.log(`Already present: query exclusion #${existing[0].id} "${existing[0].name}" covers "${TERM}". No change.`);
    return;
  }

  const rows = (await sql.query(
    `INSERT INTO excluded_series (name, patterns, type)
     VALUES ($1, $2::text[], 'query')
     RETURNING id, name, patterns, type, enabled`,
    [NAME, [TERM]],
  )) as { id: number; name: string }[];

  console.log(`Added query exclusion #${rows[0].id} "${rows[0].name}" → patterns [${TERM}].`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
