import { NextRequest, NextResponse } from "next/server";
import { getChat } from "@/lib/ai";
import { fetchAndExtract } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = (body.input ?? "").toString().trim();
    if (!input) {
      return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });
    }
    const isUrl = /^https?:\/\//i.test(input);
    const chat = getChat();
    if (isUrl) {
      const page = await fetchAndExtract(input);
      const result = await chat.summarize({
        title: page.title ?? undefined,
        content: [page.title, page.h1, page.contentText].filter(Boolean).join("\n"),
        isTopic: false,
      });
      return NextResponse.json({ inputType: "url", title: page.title, ...result });
    }
    const result = await chat.summarize({ content: input, isTopic: true });
    return NextResponse.json({ inputType: "topic", ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Summarize failed." },
      { status: 500 },
    );
  }
}
