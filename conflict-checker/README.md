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
2. Add redirect URI `http://localhost:3000/api/gsc/callback`.
3. Put the client ID/secret and your verified `GSC_SITE_URL` in `.env`.
4. Visit `/search-console` → **Connect Google**.
