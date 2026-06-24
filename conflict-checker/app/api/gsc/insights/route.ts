import { NextRequest, NextResponse } from "next/server";
import { buildInsights } from "@/lib/gsc-insights";
import type { RangeKey } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID: RangeKey[] = ["24h", "7d", "28d", "3m", "6m", "12m"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const range = (body.range ?? "28d") as RangeKey;
    if (!VALID.includes(range)) {
      return NextResponse.json({ error: "Invalid range." }, { status: 400 });
    }
    const insights = await buildInsights(range);
    return NextResponse.json(insights);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "GSC query failed." },
      { status: 500 },
    );
  }
}
