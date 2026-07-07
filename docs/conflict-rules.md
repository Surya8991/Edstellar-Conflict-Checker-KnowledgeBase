# Scoring Pipeline & Rules

End-to-end flow of `runConflictCheck()` in [`lib/conflict.ts`](../lib/conflict.ts).

## Pipeline

```
input (URL or topic)
   │
   ▼
┌────────────────────────────────────────┐
│ 1. Fetch + extract (URL only)          │  fetchAndExtract()
│    LLM summarize → { summary,          │  chat.summarize()
│      searchSynopsis, keywords,         │
│      primaryQuery }                    │
└────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────┐
│ 2. Embed `searchSynopsis + keywords`   │  embedder.embed()
│    Vector search corpus (top N)        │  vectorSearchPages()
│    Filter sim < 0.50 (noise)           │
└────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────┐
│ 3. LLM judge the top `classifyLimit`   │  chat.classifyConflicts()
│    → per-match verdict                 │
│      { conflictType, conflictScore,    │
│        rationale, overlap, issue }     │
└────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────┐
│ 4. Blend scores                        │  blendScore()
│    base = stretch(sim, [0.55, 0.95])   │  similarityToBaseScore()
│    final = 0.6·base + 0.4·llm          │
│    Un-judged → conflictType =          │
│       "needs-review"                   │
└────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────┐
│ 5. Persist (best-effort)               │  INSERT checks / check_matches
└────────────────────────────────────────┘
```

## Defaults (`ConflictCheckOpts`)

| Option | Default | Why |
|--------|---------|-----|
| `vectorLimit` | 100 | Cheap (single pgvector query). Wide enough to surface long-tail matches. |
| `classifyLimit` | 15 | Caps the expensive LLM call. Matches 16..100 get `needs-review`. |
| `minSimilarity` | 0.50 | Raised from 0.30 in Session 6 (H11). Anything lower is unrelated for this corpus; keeps UI signal-to-noise sane. Override via `CONFLICT_MIN_SIMILARITY`. |
| `persist` | `true` | Stored in `checks` + `check_matches` for the history view. Best-effort - failures don't break the response. |

## Scoring functions

From [`lib/score.ts`](../lib/score.ts):

- `similarityToBaseScore(sim)` - clamp `sim` to `[0.55, 0.95]`, linearly map to `[0, 100]`, round.
- `blendScore(base, llm)` - `round(0.6·base + 0.4·llm)` (rebalanced in Session 8 to weight the measured embedding signal over the LLM). If `llm` is missing → return `base` unchanged.
- `conflictTypeFromScore(score)` - thresholds: ≥80 duplicate · ≥60 cannibalization · ≥35 partial-overlap · else none.
- `scoreColor(score)` - UI colour ramp (red / orange / amber / green).

## Impact-weighted result order (Session 5)

Match rows are sorted not by raw `conflictScore` but by
`impactWeighted(m)` so high-traffic and editorial-owner pages float to
the top:

```
impactWeighted = conflictScore × (1 + trafficBoost + ownerBoost)
trafficBoost   = min(1, log10(gscClicks28d + 1) / 4)   // 0–1.0
ownerBoost     = +0.25 if matched URL is its own owner_url
```

Why: a 70%-conflict with a page that gets 12k clicks/month is more
dangerous than a 90%-conflict with a dead page. The sort surfaces the
ones the editor should care about first.

The base `conflictScore` is still what's stored in `check_matches` and
shown in the badge - only the **display order** changes. CSV exports
and webhook payloads also stay sorted by impact.

## Lazy classification

Matches ranked 16+ ship with `conflict_type = "needs-review"` and an empty rationale. The UI calls `POST /api/check/classify-one` with the `checkId` + match URL to fill them on demand - keeps the headline call bounded while letting users drill deeper.

## Embedding-model assumption

Default embedder is local `bge-small-en-v1.5` (384-dim). Changing to OpenAI `text-embedding-3-small` (1536-dim) requires widening `pages.embedding` and **re-ingesting the whole corpus** - old vectors are not portable. See [`README.md`](../README.md) for the migration SQL.
