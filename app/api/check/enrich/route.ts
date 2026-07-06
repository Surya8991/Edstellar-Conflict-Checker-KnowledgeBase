import { NextRequest, NextResponse } from "next/server";
import { serpOverlap } from "@/lib/competitors-extra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/check/enrich
 * Body: { urls: string[], topic?: string, withSerp?: boolean }
 *
 * If `topic` and `withSerp`, returns competitor SERP refs + keyword gap
 * (keywords competitors' titles emphasise). GSC page-stats were removed from
 * the Conflict Checker, so this endpoint no longer touches Search Console.
 *
 * Best-effort — Serper failures are returned as an error field rather than 500
 * so a slow Conflict Checker render doesn't fail the whole page.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 10) : [];
    const topic = (body.topic ?? "").toString().trim();
    const withSerp = body.withSerp !== false;
    if (!urls.length) {
      return NextResponse.json({ error: "Missing 'urls[]'." }, { status: 400 });
    }

    // SERP overlap for the topic (one Serper call) — gives us competitor refs.
    let serp: any = null;
    let gap: string[] = [];
    if (withSerp && topic) {
      try {
        serp = await serpOverlap(topic);
        // Keyword gap: keywords the competitors' SERP titles emphasise.
        const titleTokens = serp.organic
          .filter((r: any) => !r.isEdstellar)
          .flatMap((r: any) =>
            (r.title || "").toLowerCase()
              .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
              .filter((w: string) => w.length > 3 && !STOP.has(w)),
          );
        const tally = new Map<string, number>();
        for (const t of titleTokens) tally.set(t, (tally.get(t) ?? 0) + 1);
        gap = [...tally.entries()]
          .filter(([, n]) => n >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([w]) => w);
      } catch (e) {
        serp = { error: (e as Error).message };
      }
    }

    return NextResponse.json({ serp, gap });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const STOP = new Set([
  "the","and","for","with","from","that","this","your","you","are","best","top","how",
  "what","why","into","over","under","about","when","more","than","training","course",
  "courses","program","programs","2024","2025","2026","guide","tips","help",
]);
