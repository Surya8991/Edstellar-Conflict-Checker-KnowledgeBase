# Edstellar Conflict Checker

Detect content conflicts (duplication / SEO cannibalization) **before** publishing a blog, course, or page — with a 0–100% conflict score, Google Search Console performance data (24h → 12 months), and competitor research.

Built with **Next.js 16** (App Router) + **Neon Postgres / pgvector**.

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
Embeddings default to a **local** model (`AI_EMBED_PROVIDER=local`, Transformers.js `bge-small-en-v1.5`, 384-dim) — no key needed; the model downloads on first use.

### 2. Database (Neon + pgvector)

Create a free Postgres at [neon.tech](https://neon.tech), copy the **pooled** connection string into `DATABASE_URL`, then:

```bash
npm run db:setup      # creates the pgvector extension + all tables
```

### 3. Ingest the corpus

Crawls the bundled sitemap (`data/sitemap-urls.csv`, ~2,478 Edstellar URLs), extracts content, and embeds each page.

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

| Route | What it does |
|---|---|
| `/conflict-checker` | The headline tool — URL/topic → summary → scored matches. |
| `/catalog-conflicts` | Precomputed near-duplicate pairs across the catalogue. Build with `npm run catalog-conflicts`. |
| `/search-console` | GSC clicks/impressions/CTR/position, 24h–12m, with a trend chart. Click **Connect Google** to authorize. |
| `/competitors` | SERP-based competitor research per topic (needs `SERPER_API_KEY`). |
| `/corpus` | Browse/search the ingested pages. |

## AI providers

Selected via env — no code changes to switch:

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
2. Add redirect URI `http://localhost:3000/api/gsc/callback` (and `https://<your-vercel-domain>/api/gsc/callback` for prod).
3. Put the client ID/secret and your verified `GSC_SITE_URL` in `.env`.
4. Visit `/search-console` → **Connect Google**.

## Deploy to Vercel

This repo is a single Next.js app at the root — Vercel will auto-detect it.

1. **Import** the repo in Vercel.
2. **Environment variables** — copy every key from [`.env.example`](.env.example) into Vercel → Project → Settings → Environment Variables. At minimum: `DATABASE_URL` + one chat provider key. Set `APP_BASE_URL` to your `https://<project>.vercel.app` (or custom domain) and `GOOGLE_REDIRECT_URI` to that domain + `/api/gsc/callback`.
3. **Build** — defaults (`next build`) are correct; no overrides needed.
4. **First deploy** — pushes succeed but the DB is empty. After deploy:
   ```bash
   # one-off from your laptop, against the same DATABASE_URL Vercel uses
   npm run db:setup
   npm run ingest
   ```
5. **Crons** — [`vercel.json`](vercel.json) registers three schedules (`/api/cron/reingest`, `/api/cron/audit-links`, `/api/cron/gsc-snapshot`). Set `CRON_SECRET` so the routes can authenticate. **Warning:** the routes fail **open** if `CRON_SECRET` is unset — anyone can trigger them. Always set it in production.
6. **External webhook (optional)** — to gate `POST /api/check` from a CMS pre-publish hook, set `WEBHOOK_API_KEY`; callers must then send `X-API-Key: <value>`.

## Repository layout

```
.                          ← Next.js app root (deployed by Vercel)
├── app/                   ← App Router routes (pages + /api/*)
├── lib/                   ← AI providers, conflict pipeline, scoring, DB, etc.
├── scripts/               ← One-off / cron-target scripts (tsx)
├── data/                  ← Sitemap + taxonomy JSON shipped with the repo
├── drizzle/               ← SQL migrations
├── public/                ← Static assets
├── docs/                  ← Domain knowledge base (not built; reference only)
│   ├── repo-overview.md   ← Map of this repo
│   ├── about-edstellar.md
│   ├── glossary.md
│   ├── conflict-types.md
│   ├── conflict-rules.md
│   ├── examples.md
│   └── data-sources.md
├── reference/             ← Static artifacts (Intelligence Hub HTML)
├── PROJECTLOG.md          ← Session-by-session shipping log
├── SETUP_GUIDE.md         ← Long-form setup walkthrough
└── vercel.json            ← Cron schedules
```
