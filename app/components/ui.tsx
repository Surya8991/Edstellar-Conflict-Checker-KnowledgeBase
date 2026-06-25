import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

const TYPE_STYLES: Record<string, string> = {
  duplicate: "bg-red-100 text-red-700",
  cannibalization: "bg-orange-100 text-orange-700",
  "partial-overlap": "bg-amber-100 text-amber-700",
  none: "bg-green-100 text-green-700",
  "needs-review": "bg-slate-100 text-slate-500",
};

/**
 * Audit H16 (Session 6): each conflict-type badge gets a leading glyph so
 * the status is readable for colorblind users + when the page is printed
 * in greyscale. ● = filled (highest severity), ◐ = half (medium),
 * ○ = empty (low/no), ⌛ = needs review.
 */
const TYPE_GLYPHS: Record<string, string> = {
  duplicate: "●",
  cannibalization: "●",
  "partial-overlap": "◐",
  none: "○",
  "needs-review": "⌛",
};

export function ConflictBadge({ type }: { type: string }) {
  const glyph = TYPE_GLYPHS[type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_STYLES[type] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {type}
    </span>
  );
}

/** Color palette for `pages.content_type` values. Single source of truth —
 *  reused by Corpus, Conflict Checker, and any other view that surfaces a type. */
export const TYPE_COLORS: Record<string, string> = {
  course:               "bg-indigo-100 text-indigo-700",
  blog:                 "bg-emerald-100 text-emerald-700",
  category:             "bg-amber-100 text-amber-700",
  subcategory:          "bg-orange-100 text-orange-700",
  location:             "bg-fuchsia-100 text-fuchsia-700",
  "excellence-program": "bg-purple-100 text-purple-700",
  pillar:               "bg-purple-100 text-purple-700",
  home:                 "bg-slate-200 text-slate-700",
  static:               "bg-slate-100 text-slate-600",
};

export function TypeChip({
  type,
  size = "sm",
}: {
  type: string | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!type) return null;
  const cls = TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600";
  const sz = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex rounded font-medium capitalize ${sz} ${cls}`}>
      {type.replace("-", " ")}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-red-500"
      : score >= 60
        ? "bg-orange-500"
        : score >= 35
          ? "bg-amber-500"
          : "bg-green-500";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">
        {score}%
      </span>
    </div>
  );
}
