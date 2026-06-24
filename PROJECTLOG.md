# Edstellar Conflict Checker — Project Log

> Single source of truth for this project. Lists what's built, what's planned,
> and how the system fits together. Update this file with every meaningful
> change.

**Last updated:** 2026-06-24
**Owner:** marketing@edstellar.com
**Repo:** https://github.com/Layruss98266/Edstellar-Conflict-Checker-KnowledgeBase

---

## 1. What this project is

A content-intelligence app for Edstellar's marketing team. Before publishing any
new blog / course / landing page, paste the URL or topic and:

1. Get an AI **summary** of what's being proposed.
2. Get a **0–100% conflict score** + ranked list of existing pages it overlaps
   with (cannibalization risk).
3. See **Google Search Console** performance for the affected pages — does the
   page we'd cannibalize actually rank?
4. See what **competitors** publish on the same topic.

The corpus = every URL in https://www.edstellar.com/sitemap.xml (2,479 URLs at
ingest time), crawled, classified, and embedded into a Postgres `pgvector`
index hosted on Neon.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router, TS) | One process for UI + API routes |
| Styling | Tailwind 4 | Mirrors mockup look-and-feel quickly |
| Database | **Neon Postgres** (pooled) + **pgvector** | Serverless, free tier, vector search built-in |
| ORM | `@neondatabase/serverless` (raw SQL) + drizzle | drizzle for types; raw `neon()` for fast scripts |
| Embeddings | **Local** — `@xenova/transformers` `bge-small-en-v1.5` (384-dim) | No API key, works offline. OpenAI 1536-dim adapter stubbed for later |
| Chat / summaries | **Groq** `llama-3.3-70b-versatile` (default), **Claude** (Opus/Sonnet) alt | Both wired behind `ChatProvider` interface |
| HTML extraction | `cheerio` | Cheaper than Readability; "good enough" for marketing pages |
| GSC | `googleapis` Search Console v3 (OAuth) | First-party, no scraping |
| Web search | **Serper** (Google SERPs) | Used by competitor research |
| Charts | `recharts` | Lightweight, React-native |
| Background work | Plain Node scripts (`tsx scripts/*.ts`); future cron via `vercel.json` | No queue infra needed yet |

**Folder layout** (flattened in a later session; the historical sub-layout is preserved below for context)
```
Edstellar-Conflict-Checker-KnowledgeBase/        ← repo root (Next.js app lives here directly)
├── PROJECTLOG.md                                ← THIS FILE
├── README.md / SETUP_GUIDE.md
├── .env.example / .gitignore / vercel.json
├── package.json / tsconfig.json / next.config.ts / drizzle.config.ts
├── docs/                                        ← domain knowledge base
├── reference/                                   ← static artifacts (Intelligence Hub HTML)
├── app/
│   ├── (dashboard)/<route>/page.tsx             ← every visible page
│   └── api/<route>/route.ts                     ← every API endpoint
├── lib/
│   ├── ai/                                      ← embed + chat provider abstraction
│   ├── db/                                      ← drizzle schema + client
│   ├── extract.ts                               ← HTML → main text
│   ├── search.ts                                ← cosine search helpers
│   ├── score.ts                                 ← cosine + LLM → 0–100 blend
│   ├── taxonomy.ts                              ← URL → tags (uses data/taxonomy/)
│   ├── gsc.ts                                   ← Google OAuth + Search Analytics
│   ├── gsc-insights.ts                          ← derived GSC views
│   ├── competitors.ts                           ← Serper + LLM
│   └── sitemap.ts                               ← read sitemap CSV
├── scripts/
│   ├── db-setup.ts                              ← apply drizzle/*.sql migrations
│   ├── ingest.ts                                ← crawl + embed sitemap
│   ├── backfill-tags.ts                         ← retag existing rows
│   ├── catalog-conflicts.ts                     ← all-pairs precompute
│   ├── extract-taxonomy.py                      ← pull JSON blobs out of HTML mockup
│   └── test-embed.ts                            ← embed smoke test
├── drizzle/
│   ├── 0000_init.sql                            ← pgvector + 7 tables
│   ├── 0001_tags.sql                            ← tags TEXT[] + course_type
│   └── 0002_audit.sql                           ← internal-link audit tables
├── data/
│   ├── sitemap-urls.csv                         ← copy used at runtime
│   └── taxonomy/                                ← extracted from HTML mockup
│       ├── courses.json                         ← 1,698 courses
│       ├── blogs.json                           ← 500 blog posts
│       ├── course-types.json
│       ├── competitors.json
│       ├── synonyms.json
│       ├── underserved-categories.json
│       ├── gsc-pipeline-seed.json
│       └── course-to-blog.json
└── public/                                      ← static assets
```

---

## 2b. Data flow — where the categorisation on /corpus comes from

When you look at /corpus and see "Course 1,698", "IT & Technical 1,046", or
"Excellence Program 10", every number traces back to the original mockup HTML.
The chain in full:

```
Edstellar_Intelligence_Hub_v2_updated.html
   │  (embedded JS const ALL_COURSES = [...1,698 courses])
   │  (embedded JS const ALL_BLOGS   = [...500 blogs])
   │  (embedded JS const COURSE_TYPE_TAXONOMY = [6 types])
   ▼
scripts/extract-taxonomy.py
   │  one-shot Python: parses each JS literal out of the HTML and
   │  writes it as JSON. Re-run any time the mockup is updated.
   ▼
data/taxonomy/
   ├── courses.json       (1,698 rows: url, name, type, category, subcategory)
   ├── blogs.json         (500 rows: url, title, category, matchedCourse)
   ├── course-types.json  (the 6 types + their child categories)
   └── …
   ▼
lib/taxonomy.ts → tagUrl(url, title?)
   │  on every URL: looks up in courses.json / blogs.json, derives a
   │  contentType, courseType, category, subcategory, tags[].
   │  • /course/<slug>     → contentType="course"            + courseType
   │  • /blog/<slug>       → contentType="blog"              + category
   │  • /category/...      → contentType="category"
   │  • /topic/...         → contentType="subcategory"
   │  • /*-excellence-programs? → contentType="excellence-program"
   │  • /corporate-...-training-in-<city> → contentType="location"
   │  • industry slugs     → contentType="industry"
   │  • everything else    → contentType="static"
   ▼
scripts/ingest.ts  /  scripts/backfill-tags.ts
   │  writes tagUrl() output to the pages row:
   │  pages.content_type, pages.course_type, pages.category,
   │  pages.subcategory, pages.tags[]
   ▼
app/api/pages/route.ts
   │  GROUP BY content_type     → byType        (the cards row)
   │  GROUP BY course_type      → byCourseType  (the 6 chips)
   │  GROUP BY category         → topCategories (the top chips)
   ▼
app/(dashboard)/corpus/page.tsx
   │  renders the breakdown + filter chips you see in the screenshot.
```

**To refresh the taxonomy after the mockup HTML changes** (or to pick up new
courses added to it):

```bash
python scripts/extract-taxonomy.py     # rewrites data/taxonomy/*.json
npm run backfill:tags                  # re-tags all 2,479 pages, no re-embed
```

No HTML download required at runtime — the JSON files are committed to
`data/taxonomy/`.

## 3. Data model

`drizzle/*.sql` — idempotent, apply with `npm run db:setup`.

### Core tables
- **pages** — the corpus. `url, title, meta_description, h1, content_text,
  content_type, course_type, category, subcategory, tags TEXT[], lastmod,
  embedding vector(384), token_count, crawled_at`. HNSW index on `embedding`.
- **checks** — every conflict check run. `input_type, input_value, summary,
  keywords, candidate_embedding, top_score, created_at`.
- **check_matches** — per-check results. `check_id, page_id/url/title,
  similarity, conflict_score (0–100), conflict_type, rationale, rank`.
- **gsc_connections** — OAuth tokens (most-recent wins).
- **gsc_metrics** — cached GSC rows (date dimension).
- **catalog_conflicts** — precomputed all-pairs similarities.
- **competitors** — Serper-discovered + LLM-summarized competing pages.

### Provider abstraction
- `lib/ai/types.ts` defines `EmbeddingProvider` and `ChatProvider`.
- Default embedder: local Transformers.js (`bge-small-en-v1.5`, 384-dim).
- Default chat: Groq. Swap with `AI_CHAT_PROVIDER=claude|openai` in `.env`.
- OpenAI adapter compiles but throws unless `OPENAI_API_KEY` is set.

---

## 4. Session log

### Session 1 — 2026-06-24
- **Plan approved** and saved to
  `~/.claude/plans/create-a-conflict-checker-parsed-valiant.md`.
- **Scaffolded** Next.js + Neon + drizzle + Tailwind 4.
- **AI providers** wired (`lib/ai/`): local embeddings + Groq/Claude/OpenAI
  chat. OpenAI gated by env.
- **DB connected** to Neon (free tier, ap-southeast-1).
- **Migration 0000** applied: `pgvector`, 7 tables, HNSW vector index.
- **Sitemap ingest** ran clean: 2,479/2,479 URLs embedded; zero failures.
- **Conflict Checker** page + `/api/check` + `/api/summarize` working
  end-to-end. URL summary first, then cosine-shortlisted + LLM-classified
  matches.
- **GSC OAuth** wired. Switched to `sc-domain:edstellar.com` after the
  URL-prefix property returned a permissions error.
- **Serper key** added for competitor research.
- **Intelligence Hub HTML** parsed (`scripts/extract-taxonomy.py`) into
  `data/taxonomy/*.json` (1,698 courses, 500 blogs, 6 types, 43 competitor
  categories, 38 synonyms).
- **Migration 0001**: `tags TEXT[]` + `course_type`; default `content_type` =
  `static`.
- **`lib/taxonomy.ts`** — URL → `{contentType, courseType, category,
  subcategory, tags[]}` using the catalog. Anything unmatched = `static`.
- **`scripts/backfill-tags.ts`** retagged all 2,479 rows. Breakdown:
  **1,698 course / 500 blog / 102 subcategory / 102 static / 43 category /
  33 industry / 1 home**.
- **GSC section v2**: `lib/gsc-insights.ts` + `/api/gsc/insights` —
  6 tabs (Overview, Cannibalization, Striking Distance, Movers, Untapped,
  Catalog Gap), CSV export on every actionable table, country/device split.
- **Corpus UI**: type breakdown cards, color-coded type pills, tag filter
  chips, search, **pagination** (default 50/page; jump first/last/n).

### Session 3 — 2026-06-24 (shipped log)

Every batch in this session was committed to `main` on
`github.com/Corporatetrends/Edstellar-Conflict-Checker-KnowledgeBase`. Each
bullet ends with the short SHA so you can `git show <sha>`.

- **Conflict Checker returns ALL matches above the threshold, paginated.**
  `lib/conflict.ts` gains `vectorLimit` (default 100), `classifyLimit`
  (default 15, LLM-bounded), `minSimilarity`. The first 15 get full LLM
  classification; the rest get `conflictType="needs-review"` + a similarity
  score, and a new `/api/check/classify-one` route lets the user lazy-load
  the LLM rationale per row. UI: count headline, pagination 10/25/50/100,
  filter row. Also patched the History page parse error from session 2.
  `3446f61`
- **Industry pages reclassified as static + shared TypeChip.**
  32 `/who-we-serve`/industry pages folded into `static` per policy
  (industry kept as a tag for filtering). New `TYPE_COLORS` + `<TypeChip/>`
  in `app/components/ui.tsx` is the single source of truth — both Corpus
  and Conflict Checker import it. Filter chips in Conflict Checker colored
  by type to match. `2c30f15`
- **Competitor SERP card moved directly under Summary** so the user sees
  external context before drilling into matches. `98d72ea`
- **Per-match summary collapsed behind a Show/Hide toggle.** Cleaner
  default view; keeps stats + keywords above the fold. `725a422`
- **Personalised per-match summary with shared topics + issue callout.**
  `ConflictVerdict` gains `overlap[]` and `issue` fields; prompt rewritten
  to ban generic boilerplate (`"Be specific — name the actual topics that
  overlap; never use generic phrases like 'both pages discuss similar
  topics'"`) and demand per-page rationale. UI renders amber chips for
  shared topics, a rose-bordered warning callout for the issue, then the
  rationale sentence. `ee649ba`
- **Collapsed two redundant filters into one + added potential keywords.**
  Removed the "Min similarity" slider; "Min score" (default 80%) is now
  the single user-facing cut-off. `lib/gsc-page-stats.ts` also derives
  `potentialQueries` (striking-distance pos 11–30, sorted by impressions)
  from the same GSC call — surfaces opportunity, not just current
  performance. `0a4b05b`
- **Cleaner match-card layout, no more keyword truncation.** Switched from
  3 equal columns to 2 (compact stats panel | full-width keywords). New
  `<KeywordList/>` helper handles both Top + Potential with proper
  wrap-not-truncate behavior. `d3193e9`
- **SERP lookups use a page-specific primary query.** `SummaryResult`
  gains optional `primaryQuery` — a 4–8-word long-tail SEO query the LLM
  picks during summarisation. Shown as an indigo "Primary SEO query" pill
  on the Summary card. `7423a05`
- **SERP lookup switched to slug-derived primary keyword** (because the
  blog/course slug *is* the primary keyword by convention) and the panel
  now also shows **Google AI Overview citations** and **your own GSC rank
  for that keyword** beside the public SERP. `pickSerpQuery()` resolution
  order: URL slug → topic input → keywords[0] → primaryQuery. `serpOverlap`
  parses Serper's `aiOverview`/`aiOverviews` field; `enrich` route also
  calls `queryStats(topic)` so the UI can compare "you rank #N publicly"
  vs "GSC says pos X.X". Each AI Overview citation flagged as `you` /
  `known` / other. `d2b9cf4`
- **Groq model swap.** Hit Groq's free-tier 100k TPD limit on
  `llama-3.3-70b-versatile`. Switched the default to
  `llama-3.1-8b-instant` (500k TPD, same quality for these prompts) via
  the existing `GROQ_MODEL` env var. `.env` change only — not in git
  (`.env` is gitignored on purpose). The 70b model still works; switch
  back any time by removing the env or setting `GROQ_MODEL=llama-3.3-70b-versatile`.

### Session 3 — 2026-06-24 (original plan, kept for reference)

**Trigger:** user requested every improvement listed in §5 below + "show ALL
matching pages on Conflict Checker, not just 10, with pagination." Work is
broken into batches; each batch ships, gets pushed, then the next starts.

**Batch 1 — Conflict Checker: show all matches**
- `lib/conflict.ts` — new params `vectorLimit` (default 100), `classifyLimit`
  (default 15), `minSimilarity` (default 0.30). Returns every page above the
  similarity threshold; the top `classifyLimit` get the full LLM
  classification (cost-bounded), the rest get a similarity-derived score
  with `conflictType="needs-review"` and no rationale.
- `/api/check` accepts the new params.
- Conflict Checker UI: count headline ("47 pages with conflict ≥ 30%"),
  paginate the match list, threshold + sort filters, lazy "Explain" button
  on un-classified matches that calls a new `/api/check/classify-one`.

**Batch 2 — Save & compare drafts** (user-requested last session)
- New `draft_snapshots` table; "Save snapshot" + "Compare" in Conflict
  Checker; diff view of score deltas per match.

**Batch 3 — Auth + cross-cutting**
- NextAuth + Google SSO restricted to @edstellar.com
- Rate-limit `/api/check` (Groq free-tier headroom)
- `route_errors` table for any 500 from API routes

**Batch 4 — Corpus depth**
- Inline GSC stats + health score columns on the Corpus row
- CSV export of current view
- Sortable columns, semantic search, "new since" filter
- Sitemap-drift report

**Batch 5 — Internal Links + Conflict Checker: paragraph-level**
- Embed each paragraph; surface "paragraph N could link to X"
- Type filter, same-section exclusion
- Reverse view (who should link to this page?)

**Batch 6 — Search Console depth**
- Custom date range picker + compare-two-ranges
- Branded/non-branded as separate trend lines
- Persist Index Coverage results (gsc_inspections table)
- Click-stale → prefill Conflict Checker

**Batch 7 — Audit + Catalog Conflicts depth**
- Trigger broken-link scan from UI
- Health-score breakdown (show contributing factors)
- Bulk LLM title/meta rewrite
- Catalog Conflicts: recompute button, merge recommendation, GSC
  cannibalization cross-reference

**Batch 8 — Competitors + AI**
- Show our matching URL when Edstellar is in the SERP
- Batch freshness, "topics from GSC", saved competitor list
- Cost & tokens shown per check; prompt version tag; LLM cache

**Batch 9 — Cluster view UI + History polish**
- Surface `pages.cluster_id` as a browsable view
- History: CSV export, delete, annotate, mark "published date"

### Session 2 — 2026-06-24
- **Bulk Conflict Check** — paste lines or upload CSV, run all checks
  concurrently, download verdicts as CSV.
- **Pre-publish webhook** — `/api/check` documented; optional API-key auth via
  `WEBHOOK_API_KEY` env.
- **Conflict score history** — every `checks` row is browseable; per-input
  trend.
- **Internal-link suggester** — for any draft text/URL, return top-K existing
  pages it should link to.
- **Content audit** — title/meta length, broken-link scanner (HEAD requests
  with `http_status` column), composite content-health score.
- **GSC: branded vs non-branded** split on every tab.
- **GSC: page drilldown** — click a page in the Top Pages table → see its
  queries / countries / devices.
- **GSC: stale-content detector** — pages with sliding-window click decline.
- **GSC: index coverage** — `urlInspection.index` API: sitemap URLs not
  actually indexed.
- **Competitor extensions** — SERP overlap (per topic), domain comparison,
  content-freshness audit (lastmod scrape).
- **AI quality** — `scripts/cluster-topics.ts` (k-means over embeddings);
  conflict checker now includes a "How to differentiate" rewrite section.
- **Cron config** — `vercel.json` weekly re-ingest, daily GSC snapshot,
  weekly broken-link scan.

---

## 5. Roadmap — features designed but not yet built

### Tier C — needs an external API key / decision
| Feature | Blocker |
|---|---|
| **Backlink intelligence** (competitor's strongest pages) | Needs DataForSEO / Ahrefs / Moz key |
| **CMS title/meta editor** (write back to live site) | Needs Edstellar CMS API spec |
| **Pagespeed / Core Web Vitals** | CrUX public API works without a key for popular URLs; PSI API needs Google Cloud key (separate from GSC) |
| **Multi-user auth** | Pick NextAuth + Google SSO — decide if we need it |

### Workflow / collaboration — feature plan
**Goal:** turn this from a single-user marketer's tool into a team
content-ops surface.

| Feature | Sketch |
|---|---|
| **NextAuth + Google SSO** | Restrict app to `@edstellar.com` domain; replace the implicit "anyone can see" mode. New `users` table; every `checks`/`check_history` row gets `created_by` (column already exists). |
| **Roles** | `viewer / editor / admin`. Editors can run checks + ingest; admins can manage OAuth and webhooks. |
| **Comments on checks** | `check_comments(check_id, author, body, created_at)`. Reply thread on each result. |
| **Approval workflow** | Optional `status` on each `checks` row: `pending → approved → rejected`. SEO admins approve before publish. Webhook respects approval. |
| **Audit log** | `audit_events(actor, action, target, payload, ts)`. Every check, every CMS edit, every OAuth reconnect. Append-only. |
| **Notifications** | Slack/email digest: new high-conflict checks (score > 80), stale-content alerts, weekly GSC summary. Use existing data + a simple `notifications` table with `last_sent_at` to dedupe. |
| **Shareable check URLs** | `/checks/<id>` permalinks (no auth required if `share_token` set). |

Migration path: ship NextAuth first → backfill `created_by` for any check
made before SSO → add roles. Comments + approval + audit can land
independently in any order after that.

### Nice-to-haves not yet started
- **Content Roadmap** Kanban (suggested → in-progress → published).
- **Recommendation Engine** (gap × competitor density → next 5 to build).
- **Top 50 to Build** ranked list (uses GSC gap + catalog density).
- **Industry-vertical view** — performance segmented by industry tag.
- **Cluster view** in the corpus — k-means groups + one-click merge.
- **Slack/email digest** (depends on Workflow feature plan above).
- **Stale-content auto-refresh** — for any page in the stale list, generate a
  draft refresh outline via Claude/Groq.

---

## 6. Environment

`.env` keys (see `.env.example`):

```
# DB
DATABASE_URL=postgresql://...                # Neon pooled

# AI providers
AI_EMBED_PROVIDER=local                      # local | openai
AI_CHAT_PROVIDER=groq                        # groq | claude | openai
GROQ_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=                              # leave blank — adapters stubbed

# GSC OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gsc/callback
GSC_SITE_URL=sc-domain:edstellar.com         # OR https://www.edstellar.com/ depending on property type

# Competitors
SERPER_API_KEY=

# Webhook (optional pre-publish gate)
WEBHOOK_API_KEY=                             # require this in X-API-Key on /api/check from external systems
```

---

## 7. Operational commands

```bash
npm run dev                  # localhost:3000

# Database
npm run db:setup             # apply drizzle/*.sql in order (idempotent)

# Corpus
npm run ingest               # crawl + embed every sitemap URL
npm run ingest -- --limit=50 # sample
npm run ingest -- --force    # re-embed even if lastmod unchanged
npm run backfill:tags        # retag only — no re-fetch, no re-embed

# Catalog-wide analysis
npm run catalog-conflicts    # all-pairs precompute → catalog_conflicts table

# AI utilities (Session 2)
npm run cluster              # k-means topic cluster
npm run audit:links          # HEAD-check every URL; updates pages.http_status
```

---

## 8. Conventions / things that bit us

- **Neon connection string must be the *pooled* one** (it has `-pooler` in the
  hostname). Direct connections work locally but throttle at scale.
- **GSC `siteUrl` format matters.** If the property is registered as a **Domain
  property** in GSC, use `sc-domain:edstellar.com`. If registered as
  **URL-prefix**, use the trailing-slash URL `https://www.edstellar.com/`.
  Wrong format → "User does not have sufficient permission" error even when
  permissions are correct.
- **Local embedder dim = 384.** Switching to OpenAI = 1536. That's a schema
  change (new column, drop old) — documented in §5. Don't mix dimensions in
  one column.
- **`AGENTS.md` says "this Next.js has breaking changes"** — read
  `node_modules/next/dist/docs/` before adding new framework features.
- **Never commit `.env`.** Top-level `.gitignore` covers `**/.env*`.
- **HNSW vector index** auto-builds; for ivfflat we'd have to `ANALYZE` after
  bulk insert. We chose HNSW.
