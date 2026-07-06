"use client";

import { useEffect, useState } from "react";
import {
  PageHeader, Card, TypeChip,
  INTENT_STYLE, ACTION_STYLE, pathOf,
  type Intent, type ClusterAction,
} from "@/app/components/ui";

interface GroupMember {
  url: string;
  title: string | null;
  type: string | null;
  intent: Intent;
  tokens: number | null;
  authority: number;
  isWinner: boolean;
}
interface GroupSummary {
  size: number;
  maxSimilarity: number;
  action: ClusterAction;
  winnerUrl: string;
  members: GroupMember[];
}
interface ClustersMeta {
  totalGroups: number;
  totalPairs: number;
  corpusSize: number;
  groupedPages: number;
  threshold: number;
}

export default function ClustersPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [meta, setMeta] = useState<ClustersMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groups?limit=200");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load clusters");
      setGroups(data.groups ?? []);
      setMeta({
        totalGroups: data.totalGroups ?? 0,
        totalPairs: data.totalPairs ?? 0,
        corpusSize: data.corpusSize ?? 0,
        groupedPages: data.groupedPages ?? 0,
        threshold: data.threshold ?? 0,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Prefill: run the scan automatically on first visit so the page isn't empty.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div>
      <PageHeader
        title="Content Clusters"
        subtitle="Every embedded corpus page (all content types) grouped by overlap — a live near-duplicate scan with a suggested action + winner per cluster."
        right={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Scanning…" : "Rescan"}
          </button>
        }
      />
      <div className="space-y-4 p-8">
        {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

        {loading && !groups && (
          <Card className="text-sm text-slate-500">Scanning the corpus for near-duplicate clusters…</Card>
        )}

        {meta && (
          <div className="text-xs text-slate-500">
            <strong className="text-slate-700">{meta.totalGroups.toLocaleString()}</strong> clusters ·{" "}
            <strong className="text-slate-700">{meta.groupedPages.toLocaleString()} of {meta.corpusSize.toLocaleString()}</strong>{" "}
            corpus pages grouped · {meta.totalPairs.toLocaleString()} pairs ≥ {(meta.threshold * 100).toFixed(0)}% similar.
          </div>
        )}

        {groups && groups.length > 0 && (
          <div className="space-y-2.5">
            {groups.map((g, i) => <ClusterCard key={`${g.winnerUrl}#${i}`} g={g} />)}
          </div>
        )}
        {groups && groups.length === 0 && !loading && (
          <Card className="text-sm text-slate-400">
            No clusters found — no pages are near-duplicates at the current threshold.
          </Card>
        )}
      </div>
    </div>
  );
}

function ClusterCard({ g }: { g: GroupSummary }) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLE[g.action] ?? ACTION_STYLE.differentiate;
  const shown = open ? g.members : g.members.slice(0, 4);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""} text-slate-400`}>▸</span>
        <span className="text-sm font-semibold text-slate-900">{g.size} pages</span>
        <span className="text-xs text-slate-500">· max {(g.maxSimilarity * 100).toFixed(0)}% similar</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.cls}`} title={style.hint}>
          {style.label}
        </span>
        <span className="ml-auto truncate text-xs text-slate-400" title={`Winner: ${g.winnerUrl}`}>
          winner: <span className="text-slate-600">{pathOf(g.winnerUrl)}</span>
        </span>
      </button>
      <ul className="border-t border-slate-100 px-3 py-2">
        {shown.map((m) => (
          <li key={m.url} className="flex items-center gap-2 py-1 text-xs">
            <span className={`w-3 shrink-0 text-center ${m.isWinner ? "text-amber-500" : "text-transparent"}`} title={m.isWinner ? "Suggested winner" : undefined}>★</span>
            {m.type && <TypeChip type={m.type} size="xs" />}
            <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${INTENT_STYLE[m.intent] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
              {(m.intent ?? "").slice(0, 4)}
            </span>
            <a href={m.url} target="_blank" rel="noreferrer" className={`truncate hover:underline ${m.isWinner ? "font-semibold text-slate-900" : "text-slate-600"}`} title={m.title || m.url}>
              {pathOf(m.url)}
            </a>
            <span className="ml-auto shrink-0 tabular-nums text-slate-400" title="content tokens (≈ words)">
              {(m.tokens ?? 0).toLocaleString()} tok
            </span>
          </li>
        ))}
        {!open && g.members.length > 4 && (
          <li>
            <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[11px] text-slate-500 hover:text-slate-700">
              + {g.members.length - 4} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
