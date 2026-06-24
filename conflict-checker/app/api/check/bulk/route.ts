import { NextRequest, NextResponse } from "next/server";
import { runConflictCheck } from "@/lib/conflict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/check/bulk
 * Body: { inputs: string[], limit?: number, concurrency?: number }
 * Returns: { results: Array<{input, ok, topScore, verdict, summary?, error?}> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const inputs: string[] = Array.isArray(body.inputs) ? body.inputs : [];
    const limit = Number(body.limit) || 5;
    const concurrency = Math.min(Math.max(Number(body.concurrency) || 3, 1), 6);
    if (!inputs.length) {
      return NextResponse.json({ error: "Missing 'inputs[]'." }, { status: 400 });
    }

    const queue = inputs.map((s) => s.trim()).filter(Boolean);
    const results: any[] = new Array(queue.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const input = queue[idx];
        try {
          const r = await runConflictCheck(input, { limit });
          const verdict =
            r.topScore >= 80 ? "block" : r.topScore >= 60 ? "review" : "pass";
          results[idx] = {
            input,
            ok: true,
            topScore: r.topScore,
            verdict,
            summary: r.summary,
            topMatchUrl: r.matches[0]?.url ?? null,
            topMatchTitle: r.matches[0]?.title ?? null,
            topMatchType: r.matches[0]?.conflictType ?? null,
            checkId: r.checkId ?? null,
          };
        } catch (e) {
          results[idx] = { input, ok: false, error: (e as Error).message };
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Bulk check failed." },
      { status: 500 },
    );
  }
}
