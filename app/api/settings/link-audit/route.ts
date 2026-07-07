import { NextResponse } from "next/server";
import { auditLinksAndExclude, getLastLinkAuditRun } from "@/lib/link-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET → last run's metadata (null if it has never run), for the Settings page. */
export async function GET() {
  try {
    const last = await getLastLinkAuditRun();
    return NextResponse.json({ last });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, last: null }, { status: 500 });
  }
}

/** POST → manual "Run now" trigger from the Settings page. Session-gated like
 *  every other /api/settings/* route (not in proxy.ts PUBLIC_PATHS). Runs the
 *  same core logic as the daily /api/cron/link-audit run. */
export async function POST() {
  try {
    const result = await auditLinksAndExclude();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
