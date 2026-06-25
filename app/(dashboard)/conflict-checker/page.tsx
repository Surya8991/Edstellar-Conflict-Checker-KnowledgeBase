"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, ConflictBadge, ScoreBar, TypeChip, TYPE_COLORS } from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";

interface Match {
  url: string;
  title: string | null;
  contentType: string | null;
  similarity: number;
  conflictScore: number;
  conflictType: string;
  rationale: string;
  overlap?: string[];
  issue?: string;
}
interface CheckResult {
  inputType: string;
  inputValue: string;
  summary: string;
  keywords: string[];
  primaryQuery?: string;
  topScore: number;
  matches: Match[];
}

interface PageStat {
  url: string;
  m6:  { clicks: number; impressions: number; ctr: number; position: number };
  m12: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  potentialQueries?: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
}
interface EnrichData {
  stats: PageStat[];
  serp: any;
  gap: string[];
  ourRank?: any;
  gscError?: string;
}

/** Derive the primary keyword used for the SERP lookup.
 *  Priority:
 *   1. URL slug (blogs/courses/categories/topics — slug IS the primary keyword)
 *   2. The topic the user typed (for topic inputs)
 *   3. LLM keywords[0] (short head term)
 *   4. LLM primaryQuery (long-tail, last resort)
 */
function pickSerpQuery(result: CheckResult): string {
  if (result.inputType === "url") {
    try {
      const path = new URL(result.inputValue).pathname.toLowerCase().replace(/\/$/, "");
      const m = path.match(/^\/(?:blog|course|category|topic|topics)\/(.+)$/);
      if (m) return m[1].replace(/-/g, " ");
    } catch {/* fall through */}
  } else if (result.inputValue?.trim()) {
    return result.inputValue.trim();
  }
  return result.keywords?.[0] || result.primaryQuery || result.inputValue;
}

export default function ConflictCheckerPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  // Enrichment is lazy: we kick it off after a check completes.
  const [enrich, setEnrich] = useState<EnrichData | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Filters for the match list.
  const [scoreMin, setScoreMin] = useState(80);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"score" | "similarity">("score");

  // Pagination — needed because runs can return 100+ matches.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [hideNeedsReview, setHideNeedsReview] = useState(false);

  // Lazy on-demand explanation cache: { [url]: {score, type, rationale, loading?} }
  const [explained, setExplained] = useState<Record<string, any>>({});

  // Deep-scan control — how many corpus candidates the vector search retrieves.
  // (Server-side similarity threshold stays at 0 here; the Min score slider
  //  in the filter row is the single user-facing cut-off.)
  const [vectorLimit, setVectorLimit] = useState(100);

  // New-content suggestions panel (on-demand).
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<any>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true); setError(null); setResult(null); setEnrich(null); setSuggestions(null);
    setExplained({}); setPage(1);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, vectorLimit, minSimilarity: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Lazy: ask the LLM to explain a single match that the initial run skipped.
  async function explain(url: string, title: string | null, similarity: number) {
    if (!result || explained[url]?.loading) return;
    setExplained((e) => ({ ...e, [url]: { ...(e[url] ?? {}), loading: true } }));
    try {
      const res = await fetch("/api/check/classify-one", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url, title, similarity,
          candidateSummary: `${result.summary}\nKeywords: ${result.keywords.join(", ")}`,
        }),
      });
      const json = await res.json();
      setExplained((e) => ({ ...e, [url]: { ...json, loading: false } }));
    } catch (err) {
      setExplained((e) => ({ ...e, [url]: { error: (err as Error).message, loading: false } }));
    }
  }

  // Auto-enrich once we have matches.
  useEffect(() => {
    if (!result || !result.matches.length) return;
    let cancelled = false;
    (async () => {
      setEnriching(true);
      try {
        const urls = result.matches.slice(0, 8).map((m) => m.url);
        const serpTopic = pickSerpQuery(result);
        const res = await fetch("/api/check/enrich", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            urls,
            topic: serpTopic,
            withSerp: true,
          }),
        });
        const data = await res.json();
        if (!cancelled) setEnrich(data);
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();
    return () => { cancelled = true };
  }, [result]);

  async function fetchSuggestions() {
    if (!result) return;
    setSuggesting(true);
    try {
      const suggestTopic =
        result.primaryQuery ||
        (result.inputType === "topic" ? result.inputValue : null) ||
        result.keywords?.[0] ||
        result.inputValue;
      const res = await fetch("/api/suggestions/new-content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: suggestTopic,
          url: result.inputType === "url" ? result.inputValue : undefined,
        }),
      });
      setSuggestions(await res.json());
    } finally {
      setSuggesting(false);
    }
  }

  // Merge in lazily-fetched explanations.
  const mergedMatches = (result?.matches ?? []).map((m) => {
    const ex = explained[m.url];
    if (!ex || ex.loading || ex.error) return m;
    return {
      ...m,
      conflictScore: ex.conflictScore ?? m.conflictScore,
      conflictType:  ex.conflictType  ?? m.conflictType,
      rationale:     ex.rationale     ?? m.rationale,
      overlap:       ex.overlap       ?? m.overlap,
      issue:         ex.issue         ?? m.issue,
    };
  });

  // Apply filters / sort to the match list.
  const filtered = mergedMatches
    .filter((m) => m.conflictScore >= scoreMin)
    .filter((m) => !typeFilter || m.contentType === typeFilter)
    .filter((m) => !hideNeedsReview || m.conflictType !== "needs-review")
    .slice()
    .sort((a, b) =>
      sortBy === "score" ? b.conflictScore - a.conflictScore : b.similarity - a.similarity,
    );

  // Reset page when filters change.
  useEffect(() => { setPage(1) }, [scoreMin, typeFilter, sortBy, hideNeedsReview]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Distinct content types present in current matches (for the chip filter).
  const typesInResult = Array.from(
    new Set(result?.matches.map((m) => m.contentType).filter(Boolean) as string[]),
  );

  // How many got LLM rationale vs needs-review.
  const explainedCount = mergedMatches.filter((m) => m.conflictType !== "needs-review").length;
  const reviewCount    = mergedMatches.filter((m) => m.conflictType === "needs-review").length;

  const statByUrl = new Map<string, PageStat>();
  for (const s of enrich?.stats ?? []) statByUrl.set(s.url, s);

  return (
    <div>
      <PageHeader
        title="Conflict Checker"
        subtitle="Paste a URL or a topic. We summarize it, score it (0–100%), and enrich each match with GSC + competitor data."
      />
      <div className="p-8 space-y-6">
        <form onSubmit={run} className="space-y-3">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://www.edstellar.com/blog/...  or  a topic like 'procurement management training'"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
            />
            <button type="submit" disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {loading ? "Checking…" : "Check"}
            </button>
          </div>
          {/* Deep-scan control */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <label className="flex items-center gap-2">
              Scan
              <select value={vectorLimit} onChange={(e) => setVectorLimit(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                {[25, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} candidates</option>)}
              </select>
            </label>
            <span className="text-slate-400">
              More candidates = wider search. Use the <strong>Min score</strong> filter below to cut noise.
            </span>
          </div>
        </form>

        {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

        {result && (
          <>
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Summary <span className="ml-1 text-xs font-normal text-slate-400">({result.inputType})</span>
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  Highest conflict
                  <span className="font-semibold text-slate-900">{result.topScore}%</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">{result.summary || "—"}</p>
              {result.primaryQuery && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Primary SEO query</span>
                  <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {result.primaryQuery}
                  </span>
                </div>
              )}
              {result.keywords?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.keywords.map((k) => (
                    <span key={k} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{k}</span>
                  ))}
                </div>
              )}
            </Card>

            {/* Competitor SERP + AI Overview + GSC rank + keyword gap.
                Sits right under the Summary so the user sees external
                context before drilling into matches. */}
            {enrich && enrich.serp && enrich.serp.organic && (
              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Competitor SERP for "{enrich.serp.topic}"
                  </h3>
                  {enrich.serp.edstellarRank
                    ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Edstellar #{enrich.serp.edstellarRank} on Google</span>
                    : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Edstellar not in top 10</span>}
                </div>

                {/* Our GSC rank for this exact keyword (from Search Console, not SERP scrape) */}
                {enrich.ourRank && enrich.ourRank.impressions6m > 0 && (
                  <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Your GSC rank for this keyword:</span>{" "}
                    pos <span className="tabular-nums font-medium">{enrich.ourRank.position6m.toFixed(1)}</span>{" "}
                    · <span className="tabular-nums">{enrich.ourRank.clicks6m}</span> clk
                    · <span className="tabular-nums">{enrich.ourRank.impressions6m.toLocaleString()}</span> impr <span className="text-slate-400">(6m)</span>
                    {enrich.ourRank.topPage?.url && (
                      <>
                        {" "}—{" "}
                        <a href={enrich.ourRank.topPage.url} target="_blank" rel="noreferrer" className="text-slate-600 underline-offset-2 hover:underline">
                          {(() => { try { return new URL(enrich.ourRank.topPage.url).pathname } catch { return enrich.ourRank.topPage.url } })()}
                        </a>
                      </>
                    )}
                  </div>
                )}

                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Domain</th>
                    <th className="py-2 font-medium">Title</th>
                  </tr></thead>
                  <tbody>
                    {enrich.serp.organic.slice(0, 8).map((r: any) => (
                      <tr key={r.rank} className={`border-b border-slate-100 ${r.isEdstellar ? "bg-emerald-50" : ""}`}>
                        <td className="py-2 pr-3 tabular-nums">{r.rank}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {r.domain}
                          {r.isKnown && <span className="ml-1 rounded bg-indigo-100 px-1 py-0.5 text-[10px] text-indigo-700">known</span>}
                          {r.isEdstellar && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-700">you</span>}
                        </td>
                        <td className="max-w-md truncate py-2"><a href={r.url} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">{r.title}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* AI Overview citations — Google's AI summary panel */}
                {enrich.serp.aiOverview ? (
                  <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                        <span>✨ AI Overview cites</span>
                        <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold normal-case text-violet-700">Google SGE</span>
                      </div>
                      {enrich.serp.aiOverview.edstellarCited
                        ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Edstellar cited ✓</span>
                        : <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Edstellar not cited</span>}
                    </div>
                    {enrich.serp.aiOverview.summary && (
                      <p className="mb-2 text-xs leading-relaxed text-violet-900">{enrich.serp.aiOverview.summary.slice(0, 320)}{enrich.serp.aiOverview.summary.length > 320 ? "…" : ""}</p>
                    )}
                    {enrich.serp.aiOverview.citations?.length > 0 && (
                      <ol className="space-y-1 text-xs">
                        {enrich.serp.aiOverview.citations.slice(0, 8).map((c: any, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="shrink-0 tabular-nums text-violet-500">{i + 1}.</span>
                            <a href={c.url} target="_blank" rel="noreferrer"
                              className={`truncate hover:underline ${c.isEdstellar ? "font-semibold text-emerald-700" : "text-slate-700"}`}>
                              {c.domain}
                              {c.isKnown && <span className="ml-1 rounded bg-indigo-100 px-1 py-0.5 text-[9px] text-indigo-700">known</span>}
                              {c.isEdstellar && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] text-emerald-700">you</span>}
                              {" — "}
                              <span className="text-slate-500">{c.title}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No AI Overview appeared on Google for this query.
                  </div>
                )}

                {enrich.gap?.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Keyword gap (mentioned by competitors, not in your top queries)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {enrich.gap.map((k) => (
                        <span key={k} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Filters — visible when there's anything to filter */}
            {result.matches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Type:</span>
                <button
                  onClick={() => setTypeFilter("")}
                  className={`rounded px-2 py-1 ${typeFilter === "" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
                >all</button>
                {typesInResult.map((t) => {
                  const active = typeFilter === t;
                  const colorClass = TYPE_COLORS[t] ?? "bg-slate-100 text-slate-600";
                  return (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(active ? "" : t)}
                      className={`rounded px-2 py-1 capitalize ${
                        active
                          ? "bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1"
                          : `${colorClass} hover:opacity-80`
                      }`}
                    >
                      {t.replace("-", " ")}
                    </button>
                  );
                })}
                <span className="ml-2 text-slate-500">Min score:</span>
                <input type="range" min={0} max={100} value={scoreMin} onChange={(e) => setScoreMin(Number(e.target.value))} className="w-32" />
                <span className="w-10 tabular-nums text-slate-600">{scoreMin}%</span>
                <label className="ml-2 flex items-center gap-1 text-slate-600">
                  <input type="checkbox" checked={hideNeedsReview} onChange={(e) => setHideNeedsReview(e.target.checked)} />
                  hide needs-review
                </label>
                <span className="ml-2 text-slate-500">Sort:</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded border border-slate-300 bg-white px-2 py-1">
                  <option value="score">by score</option>
                  <option value="similarity">by similarity</option>
                </select>
                <span className="ml-auto text-slate-400">{filtered.length} of {result.matches.length}</span>
              </div>
            )}

            <div>
              <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold text-slate-900">
                <span>{filtered.length} pages with conflict ≥ {scoreMin}%</span>
                <span className="text-xs font-normal text-slate-500">
                  · of {result.matches.length} total · {explainedCount} explained by LLM · {reviewCount} pending (click "Explain")
                </span>
                {enriching && (
                  <span className="text-xs font-normal text-slate-400">· fetching GSC + competitor data…</span>
                )}
              </h2>
              {filtered.length === 0 ? (
                <Card className="text-sm text-slate-500">
                  No matches at current filter. Try lowering Min score or Min similarity.
                </Card>
              ) : (
                <>
                  <div className="space-y-3">
                    {paginated.map((m) => (
                      <MatchCard
                        key={m.url}
                        m={m}
                        stat={statByUrl.get(m.url)}
                        explainState={explained[m.url]}
                        onExplain={() => explain(m.url, m.title, m.similarity)}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <Pagination
                      page={page}
                      pageSize={pageSize}
                      total={filtered.length}
                      onJump={setPage}
                      onPageSize={setPageSize}
                      pageSizes={[10, 25, 50, 100]}
                      unit="matches"
                    />
                  </div>
                </>
              )}
            </div>

            {/* New-content suggestions trigger */}
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Net-new content suggestions</h3>
                  <p className="text-xs text-slate-500">LLM proposes angles based on competitors, AI Overview, recent Google updates, and AI platforms.</p>
                </div>
                <button onClick={fetchSuggestions} disabled={suggesting}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {suggesting ? "Thinking…" : suggestions ? "Re-run" : "Suggest"}
                </button>
              </div>
              {suggestions?.suggestions?.headline && (
                <p className="mt-4 text-sm font-medium text-slate-800">{suggestions.suggestions.headline}</p>
              )}
              {suggestions?.suggestions?.angles?.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {suggestions.suggestions.angles.map((a: any, i: number) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-slate-900">{a.title}</div>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-600">{a.format}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Audience: {a.audience}</div>
                      <div className="text-xs text-slate-500">Keyword: <span className="font-mono">{a.primaryKeyword}</span></div>
                      <p className="mt-2 text-xs text-slate-600">{a.differentiation}</p>
                      {a.trigger && <span className="mt-2 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] capitalize text-indigo-700">{a.trigger.replace("-", " ")}</span>}
                    </div>
                  ))}
                </div>
              )}
              {suggestions && !suggestions?.suggestions?.angles?.length && !suggestions?.error && (
                <p className="mt-3 text-xs text-slate-500">No angles returned — the LLM response wasn't parseable. Try Re-run.</p>
              )}
              {suggestions?.error && <div className="mt-3 text-sm text-red-600">{suggestions.error}</div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function KeywordList({
  label,
  badge,
  accent,
  empty,
  rows,
  showClicks,
}: {
  label: string;
  badge?: string;
  accent: "slate" | "emerald";
  empty: string;
  rows: { query: string; clicks: number; impressions: number; position: number }[];
  showClicks?: boolean;
}) {
  const headerColor = accent === "emerald" ? "text-emerald-700" : "text-slate-500";
  const metricColor = accent === "emerald" ? "text-emerald-700" : "text-slate-500";
  const badgeColor =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${headerColor}`}>
        <span>{label}</span>
        {badge && (
          <span className={`rounded px-1 py-0.5 text-[9px] font-bold normal-case ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400">{empty}</div>
      ) : (
        <ul className="divide-y divide-slate-100 text-xs">
          {rows.map((q) => (
            <li
              key={q.query}
              className="grid grid-cols-1 gap-x-3 py-1 sm:grid-cols-[1fr_auto] sm:items-baseline"
            >
              <span className="break-words text-slate-700">{q.query}</span>
              <span className={`tabular-nums text-[11px] ${metricColor}`}>
                pos {q.position.toFixed(1)}
                {showClicks ? ` · ${q.clicks} clk` : ""}
                {" · "}
                {q.impressions.toLocaleString()} impr
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchCard({
  m, stat, explainState, onExplain,
}: {
  m: Match;
  stat?: PageStat;
  explainState?: { loading?: boolean; error?: string; rationale?: string };
  onExplain?: () => void;
}) {
  const needsReview = m.conflictType === "needs-review";
  const [open, setOpen] = useState(false);
  const hasRationale = !!m.rationale;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TypeChip type={m.contentType} />
            <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-slate-900 hover:underline">
              {m.title || m.url}
            </a>
          </div>
          <div className="mt-1 truncate text-xs text-slate-400">{m.url}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ScoreBar score={m.conflictScore} />
          <ConflictBadge type={m.conflictType} />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-400">
        vector similarity {(m.similarity * 100).toFixed(1)}%
      </div>

      {/* GSC enrichment — two columns: compact stats on the left, keyword
          lists stacked on the right so long queries can wrap without
          clipping the position/impressions metrics.                       */}
      {stat && (
        <div className="mt-3 grid grid-cols-1 gap-5 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(180px,220px)_1fr]">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">GSC performance</div>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400">
                <th className="text-left font-medium"></th>
                <th className="px-2 text-right font-medium">6m</th>
                <th className="text-right font-medium">12m</th>
              </tr></thead>
              <tbody className="text-slate-700">
                <tr><td className="py-0.5">Clicks</td><td className="px-2 py-0.5 text-right tabular-nums font-medium">{stat.m6.clicks}</td><td className="py-0.5 text-right tabular-nums font-medium">{stat.m12.clicks}</td></tr>
                <tr><td className="py-0.5">Impr</td><td className="px-2 py-0.5 text-right tabular-nums">{stat.m6.impressions.toLocaleString()}</td><td className="py-0.5 text-right tabular-nums">{stat.m12.impressions.toLocaleString()}</td></tr>
                <tr><td className="py-0.5">CTR</td><td className="px-2 py-0.5 text-right tabular-nums">{(stat.m6.ctr*100).toFixed(2)}%</td><td className="py-0.5 text-right tabular-nums">{(stat.m12.ctr*100).toFixed(2)}%</td></tr>
                <tr><td className="py-0.5">Avg pos</td><td className="px-2 py-0.5 text-right tabular-nums">{stat.m6.position.toFixed(1)}</td><td className="py-0.5 text-right tabular-nums">{stat.m12.position.toFixed(1)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <KeywordList
              label="Top ranking keywords"
              accent="slate"
              empty="No GSC data for this URL."
              rows={stat.topQueries}
              showClicks
            />
            <KeywordList
              label="Potential ranking keywords"
              badge="pos 11–30"
              accent="emerald"
              empty="No striking-distance opportunities yet."
              rows={stat.potentialQueries ?? []}
            />
          </div>
        </div>
      )}

      {/* Collapsible personalised summary — at the bottom so stats stay above the fold. */}
      {hasRationale ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            aria-expanded={open}
          >
            <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            {open ? "Hide details" : "Show why this conflicts"}
          </button>
          {open && (
            <div className="mt-3 space-y-3">
              {m.overlap && m.overlap.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Both pages cover
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.overlap.map((o) => (
                      <span
                        key={o}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {m.issue && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                  <span className="mt-0.5 text-xs font-bold text-rose-600">⚠</span>
                  <p className="text-sm leading-snug text-rose-800">{m.issue}</p>
                </div>
              )}
              {m.rationale && (
                <p className="text-sm leading-relaxed text-slate-600">{m.rationale}</p>
              )}
            </div>
          )}
        </div>
      ) : needsReview ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {explainState?.error ? (
            <div className="text-xs text-red-600">{explainState.error}</div>
          ) : (
            <button
              onClick={onExplain}
              disabled={explainState?.loading}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {explainState?.loading ? "Asking LLM…" : "Explain this match"}
            </button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
