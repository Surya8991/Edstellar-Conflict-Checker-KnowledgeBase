/**
 * POST /api/check/classify-one
 * Body: { candidateSummary: string, candidateKeywords?: string[],
 *         url: string, title?: string, snippet?: string, similarity?: number }
 *
 * Lazy LLM classification for a single match the main check skipped
 * (because we cap classifyLimit at 15 to control cost). Called from the
 * Conflict Checker UI when the user clicks "Explain" on a needs-review row.
 *
 * If `snippet` isn't supplied, we look it up from the pages table.
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getChat } from "@/lib/ai";
import { blendScore, similarityToBaseScore, conflictTypeFromScore } from "@/lib/score";
import { clientIp, consume, denied } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Session auth (via proxy.ts) is the primary gate - this route isn't in
 * PUBLIC_PATHS, and it has no webhook caller (unlike /api/summarize etc), so
 * a WEBHOOK_API_KEY requirement would break the dashboard UI. Per-IP rate
 * limit is defense-in-depth so a misconfiguration (AUTH_ENABLED=false, or an
 * accidental PUBLIC_PATHS addition) can't turn this into an unbounded
 * LLM-cost sink (§19B).
 */
export async function POST(request: NextRequest) {
  const rl = await consume(clientIp(request), "check-classify-one", { max: 30, windowSec: 60 });
  if (!rl.ok) return denied(rl) as NextResponse;
  try {
    const body = await request.json().catch(() => ({}));
    const url = (body.url ?? "").toString();
    const candidateSummary = (body.candidateSummary ?? "").toString();
    if (!url || !candidateSummary) {
      return NextResponse.json({ error: "Missing 'url' or 'candidateSummary'." }, { status: 400 });
    }

    let title = body.title ?? null;
    let snippet = body.snippet ?? null;
    let similarity = Number(body.similarity) || 0;

    if (!snippet && process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = (await sql.query(
        "SELECT title, left(coalesce(content_text, meta_description, ''), 600) AS snippet FROM pages WHERE url = $1 LIMIT 1",
        [url],
      )) as any[];
      if (rows[0]) {
        title = title ?? rows[0].title;
        snippet = rows[0].snippet ?? "";
      }
    }

    const verdicts = await getChat().classifyConflicts({
      candidateSummary,
      matches: [{ url, title, snippet: snippet ?? "", similarity }],
    });
    const v = verdicts[0];
    const base = similarityToBaseScore(similarity);
    const conflictScore = blendScore(base, v?.conflictScore);
    const conflictType  = v?.conflictType ?? conflictTypeFromScore(conflictScore);
    return NextResponse.json({
      url,
      conflictScore,
      conflictType,
      rationale: v?.rationale ?? "",
      overlap: v?.overlap,
      issue: v?.issue,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
