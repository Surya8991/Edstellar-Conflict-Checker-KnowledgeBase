import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { refreshHttpStatus } from "@/lib/http-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly cron - HEAD-check the whole corpus, write pages.http_status.
 *
 * The probe + batched-write logic lives in `lib/http-status.refreshHttpStatus`
 * (shared with the daily gsc-snapshot Job 6 bounded refresh). HEAD requests run
 * at concurrency 10; writes batch into UNNEST UPDATEs of 200.
 *
 * #10 - fail the cron (500) when 'broken' (status=0 OR >=400) is more than 30%
 * of the rows checked, so a sudden spike is visible on the Vercel cron dashboard.
 */
export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;
  const { checked, broken, brokenRate } = await refreshHttpStatus({ limit: 1500 });
  const status = brokenRate > 0.3 ? 500 : 200;
  return NextResponse.json({ checked, broken, brokenRate }, { status });
}
