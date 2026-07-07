/**
 * Pure matching logic for the Keyword Cannibalization AI Assistant (§18O).
 *
 * The user pastes a bulk list of URLs and/or keywords; this maps each one to the
 * conflict groups it appears in and tags which of the tool's tabs those groups
 * belong to (near-position / all / cross-type). The route feeds the result to
 * Groq for a written analysis. No I/O here so it's unit-testable.
 */
import { normalizeUrl } from "./cannibalization";

export type InputKind = "url" | "keyword";

/** Minimal shape the matcher needs from a conflict group (a superset of the
 *  stored `keyword_conflicts` row / the `/api/cannibalization` payload). */
export interface ConflictLike {
  query: string;
  positionGap: number;
  crossType: boolean;
  severity: string;
  totalClicks: number;
  totalImpressions: number;
  pages: { page: string; contentType?: string | null }[];
}

/** URL vs keyword: anything that looks like a link is a URL, else a keyword. */
export function classifyInput(raw: string): InputKind {
  const t = raw.trim().toLowerCase();
  if (/^https?:\/\//.test(t) || t.startsWith("www.") || t.includes(".com/") || t.includes("edstellar.com")) return "url";
  if (t.includes("/") && !t.includes(" ")) return "url"; // a bare path like /blog/foo
  return "keyword";
}

/** Split a pasted blob (newlines, commas) into clean, de-duped input lines. */
export function parseInputs(blob: string): string[] {
  return [...new Set(blob.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Which tabs a group shows up under. "all" always; the others conditionally. */
export function groupTabs(g: ConflictLike, nearGap: number): string[] {
  const tabs = ["all-keywords"];
  if (g.positionGap <= nearGap) tabs.push("near-position");
  if (g.crossType) tabs.push("cross-type");
  return tabs;
}

export interface AssistantMatch {
  input: string;
  kind: InputKind;
  /** Conflict groups this input participates in. */
  groups: ConflictLike[];
}

/**
 * For each input, find the conflict groups it's part of:
 *  - keyword → groups whose query equals or contains the keyword (both ways),
 *  - url     → groups where any competing page normalizes to the same URL.
 */
export function matchInputs(inputs: string[], groups: ConflictLike[], nearGap: number): AssistantMatch[] {
  // Pre-index for speed.
  const byPage = new Map<string, ConflictLike[]>();
  for (const g of groups) {
    for (const p of g.pages) {
      const key = normalizeUrl(p.page);
      const arr = byPage.get(key);
      if (arr) arr.push(g);
      else byPage.set(key, [g]);
    }
  }

  return inputs.map((input) => {
    const kind = classifyInput(input);
    let matched: ConflictLike[];
    if (kind === "url") {
      matched = byPage.get(normalizeUrl(input)) ?? [];
    } else {
      // Exact query, or a stored query that CONTAINS the pasted phrase (e.g.
      // "ai training" → "top ai training companies"). We deliberately do NOT
      // match when the pasted phrase merely contains a short stored query, or a
      // generic word like "training" would pull in hundreds of unrelated groups.
      const needle = input.trim().toLowerCase();
      matched = needle
        ? groups.filter((g) => {
            const q = g.query.toLowerCase();
            return q === needle || q.includes(needle);
          })
        : [];
    }
    // De-dupe (a url can hit the same group via variants) and sort by severity.
    const seen = new Set<string>();
    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const deduped = matched.filter((g) => (seen.has(g.query) ? false : (seen.add(g.query), true)));
    deduped.sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) || b.totalClicks - a.totalClicks);
    void groupTabs; // tabs are attached by the route when shaping the response
    return { input, kind, groups: deduped };
  });
}

/** Compact, token-cheap context block describing the matches for the LLM. */
export function buildLlmContext(matches: AssistantMatch[], nearGap: number): string {
  const lines: string[] = [];
  for (const m of matches) {
    if (!m.groups.length) {
      lines.push(`- ${m.kind} "${m.input}": no cannibalization conflict found.`);
      continue;
    }
    lines.push(`- ${m.kind} "${m.input}": ${m.groups.length} conflict(s):`);
    for (const g of m.groups.slice(0, 5)) {
      const tabs = groupTabs(g, nearGap).join("/");
      const pages = g.pages.map((p) => `${p.contentType ?? "?"} ${p.page} (${p.page})`).slice(0, 6);
      lines.push(
        `    • query "${g.query}" [${g.severity}, ${tabs}] gap ${g.positionGap.toFixed(1)}, ` +
          `${g.totalClicks} clicks / ${g.totalImpressions} impr across ${g.pages.length} pages: ${pages.join("; ")}`,
      );
    }
  }
  return lines.join("\n");
}
