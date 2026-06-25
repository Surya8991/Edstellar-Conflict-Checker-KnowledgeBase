# Edstellar Conflict Checker — Project Log

> Single source of truth for this project. Lists what's built, what's planned,
> and how the system fits together. Update this file with every meaningful
> change.

**Last updated:** 2026-06-25
**Owner:** marketing@edstellar.com
**Repo:** https://github.com/Layruss98266/Edstellar-Conflict-Checker-KnowledgeBase
**Prod:** https://edstellar-conflict-checker-knowledg.vercel.app/

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

The corpus = every URL in https://www.edstellar.com/sitemap.xml (2,479 URLs raw;
**~2,461 after the junk-URL filter** in `lib/sitemap.ts` drops tag archives,
`/sitemap`, paginated pages, and file downloads — see Session 4), crawled,
classified, and embedded into a Postgres `pgvector` index hosted on Neon.

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

### Session 4 — 2026-06-25 (going to production)

The session that took the app from "works on my laptop" to "live on
Vercel at edstellar-conflict-checker-knowledg.vercel.app, serving real
HTTP 200s with score 75 matches end-to-end". Organised by theme rather
than commit order — the actual SHA trail is in `git log` between
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
  — plain-English walkthrough for a first-time deployer covering: the
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
    jsdom, cheerio, googleapis]` — keeps native deps out of the webpack
    bundle so Node's `require` resolves them at runtime.
  - `outputFileTracingIncludes['/*']: [data/**, onnxruntime-node/bin/**,
    @xenova/transformers/**/*.json]` — ships the binaries + taxonomy
    JSON that @vercel/nft's static analyser can't trace (the
    `readFileSync(join(process.cwd(),"data",…))` reads have dynamic
    paths; the `.so` is loaded via dlopen).
  - Without this `/api/check` 500'd in prod with
    `libonnxruntime.so.1.14.0: cannot open shared object file`. Verified
    fixed via post-deploy curl.

**C. Data correctness — strip noise everywhere**
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
  offender — they re-list other posts' titles+snippets so they always
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
  full re-ingest of 2,461 URLs with the new extractor — 0 failures.

**D. GSC robustness — works with or without trailing slash**
- `fa66c39` `lib/gsc.ts` got two new exports:
  - `siteUrlCandidates(env)` derives up to 4 candidates: literal,
    trailing-slash flipped, `sc-domain:<host>`,
    `sc-domain:<host-without-www>`.
  - `resolveSiteUrl(client)` calls `webmasters.sites.list()`,
    intersects candidates with what the connected account is actually
    verified on (filters out `siteUnverifiedUser`), returns the first
    match. Module-level cache keyed on a token fingerprint so it probes
    only once per cold start. If nothing matches throws a useful error
    listing exactly which properties ARE accessible — saves the
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
  `Max health: 100 · 1000 of 1000 match` was confusing — looked broken
  at the slider's max value.
- `96d5925` Corpus / Home tile dropped — `lib/taxonomy.ts` `tagUrl()`
  for path `/` now returns `content_type='static'` keeping `home` as a
  tag. One-off `scripts/reclassify-home.ts` migrated the existing prod
  row from `home` → `static` (Static 107→108). Standalone 1-page tile
  gone.
- `c346a78` Branded metadata. Replaced default Next favicon + the 5
  unused demo SVGs (`file/globe/next/vercel/window.svg`) with
  programmatically-generated `app/icon.tsx` (32×32, gradient `CC` mark),
  `app/apple-icon.tsx` (180×180), `app/opengraph-image.tsx` (1200×630
  social card), `app/manifest.ts`, `app/robots.ts` (noindex — internal
  tool). `app/layout.tsx` metadata expanded: `metadataBase` from
  `APP_BASE_URL`, `title.template '%s · Edstellar Conflict Checker'`,
  `openGraph` + `twitter` + `viewport.themeColor`. All icons render at
  request time via `next/og's ImageResponse` — no binary assets shipped.
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
  called `chat.summarize()` (wrong primitive — it summarises, doesn't
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
  — Vercel truncated the auto-slug from the full repo name.
- End-to-end smoke test from prod:
  `POST /api/check` with `{input:"leadership skills for first-time
  managers"}` → HTTP 200, `topScore: 75`, real matches with summary +
  keywords + primaryQuery.
- Spot-check of 3 random blog rows in `pages.content_text` shows the
  new extractor working — some site-chrome leakage remains (`BLOG`
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
- `feat(dashboard)` — actionable home: attention banners (high-risk
  checks 7d / 4xx links / thin pages / GSC unconnected), 6 stat cards
  with color-by-signal, recent checks panel (last 8), top catalog
  conflicts panel (5 worst), all clickable. Same SQL roundtrip budget.
- `lib/country.ts` + GSC By-Country tables — country codes (`ind`,
  `usa`, `phl`) now display as full names ("India", "United States of
  America", "Philippines") via the `i18n-iso-countries` package.
  Falls back to uppercased code for unknown values.
- Edstellar-theme selector audit on `lib/extract.ts` — found the leaked
  fragments from Session 4 spot-check were emitted by `.blog-tag-block`
  ("BLOG" pill), `.update-date` (post meta line), `.bog-index-text`
  (ToC widget — theme typo on "blog"), `.share-wrapper` /
  `.share-articles-footer` / `.share-text`, `.authors-block` /
  `.blog-author-block` / `.blog-authors-footer`. Added an
  Edstellar-theme block to `NOISE_SELECTORS`. Verified against live
  /blog/it-manager-skills — six leak patterns all clean.

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

`.env` keys — full annotated set is in [`.env.example`](.env.example). Vercel
gets the same values in **Settings → Environment Variables**. Summary:

```
# DB (REQUIRED)
DATABASE_URL=postgresql://...                # Neon pooled

# AI providers
AI_EMBED_PROVIDER=local                      # local | openai
AI_CHAT_PROVIDER=groq                        # groq | claude | openai
GROQ_API_KEY= GROQ_MODEL=llama-3.3-70b-versatile
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

# App + ops (Session 4 — required in prod)
APP_BASE_URL=                                # https://<vercel-url> — used for absolute OG URLs,
                                             #   cron auth, OAuth redirect base
BRAND_TERMS=edstellar,edstellar.com          # comma-separated; used by GSC branded/non-branded split
CRON_SECRET=                                 # REQUIRED in prod — cron routes fail OPEN if unset.
                                             #   Vercel cron sends Authorization: Bearer <secret>
WEBHOOK_API_KEY=                             # optional X-API-Key gate on /api/check for CMS hooks
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
- **GSC `siteUrl` format matters — but `resolveSiteUrl()` handles it** (Session 4).
  Set `GSC_SITE_URL` to any plausible variant; the helper probes
  trailing-slash + `sc-domain:` + www/no-www against `webmasters.sites.list()`
  and picks the first match the account is verified on. If nothing matches
  the error message lists exactly which properties ARE accessible.
- **Local embedder dim = 384.** Switching to OpenAI = 1536. That's a schema
  change (new column, drop old) — documented in §5. Don't mix dimensions in
  one column.
- **`AGENTS.md` says "this Next.js has breaking changes"** — read
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
  `if (secret && header !== ...)` — no secret means anyone can trigger
  `/api/cron/reingest` and rack up DB + LLM cost. Always set in prod.
- **Vercel cron plan limits.** Hobby = 2 crons, daily-only, 60s timeout.
  Current `vercel.json` has 3 crons (two weekly) — needs Pro.

---

## 9. Improvement backlog (post-launch audit, 2026-06-25)

Captured for review — **nothing here is implemented yet**. Picked from a
three-lens audit (code quality, UX, SEO/marketing/content) plus 2026
reference research. Severity flags: 🔥 do-first · ⚙️ strategic · ✨ polish.

### 9A. Code quality + security

| # | Item | File / area | Sev |
|---|---|---|---|
| 1 | `/api/check` + `/api/check/bulk` auth is optional — anyone with the prod URL can burn LLM tokens. Require `WEBHOOK_API_KEY` OR add IP rate-limit. | `app/api/check/{route,bulk/route}.ts` | 🔥 |
| 2 | Audit-links cron does 1,500 sequential `UPDATE`s in a loop. Batch into one `UPDATE … WHERE id = ANY($1)`. | `app/api/cron/audit-links/route.ts` | 🔥 |
| 3 | GSC refresh tokens stored plaintext in `gsc_connections`. Use `pgcrypto.pgp_sym_encrypt` with a key from env. | `lib/gsc.ts:35-46` + migration | 🔥 |
| 4 | Zod is in `package.json` but `grep z\\.parse` returns 0 hits. One `safeParse` per route entry kills ~80% of mystery 500s. | every `route.ts` accepting a body | 🔥 |
| 5 | `as any` casts on `db.execute` returns hide schema-drift bugs. Use the Drizzle-typed return shape or explicit interfaces. | `lib/conflict.ts:184`, `lib/search.ts:41`, `app/api/pages/route.ts:67-71` | ⚙️ |
| 6 | LLM JSON output not validated. If a future model hallucinates an extra field or omits `conflictScore`, code NaNs silently. | `lib/ai/chat-claude.ts`, `chat-groq.ts`, `chat-openai.ts` | ⚙️ |
| 7 | No structured logs, no Sentry. `catch { /* swallow */ }` pattern in many routes — failures invisible until a user complains. | repo-wide | ⚙️ |
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
| 15 | Long calls (enrich, suggestions) have no "still working…" message after 5s — looks frozen. | `/conflict-checker` page L141-184 | 🔥 |
| 16 | Pagination doesn't reset to page 1 when a filter shrinks the total → user sees blank tables. | most paginated views | 🔥 |
| 17 | Empty-state copy says "run `npm run ingest`" — marketing user has no terminal. Rephrase to "Ask your admin to refresh the corpus" + Slack-link. | `/audit`, `/corpus`, `/history`, `/catalog-conflicts` empty states | ⚙️ |
| 18 | "Conflict score" vs "similarity" used interchangeably in the same view — undermines trust in the metric. | `/conflict-checker` form labels + match cards | ⚙️ |
| 19 | Sidebar fixed 240px — dashboard squashes on tablet portrait / narrow Brave windows. | `app/components/Sidebar.tsx` + dashboard layout | ⚙️ |
| 20 | Catalog Conflicts page doesn't tell users it's a precomputed snapshot. Add a "last run: 3h ago" badge + "rerun" button (admin-only). | `/catalog-conflicts` header | ⚙️ |
| 21 | "Find link targets" button label is opaque. Rename → "Suggest pages to link to". | `/internal-links` page L78 | ✨ |
| 22 | CSV download buttons have no disabled-while-generating state. Click twice → two downloads. | bulk-check + search-console export | ✨ |
| 23 | Audit Health Score severity chips wrap and lose the active state on narrow viewports. | `/audit` Health tab L246-257 | ✨ |
| 24 | GSC lookup form doesn't validate `https://` prefix client-side; users hit "invalid input" from the API. | `/search-console` lookup form | ✨ |

### 9C. SEO / Marketing / Content gaps

This is where the tool stops being "yet another similarity scorer" and
becomes opinionated.

**SEO — what an SEO would expect that we don't have:**

| # | Item | Why it matters |
|---|---|---|
| 25 | **Owner-URL per topic** — let an SEO mark "/courses/aws-saa is the canonical page for `aws saa certification`". The checker then says "your new blog overlaps the OWNER — merge or redirect" instead of "73% similarity". | This is the single biggest gap vs TrueRanker / SEO AI. Editorial decisions encoded in the data, not in the editor's head. |
| 26 | **Business-impact severity** — weight conflict score by current GSC clicks/impressions on the existing page (already in `gsc_metrics`). A 70% conflict with a 12k-clicks/mo page should outrank a 90% conflict with a dead page. | Currently a 0–100 conflict score with no context. Reference tools (Unclash AI, Incremys) all do business-weighted prioritisation. |
| 27 | **CTR opportunity column on /search-console** — pages with high impressions + low CTR are title-rewrite candidates, not duplicates. Show position 4-10 + CTR below site-median as a separate tab. | We have the data but the metric isn't surfaced. |
| 28 | **Stale-content detector** — pages with declining clicks over a sliding window + `lastmod` > 12 mo old. Refresh-or-prune queue. | Mentioned in §5 roadmap but never built; the data is in `gsc_daily_totals` + `pages.lastmod`. |
| 29 | **Cannibalization confirmed by GSC** — pgvector says two pages are similar; GSC tells us if Google actually swaps them in the SERP for the same query. Join `check_matches` to `gsc_metrics` on common query, flag the ones where rank position oscillates. | Vector similarity is a *signal*; SERP behaviour is the *symptom*. Surfacing both kills false positives. |
| 30 | **Sitemap-drift report** — diff `data/sitemap-urls.csv` against a fresh fetch of the live sitemap to surface pages published but not ingested, or removed but still in corpus. | Today the corpus drifts silently between weekly cron runs. |
| 31 | **No SERP-feature awareness** — Serper returns People Also Ask, Featured Snippet, AI Overview blocks. We only read `organic`. Should surface "your topic targets a question — write FAQ schema" etc. | `lib/competitors-extra.ts` already parses AI Overview; PAA + FS just need wiring. |
| 32 | **Canonical-tag check** in extractor — record `<link rel="canonical">` per page and warn when two pages claim conflicting canonicals. | Cheap to add (one cheerio selector) and a real SEO sanity check. |

**Marketing — workflow gaps:**

| # | Item | Why |
|---|---|---|
| 33 | **No user concept → no assignment, no approval, no audit trail.** A check is run by "whoever opened the URL". Add NextAuth + Google SSO @edstellar.com (already sketched in §5.workflow). | Without this, the tool can't ever be a publish gate — there's no one to gate the publish against. |
| 34 | **No CMS integration / publish gate.** `/api/check` exists as a webhook but no Edstellar CMS hook calls it. Either a Webflow webhook or a Zapier action. | Today the tool is *advisory*. To matter, a publish in the CMS should be conditional on a passing check. |
| 35 | **No writer brief export.** The "Net-new content suggestions" panel shows 6 angles in the UI but you can't copy/paste them into a Notion brief. Add a one-click "Export as brief (Markdown)". | Marketers ship in writer briefs, not in JSON. |
| 36 | **No "shipped vs blocked" reporting** — leadership wants to see "we caught 27 duplicates this quarter, blocked 12 publishes, refreshed 8 stale pages." | Without this the team can't defend the tool's existence at review time. |
| 37 | **No editorial calendar integration** (Notion / Airtable / ClickUp). Today a check result lives in the DB; the calendar doesn't know. Two-way sync would let the calendar show conflict status next to each draft. | Closes the loop with where marketers actually plan. |

**Content — quality + production gaps:**

| # | Item | Why |
|---|---|---|
| 38 | **No content-brief generator output.** The angles panel is a starting point; a brief needs target keyword, H2 skeleton, recommended word count, internal-link targets, schema suggestion. All derivable from data we have. | Saves the writer a 30-min prep step on every brief. |
| 39 | **No FAQ / PAA extraction** from Serper → reuse in the writer brief. | Free signal we ignore. |
| 40 | **No content-shape comparison** (target word count, H2 count, schema types) vs top-3 SERP pages. | Editors guess; tool should measure. |
| 41 | **No alt-text / image-SEO check** in the extractor. Easy add — count `<img>` without `alt`, list them. | Quick SEO win on the audit page. |
| 42 | **No content-type recommendation.** "This topic is searched mostly by buyers" → recommend a course landing; "by learners" → blog. Use Serper's SERP-feature mix as a signal (lots of /course/ in SERP = transactional). | Removes a frequent editorial debate. |
| 43 | **No topic-cluster health view.** We know each course's `type`/`category`/`subcategory` (1,698/6/43/166). Surface "this cluster has 22 courses but only 4 blogs — content-debt here." | Direct from `data/taxonomy/course-types.json` — no new data needed. |
| 44 | **No internal-link insertion suggestions** at paragraph level. `/internal-links` recommends pages; doesn't say *where in the draft* to put the anchor. | Roadmap Batch 5 sketched this; never built. |

### 9D. Reference points from 2026 research

What the audit confirmed we **got right** (kept here so we don't second-guess
in future sessions):

- **Pre-publish semantic similarity is the current state of the art** — every
  2026 reference (TopicalMap, Incremys, TrueRanker, Unclash AI) uses the same
  approach. Our `/conflict-checker` is conceptually aligned with the field.
- **HNSW + cosine on normalised embeddings** is the right pgvector pattern for
  text. `bge-small-en-v1.5` normalises in the embed call. Default `m=16`
  works at our 2,461-vector scale — Neon keeps the index resident in shared
  buffers; HNSW vs IVFFlat is irrelevant at this size.
- **Multi-signal triangulation** (GSC + crawl + rank) is what the field
  recommends. We have GSC + crawl; Serper covers occasional rank checks.
  Full rank tracking (DataForSEO / Ahrefs) is the third pillar — optional
  per §5 Tier C.
- **Editorial rules > raw scores** is the 2026 differentiator
  (update-before-create, owner-page assignment). Items 25 + 33 + 34 are how
  we'd close that gap.

### 9E. Future upgrades — deferred until a paid key is added

These items need a paid service the team hasn't signed up for. They're
not blocked technically — only blocked on a procurement decision.

| # | Item | Service needed | Approx cost | Notes |
|---|---|---|---|---|
| §5C-a | Backlink intelligence | DataForSEO / Ahrefs / Moz | $50–$200/mo+ | Adds the "third pillar" referenced in 9D — rank tracking. |
| 8 (prior list) | OpenAI embeddings switch | OpenAI | ~$1-2 one-off, then ~$0.02/1M tok | Kills the 8–15s `bge-small` cold-start. Current local embedder works at our scale. |
| #29 + #31 + #40 + #42 at scale | Serper Pro | $50/mo (50k searches) | Free tier (2,500/mo) covers light use; Pro unlocks heavy SERP-feature audits. |
| §5C-b | CMS title/meta editor (write-back) | Edstellar CMS API + a key for whatever CMS they use | Variable | Replaces the manual-copy workflow today. |
| §5C-c | Pagespeed / CWV at scale | Google Cloud Pagespeed Insights API key | Free up to 25k/day after Cloud project setup | CrUX public works keyless for popular URLs. |

When any of these are funded, lift the relevant items from 9E + their
referenced backlog rows up into a new session-log entry and ship.

### Sources (web research, 2026-06-25)

- TopicalMap.ai — [Best Keyword Cannibalization Checker Tools 2026](https://topicalmap.ai/blog/auto/keyword-cannibalization-checker-tools-2026)
- Incremys — [2026 Guide: How to Spot SEO Cannibalization](https://www.incremys.com/en/resources/blog/seo-cannibalization)
- Epic Slope Partners — [Unclash AI — 5 Best Keyword Cannibalization Tools in 2026](https://www.epicslope.partners/unclash-ai/keyword-cannibalization-tools)
- TrueRanker — [How to Fix SEO Cannibalization 2026](https://trueranker.com/blog/how-to-detect-fix-seo-cannibalization/)
- Neon — [Understanding vector search and HNSW with pgvector](https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector)
- DBI Services — [pgvector for DBA Part 2 — Indexes (March 2026 update)](https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/)
- AWS — [Optimize generative AI applications with pgvector indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
