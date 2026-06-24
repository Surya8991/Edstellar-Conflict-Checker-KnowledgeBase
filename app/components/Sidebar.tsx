"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanSearch,
  Layers,
  Link2,
  ClipboardCheck,
  History,
  LineChart,
  Swords,
  Database,
  GitCompareArrows,
} from "lucide-react";

const NAV = [
  { href: "/",                   label: "Dashboard",         icon: LayoutDashboard },
  { href: "/conflict-checker",   label: "Conflict Checker",  icon: ScanSearch },
  { href: "/bulk-check",         label: "Bulk Check",        icon: Layers },
  { href: "/internal-links",     label: "Internal Links",    icon: Link2 },
  { href: "/audit",              label: "Content Audit",     icon: ClipboardCheck },
  { href: "/history",            label: "Score History",     icon: History },
  { href: "/catalog-conflicts",  label: "Catalog Conflicts", icon: GitCompareArrows },
  { href: "/search-console",     label: "Search Console",    icon: LineChart },
  { href: "/competitors",        label: "Competitors",       icon: Swords },
  { href: "/corpus",             label: "Corpus",            icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="text-sm font-semibold tracking-tight text-slate-900">
          Edstellar
        </div>
        <div className="text-xs text-slate-500">Content Intelligence</div>
      </div>
      <nav className="p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
