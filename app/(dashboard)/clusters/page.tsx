"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** IDF-weighted distinctive-topic-token overlap with the cluster seed. */
  matchSim: number;
  /** Body cosine vs the seed (null for the seed itself). */
  bodySim: number | null;
  /** Distinctive topic tokens shared with the seed - the "why grouped" tags. */
  sharedTerms: string[];
  isWinner: boolean;
  isSeed: boolean;
}
interface GroupSummary {
  size: number;
  /** Topic label - the seed's distinctive tokens, e.g. "big data". */
  label: string;
  seedUrl: string;
  action: ClusterAction;
  winnerUrl: string;
  maxBodySim: number;
  members: GroupMember[];
}
interface ClustersMeta {
  totalGroups: number;
  corpusSize: number;
  groupedPages: number;
  singletonCount: number;
  overlap: number;
}

export default function ClustersPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [meta, setMeta] = useState<ClustersMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters.
  const [actionFilter, setActionFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [q, setQ] = useState("");
  // Search intent is hidden by default (clusters are about topic, not intent);
  // opt in with the checkbox to surface the per-member intent badge.
  const [showIntent, setShowIntent] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // 500 is the API's own hard cap (app/api/groups/route.ts) - request it
      // directly rather than an arbitrary lower number so "N clusters" in the
      // meta line always matches what's actually rendered below it.
      const res = await fetch("/api/groups?limit=500");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load clusters");
      setGroups(data.groups ?? []);
      setMeta({
        totalGroups: data.totalGroups ?? 0,
        corpusSize: data.corpusSize ?? 0,
        groupedPages: data.groupedPages ?? 0,
        singletonCount: data.singletonCount ?? 0,
        overlap: data.overlap ?? 0,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Prefill: run the scan automatically on first visit so the page isn't empty.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const actionTypes = useMemo(
    () => Array.from(new Set((groups ?? []).map((g) => g.action))).sort(),
    [groups],
  );
  const contentTypes = useMemo(
    () => Array.from(new Set((groups ?? []).map((g) => g.members[0]?.type).filter(Boolean) as string[])).sort(),
    [groups],
  );

  const filtered = useMemo(() => {
    if (!groups) return null;
    const needle = q.trim().toLowerCase();
    return groups
      .filter((g) => !actionFilter || g.action === actionFilter)
      .filter((g) => !typeFilter || g.members[0]?.type === typeFilter)
      .filter((g) =>
        !needle ||
        g.members.some((m) =>
          m.url.toLowerCase().includes(needle) || (m.title ?? "").toLowerCase().includes(needle),
        ),
      );
  }, [groups, actionFilter, typeFilter, q]);

  return (
    <div>
      <PageHeader
        title="Content Clusters"
        subtitle="Corpus pages grouped by TOPIC across content types - a category page, its blog, and its courses land in one cluster. Distinctive topic tokens (template words auto-learned & dropped) decide membership; each cluster gets a suggested action + winner."
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
            <strong className="text-slate-700">{meta.totalGroups.toLocaleString()}</strong> topic clusters ·{" "}
            <strong className="text-slate-700">{meta.groupedPages.toLocaleString()} of {meta.corpusSize.toLocaleString()}</strong>{" "}
            live corpus pages clustered · {meta.singletonCount.toLocaleString()} unique-topic pages.
            {groups && meta.totalGroups > groups.length && (
              <span className="ml-1 font-medium text-amber-700">
                {" "}Showing the largest {groups.length.toLocaleString()} - {(meta.totalGroups - groups.length).toLocaleString()} smaller clusters aren't listed.
              </span>
            )}
          </div>
        )}

        {/* Filter bar - action pills, content-type pills, text search. */}
        {groups && groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              <FilterPill label={`All ${groups.length}`} active={!actionFilter} onClick={() => setActionFilter("")} />
              {actionTypes.map((a) => (
                <FilterPill
                  key={a}
                  label={`${ACTION_STYLE[a]?.label ?? a} ${groups.filter((g) => g.action === a).length}`}
                  active={actionFilter === a}
                  onClick={() => setActionFilter(actionFilter === a ? "" : a)}
                />
              ))}
            </div>
            <span className="h-4 w-px bg-slate-200" />
            <div className="flex flex-wrap gap-1.5">
              {contentTypes.map((ct) => (
                <FilterPill
                  key={ct}
                  label={`${ct.replace("-", " ")} ${groups.filter((g) => g.members[0]?.type === ct).length}`}
                  active={typeFilter === ct}
                  onClick={() => setTypeFilter(typeFilter === ct ? "" : ct)}
                />
              ))}
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showIntent}
                onChange={(e) => setShowIntent(e.target.checked)}
              />
              show intent
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by title or URL…"
              className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-slate-900"
            />
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="space-y-2.5">
            {filtered.map((g, i) => <ClusterCard key={`${g.winnerUrl}#${i}`} g={g} showIntent={showIntent} />)}
          </div>
        )}
        {filtered && filtered.length === 0 && !loading && (
          <Card className="text-sm text-slate-400">
            {groups && groups.length > 0
              ? "No clusters match the active filters."
              : "No clusters found - no pages are near-duplicates at the current thresholds."}
          </Card>
        )}
      </div>
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs capitalize transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

function ClusterCard({ g, showIntent }: { g: GroupSummary; showIntent: boolean }) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLE[g.action] ?? ACTION_STYLE.differentiate;
  const shown = open ? g.members : g.members.slice(0, 4);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-left hover:bg-slate-50"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""} text-slate-400`}>▸</span>
        <span className="text-sm font-semibold text-slate-900">{g.size} pages</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.cls}`} title={style.hint}>
          {style.label}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600"
          title={`Topic: ${g.label} - pillar: ${pathOf(g.seedUrl)}`}
        >
          topic: <span className="text-slate-800">{g.label}</span>
        </span>
        <span className="ml-auto shrink-0 truncate text-xs text-slate-400" title={`Winner: ${g.winnerUrl}`}>
          winner: <span className="text-slate-600">{pathOf(g.winnerUrl)}</span>
        </span>
      </button>
      <ul className="divide-y divide-slate-50 border-t border-slate-100 px-4 py-1">
        {shown.map((m) => (
          <li key={m.url} className="flex items-start gap-2.5 py-2 text-sm">
            <span
              className={`mt-0.5 w-3 shrink-0 text-center ${m.isWinner ? "text-amber-500" : "text-transparent"}`}
              title={m.isWinner ? "Suggested winner" : undefined}
            >
              ★
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`truncate hover:underline ${m.isWinner ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}
                  title={m.title || m.url}
                >
                  {m.title || pathOf(m.url)}
                </a>
                {showIntent && (
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${INTENT_STYLE[m.intent] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {m.intent ?? "unknown"}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                {m.type && <TypeChip type={m.type} size="xs" />}
                <span className="truncate">{m.url}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className="tabular-nums text-xs font-medium text-slate-500"
                title="IDF-weighted distinctive-topic-token overlap with the cluster pillar (seed)"
              >
                {m.isSeed ? "pillar" : `${(m.matchSim * 100).toFixed(0)}% topic`}
              </span>
              {!m.isSeed && m.bodySim != null && (
                <span className="tabular-nums text-[10px] text-slate-400" title="Body cosine vs the pillar">
                  {(m.bodySim * 100).toFixed(0)}% body
                </span>
              )}
              {m.sharedTerms.length > 0 && (
                <span className="flex flex-wrap justify-end gap-1" title="Distinctive topic tokens shared with the pillar">
                  {m.sharedTerms.slice(0, 4).map((term) => (
                    <span key={term} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                      {term}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </li>
        ))}
        {!open && g.members.length > 4 && (
          <li className="py-1.5">
            <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-slate-500 hover:text-slate-700">
              + {g.members.length - 4} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
