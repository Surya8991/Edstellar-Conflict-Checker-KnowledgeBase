import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { invalidateExclusionsCache } from "@/lib/exclusions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CRUD for the excluded_series table (Settings page). Session-gated like the
 * rest of the dashboard. Every write invalidates the in-memory pattern cache.
 */
const db = () => neon(process.env.DATABASE_URL!);

/** Accept patterns as an array or a comma-separated string; normalize. */
function normPatterns(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : String(input ?? "").split(",");
  return [...new Set(arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
}

const asType = (t: unknown): "url" | "query" => (t === "query" ? "query" : "url");

export async function GET() {
  try {
    const rows = await db().query(
      `SELECT id, name, patterns, type, enabled FROM excluded_series ORDER BY id`,
    );
    return NextResponse.json({ exclusions: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, exclusions: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const patterns = normPatterns(body.patterns);
    const type = asType(body.type);
    if (!name || patterns.length === 0) {
      return NextResponse.json({ error: "A name and at least one pattern are required." }, { status: 400 });
    }
    const rows = (await db().query(
      `INSERT INTO excluded_series (name, patterns, type) VALUES ($1, $2::text[], $3)
       RETURNING id, name, patterns, type, enabled`,
      [name, patterns, type],
    )) as any[];
    invalidateExclusionsCache();
    return NextResponse.json({ exclusion: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
      sets.push(`name = $${i++}`);
      params.push(name);
    }
    if (body.patterns !== undefined) {
      const patterns = normPatterns(body.patterns);
      if (patterns.length === 0) return NextResponse.json({ error: "at least one pattern is required." }, { status: 400 });
      sets.push(`patterns = $${i++}::text[]`);
      params.push(patterns);
    }
    if (body.enabled !== undefined) {
      sets.push(`enabled = $${i++}`);
      params.push(!!body.enabled);
    }
    if (body.type !== undefined) {
      sets.push(`type = $${i++}`);
      params.push(asType(body.type));
    }
    if (sets.length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    sets.push(`updated_at = now()`);
    params.push(id);

    const rows = (await db().query(
      `UPDATE excluded_series SET ${sets.join(", ")} WHERE id = $${i}
       RETURNING id, name, patterns, type, enabled`,
      params,
    )) as any[];
    invalidateExclusionsCache();
    return NextResponse.json({ exclusion: rows[0] ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    await db().query(`DELETE FROM excluded_series WHERE id = $1`, [id]);
    invalidateExclusionsCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
