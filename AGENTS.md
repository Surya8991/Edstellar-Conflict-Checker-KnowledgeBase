<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Working in this repo safely

## Dev environment
- Node 22 required (`.nvmrc` + `engines` in `package.json`). Run `nvm use` before anything.
- `npm run typecheck` before committing — there is no CI typecheck gate yet.
- `npm run lint` for ESLint; `npm run build` is the final proof.

## Database — read this before touching it
- There is **one shared Neon project** (`marketing@edstellar.com`). It is production.
- Create a personal Neon project or a Neon branch for dev work. Never point `DATABASE_URL` at the shared project for day-1 exploration.
- `npm run ingest -- --limit=50` first. Full `npm run ingest` re-crawls 2,461 URLs and burns embedding quota.
- `runConflictCheck` persists to DB by default (`opts.persist !== false`). REPL/script exploration silently writes rows.

## Embedding dimension — encoded in 4 places
`vector(384)` appears in: `drizzle/0000_init.sql`, `lib/db/schema.ts` (`EMBED_DIM`), `lib/conflict.ts` (`$5::vector`), and `scripts/ingest.ts` raw SQL. Switching to a different model (e.g. OpenAI `text-embedding-3-small` = 1536 dims) requires changing all four.

## Auth — three separate gates
| Gate | Header/mechanism | Routes |
|------|-----------------|--------|
| `WEBHOOK_API_KEY` | `X-Api-Key` | `/api/check`, `/api/check/bulk`, `/api/check/outcome`, `/api/pages/owner`, `/api/summarize`, `/api/rewrite-suggestion`, `/api/internal-links/paragraph` |
| `CRON_SECRET` | `Authorization: Bearer` | All `/api/cron/*` routes |
| `WORKER_API_KEY` | `X-Worker-Key` | `/api/drafts?status=queued` (GET) + `/api/drafts/:id` (PATCH). Used by `scripts/draft-worker.ts`. |
| NextAuth session cookie | `AUTH_ENABLED=true` | All dashboard pages via `proxy.ts` |

**`/api/check` is special**: accepts EITHER a valid `X-Api-Key` (webhook callers) OR a valid NextAuth session (dashboard UI). When `WEBHOOK_API_KEY` is set and the header is absent, it falls back to session auth. This prevents dashboard users from being locked out when the webhook key is configured in production.

New `/api/*` routes that should be cron-callable must be added to `proxy.ts PUBLIC_PATHS`.

## Key defaults that may surprise you
- `minSimilarity` in `lib/conflict.ts` defaults to **0.50** (raised from 0.30 in Session 6). The JSDoc previously said 0.30 — trust the code, not the comment.
- `AI_CHAT_PROVIDER` defaults to `groq` if neither `GROQ_API_KEY` nor `ANTHROPIC_API_KEY` is set, the app silently returns empty summaries.
- Groq 429s (free-tier tokens-per-day, per key per model): set `GROQ_API_KEYS=key1,key2,…` to rotate keys automatically; `GROQ_FALLBACK_MODEL` (default `llama-3.1-8b-instant`) is tried across the pool when the primary model is exhausted everywhere. Logic + tests in `lib/ai/chat-groq.ts`.
- First request after a cold deploy downloads `bge-small-en-v1.5` (~30 MB) inline — expect 8–25 s latency. Set `AI_EMBED_PROVIDER=openai` to skip this (note: switching embed providers also means widening `vector(384)` → `vector(1536)` in all 4 places listed above — it's not a one-line env change).

## Conflict automation (Session 11)
- The manual "find duplicates → decide → pick winner" flow is now deterministic + config-driven. Plan: `plans/01-conflict-automation.md`.
- **Every cutoff/weight lives in `lib/thresholds.ts`**, env-overridable via `CONFLICT_*` (e.g. `CONFLICT_BODY_COSINE_MERGE`). Do NOT hard-code thresholds elsewhere — add them there.
- Pure, unit-tested modules (`npx tsx --test lib/<x>.test.ts`; there's no jest/vitest — uses Node's `node:test`): `signals.ts` (keep title/H1/slug/body **separate**, never blend), `intent.ts` (rule-based only — no LLM in the decision path), `resolution.ts` (`decidePair` / `pickWinner` / `groupAction`), `cluster.ts` (connected components).
- `runConflictCheck` attaches `{signals, intent, resolution}` per match + `inputIntent`. The **Content Clusters** page (`/clusters`) calls `GET /api/groups`, which computes near-duplicate pairs **live over the whole corpus** (a pgvector top-k lateral join, all content types) → connected components. Threshold `CONFLICT_GROUP_SIMILARITY` (default 0.90) is sensitive — too low chains everything into one giant component. `/api/groups` does NOT read `catalog_conflicts`.
- `catalog_conflicts` feeds only the **Catalog Conflicts** page (under Additional Tools) and is populated by `scripts/catalog-conflicts.ts` (`npm run catalog-conflicts`) — one lateral-join query + one bulk `UNNEST` insert, intent-aware pair typing. It's a manual refresh; re-run it after big corpus changes. Note neon-http is stateless, so BEGIN/COMMIT across `sql.query` calls is NOT a transaction — use a single bulk insert, not a per-row loop.
- **GSC + Competitor SERP were removed from the Conflict Checker** (routes `/api/check/enrich` + `/api/check/cannibalization` deleted). Don't reintroduce a GSC/SERP fetch there. GSC still powers `/search-console`; `serpOverlap` still powers `/api/competitors/*` + `/api/suggestions/new-content`.
- `lib/inbound-links.ts` uses the **raw neon client with `$1::text[]`** — drizzle's `sql\`\`` expands a JS array into `unnest($1,$2,…)` (a record) and Postgres rejects it. Same gotcha for any `ANY(${arr})` / `unnest(${arr})`: use the raw client positional param, or drizzle `inArray()`.
- New corpus content types (`managed-training`, `platform`, `consulting`, `templates`) are mapped by slug in `lib/taxonomy.ts` so a reingest re-derives them; type-badge colors in `app/components/ui.tsx` `TYPE_COLORS`.

## Draft pipeline (Batch 15–18 — current)
- **Architecture: cache-first.** `pregenerated_drafts` is a vector library populated offline by `npm run pregen-drafts` (uses local Antigravity/Claude, $0). At runtime `/api/drafts` does cosine top-1 in that table; ≥0.85 returns instantly; lower = Groq (`llama-3.3-70b-versatile`) adapts or generates fresh, and the result is upserted back to the cache.
- **Required env on Vercel:** `GROQ_API_KEY` (for runtime fallback). `LLM_KILL_SWITCH=1` disables Groq calls but cache hits still serve.
- **Local pregen:** `npm run pregen-drafts` → top 300 high-value pages (hubs + GSC top + No-TOFU clusters). Resumable; `--limit=N`, `--force`, `--concurrency=N` flags. Uses `DRAFT_PROVIDER=agy` (default) or `claude`.
- **Migrations 0006 + 0007** must be applied to Neon (`npm run db:setup`).
- **Legacy** (`/api/drafts/[id]` PATCH + `scripts/draft-worker.ts`) still exists for backward-compat but is no longer the hot path.

## Local draft worker (Batch 11–14 — legacy)
- `/api/drafts` enqueues a draft for a `checkId`; `scripts/draft-worker.ts` polls it locally and runs a CLI agent against the operator's subscription — no server-side LLM cost.
- Pluggable provider via `DRAFT_PROVIDER`:
  - `claude` (Claude Code, Max 20x) — `CLAUDE_MODEL=claude-sonnet-4-6` (default)
  - `agy` (Google Antigravity, Gemini) — `AGY_MODEL=gemini-3-pro-preview`
- Both CLIs invoked as `<bin> -p <prompt> --model <name>`; agy also gets `--dangerously-skip-permissions` for headless runs.
- Worker needs: chosen CLI on PATH + `WORKER_API_KEY` set in both Vercel env AND worker `.env.local` + `APP_BASE_URL` pointed at the deployed app.
- Run with `npm run draft-worker`; override per-run: `DRAFT_PROVIDER=agy npm run draft-worker`.
- Migration `drizzle/0006_drafts.sql` MUST be applied to Neon before the API works.

## Emergency run-book shortcuts
- **LLM cost runaway** → set `LLM_KILL_SWITCH=1` env var + redeploy. Disables all AI calls instantly without a code push.
- **DB unreachable** → check Neon console → wake endpoint or rotate `DATABASE_URL` to read-replica.
- **Cron stuck / partial corpus** → manually `POST /api/cron/reingest`. No resume cursor exists yet — workaround: check `SELECT max(ingested_at) FROM pages` to find the cutoff.

## What NOT to do
- Do not force-push `main`. No exceptions.
- Do not run destructive migrations without a DB backup — migrations are forward-only with no transactional wrapper.
- Do not add routes to `/api/cron/*` without adding them to `vercel.json` crons AND noting the Vercel Hobby 2-cron cap in README.
