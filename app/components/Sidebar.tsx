"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ScanSearch,
  Layers,
  Link2,
  ClipboardCheck,
  LineChart,
  Swords,
  Database,
  BarChart3,
  Compass,
  Boxes,
  Settings,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const NAV: { href: string; label: string; icon: any }[] = [
  { href: "/corpus",             label: "Edstellar Database", icon: Database },
  { href: "/conflict-checker",   label: "Conflict Checker",  icon: ScanSearch },
  { href: "/clusters",           label: "Content Clusters",  icon: Boxes },
  { href: "/settings",           label: "Settings",          icon: Settings },
  // Score History hidden for now (Session 13 - same pattern as Catalog
  // Conflicts). The /history page + /api routes still exist and dashboard
  // links to /history keep working; uncomment to restore the nav link.
  // { href: "/history",            label: "Score History",     icon: History },
  // Search Console is rendered separately below as an expandable parent with a
  // sub-section per GSC report (?section=<slug>).
];

/** GSC report sections - each is its own addressable page under /search-console. */
const SEARCH_CONSOLE_SECTIONS = [
  { slug: "overview",         label: "Overview" },
  { slug: "cannibalization",  label: "Cannibalization" },
  { slug: "striking-distance", label: "Striking Distance" },
  { slug: "ctr-opportunity",  label: "CTR Opportunity" },
  { slug: "movers",           label: "Movers" },
  { slug: "untapped",         label: "Untapped" },
  { slug: "catalog-gap",      label: "Catalog Gap" },
  { slug: "stale-pages",      label: "Stale Pages" },
  { slug: "index-coverage",   label: "Index Coverage" },
];

const ADDITIONAL_NAV: { href: string; label: string; icon: any }[] = [
  { href: "/",                   label: "Dashboard",         icon: LayoutDashboard },
  { href: "/manager",            label: "Manager View",      icon: BarChart3 },
  { href: "/competitors",        label: "Competitors",       icon: Swords },
  { href: "/bulk-check",         label: "Bulk Check",        icon: Layers },
  // Catalog Conflicts hidden for now (Session 11 - user will revisit later).
  // The /catalog-conflicts page + /api/catalog-conflicts + the scan script all
  // still exist; uncomment to restore.
  // { href: "/catalog-conflicts",  label: "Catalog Conflicts", icon: GitCompareArrows },
  { href: "/audit",              label: "Content Audit",     icon: ClipboardCheck },
  { href: "/internal-links",     label: "Internal Links",    icon: Link2 },
  { href: "/strategy",           label: "Funnel Strategy",   icon: Compass },
];

export default function Sidebar({ user, signOutSlot }: { user?: SidebarUser | null; signOutSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Search Console is an expandable parent; its sub-nav links to ?section=<slug>.
  const onSearchConsole = pathname === "/search-console" || pathname.startsWith("/search-console/");
  const activeSection = searchParams.get("section") || "overview";
  const [scOpen, setScOpen] = useState(onSearchConsole);
  useEffect(() => { if (onSearchConsole) setScOpen(true) }, [onSearchConsole]);

  // "Additional Tools" is a collapsible group, closed by default. Auto-open it
  // when the current route is one of its items so the active link isn't hidden.
  const inAdditional = ADDITIONAL_NAV.some(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );
  const [toolsOpen, setToolsOpen] = useState(inAdditional);

  // Close the drawer on route change so the user lands on the new page.
  useEffect(() => { setOpen(false) }, [pathname]);
  // Reveal the group when navigating into one of its pages.
  useEffect(() => { if (inAdditional) setToolsOpen(true) }, [inAdditional]);

  return (
    <>
      {/* Mobile / narrow viewport burger. Audit H17 (Session 6): hidden
          while the drawer is open so the tap target doesn't sit on top of
          the drawer header (and so screen readers don't see two
          "open/close navigation" controls at once). */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={false}
          aria-controls="sidebar-drawer"
          className="fixed left-3 top-3 z-40 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm lg:hidden"
        >
          <Menu size={16} />
          Menu
        </button>
      )}

      {/* Backdrop for the mobile drawer. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      {/* Sidebar. Drawer on small, static on >= lg. Audit H18: when the
          drawer is open on narrow viewports, surface it as a modal dialog
          so assistive tech treats it correctly. The `lg:` static layout
          isn't modal - only the mobile drawer is. */}
      <aside
        id="sidebar-drawer"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Navigation" : undefined}
        className={`
          fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Edstellar
              </div>
              <div className="truncate text-[11px] text-slate-500">Content Intelligence</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="ml-2 rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1 overflow-y-auto p-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            // Audit 10C polish (Session 8): exact-or-boundary match so a
            // future `/audit-archive` route doesn't false-positive as
            // active when the user is on `/audit`. `startsWith(href + "/")`
            // requires a path-segment boundary, not just a substring.
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(href + "/");
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

          {/* Search Console - expandable parent, one page per GSC report. */}
          <div>
            <div className="flex items-center">
              <Link
                href="/search-console?section=overview"
                className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  onSearchConsole ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <LineChart size={17} />
                Search Console
              </Link>
              <button
                type="button"
                onClick={() => setScOpen((v) => !v)}
                aria-label="Toggle Search Console sections"
                aria-expanded={scOpen}
                className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <ChevronDown size={14} className={`transition-transform ${scOpen ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {scOpen && (
              <div className="mt-1 space-y-0.5 pl-8">
                {SEARCH_CONSOLE_SECTIONS.map((s) => {
                  const active = onSearchConsole && activeSection === s.slug;
                  return (
                    <Link
                      key={s.slug}
                      href={`/search-console?section=${s.slug}`}
                      className={`block rounded-lg px-3 py-1.5 text-[13px] transition ${
                        active
                          ? "bg-slate-100 font-medium text-slate-900"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
            aria-controls="additional-tools"
            className="mt-5 flex w-full items-center justify-between rounded-lg px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-600"
          >
            Additional Tools
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${toolsOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {toolsOpen && (
            <div id="additional-tools" className="space-y-1">
              {ADDITIONAL_NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
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
            </div>
          )}
        </nav>

        {user && (
          <div className="mt-auto border-t border-slate-200 p-3">
            <div className="flex items-center gap-2.5 px-2 py-1.5 text-xs">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
                  {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-700">{user.name || "Signed in"}</div>
                <div className="truncate text-[11px] text-slate-400">{user.email}</div>
              </div>
            </div>
            {signOutSlot}
          </div>
        )}
      </aside>
    </>
  );
}
