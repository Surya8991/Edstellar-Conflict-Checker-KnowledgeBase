import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { invalidateExclusionsCache } from "@/lib/exclusions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual exceptions (allow-list): a URL that matches an exclusion pattern but
 * should still be included. POST adds one, DELETE removes it. Stored as a single
 * `type='exception'` row in excluded_series.
 */
const db = () => neon(process.env.DATABASE_URL!);
const EXCEPTION_NAME = "Manually re-included pages";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = String(body.url ?? "").trim().toLowerCase();
    if (!url) return NextResponse.json({ error: "url is required." }, { status: 400 });

    // Append to the existing exception row (dedup), or create it.
    const upd = (await db().query(
      `UPDATE excluded_series
         SET patterns = (SELECT array_agg(DISTINCT x) FROM unnest(array_append(patterns, $1)) x),
             updated_at = now()
       WHERE type = 'exception' RETURNING id`,
      [url],
    )) as any[];
    if (upd.length === 0) {
      await db().query(
        `INSERT INTO excluded_series (name, patterns, type) VALUES ($1, ARRAY[$2], 'exception')`,
        [EXCEPTION_NAME, url],
      );
    }
    invalidateExclusionsCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = String(new URL(request.url).searchParams.get("url") ?? "").trim().toLowerCase();
    if (!url) return NextResponse.json({ error: "url is required." }, { status: 400 });
    await db().query(
      `UPDATE excluded_series SET patterns = array_remove(patterns, $1), updated_at = now()
       WHERE type = 'exception'`,
      [url],
    );
    invalidateExclusionsCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
