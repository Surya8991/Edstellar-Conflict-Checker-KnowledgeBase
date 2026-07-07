import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { snapshotGscMetrics } from "@/lib/gsc-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET → when gsc_metrics was last refreshed. */
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ lastRefreshed: null });
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(
      `SELECT max(fetched_at) AS last FROM gsc_metrics`,
    )) as { last: string | null }[];
    return NextResponse.json({ lastRefreshed: rows[0]?.last ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, lastRefreshed: null }, { status: 500 });
  }
}

/** POST → re-run the GSC metrics snapshot (1m/3m/6m totals + top queries). */
export async function POST() {
  try {
    const result = await snapshotGscMetrics();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
