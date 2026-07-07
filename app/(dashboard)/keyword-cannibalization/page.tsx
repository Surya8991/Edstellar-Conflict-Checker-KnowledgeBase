"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Card, TypeChip } from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";
import {
  FilterBar,
  FilterRow,
  SearchBox,
  FilterGroup,
  FilterChip,
  FilterSelect,
  ClearFiltersButton,
  dotColor,
} from "@/app/components/Filters";
import { Star, Download, RefreshCw, ExternalLink, ArrowRight, ChevronDown, StickyNote } from "lucide-react";
import AssistantTab from "./AssistantTab";

// ── types (mirror /api/cannibalization + /api/groups) ──────────────────────
type Severity = "high" | "medium" | "low";
interface CPage {
  page: string;
  contentType: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  role: "primary" | "cannibal";
}
interface CGroup {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  pageCount: number;
  positionGap: number;
  bestPosition: number;
  crossType: boolean;
  severity: Severity;
  primaryPage: string;
  action: string;
  pages: CPage[];
}
interface MergeMember { url: string; type: string | null; isWinner: boolean }
interface MergeCluster { label: string; action: string; winnerUrl: string; members: MergeMember[] }

const TABS = [
  {
    slug: "near-position",
    label: "Nearer avg position",
    desc: "Conflict keywords with a nearer avg position - difference of ±10 in position between the competing pages. Google keeps swapping them; the real, act-now cannibalization.",
  },
  {
    slug: "all-keywords",
    label: "No position limit",
    desc: "Conflict keywords with no avg position limit - every query 2+ of your pages rank for, however far apart. The full landscape.",
  },
  {
    slug: "cross-type",
    label: "Course / other-page conflicts",
    desc: "Pages and keywords conflicting with a course or other pages - different content types competing (e.g. a blog outranking a course). Protects revenue pages.",
  },
  {
    slug: "merge-blogs",
    label: "Blogs to merge",
    desc: "Same content or intent blogs that need to be merged - near-duplicate blogs to consolidate into one and 301. Content-based, not keyword-based.",
  },
  {
    slug: "assistant",
    label: "AI Assistant",
    desc: "Paste a batch of URLs or keywords - the assistant finds every cannibalization conflict they're in (across all tabs) and Groq explains what to do.",
  },
] as const;
type TabSlug = (typeof TABS)[number]["slug"];

const PER_PAGE = 25;

const SEV_STYLE: Record<Severity, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};
const ACTION_STYLE: Record<string, { label: string; cls: string; hint: string }> = {
  consolidate: {
    label: "Consolidate → 301",
    cls: "bg-indigo-100 text-indigo-700",
    hint: "Same intent, fighting each other. 301-redirect the losers into the primary page and merge the content.",
  },
  differentiate: {
    label: "Differentiate",
    cls: "bg-amber-100 text-amber-700",
    hint: "Same type but far apart. Re-focus each page on a distinct angle/keyword so they stop overlapping.",
  },
  monitor: {
    label: "Monitor",
    cls: "bg-slate-100 text-slate-600",
    hint: "Different content types competing for this query. Don't 301 across intents - keep an eye on it and differentiate the pages if it worsens.",
  },
};

// ── sort + gap-window controls ─────────────────────────────────────────────
type SortKey = "severity" | "gap-asc" | "gap-desc" | "clicks" | "impr" | "pos-best" | "pos-worst";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "severity", label: "Severity" },
  { key: "gap-asc", label: "Gap ↑" },
  { key: "gap-desc", label: "Gap ↓" },
  { key: "clicks", label: "Clicks" },
  { key: "impr", label: "Impressions" },
  { key: "pos-best", label: "Best pos" },
  { key: "pos-worst", label: "Worst pos" },
];
// Preset max-spread windows (positions). Hides groups whose pages sprawl wider.
const GAP_PRESETS = [5, 10, 20] as const;

/** Full avg-position spread across ALL pages in a group (leader → laggard).
 *  The card's "gap" is only the top-2 difference; this is the real sprawl a
 *  page like the 3rd one 35 positions back contributes. */
function pageSpread(g: CGroup): number {
  if (g.pages.length < 2) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const p of g.pages) {
    if (p.position < min) min = p.position;
    if (p.position > max) max = p.position;
  }
  return max - min;
}

/** Re-order groups by the chosen key. "severity" keeps the API order
 *  (severity → clicks → impressions). */
function sortGroups(list: CGroup[], key: SortKey): CGroup[] {
  if (key === "severity") return list;
  const a = list.slice();
  switch (key) {
    case "gap-asc":
      a.sort((x, y) => x.positionGap - y.positionGap);
      break;
    case "gap-desc":
      a.sort((x, y) => y.positionGap - x.positionGap);
      break;
    case "clicks":
      a.sort((x, y) => y.totalClicks - x.totalClicks);
      break;
    case "impr":
      a.sort((x, y) => y.totalImpressions - x.totalImpressions);
      break;
    case "pos-best":
      a.sort((x, y) => x.bestPosition - y.bestPosition);
      break;
    case "pos-worst":
      a.sort((x, y) => y.bestPosition - x.bestPosition);
      break;
  }
  return a;
}

// ── per-conflict status + notes (persisted via /api/cannibalization/annotation) ─
type ConflictStatus = "pending" | "in-progress" | "completed" | "ignored";
type Anno = { status: ConflictStatus; note: string };
const NOTE_MAX = 300;
const STATUS_OPTS: { value: ConflictStatus; label: string; dot: string }[] = [
  { value: "pending", label: "Pending", dot: "bg-slate-400" },
  { value: "in-progress", label: "In progress", dot: "bg-amber-400" },
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "ignored", label: "Ignored", dot: "bg-slate-300" },
];
const statusMeta = (s: ConflictStatus) => STATUS_OPTS.find((o) => o.value === s) ?? STATUS_OPTS[0];

/** Clicks going to the non-primary (cannibal) pages - recoverable by consolidating. */
function atRiskClicks(g: CGroup): number {
  return g.pages.filter((p) => p.role === "cannibal").reduce((s, p) => s + p.clicks, 0);
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function KeywordCannibalizationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const section = (params.get("tab") as TabSlug) || "near-position";
  const tab: TabSlug = TABS.some((t) => t.slug === section) ? section : "near-position";

  const [groups, setGroups] = useState<CGroup[]>([]);
  const [thresholds, setThresholds] = useState<{ nearGap: number }>({ nearGap: 10 });
  const [lastComputed, setLastComputed] = useState<string | null>(null);
  const [merge, setMerge] = useState<MergeCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PER_PAGE);
  // Filters (contextual - counts respect the other active filters + search).
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<Severity | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [maxGap, setMaxGap] = useState<number | null>(null); // hide groups whose page spread exceeds this
  const [sortBy, setSortBy] = useState<SortKey>("severity");
  const [statusFilter, setStatusFilter] = useState<ConflictStatus | "">("");
  // Per-conflict status + notes, keyed by query. Loaded once, updated optimistically.
  const [annos, setAnnos] = useState<Record<string, Anno>>({});
  const statusOf = useCallback((g: CGroup): ConflictStatus => annos[g.query]?.status ?? "pending", [annos]);
  const saveAnno = useCallback((query: string, patch: Partial<Anno>) => {
    setAnnos((prev) => {
      const cur = prev[query] ?? { status: "pending" as ConflictStatus, note: "" };
      const next: Anno = { ...cur, ...patch };
      fetch("/api/cannibalization/annotation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, status: next.status, note: next.note }),
      }).catch(() => {});
      return { ...prev, [query]: next };
    });
  }, []);
  // Bulk selection + status change.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((query: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(query)) next.delete(query);
      else next.add(query);
      return next;
    });
  }, []);
  const bulkSetStatus = useCallback((status: ConflictStatus, queries: string[]) => {
    if (!queries.length) return;
    setAnnos((prev) => {
      const next = { ...prev };
      for (const q of queries) next[q] = { status, note: prev[q]?.note ?? "" };
      return next;
    });
    fetch("/api/cannibalization/annotation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries, status }),
    }).catch(() => {});
    setSelected(new Set());
  }, []);

  // Tabs 1-3: pre-computed keyword conflicts.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/cannibalization")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setError(d.error);
        else {
          setGroups(d.groups ?? []);
          setThresholds(d.thresholds ?? { nearGap: 10 });
          setLastComputed(d.lastComputed ?? null);
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Per-conflict annotations (status + notes).
  useEffect(() => {
    let alive = true;
    fetch("/api/cannibalization/annotation")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.annotations) setAnnos(d.annotations);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tab 4: blog merge candidates from the content-cluster engine.
  useEffect(() => {
    let alive = true;
    setMergeLoading(true);
    fetch("/api/groups")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const clusters: MergeCluster[] = (d.groups ?? [])
          .filter(
            (g: any) =>
              (g.action === "merge" || g.action === "consolidate") &&
              Array.isArray(g.members) &&
              g.members.length >= 2 &&
              g.members.every((m: any) => m.type === "blog"),
          )
          .map((g: any) => ({ label: g.label, action: g.action, winnerUrl: g.winnerUrl, members: g.members }));
        setMerge(clusters);
      })
      .catch(() => {})
      .finally(() => alive && setMergeLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const near = useMemo(
    () => groups.filter((g) => g.positionGap <= thresholds.nearGap),
    [groups, thresholds],
  );
  const crossType = useMemo(() => groups.filter((g) => g.crossType), [groups]);

  const counts: Record<TabSlug, number> = {
    "near-position": near.length,
    "all-keywords": groups.length,
    "cross-type": crossType.length,
    "merge-blogs": merge.length,
    assistant: 0,
  };
  const rows = tab === "near-position" ? near : tab === "all-keywords" ? groups : tab === "cross-type" ? crossType : [];

  const matchesSearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (g: CGroup) =>
      !s || g.query.toLowerCase().includes(s) || g.pages.some((p) => p.page.toLowerCase().includes(s));
  }, [search]);

  const hasType = (g: CGroup, t: string) => g.pages.some((p) => (p.contentType ?? "other") === t);
  const withinGap = useMemo(
    () => (g: CGroup) => maxGap == null || pageSpread(g) <= maxGap,
    [maxGap],
  );

  // Contextual counts: each dimension respects the OTHER active filters + search + gap window.
  const sevCounts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const g of rows)
      if (matchesSearch(g) && withinGap(g) && (!actionFilter || g.action === actionFilter) && (!typeFilter || hasType(g, typeFilter)))
        c[g.severity]++;
    return c;
  }, [rows, matchesSearch, withinGap, actionFilter, typeFilter]);
  const actionCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of rows)
      if (matchesSearch(g) && withinGap(g) && (!sevFilter || g.severity === sevFilter) && (!typeFilter || hasType(g, typeFilter)))
        c[g.action] = (c[g.action] ?? 0) + 1;
    return c;
  }, [rows, matchesSearch, withinGap, sevFilter, typeFilter]);
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of rows) {
      if (!(matchesSearch(g) && withinGap(g) && (!sevFilter || g.severity === sevFilter) && (!actionFilter || g.action === actionFilter))) continue;
      const seen = new Set<string>();
      for (const p of g.pages) {
        const t = p.contentType ?? "other";
        if (!seen.has(t)) {
          seen.add(t);
          c[t] = (c[t] ?? 0) + 1;
        }
      }
    }
    return c;
  }, [rows, matchesSearch, sevFilter, actionFilter]);

  // Status counts respect the other active filters + search + gap window.
  const statusCounts = useMemo(() => {
    const c: Record<ConflictStatus, number> = { pending: 0, "in-progress": 0, completed: 0, ignored: 0 };
    for (const g of rows)
      if (
        matchesSearch(g) &&
        withinGap(g) &&
        (!sevFilter || g.severity === sevFilter) &&
        (!actionFilter || g.action === actionFilter) &&
        (!typeFilter || hasType(g, typeFilter))
      )
        c[statusOf(g)]++;
    return c;
  }, [rows, matchesSearch, withinGap, sevFilter, actionFilter, typeFilter, statusOf]);

  const filtered = useMemo(
    () =>
      sortGroups(
        rows.filter(
          (g) =>
            matchesSearch(g) &&
            withinGap(g) &&
            (!sevFilter || g.severity === sevFilter) &&
            (!actionFilter || g.action === actionFilter) &&
            (!typeFilter || hasType(g, typeFilter)) &&
            (!statusFilter || statusOf(g) === statusFilter),
        ),
        sortBy,
      ),
    [rows, matchesSearch, withinGap, sevFilter, actionFilter, typeFilter, statusFilter, statusOf, sortBy],
  );
  const mergeFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return merge;
    return merge.filter((c) => c.label.toLowerCase().includes(s) || c.members.some((m) => m.url.toLowerCase().includes(s)));
  }, [merge, search]);

  const hasFilter = !!(search.trim() || sevFilter || actionFilter || typeFilter || maxGap != null || statusFilter);
  function clearFilters() {
    setSearch("");
    setSevFilter(null);
    setActionFilter(null);
    setTypeFilter(null);
    setMaxGap(null);
    setStatusFilter("");
  }

  // Reset page on tab/filter/sort change; drop pill filters when switching tabs.
  useEffect(() => setPage(1), [tab, search, sevFilter, actionFilter, typeFilter, maxGap, statusFilter, sortBy]);
  useEffect(() => {
    setSevFilter(null);
    setActionFilter(null);
    setTypeFilter(null);
    setMaxGap(null);
    setStatusFilter("");
    setSortBy("severity");
    setSelected(new Set());
  }, [tab]);

  function go(slug: TabSlug) {
    router.replace(`/keyword-cannibalization?tab=${slug}`, { scroll: false });
  }

  async function refresh() {
    setLoading(true);
    await fetch("/api/settings/cannibalization-refresh", { method: "POST" }).catch(() => {});
    const d = await fetch("/api/cannibalization").then((r) => r.json());
    setGroups(d.groups ?? []);
    setLastComputed(d.lastComputed ?? null);
    setLoading(false);
  }

  const activeTab = TABS.find((t) => t.slug === tab)!;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Keyword Cannibalization"
        subtitle="Where multiple Edstellar pages compete for the same query - who should win, and what to do. GSC data over the last 3 full months."
        right={
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Rescan
          </button>
        }
      />
      <div className="space-y-4 p-8">
      <div className="text-xs text-slate-500">
        {lastComputed ? `Last computed ${new Date(lastComputed).toLocaleString()}` : "Not computed yet - run a scan from Settings or hit Rescan"}
      </div>

      {/* tab bar */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.slug}
            onClick={() => go(t.slug)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === t.slug ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {t.label}
            {t.slug !== "assistant" && (
              <span className={`ml-1.5 tabular-nums ${tab === t.slug ? "text-slate-300" : "text-slate-400"}`}>
                {counts[t.slug]}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-slate-500">{activeTab.desc}</p>

      {/* filters (hidden on the AI Assistant tab, which has its own input) */}
      {tab !== "assistant" && (
      <FilterBar className="mb-4">
        <FilterRow>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search query or page URL…"
            className="w-full sm:w-72"
          />
          {hasFilter && <ClearFiltersButton onClick={clearFilters} />}
        </FilterRow>

        {tab !== "merge-blogs" && (
          <>
            <FilterGroup label="Severity">
              <FilterChip label="All" active={!sevFilter} onClick={() => setSevFilter(null)} />
              {(["high", "medium", "low"] as Severity[])
                .filter((s) => sevCounts[s] > 0 || sevFilter === s)
                .map((s) => (
                  <FilterChip
                    key={s}
                    label={s}
                    count={sevCounts[s]}
                    active={sevFilter === s}
                    dotClass={dotColor(SEV_STYLE[s])}
                    onClick={() => setSevFilter(sevFilter === s ? null : s)}
                  />
                ))}
            </FilterGroup>

            <FilterGroup label="Action">
              <FilterChip label="All" active={!actionFilter} onClick={() => setActionFilter(null)} />
              {Object.keys(ACTION_STYLE)
                .filter((a) => (actionCounts[a] ?? 0) > 0 || actionFilter === a)
                .map((a) => (
                  <FilterChip
                    key={a}
                    label={ACTION_STYLE[a].label}
                    count={actionCounts[a] ?? 0}
                    active={actionFilter === a}
                    dotClass={dotColor(ACTION_STYLE[a].cls)}
                    onClick={() => setActionFilter(actionFilter === a ? null : a)}
                  />
                ))}
            </FilterGroup>

            <FilterGroup label="Status">
              <FilterChip label="All" active={!statusFilter} onClick={() => setStatusFilter("")} />
              {STATUS_OPTS.map((s) => (
                <FilterChip
                  key={s.value}
                  label={s.label}
                  count={statusCounts[s.value]}
                  active={statusFilter === s.value}
                  dotClass={s.dot}
                  onClick={() => setStatusFilter(statusFilter === s.value ? "" : s.value)}
                />
              ))}
            </FilterGroup>

            <FilterRow>
              <FilterSelect
                label="Type"
                value={typeFilter ?? ""}
                onChange={(v) => setTypeFilter(v || null)}
                options={Object.entries(typeCounts)
                  .filter(([t, n]) => n > 0 || typeFilter === t)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => ({ value: t, label: t.replace("-", " "), count: n }))}
              />
              <FilterSelect
                label="Sort"
                value={sortBy}
                onChange={(v) => setSortBy(v as SortKey)}
                options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
                allLabel={null}
                defaultValue="severity"
              />
            </FilterRow>

            <FilterGroup label="Max gap">
              <FilterChip label="Any" active={maxGap == null} onClick={() => setMaxGap(null)} />
              {GAP_PRESETS.map((g) => (
                <FilterChip
                  key={g}
                  label={`≤ ${g}`}
                  active={maxGap === g}
                  onClick={() => setMaxGap(maxGap === g ? null : g)}
                />
              ))}
            </FilterGroup>
          </>
        )}
      </FilterBar>
      )}

      {error && tab !== "assistant" && (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {tab === "assistant" ? (
        <AssistantTab />
      ) : tab === "merge-blogs" ? (
        <MergeTab clusters={mergeFiltered} loading={mergeLoading} />
      ) : loading ? (
        <Card>
          <p className="text-sm text-slate-400">Loading conflicts…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            No conflicts in this view. {lastComputed ? "" : "Run a scan from Settings → Keyword Cannibalization first."}
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No conflicts match the current filters.</p>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((g) => selected.has(g.query))}
                onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((g) => g.query)) : new Set())}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <span className="tabular-nums">
                {filtered.length} {filtered.length === 1 ? "conflict" : "conflicts"}
                {filtered.length !== rows.length ? ` of ${rows.length}` : ""}
              </span>
            </label>
            <button
              onClick={() =>
                downloadCsv(
                  `cannibalization-${tab}.csv`,
                  ["query", "status", "note", "severity", "action", "page", "role", "type", "position", "impressions", "ctr", "clicks"],
                  filtered.flatMap((g) =>
                    g.pages.map((p) => [
                      g.query,
                      annos[g.query]?.status ?? "pending",
                      annos[g.query]?.note ?? "",
                      g.severity,
                      g.action,
                      p.page,
                      p.role,
                      p.contentType ?? "",
                      p.position,
                      p.impressions,
                      (p.ctr * 100).toFixed(1) + "%",
                      p.clicks,
                    ]),
                  ),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>

          {/* Bulk status bar - appears once anything is selected. */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-700 tabular-nums">{selected.size} selected</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">Set status:</span>
              {STATUS_OPTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => bulkSetStatus(s.value, [...selected])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </button>
              ))}
              <div className="grow" />
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-800">
                Clear selection
              </button>
            </div>
          )}

          <div className="space-y-3">
            {paged.map((g) => (
              <ConflictCard
                key={g.query}
                g={g}
                anno={annos[g.query]}
                onSave={saveAnno}
                selected={selected.has(g.query)}
                onToggleSelect={() => toggleSelect(g.query)}
              />
            ))}
          </div>

          {filtered.length > pageSize && (
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onJump={setPage}
                onPageSize={setPageSize}
                pageSizes={[25, 50, 100]}
                unit="conflicts"
              />
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function ConflictCard({
  g,
  anno,
  onSave,
  selected,
  onToggleSelect,
}: {
  g: CGroup;
  anno?: Anno;
  onSave: (query: string, patch: Partial<Anno>) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const action = ACTION_STYLE[g.action] ?? ACTION_STYLE.differentiate;
  const status = anno?.status ?? "pending";
  const savedNote = anno?.note ?? "";
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(savedNote);
  // Re-sync the draft if the saved note changes underneath us (e.g. initial load).
  useEffect(() => setDraft(savedNote), [savedNote]);
  const dirty = draft !== savedNote;
  const atRisk = atRiskClicks(g);
  const sm = statusMeta(status);

  return (
    <div className={`rounded-xl border bg-white p-4 ${selected ? "border-slate-400 ring-1 ring-slate-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label="Select conflict for bulk actions"
            className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
          />
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV_STYLE[g.severity]}`}>
              {g.severity}
            </span>
            <span className="truncate font-medium text-slate-900">{g.query}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {g.pageCount} pages · {g.totalImpressions.toLocaleString()} impr · {g.totalClicks.toLocaleString()} clicks · gap{" "}
            {g.positionGap.toFixed(1)}
            {g.pageCount > 2 && (
              <span title="Full avg-position spread from the leader to the furthest page">
                {" "}· spread {pageSpread(g).toFixed(1)}
              </span>
            )}{" "}
            · best pos {g.bestPosition.toFixed(1)}
            {atRisk > 0 && (
              <span title="Clicks currently going to the non-primary (cannibal) pages - recoverable by consolidating">
                {" "}· <span className="font-medium text-slate-600">{atRisk.toLocaleString()} clicks at risk</span>
              </span>
            )}
          </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Per-conflict workflow status (persisted) */}
          <span className="relative inline-flex" title="Set this conflict's status">
            <span className={`pointer-events-none absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${sm.dot}`} />
            <select
              value={status}
              onChange={(e) => onSave(g.query, { status: e.target.value as ConflictStatus })}
              className="appearance-none rounded-md border border-slate-200 bg-white py-1 pl-5 pr-6 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {STATUS_OPTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </span>
          <span title={action.hint} className={`cursor-help rounded-md px-2 py-1 text-xs font-medium ${action.cls}`}>
            {action.label}
          </span>
        </div>
      </div>

      <table className="mt-3 w-full text-sm">
        <tbody>
          {g.pages.map((p) => (
            <tr
              key={p.page}
              className={`border-t border-slate-100 ${p.role === "primary" ? "bg-emerald-50/40" : ""}`}
            >
              <td className="w-6 py-1.5 pr-1 align-top">
                {p.role === "primary" ? (
                  <span title="Recommended winner">
                    <Star size={13} className="text-emerald-600" fill="currentColor" />
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 pr-2 align-top">
                <TypeChip type={p.contentType ?? "static"} />
              </td>
              <td className="py-1.5 pr-3 align-top">
                <a href={p.page} target="_blank" rel="noreferrer" className="break-all text-slate-700 hover:underline">
                  {p.page}
                </a>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-xs text-slate-500 tabular-nums">
                pos {p.position.toFixed(1)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-xs text-slate-500 tabular-nums">
                {p.impressions.toLocaleString()} impr
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-xs text-slate-500 tabular-nums">
                {(p.ctr * 100).toFixed(1)}% ctr
              </td>
              <td className="whitespace-nowrap py-1.5 text-right align-top text-xs text-slate-500 tabular-nums">
                {p.clicks.toLocaleString()} clicks
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setNoteOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <StickyNote size={12} />
          {savedNote ? "Note" : "Add note"}
          {savedNote && !noteOpen && <span className="ml-1 max-w-[240px] truncate text-slate-400">— {savedNote}</span>}
        </button>
        <a
          href={`/conflict-checker?url=${encodeURIComponent(g.primaryPage)}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          Analyze primary in Conflict Checker <ExternalLink size={11} />
        </a>
      </div>

      {noteOpen && (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX))}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Add a note for this conflict (max 300 characters)…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span className="tabular-nums">
              {draft.length}/{NOTE_MAX}
            </span>
            <button
              disabled={!dirty}
              onClick={() => onSave(g.query, { note: draft })}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MergeTab({ clusters, loading }: { clusters: MergeCluster[]; loading: boolean }) {
  if (loading)
    return (
      <Card>
        <p className="text-sm text-slate-400">Scanning blog clusters…</p>
      </Card>
    );
  if (clusters.length === 0)
    return (
      <Card>
        <p className="text-sm text-slate-500">
          No blog merge candidates. These come from the Content Clusters engine (near-duplicate blogs with a merge /
          consolidate action).
        </p>
      </Card>
    );
  return (
    <div className="space-y-3">
      {clusters.map((c) => {
        const winner = c.members.find((m) => m.isWinner) ?? c.members[0];
        const losers = c.members.filter((m) => m.url !== winner.url);
        return (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{c.label}</span>
              <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
                {c.action === "merge" ? "Merge → 301" : "Consolidate"}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm">
              <Star size={13} className="mt-0.5 shrink-0 text-emerald-600" fill="currentColor" />
              <a href={winner.url} target="_blank" rel="noreferrer" className="break-all text-slate-800 hover:underline">
                {winner.url}
              </a>
              <span className="shrink-0 text-xs text-slate-400">keep</span>
            </div>
            <div className="mt-1 space-y-1 pl-5">
              {losers.map((m) => (
                <div key={m.url} className="flex items-start gap-1.5 text-xs text-slate-500">
                  <ArrowRight size={11} className="mt-0.5 shrink-0 text-slate-300" />
                  <a href={m.url} target="_blank" rel="noreferrer" className="break-all hover:underline">
                    {m.url}
                  </a>
                  <span className="shrink-0 text-slate-400">301 →</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
