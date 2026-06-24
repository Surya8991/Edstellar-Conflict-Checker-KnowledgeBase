import { NextRequest, NextResponse } from "next/server";
import { getEmbedder, getChat } from "@/lib/ai";
import { fetchAndExtract } from "@/lib/extract";
import { vectorSearchPages } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/internal-links
 * Body: { input: string, limit?: number, excludeUrl?: string, summarize?: boolean }
 * Returns the top-K existing pages a draft should link to.
 * Anchor text = the matched page's title (writers can tweak in the CMS).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = (body.input ?? "").toString().trim();
    if (!input) {
      return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });
    }
    const limit = Math.min(Number(body.limit) || 10, 25);
    const isUrl = /^https?:\/\//i.test(input);

    let text = input;
    if (isUrl) {
      const page = await fetchAndExtract(input);
      text = [page.title, page.h1, page.contentText].filter(Boolean).join("\n");
    }

    let summary: string | null = null;
    if (body.summarize !== false && (isUrl || text.length > 200)) {
      try {
        const sum = await getChat().summarize({ content: text, isTopic: !isUrl });
        text = `${sum.searchSynopsis}\n${sum.keywords.join(", ")}`;
        summary = sum.summary;
      } catch {
        /* fall back to raw text */
      }
    }

    const [embedding] = await getEmbedder().embed([text.slice(0, 12000)]);
    const matches = await vectorSearchPages(embedding, {
      limit,
      excludeUrl: isUrl ? input : body.excludeUrl,
    });

    const suggestions = matches.map((m, i) => ({
      rank: i + 1,
      url: m.url,
      title: m.title,
      contentType: m.contentType,
      similarity: m.similarity,
      anchor: m.title || m.url,
      snippet: m.snippet.slice(0, 240),
    }));
    return NextResponse.json({ summary, suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, suggestions: [] },
      { status: 500 },
    );
  }
}
