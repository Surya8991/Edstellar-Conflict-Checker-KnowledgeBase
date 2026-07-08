<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Working in this repo safely

## Dev environment
- Node 22 required (`.nvmrc` + `engines` in `package.json`). Run `nvm use` before anything.
- `npm run typecheck` before committing - there is no CI typecheck gate yet.
- `npm run lint` for ESLint; `npm run build` is the final proof.

## Database - read this before touching it
- There is **one shared Neon project** (`marketing@edstellar.com`). It is production.
- Create a personal Neon project or a Neon branch for dev work. Never point `DATABASE_URL` at the shared project for day-1 exploration.
- `npm run ingest -- --limit=50` first. Full `npm run ingest` re-crawls 2,461 URLs and burns embedding quota.
- `runConflictCheck` persists to DB by default (`opts.persist !== false`). REPL/script exploration silently writes rows.

## Embedding dimension - encoded in 4 places
`vector(384)` appears in: `drizzle/0000_init.sql`, `lib/db/schema.ts` (`EMBED_DIM`), `lib/conflict.ts` (`$5::vector`), and `scripts/ingest.ts` raw SQL. Switching to a different model (e.g. OpenAI `text-embedding-3-small` = 1536 dims) requires changing all four.

## Auth - three separate gates
| Gate | Header/mechanism | Routes |
|------|-----------------|--------|
| `WEBHOOK_API_KEY` | `X-Api-Key` | `/api/check`, `/api/check/bulk`, `/api/check/outcome`, `/api/pages/owner`, `/api/summarize`, `/api/rewrite-suggestion`, `/api/internal-links/paragraph` |
| `CRON_SECRET` | `Authorization: Bearer` | All `/api/cron/*` routes |
| `WORKER_API_KEY` | `X-Worker-Key` | `/api/drafts?status=queued` (GET) + `/api/drafts/:id` (PATCH). Used by `scripts/draft-worker.ts`. |
| NextAuth session cookie | `AUTH_ENABLED=true` | All dashboard pages via `proxy.ts` |

**`/api/check` is special**: accepts EITHER a valid `X-Api-Key` (webhook callers) OR a valid NextAuth session (dashboard UI). When `WEBHOOK_API_KEY` is set and the header is absent, it falls back to session auth. This prevents dashboard users from being locked out when the webhook key is configured in production.

New `/api/*` routes that should be cron-callable must be added to `proxy.ts PUBLIC_PATHS`.

## Key defaults that may surprise you
- `minSimilarity` in `lib/conflict.ts` defaults to **0.50** (raised from 0.30 in Session 6). The JSDoc previously said 0.30 - trust the code, not the comment.
- `AI_CHAT_PROVIDER` defaults to `groq` if neither `GROQ_API_KEY` nor `ANTHROPIC_API_KEY` is set, the app silently returns empty summaries.
- Groq 429s (free-tier tokens-per-day, per key per model): set `GROQ_API_KEYS=key1,key2,…` to rotate keys automatically; `GROQ_FALLBACK_MODEL` (default `llama-3.1-8b-instant`) is tried across the pool when the primary model is exhausted everywhere. Logic + tests in `lib/ai/chat-groq.ts`.
- First request after a cold deploy downloads `bge-small-en-v1.5` (~30 MB) inline - expect 8–25 s latency. Set `AI_EMBED_PROVIDER=openai` to skip this (note: switching embed providers also means widening `vector(384)` → `vector(1536)` in all 4 places listed above - it's not a one-line env change).

## Conflict automation (Session 11)
- The manual "find duplicates → decide → pick winner" flow is now deterministic + config-driven. Plan: `plans/01-conflict-automation.md`.
- **Every cutoff/weight lives in `lib/thresholds.ts`**, env-overridable via `CONFLICT_*` (e.g. `CONFLICT_BODY_COSINE_MERGE`). Do NOT hard-code thresholds elsewhere - add them there.
- Pure, unit-tested modules (`npx tsx --test lib/<x>.test.ts`; there's no jest/vitest - uses Node's `node:test`): `signals.ts` (keep title/H1/slug/body **separate**, never blend; also the shared topic-token/DF layer - `buildDfIndex` / `topicKey` / `topicOverlap`), `intent.ts` (rule-based only - no LLM in the decision path), `resolution.ts` (`decidePair` / `pickWinner` / `groupAction`), `cluster.ts` (**topic-token leader clustering** - `clusterByTopic`).
- `runConflictCheck` attaches `{signals, intent, resolution}` per match + `inputIntent`. The **Content Clusters** page (`/clusters`) calls `GET /api/groups`, which now groups the whole live corpus **by TOPIC** (PROJECTLOG §17): distinctive-token keys (corpus-DF cap auto-learns template words) → center-based "leader" assignment (every member matches a pillar-priority SEED directly, so NO connected-components chaining/mega-clusters) → one batched body-cosine query applies the body floor. Cross-type by design (category + its blog + its courses cluster together). Knobs: `CONFLICT_TOPIC_DF_CAP` (0.05) / `CONFLICT_TOPIC_OVERLAP` (0.16, calibrated live) / `CONFLICT_TOPIC_BODY_FLOOR` (0.65) / `CONFLICT_GROUP_MERGE_MAX_SIZE` (4 - large same-type families are a series → "differentiate", not "merge → 301", §17L). Cluster labels come from tokens MEMBERS share, not the seed's own key (so a seed-only country in a "skills in demand in {country}" series doesn't dominate - §17M). Programmatic blog SERIES (`lib/series.ts` - training-companies, roles-responsibilities, in-demand-skills, games-exercises, digital-transformation, work-culture) are matched by slug template and grouped into ONE cluster each (they fragment under topic overlap), always `differentiate`, body-floor-exempt; series membership OVERRIDES topic (§17N). The pure `clusterByTopic` unit tests leave `series` off. Each member also carries GSC data (1/3/6 full-calendar-month clicks/impr/position + top-5 queries) behind a "show GSC" toggle, read from `gsc_metrics` via `lib/gsc-cluster-metrics.fetchGscForUrls` (one batched query). `gsc_metrics` is populated by `lib/gsc-metrics.snapshotGscMetrics` - Job 4 of the weekday gsc-snapshot cron (Mon-Fri 9AM IST, skips weekends - see PROJECTLOG's Session 19), or `npm run gsc-metrics` (needs `GSC_SITE_URL` + a connected `gsc_connections` row); §17O. `/api/groups` caches its result per-instance for 5 min (Rescan sends `?fresh=1`, `?overlap`/`?floor`/`?minSize` tune the scan) and does NOT read `catalog_conflicts`. (The old `CONFLICT_GROUP_SIMILARITY`/connected-components/`evaluatePair` path was removed; `groupSimCourse`/`…Title`/`TitleJaccardCourse` remain - `decidePair` still uses them.)
- `catalog_conflicts` feeds only the **Catalog Conflicts** page (under Additional Tools) and is populated by `scripts/catalog-conflicts.ts` (`npm run catalog-conflicts`) - one lateral-join query + one bulk `UNNEST` insert, intent-aware pair typing. It's a manual refresh; re-run it after big corpus changes. Note neon-http is stateless, so BEGIN/COMMIT across `sql.query` calls is NOT a transaction - use a single bulk insert, not a per-row loop.
- **GSC + Competitor SERP were removed from the Conflict Checker** (routes `/api/check/enrich` + `/api/check/cannibalization` deleted). Don't reintroduce a GSC/SERP fetch there. GSC still powers `/search-console`; `serpOverlap` still powers `/api/competitors/*` + `/api/suggestions/new-content`.
- `lib/inbound-links.ts` uses the **raw neon client with `$1::text[]`** - drizzle's `sql\`\`` expands a JS array into `unnest($1,$2,…)` (a record) and Postgres rejects it. Same gotcha for any `ANY(${arr})` / `unnest(${arr})`: use the raw client positional param, or drizzle `inArray()`.
- New corpus content types (`managed-training`, `platform`, `consulting`, `templates`) are mapped by slug in `lib/taxonomy.ts` so a reingest re-derives them; type-badge colors in `app/components/ui.tsx` `TYPE_COLORS`.
- **Exclusions** (§17P/§17Q): the `excluded_series` table (managed at `/settings`) has two `type`s. `url` patterns (slug substrings OR full URLs) hide pages from **Content Clusters + Conflict Checker matches** only - NOT the corpus/`/api/pages`, NOT GSC, NOT ingest (applied via `lib/exclusions.getExclusions().url` + `isExcludedUrl()` in `/api/groups` + `lib/conflict.ts`). `query` patterns hide GSC keywords from the clusters top-queries panel (via `fetchGscForUrls` + `isExcludedQuery()`). Both are part of the `/api/groups` cache key. `/api/settings/exclusions/matches` lists the URLs a url-pattern set actually matches. A third `exception` type (allow-list, managed via `/api/settings/exclusions/exception` + the viewer's "Remove" button) re-includes a single URL despite matching a pattern - `isExcludedUrl(url, patterns, exceptions)` honours it (§17S).
- **Editable project settings** (§17R): `app_settings` key-value table (`lib/app-settings.ts`) holds Content Clusters tuning (`cluster.topic_overlap` / `cluster.body_floor` / `cluster.merge_max_size`), read by `/api/groups` with fallback to `lib/thresholds.ts` defaults (query params still override; part of the cache key). Managed at `/settings` via `/api/settings/app`. `/api/settings/gsc-refresh` (POST) re-runs `snapshotGscMetrics`. Do NOT hard-code these knobs elsewhere - resolve from `app_settings` → thresholds.

## Keyword Cannibalization (§18) + filter conventions
- Top-level tool at `/keyword-cannibalization`. Pure logic in `lib/cannibalization.ts` (`buildConflicts` → `classifyGroup`, unit-tested via `npx tsx --test lib/cannibalization.test.ts`). Snapshot writer `lib/cannibalization-snapshot.ts` → `keyword_conflicts` table (`npm run cannibalization`, or Job 5 of the gsc-snapshot cron). Thresholds live in `lib/thresholds.ts` (`cannibalMinImpr` / `cannibalMinPageImpr` / `cannibalNearGap`, env `CONFLICT_CANNIBAL_*`). `/api/cannibalization` (GET) re-classifies each group at READ time from the surviving (post-exclusion) pages, so stored severity/action/gap always match what's shown (§18G).
- **NEVER show "money page" / commercial-risk framing in the UI** (§18H). The signal survives backend-only as `intentMismatch` on `ConflictGroup` (a higher-funnel page outranking the conversion page): it forces `severity = high` and keeps the conversion page as `primaryPage`, but is **never rendered as a label** and is **excluded from the `/api/cannibalization` payload**. The `protect-commercial` action and the `commercial_at_risk` column were removed (migration `0013`); cross-type groups read as `monitor`/`differentiate`. Value ranking is `CONTENT_VALUE_RANK` (renamed from `COMMERCIAL_RANK`). If you add commercial/revenue signals, compute them backend-only with neutral SEO names.
- **Filter-format policy** (§18I) - all filtering UI uses the shared primitives in `app/components/Filters.tsx`. **2–5 options → `FilterChip` groups; 6+ options → `FilterSelect` dropdown; run parameters (page size, concurrency, search depth) stay native `<select>`.** Don't hand-roll filter buttons or raw selects. `FilterSelect` supports `(n)` counts, an `allLabel={null}` + `defaultValue` mode for always-valued selects (e.g. Sort), and darkens when a non-default value is active.
- **Per-conflict status + notes** (§18J): `conflict_annotations` table (`drizzle/0014`, `lib/db/schema.ts` `conflictAnnotations`), keyed by `query` (unique) so annotations survive re-snapshots. Route `app/api/cannibalization/annotation` - GET returns `{ [query]: {status, note} }`; POST is dual-mode: single `{ query, status?, note? }` upsert, or **bulk `{ queries: string[], status }`** (§18M - one UNNEST upsert that sets status and leaves notes untouched, powers the multi-select bulk bar). Status ∈ pending|in-progress|completed|ignored, note clamped to 300 chars. Session-gated, NOT a cron public path. The Status filter is chips-with-counts (per §18I). The card also shows CTR per page (already in the payload) and "clicks at risk" (sum of cannibal-page clicks); `gsc_metrics` (1/3/6-month windows + top-5 queries per page) is the next data to surface there but currently un-joined.
- **HTTP-status freshness** (§18M): `lib/http-status.refreshHttpStatus({ limit, concurrency })` is the shared probe→`pages.http_status` writer. The `gsc-snapshot` cron runs it as **Job 6 over the WHOLE corpus** (`CRON_HTTP_STATUS_DAILY_LIMIT` default 100000 ≈ all, `CRON_HTTP_STATUS_CONCURRENCY` default 24 to fit the 300s budget, oldest-audited first, LAST + isolated, writes batched every 200) - since Session 19 this cron is **weekdays only** (Mon-Fri 9AM IST), so "recently-broken pages leave Keyword Cannibalization within a day" no longer holds strictly over a weekend (up to ~3 days: Fri evening through Mon morning). The weekly `audit-links` cron calls the same fn (limit 1500) as a backstop. If the sweep ever risks the budget, lower `CRON_HTTP_STATUS_DAILY_LIMIT`. No new cron entry - keep it that way (Hobby 2-cron cap).
- **Score History was removed** (§18J) - the `/history` page and `/api/check/history` are gone. `/api/check/outcome` remains (webhook-writable; dashboard "Editorial outcomes" + Manager View read the data). Don't reintroduce a `/history` link.
- **Dead pages are hidden** (§18L): `/api/cannibalization` drops any competing page that isn't a live corpus page (joins `pages.http_status` by `normalizeUrl`; pure helper `isLivePageStatus` - absent-from-corpus or 4xx/5xx → drop, `null`/2xx/3xx → keep). GSC keeps reporting impressions for removed URLs, so this is what keeps 404s out of the view. A group under 2 live pages disappears. Read-time (no re-snapshot), same pattern as exclusions.

## Draft pipeline (Batch 15–18 - current)
- **Architecture: cache-first.** `pregenerated_drafts` is a vector library populated offline by `npm run pregen-drafts` (uses local Antigravity/Claude, $0). At runtime `/api/drafts` does cosine top-1 in that table; ≥0.85 returns instantly; lower = Groq (`llama-3.3-70b-versatile`) adapts or generates fresh, and the result is upserted back to the cache.
- **Required env on Vercel:** `GROQ_API_KEY` (for runtime fallback). `LLM_KILL_SWITCH=1` disables Groq calls but cache hits still serve.
- **Local pregen:** `npm run pregen-drafts` → top 300 high-value pages (hubs + GSC top + No-TOFU clusters). Resumable; `--limit=N`, `--force`, `--concurrency=N` flags. Uses `DRAFT_PROVIDER=agy` (default) or `claude`.
- **Migrations 0006 + 0007** must be applied to Neon (`npm run db:setup`).
- **Legacy** (`/api/drafts/[id]` PATCH + `scripts/draft-worker.ts`) still exists for backward-compat but is no longer the hot path.

## Local draft worker (Batch 11–14 - legacy)
- `/api/drafts` enqueues a draft for a `checkId`; `scripts/draft-worker.ts` polls it locally and runs a CLI agent against the operator's subscription - no server-side LLM cost.
- Pluggable provider via `DRAFT_PROVIDER`:
  - `claude` (Claude Code, Max 20x) - `CLAUDE_MODEL=claude-sonnet-4-6` (default)
  - `agy` (Google Antigravity, Gemini) - `AGY_MODEL=gemini-3-pro-preview`
- Both CLIs invoked as `<bin> -p <prompt> --model <name>`; agy also gets `--dangerously-skip-permissions` for headless runs.
- Worker needs: chosen CLI on PATH + `WORKER_API_KEY` set in both Vercel env AND worker `.env.local` + `APP_BASE_URL` pointed at the deployed app.
- Run with `npm run draft-worker`; override per-run: `DRAFT_PROVIDER=agy npm run draft-worker`.
- Migration `drizzle/0006_drafts.sql` MUST be applied to Neon before the API works.

## Link Audit (§21) - GitHub Actions cron, not vercel.json
- `lib/link-audit.ts` (`auditLinksAndExclude`) probes the whole corpus with `redirect: "manual"` and classifies each URL: **301/308 ("permanent move")** or **404/410 (dead)** → exclude-worthy (`isExcludeWorthy`, unit-tested in `lib/link-audit.test.ts`). Deliberately does NOT touch `pages.http_status` - that column's semantics (follows redirects to the final status) belong to `lib/http-status.refreshHttpStatus`; mixing raw first-hop status into the same column would make it ambiguous for other consumers.
- Every run REPLACES (not appends to) the patterns of a single tracked `excluded_series` row (`LINK_AUDIT_EXCLUSION_NAME = "Auto: dead/redirected pages (link audit)"`), found by name. This makes it self-healing: a page that starts resolving 200 again drops out of the exclusion automatically next run.
- **Runs via `.github/workflows/link-audit.yml`** (daily 9:00 AM IST = 3:30 UTC + `workflow_dispatch`), calling `GET /api/cron/link-audit` (same `CRON_SECRET` bearer auth as every other cron route) - NOT registered in `vercel.json`, so it doesn't count against Vercel's cron-schedule limit. Needs `APP_BASE_URL` + `CRON_SECRET` as **GitHub repo secrets** (must match the Vercel env var), not just Vercel env vars.
- Manual trigger: `/api/settings/link-audit` (GET = last-run metadata from `app_settings` key `link_audit.last_run`; POST = run now), session-gated like every other `/api/settings/*` route, wired to a "Run now" button on `/settings`.

## Emergency run-book shortcuts
- **LLM cost runaway** → set `LLM_KILL_SWITCH=1` env var + redeploy. Disables all AI calls instantly without a code push.
- **DB unreachable** → check Neon console → wake endpoint or rotate `DATABASE_URL` to read-replica.
- **Cron stuck / partial corpus** → manually `POST /api/cron/reingest`. No resume cursor exists yet - workaround: check `SELECT max(ingested_at) FROM pages` to find the cutoff.

## What NOT to do
- Do not force-push `main`. No exceptions.
- Do not run destructive migrations without a DB backup - migrations are forward-only with no transactional wrapper.
- Do not add routes to `/api/cron/*` without either (a) adding them to `vercel.json` crons AND noting the Vercel Hobby 2-cron cap in README, or (b) scheduling them via a GitHub Actions workflow under `.github/workflows/` instead (see Link Audit above) - the latter doesn't need a `vercel.json` entry, but still needs the route added to `proxy.ts PUBLIC_PATHS` coverage (already true for anything under `/api/cron/`) and documented here.
