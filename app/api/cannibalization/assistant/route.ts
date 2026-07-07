import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { getExclusions, isExcludedUrl, isExcludedQuery } from "@/lib/exclusions";
import { THRESHOLDS } from "@/lib/thresholds";
import { RANGE_LABEL } from "@/lib/cannibalization-snapshot";
import { classifyGroup, normalizeUrl, isLivePageStatus, type ConflictPage } from "@/lib/cannibalization";
import {
  parseInputs,
  matchInputs,
  buildLlmContext,
  groupTabs,
  type ConflictLike,
} from "@/lib/cannibalization-assistant";
import { getChat } from "@/lib/ai";
import { parseJson } from "@/lib/ai/chat-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keyword Cannibalization AI Assistant (§18O).
 *
 * POST { inputs: string[] | string, question?, conversationId? }
 *   → matches the pasted URLs/keywords against the live conflict set (all 4
 *     tabs' data), asks Groq for an analysis, stores the turn, and returns
 *     { conversationId, matches, answer }.
 * GET ?conversationId=… → that conversation's turns (history).
 *
 * Session-gated like the rest of the dashboard (not a cron public path).
 */
async function ensureTable() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS cannibalization_chats (
      id serial PRIMARY KEY, conversation_id text NOT NULL, inputs jsonb NOT NULL DEFAULT '[]',
      question text, matches jsonb, answer jsonb, created_by text, created_at timestamp DEFAULT now()
    )`);
}

/** Load the live conflict set exactly as /api/cannibalization does: drop branded,
 *  excluded, and dead (404/removed) pages, then re-classify from survivors. */
async function loadLiveGroups(): Promise<ConflictLike[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT query, branded, pages FROM keyword_conflicts WHERE range_label = $1`,
    [RANGE_LABEL],
  )) as any[];
  const { url: urlPatterns, query: queryPatterns, exception } = await getExclusions();
  const brandTerms = (process.env.BRAND_TERMS || "edstellar").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const corpusRows = (await sql.query(`SELECT url, http_status FROM pages`)) as any[];
  const corpusStatus = new Map<string, number | null>();
  for (const p of corpusRows) corpusStatus.set(normalizeUrl(p.url), p.http_status ?? null);
  const isLivePage = (u: string) => {
    const k = normalizeUrl(u);
    return isLivePageStatus(corpusStatus.has(k) ? corpusStatus.get(k)! : undefined);
  };

  const out: ConflictLike[] = [];
  const nearGap = THRESHOLDS.cannibalNearGap;
  for (const r of rows) {
    if (r.branded) continue;
    if (isExcludedQuery(r.query, queryPatterns)) continue;
    const pages = (Array.isArray(r.pages) ? r.pages : []).filter(
      (p: any) => !isExcludedUrl(p.page, urlPatterns, exception) && isLivePage(p.page),
    );
    if (pages.length < 2) continue;
    const g = classifyGroup(r.query, pages as ConflictPage[], { nearGap, brandTerms });
    if (g.branded) continue;
    out.push({
      query: g.query,
      positionGap: g.positionGap,
      crossType: g.crossType,
      severity: g.severity,
      totalClicks: g.totalClicks,
      totalImpressions: g.totalImpressions,
      pages: g.pages.map((p) => ({ page: p.page, contentType: p.contentType })),
    });
  }
  return out;
}

const SYSTEM = `You are an SEO analyst for Edstellar. You are given keyword-cannibalization conflict data (from Google Search Console) for the specific URLs/keywords a user asked about - where 2+ Edstellar pages compete for the same query. Write a concise, practical analysis: which inputs have real conflicts, how serious, and the concrete action (consolidate & 301 the losers, differentiate the angles, or just monitor). Never invent pages or numbers beyond the data given. Never use the phrase "money page" or any revenue/commercial framing - stay neutral SEO. Respond ONLY as JSON.`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
    const body = await req.json().catch(() => ({}));
    const inputs = Array.isArray(body.inputs) ? parseInputs(body.inputs.join("\n")) : parseInputs(String(body.inputs ?? ""));
    if (!inputs.length) return NextResponse.json({ error: "Paste at least one URL or keyword." }, { status: 400 });
    const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
    const conversationId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : randomUUID();

    const sql = neon(process.env.DATABASE_URL);
    const nearGap = THRESHOLDS.cannibalNearGap;
    const groups = await loadLiveGroups();
    const rawMatches = matchInputs(inputs, groups, nearGap);
    // Attach tab membership for the UI.
    const matches = rawMatches.map((m) => ({
      ...m,
      groups: m.groups.map((g) => ({ ...g, tabs: groupTabs(g, nearGap) })),
    }));

    // Ask Groq for the written analysis.
    const context = buildLlmContext(rawMatches, nearGap);
    const totalConflicts = rawMatches.reduce((s, m) => s + m.groups.length, 0);
    let answer: { answer: string; keyFindings: string[] } = {
      answer: totalConflicts ? "" : "None of the pasted URLs or keywords are in a current cannibalization conflict.",
      keyFindings: [],
    };
    try {
      const raw = await getChat().generate({
        system: SYSTEM,
        prompt:
          `The user pasted these inputs and ${question ? `asked: "${question}"` : "wants an overview of their cannibalization conflicts"}.\n\n` +
          `CONFLICT DATA (nearGap=${nearGap}; tabs: near-position = top-2 within ±${nearGap}, cross-type = different content types):\n${context || "(no conflicts matched)"}\n\n` +
          `Respond as JSON: {"answer": "<markdown analysis, 1-4 short paragraphs or a tight bullet list>", "keyFindings": ["<one-line action per notable conflict>"]}`,
      });
      const parsed = parseJson<{ answer?: string; keyFindings?: string[] }>(raw, {});
      if (parsed.answer) answer = { answer: parsed.answer, keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.slice(0, 12) : [] };
    } catch {
      // Groq unavailable (kill switch / 429) - fall back to the deterministic summary.
      answer = {
        answer: totalConflicts
          ? `Found ${totalConflicts} conflict${totalConflicts === 1 ? "" : "s"} across ${inputs.length} input${inputs.length === 1 ? "" : "s"}. (AI summary unavailable right now - the matched conflicts are shown below.)`
          : answer.answer,
        keyFindings: [],
      };
    }

    // Store the turn.
    await ensureTable();
    await sql.query(
      `INSERT INTO cannibalization_chats (conversation_id, inputs, question, matches, answer, created_at)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, now())`,
      [conversationId, JSON.stringify(inputs), question || null, JSON.stringify(matches), JSON.stringify(answer)],
    );

    return NextResponse.json({ conversationId, inputs, question, matches, answer, nearGap, totalConflicts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ turns: [] });
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    if (!conversationId) return NextResponse.json({ turns: [] });
    const sql = neon(process.env.DATABASE_URL);
    await ensureTable();
    const turns = (await sql.query(
      `SELECT id, inputs, question, matches, answer, created_at FROM cannibalization_chats
        WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    )) as any[];
    return NextResponse.json({ conversationId, turns });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
