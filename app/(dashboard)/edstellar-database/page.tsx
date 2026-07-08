"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, TYPE_COLORS } from "@/app/components/ui";
import { Pagination as SharedPagination } from "@/app/components/Pagination";
import { FilterSelect, SearchBox } from "@/app/components/Filters";
import { sameUrl } from "@/lib/url";

interface PageRow {
  id: number;
  url: string;
  title: string | null;
  h1: string | null;
  meta_description: string | null;
  content_type: string | null;
  course_type: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  lastmod: string | null;
  embedded: boolean;
  // Batch D SEO columns
  owner_url: string | null;
  canonical_url: string | null;
  http_status: number | null;
  image_count: number | null;
  images_no_alt: number | null;
  is_stale: boolean | null;
  stale_reason: string | null;
  // #1 GSC query for the page over the last full month (branded/excluded stripped),
  // with that keyword's last-month clicks / impressions / position.
  primary_keyword: { query: string; clicks: number; impressions: number; position: number } | null;
}

// Toggleable table columns (§33). Title is the row identity and always shown.
// `category` + `signals` start hidden per the user's default.
const COLUMNS = [
  { key: "h1", label: "H1" },
  { key: "description", label: "Description" },
  { key: "type", label: "Type" },
  { key: "keywords", label: "Primary Keyword" },
  { key: "category", label: "Category", defaultHidden: true },
  { key: "signals", label: "Signals", defaultHidden: true },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_VISIBLE: Record<ColKey, boolean> = {
  h1: true, description: true, type: true, keywords: true, category: false, signals: false,
};
const COLS_STORAGE_KEY = "corpus.visibleCols.v1";
const COMPACT_STORAGE_KEY = "corpus.compactRows.v1";

interface ByType { content_type: string; n: number }
interface ByCourseType { course_type: string; n: number }
interface CatCount { category: string; n: number }

// Type colors moved to app/components/ui.tsx and imported above.

const COURSE_TYPES = ["Behavioral", "Compliance", "IT & Technical", "Leadership", "Management", "Social Impact"];

const PAGE_SIZES = [50, 100, 200, 500];

export default function CorpusPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [courseType, setCourseType] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [rows, setRows] = useState<PageRow[]>([]);
  const [byType, setByType] = useState<ByType[]>([]);
  const [byCourseType, setByCourseType] = useState<ByCourseType[]>([]);
  const [topCategories, setTopCategories] = useState<CatCount[]>([]);
  const [redirect404, setRedirect404] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalPages, setTotalPages] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Column visibility (§33). Persisted so a choice sticks across reloads.
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE);
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (raw) setVisibleCols((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  const show = (k: ColKey) => visibleCols[k];
  const toggleCol = (k: ColKey) =>
    setVisibleCols((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  // 1 (Title, always) + the visible optional columns - used for empty/error colSpan.
  const colSpan = 1 + COLUMNS.filter((c) => visibleCols[c.key]).length;

  // Compact rows (§35): clamp long cells (Description, Title) to one line so the
  // table reads clean. Default ON; toggle persisted.
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMPACT_STORAGE_KEY);
      if (raw != null) setCompact(raw === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCompact = () =>
    setCompact((c) => {
      const next = !c;
      try {
        localStorage.setItem(COMPACT_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  // Guards against out-of-order responses: rapid filter changes can let an
  // older request resolve after a newer one, silently showing a stale page
  // (§19B). Only the most recently *started* request is allowed to apply.
  const loadReqIdRef = useRef(0);

  async function load(targetPage = page) {
    const reqId = ++loadReqIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({
        q, type, courseType, category, tag, limit: String(pageSize), page: String(targetPage),
      });
      const res = await fetch(`/api/pages?${qs}`);
      const data = await res.json();
      if (reqId !== loadReqIdRef.current) return; // superseded by a newer request
      if (!res.ok) throw new Error(data.error || "Failed to load pages.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setByType(data.byType ?? []);
      setByCourseType(data.byCourseType ?? []);
      setTopCategories(data.topCategories ?? []);
      setRedirect404(data.redirect404 ?? 0);
      setPage(data.page ?? targetPage);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      if (reqId !== loadReqIdRef.current) return; // superseded by a newer request
      setLoadError((e as Error).message);
      setRows([]);
      setTotal(0);
    } finally {
      if (reqId === loadReqIdRef.current) setLoading(false);
    }
  }

  // Download the whole filtered corpus as CSV (server-side export, no paging).
  function downloadCsv() {
    const qs = new URLSearchParams({ q, type, courseType, category, tag });
    window.open(`/api/pages/export?${qs}`, "_blank");
  }

  // Upload a CSV to upsert corpus metadata by URL, then reload.
  async function uploadCsv(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/pages/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: await file.text(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportMsg(
        `Imported ${data.received} rows - ${data.upserted} added/updated, ${data.deleted ?? 0} removed.`,
      );
      await load(1);
    } catch (e) {
      setImportMsg((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // Download a template CSV so uploads match the expected columns exactly.
  function downloadSampleCsv() {
    const header =
      "url,title,h1,meta_description,content_type,course_type,category,subcategory,tags,lastmod,action";
    const addRow = [
      "https://www.edstellar.com/example-blog",
      "Example Blog Title",
      "Example H1 Heading",
      '"A short meta description, may contain commas."',
      "blog",
      "",
      "Leadership & Management",
      "",
      "leadership|management",
      "2026-01-15",
      "", // blank = add/update
    ].join(",");
    const courseRow = [
      "https://www.edstellar.com/example-course",
      "Example Course Title",
      "Example Course H1",
      '"Course meta description."',
      "course",
      "Leadership",
      "Leadership & Management",
      "",
      "leadership",
      "2026-01-15",
      "", // blank = add/update
    ].join(",");
    const deleteRow = [
      "https://www.edstellar.com/page-to-remove",
      "", "", "", "", "", "", "", "", "",
      "delete", // action=delete removes this url
    ].join(",");
    const blob = new Blob(
      [`${header}\r\n${addRow}\r\n${courseRow}\r\n${deleteRow}\r\n`],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "corpus-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, courseType, category, tag, pageSize]);

  const totalAll = byType.reduce((s, x) => s + x.n, 0);

  return (
    <div>
      <PageHeader
        title="Edstellar Database"
        subtitle="The existing-content index every check is compared against - categorised from the Edstellar catalog."
        right={
          <span className="text-sm text-slate-500">
            {total.toLocaleString()} / {totalAll.toLocaleString()} pages
          </span>
        }
      />
      <div className="space-y-5 p-8">
        {/* Breakdown by content_type */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <BreakdownCard label="all" n={totalAll} active={type === ""} onClick={() => { setType(""); setCourseType(""); setCategory(""); setTag(""); }} />
          {byType.map((b) => (
            <BreakdownCard
              key={b.content_type}
              label={b.content_type.replace("-", " ")}
              n={b.n}
              active={type === b.content_type}
              onClick={() => { setType(type === b.content_type ? "" : b.content_type); setCourseType(""); setCategory(""); setTag(""); }}
              colorClass={TYPE_COLORS[b.content_type]}
            />
          ))}
          {/* Virtual bucket: pages that 301/302 redirect elsewhere or return 4xx/5xx.
              Pulled OUT of the content-type counts above (§29). */}
          <BreakdownCard
            label="Redirect / 404"
            n={redirect404}
            active={type === "redirect-404"}
            onClick={() => { setType(type === "redirect-404" ? "" : "redirect-404"); setCourseType(""); setCategory(""); setTag(""); }}
            colorClass="text-rose-600"
          />
        </div>

        {/* The 6 course types - visible always, highlights when filtering courses.
            §18I: 6+ options → FilterSelect, not hand-rolled chips. */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <FilterSelect
            label="Course type"
            value={courseType}
            onChange={(v) => { setType(v ? "course" : type); setCourseType(v); }}
            options={COURSE_TYPES.map((ct) => ({
              value: ct,
              label: ct,
              count: byCourseType.find((b) => b.course_type === ct)?.n ?? 0,
            }))}
            allLabel="All course types"
          />
          {courseType && (
            <button onClick={() => setCourseType("")} className="text-xs text-slate-500 hover:text-slate-700">clear ×</button>
          )}
        </div>

        {/* Top categories - dropdown (20+ options would wrap into a chip wall) */}
        {topCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <FilterSelect
              label="Category"
              value={category}
              onChange={setCategory}
              options={topCategories.map((c) => ({ value: c.category, label: c.category, count: c.n }))}
              allLabel="All categories"
            />
            {category && (
              <button onClick={() => setCategory("")} className="text-xs text-slate-500 hover:text-slate-700">clear ×</button>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); load(1); }}
          className="flex flex-wrap gap-2"
        >
          <SearchBox value={q} onChange={setQ} placeholder="Search title or URL…" className="min-w-[16rem] flex-1" />
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
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
            title="Export the filtered corpus as CSV"
          >
            Download CSV
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400">
            {importing ? "Uploading…" : "Upload CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCsv(f);
                e.target.value = "";
              }}
            />
          </label>
        </form>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>
            Upload matches on <code className="rounded bg-slate-100 px-1">url</code>; columns:{" "}
            <code className="rounded bg-slate-100 px-1">url, title, h1, meta_description, content_type, course_type, category, subcategory, tags, lastmod, action</code>{" "}
            (tags <code className="rounded bg-slate-100 px-1">|</code>-separated;{" "}
            <code className="rounded bg-slate-100 px-1">action=delete</code> removes a row, blank adds/updates).
          </span>
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Download sample CSV
          </button>
          {importMsg && <span className="text-slate-500">· {importMsg}</span>}
        </div>

        {/* Compact rows (§35) + Column visibility (§33) */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleCompact}
            aria-pressed={compact}
            title="Clamp long text (Description, Title) to one line for a cleaner table"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              compact
                ? "border-slate-800 bg-slate-800 text-white hover:bg-slate-700"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            Compact rows
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setColsOpen((o) => !o)}
              aria-expanded={colsOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Columns
              <span className="text-xs text-slate-400">
                {`(${COLUMNS.filter((c) => visibleCols[c.key]).length + 1}/${COLUMNS.length + 1})`}
              </span>
            </button>
            {colsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColsOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Show columns
                  </div>
                  <label className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-400">
                    <input type="checkbox" checked disabled className="h-3.5 w-3.5 rounded border-slate-300" />
                    Title <span className="text-[10px] uppercase">(always)</span>
                  </label>
                  {COLUMNS.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCols[c.key]}
                        onChange={() => toggleCol(c.key)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3 font-medium">Title</th>
                {show("h1") && <th className="px-4 py-3 font-medium">H1</th>}
                {show("description") && <th className="px-4 py-3 font-medium">Description</th>}
                {show("type") && <th className="px-4 py-3 font-medium">Type</th>}
                {show("keywords") && <th className="px-4 py-3 font-medium">Primary Keyword</th>}
                {show("category") && <th className="px-4 py-3 font-medium">Category</th>}
                {show("signals") && <th className="px-4 py-3 font-medium">Signals</th>}
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
                      title={compact ? r.title || r.url : undefined}
                      className={`text-slate-900 hover:underline ${compact ? "max-w-xs line-clamp-2" : ""}`}
                    >
                      {r.title || r.url}
                    </a>
                    {!r.embedded && (
                      <span className={`text-xs text-amber-600 ${compact ? "" : "ml-2"}`}>not embedded</span>
                    )}
                  </td>
                  {show("h1") && (
                  <td className="px-4 py-2.5 text-slate-600">
                    <div
                      className={compact ? "max-w-xs line-clamp-2" : "max-w-xs whitespace-normal break-words"}
                      title={compact ? r.h1 ?? undefined : undefined}
                    >
                      {r.h1 || <span className="text-slate-300">-</span>}
                    </div>
                  </td>
                  )}
                  {show("description") && (
                  <td className="px-4 py-2.5 text-slate-600">
                    <div
                      className={compact ? "max-w-sm line-clamp-2" : "max-w-sm whitespace-normal break-words"}
                      title={compact ? r.meta_description ?? undefined : undefined}
                    >
                      {r.meta_description || <span className="text-slate-300">-</span>}
                    </div>
                  </td>
                  )}
                  {show("type") && (
                  <td className="px-4 py-2.5">
                    {r.content_type && (
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[r.content_type] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {r.content_type}
                      </span>
                    )}
                  </td>
                  )}
                  {show("keywords") && (
                  <td className="px-4 py-2.5">
                    {r.primary_keyword ? (
                      <div className="max-w-xs">
                        <span
                          className="inline-flex max-w-full truncate rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700"
                          title={r.primary_keyword.query}
                        >
                          {r.primary_keyword.query}
                        </span>
                        <div
                          className="mt-1 text-[11px] tabular-nums text-slate-400"
                          title="Last full month (GSC)"
                        >
                          {r.primary_keyword.clicks.toLocaleString()} clicks ·{" "}
                          {r.primary_keyword.impressions.toLocaleString()} impr · pos{" "}
                          {r.primary_keyword.position.toFixed(1)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  )}
                  {show("category") && (
                  <td className="px-4 py-2.5 text-slate-600">
                    <div>{r.category || <span className="text-slate-300">-</span>}</div>
                    {r.subcategory && <div className="text-xs text-slate-400">{r.subcategory}</div>}
                  </td>
                  )}
                  {show("signals") && (
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.owner_url && r.owner_url === r.url && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Owner</span>
                      )}
                      {r.is_stale && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title={r.stale_reason ?? "Stale"}>Stale</span>
                      )}
                      {r.images_no_alt != null && r.images_no_alt > 0 && (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700" title={`${r.images_no_alt} of ${r.image_count} images missing alt`}>
                          alt: {r.images_no_alt}
                        </span>
                      )}
                      {r.http_status != null && r.http_status >= 400 && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700" title={`Returns HTTP ${r.http_status}`}>
                          {r.http_status}
                        </span>
                      )}
                      {r.canonical_url && !sameUrl(r.canonical_url, r.url) && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700" title={`redirects → ${r.canonical_url}`}>
                          redirect
                        </span>
                      )}
                      {(r.tags ?? []).slice(0, 2).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTag(t)}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
                          title="Filter by this tag"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  )}
                </tr>
              ))}
              {!loading && loadError && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-red-600">
                    Couldn&apos;t load pages: {loadError}
                  </td>
                </tr>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">
                    No pages match. Try clearing the active filters above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <SharedPagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onJump={(p) => load(p)}
          onPageSize={(n) => setPageSize(n)}
          unit="pages"
        />
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
