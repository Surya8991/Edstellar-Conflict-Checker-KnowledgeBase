"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/app/components/ui";

interface PageRow {
  id: number;
  url: string;
  title: string | null;
  content_type: string | null;
  course_type: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  lastmod: string | null;
  embedded: boolean;
}

interface ByType { content_type: string; n: number }

const TYPE_COLORS: Record<string, string> = {
  course:      "bg-indigo-100 text-indigo-700",
  blog:        "bg-emerald-100 text-emerald-700",
  category:    "bg-amber-100 text-amber-700",
  subcategory: "bg-orange-100 text-orange-700",
  industry:    "bg-sky-100 text-sky-700",
  location:    "bg-fuchsia-100 text-fuchsia-700",
  home:        "bg-slate-200 text-slate-700",
  static:      "bg-slate-100 text-slate-600",
};

export default function CorpusPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [rows, setRows] = useState<PageRow[]>([]);
  const [byType, setByType] = useState<ByType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const url = `/api/pages?q=${encodeURIComponent(q)}&type=${type}&tag=${encodeURIComponent(tag)}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setByType(data.byType ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tag]);

  const totalAll = byType.reduce((s, x) => s + x.n, 0);

  return (
    <div>
      <PageHeader
        title="Corpus"
        subtitle="The existing-content index every check is compared against — categorised from the Edstellar catalog."
        right={
          <span className="text-sm text-slate-500">
            {total.toLocaleString()} / {totalAll.toLocaleString()} pages
          </span>
        }
      />
      <div className="space-y-5 p-8">
        {/* Breakdown by content_type */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <BreakdownCard label="all" n={totalAll} active={type === ""} onClick={() => { setType(""); setTag(""); }} />
          {byType.map((b) => (
            <BreakdownCard
              key={b.content_type}
              label={b.content_type}
              n={b.n}
              active={type === b.content_type}
              onClick={() => { setType(type === b.content_type ? "" : b.content_type); setTag(""); }}
              colorClass={TYPE_COLORS[b.content_type]}
            />
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or URL…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-900"
          />
          {tag && (
            <button
              type="button"
              onClick={() => setTag("")}
              className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-700"
            >
              tag: <strong>{tag}</strong> ×
            </button>
          )}
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-medium text-white"
          >
            Search
          </button>
        </form>

        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Modified</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-900 hover:underline"
                    >
                      {r.title || r.url}
                    </a>
                    {!r.embedded && (
                      <span className="ml-2 text-xs text-amber-600">not embedded</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.content_type && (
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[r.content_type] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {r.content_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    <div>{r.category || <span className="text-slate-300">—</span>}</div>
                    {r.subcategory && <div className="text-xs text-slate-400">{r.subcategory}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(r.tags ?? []).slice(0, 4).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTag(t)}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                          title="Filter by this tag"
                        >
                          {t}
                        </button>
                      ))}
                      {r.tags && r.tags.length > 4 && (
                        <span className="px-1 py-0.5 text-xs text-slate-400">+{r.tags.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.lastmod}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No pages. Run <code>npm run ingest</code> to populate the corpus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function BreakdownCard({
  label, n, active, onClick, colorClass,
}: {
  label: string; n: number; active: boolean; onClick: () => void; colorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      <div className={`text-xs font-medium capitalize ${active ? "" : colorClass ?? "text-slate-500"} ${active ? "text-white" : ""}`}>
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</div>
    </button>
  );
}
