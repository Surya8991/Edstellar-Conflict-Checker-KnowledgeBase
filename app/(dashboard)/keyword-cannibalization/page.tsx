"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Card, TypeChip } from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";
import { Star, Download, RefreshCw, ExternalLink, ArrowRight, Search, X } from "lucide-react";

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
  commercialAtRisk: boolean;
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
    label: "Near-position conflicts",
    desc: "Queries where 2+ of your pages rank close together - Google keeps swapping them. The real, act-now cannibalization.",
  },
  {
    slug: "all-keywords",
    label: "All keyword conflicts",
    desc: "Every query 2+ of your pages rank for, regardless of how far apart. The full landscape.",
  },
  {
    slug: "cross-type",
    label: "Course / cross-type conflicts",
    desc: "A query where different content types compete - e.g. a blog outranking a course. Protects revenue pages.",
  },
  {
    slug: "merge-blogs",
    label: "Blogs to merge",
    desc: "Near-duplicate blogs (same content/intent) to consolidate into one and 301. Content-based, not keyword-based.",
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
  "protect-commercial": {
    label: "Protect the money page",
    cls: "bg-red-100 text-red-700",
    hint: "A lower-value page is outranking your course/category. Point internal links at the commercial page and de-optimize the blog for this term (don't 301 across intents).",
  },
  differentiate: {
    label: "Differentiate",
    cls: "bg-amber-100 text-amber-700",
    hint: "Same type but far apart. Re-focus each page on a distinct angle/keyword so they stop overlapping.",
  },
  monitor: {
    label: "Monitor",
    cls: "bg-slate-100 text-slate-600",
    hint: "Different types but the right (commercial) page is already winning. Keep an eye on it.",
  },
};

function fmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n));
}
function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return u;
  }
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
  const [thresholds, setThresholds] = useState<{ nearGap: number; maxPos: number }>({ nearGap: 5, maxPos: 20 });
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
          setThresholds(d.thresholds ?? { nearGap: 5, maxPos: 20 });
          setLastComputed(d.lastComputed ?? null);
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
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
    () => groups.filter((g) => g.positionGap <= thresholds.nearGap && g.bestPosition <= thresholds.maxPos),
    [groups, thresholds],
  );
  const crossType = useMemo(() => groups.filter((g) => g.crossType), [groups]);

  const counts: Record<TabSlug, number> = {
    "near-position": near.length,
    "all-keywords": groups.length,
    "cross-type": crossType.length,
    "merge-blogs": merge.length,
  };
  const rows = tab === "near-position" ? near : tab === "all-keywords" ? groups : tab === "cross-type" ? crossType : [];

  const matchesSearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (g: CGroup) =>
      !s || g.query.toLowerCase().includes(s) || g.pages.some((p) => p.page.toLowerCase().includes(s));
  }, [search]);

  // Contextual counts: each dimension respects the OTHER active filters + search.
  const sevCounts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const g of rows) if (matchesSearch(g) && (!actionFilter || g.action === actionFilter)) c[g.severity]++;
    return c;
  }, [rows, matchesSearch, actionFilter]);
  const actionCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of rows) if (matchesSearch(g) && (!sevFilter || g.severity === sevFilter)) c[g.action] = (c[g.action] ?? 0) + 1;
    return c;
  }, [rows, matchesSearch, sevFilter]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (g) => matchesSearch(g) && (!sevFilter || g.severity === sevFilter) && (!actionFilter || g.action === actionFilter),
      ),
    [rows, matchesSearch, sevFilter, actionFilter],
  );
  const mergeFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return merge;
    return merge.filter((c) => c.label.toLowerCase().includes(s) || c.members.some((m) => m.url.toLowerCase().includes(s)));
  }, [merge, search]);

  const hasFilter = !!(search.trim() || sevFilter || actionFilter);
  function clearFilters() {
    setSearch("");
    setSevFilter(null);
    setActionFilter(null);
  }

  // Reset page on tab/filter change; drop severity/action filters when switching tabs.
  useEffect(() => setPage(1), [tab, search, sevFilter, actionFilter]);
  useEffect(() => {
    setSevFilter(null);
    setActionFilter(null);
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
            <span className={`ml-1.5 tabular-nums ${tab === t.slug ? "text-slate-300" : "text-slate-400"}`}>
              {counts[t.slug]}
            </span>
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-slate-500">{activeTab.desc}</p>

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search query or page URL…"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>

        {tab !== "merge-blogs" && (
          <>
            <span className="ml-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Severity</span>
            <FilterPill label="All" active={!sevFilter} onClick={() => setSevFilter(null)} />
            {(["high", "medium", "low"] as Severity[])
              .filter((s) => sevCounts[s] > 0 || sevFilter === s)
              .map((s) => (
                <FilterPill
                  key={s}
                  label={`${s[0].toUpperCase()}${s.slice(1)}`}
                  count={sevCounts[s]}
                  active={sevFilter === s}
                  cls={SEV_STYLE[s]}
                  onClick={() => setSevFilter(sevFilter === s ? null : s)}
                />
              ))}

            <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Action</span>
            <FilterPill label="All" active={!actionFilter} onClick={() => setActionFilter(null)} />
            {Object.keys(ACTION_STYLE)
              .filter((a) => (actionCounts[a] ?? 0) > 0 || actionFilter === a)
              .map((a) => (
                <FilterPill
                  key={a}
                  label={ACTION_STYLE[a].label}
                  count={actionCounts[a] ?? 0}
                  active={actionFilter === a}
                  cls={ACTION_STYLE[a].cls}
                  onClick={() => setActionFilter(actionFilter === a ? null : a)}
                />
              ))}
          </>
        )}

        {hasFilter && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {error && (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {tab === "merge-blogs" ? (
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
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 tabular-nums">
              {filtered.length} {filtered.length === 1 ? "conflict" : "conflicts"}
              {filtered.length !== rows.length ? ` of ${rows.length}` : ""}
            </span>
            <button
              onClick={() =>
                downloadCsv(
                  `cannibalization-${tab}.csv`,
                  ["query", "severity", "action", "page", "role", "type", "position", "impressions", "clicks"],
                  filtered.flatMap((g) =>
                    g.pages.map((p) => [
                      g.query,
                      g.severity,
                      g.action,
                      p.page,
                      p.role,
                      p.contentType ?? "",
                      p.position,
                      p.impressions,
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

          <div className="space-y-3">
            {paged.map((g) => (
              <ConflictCard key={g.query} g={g} />
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

function FilterPill({
  label,
  count,
  active,
  cls,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  cls?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {!active && cls && <span className={`h-2 w-2 rounded-full ${cls.split(" ")[0]}`} />}
      {label}
      {count != null && <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>}
    </button>
  );
}

function ConflictCard({ g }: { g: CGroup }) {
  const action = ACTION_STYLE[g.action] ?? ACTION_STYLE.differentiate;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV_STYLE[g.severity]}`}>
              {g.severity}
            </span>
            <span className="truncate font-medium text-slate-900">{g.query}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {g.pageCount} pages · {fmt(g.totalImpressions)} impr · {fmt(g.totalClicks)} clicks · gap{" "}
            {g.positionGap.toFixed(1)} · best pos {g.bestPosition.toFixed(1)}
            {g.commercialAtRisk && <span className="ml-2 font-medium text-red-600">⚠ money page losing</span>}
          </div>
        </div>
        <span title={action.hint} className={`shrink-0 cursor-help rounded-md px-2 py-1 text-xs font-medium ${action.cls}`}>
          {action.label}
        </span>
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
              <td className="max-w-xs truncate py-1.5 pr-3 align-top">
                <a href={p.page} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">
                  {shortUrl(p.page)}
                </a>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-xs text-slate-500 tabular-nums">
                pos {p.position.toFixed(1)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-xs text-slate-500 tabular-nums">
                {fmt(p.impressions)} impr
              </td>
              <td className="whitespace-nowrap py-1.5 text-right align-top text-xs text-slate-500 tabular-nums">
                {fmt(p.clicks)} clicks
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex justify-end">
        <a
          href={`/conflict-checker?url=${encodeURIComponent(g.primaryPage)}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          Analyze primary in Conflict Checker <ExternalLink size={11} />
        </a>
      </div>
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
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Star size={13} className="text-emerald-600" fill="currentColor" />
              <a href={winner.url} target="_blank" rel="noreferrer" className="text-slate-800 hover:underline">
                {shortUrl(winner.url)}
              </a>
              <span className="text-xs text-slate-400">keep</span>
            </div>
            <div className="mt-1 space-y-1 pl-5">
              {losers.map((m) => (
                <div key={m.url} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ArrowRight size={11} className="text-slate-300" />
                  <a href={m.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {shortUrl(m.url)}
                  </a>
                  <span className="text-slate-400">301 →</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
