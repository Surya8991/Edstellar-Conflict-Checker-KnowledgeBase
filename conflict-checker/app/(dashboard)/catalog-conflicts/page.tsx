"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, ScoreBar } from "@/app/components/ui";

interface Pair {
  a_url: string;
  a_title: string | null;
  a_type: string | null;
  b_url: string;
  b_title: string | null;
  b_type: string | null;
  similarity: number;
  pair_type: string;
}

export default function CatalogConflictsPage() {
  const [rows, setRows] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/catalog-conflicts?limit=200")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Catalog Conflicts"
        subtitle="Precomputed near-duplicate pairs across the existing catalogue (run npm run catalog-conflicts)."
      />
      <div className="space-y-3 p-8">
        {!loading && rows.length === 0 && (
          <Card className="text-sm text-slate-500">
            No precomputed conflicts yet. After ingesting the corpus, run{" "}
            <code>npm run catalog-conflicts</code> to build this report.
          </Card>
        )}
        {rows.map((p, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between gap-4">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                <PairSide url={p.a_url} title={p.a_title} type={p.a_type} />
                <PairSide url={p.b_url} title={p.b_title} type={p.b_type} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <ScoreBar score={Math.round(p.similarity * 100)} />
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {p.pair_type}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PairSide({
  url,
  title,
  type,
}: {
  url: string;
  title: string | null;
  type: string | null;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-sm font-medium text-slate-900 hover:underline"
      >
        {title || url}
      </a>
      <div className="truncate text-xs text-slate-400">
        {type ? `${type} · ` : ""}
        {url}
      </div>
    </div>
  );
}
