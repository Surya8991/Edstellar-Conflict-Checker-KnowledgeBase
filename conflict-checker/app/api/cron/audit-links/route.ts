import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly cron — HEAD-check every URL, write http_status. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    "SELECT id, url FROM pages ORDER BY last_audited_at NULLS FIRST LIMIT 1500",
  )) as { id: number; url: string }[];
  let broken = 0;
  for (const r of rows) {
    let status = 0;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 15_000);
      try {
        const res = await fetch(r.url, { method: "HEAD", signal: c.signal, redirect: "follow" });
        status = res.status;
        if (status === 405 || status === 501) {
          const r2 = await fetch(r.url, { method: "GET", signal: c.signal, redirect: "follow" });
          status = r2.status;
        }
      } finally { clearTimeout(t) }
    } catch { status = 0 }
    if (!status || status >= 400) broken++;
    await sql.query(
      `UPDATE pages SET http_status = $1, last_audited_at = now() WHERE id = $2`,
      [status || null, r.id],
    );
  }
  return NextResponse.json({ checked: rows.length, broken });
}
