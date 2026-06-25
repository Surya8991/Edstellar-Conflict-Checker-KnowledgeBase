"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import { HELP, type HelpEntry } from "@/lib/help-content";

/** Match the longest-prefix HELP key for the current pathname. */
function findEntry(pathname: string): HelpEntry | null {
  if (HELP[pathname]) return HELP[pathname];
  const candidates = Object.keys(HELP)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length);
  return candidates.length ? HELP[candidates[0]!]! : null;
}

/**
 * Floating help button + side panel. One instance lives in the dashboard
 * layout; it reads the current pathname and renders the matching HELP entry.
 * Esc closes; backdrop click closes.
 */
export default function HelpButton() {
  const pathname = usePathname();
  const entry = findEntry(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false) }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!entry) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open help"
        title="Help / how to use this section"
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-lg hover:bg-slate-50"
      >
        <HelpCircle size={16} />
        Help
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30"
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label={`Help — ${entry.title}`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Help</div>
                <div className="text-base font-semibold text-slate-900">{entry.title}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 px-5 py-5 text-sm text-slate-700">
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">What this is</h3>
                <p className="leading-relaxed">{entry.what}</p>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">How to use it</h3>
                <ol className="ml-5 list-decimal space-y-1.5 leading-relaxed">
                  {entry.howToUse.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Reading the screen</h3>
                <ul className="ml-5 list-disc space-y-1.5 leading-relaxed">
                  {entry.readingIt.map((tip, i) => <li key={i}>{tip}</li>)}
                </ul>
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Troubleshooting</h3>
                <ul className="space-y-3">
                  {entry.troubleshoot.map((t, i) => (
                    <li key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700">{t.problem}</div>
                      <div className="mt-1 text-xs text-slate-600">{t.fix}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="border-t border-slate-100 pt-4 text-xs text-slate-400">
                Need something not covered here? Check{" "}
                <a href="/PROJECTLOG.md" className="underline">PROJECTLOG.md</a>{" "}
                for shipping history or{" "}
                <a href="https://github.com/Layruss98266/Edstellar-Conflict-Checker-KnowledgeBase/issues" target="_blank" rel="noreferrer" className="underline">
                  open a GitHub issue
                </a>.
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
