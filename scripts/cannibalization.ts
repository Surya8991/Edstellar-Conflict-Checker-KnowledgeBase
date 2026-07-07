/**
 * Manual refresh of the keyword_conflicts table (PROJECTLOG §18).
 * Run: npm run cannibalization
 * Needs GSC_SITE_URL + a connected gsc_connections row (same as npm run gsc-metrics).
 */
import "dotenv/config";
import { snapshotKeywordConflicts } from "@/lib/cannibalization-snapshot";

async function main() {
  const t0 = Date.now();
  const { groups, rowsScanned, distinctQueries, capHit } = await snapshotKeywordConflicts();
  console.log(
    `keyword_conflicts refreshed: ${groups} conflict group(s) from ${rowsScanned} query×page rows ` +
      `covering ${distinctQueries} distinct keywords (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (capHit) {
    console.warn(
      "WARNING: hit the MAX_ROWS safety bound - some keywords may still be uncovered. Raise MAX_ROWS.",
    );
  } else {
    console.log("All keywords in the window were pulled (loop reached the last page).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
