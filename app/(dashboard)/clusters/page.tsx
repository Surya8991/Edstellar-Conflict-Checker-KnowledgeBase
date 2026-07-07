"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PageHeader, Card, TypeChip,
  INTENT_STYLE, ACTION_STYLE, pathOf,
  type Intent, type ClusterAction,
} from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";
import {
  FilterBar, FilterRow, SearchBox, FilterGroup, FilterChip, FilterSelect, ClearFiltersButton, ToggleChip, dotColor,
} from "@/app/components/Filters";

interface GscWindow {
  clicks: number;
  impressions: number;
  position: number;
}
interface GscQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}
interface PageGsc {
  m1: GscWindow | null;
  m3: GscWindow | null;
  m6: GscWindow | null;
  topQueries: GscQuery[];
}
interface GroupMember {
  url: string;
  title: string | null;
  type: string | null;
  intent: Intent;
  /** GSC full-month totals + top-5 queries (null until the snapshot runs). */
  gsc?: PageGsc | null;
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
  /** True for a programmatic blog series grouped by slug template. */
  isSeries?: boolean;
  winnerUrl: string;
  maxBodySim: number;
  members: GroupMember[];
}
interface Singleton {
  url: string;
  title: string | null;
  type: string | null;
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
  const [singletons, setSingletons] = useState<Singleton[]>([]);
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
  // GSC metrics (1m/3m/6m + top queries) per member, off by default.
  const [showGsc, setShowGsc] = useState(false);
  // Pagination for the cluster list.
  const [cPage, setCPage] = useState(1);
  const [cPageSize, setCPageSize] = useState(25);

  // `fresh` bypasses the server-side scan cache (the Rescan button).
  async function load(fresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups?limit=500${fresh ? "&fresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load clusters");
      setGroups(data.groups ?? []);
      setSingletons(data.singletons ?? []);
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

  // Prefill: run the scan automatically on first visit (uses the server cache).
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const actionTypes = useMemo(
    () => Array.from(new Set((groups ?? []).map((g) => g.action))).sort(),
    [groups],
  );
  // Every content type that appears in ANY member - a cross-type cluster
  // (category + its courses) must be reachable from the "course" filter too.
  const contentTypes = useMemo(
    () =>
      Array.from(
        new Set((groups ?? []).flatMap((g) => g.members.map((m) => m.type)).filter(Boolean) as string[]),
      ).sort(),
    [groups],
  );

  // Search-only pre-filter (both pill groups + the list build on it).
  const bySearch = useMemo(() => {
    if (!groups) return [] as GroupSummary[];
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter(
      (g) =>
        g.label.toLowerCase().includes(needle) ||
        g.members.some((m) => m.url.toLowerCase().includes(needle) || (m.title ?? "").toLowerCase().includes(needle)),
    );
  }, [groups, q]);

  // Pill counts are CONTEXTUAL - each dimension counts against the OTHER active
  // filters (+ search), so pills that would yield nothing are hidden.
  const actionCounts = useMemo(() => {
    const base = bySearch.filter((g) => !typeFilter || g.members.some((m) => m.type === typeFilter));
    const map = new Map<string, number>();
    for (const g of base) map.set(g.action, (map.get(g.action) ?? 0) + 1);
    return { total: base.length, map };
  }, [bySearch, typeFilter]);
  const typeCounts = useMemo(() => {
    const base = bySearch.filter((g) => !actionFilter || g.action === actionFilter);
    const map = new Map<string, number>();
    for (const g of base) {
      for (const t of new Set(g.members.map((m) => m.type).filter(Boolean) as string[])) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return { total: base.length, map };
  }, [bySearch, actionFilter]);

  const filtered = useMemo(() => {
    if (!groups) return null;
    return bySearch
      .filter((g) => !actionFilter || g.action === actionFilter)
      .filter((g) => !typeFilter || g.members.some((m) => m.type === typeFilter));
  }, [groups, bySearch, actionFilter, typeFilter]);

  // Reset to page 1 whenever the filter set changes.
  useEffect(() => { setCPage(1); }, [actionFilter, typeFilter, q, groups]);
  const paginatedClusters = useMemo(
    () => (filtered ? filtered.slice((cPage - 1) * cPageSize, cPage * cPageSize) : null),
    [filtered, cPage, cPageSize],
  );

  return (
    <div>
      <PageHeader
        title="Content Clusters"
        subtitle="Corpus pages grouped by TOPIC across content types - a category page, its blog, and its courses land in one cluster. Distinctive topic tokens (template words auto-learned & dropped) decide membership; each cluster gets a suggested action + winner."
        right={
          <button
            type="button"
            onClick={() => load(true)}
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
          <Card className="text-sm text-slate-500">Scanning the corpus for topic clusters…</Card>
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

        {/* Filter bar - labeled action / type groups, then controls. */}
        {groups && groups.length > 0 && (
          <FilterBar>
            <FilterRow>
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder="Filter by topic, title, or URL…"
                className="w-full sm:w-72"
              />
              <ToggleChip label="Show intent" checked={showIntent} onChange={setShowIntent} />
              <ToggleChip label="Show GSC" checked={showGsc} onChange={setShowGsc} />
              {(actionFilter || typeFilter || q) && (
                <ClearFiltersButton onClick={() => { setActionFilter(""); setTypeFilter(""); setQ(""); }} />
              )}
            </FilterRow>
            <FilterGroup label="Action">
              <FilterChip label="All" count={actionCounts.total} active={!actionFilter} onClick={() => setActionFilter("")} />
              {actionTypes
                .filter((a) => (actionCounts.map.get(a) ?? 0) > 0)
                .map((a) => (
                  <FilterChip
                    key={a}
                    label={ACTION_STYLE[a]?.label ?? a}
                    count={actionCounts.map.get(a) ?? 0}
                    active={actionFilter === a}
                    dotClass={dotColor(ACTION_STYLE[a]?.cls)}
                    onClick={() => setActionFilter(actionFilter === a ? "" : a)}
                  />
                ))}
            </FilterGroup>
            <FilterRow>
              <FilterSelect
                label="Type"
                value={typeFilter}
                onChange={setTypeFilter}
                options={contentTypes
                  .filter((ct) => (typeCounts.map.get(ct) ?? 0) > 0)
                  .map((ct) => ({ value: ct, label: ct.replace("-", " "), count: typeCounts.map.get(ct) ?? 0 }))}
              />
            </FilterRow>
          </FilterBar>
        )}

        {filtered && filtered.length > 0 && (
          <>
            <div className="space-y-2.5">
              {paginatedClusters!.map((g, i) => <ClusterCard key={`${g.seedUrl}#${i}`} g={g} showIntent={showIntent} showGsc={showGsc} />)}
            </div>
            {filtered.length > cPageSize && (
              <Pagination
                page={cPage}
                pageSize={cPageSize}
                total={filtered.length}
                onJump={setCPage}
                onPageSize={setCPageSize}
                pageSizes={[25, 50, 100]}
                unit="clusters"
              />
            )}
          </>
        )}
        {filtered && filtered.length === 0 && !loading && (
          <Card className="text-sm text-slate-400">
            {groups && groups.length > 0
              ? "No clusters match the active filters."
              : "No clusters found - no pages share a topic at the current thresholds."}
          </Card>
        )}

        {/* Unique-topic (singleton) pages - browsable, not a dead-end stat. */}
        {meta && meta.singletonCount > 0 && (
          <SingletonsSection singletons={singletons} total={meta.singletonCount} q={q} />
        )}
      </div>
    </div>
  );
}

function ClusterCard({ g, showIntent, showGsc }: { g: GroupSummary; showIntent: boolean; showGsc: boolean }) {
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
        {g.isSeries && (
          <span
            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
            title="Programmatic blog series grouped by URL template - intentional variants, keep them all"
          >
            series
          </span>
        )}
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800"
          title={g.isSeries ? `Series: ${g.label}` : `Topic: ${g.label} · pillar: ${pathOf(g.seedUrl)}`}
        >
          {g.label}
        </span>
        <span className="ml-auto shrink-0 truncate text-xs text-slate-400" title={`Suggested winner: ${g.winnerUrl}`}>
          winner: <span className="text-slate-600">{pathOf(g.winnerUrl)}</span>
        </span>
      </button>
      <ul className="divide-y divide-slate-50 border-t border-slate-100 px-4 py-1">
        {shown.map((m) => (
          <li key={m.url} className="flex items-start gap-2.5 py-2 text-sm">
            <span
              className={`mt-0.5 w-3 shrink-0 text-center ${m.isWinner ? "text-amber-500" : "text-transparent"}`}
              title={m.isWinner ? "Suggested winner (canonical page to keep)" : undefined}
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
                {m.isSeed && !g.isSeries && (
                  <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700" title="Pillar - the topic hub for this cluster">
                    pillar
                  </span>
                )}
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
              {showGsc && <GscBlock gsc={m.gsc ?? null} />}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {g.isSeries ? null : m.isSeed ? (
                <span className="text-xs font-medium text-purple-600">pillar</span>
              ) : (
                <span
                  className="tabular-nums text-sm font-semibold text-slate-700"
                  title={`Content similarity to the pillar (embedding cosine). Distinctive-topic-token overlap: ${(m.matchSim * 100).toFixed(0)}%`}
                >
                  {m.bodySim != null ? `${(m.bodySim * 100).toFixed(0)}%` : `${(m.matchSim * 100).toFixed(0)}%`}
                  <span className="ml-1 text-[10px] font-normal text-slate-400">match</span>
                </span>
              )}
              {/* Shared topic tokens are kept in the API response (backend
                  evidence) but intentionally NOT rendered for users. */}
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

/** GSC per-member panel: a period-metrics table + a top-queries table. */
function GscBlock({ gsc }: { gsc: PageGsc | null }) {
  const hasData = gsc && (gsc.m1 || gsc.m3 || gsc.m6 || gsc.topQueries.length > 0);
  if (!hasData) {
    return <div className="mt-1.5 text-[10px] text-slate-300">no GSC data for this page</div>;
  }
  const windows: [string, GscWindow | null][] = [
    ["1 month", gsc.m1],
    ["3 months", gsc.m3],
    ["6 months", gsc.m6],
  ];
  const th = "px-2 py-1 text-right font-semibold";
  const td = "px-2 py-0.5 text-right tabular-nums text-slate-700";
  return (
    // Two compact tables side by side (wraps to stacked on narrow screens).
    <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-start">
      {/* Search Console performance by period */}
      <div className="overflow-hidden rounded-lg border border-slate-200 lg:w-[300px] lg:shrink-0">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-50 text-[8px] uppercase tracking-wider text-slate-400">
              <th className="px-2 py-1 text-left font-semibold">Search Console</th>
              <th className={th}>Clicks</th>
              <th className={th}>Impr</th>
              <th className={th}>Pos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {windows.map(([label, w]) => (
              <tr key={label}>
                <td className="px-2 py-0.5 font-medium text-slate-500">{label}</td>
                {w ? (
                  <>
                    <td className={td}>{w.clicks.toLocaleString()}</td>
                    <td className={td}>{w.impressions.toLocaleString()}</td>
                    <td className={td}>{w.position}</td>
                  </>
                ) : (
                  <td className="px-2 py-0.5 text-center text-[9px] text-slate-300" colSpan={3}>
                    no data
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top queries (last full month). Cap the width so the metric columns
          sit next to the (usually short) query text instead of being pushed to
          the far right edge of a full-width, stretched table. */}
      {gsc.topQueries.length > 0 && (
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 lg:max-w-xl">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-50 text-[8px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-1 text-left font-semibold">Top queries · last month</th>
                <th className={`${th} w-px whitespace-nowrap`}>Clicks</th>
                <th className={`${th} w-px whitespace-nowrap`}>Impr</th>
                <th className={`${th} w-px whitespace-nowrap`}>Pos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gsc.topQueries.map((query) => (
                <tr key={query.query}>
                  <td className="max-w-0 truncate px-2 py-0.5 text-slate-700" title={query.query}>
                    {query.query}
                  </td>
                  <td className={`${td} w-px whitespace-nowrap`}>{query.clicks.toLocaleString()}</td>
                  <td className={`${td} w-px whitespace-nowrap text-slate-600`}>{query.impressions.toLocaleString()}</td>
                  <td className={`${td} w-px whitespace-nowrap text-slate-600`}>{query.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SingletonsSection({ singletons, total, q }: { singletons: Singleton[]; total: number; q: string }) {
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const list = needle
    ? singletons.filter((s) => s.url.toLowerCase().includes(needle) || (s.title ?? "").toLowerCase().includes(needle))
    : singletons;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""} text-slate-400`}>▸</span>
        <span className="text-sm font-semibold text-slate-900">{total.toLocaleString()} unique-topic pages</span>
        <span className="truncate text-xs text-slate-400">pages whose topic no other page shares - an answer, not a gap</span>
      </button>
      {open && (
        <ul className="max-h-96 divide-y divide-slate-50 overflow-auto border-t border-slate-100 px-4 py-1">
          {list.slice(0, 500).map((s) => (
            <li key={s.url} className="flex items-center gap-2 py-1.5 text-sm">
              {s.type && <TypeChip type={s.type} size="xs" />}
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-slate-800 hover:underline"
                title={s.title || s.url}
              >
                {s.title || pathOf(s.url)}
              </a>
              <span className="ml-auto shrink-0 truncate text-xs text-slate-400">{pathOf(s.url)}</span>
            </li>
          ))}
          {list.length === 0 && (
            <li className="py-2 text-xs text-slate-400">No unique-topic pages match the filter.</li>
          )}
          {!needle && total > singletons.length && (
            <li className="py-2 text-[11px] text-amber-700">
              Showing the first {singletons.length.toLocaleString()} of {total.toLocaleString()}.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
