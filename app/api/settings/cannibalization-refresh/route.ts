import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { snapshotKeywordConflicts, RANGE_LABEL } from "@/lib/cannibalization-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET → when keyword_conflicts was last computed + how many groups. */
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ lastComputed: null, groups: 0 });
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(
      `SELECT max(computed_at) AS last, count(*)::int AS n
         FROM keyword_conflicts WHERE range_label = $1`,
      [RANGE_LABEL],
    )) as { last: string | null; n: number }[];
    return NextResponse.json({ lastComputed: rows[0]?.last ?? null, groups: rows[0]?.n ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, lastComputed: null }, { status: 500 });
  }
}

/** POST → re-run the keyword-cannibalization snapshot. */
export async function POST() {
  try {
    const result = await snapshotKeywordConflicts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
