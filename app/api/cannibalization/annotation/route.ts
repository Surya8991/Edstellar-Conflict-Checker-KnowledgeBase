import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-conflict annotations (status + note) for the Keyword Cannibalization page.
 *
 * GET  → { annotations: { [query]: { status, note } } } for every stored row.
 * POST single: { query, status?, note? } → upsert one conflict's annotation.
 * POST bulk:   { queries: string[], status } → set the status on many at once
 *              (leaves each row's note untouched).
 *
 * Keyed by the conflict `query`, so it survives re-snapshots of
 * `keyword_conflicts`. Session-gated like the rest of the dashboard (not a
 * cron-callable public path).
 */
const STATUSES = new Set(["pending", "in-progress", "completed", "ignored"]);
const NOTE_MAX = 300;

async function ensureTable() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS conflict_annotations (
      id         serial PRIMARY KEY,
      query      text NOT NULL UNIQUE,
      status     text NOT NULL DEFAULT 'pending',
      note       text NOT NULL DEFAULT '',
      updated_at timestamp DEFAULT now()
    )`);
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ annotations: {} });
    const sql = neon(process.env.DATABASE_URL);
    await ensureTable();
    const rows = (await sql.query(`SELECT query, status, note FROM conflict_annotations`)) as any[];
    const annotations: Record<string, { status: string; note: string }> = {};
    for (const r of rows) annotations[r.query] = { status: r.status, note: r.note ?? "" };
    return NextResponse.json({ annotations });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
    const body = await req.json().catch(() => ({}));
    const sql = neon(process.env.DATABASE_URL);
    await ensureTable();

    // Bulk: set one status on many conflicts, leaving each note untouched.
    if (Array.isArray(body.queries)) {
      const queries = [...new Set(body.queries.filter((q: unknown): q is string => typeof q === "string" && q.trim() !== ""))];
      if (!queries.length) return NextResponse.json({ error: "queries is empty" }, { status: 400 });
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      await sql.query(
        `INSERT INTO conflict_annotations (query, status, updated_at)
         SELECT unnest($1::text[]), $2, now()
         ON CONFLICT (query) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
        [queries, body.status],
      );
      return NextResponse.json({ ok: true, updated: queries.length, status: body.status });
    }

    // Single: upsert one conflict's status + note.
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
    const status = STATUSES.has(body.status) ? body.status : "pending";
    const note = typeof body.note === "string" ? body.note.slice(0, NOTE_MAX) : "";
    await sql.query(
      `INSERT INTO conflict_annotations (query, status, note, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (query) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()`,
      [query, status, note],
    );
    return NextResponse.json({ ok: true, query, status, note });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
