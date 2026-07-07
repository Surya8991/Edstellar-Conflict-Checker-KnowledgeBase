"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/app/components/ui";
import { toast } from "@/app/components/Toast";

interface Exclusion {
  id: number;
  name: string;
  patterns: string[];
  enabled: boolean;
}

/** Editable fields for a PATCH; patterns as a comma string or array. */
type PatchBody = { name?: string; enabled?: boolean; patterns?: string | string[] };

export default function SettingsPage() {
  const [items, setItems] = useState<Exclusion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPatterns, setNewPatterns] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/settings/exclusions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.exclusions ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

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
      await load();
      toast.success("Saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    if (!newName.trim() || !newPatterns.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/exclusions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName, patterns: newPatterns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Add failed");
      setNewName(""); setNewPatterns("");
      await load();
      toast.success("Series added.");
    } catch (e) {
      toast.error((e as Error).message);
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
      await load();
      toast.success("Removed.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage blog series excluded from Content Clusters and Conflict Checker matches. Excluded pages stay in the Edstellar Database and in Search Console - this only hides them from the analysis views."
      />
      <div className="max-w-3xl space-y-4 p-8">
        {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Excluded blog series</h2>
          <p className="mt-1 text-xs text-slate-500">
            A page is excluded when its URL contains any of the series&apos; slug patterns (case-insensitive).
            Comma-separate multiple patterns, e.g. <code className="rounded bg-slate-100 px-1">skills-in-demand-in-, most-in-demand</code>.
          </p>

          <div className="mt-4 divide-y divide-slate-100">
            {items === null && <div className="py-3 text-sm text-slate-400">Loading…</div>}
            {items?.length === 0 && <div className="py-3 text-sm text-slate-400">No exclusions yet.</div>}
            {items?.map((it) => (
              <ExclusionRow key={it.id} item={it} saving={saving} onPatch={patch} onRemove={remove} />
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Add a series</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Series name"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <input
              value={newPatterns}
              onChange={(e) => setNewPatterns(e.target.value)}
              placeholder="slug patterns, comma-separated"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button
              onClick={add}
              disabled={saving || !newName.trim() || !newPatterns.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </Card>
      </div>
    </div>
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

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <label className="flex items-center gap-2" title={item.enabled ? "Enabled" : "Disabled"}>
        <input
          type="checkbox"
          checked={item.enabled}
          disabled={saving}
          onChange={(e) => onPatch(item.id, { enabled: e.target.checked })}
        />
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`w-48 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-slate-900 ${item.enabled ? "border-slate-300" : "border-slate-200 text-slate-400"}`}
      />
      <input
        value={patterns}
        onChange={(e) => setPatterns(e.target.value)}
        className={`min-w-0 flex-1 rounded-lg border px-3 py-1.5 font-mono text-xs outline-none focus:border-slate-900 ${item.enabled ? "border-slate-300" : "border-slate-200 text-slate-400"}`}
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
