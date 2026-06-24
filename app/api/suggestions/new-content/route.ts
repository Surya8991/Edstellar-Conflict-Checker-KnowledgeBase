/**
 * POST /api/suggestions/new-content
 * Body: { topic: string, url?: string }
 *
 * Returns a structured list of net-new content angles synthesized from:
 *   - competitor SERP titles for this topic (Serper)
 *   - LLM knowledge of recent AI Overviews / Google algorithm updates /
 *     AI platforms (ChatGPT, Claude, Gemini, Perplexity) that surface
 *     this kind of content
 *
 * Used by the Conflict Checker "what should we publish instead?" panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { serpOverlap } from "@/lib/competitors-extra";
import { getChat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = (body.topic ?? "").toString().trim();
    const url = (body.url ?? "").toString().trim();
    if (!topic) return NextResponse.json({ error: "Missing 'topic'." }, { status: 400 });

    let serp: any = null;
    try { serp = await serpOverlap(topic) } catch (e) { serp = { error: (e as Error).message } }

    const competitorSnippets = (serp?.organic ?? [])
      .filter((r: any) => !r.isEdstellar)
      .slice(0, 8)
      .map((r: any) => `- ${r.title} (${r.domain})`)
      .join("\n");

    const prompt =
`You are a senior content strategist for Edstellar, a corporate training company.

TOPIC: ${topic}
${url ? `EXISTING URL: ${url}\n` : ""}
What competitors currently rank in the top 10:
${competitorSnippets || "(no SERP data available)"}

Produce 6 NEW content angles for Edstellar to publish that:
1. Are clearly different from each competitor result above
2. Reflect post-2024 shifts the topic should address — specifically:
   - Google AI Overviews surfacing for this query (what AI summaries already say, and gaps)
   - Recent Google algorithm updates (helpful content, EEAT, hidden gems)
   - The rise of AI assistants as discovery surfaces (ChatGPT, Claude, Gemini, Perplexity) — what gets cited
   - Emerging AI platforms or workflows that change how this topic is taught/applied
3. Are realistic for a B2B corporate-training brand to write authoritatively

Return strict JSON only, of the form:
{
  "angles": [
    { "title": string, "format": "blog|guide|course|landing", "audience": string,
      "primaryKeyword": string, "differentiation": string, "trigger": "competitors"|"ai-overview"|"google-update"|"ai-platform"|"emerging-topic" }
  ],
  "summary": string
}
`;

    const r = await getChat().summarize({ content: prompt, isTopic: true });
    let parsed: any = null;
    try { parsed = JSON.parse(r.searchSynopsis) } catch {
      try { parsed = JSON.parse(r.summary) } catch { /* keep null */ }
    }
    return NextResponse.json({
      topic,
      serp: serp?.organic ? { edstellarRank: serp.edstellarRank, competitors: serp.organic } : null,
      suggestions: parsed ?? { raw: r.summary },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
