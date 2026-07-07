"use client";

/**
 * Shared, modern filter primitives used across the filtered sections
 * (Content Clusters, Keyword Cannibalization, Edstellar Database). One look and
 * one behaviour everywhere: a search box, labelled chip groups with counts +
 * colour dots, and a single "Clear all".
 */
import type { ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";

/** Card wrapper for a filter toolbar. */
export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/** A horizontal row inside the bar (e.g. search + right-aligned controls). */
export function FilterRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>{children}</div>;
}

/** Search input with a leading icon and a clear button. */
export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** A labelled group of chips. Renders nothing when it has no chips. */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </div>
  );
}

/** A single filter chip: colour dot (optional) + label + count badge. */
export function FilterChip({
  label,
  count,
  active = false,
  dotClass,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {dotClass && !active && <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />}
      <span>{label}</span>
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-[10px] tabular-nums ${
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** One option of a FilterSelect. `value` is what onChange receives. */
export interface FilterSelectOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * Labelled dropdown filter - the chip-group's sibling for dimensions with MANY
 * options (6+), where chips would wrap into a wall. Same visual language as
 * FilterChip: the trigger darkens when a non-default value is active.
 * Option counts render as "label (n)".
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  defaultValue = "",
  className = "",
}: {
  label: string;
  /** Current value; equal to `defaultValue` means "no filter applied". */
  value: string;
  onChange: (v: string) => void;
  options: FilterSelectOption[];
  /** Label of the empty first row. Pass null for always-valued selects (e.g. Sort). */
  allLabel?: string | null;
  /** The "neutral" value - trigger stays light while on it. `""` for filters,
   *  or the default sort key for sorts. */
  defaultValue?: string;
  className?: string;
}) {
  const active = value !== defaultValue;
  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="relative inline-flex">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`appearance-none rounded-full border py-1 pl-3 pr-7 text-xs font-medium capitalize transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
            active
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {allLabel != null && <option value="">{allLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.count != null ? ` (${o.count})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${active ? "text-white" : "text-slate-400"}`}
        />
      </span>
    </label>
  );
}

/** "Clear all" button - render only when a filter is active. */
export function ClearFiltersButton({ onClick, label = "Clear all" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
    >
      <X size={13} /> {label}
    </button>
  );
}

/** A small checkbox styled as a toggle chip (e.g. "show intent"). */
export function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        checked
          ? "border-slate-300 bg-slate-100 text-slate-800"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      <span
        className={`h-3 w-3 rounded-[4px] border ${
          checked ? "border-slate-800 bg-slate-800" : "border-slate-300 bg-white"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-full w-full text-white" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

/** Derive a saturated dot colour from a Tailwind "bg-<hue>-100 …" token. */
export function dotColor(cls?: string): string | undefined {
  if (!cls) return undefined;
  const m = cls.match(/bg-([a-z]+)-\d+/);
  return m ? `bg-${m[1]}-400` : undefined;
}
