import { NextRequest, NextResponse } from "next/server";
import { runConflictCheck } from "@/lib/conflict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = (body.input ?? "").toString().trim();
    if (!input) {
      return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });
    }
    const limit = Number(body.limit) || 10;
    const result = await runConflictCheck(input, {
      limit,
      createdBy: body.createdBy ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Conflict check failed." },
      { status: 500 },
    );
  }
}
