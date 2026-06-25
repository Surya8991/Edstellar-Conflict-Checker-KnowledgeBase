# Data Sources & Pipelines

Where the Conflict Checker reads from and writes to.

## Inputs

| Source | Format | Used for | Refresh |
|--------|--------|----------|---------|
| [`data/sitemap-urls.csv`](../data/sitemap-urls.csv) | CSV (~2,478 URLs) | Seed list for `npm run ingest`. | Manual — regenerate from edstellar.com sitemap when content set changes materially. |
| [`data/taxonomy/courses.json`](../data/taxonomy/courses.json) | JSON | Course catalog metadata (slug, title, category). | Manual extract via `scripts/extract-taxonomy.py`. |
| [`data/taxonomy/blogs.json`](../data/taxonomy/blogs.json) | JSON | Blog metadata. | Same extractor. |
| [`data/taxonomy/course-to-blog.json`](../data/taxonomy/course-to-blog.json) | JSON | Pre-computed course↔blog associations. | Regenerate after re-ingest. |
| [`data/taxonomy/competitors.json`](../data/taxonomy/competitors.json) | JSON | Competitor domain list for `/competitors`. | Manual edits. |
| [`data/taxonomy/synonyms.json`](../data/taxonomy/synonyms.json) | JSON | Query expansion / dedupe hints. | Manual edits. |

## Storage (Neon Postgres + pgvector)

Schema lives in [`lib/db/schema.ts`](../lib/db/schema.ts) and is materialised by [`drizzle/*.sql`](../drizzle/).

| Table | Purpose |
|-------|---------|
| `pages` | One row per ingested URL — title, h1, content text, content type, `embedding vector(384)`, hashes for change detection. |
| `checks` | One row per `runConflictCheck()` call — input, summary, keywords (JSON), candidate embedding, top score. |
| `check_matches` | One row per match within a check — page url, similarity, blended score, conflict type, rationale, rank. |
| `tags` | Page tag overrides (added in migration `0001_tags.sql`). |
| `audit_*` | Link-audit results (added in `0002_audit.sql`). |

The pgvector index on `pages.embedding` is HNSW with `vector_cosine_ops`.

## External services

| Service | Required for | Env vars | Failure mode |
|---------|--------------|----------|--------------|
| **Neon Postgres** | Everything that persists. | `DATABASE_URL` (pooled) | App can still run an in-memory check, but no history and no corpus search. |
| **Groq** (default chat) | Summarize, classify, rewrite-suggestion. | `GROQ_API_KEY`, `AI_CHAT_PROVIDER=groq` | Switch to Claude or OpenAI via env. |
| **Anthropic Claude** | Alt chat provider. | `ANTHROPIC_API_KEY`, `AI_CHAT_PROVIDER=claude` | — |
| **OpenAI** | Alt chat + alt embedder. | `OPENAI_API_KEY` | Inert if key missing. |
| **Local embedder** (Transformers.js `bge-small-en-v1.5`) | Default — embeddings without an API call. | `AI_EMBED_PROVIDER=local` | Model downloads on first use (~30 MB). |
| **Google Search Console** | `/search-console` page + GSC enrichment in matches. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GSC_SITE_URL` | Pages render without GSC columns. |
| **Serper.dev** | `/competitors`, SERP overlap, AI Overview detection. | `SERPER_API_KEY` | `/competitors` shows an empty state. |

## Pipelines (npm scripts)

| Script | What it does | When to run |
|--------|--------------|-------------|
| `npm run db:setup` | Creates pgvector extension + tables. | Once per fresh DB. |
| `npm run ingest` | Crawl sitemap → extract → embed → upsert `pages`. Idempotent; skips unchanged hashes. Flags: `--limit=N`, `--only=blog`, `--force`, `--concurrency=N`. | After publishing new content; periodically. |
| `npm run catalog-conflicts` | Precompute near-duplicate pairs across the corpus. | After ingest. |
| `npm run backfill-tags` | Populate `tags` from taxonomy JSON. | After taxonomy update. |
| `npm run cluster` | Cluster pages by embedding (analytics). | Ad hoc. |
| `npm run audit-links` | Crawl + persist internal-link health. | Scheduled via `/api/cron/audit-links`. |

## Cron routes

| Route | Purpose | Cadence |
|-------|---------|---------|
| `/api/cron/reingest` | Recrawl + re-embed changed pages. | Daily (configured in `vercel.json`). |
| `/api/cron/gsc-snapshot` | Snapshot GSC metrics to DB. | Daily. |
| `/api/cron/audit-links` | Internal-link audit run. | Weekly. |

## Failure-mode policy

- **No `DATABASE_URL`** → `persistCheck` is skipped (warning logged); check still returns a result. Best-effort, deliberate.
- **No chat key** → `runConflictCheck` throws at step 1 (summarize). This is fatal — there's no useful fallback.
- **Embedder down** → step 2 throws. Local embedder has no network dep after first download, so this almost only happens if OpenAI embeddings are configured and the API is down.
- **Vector search returns 0 rows above 0.30** → returns `topScore = 0`, empty `matches`. Not an error.
