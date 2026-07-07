import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { auditLinksAndExclude } from "@/lib/link-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily cron (called by a GitHub Actions workflow, not vercel.json - see
 * .github/workflows/link-audit.yml - so this doesn't count against Vercel's
 * cron-schedule limit). Probes the whole corpus for 301/308/404/410 and
 * mirrors the exclude-worthy set into `excluded_series` via
 * lib/link-audit.auditLinksAndExclude. Same `CRON_SECRET` bearer-auth gate as
 * every other /api/cron/* route - already covered by proxy.ts's `/api/cron`
 * PUBLIC_PATHS prefix, no proxy change needed.
 */
export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;
  const result = await auditLinksAndExclude();
  return NextResponse.json(result);
}
