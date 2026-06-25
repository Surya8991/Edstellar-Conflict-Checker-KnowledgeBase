"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/app/components/ui";
import { Pagination } from "@/app/components/Pagination";

const TABS = ["Meta", "Broken Links", "Duplicates", "Health Score"] as const;
type Tab = typeof TABS[number];

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>("Meta");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [flagFilter, setFlagFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    const kind = { Meta: "meta", "Broken Links": "links", Duplicates: "duplicates", "Health Score": "health" }[tab];
    const res = await fetch(`/api/audit?kind=${kind}&limit=1000`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => { load(); setFlagFilter(""); }, [tab]);

  return (
    <div>
      <PageHeader
        title="Content Audit"
        subtitle="Title / meta length, broken links, duplicates, and composite per-page health."
      />
      <div className="space-y-5 p-8">
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <div className="text-sm text-slate-400">Loading…</div>}

        {tab === "Meta" && data?.rows && (
          <MetaTab rows={data.rows} flagFilter={flagFilter} onFlagFilter={setFlagFilter} />
        )}
        {tab === "Broken Links" && data?.rows && <LinksTab rows={data.rows} audited={data.audited} />}
        {tab === "Duplicates" && data && <DupesTab data={data} />}
        {tab === "Health Score" && data?.rows && <HealthTab rows={data.rows} />}
      </div>
    </div>
  );
}

function MetaTab({ rows, flagFilter, onFlagFilter }: { rows: any[]; flagFilter: string; onFlagFilter: (s: string) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => { setPage(1) }, [flagFilter]);

  const allFlags = Array.from(new Set(rows.flatMap((r) => r.flags ?? []))).sort();
  const filtered = flagFilter ? rows.filter((r) => r.flags?.includes(flagFilter)) : rows;
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (!rows.length) return <Card className="text-sm text-slate-500">No meta issues found — everything within recommended length.</Card>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Flag filter:</span>
        <button onClick={() => onFlagFilter("")} className={`rounded px-2 py-1 ${!flagFilter ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>all ({rows.length})</button>
        {allFlags.map((f) => {
          const n = rows.filter((r) => r.flags?.includes(f)).length;
          return (
            <button key={f} onClick={() => onFlagFilter(flagFilter === f ? "" : f)}
              className={`rounded px-2 py-1 ${flagFilter === f ? "bg-amber-500 text-white" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
              {f} ({n})
            </button>
          );
        })}
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Title len</th>
              <th className="px-4 py-3 font-medium">Meta len</th>
              <th className="px-4 py-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                <td className="max-w-md truncate px-4 py-2">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">{r.title || r.url}</a>
                </td>
                <td className="px-4 py-2 tabular-nums">{r.title_len}</td>
                <td className="px-4 py-2 tabular-nums">{r.meta_len}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.flags?.map((f: string) => (
                      <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{f}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onJump={setPage} onPageSize={setPageSize} unit="pages" />
    </div>
  );
}

function LinksTab({ rows, audited }: { rows: any[]; audited: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const total = audited ?? 0;
  if (total === 0) return (
    <Card className="text-sm text-slate-600">
      Link audit hasn't run yet. The weekly cron will populate this within 7 days, or ask an admin to trigger the audit manually.
    </Card>
  );
  if (!rows.length) return <Card className="text-sm text-emerald-700">✓ All {total.toLocaleString()} audited URLs return a healthy status.</Card>;
  return (
    <div className="space-y-3">
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
        {total.toLocaleString()} URLs audited · <strong className="text-red-600">{rows.length}</strong> with errors
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Last audited</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="max-w-md truncate px-4 py-2">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">{r.title || r.url}</a>
              </td>
              <td className="px-4 py-2"><span className="rounded bg-red-100 px-2 py-0.5 text-xs font-mono text-red-700">{r.http_status}</span></td>
              <td className="px-4 py-2 capitalize text-slate-500">{r.content_type}</td>
              <td className="px-4 py-2 text-xs text-slate-400">{r.last_audited_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
      <Pagination page={page} pageSize={pageSize} total={rows.length} onJump={setPage} onPageSize={setPageSize} unit="broken pages" />
    </div>
  );
}

function DupesTab({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Duplicate titles</h3>
        {!data.duplicateTitles?.length ? <p className="text-sm text-slate-500">No duplicate titles.</p> : (
          <ul className="space-y-2">
            {data.duplicateTitles.map((d: any, i: number) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium text-slate-900">{d.title}</div>
                <div className="mt-1 text-xs text-slate-500">{d.n} pages</div>
                <ul className="mt-1 space-y-0.5">
                  {d.urls.map((u: string) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="text-xs text-slate-600 hover:underline">{u}</a></li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Duplicate H1s</h3>
        {!data.duplicateH1s?.length ? <p className="text-sm text-slate-500">No duplicate H1s.</p> : (
          <ul className="space-y-2">
            {data.duplicateH1s.map((d: any, i: number) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium text-slate-900">{d.h1}</div>
                <div className="mt-1 text-xs text-slate-500">{d.n} pages</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type Band = "all" | "weak" | "medium" | "strong";
const BAND_RANGE: Record<Band, [number, number]> = {
  all: [0, 100],
  weak: [0, 59],
  medium: [60, 79],
  strong: [80, 100],
};
function bandOf(h: number): Exclude<Band, "all"> {
  if (h < 60) return "weak";
  if (h < 80) return "medium";
  return "strong";
}

function HealthTab({ rows }: { rows: any[] }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Lower bound — show pages with health >= minHealth. Default 0 = all rows.
  // The intent of this page is to surface low-health pages for fixing, so
  // rows are sorted ascending (weakest first) regardless of the filter.
  const [minHealth, setMinHealth] = useState(0);
  const [band, setBand] = useState<Band>("all");
  useEffect(() => { setPage(1) }, [minHealth, band]);

  // Severity-band counts across the full corpus (not the filtered view) so the
  // chip labels stay stable as you adjust the slider.
  const bandCounts = { weak: 0, medium: 0, strong: 0 };
  for (const r of rows) bandCounts[bandOf(r.health ?? 0)]++;

  const [lo, hi] = BAND_RANGE[band];
  // Combine band (chip) + minHealth (slider). Slider tightens the floor,
  // never widens beyond what the chip allows.
  const effectiveLo = Math.max(lo, minHealth);
  const filtered = rows
    .filter((r) => {
      const h = r.health ?? 0;
      return h >= effectiveLo && h <= hi;
    })
    .sort((a, b) => (a.health ?? 0) - (b.health ?? 0));
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Severity:</span>
        <button onClick={() => setBand("all")} className={`rounded px-2 py-1 ${band === "all" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
          all ({rows.length})
        </button>
        <button onClick={() => setBand("weak")} className={`rounded px-2 py-1 ${band === "weak" ? "bg-red-600 text-white" : "border border-red-200 bg-red-50 text-red-700"}`}>
          weak &lt;60 ({bandCounts.weak})
        </button>
        <button onClick={() => setBand("medium")} className={`rounded px-2 py-1 ${band === "medium" ? "bg-amber-500 text-white" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
          medium 60–79 ({bandCounts.medium})
        </button>
        <button onClick={() => setBand("strong")} className={`rounded px-2 py-1 ${band === "strong" ? "bg-emerald-600 text-white" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          strong ≥80 ({bandCounts.strong})
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>Min health:</span>
        <input
          type="range"
          min={0}
          max={100}
          value={minHealth}
          onChange={(e) => setMinHealth(Number(e.target.value))}
          className="w-32"
        />
        <span className="tabular-nums w-8 text-right">{minHealth}</span>
        {minHealth > 0 && (
          <button
            onClick={() => setMinHealth(0)}
            className="text-slate-400 hover:text-slate-600 underline"
          >
            reset
          </button>
        )}
        <span className="ml-auto text-slate-400">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} match · sorted weakest first
        </span>
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No pages match this filter. {band !== "all" && <button onClick={() => setBand("all")} className="text-slate-700 underline">Clear severity</button>}
          </div>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Health</th>
              <th className="px-4 py-3 font-medium">Body chars</th>
              <th className="px-4 py-3 font-medium">HTTP</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="max-w-md truncate px-4 py-2">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">{r.title || r.url}</a>
                </td>
                <td className="px-4 py-2 capitalize text-slate-500">{r.content_type}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-slate-100">
                      <div
                        className={`h-1.5 rounded-full ${r.health < 60 ? "bg-red-500" : r.health < 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${r.health}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{r.health}</span>
                  </div>
                </td>
                <td className="px-4 py-2 tabular-nums text-slate-500">{(r.body_len ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500">{r.http_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </Card>
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onJump={setPage} onPageSize={setPageSize} unit="pages" />
    </div>
  );
}
