import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts, checks } from "@/lib/db/schema";
import { auth, isAuthEnabled } from "@/auth";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/drafts  — enqueue a draft generation request from a checkId.
 * The route builds the brief from the check + its top matches and stores
 * it as `brief_md`. The local worker picks it up via GET ?status=queued.
 *
 * GET /api/drafts            — list drafts (UI history; session-gated)
 * GET /api/drafts?status=    — worker poll (requires X-Worker-Key)
 */

const CreateBody = z.object({
  checkId: z.coerce.number().int().positive(),
});

function workerKeyOk(req: NextRequest): boolean {
  const required = process.env.WORKER_API_KEY;
  if (!required) return false;
  return req.headers.get("x-worker-key") === required;
}

async function requireSession(req: NextRequest): Promise<string | NextResponse> {
  if (!isAuthEnabled()) return `anon:${clientIp(req)}`;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return session.user.email;
}

export async function POST(request: NextRequest) {
  try {
    const requester = await requireSession(request);
    if (requester instanceof NextResponse) return requester;

    const raw = await request.json().catch(() => ({}));
    const parsed = CreateBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const check = await db.query.checks.findFirst({
      where: eq(checks.id, parsed.data.checkId),
    });
    if (!check) {
      return NextResponse.json({ error: "Check not found." }, { status: 404 });
    }

    const briefMd = await buildBriefFromCheckId(parsed.data.checkId);

    const [row] = await db
      .insert(drafts)
      .values({
        checkId: parsed.data.checkId,
        status: "queued",
        briefMd,
        requestedBy: requester,
      })
      .returning();

    return NextResponse.json({ id: row.id, status: row.status });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to enqueue draft." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);

    // Worker poll: X-Worker-Key required, returns queued rows oldest-first.
    if (statusFilter === "queued") {
      if (!workerKeyOk(request)) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const rows = await db.query.drafts.findMany({
        where: eq(drafts.status, "queued"),
        orderBy: (d, { asc }) => [asc(d.requestedAt)],
        limit,
      });
      return NextResponse.json({ rows });
    }

    // UI history: session-gated.
    const requester = await requireSession(request);
    if (requester instanceof NextResponse) return requester;

    const rows = await db.query.drafts.findMany({
      orderBy: (d, { desc }) => [desc(d.requestedAt)],
      limit,
    });
    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        checkId: r.checkId,
        status: r.status,
        model: r.model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        requestedBy: r.requestedBy,
        requestedAt: r.requestedAt,
        completedAt: r.completedAt,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to list drafts." },
      { status: 500 },
    );
  }
}

/**
 * Compose the Markdown brief that gets handed to Claude.
 * Mirrors copyWriterBrief() in conflict-checker page, but reads from DB so
 * the worker has the same context regardless of which session enqueued.
 */
async function buildBriefFromCheckId(checkId: number): Promise<string> {
  const check = await db.query.checks.findFirst({
    where: eq(checks.id, checkId),
  }).catch(() => null);

  if (!check) return `# Draft brief\n\nCheck #${checkId} not found.`;

  const matches = await db.query.checkMatches.findMany({
    where: (m, { eq }) => eq(m.checkId, checkId),
    orderBy: (m, { desc }) => [desc(m.conflictScore)],
    limit: 20,
  });

  const lines: string[] = [];
  lines.push(`# Content brief — Check #${checkId}`);
  lines.push("");
  lines.push(`**Input type:** ${check.inputType}`);
  lines.push(`**Topic / source:** ${check.inputValue}`);
  lines.push(`**Top conflict score:** ${check.topScore ?? "—"}%`);
  lines.push("");

  if (check.summary) {
    lines.push("## Summary of intended content");
    lines.push(check.summary);
    lines.push("");
  }

  if (check.keywords) {
    let kws: string[] = [];
    try { kws = JSON.parse(check.keywords) } catch { /* ignore */ }
    if (kws.length) {
      lines.push("## Keyword set");
      lines.push(kws.map((k) => `- ${k}`).join("\n"));
      lines.push("");
    }
  }

  const avoid = matches.filter((m) => (m.conflictScore ?? 0) >= 60);
  if (avoid.length) {
    lines.push("## Avoid overlap with these existing pages");
    for (const m of avoid) {
      lines.push(`- [${m.pageTitle || m.pageUrl}](${m.pageUrl}) — score ${m.conflictScore}%, ${m.conflictType ?? "unknown"}`);
      if (m.rationale) lines.push(`  - ${m.rationale}`);
    }
    lines.push("");
  }

  const linkTargets = matches.filter(
    (m) => (m.conflictScore ?? 0) < 60 && (m.conflictScore ?? 0) >= 30,
  );
  if (linkTargets.length) {
    lines.push("## Suggested internal-link targets (related, not overlapping)");
    for (const m of linkTargets.slice(0, 8)) {
      lines.push(`- [${m.pageTitle || m.pageUrl}](${m.pageUrl})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Instructions for the writer (Claude)");
  lines.push("Produce a publish-ready 1500–2500 word article in Markdown.");
  lines.push("Voice: educational, expert, neutral; no marketing fluff.");
  lines.push("Structure: H1 title, meta description (≤155 chars), intro (~120 words), 4–7 H2 sections with H3 subsections, FAQ section answering 4–6 People-Also-Ask questions, conclusion with a clear next-step.");
  lines.push("Differentiate from the 'avoid' list above — do NOT rewrite those pages, take a fresh angle.");
  lines.push("Cite the internal-link targets above where contextually relevant (Markdown links).");
  lines.push("Do not invent statistics or attribute quotes to real people.");
  return lines.join("\n");
}
