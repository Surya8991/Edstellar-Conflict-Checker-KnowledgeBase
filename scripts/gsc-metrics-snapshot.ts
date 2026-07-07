/**
 * Manually populate gsc_metrics with per-page 1m/3m/6m totals + top-5 queries
 * (the Content Clusters GSC panel, PROJECTLOG §17O). The daily gsc-snapshot cron
 * runs this automatically; use this to refresh on demand.
 *
 *   npm run gsc-metrics
 *
 * Reads live from Google Search Console (needs a connected gsc_connections row +
 * GOOGLE_CLIENT_ID/SECRET in env) and writes to gsc_metrics.
 */
import "dotenv/config";
import { snapshotGscMetrics } from "@/lib/gsc-metrics";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  console.log("Fetching GSC page totals (1m/3m/6m) + top queries…");
  const { pageRows, queryRows } = await snapshotGscMetrics();
  console.log(`\n✓ gsc_metrics populated: ${pageRows} page-total rows, ${queryRows} query rows.`);
}

main().catch((e) => {
  console.error("gsc-metrics snapshot failed:", e.message);
  process.exit(1);
});
