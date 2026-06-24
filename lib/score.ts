import type { ConflictVerdict } from "@/lib/ai/types";

/**
 * Map a cosine similarity (0..1) to a base conflict score (0..100).
 * Topical similarity below ~0.55 is usually noise for sentence embeddings, so we
 * stretch the meaningful band (0.55..0.95) across most of the 0..100 range.
 */
export function similarityToBaseScore(sim: number): number {
  const lo = 0.55;
  const hi = 0.95;
  const clamped = Math.max(lo, Math.min(hi, sim));
  const pct = ((clamped - lo) / (hi - lo)) * 100;
  return Math.round(pct);
}

/**
 * Blend the embedding-derived base score with the LLM's judgment.
 * The LLM is authoritative on intent, but we keep the vector signal so a model
 * hallucination can't wildly diverge from measured similarity.
 */
export function blendScore(base: number, llmScore: number | undefined): number {
  if (llmScore == null || Number.isNaN(llmScore)) return base;
  const clampedLlm = Math.max(0, Math.min(100, llmScore));
  return Math.round(0.4 * base + 0.6 * clampedLlm);
}

export function conflictTypeFromScore(score: number): ConflictVerdict["conflictType"] {
  if (score >= 80) return "duplicate";
  if (score >= 60) return "cannibalization";
  if (score >= 35) return "partial-overlap";
  return "none";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#dc2626"; // red
  if (score >= 60) return "#ea580c"; // orange
  if (score >= 35) return "#ca8a04"; // amber
  return "#16a34a"; // green
}
