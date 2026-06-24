import { NextRequest, NextResponse } from "next/server";
import { researchCompetitors } from "@/lib/competitors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = (body.topic ?? "").toString().trim();
    if (!topic) {
      return NextResponse.json({ error: "Missing 'topic'." }, { status: 400 });
    }
    const results = await researchCompetitors(topic, {
      limit: Number(body.limit) || 6,
    });
    return NextResponse.json({ topic, results });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Competitor research failed." },
      { status: 500 },
    );
  }
}
