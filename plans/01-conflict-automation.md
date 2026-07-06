# Plan: Automate the content-conflict / clustering workflow

Turn the manual 9-stage workflow into a deterministic, config-driven tool inside
the Edstellar Conflict Checker. Every human judgment call becomes a numeric check
with a threshold. Thresholds live in one config file so they tune without code edits.

## Guiding principles
- **Signals stay separate.** Never blend title/H1/slug/body into one number — a
  reviewer must see *why* two pages were grouped.
- **Config-driven thresholds.** All cutoffs + weights in `lib/thresholds.ts`,
  env-overridable.
- **Deterministic.** Rule-based intent, numeric resolution branches. No LLM in the
  decision path (the existing LLM verdict stays as an *advisory* field only).
- **Reuse the shared core in both surfaces** (live Conflict Checker + corpus batch)
  so logic never diverges.

## Phase 0 — Allowed APIs (verified against the codebase)
- `runConflictCheck(input, opts): Promise<ConflictCheckResult>` — [lib/conflict.ts](../lib/conflict.ts).
  Returns `matches: ConflictMatchResult[]`; [app/api/check/route.ts](../app/api/check/route.ts)
  spreads it verbatim, so new fields on the match/result reach the UI with no plumbing.
- `vectorSearchPages(embedding, {limit, excludeUrl}): Promise<VectorMatch[]>` —
  [lib/search.ts](../lib/search.ts). Selects `title, content_type, snippet, similarity`
  (cosine). **Does NOT select `h1`** → add it for the H1 signal.
- `fetchInboundCounts(urls[], excludeUrl?): Promise<Record<url, number>>` and
  `inboundWeight(n): number` — [lib/inbound-links.ts](../lib/inbound-links.ts). Winner authority.
- `similarityToBaseScore`, `blendScore`, `conflictTypeFromScore` — [lib/score.ts](../lib/score.ts).
  Keep as-is; the blended score becomes one advisory column, not the resolution driver.
- `scoreBand`, `intentStage (funnel TOFU/MOFU/BOFU)` — [lib/score-bands.ts](../lib/score-bands.ts).
  Funnel stage ≠ search intent; build a separate classifier.
- `fetchAndExtract(url)` — [lib/extract.ts](../lib/extract.ts). Gives input page `title/h1/…`
  for URL inputs (topic inputs have none — signals degrade to body+intent only).
- Tests: no framework installed; use Node's built-in runner — `npx tsx --test lib/<x>.test.ts`
  (pattern already in [lib/csv.test.ts](../lib/csv.test.ts)).

### Anti-patterns to avoid
- Do NOT add a DB migration in Phase 1 (clusters land in Phase 3).
- Do NOT re-introduce GSC/SERP fetches on the page (removed on purpose). Traffic as a
  winner weight may use the already-stored `pages.gsc_clicks_28d` column, but it is
  **off by default** and never re-adds a GSC panel.
- Do NOT blend the four signals into a single number.
- Do NOT invent columns — `pages` has `title, h1, content_text, token_count,
  gsc_clicks_28d, owner_url`; `h1` must be added to the `vectorSearchPages` SELECT.

---

## Phase 1 — Live Conflict Checker upgrade (NO DB changes)

Goal: after a check, show each match's **four separate signal scores**, a **search-intent
label** for input + matches, and a **Suggested resolution + winner** per top conflict.

### New files
1. `lib/thresholds.ts` — central config object `THRESHOLDS` with env overrides:
   - `bodyCosineMerge` (0.80), `bodyCosineConsolidate` (0.55)
   - `titleJaccardDup` (0.80), `h1JaccardDup` (0.80), `slugOverlapDup` (0.60)
   - winner weights `{ inbound, depth, urlClean, traffic }` — `traffic` defaults 0.
2. `lib/signals.ts` — pure fns: `tokenize`, `jaccard(a,b)`, `slugTokens(url)`,
   `slugOverlap(a,b)`; `signalScores(input, match)` → `{ title, h1, slug, body }` each 0..1.
3. `lib/intent.ts` — `classifyIntent({title,h1,slug,text,contentType})` →
   `{ label: "informational"|"commercial"|"transactional"|"navigational", cues: string[] }`.
   Keyword cues (how-to/what/guide → informational; best/top/vs/review → commercial;
   buy/pricing/demo/enquire → transactional; login/contact/about → navigational) +
   `content_type` fallback (course→transactional, blog→informational, category→commercial).
4. `lib/resolution.ts` — pairwise (input vs match) Stage 7+8 logic:
   - `pageAuthority({inbound, tokenCount, url, clicks}, weights)` → number.
   - `decidePair(input, match, signals, intents)` →
     `{ action: "merge"|"consolidate"|"differentiate"|"keep-both", winnerUrl, reason }`.
     Branch: different intent → `keep-both`; same intent & body≥merge (or title/h1 near-dup)
     → `merge`; same intent & body≥consolidate → `consolidate`; else `differentiate`.
5. Test files for each of the four (`*.test.ts`, Node test runner).

### Wiring
- `lib/search.ts`: add `h1` to the SELECT + `VectorMatch.h1`.
- `lib/conflict.ts`:
  - capture the input's `{title, h1, slug, text}` (URL: from `fetchAndExtract`; topic:
    from input text + keywords).
  - after building `matches`, batch `fetchInboundCounts` for `[input?] + match urls`.
  - for each match set new fields: `signals {title,h1,slug,body}`, `intent`,
    `resolution {action, winnerUrl, reason}`. Add these to `ConflictMatchResult` +
    `ConflictCheckResult.inputIntent`.
- `app/api/check/route.ts`: no change (spreads result).
- `app/(dashboard)/conflict-checker/page.tsx`: extend `Match`/`CheckResult` types;
  render a **"Resolution" card** per match — 4 signal bars, intent chip, action badge,
  winner highlight, copyable `301  loser → winner` line. Reuse `TYPE_COLORS`, `ScoreBar`.

### Verification checklist
- `npx tsx --test lib/signals.test.ts lib/intent.test.ts lib/resolution.test.ts lib/thresholds.test.ts` → all pass.
- `npm run typecheck` clean; `npm run build` clean.
- Live: run a topic + a URL check in the preview → each match shows 4 signal bars,
  an intent chip, and a resolution badge; identical-title/different-body pair reads
  "metadata" (high title, low body); winner is the higher-authority URL.
- `grep` confirms no new GSC/SERP fetch and no DB migration.

---

## Phase 2 — Intent everywhere + ingest hardening
- Persist `intent` + non-indexable flags during ingest (Stage 1/5 durability).
- Surface intent in Corpus + Catalog Conflicts.

## Phase 3 — Clustering (DB)
- Migration `0008`: `clusters` + `cluster_members` tables.
- `lib/cluster.ts`: union-find connected components over pairs (Stage 6);
  per-cluster `decideResolution` + `pickWinner` (Stage 7/8) reusing `lib/resolution.ts`.
- Extend [scripts/catalog-conflicts.ts](../scripts/catalog-conflicts.ts) to populate clusters.

## Phase 4 — Guardrails + export
- `lib/guardrails.ts`: redirect-loop / orphan / canonical-to-noindex checks;
  confidence flagging for near-threshold clusters.
- Action-plan CSV / 301 map export (reuse [lib/csv.ts](../lib/csv.ts)).

## Phase 5 — Corpus-wide UI
- Catalog Conflicts page shows clusters (not raw pairs) + resolutions + download.

---

## Final verification (all phases)
- All new `lib/*` have passing unit tests.
- `grep -r "TODO\|FIXME"` on new files is clean.
- `npm run typecheck && npm run build` pass.
- Thresholds documented in `lib/thresholds.ts` and referenced from AGENTS.md.
