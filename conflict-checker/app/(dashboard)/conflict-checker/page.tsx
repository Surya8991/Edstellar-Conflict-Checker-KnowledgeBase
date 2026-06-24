"use client";

import { useState } from "react";
import { PageHeader, Card, ConflictBadge, ScoreBar } from "@/app/components/ui";

interface Match {
  url: string;
  title: string | null;
  contentType: string | null;
  similarity: number;
  conflictScore: number;
  conflictType: string;
  rationale: string;
}
interface CheckResult {
  inputType: string;
  summary: string;
  keywords: string[];
  topScore: number;
  matches: Match[];
}

export default function ConflictCheckerPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
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

  return (
    <div>
      <PageHeader
        title="Conflict Checker"
        subtitle="Paste a URL or a topic. We summarize it, then score it against your existing pages (0–100%)."
      />
      <div className="p-8 space-y-6">
        <form onSubmit={run} className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://www.edstellar.com/blog/...  or  a topic like 'procurement management training'"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Checking…" : "Check"}
          </button>
        </form>

        {error && (
          <Card className="border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </Card>
        )}

        {result && (
          <>
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Summary{" "}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    ({result.inputType})
                  </span>
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  Highest conflict
                  <span className="font-semibold text-slate-900">
                    {result.topScore}%
                  </span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {result.summary || "—"}
              </p>
              {result.keywords?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Most similar existing pages ({result.matches.length})
              </h2>
              {result.matches.length === 0 ? (
                <Card className="text-sm text-slate-500">
                  No significant conflict found. This looks like net-new content.
                </Card>
              ) : (
                <div className="space-y-3">
                  {result.matches.map((m) => (
                    <Card key={m.url}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-sm font-medium text-slate-900 hover:underline"
                          >
                            {m.title || m.url}
                          </a>
                          <div className="truncate text-xs text-slate-400">
                            {m.url}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <ScoreBar score={m.conflictScore} />
                          <ConflictBadge type={m.conflictType} />
                        </div>
                      </div>
                      {m.rationale && (
                        <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                          {m.rationale}
                        </p>
                      )}
                      <div className="mt-2 text-xs text-slate-400">
                        vector similarity {(m.similarity * 100).toFixed(1)}%
                        {m.contentType ? ` · ${m.contentType}` : ""}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
