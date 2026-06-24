export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface ConflictMatchInput {
  url: string;
  title: string | null;
  snippet: string;
  similarity: number; // cosine 0..1
}

export interface ConflictVerdict {
  url: string;
  conflictScore: number; // 0..100
  conflictType: "duplicate" | "cannibalization" | "partial-overlap" | "none";
  rationale: string;
}

export interface SummaryResult {
  summary: string;
  keywords: string[];
  searchSynopsis: string; // dense text used for embedding/search
}

export interface ChatProvider {
  readonly name: string;
  /** Summarize a URL/topic's content and extract keywords + a search synopsis. */
  summarize(input: {
    title?: string;
    content: string;
    isTopic: boolean;
  }): Promise<SummaryResult>;
  /** Judge candidate vs. the shortlisted existing pages, returning per-page verdicts. */
  classifyConflicts(input: {
    candidateSummary: string;
    matches: ConflictMatchInput[];
  }): Promise<ConflictVerdict[]>;
  /** Summarize a competitor page for the research view. */
  summarizeCompetitor(input: {
    topic: string;
    url: string;
    title?: string;
    content: string;
  }): Promise<{ summary: string; angle: string }>;
}
