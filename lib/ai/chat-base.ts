import type {
  ChatProvider,
  ConflictMatchInput,
  ConflictVerdict,
  SummaryResult,
} from "./types";

/** Extract the first JSON object/array from a model response. */
export function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        /* fall through */
      }
    }
    return fallback;
  }
}

/**
 * Base chat provider implementing all higher-level methods in terms of a single
 * `complete(system, user)` primitive. Concrete adapters only implement that.
 */
export abstract class BaseChatProvider implements ChatProvider {
  abstract readonly name: string;
  protected abstract complete(system: string, user: string): Promise<string>;

  async summarize(input: {
    title?: string;
    content: string;
    isTopic: boolean;
  }): Promise<SummaryResult> {
    const system =
      "You are an SEO content analyst. Return ONLY compact JSON, no prose.";
    const user = input.isTopic
      ? `A content idea/topic is provided. Expand it into a search synopsis and extract keywords.
Topic: """${input.content.slice(0, 4000)}"""
Return JSON: {
  "summary": string (2-3 sentences),
  "keywords": string[] (5-10 short topical terms),
  "primaryQuery": string (4-8 words — the single most specific SEO query this content should rank for; longer / more long-tail than keywords[0], e.g. "workplace training strategies for hybrid teams" rather than "training"),
  "searchSynopsis": string (a dense 1-paragraph description of what this content would cover, for similarity search)
}`
      : `Summarize the following page for duplicate-content detection.
Title: ${input.title ?? "(none)"}
Content: """${input.content.slice(0, 9000)}"""
Return JSON: {
  "summary": string (3-4 sentences),
  "keywords": string[] (5-12 main topics/terms),
  "primaryQuery": string (4-8 words — the single most specific SEO query THIS page targets / should rank for; pull from the title/H1/body, NOT a generic head term. Example: "managed training services for enterprise" rather than "training"),
  "searchSynopsis": string (a dense 1-paragraph topical description for similarity search)
}`;

    const raw = await this.complete(system, user);
    const parsed = parseJson<Partial<SummaryResult>>(raw, {});
    return {
      summary: parsed.summary ?? "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      primaryQuery: typeof parsed.primaryQuery === "string" ? parsed.primaryQuery : undefined,
      searchSynopsis: parsed.searchSynopsis ?? parsed.summary ?? input.content.slice(0, 1000),
    };
  }

  async classifyConflicts(input: {
    candidateSummary: string;
    matches: ConflictMatchInput[];
  }): Promise<ConflictVerdict[]> {
    const system =
      "You detect SEO content conflicts between a proposed page and existing pages. Be specific — name the actual topics that overlap; never use generic phrases like 'both pages discuss similar topics'. Return ONLY JSON.";
    const list = input.matches
      .map(
        (m, i) =>
          `${i + 1}. url=${m.url} | similarity=${m.similarity.toFixed(3)} | title=${m.title ?? ""} | snippet="""${m.snippet.slice(0, 600)}"""`,
      )
      .join("\n");
    const user = `Proposed content: """${input.candidateSummary.slice(0, 3000)}"""

Existing candidate pages (with vector similarity 0..1):
${list}

For EACH page produce a verdict that is PERSONALISED — i.e. quote the actual shared topic/keyword/section, do not output generic boilerplate. Same rationale for two different matches is wrong.

conflictType ∈ "duplicate" (near-identical topic), "cannibalization" (same target keyword/intent, would compete in search), "partial-overlap" (some shared subtopics), "none".
conflictScore is 0-100 where 100 = fully redundant/identical. Weigh both the similarity number and the actual topical intent.

For each verdict:
  rationale  — ONE sentence, must name the existing page's title or topic explicitly (e.g. "The existing 'Managed Training Services' page already targets the same enterprise-outsourcing buyer.").
  overlap    — array of 2 to 4 SHORT, CONCRETE phrases that BOTH pages cover (sub-topics, keywords, section headings). Avoid filler like "training" or "the importance of"; prefer specific phrases like "enterprise procurement", "supplier ESG scoring".
  issue      — ONE blunt sentence stating the SEO/UX problem (e.g. "Splits ranking signals for 'managed training services'; consolidate or differentiate the buyer intent.").

Return JSON object: {"verdicts": [{"url": string, "conflictScore": number, "conflictType": string, "rationale": string, "overlap": string[], "issue": string}]}`;

    const raw = await this.complete(system, user);
    const parsed = parseJson<{ verdicts?: ConflictVerdict[] }>(raw, {});
    const arr = Array.isArray(parsed) ? parsed : parsed.verdicts;
    return Array.isArray(arr) ? arr : [];
  }

  async summarizeCompetitor(input: {
    topic: string;
    url: string;
    title?: string;
    content: string;
  }): Promise<{ summary: string; angle: string }> {
    const system = "You analyze competitor content. Return ONLY JSON.";
    const user = `Topic we plan to write about: "${input.topic}".
Competitor page: ${input.url}
Title: ${input.title ?? ""}
Content: """${input.content.slice(0, 6000)}"""
Return JSON: {"summary": string (2-3 sentences on what this competitor page covers), "angle": string (1 sentence on its unique angle / how to differentiate from it)}`;
    const raw = await this.complete(system, user);
    const parsed = parseJson<{ summary?: string; angle?: string }>(raw, {});
    return { summary: parsed.summary ?? "", angle: parsed.angle ?? "" };
  }
}
