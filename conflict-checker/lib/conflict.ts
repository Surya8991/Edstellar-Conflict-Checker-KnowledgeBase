import { neon } from "@neondatabase/serverless";
import { getChat, getEmbedder } from "@/lib/ai";
import { fetchAndExtract } from "@/lib/extract";
import { vectorSearchPages, toVectorLiteral } from "@/lib/search";
import {
  blendScore,
  similarityToBaseScore,
  conflictTypeFromScore,
} from "@/lib/score";
import type { SummaryResult } from "@/lib/ai/types";

export interface ConflictMatchResult {
  url: string;
  title: string | null;
  contentType: string | null;
  similarity: number;
  conflictScore: number;
  conflictType: string;
  rationale: string;
  /** 2-4 short phrases both pages cover (populated by the LLM verdict). */
  overlap?: string[];
  /** Plain-language SEO issue summary. */
  issue?: string;
}

export interface ConflictCheckResult {
  inputType: "url" | "topic";
  inputValue: string;
  summary: string;
  keywords: string[];
  /** The 4-8 word SEO query the LLM thinks this page targets. Use for SERP
   *  lookups instead of the often-too-short keywords[0]. */
  primaryQuery?: string;
  topScore: number;
  matches: ConflictMatchResult[];
  checkId?: number;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export interface ConflictCheckOpts {
  /** How many vector candidates to fetch from pgvector. Default 100. */
  vectorLimit?: number;
  /** How many of those to send to the LLM for full classification. Default 15. */
  classifyLimit?: number;
  /** Drop matches below this cosine similarity. 0..1, default 0.30. */
  minSimilarity?: number;
  createdBy?: string;
  persist?: boolean;
  /** Legacy alias for vectorLimit (older callers). */
  limit?: number;
}

/**
 * The headline flow: summarize a URL/topic, embed it, vector-search the corpus,
 * LLM-classify the top N, and persist.
 *
 * Why two limits? Cost. `vectorLimit` is how many candidates we *return* (cheap:
 * one pgvector query). `classifyLimit` is how many we ask the LLM to explain
 * (expensive: 1 chat call total but token-bounded by N).
 * Matches between classifyLimit+1 and vectorLimit get a similarity-derived
 * score, conflict_type="needs-review", and an empty rationale. The UI can call
 * /api/check/classify-one to fill them in lazily.
 */
export async function runConflictCheck(
  rawInput: string,
  opts: ConflictCheckOpts = {},
): Promise<ConflictCheckResult> {
  const input = rawInput.trim();
  const inputType: "url" | "topic" = isUrl(input) ? "url" : "topic";
  const chat = getChat();
  const embedder = getEmbedder();

  const vectorLimit  = opts.vectorLimit ?? opts.limit ?? 100;
  const classifyLimit = Math.min(opts.classifyLimit ?? 15, vectorLimit);
  const minSimilarity = opts.minSimilarity ?? 0.30;

  // 1. Build a summary + dense search synopsis.
  let summaryResult: SummaryResult;
  if (inputType === "url") {
    const page = await fetchAndExtract(input);
    summaryResult = await chat.summarize({
      title: page.title ?? undefined,
      content: [page.title, page.h1, page.contentText].filter(Boolean).join("\n"),
      isTopic: false,
    });
  } else {
    summaryResult = await chat.summarize({ content: input, isTopic: true });
  }

  // 2. Embed the candidate and find nearest corpus pages.
  const embedText = `${summaryResult.searchSynopsis}\n${summaryResult.keywords.join(", ")}`;
  const [embedding] = await embedder.embed([embedText]);
  const nearest = await vectorSearchPages(embedding, {
    limit: vectorLimit,
    excludeUrl: inputType === "url" ? input : undefined,
  });
  // Drop matches below the threshold — keeps the UI signal-to-noise sane.
  const meaningful = nearest.filter((m) => m.similarity >= minSimilarity);

  // 3. LLM judges only the top `classifyLimit` (cost control).
  const toClassify = meaningful.slice(0, classifyLimit);
  const verdicts = toClassify.length
    ? await chat.classifyConflicts({
        candidateSummary: `${summaryResult.summary}\n${summaryResult.searchSynopsis}`,
        matches: toClassify.map((m) => ({
          url: m.url,
          title: m.title,
          snippet: m.snippet,
          similarity: m.similarity,
        })),
      })
    : [];
  const verdictByUrl = new Map(verdicts.map((v) => [v.url, v]));

  // 4. Blend vector + LLM scores. Un-classified matches get
  //    a similarity-derived score and conflictType="needs-review".
  const matches: ConflictMatchResult[] = meaningful
    .map((m) => {
      const base = similarityToBaseScore(m.similarity);
      const v = verdictByUrl.get(m.url);
      const conflictScore = blendScore(base, v?.conflictScore);
      const conflictType = v
        ? (v.conflictType ?? conflictTypeFromScore(conflictScore))
        : "needs-review";
      return {
        url: m.url,
        title: m.title,
        contentType: m.contentType,
        similarity: m.similarity,
        conflictScore,
        conflictType,
        rationale: v?.rationale ?? "",
        overlap: v?.overlap,
        issue: v?.issue,
      };
    })
    .sort((a, b) => b.conflictScore - a.conflictScore);

  const topScore = matches.length ? matches[0].conflictScore : 0;

  const result: ConflictCheckResult = {
    inputType,
    inputValue: input,
    summary: summaryResult.summary,
    keywords: summaryResult.keywords,
    primaryQuery: summaryResult.primaryQuery,
    topScore,
    matches,
  };

  // 5. Persist (best-effort).
  if (opts.persist !== false && process.env.DATABASE_URL) {
    try {
      result.checkId = await persistCheck(result, embedding, opts.createdBy);
    } catch (e) {
      console.warn("[conflict] persist failed:", (e as Error).message);
    }
  }

  return result;
}

async function persistCheck(
  result: ConflictCheckResult,
  embedding: number[],
  createdBy?: string,
): Promise<number> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `INSERT INTO checks (input_type, input_value, summary, keywords, candidate_embedding, top_score, created_by)
     VALUES ($1,$2,$3,$4,$5::vector,$6,$7) RETURNING id`,
    [
      result.inputType,
      result.inputValue,
      result.summary,
      JSON.stringify(result.keywords),
      toVectorLiteral(embedding),
      result.topScore,
      createdBy ?? null,
    ],
  )) as any[];
  const checkId = Number(rows[0].id);

  let rank = 1;
  for (const m of result.matches) {
    await sql.query(
      `INSERT INTO check_matches
         (check_id, page_url, page_title, similarity, conflict_score, conflict_type, rationale, rank)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        checkId,
        m.url,
        m.title,
        m.similarity,
        m.conflictScore,
        m.conflictType,
        m.rationale,
        rank++,
      ],
    );
  }
  return checkId;
}
