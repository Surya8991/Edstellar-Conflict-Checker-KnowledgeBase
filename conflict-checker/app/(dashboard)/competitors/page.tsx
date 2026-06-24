"use client";

import { useState } from "react";
import { PageHeader, Card } from "@/app/components/ui";

interface CompetitorResult {
  url: string;
  title: string;
  domain: string;
  summary: string;
  angle: string;
  isKnownCompetitor: boolean;
}

export default function CompetitorsPage() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompetitorResult[]>([]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResults(data.results ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Competitor Research"
        subtitle="See who ranks for a topic and how Edstellar's content can differentiate."
      />
      <div className="space-y-6 p-8">
        <form onSubmit={run} className="flex gap-3">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. procurement management training"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Researching…" : "Research"}
          </button>
        </form>

        {error && (
          <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
            {error}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {results.map((r) => (
            <Card key={r.url}>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-semibold text-slate-900 hover:underline"
                >
                  {r.title || r.domain}
                </a>
                {r.isKnownCompetitor && (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    known competitor
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-slate-400">{r.domain}</div>
              <p className="mt-3 text-sm text-slate-700">{r.summary}</p>
              {r.angle && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Differentiate: </span>
                  {r.angle}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
