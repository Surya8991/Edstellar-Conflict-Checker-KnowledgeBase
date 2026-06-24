import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const base = process.env.APP_BASE_URL || request.nextUrl.origin;
  if (!code) {
    return NextResponse.redirect(`${base}/search-console?gsc=error`);
  }
  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    return NextResponse.redirect(`${base}/search-console?gsc=connected`);
  } catch (e) {
    console.error("[gsc/callback]", (e as Error).message);
    return NextResponse.redirect(`${base}/search-console?gsc=error`);
  }
}
