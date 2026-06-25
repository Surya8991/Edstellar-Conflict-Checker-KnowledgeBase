import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runConflictCheck } from "@/lib/conflict";
import { clientIp, consume, denied } from "@/lib/rate-limit";
import { auth, isAuthEnabled } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/check
 * Pre-publish webhook for external systems (CMS, etc.).
 *
 * Auth strategy:
 *   - If WEBHOOK_API_KEY is set in env, callers MUST send a matching X-API-Key
 *     header. Used to gate CMS pre-publish hooks.
 *   - If unset, the route is open BUT rate-limited per-IP (60 req/min) to
 *     prevent LLM-token burn from drive-by traffic.
 *
 * Response shape is stable:
 *   { inputType, inputValue, summary, keywords, topScore, matches[], checkId,
 *     verdict: "block" | "review" | "pass" }
 * Treat topScore >= 80 as block-publish.
 */
const BodySchema = z.object({
  input: z.string().trim().min(1).max(4000),
  vectorLimit: z.coerce.number().int().positive().max(500).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  classifyLimit: z.coerce.number().int().positive().max(50).optional(),
  minSimilarity: z.coerce.number().min(0).max(1).optional(),
  createdBy: z.string().max(200).nullish(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — explicit key first, fall through to rate-limit.
    const required = process.env.WEBHOOK_API_KEY;
    if (required) {
      const sent = request.headers.get("x-api-key");
      if (sent !== required) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    } else {
      const rl = await consume(clientIp(request), "check", { max: 60, windowSec: 60 });
      if (!rl.ok) return denied(rl);
    }

    // 2. Input validation.
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Audit H3 (Session 6): when auth is enabled, prefer the session email.
    // When auth is DISABLED, NEVER trust a body-supplied createdBy — it's
    // forgeable from any caller and corrupts the audit trail. Stamp the
    // request IP instead so we at least have a per-source attribution.
    let createdBy: string | undefined;
    if (isAuthEnabled()) {
      const session = await auth();
      createdBy = session?.user?.email ?? undefined;
    } else {
      createdBy = `anon:${clientIp(request)}`;
    }

    const result = await runConflictCheck(body.input, {
      vectorLimit: body.vectorLimit ?? body.limit ?? 100,
      classifyLimit: body.classifyLimit ?? 15,
      minSimilarity: body.minSimilarity ?? 0.30,
      createdBy,
    });

    const verdict =
      result.topScore >= 80 ? "block" : result.topScore >= 60 ? "review" : "pass";
    return NextResponse.json({ ...result, verdict });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Conflict check failed." },
      { status: 500 },
    );
  }
}
