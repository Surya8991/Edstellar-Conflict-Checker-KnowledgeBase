"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send, ExternalLink } from "lucide-react";
import { Card, TypeChip } from "@/app/components/ui";

// ── types (mirror /api/cannibalization/assistant) ──────────────────────────
interface MatchGroup {
  query: string;
  positionGap: number;
  crossType: boolean;
  severity: "high" | "medium" | "low";
  totalClicks: number;
  totalImpressions: number;
  pages: { page: string; contentType?: string | null }[];
  tabs: string[];
}
interface InputMatch {
  input: string;
  kind: "url" | "keyword";
  groups: MatchGroup[];
}
interface Answer {
  answer: string;
  keyFindings: string[];
}
interface Turn {
  inputs: string[];
  question: string;
  matches: InputMatch[];
  answer: Answer;
  totalConflicts: number;
}

const SEV: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};
const TAB_LABEL: Record<string, string> = {
  "near-position": "near position",
  "all-keywords": "all keywords",
  "cross-type": "cross-type",
};

/** localStorage key holding the current conversation id, so the thread survives
 *  reloads/remounts (the turns themselves live in `cannibalization_chats`). */
const STORAGE_KEY = "cannibalization-assistant-conversation";

export default function AssistantTab() {
  const [inputsText, setInputsText] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Persist the conversation across reloads AND remounts: the turns are already
  // stored server-side in `cannibalization_chats`, so on mount we re-load them
  // from the conversationId kept in localStorage. Without this, a page reload -
  // or a dev Fast-Refresh remount - drops the whole thread even though it's saved.
  useEffect(() => {
    let alive = true;
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) return;
    setConversationId(saved);
    setRestoring(true);
    fetch(`/api/cannibalization/assistant?conversationId=${encodeURIComponent(saved)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.turns)) return;
        setTurns(
          d.turns.map((t: any) => ({
            inputs: t.inputs ?? [],
            question: t.question ?? "",
            matches: t.matches ?? [],
            answer: t.answer ?? { answer: "", keyFindings: [] },
            totalConflicts: (t.matches ?? []).reduce((s: number, m: any) => s + (m.groups?.length ?? 0), 0),
          })),
        );
      })
      .catch(() => {})
      .finally(() => alive && setRestoring(false));
    return () => {
      alive = false;
    };
  }, []);

  async function ask() {
    const inputs = inputsText.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!inputs.length) {
      setError("Paste at least one URL or keyword.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cannibalization/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs, question: question.trim(), conversationId }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error ?? "Request failed");
      setConversationId(d.conversationId);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, d.conversationId);
      setTurns((t) => [...t, { inputs: d.inputs, question: d.question, matches: d.matches, answer: d.answer, totalConflicts: d.totalConflicts }]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setTurns([]);
    setConversationId(null);
    setError(null);
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles size={15} className="text-indigo-500" /> Cannibalization AI Assistant
          {restoring && <span className="text-xs font-normal text-slate-400">· restoring…</span>}
          {turns.length > 0 && (
            <button onClick={newConversation} className="ml-auto text-xs font-normal text-slate-500 hover:text-slate-800">
              New conversation
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Paste a batch of URLs or keywords - one per line. The assistant finds every cannibalization conflict they&apos;re in
          (across all tabs) and Groq explains what to do. Ask a follow-up question to dig in.
        </p>
        <textarea
          value={inputsText}
          onChange={(e) => setInputsText(e.target.value)}
          rows={5}
          placeholder={"https://www.edstellar.com/blog/top-ai-training-companies\nai training companies\nleadership training"}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && ask()}
            placeholder="Optional: ask a question (e.g. which should I consolidate first?)"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/5"
          />
          <button
            onClick={ask}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Send size={13} className={loading ? "animate-pulse" : ""} />
            {loading ? "Analyzing…" : turns.length ? "Ask" : "Analyze"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Card>

      {turns.map((turn, i) => (
        <Card key={i} className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">You:</span>
            {turn.question ? <span>{turn.question}</span> : <span className="italic">overview of {turn.inputs?.length ?? 0} input{(turn.inputs?.length ?? 0) === 1 ? "" : "s"}</span>}
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">{turn.totalConflicts} conflict{turn.totalConflicts === 1 ? "" : "s"} matched</span>
          </div>

          {/* AI answer */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
              <Sparkles size={12} /> Analysis
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{turn.answer?.answer ?? ""}</p>
            {(turn.answer?.keyFindings?.length ?? 0) > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {turn.answer.keyFindings.map((k, j) => (
                  <li key={j}>{k}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Matched conflicts per input */}
          <div className="space-y-2">
            {(turn.matches ?? []).map((m, j) => (
              <div key={j} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.kind === "url" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                    {m.kind}
                  </span>
                  <span className="truncate font-medium text-slate-700">{m.input}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-slate-400">{(m.groups?.length ?? 0)} conflict{(m.groups?.length ?? 0) === 1 ? "" : "s"}</span>
                </div>
                {(m.groups?.length ?? 0) === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400">No cannibalization conflict found.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {(m.groups ?? []).map((g, k) => (
                      <div key={k} className="rounded-md bg-slate-50 p-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV[g.severity]}`}>{g.severity}</span>
                          <span className="font-medium text-slate-800">{g.query}</span>
                          {(g.tabs ?? []).map((t) => (
                            <span key={t} className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-500 ring-1 ring-slate-200">
                              {TAB_LABEL[t] ?? t}
                            </span>
                          ))}
                          <span className="ml-auto tabular-nums text-slate-400">
                            gap {g.positionGap?.toFixed(1) ?? "?"} · {g.totalClicks ?? 0} clicks · {(g.totalImpressions ?? 0).toLocaleString()} impr
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {(g.pages ?? []).map((p) => (
                            <div key={p.page} className="flex items-center gap-1.5 text-[11px]">
                              <TypeChip type={p.contentType ?? "static"} />
                              <a href={p.page} target="_blank" rel="noreferrer" className="truncate text-slate-600 hover:underline">
                                {p.page}
                              </a>
                            </div>
                          ))}
                        </div>
                        <a
                          href={`/conflict-checker?url=${encodeURIComponent(g.pages[0]?.page ?? "")}`}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                        >
                          Analyze in Conflict Checker <ExternalLink size={10} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
