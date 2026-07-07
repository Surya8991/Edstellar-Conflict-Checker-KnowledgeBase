/**
 * Top-right Project Log link (Session 10).
 *
 * User request: surface PROJECTLOG.md somewhere visible from the
 * dashboard. Pinned bottom-LEFT (clearing the sidebar on desktop) so it
 * no longer overlaps the page header's top-right controls (e.g. the
 * Rescan button); the help bubble sits bottom-right and toasts
 * bottom-center, so nothing fights. Opens the GitHub-rendered version of
 * PROJECTLOG.md in a new tab so the markdown renders properly without us
 * having to ship an in-app viewer.
 *
 * If the repo ever moves to a private GitHub or an internal mirror,
 * swap the href to a fetched-and-rendered version of /PROJECTLOG.md.
 */
import { BookOpen } from "lucide-react";

const HREF =
  "https://github.com/Layruss98266/Edstellar-Conflict-Checker-KnowledgeBase/blob/main/PROJECTLOG.md";

export default function ProjectLogLink() {
  return (
    <a
      href={HREF}
      target="_blank"
      rel="noreferrer"
      title="Project log - session-by-session shipping record"
      className="fixed bottom-5 left-5 z-20 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900 lg:left-[16rem] sm:inline-flex"
    >
      <BookOpen size={14} aria-hidden="true" />
      Project log
    </a>
  );
}
