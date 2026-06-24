"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PageHeader, Card } from "@/app/components/ui";

const RANGES = [
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
  { key: "28d", label: "28 days" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
] as const;

const TABS = [
  "Overview",
  "Cannibalization",
  "Striking Distance",
  "Movers",
  "Untapped",
  "Catalog Gap",
] as const;
type Tab = (typeof TABS)[number];

interface Insights {
  range: string;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: any[];
  topPages: any[];
  trend: any[];
  cannibalization: any[];
  striking: any[];
  movers: { winners: any[]; losers: any[] };
  untapped: any[];
  gap: any[];
  byCountry: any[];
  byDevice: any[];
}

export default function SearchConsolePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading…</div>}>
      <SearchConsoleInner />
    </Suspense>
  );
}

function SearchConsoleInner() {
  const params = useSearchParams();
  const connected = params.get("gsc") === "connected";
  const gscError = params.get("gsc") === "error";

  const [range, setRange] = useState("28d");
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gsc/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ range }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <div>
      <PageHeader
        title="Search Console"
        subtitle="GSC performance, cannibalization, striking-distance, movers, untapped queries & catalog gap."
        right={
          <a
            href="/api/gsc/auth"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Connect Google
          </a>
        }
      />
      <div className="space-y-6 p-8">
        {connected && (
          <Card className="border-green-200 bg-green-50 text-sm text-green-700">
            Connected to Google Search Console.
          </Card>
        )}
        {gscError && (
          <Card className="border-red-200 bg-red-50 text-sm text-red-700">
            Google connection failed. Check your OAuth credentials and redirect URI.
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                range === r.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
          {data && (
            <span className="ml-2 text-xs text-slate-400">
              {data.startDate} → {data.endDate}
            </span>
          )}
        </div>

        {error && (
          <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
            {error}
            {error.toLowerCase().includes("connect") && (
              <>
                {" "}
                Click <strong>Connect Google</strong> above to authorize.
              </>
            )}
          </Card>
        )}

        {/* KPI row */}
        {data && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Clicks" value={fmt(data.totals.clicks)} />
            <Kpi label="Impressions" value={fmt(data.totals.impressions)} />
            <Kpi label="CTR" value={`${(data.totals.ctr * 100).toFixed(1)}%`} />
            <Kpi label="Avg position" value={data.totals.position.toFixed(1)} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-sm text-slate-400">Loading…</div>
        )}

        {data && tab === "Overview" && <OverviewTab data={data} />}
        {data && tab === "Cannibalization" && <CannibalTab data={data} />}
        {data && tab === "Striking Distance" && <StrikingTab data={data} />}
        {data && tab === "Movers" && <MoversTab data={data} />}
        {data && tab === "Untapped" && <UntappedTab data={data} />}
        {data && tab === "Catalog Gap" && <GapTab data={data} />}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
    </Card>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      Export CSV
    </button>
  );
}

// ---- Tabs ---------------------------------------------------------------

function OverviewTab({ data }: { data: Insights }) {
  return (
    <>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Clicks &amp; impressions over time
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend.map((d: any) => ({ date: d.keys?.[0], ...d })).reverse()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="clicks" stroke="#0f172a" dot={false} />
              <Line type="monotone" dataKey="impressions" stroke="#94a3b8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Top queries</h3>
            <ExportBtn
              onClick={() =>
                downloadCsv("top-queries.csv",
                  ["query","clicks","impressions","ctr","position"],
                  data.topQueries.map((r: any) => [r.keys?.[0] ?? "", r.clicks, r.impressions, (r.ctr*100).toFixed(2)+"%", r.position.toFixed(1)]))
              }
            />
          </div>
          <SimpleTable
            cols={["Query","Clicks","Impr","CTR","Pos"]}
            rows={data.topQueries.slice(0, 25).map((r: any) => [
              r.keys?.[0] ?? "",
              fmt(r.clicks),
              fmt(r.impressions),
              (r.ctr * 100).toFixed(1) + "%",
              r.position.toFixed(1),
            ])}
          />
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Top pages</h3>
            <ExportBtn
              onClick={() =>
                downloadCsv("top-pages.csv",
                  ["page","clicks","impressions","ctr","position"],
                  data.topPages.map((r: any) => [r.keys?.[0] ?? "", r.clicks, r.impressions, (r.ctr*100).toFixed(2)+"%", r.position.toFixed(1)]))
              }
            />
          </div>
          <SimpleTable
            cols={["Page","Clicks","Impr","CTR","Pos"]}
            rows={data.topPages.slice(0, 25).map((r: any) => [
              shortenUrl(r.keys?.[0] ?? ""),
              fmt(r.clicks),
              fmt(r.impressions),
              (r.ctr * 100).toFixed(1) + "%",
              r.position.toFixed(1),
            ])}
            linkColumn={0}
            linkValues={data.topPages.slice(0, 25).map((r: any) => r.keys?.[0] ?? "")}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">By country</h3>
          <SimpleTable
            cols={["Country","Clicks","Impr","CTR","Pos"]}
            rows={data.byCountry.map((r: any) => [
              r.keys?.[0] ?? "",
              fmt(r.clicks),
              fmt(r.impressions),
              (r.ctr * 100).toFixed(1) + "%",
              r.position.toFixed(1),
            ])}
          />
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">By device</h3>
          <SimpleTable
            cols={["Device","Clicks","Impr","CTR","Pos"]}
            rows={data.byDevice.map((r: any) => [
              (r.keys?.[0] ?? "").toLowerCase(),
              fmt(r.clicks),
              fmt(r.impressions),
              (r.ctr * 100).toFixed(1) + "%",
              r.position.toFixed(1),
            ])}
          />
        </Card>
      </div>
    </>
  );
}

function CannibalTab({ data }: { data: Insights }) {
  if (!data.cannibalization.length)
    return <EmptyState text="No cannibalization detected in this range (each query has at most one ranking page)." />;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Cannibalization</h3>
          <p className="text-xs text-slate-500">
            Queries where 2+ pages of yours are competing for the same spot — the listed pages split impressions and clicks.
          </p>
        </div>
        <ExportBtn
          onClick={() =>
            downloadCsv("cannibalization.csv",
              ["query","page","clicks","impressions","position"],
              data.cannibalization.flatMap((g: any) =>
                g.pages.map((p: any) => [g.query, p.page, p.clicks, p.impressions, p.position.toFixed(1)])))
          }
        />
      </div>
      <div className="space-y-4">
        {data.cannibalization.map((g: any) => (
          <div key={g.query} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">{g.query}</div>
              <div className="text-xs text-slate-500 tabular-nums">
                {g.pages.length} pages · {fmt(g.totalImpressions)} impr · {fmt(g.totalClicks)} clicks
              </div>
            </div>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {g.pages.map((p: any) => (
                  <tr key={p.page} className="border-t border-slate-100">
                    <td className="max-w-md truncate py-1.5 pr-3">
                      <a href={p.page} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">
                        {shortenUrl(p.page)}
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-600">{fmt(p.clicks)} clk</td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-600">{fmt(p.impressions)} impr</td>
                    <td className="py-1.5 tabular-nums text-slate-600">pos {p.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StrikingTab({ data }: { data: Insights }) {
  if (!data.striking.length)
    return <EmptyState text="No striking-distance queries (positions 8–20 with meaningful impressions)." />;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Striking distance</h3>
          <p className="text-xs text-slate-500">Queries on page 1–2 (position 8–20). Small content/internal-link improvements can pull these into the top 3.</p>
        </div>
        <ExportBtn
          onClick={() =>
            downloadCsv("striking-distance.csv",
              ["query","position","impressions","clicks","ctr","potential_top3_clicks"],
              data.striking.map((r: any) => [r.query, r.position.toFixed(1), r.impressions, r.clicks, (r.ctr*100).toFixed(2)+"%", r.potentialClicks]))
          }
        />
      </div>
      <SimpleTable
        cols={["Query","Pos","Impr","Clicks","CTR","Potential top-3 clicks"]}
        rows={data.striking.map((r: any) => [
          r.query,
          r.position.toFixed(1),
          fmt(r.impressions),
          fmt(r.clicks),
          (r.ctr * 100).toFixed(1) + "%",
          fmt(r.potentialClicks),
        ])}
      />
    </Card>
  );
}

function MoversTab({ data }: { data: Insights }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-emerald-700">Winners (vs previous period)</h3>
        <SimpleTable
          cols={["Query","Δ Clicks","Pos now","Pos prev"]}
          rows={data.movers.winners.map((r: any) => [
            r.query,
            <span key="d" className="text-emerald-600">+{fmt(r.deltaClicks)}</span>,
            r.positionNow.toFixed(1),
            r.positionPrev.toFixed(1),
          ])}
        />
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-rose-700">Losers (vs previous period)</h3>
        <SimpleTable
          cols={["Query","Δ Clicks","Pos now","Pos prev"]}
          rows={data.movers.losers.map((r: any) => [
            r.query,
            <span key="d" className="text-rose-600">{fmt(r.deltaClicks)}</span>,
            r.positionNow.toFixed(1),
            r.positionPrev.toFixed(1),
          ])}
        />
      </Card>
    </div>
  );
}

function UntappedTab({ data }: { data: Insights }) {
  if (!data.untapped.length)
    return <EmptyState text="No high-impression / low-CTR queries detected." />;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Untapped queries</h3>
          <p className="text-xs text-slate-500">High impressions, CTR below what's expected for that position — usually a meta-title / snippet issue.</p>
        </div>
        <ExportBtn
          onClick={() =>
            downloadCsv("untapped.csv",
              ["query","impressions","clicks","ctr","expected_ctr","position","lost_clicks"],
              data.untapped.map((r: any) => [r.query, r.impressions, r.clicks, (r.ctr*100).toFixed(2)+"%", (r.expectedCtr*100).toFixed(2)+"%", r.position.toFixed(1), r.lostClicks]))
          }
        />
      </div>
      <SimpleTable
        cols={["Query","Impr","CTR","Expected CTR","Pos","Est. lost clicks"]}
        rows={data.untapped.map((r: any) => [
          r.query,
          fmt(r.impressions),
          (r.ctr * 100).toFixed(1) + "%",
          (r.expectedCtr * 100).toFixed(1) + "%",
          r.position.toFixed(1),
          <span key="l" className="text-amber-600">{fmt(r.lostClicks)}</span>,
        ])}
      />
    </Card>
  );
}

function GapTab({ data }: { data: Insights }) {
  if (!data.gap.length)
    return <EmptyState text="Every high-impression query matches an existing course/blog/category." />;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Catalog gap</h3>
          <p className="text-xs text-slate-500">Queries you rank for but have no matching course / blog / category — opportunities to create dedicated content.</p>
        </div>
        <ExportBtn
          onClick={() =>
            downloadCsv("catalog-gap.csv",
              ["query","impressions","clicks","position"],
              data.gap.map((r: any) => [r.query, r.impressions, r.clicks, r.position.toFixed(1)]))
          }
        />
      </div>
      <SimpleTable
        cols={["Query","Impr","Clicks","Pos"]}
        rows={data.gap.map((r: any) => [
          r.query,
          fmt(r.impressions),
          fmt(r.clicks),
          r.position.toFixed(1),
        ])}
      />
    </Card>
  );
}

function SimpleTable({
  cols,
  rows,
  linkColumn,
  linkValues,
}: {
  cols: string[];
  rows: (string | number | React.ReactNode)[][];
  linkColumn?: number;
  linkValues?: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            {cols.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              {r.map((cell, j) => (
                <td key={j} className="max-w-md truncate py-2 pr-4 tabular-nums">
                  {linkColumn === j && linkValues ? (
                    <a href={linkValues[i]} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">
                      {cell as any}
                    </a>
                  ) : (
                    cell as any
                  )}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="py-6 text-center text-slate-400">
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="text-sm text-slate-500">{text}</Card>
  );
}

function shortenUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname.length > 50 ? url.pathname.slice(0, 50) + "…" : url.pathname;
  } catch {
    return u;
  }
}
