"use client";

import { useEffect, useState } from "react";
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
  Menu,
  X,
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
  const [open, setOpen] = useState(false);

  // Close the drawer on route change so the user lands on the new page.
  useEffect(() => { setOpen(false) }, [pathname]);

  return (
    <>
      {/* Mobile / narrow viewport: burger button. Fixed top-left so it
          floats above content regardless of scroll. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm lg:hidden"
      >
        <Menu size={16} />
        Menu
      </button>

      {/* Backdrop for the mobile drawer. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      {/* Sidebar. Drawer on small, static on >= lg. */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-slate-200 bg-white
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              Edstellar
            </div>
            <div className="text-xs text-slate-500">Content Intelligence</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1 p-3">
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
    </>
  );
}
