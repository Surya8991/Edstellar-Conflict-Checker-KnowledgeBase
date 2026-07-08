import { NextRequest, NextResponse } from "next/server";
import { semanticCatalogGap } from "@/lib/gsc-insights";
import type { RangeKey } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Embedding the candidate queries + per-candidate pgvector search is heavier
// than the other GSC sections, so this is its own on-demand route (the Catalog
// Gap tab fetches it lazily). First call may cold-start the local embedder.
export const maxDuration = 60;

/**
 * POST /api/gsc/catalog-gap  { range, startDate?, endDate? }
 *   → { gap: GapRow[] } - queries you rank for that have NO semantically-close
 *     corpus page (real content-gap opportunities). §25.
 *
 * Session-gated like the rest of /search-console (not a cron public path).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const range = (body.range ?? "28d") as RangeKey;
    const custom =
      range === "custom" ? { startDate: body.startDate, endDate: body.endDate } : undefined;
    const gap = await semanticCatalogGap(range, custom);
    return NextResponse.json({ gap });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
