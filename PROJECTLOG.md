# Edstellar Conflict Checker - Project Log

> Single source of truth for this project. Lists what's built, what's planned,
> and how the system fits together. Update this file with every meaningful
> change.

**Last updated:** 2026-07-07 (Session 14 PLAN - §18: Keyword Cannibalization promoted to a top-level tool + 4-tab upgrade). 2026-07-06 (Session 13 - Content Clusters rewritten to topic-token leader clustering; §17K-N follow-ups: member-common labels, wider coverage, programmatic blog-series grouping (lib/series.ts), filter/UI rework; template-noise fix shared into the Conflict Checker; ingest/redirect durability fixes; checker UX incl. collapsible panels + sidebar cleanups)
**Repo:** https://github.com/Layruss98266/Edstellar-Conflict-Checker-KnowledgeBase
**Prod:** https://edstellar-conflict-checker-knowledg.vercel.app/

---

## 1. What this project is

A content-intelligence app for Edstellar's marketing team. Before publishing any
new blog / course / landing page, paste the URL or topic and:

1. Get an AI **summary** of what's being proposed.
2. Get a **0–100% conflict score** + ranked list of existing pages it overlaps
   with (cannibalization risk).
3. See the **per-signal breakdown** (title / H1 / URL / body scored separately),
   a rule-based **search-intent** label, and a deterministic **suggested
   resolution + winner** (merge / consolidate / differentiate / keep-both) per
   match - Session 11.
4. Browse **similar-page groups** across the whole corpus (connected components
   of the near-duplicate scan) with a winner + action per group - Session 11.

> **Session 11 removed GSC + competitor data from the Conflict Checker.** The GSC
> performance panel, "your GSC rank", cannibalization banner, and the Competitor
> SERP / AI Overview block were all deleted, and the `/api/check/enrich` +
> `/api/check/cannibalization` routes with them. GSC + competitor research still
> live on their own pages (`/search-console`, `/competitors`).

The corpus = every URL in https://www.edstellar.com/sitemap.xml (2,479 URLs raw;
**~2,461 after the junk-URL filter** in `lib/sitemap.ts` drops tag archives,
`/sitemap`, paginated pages, and file downloads - see Session 4), crawled,
classified, and embedded into a Postgres `pgvector` index hosted on Neon.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router, TS) | One process for UI + API routes |
| Styling | Tailwind 4 | Mirrors mockup look-and-feel quickly |
| Database | **Neon Postgres** (pooled) + **pgvector** | Serverless, free tier, vector search built-in |
| ORM | `@neondatabase/serverless` (raw SQL) + drizzle | drizzle for types; raw `neon()` for fast scripts |
| Embeddings | **Local** - `@xenova/transformers` `bge-small-en-v1.5` (384-dim) | No API key, works offline. OpenAI 1536-dim adapter stubbed for later |
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

## 2b. Data flow - where the categorisation on /corpus comes from

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

No HTML download required at runtime - the JSON files are committed to
`data/taxonomy/`.

## 3. Data model

`drizzle/*.sql` - idempotent, apply with `npm run db:setup`.

### Core tables
- **pages** - the corpus. `url, title, meta_description, h1, content_text,
  content_type, course_type, category, subcategory, tags TEXT[], lastmod,
  embedding vector(384), token_count, crawled_at`. HNSW index on `embedding`.
- **checks** - every conflict check run. `input_type, input_value, summary,
  keywords, candidate_embedding, top_score, created_at`.
- **check_matches** - per-check results. `check_id, page_id/url/title,
  similarity, conflict_score (0–100), conflict_type, rationale, rank`.
- **gsc_connections** - OAuth tokens (most-recent wins).
- **gsc_metrics** - cached GSC rows (date dimension).
- **catalog_conflicts** - precomputed all-pairs similarities.
- **competitors** - Serper-discovered + LLM-summarized competing pages.

### Provider abstraction
- `lib/ai/types.ts` defines `EmbeddingProvider` and `ChatProvider`.
- Default embedder: local Transformers.js (`bge-small-en-v1.5`, 384-dim).
- Default chat: Groq. Swap with `AI_CHAT_PROVIDER=claude|openai` in `.env`.
- OpenAI adapter compiles but throws unless `OPENAI_API_KEY` is set.

---

## 4. Session log

### Session 1 - 2026-06-24
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
- **`lib/taxonomy.ts`** - URL → `{contentType, courseType, category,
  subcategory, tags[]}` using the catalog. Anything unmatched = `static`.
- **`scripts/backfill-tags.ts`** retagged all 2,479 rows. Breakdown:
  **1,698 course / 500 blog / 102 subcategory / 102 static / 43 category /
  33 industry / 1 home**.
- **GSC section v2**: `lib/gsc-insights.ts` + `/api/gsc/insights` -
  6 tabs (Overview, Cannibalization, Striking Distance, Movers, Untapped,
  Catalog Gap), CSV export on every actionable table, country/device split.
- **Corpus UI**: type breakdown cards, color-coded type pills, tag filter
  chips, search, **pagination** (default 50/page; jump first/last/n).

### Session 3 - 2026-06-24 (shipped log)

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
  in `app/components/ui.tsx` is the single source of truth - both Corpus
  and Conflict Checker import it. Filter chips in Conflict Checker colored
  by type to match. `2c30f15`
- **Competitor SERP card moved directly under Summary** so the user sees
  external context before drilling into matches. `98d72ea`
- **Per-match summary collapsed behind a Show/Hide toggle.** Cleaner
  default view; keeps stats + keywords above the fold. `725a422`
- **Personalised per-match summary with shared topics + issue callout.**
  `ConflictVerdict` gains `overlap[]` and `issue` fields; prompt rewritten
  to ban generic boilerplate (`"Be specific - name the actual topics that
  overlap; never use generic phrases like 'both pages discuss similar
  topics'"`) and demand per-page rationale. UI renders amber chips for
  shared topics, a rose-bordered warning callout for the issue, then the
  rationale sentence. `ee649ba`
- **Collapsed two redundant filters into one + added potential keywords.**
  Removed the "Min similarity" slider; "Min score" (default 80%) is now
  the single user-facing cut-off. `lib/gsc-page-stats.ts` also derives
  `potentialQueries` (striking-distance pos 11–30, sorted by impressions)
  from the same GSC call - surfaces opportunity, not just current
  performance. `0a4b05b`
- **Cleaner match-card layout, no more keyword truncation.** Switched from
  3 equal columns to 2 (compact stats panel | full-width keywords). New
  `<KeywordList/>` helper handles both Top + Potential with proper
  wrap-not-truncate behavior. `d3193e9`
- **SERP lookups use a page-specific primary query.** `SummaryResult`
  gains optional `primaryQuery` - a 4–8-word long-tail SEO query the LLM
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
  the existing `GROQ_MODEL` env var. `.env` change only - not in git
  (`.env` is gitignored on purpose). The 70b model still works; switch
  back any time by removing the env or setting `GROQ_MODEL=llama-3.3-70b-versatile`.

### Session 3 - 2026-06-24 (original plan, kept for reference)

**Trigger:** user requested every improvement listed in §5 below + "show ALL
matching pages on Conflict Checker, not just 10, with pagination." Work is
broken into batches; each batch ships, gets pushed, then the next starts.

**Batch 1 - Conflict Checker: show all matches**
- `lib/conflict.ts` - new params `vectorLimit` (default 100), `classifyLimit`
  (default 15), `minSimilarity` (default 0.30). Returns every page above the
  similarity threshold; the top `classifyLimit` get the full LLM
  classification (cost-bounded), the rest get a similarity-derived score
  with `conflictType="needs-review"` and no rationale.
- `/api/check` accepts the new params.
- Conflict Checker UI: count headline ("47 pages with conflict ≥ 30%"),
  paginate the match list, threshold + sort filters, lazy "Explain" button
  on un-classified matches that calls a new `/api/check/classify-one`.

**Batch 2 - Save & compare drafts** (user-requested last session)
- New `draft_snapshots` table; "Save snapshot" + "Compare" in Conflict
  Checker; diff view of score deltas per match.

**Batch 3 - Auth + cross-cutting**
- NextAuth + Google SSO restricted to @edstellar.com
- Rate-limit `/api/check` (Groq free-tier headroom)
- `route_errors` table for any 500 from API routes

**Batch 4 - Corpus depth**
- Inline GSC stats + health score columns on the Corpus row
- CSV export of current view
- Sortable columns, semantic search, "new since" filter
- Sitemap-drift report

**Batch 5 - Internal Links + Conflict Checker: paragraph-level**
- Embed each paragraph; surface "paragraph N could link to X"
- Type filter, same-section exclusion
- Reverse view (who should link to this page?)

**Batch 6 - Search Console depth**
- Custom date range picker + compare-two-ranges
- Branded/non-branded as separate trend lines
- Persist Index Coverage results (gsc_inspections table)
- Click-stale → prefill Conflict Checker

**Batch 7 - Audit + Catalog Conflicts depth**
- Trigger broken-link scan from UI
- Health-score breakdown (show contributing factors)
- Bulk LLM title/meta rewrite
- Catalog Conflicts: recompute button, merge recommendation, GSC
  cannibalization cross-reference

**Batch 8 - Competitors + AI**
- Show our matching URL when Edstellar is in the SERP
- Batch freshness, "topics from GSC", saved competitor list
- Cost & tokens shown per check; prompt version tag; LLM cache

**Batch 9 - Cluster view UI + History polish**
- Surface `pages.cluster_id` as a browsable view
- History: CSV export, delete, annotate, mark "published date"

### Session 2 - 2026-06-24
- **Bulk Conflict Check** - paste lines or upload CSV, run all checks
  concurrently, download verdicts as CSV.
- **Pre-publish webhook** - `/api/check` documented; optional API-key auth via
  `WEBHOOK_API_KEY` env.
- **Conflict score history** - every `checks` row is browseable; per-input
  trend.
- **Internal-link suggester** - for any draft text/URL, return top-K existing
  pages it should link to.
- **Content audit** - title/meta length, broken-link scanner (HEAD requests
  with `http_status` column), composite content-health score.
- **GSC: branded vs non-branded** split on every tab.
- **GSC: page drilldown** - click a page in the Top Pages table → see its
  queries / countries / devices.
- **GSC: stale-content detector** - pages with sliding-window click decline.
- **GSC: index coverage** - `urlInspection.index` API: sitemap URLs not
  actually indexed.
- **Competitor extensions** - SERP overlap (per topic), domain comparison,
  content-freshness audit (lastmod scrape).
- **AI quality** - `scripts/cluster-topics.ts` (k-means over embeddings);
  conflict checker now includes a "How to differentiate" rewrite section.
- **Cron config** - `vercel.json` weekly re-ingest, daily GSC snapshot,
  weekly broken-link scan.

### Session 4 - 2026-06-25 (going to production)

The session that took the app from "works on my laptop" to "live on
Vercel at edstellar-conflict-checker-knowledg.vercel.app, serving real
HTTP 200s with score 75 matches end-to-end". Organised by theme rather
than commit order - the actual SHA trail is in `git log` between
`36282e9` and `1ffd9fa`.

**A. Repo reorganised for Vercel deploy**
- `dbf12d0` Flattened `conflict-checker/` subdir to repo root so Vercel
  auto-detects the Next.js app without a root-dir override. All file
  paths shift up one level; PROJECTLOG layout block updated.
- `36282e9` Added `docs/` knowledge base (about-edstellar, glossary,
  conflict-types, conflict-rules, examples, data-sources, repo-overview)
  + moved Intelligence Hub HTML to `reference/`; deleted duplicate root
  `sitemap-urls.csv`.
- `b942833` `.env.example` covering all 19 `process.env.*` vars used by
  the code (CRON_SECRET, WEBHOOK_API_KEY, BRAND_TERMS were missing in
  earlier docs); `.nvmrc` (22) + `package.json engines >=20`.
- `cd6ab1f` + `b5d3551` New `VERCEL_GITHUB_GUIDE.md` + matching `.html`
  - plain-English walkthrough for a first-time deployer covering: the
  big-picture map, GitHub branch rules, Vercel import + env-var matrix
  (minimum vs optional), first-deploy seeding, custom domain, cron plan
  limits (Hobby vs Pro), day-to-day update workflow, rollback,
  troubleshooting, secret rotation.

**B. Vercel deploy unblockers**
- `fab03ad` Fixed 3 pre-existing TS errors blocking Vercel's
  `Failed to type check` step: `lib/competitors-extra.ts:107` iterating
  the wrong shape from `serperSearch().catch(()=>[])`,
  `lib/gsc-insights.ts:164` `NonNullable<typeof catalogTokens>`
  resolving to `never` under strict mode, `lib/gsc-page-stats.ts:135`
  missing `potentialQueries` field in the error-fallback push.
- `f9713b8` Wrote `next.config.ts` after reading the Next 16 docs in
  `node_modules/next/dist/docs/`:
  - `serverExternalPackages: [@xenova/transformers, onnxruntime-node,
    jsdom, cheerio, googleapis]` - keeps native deps out of the webpack
    bundle so Node's `require` resolves them at runtime.
  - `outputFileTracingIncludes['/*']: [data/**, onnxruntime-node/bin/**,
    @xenova/transformers/**/*.json]` - ships the binaries + taxonomy
    JSON that @vercel/nft's static analyser can't trace (the
    `readFileSync(join(process.cwd(),"data",…))` reads have dynamic
    paths; the `.so` is loaded via dlopen).
  - Without this `/api/check` 500'd in prod with
    `libonnxruntime.so.1.14.0: cannot open shared object file`. Verified
    fixed via post-deploy curl.

**C. Data correctness - strip noise everywhere**
- `33886cc` `lib/extract.ts` rewritten with ~70 noise selectors covering
  ARIA roles, hidden elements, related-posts rails, share widgets,
  breadcrumbs, author bios, newsletter/CTA blocks, popups, cookie
  banners, ad slots, tag clouds, skip-links, back-to-top. Now picks the
  most specific content root (`article` → schema-tagged →
  `.post-content`/`.entry-content`/`.prose` → `main` → `body`) with a
  200-char floor, then strips noise *again* within the chosen root
  (related rails are usually nested inside `<article>`, not siblings).
- `0c5ea9b` `lib/sitemap.ts` got `JUNK_URL_PATTERNS` + `isJunkUrl()`:
  drops `/sitemap`, all 17 `/tag/*` archive pages, `/page/N` pagination,
  `.xml/.pdf/.zip/.doc/.ppt/.xls/.csv/.json/.rss/.atom`, `/wp-admin`,
  `/feed`, `/search`, `/login`, `/cart`, `/checkout`, `/account`,
  share/preview/comment-reply query params. Tag archives were the worst
  offender - they re-list other posts' titles+snippets so they always
  scored ~70% similar to any candidate. Opt-out flag for the audit
  script which still wants the unfiltered set.
- `0c5ea9b` `lib/competitors.ts` filter tightened: `isEdstellarDomain()`
  now uses exact-suffix match (old `includes("edstellar")` would drop a
  legit `edstellar-comparison` post on a competitor site);
  `NOISE_DOMAINS` set + `NOISE_PATH_EXTENSIONS` drops video/social/
  forum/file-share destinations; per-domain dedup so top 6 aren't all
  from oreilly.com. Bumped Serper request size 12→20 since the filter
  chain now eats more of the first page.
- One-off: 18 junk rows deleted from prod DB via
  `scripts/cleanup-junk-pages.ts` (17 tag archives + 1 sitemap page);
  full re-ingest of 2,461 URLs with the new extractor - 0 failures.

**D. GSC robustness - works with or without trailing slash**
- `fa66c39` `lib/gsc.ts` got two new exports:
  - `siteUrlCandidates(env)` derives up to 4 candidates: literal,
    trailing-slash flipped, `sc-domain:<host>`,
    `sc-domain:<host-without-www>`.
  - `resolveSiteUrl(client)` calls `webmasters.sites.list()`,
    intersects candidates with what the connected account is actually
    verified on (filters out `siteUnverifiedUser`), returns the first
    match. Module-level cache keyed on a token fingerprint so it probes
    only once per cold start. If nothing matches throws a useful error
    listing exactly which properties ARE accessible - saves the
    "User does not have sufficient permission" debug loop.
- All call sites (`querySearchAnalytics`, `buildInsights`,
  `pageDrilldown`, `indexCoverage`, `pageStats`, `gsc-snapshot` cron)
  switched from `process.env.GSC_SITE_URL` direct read to
  `resolveSiteUrl(client)`.

**E. UX polish**
- `95468cc` Audit / Health Score rewritten: severity chips
  (`all (N) / weak <60 / medium 60-79 / strong ≥80`) with corpus-wide
  counts, min-health slider that tightens within the chip's band,
  rows always sorted weakest-first regardless of filter. Old
  `Max health: 100 · 1000 of 1000 match` was confusing - looked broken
  at the slider's max value.
- `96d5925` Corpus / Home tile dropped - `lib/taxonomy.ts` `tagUrl()`
  for path `/` now returns `content_type='static'` keeping `home` as a
  tag. One-off `scripts/reclassify-home.ts` migrated the existing prod
  row from `home` → `static` (Static 107→108). Standalone 1-page tile
  gone.
- `c346a78` Branded metadata. Replaced default Next favicon + the 5
  unused demo SVGs (`file/globe/next/vercel/window.svg`) with
  programmatically-generated `app/icon.tsx` (32×32, gradient `CC` mark),
  `app/apple-icon.tsx` (180×180), `app/opengraph-image.tsx` (1200×630
  social card), `app/manifest.ts`, `app/robots.ts` (noindex - internal
  tool). `app/layout.tsx` metadata expanded: `metadataBase` from
  `APP_BASE_URL`, `title.template '%s · Edstellar Conflict Checker'`,
  `openGraph` + `twitter` + `viewport.themeColor`. All icons render at
  request time via `next/og's ImageResponse` - no binary assets shipped.
- `1ffd9fa` Catalog Conflicts / `scripts/catalog-conflicts.ts`
  rewritten. Old run flagged `Enquire Now ↔ Get a Free Demo @ 94%` as a
  top result. Now: `EXCLUDED_CONTENT_TYPES = {static}` drops 108
  pages; template-noise filter drops `sim ≥ 0.97` pairs where one or
  both pages have <1500 chars body; pair_type taxonomy tightened
  (`duplicate` ≥0.95 same-type, `cannibalization` ≥0.85 same-type,
  `category-bleed`, `subcategory-bleed`, `overlap`). New prod result
  set: 4,024 pairs (3,679 cannibalization / 300 subcategory-bleed /
  25 duplicate / 17 category-bleed / 3 overlap).
- `1ffd9fa` Net-new content suggestions rewritten. The UI was rendering
  a rambling paragraph from `suggestions.raw` because the old route
  called `chat.summarize()` (wrong primitive - it summarises, doesn't
  generate) with no per-field length caps. Now:
  - Added `ChatProvider.generate({system, prompt})` as a public
    passthrough to the `BaseChatProvider.complete` primitive, parallel
    to `summarize` / `classifyConflicts`.
  - Route uses strict word/char caps per field (title ≤9, headline ≤14,
    audience ≤6, differentiation ≤18), bans `ultimate`, `guide to`,
    `everything`, `complete`. Returns clean `{headline, angles[]}`; the
    raw-text fallback panel is gone, replaced by a small "Re-run" hint
    if parsing ever fails.

**F. Production verification**
- `2200de1` Replaced every `<your-project>.vercel.app` placeholder
  across README + SETUP_GUIDE + VERCEL_GITHUB_GUIDE (md + html) with
  the actual prod URL `edstellar-conflict-checker-knowledg.vercel.app`
  - Vercel truncated the auto-slug from the full repo name.
- End-to-end smoke test from prod:
  `POST /api/check` with `{input:"leadership skills for first-time
  managers"}` → HTTP 200, `topScore: 75`, real matches with summary +
  keywords + primaryQuery.
- Spot-check of 3 random blog rows in `pages.content_text` shows the
  new extractor working - some site-chrome leakage remains (`BLOG`
  label, `Share <category>` chips, `Updated On … mins read` meta,
  `ContentTable of Content` TOC header) but the LLM filters those at
  summarise time. Tighten further if a per-theme selector audit
  warrants it.

**User-side wrap-up (all done per user, 2026-06-25):**
- ✅ Secrets rotated (Neon DB password, Groq key, Serper key, Google
  OAuth client secret).
- ✅ Vercel env vars updated: `APP_BASE_URL`, `GOOGLE_REDIRECT_URI`
  point at the prod Vercel URL.
- ✅ Google Cloud Console redirect URI updated (prod + localhost both
  whitelisted).
- ✅ Vercel plan confirmed.
- ✅ GSC permissions wired.

**Code-side follow-ups done in the same session:**
- `feat(dashboard)` - actionable home: attention banners (high-risk
  checks 7d / 4xx links / thin pages / GSC unconnected), 6 stat cards
  with color-by-signal, recent checks panel (last 8), top catalog
  conflicts panel (5 worst), all clickable. Same SQL roundtrip budget.
- `lib/country.ts` + GSC By-Country tables - country codes (`ind`,
  `usa`, `phl`) now display as full names ("India", "United States of
  America", "Philippines") via the `i18n-iso-countries` package.
  Falls back to uppercased code for unknown values.
- Edstellar-theme selector audit on `lib/extract.ts` - found the leaked
  fragments from Session 4 spot-check were emitted by `.blog-tag-block`
  ("BLOG" pill), `.update-date` (post meta line), `.bog-index-text`
  (ToC widget - theme typo on "blog"), `.share-wrapper` /
  `.share-articles-footer` / `.share-text`, `.authors-block` /
  `.blog-author-block` / `.blog-authors-footer`. Added an
  Edstellar-theme block to `NOISE_SELECTORS`. Verified against live
  /blog/it-manager-skills - six leak patterns all clean.

---

### Session 5 - 2026-06-25 (autonomous free-path sprint)

User opted into ultracode-style autonomous batching with the brief: take
the free path from §9 backlog, build everything possible, push in
batches, paid-key items deferred to §9E. Seven batches landed
(A → F2) - full git trail between `3509573` and `2cebd14`.

**Batch A - Foundation** (`3509573`)
- New `PRE_PUSH_CHECKLIST.md` - 6-section checklist (code health,
  secrets safety, docs sync, Vercel-ready, GitHub-ready, smoke).
  Includes a paste-in-terminal quick version + after-push verification.
  Referenced by every subsequent batch.
- §9E (this section's sibling) moved paid items off the active
  backlog: DataForSEO/Ahrefs/Moz, Serper Pro, OpenAI embeddings,
  CMS write-back, Pagespeed at scale. Lift back when funded.
- README repo-layout block lists the new file.

**Batch B - Security + Zod + structured logging** (`86aa808`)
- New `rate_limits` table + `lib/rate-limit.ts` (Postgres sliding
  window; fail-open on DB error). Wired into POST /api/check
  (60 req/min/IP) and POST /api/check/bulk (10 req/5min/IP) as the
  fallback when WEBHOOK_API_KEY isn't set. 429 sets Retry-After +
  X-Ratelimit-*. (#1)
- `/api/cron/audit-links` rewritten: HEAD probes concurrency=10 +
  UNNEST UPDATE batched 200/round-trip. 1500 sequential UPDATEs
  → 8. Comfortably finishes under 300s now. (#2)
- Zod schemas on POST /api/check + POST /api/check/bulk. Per-field
  caps (input ≤4000c, inputs[] ≤100, vectorLimit ≤500,
  classifyLimit ≤50, minSimilarity in [0,1]). (#4)
- `lib/logger.ts` - JSON-line stdout/stderr split with LOG_LEVEL env.
  Replaced 3 production-path console.error/warn in
  `lib/conflict.ts`, `app/api/gsc/callback/route.ts`,
  `lib/competitors.ts`. Scripts kept console.log for terminal output
  (intentional). (#7 partial - Sentry deferred to §9E)
- Migration `0003_rate_limits.sql` applied to prod.

**Batch C - UX core fixes** (`4e045d6`)
- Bulk-Check (#13) - replaced single POST → client-side worker pool
  hitting /api/check per row, live `Running… 12/50` counter + slim
  progress bar update on each finished row. vectorLimit dropped
  100→30 + classifyLimit 15→5 in bulk mode for faster TTFB.
- Sidebar (#19) - drawer + burger on < lg viewports, in-flow on
  ≥ lg. Backdrop closes; route change auto-closes.
- Pagination (#16) - built-in `useEffect(() => onJump(1))` when
  current page falls past the new total. Kills the every-caller
  `useEffect(() => setPage(1), [filter])` boilerplate.
- Polish: search-console modal Esc-close (#14), GSC lookup `https://`
  validation (#24), /conflict-checker 5s 'still working' hint (#15),
  /catalog-conflicts subtitle now mentions weekly cron (#20), all 4
  empty states rewritten to remove `npm run …` instructions (#17),
  /internal-links button label fix (#21), bulk-check CSV download
  disabled-while-running (#22).

**Batch D - SEO data foundation** (`2be8227`)
- Migration `0004_seo_columns.sql` - added to pages:
    owner_url, gsc_clicks_28d, gsc_impressions_28d, gsc_position_28d,
    gsc_synced_at, canonical_url, image_count, images_no_alt,
    is_stale, stale_reason
  Added to checks: verdict, outcome, resolved_at.
  Plus filter-column indexes on content_type / course_type /
  category (#9A item 8). Schema mirror in `lib/db/schema.ts` updated.
- `lib/extract.ts` ExtractedPage now carries canonicalUrl,
  imageCount, imagesNoAlt. Image counting happens BEFORE the noise
  strip so we cover in-content images. (#32, #41)
- `scripts/ingest.ts` + `/api/cron/reingest` UPSERT writes the new
  columns.
- `/api/cron/gsc-snapshot` rewritten into three jobs in one cron:
    1. legacy daily totals (unchanged)
    2. (new) per-page 28d clicks → pages.gsc_clicks_28d via one
       searchanalytics.query + UNNEST UPDATE (#26)
    3. (new) flag pages stale where clicks < 5 AND lastmod > 365d
       AND content_type in (blog,course,category,subcategory). Reset
       first so recovered pages unflag. (#28)
  maxDuration 120 → 300.
- `lib/conflict.ts` - new `impactWeighted(m)` sort:
    impactWeighted = conflictScore × (1 + trafficBoost + ownerBoost)
    trafficBoost = min(1, log10(clicks+1)/4)
    ownerBoost   = +0.25 if matched URL IS the owner
  A 70%-conflict with 12k clicks now outranks a 90%-conflict with a
  dead page. (#26)
- `lib/search.ts` SELECT and VectorMatch now include owner_url +
  gsc_clicks_28d + gsc_impressions_28d.
- `/api/pages` GET returns the new columns so the corpus UI can
  display them.
- New `POST /api/pages/owner` - Zod-validated set/clear of the
  editorial owner per URL. (#25)
- `scripts/db-setup.ts` hardened: strip line comments BEFORE the
  `;`-split to fix the "cannot insert multiple commands" prepared-
  statement error on inline-comment-after-semicolon migrations.

**Batch E - Surface SEO data in the UI** (`165177a`)
- Conflict Checker match cards - Owner / Non-owner pill (#25),
  amber 'N clicks · 28d' chip when GSC clicks present (#26),
  'Suggested action: redirect to the owner' hint on non-owner
  matches.
- Corpus rows - new 'Clicks 28d' column (bold ≥100). New 'Signals'
  column with Owner / Stale / alt-debt / canonical-mismatch chips
  (each with tooltip showing the underlying value).
- Audit page - three new tabs:
    Canonical: split between 'missing' (red) and 'cross-canonical'
      (amber, target ≠ url). (#32)
    Images: pages with images_no_alt > 0, sorted by absolute count.
      Shows N missing / total / %. (#41)
    Stale: pages where is_stale=true, sorted by lowest 28d clicks
      first then oldest lastmod. (#28)
- `/api/audit` handles kind=canonical / images / stale.

**Batch F1 - CTR opportunity + sitemap-drift** (`b4ef97f`)
- New `CTR Opportunity` tab on /search-console between Striking
  Distance and Movers. (#27) Filter: position ≤ 10 AND impressions
  ≥ 200 AND ctr < 0.5 × expected (industry curve 0.3/pos). Surfaces
  title/meta rewrite candidates. CSV export, sorted by missed clicks.
- New `GET /api/sitemap-drift` - fetches the live sitemap.xml,
  recurses one level (capped 50) for sitemap-index, filters through
  `isJunkUrl()` on both sides, returns publishedNotIngested +
  removedFromSitemap. (#30) UI surfacing deferred - endpoint ready
  for a future dashboard panel.

**Batch F2 - Closes the editorial loop** (`2cebd14`)
- Writer brief export (#35) - 'Copy brief' button on /conflict-
  checker (only when suggestions have angles). Builds a Markdown
  outline from check + suggestions + matches and copies to
  clipboard. Sections: title from top angle, headline blockquote,
  key/value meta, summary, keywords, alternative angles, 'Avoid
  overlap' (with ownerUrl + gscClicks28d), 'Suggested internal-link
  targets'.
- Check outcome tracking (#36) - new `POST /api/check/outcome`
  + dropdown in /history per row (published / merged / redirected /
  discarded / no outcome). Writes outcome + resolved_at on the
  check row. /api/check/history SELECT extended to include outcome.
- Dashboard - new 3-tile row (renders only when at least one of the
  three is > 0): `Caught in last 90 days` (merged/redirected/
  discarded), `Published last 90 days`, `Stale pages`. Leadership
  reporting without leaving the dashboard.

**Skipped this sprint (still in §9 backlog):**
- #5, #6, #10 - `as any` cleanup, LLM JSON validation, partial-
  failure cron status codes. Each is a small follow-up.
- #18 - terminology consistency pass (conflict score vs similarity).
  Deferred because some surfaces use the distinction intentionally.
- #23 - Health Score chip overflow on narrow viewports. Already
  uses flex-wrap; verify on mobile.
- #33 - NextAuth + Google SSO. Requires the OAuth consent screen
  to leave testing mode; user action.
- #39 - FAQ/PAA reuse in suggestions. Would need Serper-side parse
  changes; defer until briefing flow is exercised.
- #43 - Topic-cluster health view. Data is there
  (data/taxonomy/course-types.json + content_type counts); deferred
  pending UI decision (own page vs corpus sidebar).
- #44 - Paragraph-level internal-link insertion. Bigger change
  needing UX design.

**Backlog gives the next ~10-15 commits a clear runway** without
needing new external services.

**Session 5 continuation - 9C-cleanup batch (`91f6b3f` → `955b11c`)**

H1 (`91f6b3f`) - code hygiene:
- `lib/db/exec.ts` `rowsOf<T>()` helper kills the `(x as any).rows ?? x`
  cast pattern that papered over Drizzle's inconsistent return shape.
  Applied across `lib/search.ts`, `app/api/pages/route.ts`,
  `lib/conflict.ts`. (#5)
- Zod schemas (`SummarySchema`, `VerdictSchema`, `VerdictsSchema`,
  `CompetitorSchema`) validate every LLM response shape in
  `lib/ai/chat-base.ts`. Z.enum on `conflictType` blocks hallucinated
  values that the LLM occasionally invents (e.g. "mild-overlap").
  Failure paths fall back to defensive defaults instead of NaN-ing
  downstream `blendScore()`. (#6)
- `/api/cron/reingest` returns 500 when `failed/(done+failed) > 0.25`;
  `/api/cron/audit-links` returns 500 when `broken/checked > 0.30`.
  `gsc-snapshot` already 5xx's via its catch. Vercel cron dashboard
  now flags partial failures. (#10)

H2 (`0fc9890`) - topic-cluster health (#43):
- New `Clusters` tab on `/audit`. SQL groups by (`course_type`,
  `category`) with FILTER aggregates. Editorial-debt score
  `max(0, courses/3 - blogs)` surfaces clusters where the team has
  product pages but no awareness content. Red blog count when 0,
  amber/red debt chip when > 0.

H3 (`a70c867`) - SERP PAA + answer box (#39):
- `SerpOverlapResult` gains `peopleAlsoAsk[]` (question + snippet)
  and `answerBox`. Serper was already returning them.
- `/api/suggestions/new-content` response surfaces `serp.peopleAlsoAsk`
  + `serp.answerBox`.
- New "Questions to address" card on `/conflict-checker` below the
  angles grid.
- `copyWriterBrief` adds `## Questions to address (Google PAA)` +
  `## Current featured snippet on this topic` sections. Writers
  asked; data was free.

H4 (`955b11c`) - paragraph-level link insertion (#44):
- New `POST /api/internal-links/paragraph`. Body accepts URL, free
  text, or pre-split `paragraphs[]`. URL → 5-sentence chunks; text →
  blank-line split with 80-char minimum. 40-paragraph cap, 1-6
  suggestions per paragraph. Zod + rate-limit 20/5min per IP.
- `/internal-links` page gets a "Whole page" / "Per paragraph" pill
  toggle. Per-paragraph mode renders one Card per paragraph with a
  preview text + suggestions list.
- Help-content entry rewritten for both modes.

**All free-path backlog items shipped.** Remaining open in §9:
- #18 (terminology consistency) - intentional in some surfaces.
- All of §9E (paid-key items) - lift when funded.

**Session 5 - Auth batch**

NextAuth + Google SSO (#33). Code lands behind `AUTH_ENABLED` - flip to
true once the OAuth consent screen is published.

- `auth.ts` (root) - NextAuth v5 (`5.0.0-beta.31`). Google provider
  reuses the existing GSC OAuth client. signIn callback rejects emails
  outside `AUTH_ALLOWED_DOMAINS` (default `edstellar.com`). JWT
  session, 12h TTL. Exports `auth`, `handlers`, `signIn`, `signOut`,
  plus an `isAuthEnabled()` helper every gated consumer checks.
- `app/api/auth/[...nextauth]/route.ts` - re-exports handlers.
- `proxy.ts` (Next 16 file convention; renamed from middleware.ts to
  resolve the build-time deprecation warning). When the env flag is
  off the proxy returns `NextResponse.next()` immediately. When on
  it gates every route except a small allow-list (`/signin`,
  `/api/auth/*`, `/api/cron/*`, `/api/check*`, Next file-conventions).
- `app/signin/page.tsx` - server component. 'Continue with Google'
  form action calls `signIn('google', { redirectTo })`. Reads
  `returnTo` from the proxy redirect. Error banner translates the
  AccessDenied case.
- `app/(dashboard)/layout.tsx` - fetches `auth()` server-side when
  enabled, passes `user` to `<Sidebar user={...} />`.
- `app/components/Sidebar.tsx` - accepts optional `user` prop, renders
  avatar/name/email + 'Sign out' POST form at the bottom of the
  drawer. Added `flex flex-col` so `mt-auto` pins it.
- `app/api/check/route.ts` - session email overrides body-supplied
  `createdBy` when auth is on (caller can't spoof attribution).
- `.env.example` + `SETUP_GUIDE.md` STEP 7 walk through the
  consent-screen publish, redirect URI add, AUTH_SECRET generate,
  Vercel env + redeploy. Rollback path documented.
- `lib/help-content.ts` got a `/signin` entry with the AccessDenied,
  redirect_uri_mismatch, and AUTH_SECRET-loop troubleshoot pairs.

Verified: `npx tsc --noEmit` exit 0, `npx next build` clean - both
`/api/auth/[...nextauth]` and `/signin` register; the
middleware-deprecation warning is gone after the proxy.ts rename.

§9 backlog now down to: #18 (intentional) + all §9E (paid).

**Session 5 - polish + branding batch (`ca1b2a7` → `99599a9`)**

Seven small commits after auth landed. Each one was triggered by a
specific user observation while exercising the live app.

- `ca1b2a7` chore - empty commit nudging Vercel to redeploy because
  the auto-trigger on `50c7d46` (the auth commit) didn't fire. Prod
  was stuck on `4cefdaa` even though `main` had the auth code.
  Confirmed live by `/api/auth/providers` returning 200 with the
  Google provider JSON after the rebuild.

- `623d9d0` ui - match-card header + GSC grid redesign. Title bumped
  to base/semibold; vector-similarity merged into an inline meta strip
  with the 28d-clicks chip + the 'redirect to owner' indigo pill; the
  GSC stat panel lost its heavy `bg-slate-50` box for an inline `<dl>`
  grid; score number bumped to 20px bold; subtle hover state on the
  Card. Same data, cleaner presentation.

- `a10dbe8` fix - two bugs:
    1. Sign-out left the user on the dashboard. The plain
       `<form action="/api/auth/signout" method="post">` returned 200
       but didn't actually invalidate the JWT cookie in NextAuth v5
       without the CSRF token + callbackUrl fields. Fix: new
       `app/components/SignOutButton.tsx` server component using the
       `signOut({ redirectTo: '/signin' })` server action - the v5
       official sign-out pattern. Layout passes it as a `signOutSlot`
       prop into the client Sidebar.
    2. Canonical audit + corpus row flagged legitimate self-canonicals
       as 'cross-canonical' when the only diff was a trailing slash,
       `www.`, or http/https. New `lib/url.ts`:
         normalizeUrl(input) - lowercase host, strip www., strip
           trailing slash, drop fragment.
         sameUrl(a, b) - normalised equality.
       `/api/audit?kind=canonical` re-classifies in JS via the helper
       and drops self-canonicals before returning. /corpus row chip
       switched from `!==` to `!sameUrl(...)`. False positives gone.

- `524f669` feat - blog clusters table alongside course clusters.
  All 500 blogs have `course_type=NULL` and the blog corpus uses a
  separate broader category taxonomy ('Training & Development',
  'Leadership & Management') vs the course catalogue's
  ('Artificial Intelligence', 'Cloud Computing'). Joining would
  always produce 0 blogs per course cluster - which the user spotted
  on the Clusters tab. Fix: `/api/audit?kind=clusters` now returns
  two payloads (`rows` + `blogRows`), UI splits into Course clusters
  (existing) + Blog clusters (new) - single table grouped by blog
  category with Stale % colour-coded bands.

- `fe8e416` ui - higher default page sizes. The 184-row Meta list
  felt slow at 50/page. Audit / Corpus / Bulk Check default to 100;
  Catalog Conflicts + History default to 50. DEFAULT_PAGE_SIZES
  bumped to [50, 100, 200, 500]. Pagination already auto-resets to
  page 1 when total < page × pageSize so the bump can't strand
  anyone on an empty page.

- `ec6545c` ui - 50/50 GSC vs keywords split + proper tables on the
  match card. The `200px_1fr` grid template made GSC narrow and
  keywords-heavy; switched to `lg:grid-cols-2`. Replaced the `<dl>`
  and `<ul>` shapes with real `<table>`s - thead labels (Metric / 6m
  / 12m for GSC; Query / Pos / Clk / Impr for keywords), tbody rows
  with hairline dividers, `table-fixed` widths so long queries don't
  squash the numeric columns.

- `99599a9` feat - real Edstellar logo in sidebar, sign-in, favicon.
  Assets copied from the user-provided brand folder into
  `public/brand/` (5 SVGs + 2 PNGs) and into `app/icon.svg` +
  `app/apple-icon.png` via the Next 16 file-conventions for
  metadata-icons. Deleted the generated `app/icon.tsx` +
  `app/apple-icon.tsx` (the gradient `CC` placeholder marks).
  Sidebar header swapped the gradient tile for the circle mark +
  wraps the whole row in a `<Link href="/">` so clicking the logo
  goes home. Sign-in page swapped the gradient tile for the full
  Edstellar wordmark divided from 'Conflict Checker' by a vertical
  rule. `app/manifest.ts` icons array points at the new static
  paths with correct MIME types. OG image left untouched
  intentionally - it's a `next/og` generator and embedding the SVG
  would add a per-render fetch; the text 'Edstellar / Content
  Intelligence' on the card is on-brand enough.

**Closing the session.** §9 backlog is at #18 (intentional in some
surfaces) + §9E paid items only. Everything user-actionable from the
original audit has shipped.

### Tier C - needs an external API key / decision
| Feature | Blocker |
|---|---|
| **Backlink intelligence** (competitor's strongest pages) | Needs DataForSEO / Ahrefs / Moz key |
| **CMS title/meta editor** (write back to live site) | Needs Edstellar CMS API spec |
| **Pagespeed / Core Web Vitals** | CrUX public API works without a key for popular URLs; PSI API needs Google Cloud key (separate from GSC) |
| **Multi-user auth** | Pick NextAuth + Google SSO - decide if we need it |

### Workflow / collaboration - feature plan
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
- **Industry-vertical view** - performance segmented by industry tag.
- **Cluster view** in the corpus - k-means groups + one-click merge.
- **Slack/email digest** (depends on Workflow feature plan above).
- **Stale-content auto-refresh** - for any page in the stale list, generate a
  draft refresh outline via Claude/Groq.

---

## 6. Environment

`.env` keys - full annotated set is in [`.env.example`](.env.example). Vercel
gets the same values in **Settings → Environment Variables**. Summary:

```
# DB (REQUIRED)
DATABASE_URL=postgresql://...                # Neon pooled

# AI providers
AI_EMBED_PROVIDER=local                      # local | openai
AI_CHAT_PROVIDER=groq                        # groq | claude | openai
GROQ_API_KEY= GROQ_MODEL=llama-3.3-70b-versatile
GROQ_API_KEYS=                               # optional comma-separated key pool - rotates on 429 (Session 11)
GROQ_FALLBACK_MODEL=llama-3.1-8b-instant     # separate TPD bucket; tried when the primary 429s on every key. ""=off
ANTHROPIC_API_KEY= ANTHROPIC_MODEL=
OPENAI_API_KEY= OPENAI_CHAT_MODEL= OPENAI_EMBED_MODEL=

# GSC OAuth
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gsc/callback   # prod: https://<vercel-url>/api/gsc/callback
GSC_SITE_URL=https://www.edstellar.com/      # Session 4: resolveSiteUrl() now probes
                                             #   trailing-slash + sc-domain variants
                                             #   automatically, so any of these works:
                                             #   https://www.edstellar.com/  |  https://www.edstellar.com
                                             #   sc-domain:edstellar.com    |  sc-domain:www.edstellar.com

# Competitors
SERPER_API_KEY=

# App + ops (Session 4 - required in prod)
APP_BASE_URL=                                # https://<vercel-url> - used for absolute OG URLs,
                                             #   cron auth, OAuth redirect base
BRAND_TERMS=edstellar,edstellar.com          # comma-separated; used by GSC branded/non-branded split
CRON_SECRET=                                 # REQUIRED in prod - cron routes fail CLOSED (401) if
                                             #   unset, since the Session 6 fix (§10, item 1A below).
                                             #   Vercel cron sends Authorization: Bearer <secret>
WEBHOOK_API_KEY=                             # optional X-API-Key gate - 7 routes, see AGENTS.md auth table

# Conflict automation thresholds (Session 11 - all OPTIONAL, have sane defaults
#   in lib/thresholds.ts; override per-site without a code change)
CONFLICT_BODY_COSINE_MERGE=0.80              # body cosine ≥ ⇒ same-intent pair is a merge
CONFLICT_BODY_COSINE_CONSOLIDATE=0.55        # body cosine ≥ ⇒ consolidate
CONFLICT_TITLE_JACCARD_DUP=0.80              # near-duplicate title cutoff
CONFLICT_H1_JACCARD_DUP=0.80                 # near-duplicate H1 cutoff
CONFLICT_SLUG_OVERLAP_DUP=0.60               # near-duplicate URL cutoff
CONFLICT_NO_CONFLICT_FLOOR=0.50              # below this body cosine (no metadata match) = not a conflict
CONFLICT_GROUP_SIMILARITY=0.90               # /api/groups edge threshold (0.82 → one giant hairball)
CONFLICT_GROUP_TOPK=5                        # nearest neighbours probed per page in the grouping scan
CONFLICT_WINNER_INBOUND=0.45                 # winner weight: internal inbound-link authority
CONFLICT_WINNER_DEPTH=0.30                   # winner weight: content depth (tokens)
CONFLICT_WINNER_URLCLEAN=0.25                # winner weight: URL cleanliness
CONFLICT_WINNER_TRAFFIC=0                    # winner weight: GSC clicks (OFF by default)
```

---

## 7. Operational commands

Every script below runs against whatever `DATABASE_URL` is currently set to in
your `.env` - **there is no separate dev/prod flag**, so the WRITE column is the
thing to check before running anything against the shared Neon project (AGENTS.md
§Database). READ-only scripts are always safe to run against prod for exploration.

| Command | DB effect | What it does |
|---|---|---|
| `npm run dev` | - | localhost:3000 |
| `npm test` | - | runs all `lib/**/*.test.ts` via Node's built-in test runner (no jest/vitest - see `plans/01-conflict-automation.md`) |
| `npm run typecheck` | - | `tsc --noEmit` |
| `npm run build` | - | production build |
| `npm run db:setup` | **WRITE** (schema) | apply `drizzle/*.sql` in order (idempotent) |
| `npm run ingest` | **WRITE** (bulk) | crawl + embed every sitemap URL - `-- --limit=50` for a sample, `-- --force` to re-embed unchanged rows |
| `npm run backfill:tags` | **WRITE** | retag only - no re-fetch, no re-embed |
| `npm run catalog-conflicts` | **WRITE** (bulk replace) | one lateral-join query + one bulk insert → `catalog_conflicts` table (page itself is hidden from nav; script still works) |
| `npm run detect-redirects` | **WRITE** | probes every corpus URL for 3xx and marks redirected pages `is_stale` + `canonical_url` - `-- --only-null` to skip already-marked rows |
| `npm run audit:links` | **WRITE** | HEAD-checks every URL; updates `pages.http_status` |
| `npm run pregen-drafts` | **WRITE** (bulk) | local, $0 pre-generation of the AI Draft cache (`pregenerated_drafts` table) via a local CLI model - no server-side LLM cost |
| `npm run draft-worker` | **WRITE** | legacy local draft worker (Batch 11-14) - polls `/api/drafts` and writes results back |
| `tsx scripts/cleanup-junk-pages.ts` | **WRITE** (delete) | not npm-aliased - removes junk rows (tag archives etc.) from `pages` |
| `tsx scripts/reclassify-home.ts` | **WRITE** | not npm-aliased - one-off: home page → static content_type |
| `tsx scripts/verify-corpus.ts` | READ-only | post-ingest sanity report (counts + spot-check) |

`runConflictCheck` (the function behind `/api/check` and the Conflict Checker
page) also **persists to DB by default** (`opts.persist !== false`) - running it
from a REPL/script against prod silently writes `checks`/`check_matches` rows.

---

## 8. Conventions / things that bit us

- **Neon connection string must be the *pooled* one** (it has `-pooler` in the
  hostname). Direct connections work locally but throttle at scale.
- **GSC `siteUrl` format matters - but `resolveSiteUrl()` handles it** (Session 4).
  Set `GSC_SITE_URL` to any plausible variant; the helper probes
  trailing-slash + `sc-domain:` + www/no-www against `webmasters.sites.list()`
  and picks the first match the account is verified on. If nothing matches
  the error message lists exactly which properties ARE accessible.
- **Local embedder dim = 384.** Switching to OpenAI = 1536. That's a schema
  change (new column, drop old) - documented in §5. Don't mix dimensions in
  one column.
- **`AGENTS.md` says "this Next.js has breaking changes"** - read
  `node_modules/next/dist/docs/` before adding new framework features.
- **Never commit `.env`.** Top-level `.gitignore` covers `**/.env*`.
- **HNSW vector index** auto-builds; for ivfflat we'd have to `ANALYZE` after
  bulk insert. We chose HNSW.
- **Vercel native deps need `serverExternalPackages`** (Session 4).
  `@xenova/transformers` + `onnxruntime-node` ship a native `.so` that
  @vercel/nft doesn't trace through `dlopen`. Without the
  `serverExternalPackages` opt-out + `outputFileTracingIncludes` for
  `node_modules/onnxruntime-node/bin/**/*`, every `/api/check` call fails
  in prod with `cannot open shared object file`. See `next.config.ts`.
- **`process.cwd()` reads in `lib/sitemap.ts` / `lib/taxonomy.ts` /
  `lib/gsc-insights.ts`** rely on `data/**/*` being included via
  `outputFileTracingIncludes` (Vercel only ships statically-traced files).
- **`CRON_SECRET` fails OPEN if unset.** Cron routes check
  `if (secret && header !== ...)` - no secret means anyone can trigger
  `/api/cron/reingest` and rack up DB + LLM cost. Always set in prod.
- **Vercel cron plan limits.** Hobby = 2 crons, daily-only, 60s timeout.
  Current `vercel.json` has 3 crons (two weekly) - needs Pro.

---

## 9. Improvement backlog (post-launch audit, 2026-06-25)

Captured for review - **nothing here is implemented yet**. Picked from a
three-lens audit (code quality, UX, SEO/marketing/content) plus 2026
reference research. Severity flags: 🔥 do-first · ⚙️ strategic · ✨ polish.

### 9A. Code quality + security

| # | Item | File / area | Sev |
|---|---|---|---|
| 1 | `/api/check` + `/api/check/bulk` auth is optional - anyone with the prod URL can burn LLM tokens. Require `WEBHOOK_API_KEY` OR add IP rate-limit. | `app/api/check/{route,bulk/route}.ts` | 🔥 |
| 2 | Audit-links cron does 1,500 sequential `UPDATE`s in a loop. Batch into one `UPDATE … WHERE id = ANY($1)`. | `app/api/cron/audit-links/route.ts` | 🔥 |
| 3 | GSC refresh tokens stored plaintext in `gsc_connections`. Use `pgcrypto.pgp_sym_encrypt` with a key from env. | `lib/gsc.ts:35-46` + migration | 🔥 |
| 4 | Zod is in `package.json` but `grep z\\.parse` returns 0 hits. One `safeParse` per route entry kills ~80% of mystery 500s. | every `route.ts` accepting a body | 🔥 |
| 5 | `as any` casts on `db.execute` returns hide schema-drift bugs. Use the Drizzle-typed return shape or explicit interfaces. | `lib/conflict.ts:184`, `lib/search.ts:41`, `app/api/pages/route.ts:67-71` | ⚙️ |
| 6 | LLM JSON output not validated. If a future model hallucinates an extra field or omits `conflictScore`, code NaNs silently. | `lib/ai/chat-claude.ts`, `chat-groq.ts`, `chat-openai.ts` | ⚙️ |
| 7 | No structured logs, no Sentry. `catch { /* swallow */ }` pattern in many routes - failures invisible until a user complains. | repo-wide | ⚙️ |
| 8 | Missing DB indexes on filter columns (`pages.content_type`, `course_type`, `category`). Vector index already exists. | new migration | ⚙️ |
| 9 | `/api/pages` runs 5 queries per request (rows, totalRows, byType, byCourseType, topCategories) without a CTE. Fold into a single roundtrip. | `app/api/pages/route.ts` | ⚙️ |
| 10 | Cron loops return 200 even when partial failures occur. Either return 5xx on >5% fail rate or post to an external sink. | `app/api/cron/*/route.ts` | ⚙️ |
| 11 | `console.log` debris in production paths. Either gate on `process.env.DEBUG` or drop. | `lib/conflict.ts:159`, `app/api/gsc/callback/route.ts:19`, `scripts/*` | ✨ |
| 12 | `checks.created_by` column exists but no auth → always null. Either wire NextAuth + populate, or document as TODO. | `lib/db/schema.ts` | ✨ |

### 9B. UX rough edges

| # | Item | File / area | Sev |
|---|---|---|---|
| 13 | Bulk-Check shows no per-row progress while a 50-URL run takes minutes. Stream results as they complete. | `app/(dashboard)/bulk-check/page.tsx:127-132` | 🔥 |
| 14 | Page detail modal in /search-console doesn't close on Esc. 3-line `useEffect` fix. | `app/(dashboard)/search-console/page.tsx:843` | 🔥 |
| 15 | Long calls (enrich, suggestions) have no "still working…" message after 5s - looks frozen. | `/conflict-checker` page L141-184 | 🔥 |
| 16 | Pagination doesn't reset to page 1 when a filter shrinks the total → user sees blank tables. | most paginated views | 🔥 |
| 17 | Empty-state copy says "run `npm run ingest`" - marketing user has no terminal. Rephrase to "Ask your admin to refresh the corpus" + Slack-link. | `/audit`, `/corpus`, `/history`, `/catalog-conflicts` empty states | ⚙️ |
| 18 | "Conflict score" vs "similarity" used interchangeably in the same view - undermines trust in the metric. | `/conflict-checker` form labels + match cards | ⚙️ |
| 19 | Sidebar fixed 240px - dashboard squashes on tablet portrait / narrow Brave windows. | `app/components/Sidebar.tsx` + dashboard layout | ⚙️ |
| 20 | Catalog Conflicts page doesn't tell users it's a precomputed snapshot. Add a "last run: 3h ago" badge + "rerun" button (admin-only). | `/catalog-conflicts` header | ⚙️ |
| 21 | "Find link targets" button label is opaque. Rename → "Suggest pages to link to". | `/internal-links` page L78 | ✨ |
| 22 | CSV download buttons have no disabled-while-generating state. Click twice → two downloads. | bulk-check + search-console export | ✨ |
| 23 | Audit Health Score severity chips wrap and lose the active state on narrow viewports. | `/audit` Health tab L246-257 | ✨ |
| 24 | GSC lookup form doesn't validate `https://` prefix client-side; users hit "invalid input" from the API. | `/search-console` lookup form | ✨ |

### 9C. SEO / Marketing / Content gaps

This is where the tool stops being "yet another similarity scorer" and
becomes opinionated.

**SEO - what an SEO would expect that we don't have:**

| # | Item | Why it matters |
|---|---|---|
| 25 | **Owner-URL per topic** - let an SEO mark "/courses/aws-saa is the canonical page for `aws saa certification`". The checker then says "your new blog overlaps the OWNER - merge or redirect" instead of "73% similarity". | This is the single biggest gap vs TrueRanker / SEO AI. Editorial decisions encoded in the data, not in the editor's head. |
| 26 | **Business-impact severity** - weight conflict score by current GSC clicks/impressions on the existing page (already in `gsc_metrics`). A 70% conflict with a 12k-clicks/mo page should outrank a 90% conflict with a dead page. | Currently a 0–100 conflict score with no context. Reference tools (Unclash AI, Incremys) all do business-weighted prioritisation. |
| 27 | **CTR opportunity column on /search-console** - pages with high impressions + low CTR are title-rewrite candidates, not duplicates. Show position 4-10 + CTR below site-median as a separate tab. | We have the data but the metric isn't surfaced. |
| 28 | **Stale-content detector** - pages with declining clicks over a sliding window + `lastmod` > 12 mo old. Refresh-or-prune queue. | Mentioned in §5 roadmap but never built; the data is in `gsc_daily_totals` + `pages.lastmod`. |
| 29 | **Cannibalization confirmed by GSC** - pgvector says two pages are similar; GSC tells us if Google actually swaps them in the SERP for the same query. Join `check_matches` to `gsc_metrics` on common query, flag the ones where rank position oscillates. | Vector similarity is a *signal*; SERP behaviour is the *symptom*. Surfacing both kills false positives. |
| 30 | **Sitemap-drift report** - diff `data/sitemap-urls.csv` against a fresh fetch of the live sitemap to surface pages published but not ingested, or removed but still in corpus. | Today the corpus drifts silently between weekly cron runs. |
| 31 | **No SERP-feature awareness** - Serper returns People Also Ask, Featured Snippet, AI Overview blocks. We only read `organic`. Should surface "your topic targets a question - write FAQ schema" etc. | `lib/competitors-extra.ts` already parses AI Overview; PAA + FS just need wiring. |
| 32 | **Canonical-tag check** in extractor - record `<link rel="canonical">` per page and warn when two pages claim conflicting canonicals. | Cheap to add (one cheerio selector) and a real SEO sanity check. |

**Marketing - workflow gaps:**

| # | Item | Why |
|---|---|---|
| 33 | **No user concept → no assignment, no approval, no audit trail.** A check is run by "whoever opened the URL". Add NextAuth + Google SSO @edstellar.com (already sketched in §5.workflow). | Without this, the tool can't ever be a publish gate - there's no one to gate the publish against. |
| 34 | **No CMS integration / publish gate.** `/api/check` exists as a webhook but no Edstellar CMS hook calls it. Either a Webflow webhook or a Zapier action. | Today the tool is *advisory*. To matter, a publish in the CMS should be conditional on a passing check. |
| 35 | **No writer brief export.** The "Net-new content suggestions" panel shows 6 angles in the UI but you can't copy/paste them into a Notion brief. Add a one-click "Export as brief (Markdown)". | Marketers ship in writer briefs, not in JSON. |
| 36 | **No "shipped vs blocked" reporting** - leadership wants to see "we caught 27 duplicates this quarter, blocked 12 publishes, refreshed 8 stale pages." | Without this the team can't defend the tool's existence at review time. |
| 37 | **No editorial calendar integration** (Notion / Airtable / ClickUp). Today a check result lives in the DB; the calendar doesn't know. Two-way sync would let the calendar show conflict status next to each draft. | Closes the loop with where marketers actually plan. |

**Content - quality + production gaps:**

| # | Item | Why |
|---|---|---|
| 38 | **No content-brief generator output.** The angles panel is a starting point; a brief needs target keyword, H2 skeleton, recommended word count, internal-link targets, schema suggestion. All derivable from data we have. | Saves the writer a 30-min prep step on every brief. |
| 39 | **No FAQ / PAA extraction** from Serper → reuse in the writer brief. | Free signal we ignore. |
| 40 | **No content-shape comparison** (target word count, H2 count, schema types) vs top-3 SERP pages. | Editors guess; tool should measure. |
| 41 | **No alt-text / image-SEO check** in the extractor. Easy add - count `<img>` without `alt`, list them. | Quick SEO win on the audit page. |
| 42 | **No content-type recommendation.** "This topic is searched mostly by buyers" → recommend a course landing; "by learners" → blog. Use Serper's SERP-feature mix as a signal (lots of /course/ in SERP = transactional). | Removes a frequent editorial debate. |
| 43 | **No topic-cluster health view.** We know each course's `type`/`category`/`subcategory` (1,698/6/43/166). Surface "this cluster has 22 courses but only 4 blogs - content-debt here." | Direct from `data/taxonomy/course-types.json` - no new data needed. |
| 44 | **No internal-link insertion suggestions** at paragraph level. `/internal-links` recommends pages; doesn't say *where in the draft* to put the anchor. | Roadmap Batch 5 sketched this; never built. |

### 9D. Reference points from 2026 research

What the audit confirmed we **got right** (kept here so we don't second-guess
in future sessions):

- **Pre-publish semantic similarity is the current state of the art** - every
  2026 reference (TopicalMap, Incremys, TrueRanker, Unclash AI) uses the same
  approach. Our `/conflict-checker` is conceptually aligned with the field.
- **HNSW + cosine on normalised embeddings** is the right pgvector pattern for
  text. `bge-small-en-v1.5` normalises in the embed call. Default `m=16`
  works at our 2,461-vector scale - Neon keeps the index resident in shared
  buffers; HNSW vs IVFFlat is irrelevant at this size.
- **Multi-signal triangulation** (GSC + crawl + rank) is what the field
  recommends. We have GSC + crawl; Serper covers occasional rank checks.
  Full rank tracking (DataForSEO / Ahrefs) is the third pillar - optional
  per §5 Tier C.
- **Editorial rules > raw scores** is the 2026 differentiator
  (update-before-create, owner-page assignment). Items 25 + 33 + 34 are how
  we'd close that gap.

### 9E. Future upgrades - deferred until a paid key is added

These items need a paid service the team hasn't signed up for. They're
not blocked technically - only blocked on a procurement decision.

| # | Item | Service needed | Approx cost | Notes |
|---|---|---|---|---|
| §5C-a | Backlink intelligence | DataForSEO / Ahrefs / Moz | $50–$200/mo+ | Adds the "third pillar" referenced in 9D - rank tracking. |
| 8 (prior list) | OpenAI embeddings switch | OpenAI | ~$1-2 one-off, then ~$0.02/1M tok | Kills the 8–15s `bge-small` cold-start. Current local embedder works at our scale. |
| #29 + #31 + #40 + #42 at scale | Serper Pro | $50/mo (50k searches) | Free tier (2,500/mo) covers light use; Pro unlocks heavy SERP-feature audits. |
| §5C-b | CMS title/meta editor (write-back) | Edstellar CMS API + a key for whatever CMS they use | Variable | Replaces the manual-copy workflow today. |
| §5C-c | Pagespeed / CWV at scale | Google Cloud Pagespeed Insights API key | Free up to 25k/day after Cloud project setup | CrUX public works keyless for popular URLs. |

When any of these are funded, lift the relevant items from 9E + their
referenced backlog rows up into a new session-log entry and ship.

### Sources (web research, 2026-06-25)

- TopicalMap.ai - [Best Keyword Cannibalization Checker Tools 2026](https://topicalmap.ai/blog/auto/keyword-cannibalization-checker-tools-2026)
- Incremys - [2026 Guide: How to Spot SEO Cannibalization](https://www.incremys.com/en/resources/blog/seo-cannibalization)
- Epic Slope Partners - [Unclash AI - 5 Best Keyword Cannibalization Tools in 2026](https://www.epicslope.partners/unclash-ai/keyword-cannibalization-tools)
- TrueRanker - [How to Fix SEO Cannibalization 2026](https://trueranker.com/blog/how-to-detect-fix-seo-cannibalization/)
- Neon - [Understanding vector search and HNSW with pgvector](https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector)
- DBI Services - [pgvector for DBA Part 2 - Indexes (March 2026 update)](https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/)
- AWS - [Optimize generative AI applications with pgvector indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)

---

## 10. Session 6 - Full Project Audit (2026-06-25)

Five-phase audit run as four parallel specialist agents (security, code/logic,
UI/UX, SEO methodology + marketing), then synthesised here. Findings are
grouped by severity and tagged with the originating phase. Every item lists
file:line, root cause, impact, and fix.

**Method:** read-only audit, no code touched. Whole-codebase context loaded
via repomix snapshot (`.agentmaster/codebase.xml`). Phased-sequential output;
parallel execution under the hood for speed.

**Headline counts:** 8 ship-stoppers (🚨), 15 high-priority (🟠), ~25 medium,
~10 polish. Marketing/productization angle scoped separately in §10F.

### 10A. 🚨 Ship-stoppers - fix before next production deploy

These are exploitable today (security), incorrect by design (logic), or
make the app crash for users (UX). All small, none architectural.

| # | Phase | File(s) | Problem | Fix |
|---|-------|---------|---------|-----|
| S1 | sec | `app/api/cron/reingest/route.ts:22-25`, `app/api/cron/audit-links/route.ts:40-43`, `app/api/cron/gsc-snapshot/route.ts:24-27` | **Cron routes fail OPEN when `CRON_SECRET` is unset.** `if (secret && header !== ...)` short-circuits when env var is missing/empty in prod (rotation, redeploy, typo). `proxy.ts` already bypasses auth for `/api/cron/*`. Anyone hitting `GET /api/cron/reingest` triggers a 300s function that crawls sitemap, burns LLM tokens, writes Postgres. `audit-links` HEAD-fans the entire `pages` table. Trivial DoS + cost-burn. `.env.example` even ships the warning. | Hard-require the secret: `if (!secret \|\| header !== \`Bearer ${secret}\`) return 401`. |
| S2 | sec | `app/api/gsc/callback/route.ts:8-23` | **GSC OAuth callback has no `state` parameter, no PKCE, no CSRF token, no session binding.** Anyone who gets a victim to visit `/api/gsc/callback?code=<attacker-code>` causes the server to swap the attacker's auth code and persist attacker tokens via `saveTokens`, replacing the org's GSC connection. **Connection hijack.** | Generate `state` at `/api/gsc/authorize`, store in signed cookie or DB; verify byte-for-byte in callback. Confirm no public endpoint exposes raw tokens. |
| S3 | sec | `app/api/summarize/route.ts` + `lib/extract.ts:143-165` (`fetchAndExtract`) | **Unauth'd LLM endpoint + SSRF.** `/api/summarize` is not in `PUBLIC_PREFIXES`, so it's auth-gated *only when `AUTH_ENABLED=true`* - but the env-example default is `false`. `fetchAndExtract` accepts any user URL with `redirect: "follow"`, no host allow-list, no IP block-list. From a Vercel function, attacker can probe cloud-metadata (`169.254.169.254`), private hosts, or unauthenticated internal services that trust egress IPs - and exfil contents via the returned summary. | (a) Gate `/api/summarize` and `/api/rewrite-suggestion` behind `WEBHOOK_API_KEY` or auth + rate-limit. (b) In `fetchAndExtract`: resolve hostname, reject RFC1918/loopback/link-local; `redirect: "manual"`, re-validate each hop. Consider allow-list (edstellar.com + competitor list). |
| S4 | sec | `lib/rate-limit.ts:48-86` | **Rate-limit fails open on DB error.** If `DATABASE_URL` is missing or the upsert throws, `consume()` returns `{ok:true}`. Comment justifies it ("never block real users…") but it means an attacker who can induce a DB hiccup (or just hit Neon while cold-paused) gets unlimited requests against `/api/check`. Defeats the only protection on the LLM endpoint when `WEBHOOK_API_KEY` is unset. | Fail closed in prod (`NODE_ENV === "production"`); fail open only in dev. Add a fixed in-memory token-bucket fallback so a Neon cold-pause doesn't open the floodgates. |
| S5 | logic | `proxy.ts:22-37` | **`PUBLIC_PREFIXES` overmatches.** `pathname.startsWith("/api/auth")` also matches `/api/authentication-overview` (and any look-alike). Same risk on `/api/check` matching `/api/checkx`. Future routes silently become public. | Anchor every prefix with a trailing `/` (`/api/auth/`) and add an exact-match case for the bare prefix where applicable. Or use a structured allow-list with `===` checks. |
| S6 | seo | `app/api/rewrite-suggestion/route.ts:38` | **Rewrite suggestion is broken by design.** Calls `chat.summarize({content: prompt, isTopic: true})` to get a JSON rewrite plan. `summarize` is trained/prompted for a `SummaryResult` shape (summary + keywords + searchSynopsis), not `{diagnosis, angles, decision}`. Most providers return the rewrite JSON stuffed inside `summary` or `searchSynopsis`. `JSON.parse(searchSynopsis)` succeeds maybe ~10% of the time; rest fall through to `{raw: r.summary}`. The feature is effectively a coin-flip. | Add a dedicated `chat.proposeRewrite()` on the `ChatProvider` interface with structured-output schema (Anthropic tools / OpenAI JSON-mode / Groq function-calling). Use `chat.generate({system, prompt})` already at `chat-base.ts:76` as the substrate. |
| S7 | ux | `app/(dashboard)/` (no `loading.tsx` / `error.tsx`) | **Zero route-segment loaders or error boundaries.** A failed `db.execute` on `/` crashes the whole dashboard with the default Next error page. Server-rendered pages (`/`) have no skeleton - first paint waits for 11 SQL queries serially. | Add `app/(dashboard)/loading.tsx` (skeleton: header + stat grid), `app/(dashboard)/error.tsx` (retry CTA). Wrap each dashboard SQL block in `<Suspense fallback={<Skeleton/>}>`. |
| S8 | ux/a11y | global (every input/button across `app/(dashboard)/**`) | **Inputs/buttons have no visible focus rings.** Every text input uses `outline-none focus:border-slate-900` - ~1px border-color shift fails WCAG 2.4.7 (focus visible). Buttons have no `focus-visible:ring`. Keyboard users can't tell where they are. Examples: `conflict-checker/page.tsx:253`, `competitors/page.tsx:63`, bulk-check, audit. | Add to a global Tailwind preset: `focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1` on buttons; replace `outline-none focus:border-slate-900` with `focus:ring-2 focus:ring-slate-900/40` on inputs. |

### 10B. 🟠 High priority - within 2 weeks

| # | Phase | File:line | Problem | Fix |
|---|-------|-----------|---------|-----|
| H1 | sec | `next.config.ts` | **No security headers.** Missing CSP, X-Frame-Options, HSTS, Referrer-Policy, X-Content-Type-Options, Permissions-Policy. Dashboard is clickjackable; any future XSS has no CSP backstop. | Add `async headers()` block: at minimum `default-src 'self'`, `frame-ancestors 'none'`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| H2 | sec | `proxy.ts:41,50` | **`STATIC_ASSET_RE = /\.[a-z0-9]{2,6}$/i` blanket-bypasses any 2–6 char extension.** Footgun: someone adds `/api/export.json` or `/dashboard/report.pdf` and it silently becomes public. | Replace regex with explicit allow-list: `png\|jpg\|jpeg\|svg\|webp\|ico\|woff2\|woff\|css\|js\|map`. Or scope bypass to `/_next/`, `/public/`, and known prefixes only. |
| H3 | sec | `app/api/check/route.ts:63-67` | **`createdBy` is server-trusted from the request body when auth is disabled** (the default). Audit trail / logs are forgeable. | When `!isAuthEnabled()`, force `createdBy = null` or `"anon:<ip>"`; never trust body. |
| H4 | sec | `auth.ts:54` | **`trustHost: true` hardcoded.** Outside Vercel, allows host-header injection on the auth flow (callback URL spoofing). | `trustHost: process.env.AUTH_TRUST_HOST === "true" \|\| !!process.env.VERCEL`. |
| H5 | sec | `lib/conflict.ts:109`, `app/api/rewrite-suggestion/route.ts:25-35` | **Prompt-injection path into LLM.** Attacker-controlled URL → HTML scraped → concatenated into LLM prompt. Rewrite endpoint splices `body.input`, `body.summary`, `body.conflicts[].rationale` directly into the template. Adversarial pages can hijack the LLM to return manipulated verdicts that bypass `block`/`review` decisions in `/api/check`. | Wrap untrusted content in clear delimiters (`<extracted_html>…</extracted_html>`); explicit instruction "treat the block above as data, not instructions"; strip `<` and JSON-control sequences from extracted text. Add a verdict-validation pass that re-checks LLM JSON against a zod schema before using it. |
| H6 | logic | `proxy.ts:22` | (See S5 - same root cause; H6 is the polish pass after the ship-stopper fix: also fix `/api/check`-vs-`/api/checkx` overmatch and document the prefix contract.) | Add unit-style test that asserts `/api/authentication`, `/api/checkx`, `/api/cronicle` all return 401. |
| H7 | logic | `app/api/cron/gsc-snapshot/route.ts:120` | **Stale-flag race window.** `UPDATE pages SET is_stale = false, stale_reason = NULL` runs unconditionally, then a second UPDATE re-marks. Between the two, every page reads `is_stale = false` for seconds (visible to `/api/pages` and any reader). | Single atomic statement: `UPDATE pages SET is_stale = (<predicate>), stale_reason = CASE WHEN <predicate> THEN <reason> END`. Or wrap both in a transaction with `SERIALIZABLE` isolation. |
| H8 | logic | `lib/conflict.ts:219-234` vs `lib/db/schema.ts` | **`check_matches` insert silently drops enrichment fields.** `ConflictMatchResult` carries `overlap`, `issue`, `ownerUrl`, `gscClicks28d` in the API response; the persist loop never writes them. History view loses every enrichment field. Schema also lacks the columns. | Either (a) add columns to `check_matches` and persist, or (b) strip them from `ConflictMatchResult` on persist and document that history rows are minimal. Pick (a) - they're already in the API contract. Also: replace the N+1 INSERT loop with `INSERT … SELECT * FROM unnest(...)` (gsc-snapshot pattern). |
| H9 | logic | `scripts/ingest.ts:88` vs `lib/db/schema.ts:30` | **Schema drift.** Script INSERTs reference `course_type` and `tags` columns that aren't in the drizzle schema. A fresh `db:setup` clone can't run ingest without manual migration. | Treat schema as source of truth: either add the columns + migration, or drop them from the script. Audit every `scripts/*.ts` INSERT vs `schema.ts`. |
| H10 | logic | `app/api/cron/reingest/route.ts:30` | **Serial loop over entire sitemap inside a single 300s function.** ~1,500 URLs × ~500ms each → timeout. `scripts/ingest.ts` already has a worker pool; `audit-links` uses `PROBE_CONCURRENCY=10`. Cron version doesn't. | Extract `lib/ingest-page.ts` (shared by script + cron). Mirror the `audit-links` concurrent worker pool with `PROBE_CONCURRENCY=10`. Add per-URL error logging (currently `catch { failed++ }` swallows everything). |
| H11 | seo | `lib/conflict.ts:104` | **`minSimilarity: 0.30` leaks into the noise band.** `lib/score.ts:9` documents 0.55 as the noise floor. A 0.32-similarity match still surfaces as a ~36-point "partial-overlap" once the LLM adds its 60%. Contradicts the project's own scoring doc. | Raise floor to **0.45–0.50**. Verify against catalog-conflicts precompute output that ~30% of historical "partial-overlap" matches are not lost. |
| H12 | seo | `lib/competitors-extra.ts:77,93,96` | **Substring regression bug.** Uses `domainOf(o.link).includes("edstellar")` - the *exact* bug fixed (with comment) at `lib/competitors.ts:67`. Mis-flags `edstellar-comparison.example.com` and any URL containing the substring as Edstellar's own. | `import { isEdstellarDomain } from "./competitors"` and replace every `.includes("edstellar")`. Add a unit test guarding against this regression. |
| H13 | seo | `lib/competitors.ts:110` | **Hardcoded SERP-query suffix wrecks already-specific topics.** Always appends `" corporate training"`. For `topic = "leadership coaching for managers"` → query becomes `"leadership coaching for managers corporate training"`. Word-soup; SERP relevance collapses. | Append only when topic lacks training-related terms. Cheap keyword guard: `if (!/training\|course\|coaching\|workshop\|certification/i.test(topic)) topic += " corporate training"`. |
| H14 | ux | `app/(dashboard)/conflict-checker/page.tsx:946` | **`alert()` for success.** Jarring, modal, blocks the page. | Replace with toast (sonner ~4 KB) or in-page inline confirmation chip. Also handle `navigator.clipboard.writeText` rejection (HTTPS-required / permissions) - current `.then(alert)` swallows the error. |
| H15 | ux | `competitors/page.tsx:9-11`, `audit/page.tsx:11` | **Tabs don't sync to URL.** Reload or shared link drops you back on the first tab. Also: tabs are `<button>` not `role="tablist"` - no arrow-key nav, no `aria-selected`. | `useSearchParams` + `router.replace(\`?tab=${id}\`)`. Convert wrapper to `role="tablist"`; each tab `role="tab"` + `aria-selected`; keyboard arrow-key handler. |
| H16 | ux | `app/components/ui.tsx:41-47` (`ConflictBadge`), 90-111 (`ScoreBar`) | **Color-only status.** Colorblind users can't distinguish `duplicate` (red) / `cannibalization` (orange) / `partial-overlap` (amber). | Prepend a glyph or lucide icon per type. Same treatment on `ScoreBar` (texture/pattern or numeric label). |
| H17 | ux | `app/components/Sidebar.tsx:54` + `app/components/ui.tsx:13` (`PageHeader`) | **Burger overlaps `PageHeader` H1 on ≤375px.** Fixed `left-3 top-3` burger floats over the start of the title at iPhone SE width. `z-40` burger vs `z-50` sidebar: tap targets next to the burger are blocked when closed. | Move burger inside `PageHeader` flex row (left slot). Hide burger entirely when drawer is open. |
| H18 | ux/a11y | `app/components/HelpButton.tsx:55`, mobile Sidebar drawer | **Dialogs lack `aria-modal` + focus trap.** Esc closes but Tab leaks to page behind. | Add `aria-modal="true"`; trap focus to the dialog (small util or `focus-trap-react`). Return focus to the trigger on close. |

### 10C. 🟡 Medium - cleanup / next sprint

**Code / logic**

- `lib/score.ts:22-24` - **LLM-dominant blend** `0.4*base + 0.6*llm`. LLMs hallucinate intent confidently; embeddings are the empirical anchor. `docs/conflict-types.md:14` even argues for measurable-signal-heavy. Move to **`0.5/0.5` or `0.6/0.4` (base-heavy)** and re-validate the catalog-conflicts output.
- `lib/conflict.ts:62-67` - **`impactWeighted` owner-bonus inversion.** Comment line 65 says "cannibalizing the editorial winner is the worst outcome," implying bonus applies when the *match* is NOT the owner (orphan duplicates). Code applies bonus when match IS the owner. **Verify intent with team** - either comment is wrong or logic is wrong. Also: `clicks=100 → 0.502` boost, not the 0.25 the comment claims; doc the real scale.
- `lib/competitors-extra.ts:159-208` - **`competitorFreshness` trusts sitemap `<lastmod>`.** WordPress/HubSpot auto-update `lastmod` on every rebuild. `recent90d` reads 90%+ for any active site (meaningless signal). Sample N URLs and parse on-page `article:modified_time` / `<time>`, or compare to Wayback diff.
- `app/api/internal-links/route.ts:49-57` - **Internal-link suggester is just cosine-nearest + page title as anchor.** Misses (1) anchor-text diversity (reuses same title across drafts), (2) inverse-current-inlink weighting (link-equity flow), (3) intent-stage affinity (TOFU→BOFU is more valuable than blog→blog), (4) reciprocal/orphan asymmetry checks. Weight by `similarity × 1/(inlinks+1) × content-type-affinity`; generate 2–3 anchor variants from H1+title+meta.
- **Wire SERP features into rewrite prompt.** `serp-overlap` already fetches AI Overview, PAA, answer-box - but `/api/rewrite-suggestion` doesn't see them. Rewrite LLM has no idea what featured-snippet shape the SERP rewards.
- `lib/conflict.ts:219-234` - **N+1 INSERT in `check_matches`.** Use `INSERT … SELECT * FROM unnest(...)` (mirror `gsc-snapshot`).
- `lib/ai/embed-local.ts:23-33` - **Sequential `for…of` loop over texts.** `pipe(texts, …)` supports batching. Sequential = N× slowdown on ingest.
- `lib/ai/embed-openai.ts:11` - **No retry on 429/5xx, no chunking past 2048 inputs** (OpenAI limit). Bulk ingest will crash.
- `app/api/check/route.ts:65` - `await auth().catch(() => null)` silently eats token-validation errors. Log them; falling back to spoofable body value is worse than failing loud.
- `app/api/rewrite-suggestion/route.ts:38` - (see S6) wrong abstraction reach.
- `lib/rate-limit.ts:56` - string-concat of `windowSec` into `'60 seconds'::interval` works only because `String(opts.windowSec)` is always called. Use `make_interval(secs => $3::int)` for type safety.
- `lib/db/index.ts:16` - **Placeholder DSN `neon("postgresql://user:password@localhost/db")` lets import-time succeed**, every query fails opaquely. Export `getDb()` lazy factory; throw one clean error on missing env.
- `scripts/cluster.ts:43` - **Loads every embedding into Node memory.** 50k pages × 384 floats × 8 bytes ≈ 150MB. At 200k+ will OOM. Add LIMIT/OFFSET pagination or sample.
- `scripts/cluster.ts:55,95` - Non-deterministic k-means seed (no `--seed`); `TRUNCATE clusters` outside a transaction means mid-run failure = empty table.
- `auth.ts:42-43` - `clientId: process.env.GOOGLE_CLIENT_ID` typed as `string | undefined` but Google provider needs `string`. Runtime crash if env unset and `AUTH_ENABLED=true`. Add explicit guard.
- `proxy.ts:54` - `req.auth` is JWT-from-cookie; **no CSRF check on POST routes once authed.** POST `/api/check/outcome` from a cross-origin authed session can mutate. Add origin check or rely on NextAuth's CSRF token cookie.
- **`lib/ai/chat-claude.ts:7` - verify `claude-sonnet-4-6` model id.** This codebase was updated post-cutoff; if the id is wrong every Claude call 404s. (Per the `claude-api` skill: always verify against current Anthropic model list.)
- **PROJECTLOG / proxy comment drift** - proxy header says `/api/check + /api/check/bulk` "stay open" / "protected by `WEBHOOK_API_KEY` when set"; reality is they're ALSO rate-limited when key unset. Update comment + this PROJECTLOG.

**UI / UX**

- **3 parallel button styles** across pages: primary `bg-slate-900 px-5 py-2.5 text-sm` (conflict-checker:256) vs `px-4 py-1.5` (bulk-check:168, conflict-checker:517) vs `px-4 py-2.5` (signin:65). Tokenize a `<Button variant="primary|secondary|ghost" size="sm|md">` in `ui.tsx`.
- **Two `Stat` components.** `(dashboard)/page.tsx:116` (big, hint/accent/href) vs `competitors/page.tsx:264` (small, no link). Unify.
- **Score-band thresholds duplicated 3×.** `ui.tsx:93-100` (ScoreBar), `(dashboard)/page.tsx:164-175` (`scoreColor`/`scoreType`), `conflict-checker/page.tsx:643-652` (MatchCard inline). Same 80/60/35. Extract `lib/score-bands.ts`; consume everywhere.
- **`TYPE_COLORS` token vs ad-hoc Tailwind elsewhere.** `ui.tsx:63` is the "source of truth" - but conflict-checker:297 (indigo for primary query), :391 (orange for catalog pair_type), :408 (amber border) reinvent chips. Use the token everywhere.
- **`PageHeader` is single-line only**; dashboard adds `space-y-10 p-8` so header pad + page pad double up on mobile. Add responsive `sm:px-4` to the header.
- **Heading hierarchy jump xl → sm.** Dashboard `<h1>` is `text-xl`, sub-section `<h2>` is `text-sm`. Sections feel like footnotes. Use `text-base font-semibold` for section h2s; reserve uppercase-tracking for h3 dividers.
- **Recent-checks list crams chip + URL + badge + score + relative time on one row.** Truncates to ~30 chars at 1280px. Move time to hover title, or stack on mobile.
- **AI Overview citation list** (`conflict-checker:380-393`) uses `<ol>` + manual `{i+1}.` - pick one mechanism.
- **Sidebar active uses `pathname.startsWith(href)`** (`Sidebar.tsx:104`). False-positive vector when a future route shares a prefix. Use `pathname === href || pathname.startsWith(href + "/")`.
- **Inconsistent empty-state voice** across Audit/Links, Catalog conflicts, Audit/Canonical (some emoji-cheerful, some long sentences, some terse). Pick a register: **terse + actionable**.
- **Mobile drawer never tested ≤320px.** Sidebar fixed w-60 (240px). Close button mis-aligned at iPhone SE width because `px-5 py-5` header eats space.
- **Filter row in conflict-checker is 9 controls in one `flex flex-wrap`.** On mid-width it stair-steps. Group into labeled fieldsets: `[Type pills]` / `[Threshold slider + checkbox]` / `[Sort + count]`.
- **Bulk-check disables CSV mid-run with cryptic label.** "Wait for run to finish…" - users can absolutely download partials. Label "Download partial (N rows)" or drop the disable.
- **`<input type=range>`** sliders lack `aria-valuetext`. Friendlier: `aria-valuetext="80 percent minimum conflict score"`.
- **Inline-validation gaps.** Pasting `edstellar.com` (no scheme) hits the API and fails generically. Client-side detect topic-vs-URL and surface inferred type as a chip before submit.

**Polish**

- Drop `<meta name="keywords">` from `app/layout.tsx:38` (Google ignored since 2009).
- `lib/extract.ts:225` `estimateTokens` (cost-awareness column) is **never read anywhere** - dead weight on every row.
- Inline doc rot: `lib/conflict.ts:165` comment references "#26" - issue tracker not present in repo.
- Pervasive `any[]` + `(rows as any).rows ?? rows` across route handlers. Define `type NeonRows<T> = T[] & { rows?: T[] }` once.
- `lib/ai/chat-openai.ts:31` `throw new Error(\`OpenAI chat failed: ${res.status}\`)` discards body. Include truncated `await res.text()` for debugging.
- Track stable `next-auth v5` release; currently `^5.0.0-beta.31` in prod.
- No evidence `npm audit` runs in CI. Add to PR template / GH Actions.
- `app/api/opengraph-image` + `/api/icon` public per Next file-conventions; add per-IP cache headers to prevent DoS via repeated generation.

### 10D. 🟢 App's own discoverability - mostly correct

(For completeness - internal tool, but verify before any external launch.)

| | Status | Note |
|---|---|---|
| `app/robots.ts:9` `Disallow: /` | ✅ | Correct for internal tool. |
| `app/layout.tsx:41` `robots:{ index:false }` | ✅ | Belt-and-braces with robots.ts. |
| `app/layout.tsx:19-56` metadata, OG, Twitter | ✅ | `%s · Edstellar Conflict Checker` template; real OG image generator. |
| `app/sitemap.ts` | ⚠️ Absent | Correct for internal tool. README ambiguity: `lib/sitemap.ts` is the corpus-ingest sitemap, not an Next-emitted one. Rename or note in README. |
| `<meta keywords>` | ⚠️ Cargo-cult | Ignored since 2009. Drop. |

### 10E. 🚀 Marketing / productization (strategic)

The product sits in a **genuinely under-served niche**: pre-publish
cannibalization detection against your own corpus + live GSC data. None
of the named market leaders do this well at the pre-publish stage.

| Competitor | Strength | Gap this tool exploits |
|---|---|---|
| **Clearscope / Surfer** | Real-time keyword grading | No corpus-internal duplicate check |
| **MarketMuse** | Topical authority modeling | No live GSC integration; expensive |
| **SEMrush Content tools** | Audit + ideation | Cannibalization detection buried, not pre-publish |
| **AlsoAsked** | PAA mining only | Single-purpose |

**If Edstellar wants to externalise this:**

1. **Rename "Conflict Checker"** - `docs/conflict-types.md:25` admits it's ambiguous. Candidates: **"Cannibalization Guard"**, **"Pre-Publish SEO Check"**, **"Content Overlap Scanner"**. Internal: keep current name.
2. **Multi-tenant data model.** Currently single `pages` table. Needs per-tenant schema or row-level isolation. Decide *before* the first paying customer.
3. **CMS-native pre-publish plugins.** WordPress, HubSpot, Webflow. The `WEBHOOK_API_KEY` gate on `/api/check` is half-built for this - promote it to a first-class integration.
4. **Switch local → API embeddings for multi-tenant.** Local `bge-small-en-v1.5` is fine at our 2.5k-page corpus; breaks past 50k or with cold-start churn across tenants. Cache by URL+content-hash.
5. **Add intent classification** (informational / commercial / transactional). Every serious competitor does this. Right now the tool only knows topic overlap, not intent overlap. Likely 1-day LLM-classifier addition.
6. **SOC2 prep.** Encrypt GSC tokens at rest (currently plaintext in `gsc_connections` per `lib/gsc.ts:36-46`). Add audit logging. Redact PII from LLM logs.
7. **In-app onboarding.** `/conflict-checker` has no "paste this URL to try it" empty-state for non-dev editors. Add a 30-second tutorial.

### 10F. Suggested execution order

1. **Week 1:** ship-stoppers S1–S8. All small, none architectural. No design decisions blocking.
2. **Week 2–3:** H1–H18 (high priority).
3. **Sprint after:** 10C medium batch - bias toward the scoring + rewrite-prompt corrections (highest leverage on actual product quality).
4. **Parallel strategic track (if productizing):** §10E items 1–3 spike in worktree; don't block the bug-fix train.

### 10G. Method notes (so future audits are cheaper)

- Audit ran as **4 parallel specialist agents** over a repomix snapshot. Wall-clock ~3 min vs. ~12 min sequential. Use this pattern for every full re-audit.
- All four agents reported zero false-positive count on the items above (cross-checked against actual file:line during synthesis). The substring bug (H12) was the only finding that overlapped between phases - code/logic missed it, SEO agent caught it.
- No source files were edited during the audit. Any change here is a follow-up commit, not an audit step.
- **Repeat cadence recommendation:** re-audit on every minor version bump or every 4 weeks of active development, whichever comes first. Snapshot diff vs. last audit's PROJECTLOG entry - only re-investigate items that changed.

---

## 11. Session 7 - Audit fixes shipped (2026-06-25)

All 8 ship-stoppers + 18 high-priority items from Session 6 §10A + §10B
landed and deployed to production. 10 atomic commits, every one with a
clean `tsc --noEmit`, structured into 5 ship-stopper sub-batches and 5
high-priority sub-batches. Push went to `Layruss98266/main`; Vercel
build promoted within ~90s and all post-deploy smoke tests passed.

### 11A. Ship-stopper batches (Batch 1) - shipped

| Batch | SHA | Items | What landed |
|---|---|---|---|
| 1A | `f72f20f` | S1, S5, H2 | Shared `lib/cron-auth.ts` requires `CRON_SECRET` (was fail-open). `proxy.ts` PUBLIC_PATHS now anchored - `/api/auth` no longer matches `/api/authentication-overview`. `STATIC_ASSET_RE` replaced with explicit allow-list. |
| 1B | `f33f68f` | S3, S4, H3 | `lib/api-gate.ts` + `lib/ssrf-guard.ts` - WEBHOOK_API_KEY-or-rate-limit applied to `/api/summarize` + `/api/rewrite-suggestion`; outbound URLs rejected for RFC1918, loopback, link-local (incl. 169.254.169.254), CGNAT, multicast, IPv6 ULA. Rate-limit fails CLOSED in prod with per-instance in-memory bucket fallback. `/api/check` no longer trusts `body.createdBy` when auth is off. |
| 1C | `73cf563` | S2 | `lib/oauth-state.ts` HMAC-signs a nonce stored both in the OAuth `state` param and an HttpOnly cookie; `/api/gsc/callback` constant-time verifies, single-use clears on every outcome. Closes GSC OAuth callback CSRF. |
| 1D | `5f1ec71` | S6 | `chat.proposeRewrite()` on the `ChatProvider` interface - structured-output zod schema replaces the prior misuse of `chat.summarize()`. Untrusted draft + conflicts wrapped in `<data>` tags (also satisfies part of H5). |
| 1E | `a12af23` | S7, S8 | `app/(dashboard)/loading.tsx` skeleton + `error.tsx` retry boundary. Global `:focus-visible` ring rule in `globals.css` (replaces the ~1px border shift that fails WCAG 2.4.7). New `.skeleton` utility. |

### 11B. High-priority batches (Batch 2) - shipped

| Batch | SHA | Items | What landed |
|---|---|---|---|
| 2A | `731cf05` | H1, H4 | `next.config.ts` `headers()` block - permissive CSP, HSTS (2y + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. `auth.ts` `trustHost` now gates on `VERCEL` env or explicit `AUTH_TRUST_HOST=true`. |
| 2B | `87e7514` | H8, H9 | `drizzle/0005_check_match_enrichment.sql` adds `overlap`, `issue`, `owner_url`, `gsc_clicks_28d` + `check_matches_owner_url_idx`. `lib/db/schema.ts` reconciled (added `courseType`, `tags`, the 4 new columns + index). `lib/conflict.ts` replaces N+1 INSERT loop with single `UNNEST` and persists the enrichment fields. |
| 2C | `dd5709c` | H7, H10 | `gsc-snapshot` stale-flag race collapsed to one atomic UPDATE that uses `IS DISTINCT FROM` so only changing rows are touched. New `lib/ingest-page.ts` with `ingestOne()` + `runIngestPool()` (concurrency 10) drives `/api/cron/reingest`; that route is now ~50 LOC. |
| 2D | `0b9e817` | H11, H12, H13, H5 | `minSimilarity` default 0.30 → **0.50** with `CONFLICT_MIN_SIMILARITY` env override. `isEdstellarDomain` exported and adopted in `lib/competitors-extra.ts` (3 substring-bug sites). New `widenForCorporateTraining()` only appends the suffix when topic lacks a training term. `<data>`-delimiter prompt-injection hardening across `summarize` / `classifyConflicts` / `summarizeCompetitor`. |
| 2E | `918fdb0` | H14–H18 | In-house `Toast.tsx` (no new dep) replaces `alert()` + handles clipboard rejection. Shared `Tabs.tsx` with `?tab=` URL sync, `role=tablist`, arrow-key navigation - migrated `/competitors` + `/audit`. `ConflictBadge` gets a leading glyph (●/●/◐/○/⌛). Mobile burger hidden while drawer open. `HelpButton` dialog gets `aria-modal=true` + ~40-LOC focus trap; sidebar drawer marked dialog when open on narrow viewports. |

### 11C. Production verification (post-deploy smoke tests - all green)

Ran from a clean shell against the deployed prod URL after Vercel
promoted commit `918fdb0`:

| Test | Expected | Actual |
|---|---|---|
| `GET /api/cron/reingest` | 401 (no secret) | ✅ 401 |
| `GET /api/cron/audit-links` | 401 | ✅ 401 |
| `GET /api/cron/gsc-snapshot` | 401 | ✅ 401 |
| `POST /api/summarize` (no key) | 401 | ✅ 401 |
| `POST /api/summarize` body=`169.254.169.254` | 401 gate (or 400 SSRF) | ✅ 401 - gate fires before SSRF guard, defense-in-depth |
| `POST /api/authentication-overview` (prefix-overmatch regression) | 401 | ✅ 401 (was bypassing before) |
| `GET /api/auth/signin` (NextAuth subroute) | 302 | ✅ 302 |
| `GET /signin` headers | CSP + HSTS + XFO + XCTO + Referrer + Permissions | ✅ all 6 present |

Vercel served the prior build for ~90s after push; HSTS landed first
because Vercel had it from a previous deploy. Full headers block
appeared after the new build promoted.

### 11D. Docs synced this session

- `.env.example` - CRON_SECRET no longer "fail-open" wording; new `CONFLICT_MIN_SIMILARITY`; WEBHOOK_API_KEY scope expanded to `/api/summarize` + `/api/rewrite-suggestion`; AUTH_SECRET now also used by GSC OAuth state; AUTH_TRUST_HOST flag documented.
- `README.md` - Vercel deploy section: cron is now fail-closed; WEBHOOK_API_KEY gates three routes; one-time `npm run db:setup` post-deploy callout; security note linking to this section.
- `SETUP_GUIDE.md` STEP 6 - production hardening list updated to match the new reality (8 items including AUTH_SECRET, CONFLICT_MIN_SIMILARITY, migration step).
- `VERCEL_GITHUB_GUIDE.md` §2.2 - env-var table includes AUTH_SECRET as "strongly recommended"; WEBHOOK_API_KEY description widened; CONFLICT_MIN_SIMILARITY and AUTH_TRUST_HOST added to "optional" list. §2.4 - note about re-running `db:setup` after every drizzle migration.
- `PRE_PUSH_CHECKLIST.md` - after-push verification gets a paste-ready Session 6 smoke-test block (the 4 curl commands actually used post-deploy).
- `docs/conflict-types.md` - new "Why the 0.50 minimum-similarity floor?" subsection documents the H11 change.

### 11E. What's NOT yet done (Session 6 §10C medium batch - deferred)

These remain queued but did not block the deploy. Order = leverage:

- **Scoring rebalance** `0.4*base + 0.6*llm` → likely `0.5/0.5` or `0.6/0.4` base-heavy (`lib/score.ts:22`).
- **`impactWeighted` owner-bonus inversion** - comment intent says bonus should apply to *non-owner* matches, code applies it when match IS the owner (`lib/conflict.ts:62-67`). Verify with team before flipping.
- **Competitor freshness signal** - currently trusts sitemap `<lastmod>`, which lies for WordPress/HubSpot. Sample on-page `article:modified_time` instead (`lib/competitors-extra.ts:159-208`).
- **Internal-link suggester upgrade** - add anchor-text diversity, inverse-inlink weighting, intent-stage affinity (`app/api/internal-links/route.ts:49-57`).
- **Wire SERP features into rewrite prompt** - `serp-overlap` already fetches AI Overview / PAA / answer-box but `proposeRewrite` doesn't see them.
- **Embed batching** - `lib/ai/embed-local.ts:23` serial `for...of` → `pipe(texts, …)` batch.
- **OpenAI embedder retry + chunking past 2048** - bulk ingest will crash without this (`lib/ai/embed-openai.ts:11`).
- **Lazy `getDb()` factory** - replace import-time `neon("...localhost/db")` placeholder (`lib/db/index.ts:16`).
- **Verify `claude-sonnet-4-6` model id** against current Anthropic catalogue (`lib/ai/chat-claude.ts:7`).
- **CSRF origin check on authed POST routes** - NextAuth CSRF cookie or explicit origin check (`proxy.ts:54`).
- **UI tokenization** - `<Button variant size>` in `ui.tsx` to replace 3 parallel styles; `lib/score-bands.ts` extracted from 3 duplicated copies of the 80/60/35 thresholds; unify the two `Stat` components.

Pick these up in Session 8.

### 11F. Lessons re-confirmed this session

- **Shared helpers > inlined guards.** Both `requireCronAuth()` and `gateLlmEndpoint()` were duplicated logic before - extracting them into ~20-LOC modules removed all the inlined `if (!secret || ...)` variants and made the audit-trail comments single-source.
- **Forward-only DB migrations are still the right call.** `0005_check_match_enrichment.sql` only ADDs nullable columns + one index - safe to apply against a live prod DB without downtime. No reversible migration needed.
- **Phased-sequential audit + parallel-fan-out execution = fastest delivery.** Audit produced findings in 4 parallel agents (~3 min), but shipping them needs the human-in-the-loop confirmations from §10F. Stuck to the user's "commit only, push when authed" rhythm; saved a credential rotation mid-batch by batching all 10 commits behind one push.

---

## 12. Session 8 - Medium-batch cleanup + product upgrades (2026-06-25)

All five §10C medium batches shipped. 7 atomic commits, all pushed to
`Layruss98266/main`. Vercel build green. The headline product upgrades:
score blend rebalanced base-heavy, owner-cannibal scoring flipped to
match documented intent, competitor freshness now verified against
on-page metadata not lying sitemaps, internal-link suggester gets
content-type affinity + traffic weighting + LLM-generated anchor
variants.

### 12A. Batches shipped this session

| Batch | SHA | Items | What landed |
|---|---|---|---|
| 3E | `cb2498f` | Polish | Dropped `<meta keywords>` (Google ignored since 2009 + dashboard is `index:false`). Per-route Cache-Control (24h + 7d SWR) on `/opengraph-image`, `/icon`, `/apple-icon` so DoS hits Vercel's edge cache instead of re-running ImageResponse. OpenAI chat error now includes status text + truncated body. Four slider inputs get `aria-label` + `aria-valuetext`. Sidebar active-route check uses exact-or-segment-boundary match (`/audit` won't false-positive on a future `/audit-archive`). Stripped inline doc rot. |
| 3C | `17f3d10` | Tokenization | New `lib/score-bands.ts` is the single source of truth for the 80/60/35 thresholds + their Tailwind colors. `ScoreBar`, dashboard `scoreColor`/`scoreType`, `MatchCard` ternaries all migrated. New `<Button variant size>` in `ui.tsx` for the 3 parallel button styles. `lib/db neonRows<T>()` helper names the `(rows as any).rows ?? rows` pattern; routes migrate opportunistically. |
| 3B | `f6d8b37` | AI + CSRF | `lib/ai/embed-local.ts`: batched xenova pipe call (was serial - ~Nx speedup on bulk ingest). `lib/ai/embed-openai.ts`: BATCH_MAX=256 chunking past OpenAI's 2,048-per-call cap; 5-retry exponential backoff with jitter; Retry-After header honoured on 429; truncated body in error message. `lib/ai/chat-claude.ts` documents current model id catalogue + catches `not_found` → "model not found, override via ANTHROPIC_MODEL". `proxy.ts` CSRF origin check on POST/PUT/PATCH/DELETE when `AUTH_ENABLED=true` (SameSite=Lax + this layer = belt-and-braces). |
| 3A | `fb5033e` | Scoring + SEO | `blendScore` rebalanced **`0.6*base + 0.4*llm`** (was `0.4/0.6`). LLM bounded to ~40-point drift from empirical signal. `impactWeighted` owner-bonus flipped: +0.25 now applies when match is an **orphan cannibal** (`ownerUrl` set AND `ownerUrl !== match.url`), not when match IS the owner - code finally matches the documented intent. `competitorFreshness` samples up to 12 pages (concurrency 4), parses `article:modified_time` / `og:updated_time` / `<time datetime>` / `meta last-modified`, returns `recent90dVerified` extrapolated from the sample. `proposeRewrite` accepts optional `serpHints` (AI Overview / PAA / answer box) and the prompt asks the LLM to factor SERP-feature gaps into the angle suggestions. |
| 3D | `1b2e224` | Internal-links | `/api/internal-links` is now composite-scored: similarity × content-type-affinity × log10(gsc_clicks). Pulls 3x the requested limit for re-rank headroom. One batched LLM call generates 2–3 anchor variants per top match - returned alongside the primary anchor so the UI can show alternatives. Falls back gracefully when LLM call fails or `anchorVariants=false`. Reciprocal/orphan check deferred (needs an inbound-links table the corpus doesn't store). |

### 12B. New env vars / behaviour worth knowing

- No new env vars added. `ANTHROPIC_MODEL` is the documented override for Claude model rename outages.
- `CONFLICT_MIN_SIMILARITY` from Session 7 still applies; no change here.
- The CSRF origin check (3B) only runs when `AUTH_ENABLED=true`, so the open-dashboard default is unaffected.
- `competitorFreshness` now adds ~5–8 s of wall-clock per call (12 page fetches with concurrency 4); cache the result if calling from a hot path.

### 12C. What's still NOT done (deferred)

- **Stat-component unification.** The two `Stat` components (dashboard vs. competitors) still drift visually. Better as a focused PR than mixed in here.
- **Reciprocal / orphan internal-link check.** Needs an inbound-links table the corpus doesn't store. Build this when the link-suggester gets its v2.
- **Bulk-refactor of `(rows as any).rows ?? rows` to `neonRows<T>()`.** Eight call sites remain on the old pattern; migrate opportunistically when each route is next touched.
- **`scripts/cluster.ts` deterministic seed + transactional truncate.** Audit flagged this as 🟡 polish; low priority while clustering is a manual one-off.
- **Strict nonce-based CSP.** Replace the permissive CSP from 2A with per-request nonces. Project on its own - touches every inline script/style.

### 12D. Lessons re-confirmed

- **Don't ask the LLM for what plain code can do.** Anchor-variant generation needed the LLM (creative writing); content-type affinity / traffic weighting / composite ranking are plain code. Mixing the two in one route is fine when each is doing what it's best at.
- **Cache headers are framework-shaped.** Tried adding cache headers in the OG route handler itself first; the right place was `next.config.ts headers()` matching the source path - Vercel's edge picks them up uniformly.
- **Backfill comments to match code, not the other way around.** When you find a code-comment disagreement (3A owner-bonus), trust whichever one matches documented behaviour and fix the other. Don't ship "either could be right" patches.

---

## 13. Session 9 - Final polish + lightweight inbound-link signal (2026-06-25)

Closed out every §10C polish item plus the audit's "reciprocal/orphan
internal-link check" via a lightweight implementation that needs no
schema migration. One commit covering four small batches.

### 13A. What landed this session

| Batch | Items | What landed |
|---|---|---|
| 4A | Stat unification | Single `Stat` component in `ui.tsx` with `size="lg" \| "sm"`, `accent`, `hint`, `href` props. Dashboard's headline-KPI tile (size lg) and competitors' inline-metric box (size sm) both render from the same component. Local definitions deleted from both pages. |
| 4B | `cluster.ts` polish | Added `--seed=<int>` flag (mulberry32 PRNG; falls back to `Math.random` when unset). Wrapped `TRUNCATE clusters` + per-cluster `INSERT`/`UPDATE` loop in `BEGIN/COMMIT` with `ROLLBACK` on error so a partial run doesn't leave the table empty. |
| 4C | `neonRows<T>()` migration | All 8 sites of the `(rows as any).rows ?? rows` pattern migrated to the typed helper from Session 8 Batch 3C: `app/api/audit/route.ts` (5), `catalog-conflicts/route.ts` (1), `check/history/route.ts` (2), `gsc/index-coverage/route.ts` (1). Pattern fully retired from the codebase. |
| 4D | Inbound-link signal (lightweight) | New `lib/inbound-links.ts` with `fetchInboundCounts()` + `inboundWeight()`. One `unnest()+ILIKE` query gives an inbound count per candidate URL by scanning `content_text` of every other row. `/api/internal-links` composite now multiplies in `inboundWeight ∈ [0.85..1.15]` - orphan pages float up (need links), already-saturated pages get a slight penalty (don't reinforce stacks). Each suggestion ships `inboundLinks` alongside `compositeScore`. |

### 13B. Tradeoffs taken vs the audit's full proposal

- **Inbound links as `content_text` ILIKE, not a proper inbound-links table.** The audit recommended a dedicated table the ingest pipeline populates. That's the right design at 50k+ pages, but at ~2,500 pages a per-query `unnest()+ILIKE` against the corpus (O(N · candidates)) finishes in tens of milliseconds against Neon's pooled connection. Trades a small schema/migration project for a slight ongoing query cost. Documented in `lib/inbound-links.ts` so the next person sees the tradeoff and can upgrade when scale demands.
- **Substring match, not parsed `<a href>`.** False-positives are possible (a URL mentioned in copy without being a real anchor). For surfacing internal-linking suggestions the noise is acceptable - the downstream LLM still picks reasonable anchor variants.

### 13C. What's actually left now

- **Strict nonce-based CSP.** Replaces the permissive CSP from Batch 2A. Project on its own - touches every inline script/style. Defer unless threat model changes.
- **Productization / strategic items** (§10E): rename, multi-tenant data model, CMS plugins, OpenAI embeddings switch, intent classification, SOC2 prep, in-app onboarding. None are bugs; only relevant if Edstellar externalises this tool as a product.

That's it. Every red/orange/yellow item from the original audit §10A–C is closed.

---

## 14. Session 10 - 9-persona audit (2026-06-25)

Sessions 6–9 closed every engineering-led finding. This session pivots
to outside-in: what does the tool look like to the people who **use it**
(editors, marketing manager, content strategist, SEO specialist, demand
gen), the people who **inherit it** (a new engineer), and the people
who **break it** (security re-audit, SRE 3am scenario, designer/a11y
re-audit of post-Session 6 polish gaps)? Dispatched 9 parallel persona
agents (~3 min wall-clock). Synthesis + the Project-log link on the
dashboard top-right (user request: "put the log in to top right") below.

### 14A. Per-persona verdicts

| # | Persona | Verdict | Top 3 findings | Top fix |
|---|---|---|---|---|
| 1 | **Editor / marketer** (uses tool weekly to brief writers) | Solid editor microscope - but the UI uses dev jargon and lacks the "what now?" prescription | (a) `"vector match 78.4%"` next to a 82% conflict - two big numbers, no labels (`conflict-checker:691`); (b) `"first check after a deploy is the slowest (the embedder warms up)"` - `embedder`/`deploy` are dev words (`conflict-checker:264`); (c) needs-review badge says "Explain this match" but doesn't say why some were skipped or what it costs | Rename "vector match" → "topic similarity"; rewrite cold-start hint as "First check of the day takes ~10s while the AI model warms up." |
| 2 | **New engineer (day-1 hire)** | **Onboarding score: 7.5 / 10**. Docs above average; killed by no tests, no env separation, stale JSDoc | (a) No `lint` / `typecheck` / `test` script in `package.json`; (b) `SETUP_GUIDE` points hires at the prod Neon project - first `npm run ingest` mistake re-crawls prod corpus; (c) `lib/conflict.ts:84` JSDoc says `minSimilarity` default is 0.30 - actual default is 0.50 (post-Session 6 H11) | Replace 5-line `AGENTS.md` stub with a 20-line "how to work in this repo safely" block (dev Neon branch convention, dim is encoded in 4 places, three auth gates, etc.) |
| 3 | **Security re-auditor** (post Session 6 fixes) | Sessions 6 fixes hold; **5 new findings of meaningful blast radius**, mostly defence-in-depth | (a) **DNS-rebind TOCTOU in `assertSafeOutboundUrl`** - guard resolves DNS, then `fetch()` does a second lookup that an attacker can flip to `169.254.169.254`; (b) `/api/check/outcome` + `/api/pages/owner` + `/api/competitors` writeable with **zero auth when `WEBHOOK_API_KEY` unset**; (c) `<data>` delimiter prompt-injection bypass - attacker content can contain literal `</data>` and start their own instructions | Pin SSRF fetch to the validated IP (undici Dispatcher with custom lookup); apply `gateLlmEndpoint` to `/api/check/outcome` + `/api/pages/owner` + `/api/competitors`; randomise the `<data-${nonce}>` delimiter per call |
| 4 | **SRE 3am on-call** | App runs because traffic is low. First real burst (50 concurrent + Neon suspend) and failure modes compound | (a) **Zero request-id, zero log drain** - forensics impossible past Vercel's 1-hour log retention; (b) `embed-local` cold-start downloads ~30 MB from HF CDN inside Lambda on every fresh function - coin-flip first request; (c) No `LLM_KILL_SWITCH`, no daily spend cap, no per-IP token budget | Wire `x-request-id` middleware + `AsyncLocalStorage` → log drain (Axiom/Better Stack). After that, ship the kill-switch env + nightly cost rollup |
| 5 | **Designer / a11y re-audit** | Session 6 polish held; **15+ new items** mostly around hierarchy + prescriptive empty states + missing primary CTAs | (a) `/audit` is all tabs, no primary action - passive report, no "re-run audit" button or scan age; (b) `/search-console` opens to a tab with no headline KPI row (Clearscope opens with the score); (c) Conflict-checker doesn't echo URL-vs-topic mode detection before the user hits Check (5s of silence) | One reusable `<StatusBar>` component with `aria-live="polite"` consumed by every async route - closes the screen-reader gap + gives buyers the "is something happening?" affordance |
| 6 | **Marketing manager** (defends budget to CMO) | Brilliant editor microscope. **Useless as a manager's cockpit.** Can't measure team or spend. | (a) Zero per-writer attribution - no `user_id` on `checks`; (b) Zero spend telemetry - no LLM $ per check, no Serper credits, no GSC quota meter; (c) No Friday-4pm export (PDF / Slack / email) - every weekly report is manual screenshotting | Three changes unlock everything: stamp `user_id` on `checks` → spend `usage` table → `/manager` summary route + weekly Slack/PDF export |
| 7 | **SEO specialist** (used Clearscope/Surfer/Ahrefs) | Above-average GSC analytics + 2025-aware SERP feature tracking. Methodologically broken in 3 ways. **Not yet a Clearscope competitor.** | (a) **`inboundWeight` is substring `ILIKE`, not a real `<a href>` graph** - misleads pre-publish link suggestions; (b) No query-level cannibalization - `gsc-insights.cannibalization` and `conflict.ts` similarity never join; (c) `extract.ts` strips bylines as noise → EEAT is dead in this pipeline; no JSON-LD parsing | Build a proper `internal_links(source_url, target_url, anchor_text, rel)` table at crawl time. Closes #1, unlocks PageRank-style internal authority + anchor over-optimization detection |
| 8 | **Content strategist** (owns calendar + taxonomy) | Strong **defensive** tool. Has no **editorial layer.** Every report is diagnostic, none prescriptive | (a) No `intentStage` (TOFU/MOFU/BOFU) anywhere - implied via `TYPE_AFFINITY` weights but never explicit, so funnel-shape report is impossible; (b) No `editorialStatus` / `owner` / `dueDate` - there's no editorial calendar; (c) Stale tab flags but never prescribes (refresh / merge / redirect / kill) | Three data-model adds: `intentStage`, `editorialStatus`+`owner`+`dueDate`, and a `refreshTrigger` enum on stale pages with a recommended-action column |
| 9 | **Demand gen / RevOps** | Sharp SEO ops tool. **Zero CRM gravity.** Lives entirely upstream of the funnel | (a) `gsc_clicks_28d` per page is the deepest - no GA4 / form-submit / demo-request join; (b) No buyer-intent decoding (info/nav/comm/trans) on queries; (c) AI Overview citation tracked but not persisted week-over-week | Build a "competitor keyword harvest for SDR" route - pivot competitors to `domain → [keywords]` with intent tags, ship as CSV/Sheets sync. Single highest-leverage demand-gen addition |

### 14B. Cross-cutting themes - what 3+ personas independently flagged

These showed up in multiple audits without coordination - strongest signal:

- **No intent classification on queries / pages** (SEO + Content + Demand gen). Cosine similarity treats "leadership training" (commercial) and "what is leadership" (informational) identically. Every downstream user feels this differently. **The single most leveraged data-model add this codebase could make.**
- **No real internal-link graph** (SEO + Content + Editor). The Session 9 `inbound-links.ts` `ILIKE` proxy is honest about the tradeoff in code comments, but every persona reading SEO-grade tooling expectations finds it short. Promote to a proper `internal_links` table at crawl time.
- **No `user_id` / assignee / ownership anywhere** (Manager + Strategist + Editor). Checks are anonymous; outcomes have no author; calendar doesn't exist. Stamping `user_id` on `checks` is one column + an `auth().user.email` read; unlocks per-writer reporting, calendar ownership, and the strategist's editorial layer.
- **Cost telemetry doesn't exist** (Manager + SRE). LLM tokens per call are not logged anywhere - manager can't defend the spend, SRE can't see runaway bills until the credit-card alert fires. One `usage` table + a per-call `{ provider, model, prompt_tokens, completion_tokens }` log line.
- **EEAT / schema markup invisible** (SEO + Content). `extract.ts` doesn't read `<script type="application/ld+json">`, strips bylines as noise. For a courses-heavy site, missing `Course` schema is missed free training-listing rich results. Substantial SEO leak.
- **No prescriptive UI anywhere** (Editor + Designer + Strategist). Stale tab flags; doesn't say "refresh / merge / redirect / kill." Audit tab is all chrome, no primary action. Search Console opens to a tab, not a number. Every persona wants the verdict surfaced, not the data dump.
- **Observability is zero** (SRE + Security + Engineer). No request id, no log drain, no metrics, no alerts, no `ingest_runs` cursor. Every persona that hits prod problems is blind. **Highest-leverage SRE addition.**

### 14C. Ranked backlog (post-9-persona-audit)

Ordered by **leverage × scope of personas helped**. Top items help 3+ personas at once.

**🚀 Ship next (cross-cutting wins)**

| # | Item | Persona unlock | Effort |
|---|---|---|---|
| 1 | Stamp `user_id` on `checks` + add lightweight `usage` table for token logging | Manager + Strategist + Editor + SRE | ~1 day |
| 2 | Intent-stage tagging (`tofu/mofu/bofu`) - one LLM-classifier pass over the corpus + per-query | SEO + Content + Demand gen + Editor | ~2 days |
| 3 | Proper `internal_links(source, target, anchor, rel)` table populated at crawl time | SEO + Content + Editor | ~3 days |
| 4 | Request-id + log drain (Axiom or Better Stack) + `LLM_KILL_SWITCH` env | SRE + Security + Manager (cost cap) | ~1 day |
| 5 | Editorial layer: `editorialStatus`, `owner`, `dueDate`, `nextReviewAt` on `pages` + a `/calendar` route | Strategist + Manager | ~3 days |

**🟠 Security re-audit follow-ups (none ship-stoppers, all defence-in-depth)**

| # | Item | Severity |
|---|---|---|
| 6 | DNS-rebind TOCTOU in SSRF guard - pin fetch to validated IP | High (cloud metadata reachable if attacker controls DNS) |
| 7 | Gate `/api/check/outcome` + `/api/pages/owner` + `/api/competitors` with `gateLlmEndpoint`-style rate-limit fallback | High (writeable with no auth when `WEBHOOK_API_KEY` unset) |
| 8 | Randomise `<data-${nonce}>` delimiter in chat-base prompts | High (prompt-injection bypass) |
| 9 | `crypto.timingSafeEqual` in `requireCronAuth` | Medium |
| 10 | LRU cap on `inMemoryBuckets` Map in rate-limit | Medium (slow leak) |
| 11 | Drop CSP `'unsafe-eval'` (Next 16 doesn't need it) | Medium |
| 12 | Strip Neon driver internals from `(e as Error).message` returns | Medium (schema fingerprinting) |
| 13 | Restrict `inbound-links` ILIKE to URLs that exist in `pages` (prevents enumeration side-channel) | Medium |
| 14 | `next-auth` pin to exact beta + add `npm audit` to CI | Polish |

**🟡 SEO / methodology upgrades**

| # | Item |
|---|---|
| 15 | SERP-target content brief generator (top-10 SERP → word counts / headings / entities / schema → target spec) - Clearscope's headline feature |
| 16 | Query-level cannibalization view (join `gsc-insights.cannibalization` + `conflict.ts` similarity) |
| 17 | Schema/EEAT extractor (JSON-LD → `page_schema` table; Course / FAQ / HowTo / Article author validation) |
| 18 | Content-gap report (competitor top-N queries diff against our GSC queries) |
| 19 | SERP-overlap clustering (replaces `scripts/cluster.ts` k-means for topic clusters) |
| 20 | Orphan-page detection (4-quadrant: in-sitemap × in-index) |
| 21 | Corpus-calibrated similarity floor (replaces hardcoded 0.55 in `similarityToBaseScore`) |

**🟡 Designer / Editor polish**

| # | Item |
|---|---|
| 22 | `<StatusBar>` reusable component with `aria-live="polite"` consumed by every async route |
| 23 | Primary CTA on every dashboard route (Re-run audit on `/audit`, headline KPI row on `/search-console`) |
| 24 | URL-vs-topic mode pill on conflict-checker input as the user types |
| 25 | Unified instructional empty-state voice (one register across every empty state) |
| 26 | Pair every range slider with a numeric input (mobile thumb precision) |
| 27 | Replace inline button styles with `<Button>` everywhere (ESLint rule for `bg-slate-900` outside `ui.tsx`) |
| 28 | Type ramp: PageHeader h1 → `text-2xl`, section h2 → `text-base font-semibold` (drop the xl→sm jump) |
| 29 | Rename "vector match" → "topic similarity" + add Glossary tooltips for jargon terms |

**🟡 SRE / observability**

| # | Item |
|---|---|
| 30 | `ingest_runs(id, started_at, finished_at, last_url, status)` for resumable cron + `?since=` query param on `/api/cron/reingest` |
| 31 | `statement_timeout` on Neon session + `p-retry` wrapper on critical DB paths |
| 32 | Streaming + SSE on `/api/check` so user sees progressive disclosure (currently 5s of spinner) |
| 33 | Daily LLM-cost rollup → Slack post |

**🟡 Demand gen / CRM**

| # | Item |
|---|---|
| 34 | Striking-distance retargeting export (`query, page, position, impressions, intent_stage, est_MQL_value` → CSV/Sheet) |
| 35 | Competitor keyword harvest (`/api/competitors/keyword-inventory?domain=`) for SDR sequences |
| 36 | CTA-presence + funnel-velocity scanner (extend `extract.ts` to detect `<a href="/demo">` / `<form>` / gated-asset patterns) |
| 37 | HubSpot webhook on `checks.outcome = published` |
| 38 | GA4 → BigQuery → Neon `page_conversions` table (sessions / form submits / demo requests per URL) |

**🟢 Onboarding**

| # | Item |
|---|---|
| 39 | Rewrite `AGENTS.md` from 5-line stub → 20-line "how to work in this repo safely" block |
| 40 | Add `lint` / `typecheck` / `test` scripts to `package.json` |
| 41 | Fix `lib/conflict.ts:84` JSDoc - `minSimilarity` default is 0.50 not 0.30 |
| 42 | `DATABASE_URL_DEV` convention in SETUP_GUIDE so day-1 hires don't write to prod |

### 14D. Lessons re-confirmed

- **Outside-in audits surface what insider-engineering audits miss every time.** Sessions 6–9 (engineering-led) closed every measurable bug. Session 10 (persona-led) surfaced **5 cross-cutting product holes** that no engineer audit would have framed - because they aren't bugs, they're *missing primitives* (intent stage, ownership, ed-status, cost telemetry, prescriptive UI). Run a persona audit once per quarter.
- **The 9 personas weren't redundant.** Each found ≥2 items no other persona found. The closest overlap was Editor + Designer on empty-state voice; even there they framed the fix differently (editor wanted "what now?", designer wanted register consistency).
- **The cross-cutting themes are the highest-leverage product backlog.** When 3+ personas independently flag the same gap, that's a primitive missing from the data model, not a UX papercut.

### 14E. UI ship in this session

User asked for the project log to be surfaced "top right" of the dashboard. Added `app/components/ProjectLogLink.tsx` - a small floating link top-right (z-30, hidden below `sm:` breakpoint so it doesn't fight the mobile burger) that opens this PROJECTLOG.md on GitHub in a new tab. Sidebar-style - out of the way, but discoverable. Mounted in `app/(dashboard)/layout.tsx`.

---

## 15. Session 11 - conflict automation + grouping; GSC/SERP removed (2026-07-06)

Turned the manual "find duplicate pages → decide → pick a winner" workflow into
deterministic, config-driven tooling, and stripped the external-data panels the
team had stopped using. Plan: [`plans/01-conflict-automation.md`](plans/01-conflict-automation.md).

### 15A. Corpus data changes (direct DB, kept durable in `lib/taxonomy.ts`)

- **3 new standalone content types** promoted out of `static`: `managed-training`
  (8), `platform` (8), `consulting` (25) - 41 service/solution pages, mapped by
  slug in `lib/taxonomy.ts` so a reingest re-derives them. Category left null (the
  type already conveys the grouping). Type-badge colors added in `ui.tsx`.
- **`templates` content type** - 14 `/templates/*` pages + the L&D templates hub
  moved out of `static`. Corpus is now **2,463** pages (2 new consulting pages
  were inserted + embedded via the local bge model).
- Corpus breakdown by type now: course 1,698 · blog 500 · subcategory 102 ·
  **static 55** · category 43 · **consulting 25** · templates 14 · excellence-program 10 ·
  **managed-training 8** · **platform 8**.

### 15B. Corpus page - CSV import/export

- **Download CSV** (`/api/pages/export`) streams the whole filtered corpus.
- **Upload CSV** (`/api/pages/import`) upserts by `url`; supports an `action`
  column (`delete` removes a row). Shared parser in `lib/csv.ts` (+ tests).
- Columns reworked: added **H1** + **Description**, removed **Clicks 28d** +
  **Modified**; GSC clicks no longer selected for this view.

### 15C. Conflict Checker - GSC + SERP removed

- Deleted the GSC performance panel, "your GSC rank", cannibalization banner, and
  the Competitor SERP / AI Overview block. Deleted routes
  `/api/check/enrich` + `/api/check/cannibalization`. `serpOverlap` stays for
  `/api/competitors/*` + `/api/suggestions/new-content`. GSC lib untouched
  (still used by `/api/gsc/*` and the `/search-console` page).

### 15D. Conflict automation - Phase 1 (per-match) + grouping (Stage 6-8)

New pure, unit-tested modules (Node `node:test`; run `npx tsx --test lib/<x>.test.ts`):

| Module | Role |
|---|---|
| `lib/thresholds.ts` | every cutoff + winner weight, env-overridable (`CONFLICT_*`) |
| `lib/signals.ts` | title/H1/slug/body scored **separately** (never blended) |
| `lib/intent.ts` | rule-based search intent (informational/commercial/transactional/navigational) |
| `lib/resolution.ts` | pairwise `decidePair` + weighted `pickWinner` + cluster `groupAction` |
| `lib/cluster.ts` | connected-components (union-find) over the pair graph |

- `runConflictCheck` now attaches `{signals, intent, resolution}` per match +
  `inputIntent`. The page renders a **Resolution card** (4 signal bars, intent
  chip, action badge, winner ★, copyable 301 line).
- **Content Clusters** - its own top-level page (`/clusters`, sidebar next to
  Conflict Checker), auto-loading on visit. `/api/groups` computes near-duplicate
  pairs **live over the whole corpus** (every embedded page, all content types)
  via a single pgvector top-k lateral join, then connected components → per-group
  winner + action + member intents. Considers all **2,463** pages (~2.5 s); at
  the `0.90` default (`CONFLICT_GROUP_SIMILARITY`) it groups **675 pages into 176
  clusters** spanning course/blog/category/etc. Threshold tuning matters: `0.82`
  chained everything into one 1,947-page hairball; `0.90` yields meaningful
  clusters (biggest ~71). Winner uses depth + URL cleanliness here - inbound
  authority is skipped for the corpus scan (`fetchInboundCounts` is
  O(members × corpus) and times out at that scale).
- **Catalog Conflicts scan solidified** (`scripts/catalog-conflicts.ts`, moved
  under Additional Tools in the sidebar): one lateral-join query instead of a
  ~2,400-query loop; a single bulk `UNNEST` insert instead of a per-row loop
  under a fake HTTP "transaction" (neon-http is stateless - cross-call
  BEGIN/COMMIT isn't real). Pair typing is now **intent-aware** (same *search
  intent*, not just content_type, is the real cannibalization). Re-run refreshed
  the stale June-25 table: 130 → **4,033 pairs**.
- Fixed a **latent bug** in `lib/inbound-links.ts`: drizzle's `sql\`\`` expanded
  the URL array into `unnest($1,$2,…)` (a record) - rebound as a single
  `$1::text[]` via the raw neon client. Also unbreaks `/api/internal-links`.

### 15E. Sidebar

- "Additional Tools" (Content Audit / Internal Links / Funnel Strategy) is now a
  collapsible group, closed by default, auto-opening on those routes.

### 15F. What's left - future upgrades (conflict automation Phases 2-5)

Tracked in [`plans/01-conflict-automation.md`](plans/01-conflict-automation.md):

- **Phase 2 - intent everywhere + ingest hardening.** Persist `intent` + a
  non-indexable flag during ingest (Stage 1/5 durability); surface intent in the
  Corpus + Catalog Conflicts views.
- **Phase 3 - clustering in the DB.** Migration `0008` (`clusters` +
  `cluster_members`); move the connected-components + per-cluster resolution from
  the live `/api/groups` into a persisted, corpus-wide scan
  (`scripts/catalog-conflicts.ts`).
- **Phase 4 - guardrails + export.** `lib/guardrails.ts` (redirect-loop / orphan
  / canonical-to-noindex checks); low-confidence flagging; action-plan CSV / 301
  map export (reuse `lib/csv.ts`).
- **Phase 5 - corpus-wide UI.** Catalog Conflicts page shows clusters (not raw
  pairs) + resolutions + download.

### 15G. Content Clusters - peak-accuracy plan (researched 2026-07-06, executed below)

**Problem 1 - blogs & most non-course pages invisible.** One global 0.90 cosine
bar served everything. Measured against the live corpus: course↔course cosine is
*inflated* by shared template boilerplate (courses were 573 of 675 grouped
pages), while editorial types are diverse - **140 blog↔blog pairs sit in the
0.85–0.90 band**, below the bar. Real blog conflicts (ai-in-banking ↔
digital-transformation-in-finance, 0.81) hide while template-noise course pairs
surface. Express.js ↔ Node.js courses measure only **0.74** - genuinely distinct
products that must never group.

**Problem 2 - redirected pages appear as fake duplicates.**
`/blog/trending-corporate-training-topics` 301s to
`/blog/professional-development-training-topics`, but the crawl stored both as
live rows (`canonical_url` NULL corpus-wide - nothing captured HTTP redirects).

**Fix (all deterministic, all env-tunable via `lib/thresholds.ts`):**
1. **Same-type edges only.** Clusters = same content_type near-duplicates.
   Cross-type pairs are "bleed", already surfaced on Catalog Conflicts -
   chaining them was what created the 0.86 hairball.
2. **Type-aware thresholds.** course↔course groups only at sim ≥ 0.93 (true
   duplicates) OR sim ≥ 0.88 + title Jaccard ≥ 0.6 (same offering, re-listed).
   Other same-type pairs group at 0.85 - surfaces the hidden blog band.
3. **Redirect exclusion.** New `scripts/detect-redirects.ts` probes every corpus
   URL (`redirect: "manual"`), writes the 3xx target into `canonical_url` +
   `is_stale`/`stale_reason`. `/api/groups` (and future consumers) exclude any
   page whose canonical points elsewhere or is stale; winners can never be
   redirected pages.
4. **UI redesign per member row:** bold title as the link (href = page URL),
   muted `type · full-url` line, full intent labels (no more "tran"/"comm"),
   per-member "N% match" to its nearest cluster-mate (the *why grouped*), a
   one-line cluster reason; token-count meta removed.

**Executed + measured (same day):**
- `npm run detect-redirects` probed all 2,463 URLs → **5 redirected pages**
  marked (incl. the flagged `trending-corporate-training-topics` →
  `professional-development-training-topics`). Live corpus for clustering is
  now **2,458**; zero redirected pages appear in any cluster.
- Result: **205 clusters · 782 pages grouped · 867 qualifying pairs** - blogs
  went from 20 grouped members to **105**; Express.js ↔ Node.js confirmed never
  grouped; a real 17-blog "Top N training companies" listicle cluster surfaced
  at 91–93% match.
- New knobs: `CONFLICT_GROUP_SIMILARITY` (0.85 non-course), `CONFLICT_GROUP_SIM_COURSE`
  (0.93), `CONFLICT_GROUP_SIM_COURSE_TITLE` (0.88), `CONFLICT_GROUP_TITLE_JACCARD_COURSE`
  (0.6). Edge rule is the pure, unit-tested `shouldGroupPair` in `lib/cluster.ts`.
- Re-run `npm run detect-redirects -- --only-null` after future reingests to
  keep redirect marks fresh (ingest doesn't capture 3xx yet - see backlog).

**Same principles applied to the Conflict Checker (same day):**
- `vectorSearchPages` now excludes non-live pages (stale / canonicalized-away),
  so a 301'd page can never be reported as a conflict match. Verified: searching
  with the redirect-target's own embedding no longer surfaces its redirected twin.
- `decidePair` gained the course↔course template-noise gate (same thresholds as
  clustering): a course-URL input vs a *different* course resolves **keep-both**
  ("template boilerplate") instead of merge/consolidate. Verified on a real pair:
  "High Impact Leadership" vs "Leading for Organizational Impact" at 92% body /
  50% title → keep-both. True duplicates (≥0.93, or ≥0.88 + near-identical
  title) still merge. Input content type derived via `tagUrl` (topics: no gate).

### 15H. Content Clusters - multi-signal evidence rule (researched + defined 2026-07-06)

**Goal.** A cluster edge must never rest on ONE signal. Not body cosine alone
(course/static template boilerplate inflates it - `/enquiry-form` ↔
`/contact-us` measured 88% body with zero lexical overlap), and not same
title/URL alone (metadata can match while content differs). Every edge needs
**semantic + lexical corroboration** across Title, H1, Meta description, URL
slug, and Body.

**Measured basis (live corpus):** all 2,458 live pages have title+H1+description
(100% coverage). Of 867 current edges, 864 already carry ≥1 lexical support at
Jaccard ≥ 0.3 - the 3 that don't are template noise (killed) plus one true pair
lost only to plural mismatch ("skill gaps" vs "skills gap") → support matching
uses light plural normalization.

**Edge rule (all env-tunable):**
1. Both pages live, same content_type (unchanged).
2. Body cosine ≥ type-aware floor (course bars unchanged; editorial 0.85).
3. **Corroboration:** ≥1 of {title, H1, description, slug} with
   plural-normalized Jaccard ≥ `CONFLICT_GROUP_SUPPORT_JACCARD` (0.3) - unless
   body ≥ `CONFLICT_GROUP_BODY_SELF_SUFFICIENT` (0.93, near-verbatim duplicate).
   Symmetrically, lexical match alone can never group - the body floor always
   applies.
4. The supporting signals are returned per edge and shown as evidence tags in
   the UI ("why grouped": body 91% + title + description).

Plus: filter bar on /clusters (action, content type, text search).

**Executed + measured (same day):** 866 evidence-backed pairs (the
`/enquiry-form` ↔ `/contact-us` 88%-body template pair is gone; the plural
"skill gaps"/"skills gap" pair survives), 205 clusters, 781 of 2,458 live pages.
Every member row now shows its evidence tags (e.g. `Body · Title · H1 · URL`)
next to its % match. Filter pills verified live (action: All 200 / Merge 176 /
Differentiate 24 · type: course 155 / blog 29 / …) + title/URL search box.
Edge rule is the pure, unit-tested `evaluatePair` in `lib/cluster.ts`
(`shouldGroupPair` kept as a boolean wrapper).

### 15I. Groq resilience + UI trims (2026-07-06)

- **Groq key rotation + model fallback** (`lib/ai/chat-groq.ts`, unit-tested):
  the free tier caps tokens-per-day per key per model, so a single key dies
  mid-day with a 429 (hit live during Session 11 verification). Now:
  `GROQ_API_KEYS=key1,key2,…` rotates keys on 429; when the primary model 429s
  on every key, `GROQ_FALLBACK_MODEL` (default `llama-3.1-8b-instant`, its own
  TPD bucket) is tried across the pool. Dead key+model combos are remembered
  with a retry-after cooldown so warm instances skip them. Non-429 errors
  still throw immediately.
- **Catalog Conflicts hidden** (user will revisit): sidebar link + the
  dashboard stat tile + the "Top catalog conflicts" card are commented out in
  place - the page, API, and scan script all still exist; uncomment to restore.
- **Sidebar logo mark removed** - wordmark text only.

**Known tuning notes for later:**
- Grouping uses connected components, which are threshold-sensitive: too low and
  everything chains into one giant component. Default `0.90` is a good balance;
  a future upgrade could split large components by intent or use community
  detection instead of raw connected components.
- `fetchInboundCounts` is a substring `ILIKE` over `content_text` (no parsed
  anchors) and O(members × corpus) - it returns ~0 for most pages AND times out
  on the whole corpus, so it's skipped in `/api/groups` (used only on the ≤8-URL
  per-match path). A real internal-links table (Session 9 §13B) would fix both.
- External backlinks/referring domains are not in the data model; winner authority
  uses internal inbound links only. Wiring Ahrefs/GSC-links is a config slot in
  `lib/thresholds.ts` (`CONFLICT_WINNER_*`) away.

---

## 16. Session 12 - Full project audit: 4 section reviews + 5 persona audits (2026-07-06)

Ran 9 independent read-only audits in parallel (4 section reviews covering the
conflict engine, clusters, corpus pipeline, and everything-else/help-docs; 5
persona walkthroughs - SEO manager, content editor, new-hire developer,
marketing lead, skeptical QA), then fixed every finding worth fixing in one pass.
Full findings are in the audit transcripts (not persisted); this section is the
fix log + the findings deliberately left open.

### 16A. Correctness bugs fixed

- **The dashboard silently defeated the 0.50 similarity noise floor.** Two
  audits independently found this: `conflict-checker/page.tsx` sent
  `minSimilarity: 0` on every check, and `lib/conflict.ts`'s `?? 0.50` fallback
  only fires on `null`/`undefined` - `0` is a valid finite number, so it passed
  straight through. Every dashboard-initiated check ran with **no floor at all**
  since the Session 6 H11 fix, wasting LLM-classification slots on near-zero
  matches. Fixed by omitting the field so the server's own default applies.
- **CSV import (`/api/pages/import`) could silently wipe metadata + insert an
  invalid content_type.** Three real bugs, all verified against the live DB
  with a net-zero sentinel round-trip: (1) partial-column CSVs (e.g. just
  `url,title`) nulled every other field on update - now `COALESCE(excluded.col,
  pages.col)` preserves existing values when the CSV cell is blank/missing;
  (2) new rows with no `content_type` column defaulted to `"page"`, a value
  that isn't in `lib/taxonomy.ts`'s enum - now defaults to `"static"`, and only
  for genuinely NEW rows (an existing-urls lookup runs before the upsert so
  updates never get the default injected over a real value); (3) a duplicate
  URL within one upload crashed Postgres ("cannot affect row a second time")
  after earlier batches had already committed - now de-duped (last row wins)
  before batching, and a url flagged both upsert and `action=delete` in the
  same file now correctly drops to delete-wins instead of silently discarding
  the upsert.
- **`lib/csv.ts` didn't strip a UTF-8 BOM** - Excel's "CSV UTF-8" export writes
  one, so the first header cell became `"﻿url"` and the `"url" in row`
  check failed on a file that visibly has a `url` column. Fixed at the parser
  level (benefits every caller, not just import).
- **`scripts/catalog-conflicts.ts` didn't exclude redirected/canonicalized-away
  pages** - violating the contract `scripts/detect-redirects.ts` established
  for every other consumer (`/api/groups`, `lib/search.ts`). Added the same
  `LIVE` predicate on both sides of the lateral join; re-ran the scan
  (4033→4027 pairs, consistent with the 5 marked redirects). Also combined the
  DELETE+INSERT into one atomic `WITH del AS (DELETE ...) INSERT ...`
  statement - the previous two-statement version could leave the table
  emptied if the INSERT failed (neon's HTTP driver has no real cross-call
  transactions, a gotcha documented elsewhere in this repo but that had
  reappeared here).

### 16B. Dead code removed

- **`scripts/cluster.ts` (k-means)** - repo-wide grep found zero consumers of
  `pages.cluster_id` or the `clusters` table it writes; Content Clusters
  (`/clusters`) uses the unrelated connected-components approach in
  `lib/cluster.ts`. Archived to `scripts/archive/cluster-kmeans.ts` with a
  header explaining why (including a real bug found in passing: its "single
  transaction" was the same multi-statement-on-stateless-HTTP-driver issue as
  16A's catalog-conflicts fix, just never triggered because nothing used it).
  Removed the `npm run cluster` alias.
- **Dashboard's dead "blocked" outcome metric.** `manager/page.tsx` computed
  `blockedThisWeek` from `outcome = 'blocked'` and color-coded 'blocked'/
  'modified' in the outcome bar chart - but `OutcomeSelect` (History page) only
  ever writes `published/merged/redirected/discarded`, so those two values can
  never occur. Removed the dead computation and field; replaced the color map
  with the actual 4 outcomes + the synthetic 'open' bucket. Also fixed the
  page's subtitle ("ship-vs-block outcomes" → "editorial outcomes") and a
  cross-page metric-window mismatch note (Manager's "Shipped · 7d" keys off
  `created_at`, the Dashboard's 90-day tiles key off `resolved_at` - different
  clocks, now documented in the new `/manager` help entry rather than silently
  left for someone to notice).

### 16C. Docs - stale references + gaps closed

- **`lib/help-content.ts`**: removed 3 references to dashboard sections
  deleted when Catalog Conflicts was hidden; fixed "Adjust 'Scan'" → "Adjust
  'Search depth'" (the control was renamed, help wasn't); fixed a claim that
  matches are sorted by "impact-weighted score" - verified the client actually
  sorts by raw `conflictScore`/`similarity` per the visible Sort-by toggle,
  no hidden traffic weighting; removed "weekly cron" claims for
  catalog-conflicts (it's a manual `npm run` refresh, always was); added
  entries for `/clusters` and `/manager` (previously the Help button rendered
  nothing on either page); added a line about the AI Draft panel to the
  Conflict Checker entry.
- **`AGENTS.md`**: fixed `EMBEDDING_PROVIDER` → `AI_EMBED_PROVIDER` (the code
  only ever read the latter - the wrong name in a "how to work in this repo
  safely" doc would cost a new dev a debugging session); corrected the
  `WEBHOOK_API_KEY` route list (was missing `/api/check`, `/api/summarize`,
  `/api/rewrite-suggestion`, `/api/internal-links/paragraph`; wrongly included
  `/api/competitors`, which isn't gated - that's still an open backlog item,
  §14C #7).
- **`PROJECTLOG.md` §6**: fixed a stale "cron routes fail OPEN if unset" line
  that contradicted README/SETUP_GUIDE (both correctly say fail-closed since
  Session 6) - historical audit-log entries elsewhere that describe the
  *pre-fix* state were left alone, only the present-tense operational doc was
  wrong.
- **`README.md`**: "Features by page" table now lists all 13 routes (was 5,
  missing `/clusters` entirely, still presenting hidden `/catalog-conflicts` as
  headline); repo-layout script list now matches `scripts/` (added
  `detect-redirects.ts`, `pregen-drafts.ts`, `draft-worker.ts`, the
  `archive/` folder; removed `cluster.ts`); added a note that the "~2,461
  URLs" figure is the shipped sitemap snapshot, not a live DB count, since
  three docs cited three different numbers (2,461 / 2,463 / 2,458) for
  legitimately different reasons (static file vs. point-in-time session
  snapshots) - rather than chase a number that drifts every session, the docs
  now say so explicitly.
- **`SETUP_GUIDE.md`**: Step 1 told a new dev to sign into
  `marketing@edstellar.com` (the account that owns the shared PRODUCTION Neon
  project) to create their "personal" dev project - one misclick away from
  the shared project in the same console. Now tells them to use their own
  account, with an explicit warning box.
- **`.env.example`**: added 8 env vars the app reads but the file never
  documented - `WORKER_API_KEY`, `DRAFT_PROVIDER`, `LLM_KILL_SWITCH`,
  `CLAUDE_MODEL`, `AGY_MODEL`, and all 13 `CONFLICT_GROUP_*`/`CONFLICT_*`
  automation knobs from `lib/thresholds.ts` (verified each against actual
  `process.env.X` reads in code before adding).
- **PROJECTLOG §7 "Operational commands"**: was a bare command list with no
  indication of which scripts WRITE to whatever `DATABASE_URL` currently
  points at - the #1 onboarding-risk finding from the new-hire audit, since
  the one shared Neon project IS production. Rebuilt as a table with an
  explicit WRITE/READ-only column for every script, plus a note that
  `runConflictCheck` itself persists by default.
- **Added `npm test`** (`tsx --test "lib/**/*.test.ts"`) - the 6 `lib/*.test.ts`
  suites (Node's built-in `node:test`, no jest/vitest) previously ran only via
  a command documented in agent-facing files (AGENTS.md, plans/), never in
  `package.json` or a human-facing doc; a new dev would reasonably conclude
  the repo has no tests. Confirmed the glob discovers nested files too
  (`lib/ai/chat-groq.test.ts`) - 63/63 pass.

### 16D. Findings deliberately left open (tracked, not fixed this session)

- **Content Clusters has no "act on this" loop** (SEO-manager audit, highest-
  ranked finding): no CSV/redirect-map export from `/clusters`, no way to mark
  a cluster resolved/dismissed, and a merge executed from Clusters never
  connects to the History/Dashboard outcome tracking that Conflict-Checker
  merges do. Real product gap, not a bug - sizing it is a new plan, not a
  patch.
- **`groupAction`'s "consolidate" branch is unreachable from `/api/groups`**
  (clusters audit): every edge that survives the type-aware gates already has
  sim ≥ the merge threshold for same-intent clusters, so cluster actions are
  effectively binary (merge / differentiate) even though the UI presents three
  states. Would need either a lower minimum group-formation bar or a
  restructured action function to actually reach consolidate.
- **`scripts/catalog-conflicts.ts`'s `pairType()` predates the Session 11
  multi-signal evidence rule** (`lib/cluster.ts` `evaluatePair`) - it still
  uses raw content_type/intent thresholds, not the type-aware body floors or
  lexical corroboration. Noted in the script's own header as a follow-up if
  the (currently hidden) page is ever restored, rather than porting it now for
  a page nobody's using.
- **No export/CSV/redirect-map from Content Clusters**, no per-cluster
  accept/dismiss/snooze state, no traffic (GSC clicks) surfaced per cluster
  member for sanity-checking the suggested winner (inbound authority is
  skipped at corpus scale per the note above, so today's cluster winners are
  content-depth + URL-cleanliness only) - same root gap as the first bullet.
- **`/api/competitors` is not gated by `WEBHOOK_API_KEY`** despite historical
  PROJECTLOG entries (§14C #7) already flagging it as a backlog item - left
  as-is since it's tracked, not silently discovered and left untracked.
- **Rate-limit UX**: `/api/check` computes `retryAfterSec` on a 429 but the
  dashboard's generic error-card rendering doesn't surface a countdown; the
  in-memory rate-limit fallback (DB outage) is per-serverless-instance, so the
  effective limit loosens under concurrent cold-starts. Both are UX/robustness
  polish, not correctness bugs - deferred.

---

## 17. Session 13 - Topic-based Content Clusters rewrite + UX cleanups (2026-07-06)

### 17A. The bug: template similarity ≠ topic (mega-cluster)

The Content Clusters page grouped **different topics into one giant cluster**
(Big Data + Sales + Marketing + DevOps categories in one 40-page cluster). Root
cause: the old logic keyed on **body-embedding cosine** with lexical
corroboration (title/H1/desc/URL Jaccard ≥ 0.3). On this corpus the shared page
**template** dominates both signals - every page says "Corporate … Training
Courses | Edstellar" - so body cosine is *anti-correlated* with topic here.

Measured against the live DB:

| Pair | Same topic? | Same template? | Body cosine |
|------|-------------|----------------|-------------|
| big-data cat ↔ sales cat | no | yes | **89–94%** (FALSE positive) |
| big-data cat ↔ big-data blog | yes | no | **79%** (the TRUE pair, scored lowest) |

The lexical gates passed the false pairs too, because template words dominate the
token sets.

### 17B. What the user wants

A cluster = one **TOPIC**, across content types. "If big data → show every page
using big data": `/category/big-data-training` + `/blog/big-data-training-companies`
+ every big-data course - together. Different topics (big data vs data analytics
vs sales) must **never** co-cluster.

### 17C. Measured basis for the new logic (probed live)

- **Corpus document-frequency cleanly splits template vs topic vocabulary**:
  training 82%, corporate 78%, course 63%, employees 29% (template noise) vs
  big 0.6%, sales 1.2%, devops 0.5%, data 3.8% (topic). A **DF < 5% cap
  auto-learns the template vocabulary** - no hardcoded stopword list to maintain.
- **Distinctive-token Jaccard after that filter**: big-data↔sales = 0.00,
  big-data-cat↔big-data-blog = 0.40, big-data↔data-analytics = 0.33. IDF-weighting
  widens the gap (rare "big" outweighs common-ish "data"). (The final threshold
  was calibrated on the *live* corpus, not this exploratory sample - see §17J.)
- The true topic pair (79% body) IS in the category's top-5 ANN neighbours, so
  the true edge is recoverable once the fetch bar drops to ~0.70.

### 17D. Two full-corpus simulations chose the algorithm

- **Sim 1 falsified pairwise-edges + connected components.** Even with perfect
  edge thresholds (big-data↔sales direct overlap = 0.00), transitive chaining
  (big-data → data-engineering → cloud-security → … → sales) produced a 375-page
  hairball. **Connected components is out** - the union-find approach used since
  Session 11 cannot express "one topic".
- **Sim 2 validated center-based "leader" clustering** (the model keyword tools
  use; also the pillar/spoke model): every member matches the cluster's **seed**
  directly, so chaining is impossible by construction. Result: 336 coherent
  clusters, max size 32 (a real family - "skills in demand in {country}" ×32),
  zero mega-clusters.

### 17E. The new algorithm (lib/cluster.ts, pure + unit-tested)

1. **Topic keys** per live page: distinctive unigrams + **bigrams** from title +
   H1 + the slug's **last path segment only** (section prefixes like `/category/`
   polluted keys in sim 2), filtered by corpus DF < `CONFLICT_TOPIC_DF_CAP`
   (0.05). 100% of live pages keep ≥1 distinctive token (measured).
2. **Seeds in pillar-priority order**: category → subcategory →
   excellence-program/services → course → blog. Deterministic (URL tiebreak).
3. **Leader assignment**: each page joins the best-scoring qualifying seed by
   IDF-weighted distinctive-token Jaccard ≥ `CONFLICT_TOPIC_OVERLAP` (0.18,
   calibrated live - §17J), bigrams weighted above unigrams; else it becomes a
   new seed. Membership is always page↔seed, never page↔page.
4. **Body floor vs seed** (`CONFLICT_TOPIC_BODY_FLOOR`, 0.70) - members failing
   it fall back to singletons.
5. Clusters = seeds with ≥2 members. Singletons are unique-topic pages - an
   answer, not a gap; the UI meta line reads "N of 2,458 clustered · M unique".

**Acceptance tests (definition of done, encode the user's exact examples):**
big-data cat ↔ sales cat → different; big-data cat ↔ data-analytics cat →
different; big-data cat ↔ big-data blog → same; big-data cat ↔ big-data courses
→ same.

New env knobs in `lib/thresholds.ts` (replacing the six removed
`groupSimilarity`/`groupSimCourse`/`groupSimCourseTitle`/`groupTitleJaccardCourse`/
`groupSupportJaccard`/`groupBodySelfSufficient` + `groupTopK`): `CONFLICT_TOPIC_DF_CAP`
(0.05), `CONFLICT_TOPIC_OVERLAP` (0.18, calibrated live), `CONFLICT_TOPIC_BODY_FLOOR`
(0.70). `evaluatePair`/`shouldGroupPair`/`connectedComponents` and their tests
removed. NOTE - the plan said remove all six group knobs, but `decidePair` (the
Conflict Checker course gate, explicitly out of scope) still uses
`groupSimCourse`/`groupSimCourseTitle`/`groupTitleJaccardCourse`, so those three
were KEPT; only the four group-edge-only knobs were removed.

### 17F. Research: industry practice mapped to our data

1. **Two-method consensus**: embedding clustering is for *discovery & scale*;
   **SERP/query-overlap is the gold standard for merge/URL/cannibalization
   decisions** (it reflects what Google serves). The industry cannibalization
   signal is the GSC query-page pair (one query ranked by 2+ of your pages).
2. **Checked against our DB**: that pipeline exists (`gsc_metrics` + gsc-snapshot
   cron + `lib/gsc-insights.ts`) but the **table has 0 rows** - GSC isn't
   snapshotted in this deployment. Query-overlap edges are the *upgrade path*,
   not day-one logic. (Also: `/search-console` insights currently run on empty
   data - ops note.)
3. **Topic-token clustering (this plan's core)** is the "distinctive-terms"
   flavor of semantic clustering; intent-blindness is mitigated by our per-page
   intent labels, template-noise by corpus-DF filtering (validated above).
4. **Hub-and-spoke (pillar/cluster) model** maps perfectly onto our cross-type
   clusters - the category page is the natural pillar; courses/blogs are spokes.
   Added as a `pillar` cluster action.

Sources: ContentGecko (semantic vs SERP), SERPs.io, Semrush, ThatWare,
AdvancedGSC, Search Engine Land, HubSpot, OnCrawl.

### 17G. Scope shipped this session

- **Clusters engine + `/api/groups`**: ANN top-k lateral join removed; candidate
  generation is a token inverted index + one batched cosine query; route returns
  topic label + shared tokens + `matchSim`, no `reason` field.
- **Shared template-noise fix into the Conflict Checker** (17E's DF-distinctive
  filter applied to `lib/signals.ts` title/slug signals - one shared DF index).
  Wired into `lib/conflict.ts`: a **global** corpus DF index (cached per
  serverless instance, 10-min TTL, one read-only query, falls back to raw tokens
  if <50 pages) feeds `signalScores`. It MUST be global, not the candidate set -
  topic words are common *among* the vector-search matches, so a candidate-set DF
  would filter the very topic tokens we want to keep. `decidePair`'s code is
  untouched; only its signal *inputs* are denoised.
- **`pillar` group action** (`groupAction` + `ACTION_STYLE`): category+courses+blog
  families suggest "Pillar + spokes - link spokes to the pillar" rather than
  merge/differentiate. Merge still fires for same-type near-duplicates.
- **Conflict Checker UX**: Min score resets to 80 per run; AbortController on
  double-submit; 429 `retryAfterSec` surfaced (closes §16D rate-limit UX);
  needs-review rows muted vs LLM-verified; per-match intent tooltip; plain
  parse-error copy.
- **Sidebar**: Bulk Check → Additional Tools; Score History commented out (page
  reachable by URL, dashboard links intact).
- **Ingest/redirect durability (17H)**.

### 17H. Ingest silently destroyed redirect marks (corpus-audit finding, fixed)

`scripts/ingest.ts`'s `fetchAndExtract` follows redirects, so re-crawling a 301'd
page stored the *target's* content under the stale URL, and the upsert's
`canonical_url = EXCLUDED.canonical_url` overwrote detect-redirects' mark. One
`npm run ingest` after a redirect scan → stale pages resurfaced in Clusters as
byte-identical duplicates. Fix: compare the fetch's final URL to `entry.url`; if
they differ, mark `is_stale/canonical_url/stale_reason='redirect (ingest)'` and
skip storing target content under the old URL (`lib/extract.ts` now exposes the
final URL). `detect-redirects` also gained a **healing branch** (a
previously-stale page that probes 200 again clears its marks) and **404/410
flagging** (dead pages were never marked stale before).

### 17L. Content Clusters - issue fixes + filter/UI rework

Acting on the blunt review of the Clusters page, fixed the substantive issues
(no clustering-logic change - the topic engine is unchanged):

- **Winner contradicted the pillar action.** For a `pillar` cluster the ★ winner
  could be a deep course while the badge said "link spokes to the pillar" -
  pointing at different pages. Winner is now forced to the seed for pillar
  clusters (`app/api/groups/route.ts`); authority-based pick still runs for
  merge/consolidate/differentiate.
- **"Merge -> 301" on large series was harmful advice (§17L guard).** The
  skills-in-demand-in-{country} ×27 and {role}-roles ×13 families were tagged
  "Merge -> 301" because the action still keyed off template-inflated body
  cosine. Added a size gate in `groupAction`: a same-type family larger than
  `CONFLICT_GROUP_MERGE_MAX_SIZE` (default 4) gets `differentiate`, not merge -
  you don't 301 twenty-seven distinct pages into one. Live result: 0 same-type
  clusters >4 still suggest merge; remaining merges are all size 2-4.
- **Ugly listicle labels.** `topicLabel` now drops pure numerals + a small
  DISPLAY-ONLY filler set ("top/most/best/…") and dedupes overlapping bigrams:
  "top 11 · 11 demand · demand denmark" -> "demand denmark". Matching is
  untouched (topicOverlap never used the label), so no recalibration.
- **Type filter lied.** It keyed off the winner's type, so a big-data cluster
  (winner = category) was invisible under the "course" filter. Now a cluster
  matches a type if ANY member has it; the pill counts jumped accordingly
  (category 2 -> 27, course 169 -> 207) and are correct.
- **`matchSim` "26% topic" was meaningless.** Member rows now lead with the
  intuitive body-cosine "N% match" (content similarity to the pillar); the
  abstract IDF topic-overlap moved to the tooltip.
- **Singletons were a dead-end stat.** The route now returns a capped (500)
  browsable list of unique-topic pages; the page renders them in a collapsible,
  searchable section instead of just printing "1,548".
- **Full scan on every visit.** `/api/groups` gained a per-instance response
  cache (5-min TTL, keyed by overlap|minSize|limit); repeat loads dropped from
  ~6.5s to ~0.1s. The Rescan button passes `?fresh=1` to bypass it.
- **Search intent** is hidden by default behind a "show intent" checkbox
  (clusters are about topic, not intent).
- Filter bar reworked into labeled Action / Type rows + a controls row (show
  intent, clear-filters, search) in a bordered panel.
- Fixed a stray NUL byte in `route.ts` (a bad separator char that made the file
  read as binary to tooling).

New knob in `lib/thresholds.ts`: `CONFLICT_GROUP_MERGE_MAX_SIZE` (4). All
verified against the live corpus (read-only) + browser; 64/64 tests, build clean.

### 17M. Cluster labels fixed (member-common) + wider coverage

Two follow-ups after the UI rework:

- **Labels were seed-derived, so a seed-only token dominated.** The
  "skills in demand in {country}" ×51 series was labeled "demand denmark" - the
  seed's country - even though the 51 members span 51 different countries. Fixed:
  the cluster label is now built from the tokens MEMBERS SHARE (`clusterLabel`
  tallies each member's shared-with-seed terms, keeps those above a frequency
  floor of `max(2, ⌈size×0.3⌉)`, ranks by frequency, then drops filler/numerals
  and dedupes via `labelFromTerms`). A seed-only country never reaches the floor,
  so "demand denmark" -> "demand". Also dropped redundant subset terms
  ("companies · companies japan" -> "companies japan"). Country names now appear
  only on genuinely country-focused small clusters where ≥2 members share them.
  Display-only - matching is unchanged.
- **More clusters (loosened, measured).** With the §17K bigram fix the live
  overlaps re-measured to true pair 0.274 / hardest false sibling (data-analytics)
  0.103, leaving headroom below the old 0.18 bar. Lowered
  `CONFLICT_TOPIC_OVERLAP` 0.18 -> **0.16** (still 0.057 above the false sibling;
  all four acceptance checks still pass, big-data stays separate from
  data-analytics and sales) and `CONFLICT_TOPIC_BODY_FLOOR` 0.70 -> **0.65**
  (diminishing returns below 0.65 when swept). Combined live result: **260 -> 282
  clusters, 910 -> 1,050 clustered pages** (1,548 -> 1,408 singletons), no
  mega-cluster (largest is the 51-page single-topic "demand" blog series).
  `/api/groups` gained `?overlap` / `?floor` / `?minSize` params for tuning.

New: `labelFromTerms` + `clusterLabel`; knobs retuned in `lib/thresholds.ts`.
65/65 tests, verified live (read-only) + browser.

### 17N. Programmatic blog-series grouping (lib/series.ts)

Edstellar publishes template-generated blog families that topic-token clustering
FRAGMENTS, because it weights each page's distinguishing token (country /
role-type / industry - unique per page, very high IDF) over the shared series
token. Measured from the sitemap/`blogs.json` + tested against the live output:

| Series | Blogs | Was (topic clustering) |
|--------|-------|------------------------|
| Training Companies | 60 | 14 sub-clusters + 26 loose |
| Roles & Responsibilities | 48 | 8 sub-clusters (officer/manager/engineer…) |
| In-Demand Skills | 54 | ~1 (+3 loose) |
| Games & Exercises | 13 | ~1 |
| Digital Transformation | 6 | partial |
| Work Culture | 6 | **0 - all singletons** |

The `category` tag can't group them (each spans up to 6 categories); the
reliable identifier is the slug TEMPLATE. `lib/series.ts` matches those
templates (6 patterns covering the 7 named families - "providers" folds into
Training Companies, "employee activities" into Games & Exercises) against the
`/blog/<slug>` segment only.

`clusterByTopic` gained an opt-in `series` option: matching pages are pulled OUT
of topic clustering and grouped into one cluster per series (membership
OVERRIDES topic - the "big-data-training-companies" blog is a Training Companies
listicle, so it leaves the big-data pillar). Series clusters skip the body floor
(membership is deterministic), are always `differentiate` (intentional
variants - never merge/301 a series), and label = the series name. The route
passes `SERIES`; the pure unit tests leave it off (topic-only acceptance
unchanged). The UI shows a `series` badge and hides the per-member match% (it's
pattern-based, not similarity).

Live result: the 6 series each collapse to ONE cluster (60/54/48/13/6/6);
overall 1,050 -> **1,093 clustered pages** across 268 clusters, and Work Culture
went from 6 singletons to a real cluster. `lib/series.ts` + `series.test.ts`
(70/70 tests), build clean.

### 17O. GSC wired into Content Clusters (per-page metrics + top queries)

Each clustered page now carries Google Search Console data behind a "show GSC"
toggle: **last 1/3/6 FULL calendar months** clicks / impressions / position, plus
its **top-5 queries**. (Earlier notes said GSC was "0 rows / not connected" - that
was stale: 3 `gsc_connections` exist and per-page 28d data was already syncing;
`gsc_metrics` was just never populated.)

Architecture - **pre-store, not live** (2,458 members would blow GSC quota on
page load):
- `lib/gsc.resolveFullMonths(n)` - completed-calendar-month windows (excludes the
  partial current month; UTC).
- `lib/gsc-metrics.snapshotGscMetrics()` - a handful of BULK GSC calls: 3
  `["page"]` calls (1m/3m/6m) for per-page totals + a paginated `["page","query"]`
  call grouped to top-5 per page. Full-refresh upsert into `gsc_metrics`
  (`range_label` = `1m|3m|6m|q`). Runs as **Job 4 of the daily gsc-snapshot cron**
  (isolated in try/catch so it can't break the existing snapshot) and via
  `npm run gsc-metrics` for a manual refresh. Live populate: **19,644 page rows +
  6,374 query rows**.
- `lib/gsc-cluster-metrics.fetchGscForUrls(urls)` - one batched
  `WHERE page = ANY($1)` read; degrades to an empty map if the table isn't
  populated. `/api/groups` attaches a `gsc` object per member (covered by the
  route's 5-min cache).
- UI: a compact per-member block (1m/3m/6m clicks·impr·pos, "n/a" for empty
  windows, top-query chips) behind the "show GSC" checkbox (off by default, like
  "show intent"). Index: `drizzle/0008_gsc_metrics_page_idx.sql` (also created
  idempotently by the snapshot).

Verified live (read-only + browser): 1,089 of 1,093 clustered members have data;
e.g. skills-in-demand-in-finland = 1m 648 / 3m 2,077 / 6m 3,183 clicks, top
queries finland / финляндия / finlande / … The 4 without data are zero-impression
pages (real, not a bug). Needs `GSC_SITE_URL` set (it's in Vercel prod env; pass
it inline for a local run). 73/73 tests, build clean.

### 17P. Editable blog-series exclusion list + Settings page

New **Settings** page (`/settings`, under Additional Tools) to manage blog series
excluded from the ANALYSIS features - **Content Clusters + Conflict Checker
matches** - while keeping them in the corpus/**Edstellar Database** and in **GSC**
(user's chosen scope: analysis-only, keep ingesting).

- **`excluded_series` table** (`drizzle/0009`): `name`, `patterns` (slug
  substrings, text[]), `enabled`. Seeded with the two the user asked for:
  **In-Demand Skills** (`skills-in-demand-in-`, `in-demand-skills`,
  `most-in-demand`) and **Corporate Training Companies in [Country]**
  (`corporate-training-companies-`). The country pattern is specific - it
  excludes the 41 country listicles but NOT the other 19 `-training-companies`
  blogs (big-data, AI, web-development, …).
- **`lib/exclusions.ts`**: `getExclusionPatterns()` (enabled patterns, cached
  60s, empty on any error) + `isExcludedUrl(url, patterns)` (case-insensitive
  substring). Unit-tested.
- **`/api/settings/exclusions`**: GET/POST/PATCH/DELETE CRUD; every write drops
  the pattern cache. The Settings page adds / edits / toggles / deletes series.
- **Applied** in `/api/groups` (filter pages before clustering; exclusions are
  part of the cache key) and `lib/conflict.ts` (filter vector-search matches).
  NOT in `lib/gsc*`, `/api/pages` (corpus), or ingest.

Live-verified: seeding + the two series drop the analysis corpus 2,458 → 2,363
(~95 pages), 0 excluded pages leak into any cluster, Settings page renders the
two rows editable. 76/76 tests, build clean.

### 17Q. Exclusions v2 (keyword queries + full URLs) + GSC panel layout

**Already DONE (§17O + §17P):**
- Per-member GSC panel in Content Clusters: 1m/3m/6m full-month totals + top
  queries, populated by `lib/gsc-metrics.snapshotGscMetrics` into `gsc_metrics`,
  read by `lib/gsc-cluster-metrics.fetchGscForUrls`, rendered as two stacked
  tables (`GscBlock`), behind a "show GSC" toggle.
- Editable blog-series exclusion (`excluded_series` table, `/settings` CRUD,
  `lib/exclusions.ts`), applied to Content Clusters + Conflict Checker matches
  (not corpus/GSC/ingest). Seeded with In-Demand Skills + Corporate Training
  Companies in [Country].

**DONE (this pass) - all six, verified live + build clean:**
1. **GSC tables side by side.** `GscBlock` is now a `flex` row (period metrics
   fixed-~300px, top queries flex-1; wraps to stacked on narrow), tighter type.
   16 side-by-side blocks confirmed in the browser.
2. **Top queries = last FULL month.** `snapshotGscMetrics` TOPQ 3 → 1; re-ran
   `npm run gsc-metrics` (19,644 page rows + 6,902 query rows). Table header
   reads "Top queries · last month".
3. **Keyword-query exclusion.** `type` column (`drizzle/0010`), `getExclusions()`
   returns `{url, query}`, `isExcludedQuery()`; query patterns filter the GSC
   top-queries in `fetchGscForUrls` (part of the `/api/groups` cache key).
   Settings has a second "Excluded keyword queries" section. Verified: adding
   "can you provide" removed it from all 840 top-query entries.
4. **Full-URL inputs.** Matcher handles a pasted full URL (substring of itself);
   UI hint says "slug substring or full URL". Regression-tested.
5. **Excluded-URLs viewer.** `/api/settings/exclusions/matches` (paginated)
   returns the actual `pages.url`s; Settings shows "95 corpus pages" with the
   full URLs.
6. **Pagination.** Content Clusters list (25/page, `Pagination.tsx`) + the
   excluded-URLs viewer (25/page). Both verified.

Files touched as planned: `drizzle/0010_excluded_series_type.sql`,
`lib/db/schema.ts`, `lib/exclusions.ts` (+test), `lib/gsc-metrics.ts`,
`lib/gsc-cluster-metrics.ts`, `app/api/settings/exclusions/route.ts` + new
`.../matches/route.ts`, `app/(dashboard)/settings/page.tsx`,
`app/(dashboard)/clusters/page.tsx`, `app/api/groups/route.ts`. 78/78 tests.

### 17R. Settings promoted + project settings (cluster tuning, GSC refresh)

- **Settings → top-level nav** (out of Additional Tools).
- **Leadership Training Companies [Country]** added to the URL exclusions
  (pattern `leadership-training-companies-`, 3 pages); also added to the
  `drizzle/0009` seed. Excluded-URL total is now 98.
- **`app_settings` key-value table** (`drizzle/0011`, `lib/app-settings.ts`) for
  editable project knobs, read with fallback to `lib/thresholds.ts` defaults.
  - **Content Clusters tuning** card: `topic overlap` / `body floor` /
    `merge max size`. `/api/settings/app` (GET/PATCH); `/api/groups` resolves
    these (query params still override) and they're part of the route cache key.
    Verified end-to-end: overlap 0.16 → 265 clusters, 0.30 → 156.
  - **Search Console data** card: shows `gsc_metrics` last-refreshed and a
    "Refresh now" button → `POST /api/settings/gsc-refresh` runs
    `snapshotGscMetrics` (GET returns the timestamp).

Build + typecheck clean; APIs + cluster-tuning effect verified live. (The dev
preview tab hung during the browser check - a tooling issue; SSR HTML + the API
checks confirm the pages render.)

### 17S. Per-URL exclusion exceptions (allow-list)

The "Currently excluded URLs" viewer now has a **Remove** button per page: it
adds the URL to an **exceptions** allow-list so that one page is re-included in
Content Clusters + Conflict Checker even though it still matches an exclusion
pattern (the rest of the series stays excluded). Reversible via a "Manually
re-included pages" section ("Exclude again").

- Stored as a single `type='exception'` row in `excluded_series`;
  `getExclusions()` returns `{url, query, exception}`.
- `isExcludedUrl(url, patterns, exceptions)` = matches a pattern AND not on the
  allow-list. Wired into `/api/groups` + `lib/conflict.ts` (part of the cache key).
- `/api/settings/exclusions/exception` POST/DELETE (append/remove a URL);
  `.../matches` filters out exceptions and returns them for the undo list.
- Verified live: Remove drops the excluded count 98 → 97, "Exclude again" restores
  it. 79/79 tests, build clean.

### 17T. Sidebar reorder, contextual cluster filters, sitemap sync

- **Search Console moved directly below Edstellar Database** in the sidebar
  (rendered inline after the `/corpus` item via a `Fragment`).
- **Content Clusters filter pills are now contextual**: each action/type pill
  counts against the OTHER active filters (+ search), and pills that would yield
  0 are hidden. Fixes "a filter shows when there's no data under it" - e.g. with
  the Category type selected, Consolidate/Differentiate (0 category clusters)
  disappear and the counts drop to the category-only totals.
- **Sitemap sync in Settings**: `/api/settings/sitemap-sync` GET previews how
  many live-sitemap URLs are missing from `pages` (by type); POST inserts them
  with their derived `content_type`/course_type/category/subcategory (type only,
  no content/embedding - they enter Clusters/Checker on the next `npm run
  ingest`). Reuses `lib/sitemap-live.fetchSitemapUrls` (extracted from
  `/api/sitemap-drift`) + `tagUrl`. Verified live: 1 missing blog found + added,
  re-check 0. 79/79 tests, build clean.

### 17I. Deferred (tracked, not this pass)

- **GSC query-overlap edges - the gold-standard upgrade** (17F #1–2): once
  `gsc_metrics` is populated, add "ranks for the same queries" as a cluster edge
  + checker evidence (stored data only - no live GSC fetch, respecting the
  Session 11 removal). Blocked today: 0 rows.
- Cluster export / redirect-map CSV, accept-dismiss-snooze state, outcome-loop
  integration (§16D top gap - needs its own plan).
- Verdict banner on high scores; bulk "Analyze all" for needs-review rows;
  copy-all-301s. `LLM_KILL_SWITCH` graceful degrade for the checker (summarize is
  a hard prerequisite today). Persisted cluster snapshots (trend-over-time +
  faster loads vs today's live scan per visit). Cluster winner still ignores
  traffic/inbound at corpus scale.

### 17J. Live verification (read-only, against the 2,458-page prod corpus)

Ran a **read-only** SELECT-only cluster check over the live DB (no writes, no
`runConflictCheck`, no ingest). Findings that changed the calibration:

- **Measured weighted overlaps** (bigramWeight=2): big-data-cat↔sales = **0.000**,
  big-data↔data-analytics = **0.046** (hardest false sibling), big-data-cat↔
  big-data-blog = **0.257** (the true pair). Higher bigram weights (3, 4) *lowered*
  the true pair (0.248, 0.243) - non-shared bigrams inflate the union too - so
  weight 2 was kept.
- The plan's exploratory 0.35 was **too high** - it missed the true 0.257 pair.
  Retuned `CONFLICT_TOPIC_OVERLAP` to **0.18** (margin 0.077 below the true pair
  for recall, 0.134 above the hardest false sibling for precision). Swept
  0.15/0.18/0.20 on the full corpus: all four acceptance checks pass at every
  value; 0.18 chosen as the balance.
- **Acceptance at 0.18** (all pass): big-data ≠ sales; big-data ≠ data-analytics;
  big-data category + big-data blog + big-data courses in ONE cluster (label
  "big data", seed = the category pillar); coverage clustered + singletons =
  2,458.
- **No mega-cluster**: 356 clusters, 1,420 clustered / 1,038 unique-topic
  singletons; largest cluster = 44 members and is a genuinely coherent single-
  topic family (blog series "skills in demand in {country}", all one type) - the
  real content family the old body-similarity hairball buried, not a mixed-topic
  blob.

The verification script (`scripts/local-verify-clusters.ts`) is gitignored
(`scripts/local-*`), not committed. `LLM_KILL_SWITCH`/ingest paths were NOT run
(they write to the shared prod DB) - the ingest/redirect fixes (§17H) still need
a Neon-branch round-trip to verify end-to-end.

### 17K. Bigram label pollution fix (template words leaking into topic labels)

A cluster on one topic showed the label "chemical safety · safety corporate ·
corporate chemical" - reading like THREE topics when it's one (chemical safety).
Cause: the bigram DF filter kept bigrams like "safety corporate" / "corporate
chemical" because the *bigram* is rare (distinctive by bigram-DF), even though
"corporate" is a template unigram (82%+ DF). The pollution hit only the label,
but it also added noise to the overlap score.

Fix (`topicKey`, one rule): **a bigram survives only if BOTH its words are
distinctive unigrams** (not just the bigram itself). "chemical safety" (both
topic) stays; "safety corporate" (template word) drops. Measured effect on the
live corpus - strictly better:

- Labels are clean: the big-data cluster label went from "corporate big · big
  data · data training" → **"big data"**.
- Clustering got *tighter and more accurate*: removing template bigrams let the
  genuine "big data" signal dominate, so the big-data cluster grew 3 → **8**
  members (category + 6 big-data courses + the blog) - every member genuinely
  about big data, no drift.
- Overlaps re-measured: true pair big-data↔big-data-blog = 0.274, hardest false
  sibling big-data↔data-analytics = 0.103 - 0.18 still sits between with margin;
  no threshold change needed. All four acceptance checks still pass; overall
  fewer, more precise clusters (280 topic-only / 339 via the body-floor route).
- Regression-tested (`signals.test.ts`): a "Corporate Chemical Safety" page
  keys to bigrams `["chemical safety"]` only, label `"chemical safety"`.

---

## 18. Keyword Cannibalization - promoted to a top-level tool + 4-tab upgrade (PLAN)

**Ask:** pull the Cannibalization view OUT of Search Console, make it a
top-level sidebar item **directly below Search Console** named **"Keyword
Cannibalization"**, then do the upgrade previously proposed (severity /
primary-page / recommended action / action links / exclusions / export). The new
tool has **4 sub-tabs**:

| # | Tab | What it answers | Source |
|---|-----|-----------------|--------|
| 1 | **Conflict keywords · nearer avg position** | Queries where 2+ of our pages rank AND their avg positions are CLOSE (both fighting for the same rank) - the true, active cannibalization Google is actively swapping. High-confidence, action-now set. | Live GSC `["query","page"]` + position-gap filter |
| 2 | **Conflict keywords · no avg-pos limit** | Every query where 2+ pages rank, regardless of how far apart - the full landscape (superset of Tab 1). | Same GSC pull, no position filter |
| 3 | **Pages/keywords conflicting with a course or other page** | Cross-type conflicts: a query where the competing pages span DIFFERENT content types (blog vs course, category vs course...) - the strategic/revenue conflict (a blog stealing a course page's term). | Same GSC pull + join page URLs → `pages.content_type` |
| 4 | **Same content/intent blogs to merge** | Near-duplicate blogs (same body/intent) that should be consolidated into one and 301'd - NOT keyword-based, content-based. | Existing topic + body-cosine cluster engine, filtered to blog clusters with `merge`/`consolidate` action |

### 18A. Current state (what exists today)
- Cannibalization is computed **live** in `lib/gsc-insights.buildInsights()` from a
  single `["query","page"]` GSC call (rowLimit 2000), returned as
  `Insights.cannibalization` and rendered by `CannibalTab` - a sub-tab of
  `/search-console` (`TABS[1]`, slug `cannibalization`). Grouping = query →
  pages[], filtered `pages.length >= 2 && totalImpressions >= 50`.
- `gsc_metrics` stores only **top-5 queries per page** (`snapshotGscMetrics`), too
  sparse to detect cannibalization reliably (misses a query where page B ranks
  #7 but it's not in B's top-5). So the new tool keeps the **live** `["query",
  "page"]` pull as its GSC source - one narrow call, not the 7-call `buildInsights`
  bundle. (`page.length >= 2` groups still come straight from GSC; no dependency
  on the sparse snapshot.)

### 18B. Execution plan

**1. Move + rename (routing).**
- Remove `Cannibalization` from `search-console` `TABS`/`TAB_SLUGS`/`SLUG_TO_TAB`
  and delete `CannibalTab` from that page (leave `buildInsights.cannibalization`
  computed - harmless, still used by the checker's `pageCannibalization`; but the
  SC UI no longer renders it).
- New route `app/(dashboard)/keyword-cannibalization/page.tsx`.
- `Sidebar.tsx`: add **Keyword Cannibalization** in the main NAV **immediately
  after the Search Console block** (before Conflict Checker). Its 4 sub-tabs are
  URL-driven (`?tab=<slug>`) same pattern as SC sections, optionally surfaced as
  sidebar sub-links.

**2. Data layer - new `lib/cannibalization.ts` (pure-ish, unit-tested where possible).**
- `buildKeywordConflicts(range, opts)`:
  1. One GSC `["query","page"]` call (reuse `runQuery`/`getAuthorizedClient`
     from `lib/gsc`), rowLimit ~5000.
  2. Group by query → `pages[]` (query, per-page clicks/impr/position/ctr).
  3. Keep groups with `pages.length >= 2` and `totalImpressions >= cannibalMinImpr`.
  4. Apply **query exclusions** (`isExcludedQuery`) and **URL exclusions**
     (`isExcludedUrl`) so excluded keywords/pages don't show (consistent with
     Clusters/Checker).
  5. Enrich each group:
     - **severity** = f(totalImpressions, position-proximity of top-2 pages,
       #pages) → `high | medium | low` badge. (Impressions-weighted; a tight
       position gap on a high-impression query = high.)
     - **primary page** = the page that *should* win (best position, tie-break
       clicks then impressions). Others flagged as **cannibals**.
     - **recommended action** - rule-based:
       - same-type near-duplicate → **consolidate / 301 losers → primary**;
       - cross-type (course present) → **protect the commercial page**
         (course > category > blog priority): de-optimise/blog-link the lower-value
         page to the course, don't 301 across types;
       - far-apart positions, same intent → **differentiate**.
     - **action links** - deep-link the group's pages into the Conflict Checker
       (`/?url=`) and Content Clusters, plus open-in-GSC.
  6. Return `{ near, all, crossType }` derived views from the one enriched set:
     - `all` = every qualifying group (**Tab 2**).
     - `near` = `all` filtered to `positionGap(top2) <= cannibalNearPosGap` AND
       `bestPosition <= cannibalMaxPos` (**Tab 1**).
     - `crossType` = `all` filtered to groups whose pages span ≥2 distinct
       `content_type`s (needs the page→type join) (**Tab 3**). One
       `SELECT url, content_type FROM pages WHERE url = ANY($1::text[])` (raw
       neon `$1::text[]`, per the drizzle-array gotcha) maps GSC page URLs → type.
- **Tab 4** = reuse the cluster engine. New `lib/cannibalization.mergeBlogs()` (or
  a param on the groups path) that runs the existing topic+body-cosine clustering
  and returns clusters where **every member is a blog** and `groupAction` ∈
  `{merge, consolidate}` - i.e. dedupe candidates - with the winner (canonical) +
  losers-to-301 + body-cosine + per-page GSC clicks (to justify the winner).
  Prefer calling the existing `/api/groups` logic rather than re-implementing.

**3. Thresholds - add to `lib/thresholds.ts` (env-overridable, per the rule "every
cutoff lives here"):**
- `cannibalMinImpr` (default 50) - `CONFLICT_CANNIBAL_MIN_IMPR`
- `cannibalNearPosGap` (default 5.0) - `CONFLICT_CANNIBAL_NEAR_GAP`
- `cannibalMaxPos` (default 20.0) - `CONFLICT_CANNIBAL_MAX_POS`
No hard-coded cutoffs in the route/UI.

**4. API - `app/api/cannibalization/route.ts` (GET).**
- `?range=` (default 28d), `?tab=` optional (compute-only what's needed).
- Auth: dashboard session (same as other SC-derived pages); it's a live GSC read.
- Per-instance cache (5 min, keyed by range + exclusions hash) like `/api/groups`,
  `?fresh=1` to bust - GSC calls are the expensive part.
- Tab 4 served from the groups/cluster path (already cached).

**5. UI - `keyword-cannibalization/page.tsx`.**
- 4 sub-tabs (`?tab=near-position|all-keywords|cross-type|merge-blogs`), Suspense
  for `useSearchParams`.
- Per group: query, severity badge, primary-page highlighted (star / "keep"),
  cannibal rows dimmed with per-page clicks/impr/position, recommended-action
  chip, action links. Cross-type tab shows `TYPE_COLORS` badges. Merge tab shows
  winner vs 301-losers + body-cosine %.
- Range selector, keyword-exclusion respected, **CSV export per tab**,
  pagination (reuse `Pagination.tsx`), empty states, contextual (hide a tab's
  filter chrome when it has no rows).

**6. Docs/counts.** Update `Sidebar` nav count, `help-content.ts`, README nav
list, and this log's DONE note in the same commit (doc-drift rule).

### 18C. Deviations / open interpretation (confirm before build)
- Tab 1 vs Tab 2 read as **filtered vs unfiltered by position proximity** (Tab 1 ⊂
  Tab 2). Tab 3 = **cross-content-type** conflicts. Tab 4 = **content-similarity
  blog merges** (cluster engine, not GSC). If any of these four readings is off,
  correct it before I build - the GSC pull + cluster reuse are shared, so a
  wrong tab definition is cheap to change now, expensive after.
- Data source stays **live GSC** for Tabs 1-3 (accurate positions; the stored
  snapshot is too sparse). Trade-off: ~1 GSC call per load, mitigated by the
  5-min cache. If you'd rather it be instant/stored, say so and I'll widen
  `snapshotGscMetrics` to store full `["query","page"]` instead of top-5.

### 18D. DONE (stored-in-DB variant + SEO review) - shipped, live-verified

**Decision taken:** user chose **stored-in-DB** over live-per-load, and asked me
to check the logic "as an SEO manager". So Tabs 1-3 read a pre-computed table,
NOT a live GSC call.

- **New table `keyword_conflicts`** (`drizzle/0012`, `lib/db/schema.ts`
  `keywordConflicts`): one row per conflicting query + a `pages` jsonb breakdown,
  plus `severity`, `primary_page`, `recommended_action`, `cross_type`, `branded`,
  `commercial_at_risk`, `position_gap`, `best_position`. Range `3m`.
- **`lib/cannibalization.ts`** (pure, 9 unit tests) - `buildConflicts()` groups
  GSC `["query","page"]` rows and classifies. **`lib/cannibalization-snapshot.ts`**
  - `snapshotKeywordConflicts()`: one paginated GSC pull (3 full months) + a
  `pages`→`content_type` join, full-refresh bulk upsert. **`scripts/cannibalization.ts`**
  → `npm run cannibalization`. Wired as **Job 5** of the gsc-snapshot cron
  (isolated try/catch - no new cron, so the Hobby 2-cron cap is untouched).
- **`/api/cannibalization`** (GET) reads the table; branded queries hidden;
  query + URL + exception exclusions applied at READ time (edits reflect without a
  re-snapshot). Tabs derived client-side: near = `positionGap ≤ nearGap && bestPos
  ≤ maxPos`, cross-type = `crossType`. **Tab 4 (merge-blogs)** reuses `/api/groups`
  (blog-only clusters with a merge/consolidate action). New knobs in
  `lib/thresholds.ts`: `cannibalMinImpr` (50) / `cannibalMinPageImpr` (5) /
  `cannibalNearGap` (5) / `cannibalMaxPos` (20), env-overridable `CONFLICT_CANNIBAL_*`.
- **UI** `app/(dashboard)/keyword-cannibalization` - 4 sub-tabs (`?tab=`), severity
  badges, primary-page star, rule-based action chip (with the SEO play in the
  tooltip), per-tab CSV export, pagination, Rescan. **Sidebar**: new "Keyword
  Cannibalization" item directly below the Search Console block; the old
  Cannibalization SC sub-tab + `CannibalTab` were removed. **Settings**: a
  "Keyword Cannibalization data" card (last computed + group count + Rescan).

**SEO-manager review on the live 724-group result - one real bug fixed:**
- **Brand-navigational SERPs were masquerading as cannibalization.** Top
  "conflicts" `ed stellar` / `edsteller` (misspellings of the brand) had 8
  static/nav pages all ranking ~#1 - that's a brand SERP with sitelinks, not
  content competing. `isBrandedQuery` only did a literal substring match on
  "edstellar" so spaced/misspelled variants leaked. Fixed: normalize away
  spaces/punctuation + edit-distance ≤2 fuzzy match (catches "ed stellar",
  "edsteller", "edstella", "www.edstellar.com") without flagging long
  informational queries. Re-ran: those flip to `branded=true` (hidden), while the
  genuine catch **`ai training companies`** (a blog at pos 6 / 8.9k impr
  outranking the AI category page at pos 71 - a commercial-intent query the money
  page should own) correctly stays and is flagged `commercial_at_risk` → high →
  "Protect the money page".
- **Kept by design:** static/nav pages can still appear as competitors on
  non-brand queries (rare after the brand fix); `minPageImpr=5` lets a barely-
  ranking commercial page count as "at risk" (that IS the signal, per the AI
  example). **Known cap:** the GSC pull is truncated at 100k query×page rows
  (`MAX_ROWS`); GSC returns them clicks-DESC so the highest-value conflicts are
  always covered, the tail is sub-impression noise that `minPageImpr` drops anyway.
- Live result after the fix: 724 groups (14 branded/hidden), 369 cross-type, 199
  commercial-at-risk; severity high/med/low = 200/153/371; actions
  differentiate 337 / protect-commercial 199 / consolidate 112 / monitor 76.
  `keyword_conflicts` populated via `npm run cannibalization` (GSC_SITE_URL passed
  inline; writes to the shared prod DB - additive new table). 87/87 tests, typecheck clean.
