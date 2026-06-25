import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/check/outcome
 * Body: { checkId: number, outcome: 'published' | 'merged' | 'redirected' | 'discarded' | null }
 *
 * Records what the editor actually did with the check result so leadership
 * can answer 'how many duplicates did we catch this quarter?' (#36).
 */
const BodySchema = z.object({
  checkId: z.coerce.number().int().positive(),
  outcome: z.enum(["published", "merged", "redirected", "discarded"]).nullable(),
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
    const { checkId, outcome } = parsed.data;
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(
      `UPDATE checks
          SET outcome = $1,
              resolved_at = CASE WHEN $1 IS NULL THEN NULL ELSE now() END
        WHERE id = $2`,
      [outcome, checkId],
    );
    return NextResponse.json({ ok: true, checkId, outcome });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
