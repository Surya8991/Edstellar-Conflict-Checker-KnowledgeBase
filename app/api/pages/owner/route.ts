import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pages/owner
 * Body: { url: string, ownerUrl: string | null }
 * Set or clear the editorial owner for a page (#25).
 *
 * Admin-only when WEBHOOK_API_KEY is set; otherwise open in dev. NextAuth
 * gating belongs here once #33 ships.
 */
const BodySchema = z.object({
  url: z.string().url(),
  ownerUrl: z.string().url().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const required = process.env.WEBHOOK_API_KEY;
    if (required && request.headers.get("x-api-key") !== required) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body.", issues: parsed.error.issues }, { status: 400 });
    }
    const { url, ownerUrl } = parsed.data;
    const sql = neon(process.env.DATABASE_URL!);
    const result = (await sql.query(
      `UPDATE pages SET owner_url = $1 WHERE url = $2 RETURNING id`,
      [ownerUrl, url],
    )) as any[];
    if (!result.length) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, url, ownerUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
