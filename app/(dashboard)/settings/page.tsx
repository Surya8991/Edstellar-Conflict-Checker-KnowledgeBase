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
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  useEffect(() => { loadItems(); loadMatches(1, matchPageSize); /* eslint-disable-next-line */ }, []);

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

  const urlItems = (items ?? []).filter((i) => i.type !== "query");
  const queryItems = (items ?? []).filter((i) => i.type === "query");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage what's excluded from the analysis views. Blog series are hidden from Content Clusters and Conflict Checker matches; keyword queries are hidden from the GSC panel. Excluded pages stay in the Edstellar Database and in Search Console."
      />
      <div className="max-w-4xl space-y-4 p-8">
        {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

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
                <a href={m.url} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-700 hover:underline" title={m.title || m.url}>
                  {m.url}
                </a>
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
      </div>
    </div>
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
