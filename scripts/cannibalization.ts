/**
 * Manual refresh of the keyword_conflicts table (PROJECTLOG §18).
 * Run: npm run cannibalization
 * Needs GSC_SITE_URL + a connected gsc_connections row (same as npm run gsc-metrics).
 */
import "dotenv/config";
import { snapshotKeywordConflicts } from "@/lib/cannibalization-snapshot";

async function main() {
  const t0 = Date.now();
  const { groups, rowsScanned } = await snapshotKeywordConflicts();
  console.log(
    `keyword_conflicts refreshed: ${groups} conflict group(s) from ${rowsScanned} query×page rows (${(
      (Date.now() - t0) /
      1000
    ).toFixed(1)}s)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
