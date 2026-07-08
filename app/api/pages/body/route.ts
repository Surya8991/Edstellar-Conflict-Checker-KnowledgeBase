import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rowsOf } from "@/lib/db/exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a page's full stored body as a plain-text file (§33). The Edstellar
 * Database table doesn't render body text (it's huge); this streams the whole
 * content_text for one URL as an attachment when the user asks for it. All the
 * body is stored so the rest of the project can use it - this is just the "let
 * me see it" escape hatch.
 */
export async function GET(request: NextRequest) {
  const url = (request.nextUrl.searchParams.get("url") ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "Missing ?url=" }, { status: 400 });
  }

  const rows = rowsOf<{ content_text: string | null; title: string | null }>(
    await db.execute(sql`
      SELECT content_text, title FROM pages WHERE url = ${url} LIMIT 1`),
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "URL not found in corpus" }, { status: 404 });
  }

  const body = rows[0].content_text ?? "";
  // Derive a safe filename from the slug.
  const slug =
    url.replace(/\/+$/, "").split("/").pop()?.replace(/[^a-z0-9-]+/gi, "-") ||
    "page-body";
  const header = `# ${rows[0].title ?? url}\n# ${url}\n\n`;

  return new NextResponse(header + body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
