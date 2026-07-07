# Edstellar Conflict Checker

Detect content conflicts (duplication / SEO cannibalization) **before** publishing a blog, course, or page - with a 0–100% conflict score, a per-signal breakdown (title / H1 / URL / body), a rule-based search-intent label, and a deterministic suggested resolution + winner per match. Similar corpus pages are also grouped by TOPIC across the whole corpus (Content Clusters). Google Search Console analytics and competitor research live on their own pages (`/search-console`, `/competitors`).

Built with **Next.js 16** (App Router) + **Neon Postgres / pgvector**.

> **Security note (Session 6 audit, 2026-06-25):** dashboard ships with a permissive CSP, HSTS, frame-ancestors `'none'`, MIME-sniff guard, and Referrer-Policy by default. The full audit + Session 7 changelog lives in [`PROJECTLOG.md`](PROJECTLOG.md) §10.

## How it works

1. Paste a **URL** or a **topic** → an LLM summarizes it and extracts keywords.
2. The summary is embedded and compared to your existing pages via **pgvector** cosine search.
3. The LLM judges each shortlisted page and assigns a **conflict type** (duplicate / cannibalization / partial-overlap) and a calibrated **0–100% score** (blended with the vector similarity).

## Setup

### 1. Install & configure

```bash
npm install
cp .env.example .env   # then fill in values
```

Minimum to run conflict checks: `DATABASE_URL` (Neon) + `GROQ_API_KEY` **or** `ANTHROPIC_API_KEY`.
Embeddings default to a **local** model (`AI_EMBED_PROVIDER=local`, Transformers.js `bge-small-en-v1.5`, 384-dim) - no key needed; the model downloads on first use.

### 2. Database (Neon + pgvector)

Create a free Postgres at [neon.tech](https://neon.tech), copy the **pooled** connection string into `DATABASE_URL`, then:

```bash
npm run db:setup      # creates the pgvector extension + all tables
```

### 3. Ingest the corpus

Crawls the bundled sitemap ([`data/sitemap-urls.csv`](data/sitemap-urls.csv), 2,479 URLs - ~2,461 after junk filtering in [`lib/sitemap.ts`](lib/sitemap.ts) drops tag-archives, `/sitemap`, file downloads etc.), extracts content, and embeds each page. This is the shipped sitemap snapshot, not a live count - the actual `pages` row count drifts as manual additions/removals happen (Corpus page → header shows the current figure); PROJECTLOG's session notes cite whatever the live count was at the time, so don't expect every doc to agree on one number.

```bash
npm run ingest -- --limit=50      # quick sample first
npm run ingest                    # full crawl (re-runnable; skips unchanged)
# flags: --only=blog  --force  --concurrency=6
```

### 4. Run

```bash
npm run dev        # http://localhost:3000
```

## Features by page

Top-level nav: Edstellar Database (the `/corpus` page), Search Console (an expandable parent - each GSC report is its own sub-page at `/search-console?section=<slug>`: Overview, Cannibalization, Striking Distance, CTR Opportunity, Movers, Untapped, Catalog Gap, Stale Pages, Index Coverage), Conflict Checker, Content Clusters, Settings. Dashboard, Manager View, Competitors, Bulk Check, Content Audit, Internal Links, Funnel Strategy, and Catalog Conflicts live under the collapsible **Additional Tools** section of the sidebar. Score History is hidden from the sidebar as of Session 13 (the `/history` page and all dashboard links to it still work).

| Route | What it does |
|---|---|
| `/` | Dashboard - today's signals, needs-attention queue, recent activity. |
| `/conflict-checker` | The headline tool - URL/topic → summary → scored matches, per-signal breakdown, and a suggested resolution + winner per match. |
| `/clusters` | Content Clusters - live, corpus-wide grouping by TOPIC across content types (distinctive-token clustering; template words auto-learned & dropped) with a suggested action + winner per cluster. Programmatic blog series (training-companies, roles-responsibilities, in-demand-skills, …) are grouped by URL template via `lib/series.ts`. Per-member GSC metrics (1/3/6 full months + top-5 queries, behind a "show GSC" toggle) come from `gsc_metrics`, populated by `npm run gsc-metrics` / the daily cron. Result is cached ~5 min (Rescan forces fresh). |
| `/bulk-check` | Run the Conflict Checker on up to 100 URLs/topics at once; export as CSV. Under Additional Tools. |
| `/history` | Score History - timeline of every check run, with editorial outcome tracking. Hidden from the sidebar as of Session 13 (reachable directly + via dashboard links). |
| `/search-console` | GSC clicks/impressions/CTR/position, 24h–12m, with a trend chart. Click **Connect Google** to authorize. |
| `/keyword-cannibalization` | Queries where 2+ Edstellar pages compete, with severity, the page to keep (primary), and a rule-based action (consolidate / differentiate / monitor). 4 tabs: near-position / all / cross-type (course vs page) / blogs-to-merge. Shared filter bar: search, severity/action/max-gap **chips**, type/sort **dropdowns**; the max-gap window hides groups whose page spread is too wide. Reads the pre-computed `keyword_conflicts` table (`npm run cannibalization` or gsc-snapshot cron Job 5). Sits directly below Search Console. The commercial-intent signal (a blog outranking a course) still boosts severity to high behind the scenes but is never shown as a label - see AGENTS.md. |
| `/competitors` | SERP-based competitor research per topic (needs `SERPER_API_KEY`). Under Additional Tools. |
| `/corpus` | **Edstellar Database** - browse/search the ingested pages; CSV export/import. Sits directly below Dashboard in the nav. |
| `/manager` | Manager View - leadership-facing weekly KPIs and per-user activity. |
| `/audit` | Content Audit - per-page health scan (meta, links, duplicates, images, staleness). |
| `/internal-links` | Suggests existing pages a draft should link to. |
| `/strategy` | Funnel Strategy. |
| `/settings` | Project settings: **Content Clusters tuning** (overlap / body floor / merge-max, `app_settings` table), **Search Console** last-refreshed + Refresh, **Sitemap sync** (add live-sitemap pages missing from the DB, by type), and the **exclusion lists** (`excluded_series`: URL patterns hide pages from Clusters + Conflict Checker; keyword patterns hide GSC queries; per-URL Remove/allow-list). Excluded pages stay in the Edstellar Database + GSC. |
| `/catalog-conflicts` | Precomputed near-duplicate pairs across the catalogue. Build with `npm run catalog-conflicts`. Hidden from the sidebar as of Session 11 (still reachable directly); Content Clusters is the actively-maintained equivalent. |

## AI providers

Selected via env - no code changes to switch:

- `AI_CHAT_PROVIDER` = `groq` (default) · `claude` · `openai`
- `AI_EMBED_PROVIDER` = `local` (default) · `openai`

OpenAI adapters are wired but **inert until `OPENAI_API_KEY` is set**.

> **Switching embeddings to OpenAI later:** `text-embedding-3-small` is 1536-dim, but the corpus column is `vector(384)`. You must widen the column and **re-embed**:
> ```sql
> ALTER TABLE pages DROP COLUMN embedding;
> ALTER TABLE pages ADD COLUMN embedding vector(1536);
> CREATE INDEX pages_embedding_idx ON pages USING hnsw (embedding vector_cosine_ops);
> ```
> Update `EMBED_DIM` in `lib/db/schema.ts` and the `vector(384)` literals in `drizzle/0000_init.sql`, set `AI_EMBED_PROVIDER=openai`, then re-run `npm run ingest -- --force`.

## Google Search Console (OAuth)

1. In [Google Cloud Console](https://console.cloud.google.com): create an **OAuth 2.0 Client (Web)**, enable the **Search Console API**.
2. Add redirect URI `http://localhost:3000/api/gsc/callback` (and `https://edstellar-conflict-checker-knowledg.vercel.app/api/gsc/callback` for prod).
3. Put the client ID/secret and your verified `GSC_SITE_URL` in `.env`.
4. Visit `/search-console` → **Connect Google**.

## Deploy to Vercel

This repo is a single Next.js app at the root - Vercel will auto-detect it.

1. **Import** the repo in Vercel.
2. **Environment variables** - copy every key from [`.env.example`](.env.example) into Vercel → Project → Settings → Environment Variables. At minimum: `DATABASE_URL` + one chat provider key. Set `APP_BASE_URL` to your `https://edstellar-conflict-checker-knowledg.vercel.app` (or custom domain) and `GOOGLE_REDIRECT_URI` to that domain + `/api/gsc/callback`.
3. **Build** - defaults (`next build`) are correct; no overrides needed.
4. **First deploy** - pushes succeed but the DB is empty. After deploy:
   ```bash
   # one-off from your laptop, against the same DATABASE_URL Vercel uses
   npm run db:setup
   npm run ingest
   ```
5. **Crons** - [`vercel.json`](vercel.json) registers three schedules (`/api/cron/reingest`, `/api/cron/audit-links`, `/api/cron/gsc-snapshot`). **`CRON_SECRET` is required** - since the Session 6 audit, every cron route fails **closed** (returns 401) when the bearer header doesn't match. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically once you set the env var.
6. **External webhook (optional)** - `WEBHOOK_API_KEY` gates 7 endpoints from external callers: `POST /api/check`, `/api/check/bulk`, `/api/check/outcome`, `/api/pages/owner`, `/api/summarize`, `/api/rewrite-suggestion`, `/api/internal-links/paragraph`. When set, callers must send `X-API-Key: <value>`; when unset, per-IP rate-limiting is the only gate (see AGENTS.md's auth table for the full mechanism per route).
7. **Run the schema migration** (one-time, after first deploy): `npm run db:setup` against the prod Neon DB. Idempotent - applies any unapplied `drizzle/*.sql` files; safe to re-run.

### Vercel pre-deploy checklist

The audit below surfaced four things that need attention **before** the first prod deploy. They aren't auto-fixable without `npm install` (see [`AGENTS.md`](AGENTS.md) - Next 16 config must be written against the installed docs):

1. **`next.config.ts` - add `serverExternalPackages`.** The runtime-only deps (`@xenova/transformers`, `jsdom`, `cheerio`, `googleapis`) should NOT be bundled by Next's tracer. After `npm install`, add them to `serverExternalPackages` in `next.config.ts` (key name + exact shape per Next 16 docs in `node_modules/next/dist/docs/`). Without this, the function bundle balloons past Vercel's size limit and the Transformers.js model loader breaks.
2. **`next.config.ts` - `outputFileTracingIncludes` for `data/`.** [`lib/sitemap.ts`](lib/sitemap.ts), [`lib/taxonomy.ts`](lib/taxonomy.ts), and [`lib/gsc-insights.ts`](lib/gsc-insights.ts) all do `readFileSync(join(process.cwd(), "data", …))` at runtime. Next's file tracer won't pick those up (the path is dynamic), so add `data/**/*` to `outputFileTracingIncludes` for the API routes that need them (`/api/check/*`, `/api/cron/reingest`, `/api/cron/gsc-snapshot`, `/api/competitors/*`).
3. **Embedder choice for prod.** The default local embedder downloads `bge-small-en-v1.5` (~30 MB) into `/tmp` on each cold start - fine for the long-lived `/api/cron/reingest` (`maxDuration = 300`), painful for `/api/check` (cold start ≈ 8–15 s the first time after a deploy). For prod, either: (a) set `AI_EMBED_PROVIDER=openai` after running the 384→1536 column-widen + re-ingest (SQL above), or (b) accept the cold-start cost and warm the function with the cron.
4. **Vercel plan limits for crons.** [`vercel.json`](vercel.json) registers **three** crons, two of them **weekly**. Hobby allows max 2 crons and daily cadence only - you need **Pro** for this config. Also: `/api/cron/reingest` walks all ~2,461 sitemap URLs sequentially with an embed call per URL. Even at 300 s, a full re-ingest from cold will timeout. Seed the corpus locally with `npm run ingest` once, then let the cron handle deltas only.

## Repository layout

```
.                              ← Next.js app root (deployed by Vercel)
├── app/                       ← App Router routes (pages + /api/*)
├── lib/                       ← AI providers, conflict pipeline, scoring, DB, etc.
├── scripts/                   ← One-off / cron-target scripts (tsx)
│   ├── ingest.ts              ← crawl + embed sitemap
│   ├── db-setup.ts            ← apply drizzle/*.sql migrations
│   ├── catalog-conflicts.ts   ← precompute near-duplicate pairs across corpus (manual refresh, no cron)
│   ├── detect-redirects.ts    ← probe every corpus URL, mark 3xx pages canonical_url + is_stale
│   ├── audit-links.ts         ← HEAD-check every URL → pages.http_status
│   ├── backfill-tags.ts       ← retag corpus from taxonomy JSON (no re-embed)
│   ├── cleanup-junk-pages.ts  ← remove junk rows (tag archives etc.) from `pages`
│   ├── reclassify-home.ts     ← one-off: home page → static content_type
│   ├── verify-corpus.ts       ← post-ingest sanity report (counts + spot-check)
│   ├── pregen-drafts.ts       ← local, $0 draft pre-generation for the AI Draft cache
│   ├── gsc-metrics-snapshot.ts ← populate gsc_metrics (1/3/6-month page totals + top queries) for the Clusters GSC panel
│   ├── draft-worker.ts        ← legacy local-CLI draft worker (Batch 11-14)
│   ├── extract-taxonomy.py    ← rebuild data/taxonomy/*.json from Hub HTML
│   ├── test-embed.ts          ← embed smoke test
│   └── archive/               ← superseded scripts kept for reference only, not wired to package.json
│       └── cluster-kmeans.ts  ← old k-means clustering; superseded by lib/cluster.ts (topic-token leader clustering)
├── data/                      ← Sitemap + taxonomy JSON shipped with the repo
├── drizzle/                   ← SQL migrations
├── public/                    ← Static assets
│   └── brand/                 ← Edstellar logo + favicon variants (SVG + PNG)
├── docs/                      ← Domain knowledge base (not built; reference only)
│   ├── repo-overview.md       ← Map of this repo
│   ├── about-edstellar.md
│   ├── glossary.md
│   ├── conflict-types.md
│   ├── conflict-rules.md
│   ├── examples.md
│   └── data-sources.md
├── reference/                 ← Static artifacts (Intelligence Hub HTML)
├── auth.ts                    ← NextAuth v5 config (Google SSO, behind AUTH_ENABLED)
├── proxy.ts                   ← Next 16 proxy gate; redirects unauth'd dashboard routes
├── README.md                  ← (this file)
├── VERCEL_GITHUB_GUIDE.md     ← Plain-English deploy + update walkthrough
├── PRE_PUSH_CHECKLIST.md      ← Run through before every push to main
├── PROJECTLOG.md              ← Session-by-session shipping log
├── SETUP_GUIDE.md             ← Long-form .env setup walkthrough
├── AGENTS.md / CLAUDE.md      ← Notes for AI coding agents working in this repo
├── .env.example               ← Every env var the app reads
├── .nvmrc                     ← Node version pin (22)
└── vercel.json                ← Cron schedules
```
