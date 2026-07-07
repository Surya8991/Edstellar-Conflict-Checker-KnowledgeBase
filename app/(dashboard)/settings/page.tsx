"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, TypeChip } from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";
import { toast } from "@/app/components/Toast";

type ExType = "url" | "query";

interface Exclusion {
  id: number;
  name: string;
  patterns: string[];
  type: ExType;
  enabled: boolean;
}

/** Editable fields for a PATCH; patterns as a comma string or array. */
type PatchBody = { name?: string; enabled?: boolean; patterns?: string | string[]; type?: ExType };

interface MatchedUrl { url: string; title: string | null; content_type: string | null }

export default function SettingsPage() {
  const [items, setItems] = useState<Exclusion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Matched-URL viewer (what the URL patterns actually exclude).
  const [matches, setMatches] = useState<MatchedUrl[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [matchPage, setMatchPage] = useState(1);
  const [matchPageSize, setMatchPageSize] = useState(25);
  // URLs manually re-included (removed from exclusion despite matching a pattern).
  const [exceptions, setExceptions] = useState<string[]>([]);

  // Cluster tuning + GSC data.
  const [cluster, setCluster] = useState<{ topicOverlap: number; bodyFloor: number; mergeMaxSize: number } | null>(null);
  const [gscLast, setGscLast] = useState<string | null | undefined>(undefined);
  const [gscRefreshing, setGscRefreshing] = useState(false);

  // Keyword Cannibalization data.
  const [canniLast, setCanniLast] = useState<string | null | undefined>(undefined);
  const [canniGroups, setCanniGroups] = useState<number | null>(null);
  const [canniRefreshing, setCanniRefreshing] = useState(false);

  // Sitemap sync.
  const [sitemap, setSitemap] = useState<{ missingCount: number; byType: Record<string, number> } | null>(null);
  const [sitemapChecking, setSitemapChecking] = useState(false);
  const [sitemapSyncing, setSitemapSyncing] = useState(false);

  // Link Audit (301/308/404/410 -> auto-exclude). Runs daily via GitHub
  // Actions (.github/workflows/link-audit.yml); this card is the manual
  // "Run now" trigger + last-run summary.
  const [linkAuditLast, setLinkAuditLast] = useState<
    { at: string; checked: number; redirects: number; dead: number; excluded: number } | null | undefined
  >(undefined);
  const [linkAuditRunning, setLinkAuditRunning] = useState(false);

  async function loadItems() {
    try {
      const res = await fetch("/api/settings/exclusions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.exclusions ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadMatches(page = matchPage, pageSize = matchPageSize) {
    try {
      const res = await fetch(`/api/settings/exclusions/matches?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load matches");
      setMatches(data.urls ?? []);
      setMatchTotal(data.total ?? 0);
      setExceptions(data.exceptions ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function addException(url: string) {
    try {
      const res = await fetch("/api/settings/exclusions/exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await loadMatches(matchPage, matchPageSize);
      toast.success("Removed from exclusion.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function removeException(url: string) {
    try {
      const res = await fetch(`/api/settings/exclusions/exception?url=${encodeURIComponent(url)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await loadMatches(1, matchPageSize);
      setMatchPage(1);
      toast.success("Excluded again.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function loadCluster() {
    try {
      const res = await fetch("/api/settings/app");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load cluster settings.");
      setCluster(data.cluster);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't load cluster tuning settings.");
    }
  }
  async function loadGscLast() {
    try {
      const res = await fetch("/api/settings/gsc-refresh");
      const data = await res.json();
      if (res.ok) setGscLast(data.lastRefreshed ?? null);
    } catch { setGscLast(null); }
  }
  async function loadCanniLast() {
    try {
      const res = await fetch("/api/settings/cannibalization-refresh");
      const data = await res.json();
      if (res.ok) { setCanniLast(data.lastComputed ?? null); setCanniGroups(data.groups ?? 0); }
    } catch { setCanniLast(null); }
  }
  async function loadLinkAuditLast() {
    try {
      const res = await fetch("/api/settings/link-audit");
      const data = await res.json();
      if (res.ok) setLinkAuditLast(data.last ?? null);
    } catch { setLinkAuditLast(null); }
  }
  async function runLinkAudit() {
    setLinkAuditRunning(true);
    try {
      const res = await fetch("/api/settings/link-audit", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link audit failed");
      setLinkAuditLast({ at: data.at, checked: data.checked, redirects: data.redirects, dead: data.dead, excluded: data.excluded });
      toast.success(
        `Link audit: ${data.checked} checked, ${data.redirects} permanent redirects, ${data.dead} dead, ${data.excluded} excluded.`,
      );
      await Promise.all([loadItems(), loadMatches(matchPage, matchPageSize)]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLinkAuditRunning(false);
    }
  }
  useEffect(() => {
    loadItems(); loadMatches(1, matchPageSize); loadCluster(); loadGscLast(); loadCanniLast(); loadLinkAuditLast();
    /* eslint-disable-next-line */
  }, []);

  async function saveCluster(next: { topicOverlap: number; bodyFloor: number; mergeMaxSize: number }) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/app", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setCluster(data.cluster);
      toast.success("Cluster settings saved. Rescan Content Clusters to apply.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function checkSitemap() {
    setSitemapChecking(true);
    try {
      const res = await fetch("/api/settings/sitemap-sync");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      setSitemap({ missingCount: data.missingCount ?? 0, byType: data.byType ?? {} });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSitemapChecking(false);
    }
  }
  async function syncSitemap() {
    setSitemapSyncing(true);
    try {
      const res = await fetch("/api/settings/sitemap-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast.success(`Added ${data.added} page${data.added === 1 ? "" : "s"} to the database.`);
      await checkSitemap();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSitemapSyncing(false);
    }
  }

  async function refreshGsc() {
    setGscRefreshing(true);
    try {
      const res = await fetch("/api/settings/gsc-refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      toast.success(`GSC refreshed: ${data.pageRows} page rows, ${data.queryRows} query rows.`);
      await loadGscLast();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGscRefreshing(false);
    }
  }

  async function refreshCanni() {
    setCanniRefreshing(true);
    try {
      const res = await fetch("/api/settings/cannibalization-refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      toast.success(`Keyword cannibalization: ${data.groups} conflict groups from ${data.rowsScanned} rows.`);
      await loadCanniLast();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCanniRefreshing(false);
    }
  }

  async function refresh() {
    await Promise.all([loadItems(), loadMatches(matchPage, matchPageSize)]);
  }

  async function patch(id: number, body: PatchBody) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/exclusions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await refresh();
      toast.success("Saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function add(type: ExType, name: string, patterns: string) {
    if (!name.trim() || !patterns.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/exclusions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, patterns, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Add failed");
      await refresh();
      toast.success("Added.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/exclusions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await refresh();
      toast.success("Removed.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const urlItems = (items ?? []).filter((i) => i.type === "url" || i.type == null);
  const queryItems = (items ?? []).filter((i) => i.type === "query");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage what's excluded from the analysis views. Blog series are hidden from Content Clusters and Conflict Checker matches; keyword queries are hidden from the GSC panel. Excluded pages stay in the Edstellar Database and in Search Console."
      />
      <div className="max-w-4xl space-y-4 p-8">
        {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

        {/* Content Clusters tuning */}
        {cluster && <ClusterTuningCard cluster={cluster} saving={saving} onSave={saveCluster} />}

        {/* Search Console data */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Search Console data</h2>
              <p className="mt-1 text-xs text-slate-500">
                Per-page GSC metrics (1/3/6-month totals + top queries) powering the Content Clusters panel.
                {" "}
                Last refreshed:{" "}
                <strong className="text-slate-700">
                  {gscLast === undefined ? "…" : gscLast ? new Date(gscLast).toLocaleString() : "never"}
                </strong>
                . Refreshes automatically once a day.
              </p>
            </div>
            <button
              onClick={refreshGsc}
              disabled={gscRefreshing}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {gscRefreshing ? "Refreshing…" : "Refresh now"}
            </button>
          </div>
        </Card>

        {/* Keyword Cannibalization data */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Keyword Cannibalization data</h2>
              <p className="mt-1 text-xs text-slate-500">
                Pre-computed query→pages conflicts (last 3 full months of GSC) powering the Keyword Cannibalization tool.
                {" "}
                {canniGroups != null && <><strong className="text-slate-700">{canniGroups.toLocaleString()}</strong> conflict groups · </>}
                Last computed:{" "}
                <strong className="text-slate-700">
                  {canniLast === undefined ? "…" : canniLast ? new Date(canniLast).toLocaleString() : "never"}
                </strong>
                . Refreshes automatically once a day.
              </p>
            </div>
            <button
              onClick={refreshCanni}
              disabled={canniRefreshing}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {canniRefreshing ? "Scanning…" : "Rescan now"}
            </button>
          </div>
        </Card>

        {/* Link Audit - 301/308/404/410 -> auto-exclude */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Link Audit</h2>
              <p className="mt-1 text-xs text-slate-500">
                Probes the whole corpus for 301/308 (permanent move) and 404/410 (dead) pages
                and auto-excludes them from Content Clusters + Conflict Checker matches (they
                stay in the Database and in Search Console). Self-healing - a page that starts
                resolving 200 again drops back out on the next run.
                {" "}
                {linkAuditLast != null && (
                  <>
                    <strong className="text-slate-700">{linkAuditLast.excluded.toLocaleString()}</strong>{" "}
                    currently excluded ({linkAuditLast.redirects.toLocaleString()} redirects,{" "}
                    {linkAuditLast.dead.toLocaleString()} dead, of {linkAuditLast.checked.toLocaleString()}{" "}
                    checked) ·{" "}
                  </>
                )}
                Last run:{" "}
                <strong className="text-slate-700">
                  {linkAuditLast === undefined
                    ? "…"
                    : linkAuditLast
                      ? new Date(linkAuditLast.at).toLocaleString()
                      : "never"}
                </strong>
                . Runs automatically every day at 9:00 AM IST via GitHub Actions.
              </p>
            </div>
            <button
              onClick={runLinkAudit}
              disabled={linkAuditRunning}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {linkAuditRunning ? "Auditing…" : "Run now"}
            </button>
          </div>
        </Card>

        {/* Sitemap sync */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Sitemap sync</h2>
              <p className="mt-1 text-xs text-slate-500">
                Find pages in the live sitemap that aren&apos;t in the Edstellar Database yet and add them with their detected type.
                {sitemap && (
                  <>
                    {" "}
                    <strong className="text-slate-700">{sitemap.missingCount.toLocaleString()}</strong> missing
                    {sitemap.missingCount > 0 && Object.keys(sitemap.byType).length > 0 && (
                      <span className="text-slate-400">
                        {" "}({Object.entries(sitemap.byType).map(([t, n]) => `${n} ${t}`).join(", ")})
                      </span>
                    )}.
                  </>
                )}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Added pages carry their type only - run <code className="rounded bg-slate-100 px-1">npm run ingest</code> to crawl + embed them so they enter Clusters/Checker.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={checkSitemap}
                disabled={sitemapChecking || sitemapSyncing}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {sitemapChecking ? "Checking…" : "Check sitemap"}
              </button>
              {sitemap && sitemap.missingCount > 0 && (
                <button
                  onClick={syncSitemap}
                  disabled={sitemapSyncing}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {sitemapSyncing ? "Adding…" : `Add ${sitemap.missingCount} page${sitemap.missingCount === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* URL / blog-series exclusions */}
        <ExclusionSection
          title="Excluded blog series (by URL)"
          help={
            <>
              A page is excluded when its URL contains any of these patterns (case-insensitive).
              Use a <strong>slug substring</strong> (e.g. <code className="rounded bg-slate-100 px-1">skills-in-demand-in-</code>)
              or paste a <strong>full URL</strong> to exclude a single page. Comma-separate multiple.
            </>
          }
          type="url"
          items={items === null ? null : urlItems}
          placeholderPatterns="slug substring or full URL, comma-separated"
          saving={saving}
          onAdd={add}
          onPatch={patch}
          onRemove={remove}
        />

        {/* Keyword-query exclusions */}
        <ExclusionSection
          title="Excluded keyword queries"
          help={
            <>
              GSC queries containing any of these substrings are hidden from the
              Content Clusters &ldquo;top queries&rdquo; tables (case-insensitive). Comma-separate multiple.
            </>
          }
          type="query"
          items={items === null ? null : queryItems}
          placeholderPatterns="e.g. can you provide, provide photos"
          saving={saving}
          onAdd={add}
          onPatch={patch}
          onRemove={remove}
        />

        {/* Matched URLs viewer */}
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Currently excluded URLs</h3>
          <p className="mt-1 text-xs text-slate-500">
            The {matchTotal.toLocaleString()} corpus page{matchTotal === 1 ? "" : "s"} the URL patterns above match right now.
          </p>
          <ul className="mt-3 divide-y divide-slate-50">
            {matches.length === 0 && <li className="py-3 text-sm text-slate-400">No pages match the current URL patterns.</li>}
            {matches.map((m) => (
              <li key={m.url} className="flex items-center gap-2 py-1.5 text-sm">
                {m.content_type && <TypeChip type={m.content_type} size="xs" />}
                <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-slate-700 hover:underline" title={m.title || m.url}>
                  {m.url}
                </a>
                <button
                  onClick={() => addException(m.url)}
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-rose-300 hover:text-rose-600"
                  title="Stop excluding this specific page (keep it in Clusters + Conflict Checker)"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {matchTotal > matchPageSize && (
            <div className="mt-3">
              <Pagination
                page={matchPage}
                pageSize={matchPageSize}
                total={matchTotal}
                onJump={(p) => { setMatchPage(p); loadMatches(p, matchPageSize); }}
                onPageSize={(s) => { setMatchPageSize(s); setMatchPage(1); loadMatches(1, s); }}
                pageSizes={[25, 50, 100]}
                unit="URLs"
              />
            </div>
          )}
        </Card>

        {/* Manually re-included (exception) pages */}
        {exceptions.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Manually re-included pages</h3>
            <p className="mt-1 text-xs text-slate-500">
              These {exceptions.length} page{exceptions.length === 1 ? "" : "s"} match an exclusion pattern but were removed from the exclusion, so they still appear in Clusters + Conflict Checker.
            </p>
            <ul className="mt-3 divide-y divide-slate-50">
              {exceptions.map((url) => (
                <li key={url} className="flex items-center gap-2 py-1.5 text-sm">
                  <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-slate-700 hover:underline" title={url}>
                    {url}
                  </a>
                  <button
                    onClick={() => removeException(url)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
                    title="Exclude this page again"
                  >
                    Exclude again
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function ClusterTuningCard({
  cluster, saving, onSave,
}: {
  cluster: { topicOverlap: number; bodyFloor: number; mergeMaxSize: number };
  saving: boolean;
  onSave: (v: { topicOverlap: number; bodyFloor: number; mergeMaxSize: number }) => void;
}) {
  const [overlap, setOverlap] = useState(String(cluster.topicOverlap));
  const [floor, setFloor] = useState(String(cluster.bodyFloor));
  const [maxSize, setMaxSize] = useState(String(cluster.mergeMaxSize));
  // Re-sync local edit buffers whenever the server-truth prop changes for a
  // reason other than this card's own save (e.g. the server clamps a value,
  // or another tab's edit is reloaded) - otherwise the inputs silently show
  // stale values while `dirty` compares against the new prop (§19C).
  useEffect(() => {
    setOverlap(String(cluster.topicOverlap));
    setFloor(String(cluster.bodyFloor));
    setMaxSize(String(cluster.mergeMaxSize));
  }, [cluster.topicOverlap, cluster.bodyFloor, cluster.mergeMaxSize]);
  const dirty =
    Number(overlap) !== cluster.topicOverlap ||
    Number(floor) !== cluster.bodyFloor ||
    Number(maxSize) !== cluster.mergeMaxSize;
  const parsedOverlap = Number(overlap);
  const parsedFloor = Number(floor);
  const parsedMaxSize = Number(maxSize);
  const invalid =
    overlap.trim() === "" || floor.trim() === "" || maxSize.trim() === "" ||
    !Number.isFinite(parsedOverlap) || !Number.isFinite(parsedFloor) || !Number.isFinite(parsedMaxSize);
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Content Clusters tuning</h2>
      <p className="mt-1 text-xs text-slate-500">
        How aggressively pages are grouped. Save, then hit &ldquo;Rescan&rdquo; on Content Clusters to apply.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumField label="Topic overlap" hint="Higher = stricter grouping (0.05-0.95)" value={overlap} onChange={setOverlap} step="0.01" />
        <NumField label="Body floor" hint="Min content similarity to the pillar (0.3-0.98)" value={floor} onChange={setFloor} step="0.01" />
        <NumField label="Merge max size" hint="Same-type clusters bigger than this get 'differentiate', not 'merge' (2-50)" value={maxSize} onChange={setMaxSize} step="1" />
      </div>
      <div className="mt-3">
        <button
          onClick={() => onSave({ topicOverlap: parsedOverlap, bodyFloor: parsedFloor, mergeMaxSize: parsedMaxSize })}
          disabled={saving || !dirty || invalid}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        {invalid && (
          <p className="mt-2 text-xs text-red-600">All three fields must be valid numbers.</p>
        )}
      </div>
    </Card>
  );
}

function NumField({
  label, hint, value, onChange, step,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-slate-900"
      />
      <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span>
    </label>
  );
}

function ExclusionSection({
  title, help, type, items, placeholderPatterns, saving, onAdd, onPatch, onRemove,
}: {
  title: string;
  help: React.ReactNode;
  type: ExType;
  items: Exclusion[] | null;
  placeholderPatterns: string;
  saving: boolean;
  onAdd: (type: ExType, name: string, patterns: string) => Promise<boolean | undefined>;
  onPatch: (id: number, body: PatchBody) => void;
  onRemove: (id: number) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPatterns, setNewPatterns] = useState("");
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{help}</p>

      <div className="mt-4 divide-y divide-slate-100">
        {items === null && <div className="py-3 text-sm text-slate-400">Loading…</div>}
        {items?.length === 0 && <div className="py-3 text-sm text-slate-400">Nothing here yet.</div>}
        {items?.map((it) => (
          <ExclusionRow key={it.id} item={it} saving={saving} onPatch={onPatch} onRemove={onRemove} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <input
          value={newPatterns}
          onChange={(e) => setNewPatterns(e.target.value)}
          placeholder={placeholderPatterns}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          onClick={async () => { if (await onAdd(type, newName, newPatterns)) { setNewName(""); setNewPatterns(""); } }}
          disabled={saving || !newName.trim() || !newPatterns.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </Card>
  );
}

function ExclusionRow({
  item, saving, onPatch, onRemove,
}: {
  item: Exclusion;
  saving: boolean;
  onPatch: (id: number, body: PatchBody) => void;
  onRemove: (id: number) => void;
}) {
  const [name, setName] = useState(item.name);
  const [patterns, setPatterns] = useState(item.patterns.join(", "));
  const dirty = name !== item.name || patterns !== item.patterns.join(", ");
  const muted = item.enabled ? "border-slate-300" : "border-slate-200 text-slate-400";

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <input
        type="checkbox"
        checked={item.enabled}
        disabled={saving}
        title={item.enabled ? "Enabled" : "Disabled"}
        onChange={(e) => onPatch(item.id, { enabled: e.target.checked })}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`w-48 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-slate-900 ${muted}`}
      />
      <input
        value={patterns}
        onChange={(e) => setPatterns(e.target.value)}
        className={`min-w-0 flex-1 rounded-lg border px-3 py-1.5 font-mono text-xs outline-none focus:border-slate-900 ${muted}`}
      />
      <button
        onClick={() => onPatch(item.id, { name, patterns })}
        disabled={saving || !dirty}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        Save
      </button>
      <button
        onClick={() => onRemove(item.id)}
        disabled={saving}
        className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}
