/**
 * POST /api/rewrite-suggestion
 * Body: { input, conflicts: [{title, url, rationale}], summary? }
 *
 * Given a draft + the high-score conflicting pages, ask the LLM how to
 * differentiate (new angle, different audience, different keyword cluster).
 */
import { NextRequest, NextResponse } from "next/server";
import { getChat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = (body.input ?? "").toString().trim();
    const conflicts: { title: string; url: string; rationale?: string }[] =
      Array.isArray(body.conflicts) ? body.conflicts.slice(0, 5) : [];
    const summary = (body.summary ?? "").toString();
    if (!input) return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });

    const chat = getChat();
    const prompt =
      `A new piece of content is being planned:\n\n` +
      `INPUT: ${input}\n` +
      (summary ? `SUMMARY: ${summary}\n\n` : "\n") +
      `It overlaps with these existing Edstellar pages:\n` +
      conflicts.map((c, i) =>
        `${i + 1}. ${c.title || "(untitled)"} — ${c.url}\n   why: ${c.rationale || "(no rationale)"}`,
      ).join("\n") +
      `\n\nReturn JSON of the form ` +
      `{"diagnosis": string, "angles": [{"angle": string, "audience": string, "primaryKeyword": string}], "decision": "rewrite"|"merge"|"skip"}.` +
      ` Suggest 3 clearly distinct angles that would not cannibalize the listed pages. Keep "diagnosis" under 60 words.`;

    // Reuse summarize() as a generic LLM call (low ceremony).
    const r = await chat.summarize({ content: prompt, isTopic: true });
    // The provider's summarize already returns JSON-ish in `searchSynopsis`;
    // try parsing, otherwise return the raw text.
    let parsed: any = null;
    try { parsed = JSON.parse(r.searchSynopsis) } catch {
      try { parsed = JSON.parse(r.summary) } catch { /* keep null */ }
    }
    return NextResponse.json(parsed ?? { raw: r.summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
