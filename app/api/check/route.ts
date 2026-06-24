import { NextRequest, NextResponse } from "next/server";
import { runConflictCheck } from "@/lib/conflict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/check
 * Body: { input: string, limit?: number, createdBy?: string }
 *
 * Pre-publish webhook for external systems (CMS, etc.):
 *   - If WEBHOOK_API_KEY is set in env, the request must send a matching
 *     X-API-Key header. Otherwise the route is open (used by the dashboard).
 *   - Response shape is stable: { inputType, inputValue, summary, keywords,
 *     topScore, matches[], checkId }. Treat topScore >= 80 as block-publish.
 */
export async function POST(request: NextRequest) {
  try {
    const required = process.env.WEBHOOK_API_KEY;
    if (required) {
      const sent = request.headers.get("x-api-key");
      if (sent !== required) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }
    const body = await request.json().catch(() => ({}));
    const input = (body.input ?? "").toString().trim();
    if (!input) {
      return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });
    }
    const vectorLimit  = Number(body.vectorLimit)  || Number(body.limit) || 100;
    const classifyLimit = Number(body.classifyLimit) || 15;
    const minSimilarity = body.minSimilarity != null ? Number(body.minSimilarity) : 0.30;
    const result = await runConflictCheck(input, {
      vectorLimit,
      classifyLimit,
      minSimilarity,
      createdBy: body.createdBy ?? null,
    });
    // verdict helper for webhook consumers
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
