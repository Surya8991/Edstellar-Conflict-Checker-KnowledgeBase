/**
 * Help content registry. One entry per dashboard route. The HelpButton
 * component reads this with usePathname() and renders the matching section
 * in a side panel.
 *
 * Each entry has four blocks — keep them tight and copy-edit-friendly:
 *   - what:        one sentence on what the page is for
 *   - howToUse:    bullet steps for the typical workflow
 *   - readingIt:   bullet hints for understanding what's on screen
 *   - troubleshoot: bullet "if X, then Y" pairs
 *
 * All copy is plain English. No code blocks, no jargon without an inline
 * gloss. Aimed at the marketing user, not the engineer.
 */
export interface HelpEntry {
  title: string;
  what: string;
  howToUse: string[];
  readingIt: string[];
  troubleshoot: { problem: string; fix: string }[];
}

export const HELP: Record<string, HelpEntry> = {
  "/": {
    title: "Dashboard",
    what:
      "Single-screen view of everything the team should care about today: high-risk drafts, broken links, thin pages, recent checks, and the worst catalog conflicts.",
    howToUse: [
      "Scan the red and amber attention banners first — those are things to act on today.",
      "Click any stat tile to drop into the relevant tab (Pages ingested → Corpus, Checks run → History, etc.).",
      "Read the 'Recent checks' panel to see what your team has been screening. Click an entry to re-run the same check.",
      "The 'Top catalog conflicts' panel shows the worst duplicate/cannibalization pairs from the precomputed catalog scan. Click either URL to inspect.",
    ],
    readingIt: [
      "Red 'High-risk last 7d' tile means somebody ran a check that scored ≥ 80 — that's a 'don't publish' verdict.",
      "Amber 'Catalog conflicts' tile shows how many duplicate/cannibalization pairs the precomputed scan found.",
      "'Caught / Published / Stale' tiles only appear once the team starts marking outcomes on the History page.",
      "'Last ingest' hint shows how fresh the corpus is. If it says 'never' or > 7d ago, the cron didn't run.",
    ],
    troubleshoot: [
      { problem: "All tiles show 0 and an amber 'Database not connected' banner appears", fix: "DATABASE_URL is missing in env. Ask an admin to set it in Vercel → Settings → Environment Variables." },
      { problem: "'GSC not connected' info banner won't go away", fix: "Visit /search-console → Connect Google. If you've already done that, your OAuth refresh token may have expired — reconnect." },
      { problem: "Recent checks panel is empty after I ran some checks", fix: "Try a hard refresh (Ctrl+Shift+R). The DB write is best-effort and very rarely fails silently — check the network tab for /api/check responses." },
    ],
  },

  "/conflict-checker": {
    title: "Conflict Checker",
    what:
      "Pre-publish duplication detector. Paste a URL or a topic, and we score how much it overlaps with what's already on edstellar.com.",
    howToUse: [
      "Paste a draft URL (https://…) or a topic phrase (e.g. 'leadership skills for first-time managers') into the input box.",
      "Adjust 'Scan' if you want more or fewer candidates surfaced (default 100 is fine for most cases).",
      "Hit Check. First check after a deploy takes 8–15 s while the embedder warms up; subsequent checks are 2–4 s.",
      "Read the top score: ≥80 means don't publish, 60–79 means reconsider angle, 35–59 means publish but link to overlapping pages, <35 means safe.",
      "Scroll the match list. Cards with 'Owner' badges are the editorial winners — non-owner matches should redirect to them.",
      "Click 'Re-run' on Net-new content suggestions when stuck for an angle. Click 'Copy brief' once happy to drop a Markdown writer brief on your clipboard.",
    ],
    readingIt: [
      "Score colour: red ≥80 (block), orange ≥60 (review), amber ≥35 (partial overlap), green <35 (safe).",
      "Match cards are sorted by impact-weighted score, not raw similarity — so a 70% conflict with a high-traffic page outranks a 90% conflict with a dead page.",
      "Amber 'N clicks · 28 days' chip on a match means that page actually pulls traffic — cannibalizing it is expensive.",
      "Indigo 'Owner' pill = that match IS the team's chosen winning page for this topic. Gray 'Non-owner' = the match should redirect to an owner URL set elsewhere.",
      "Click 'Show summary' on any match to expand the LLM rationale; click 'Explain this match' to lazily classify rows that landed past the initial top-15 cutoff.",
    ],
    troubleshoot: [
      { problem: "Got 'Failed to load external module @xenova/transformers'", fix: "Next.config.ts `serverExternalPackages` is misconfigured. Should be fixed in main; ping engineering if it returns." },
      { problem: "Top match's body is mostly nav/footer junk", fix: "The page might have unusual class names the extractor's noise selectors miss. Add the selector to lib/extract.ts NOISE_SELECTORS and re-ingest." },
      { problem: "Rate-limited (429) even though I'm a real user", fix: "The default limit is 60 checks/minute per IP. If your team shares an office IP this can trip; ask an admin to set WEBHOOK_API_KEY and use that path instead." },
      { problem: "Net-new content suggestions returns 'No angles' or weird text", fix: "Hit Re-run — the LLM occasionally returns invalid JSON. If it persists, GROQ_API_KEY may have rate-limited; check status.groq.com." },
    ],
  },

  "/bulk-check": {
    title: "Bulk Check",
    what:
      "Run the Conflict Checker on up to 100 URLs/topics at once. Each row gets a verdict (block / review / pass) and you can export everything as CSV.",
    howToUse: [
      "Paste one URL or topic per line into the textarea — or upload a CSV/TXT file (one column).",
      "Pick a Concurrency between 1–6. Higher = faster but rate-limit risk; 3 is safe.",
      "Click 'Run all checks'. Watch the progress bar — each row lands in the table as soon as it finishes.",
      "Filter by verdict pill or score slider to focus on the rows that need attention.",
      "Click 'Download CSV' when the run finishes for handoff to writers / leadership.",
    ],
    readingIt: [
      "Block (red) = score ≥80 / publishing this would cannibalize an existing page.",
      "Review (amber) = score 60–79 / reconsider angle before publishing.",
      "Pass (green) = score <60 / fine to publish, but eyeball the top match anyway.",
      "Error rows mean that one URL hit an issue (timeout, 404, LLM rate-limit). The other rows still got processed.",
    ],
    troubleshoot: [
      { problem: "'Max 100 inputs per run' error", fix: "Split the list into batches of 100. The cap protects the LLM budget; raising it requires both env + Zod schema changes." },
      { problem: "Many rows show 'error: rate-limited'", fix: "Drop Concurrency to 1–2 and re-run. Groq's free tier has burst limits." },
      { problem: "CSV button is disabled", fix: "Wait for the run to finish (the button label tells you so). The button also disables if there are 0 results to export." },
    ],
  },

  "/internal-links": {
    title: "Internal Links",
    what:
      "For a draft URL or topic, suggests the top existing pages it should link to.",
    howToUse: [
      "Paste a draft URL or topic into the input.",
      "Toggle 'Summarize first' if you want the LLM to compress your input before searching (slower, more focused).",
      "Click 'Suggest pages to link to'. You'll get up to 25 ranked candidates by relevance.",
      "Copy the URL + suggested anchor (the matched page's title) into your CMS as you write.",
    ],
    readingIt: [
      "Higher similarity = more topically related, not necessarily a stronger link choice. A 60%-similarity course page might be a better hub link than an 80%-similarity blog.",
      "Each card shows the page's content type (course / blog / category) — useful for picking variety in anchor types.",
    ],
    troubleshoot: [
      { problem: "Suggestions look generic", fix: "Turn on 'Summarize first' — raw URL input occasionally embeds the whole nav + footer." },
      { problem: "Always returns the same hub pages regardless of input", fix: "Your input is short — fewer keywords = vector search defaults to popular pages. Add 2–3 keywords inline." },
    ],
  },

  "/audit": {
    title: "Content Audit",
    what:
      "Per-page health scanner. Catches meta-length issues, broken links, duplicate titles/H1s, canonical bugs, missing image alt text, and stale low-traffic pages.",
    howToUse: [
      "Pick a tab: Meta / Broken Links / Duplicates / Health Score / Canonical / Images / Stale.",
      "On Meta: filter by flag pill (title-too-long etc.) to focus on one class of issue.",
      "On Health Score: drag the 'Min health' slider or click a severity chip to scope the list.",
      "On Canonical: red 'missing' rows have no canonical tag; amber 'cross-canonical' rows point to another URL (often a CMS template bug).",
      "On Images: rows are sorted by absolute missing-alt count. Click each URL to fix in the CMS.",
      "On Stale: the gsc-snapshot cron flags pages with <5 clicks/28d AND lastmod > 12 mo. Refresh or prune candidates.",
      "On Clusters: each row is a (course type × category) bucket with course/blog/subcategory counts + content debt (where there's lots of product pages but not enough awareness content).",
    ],
    readingIt: [
      "Health Score breakdown: -20 missing title, -8 title-too-short, -15 missing meta, -6 meta-too-short, -10 not-embedded, -10 thin body, -30 4xx/5xx status, -8 low token count.",
      "Severity bands: weak <60, medium 60–79, strong ≥80.",
      "Stale tab is only populated after the gsc-snapshot cron has run with a connected GSC account.",
    ],
    troubleshoot: [
      { problem: "Broken Links tab is empty even though I expect 404s", fix: "The link audit cron runs weekly. Empty means the cron hasn't run yet OR there are genuinely no broken URLs in the corpus." },
      { problem: "Canonical tab shows pages I think are fine", fix: "Theme/CMS templates often emit a canonical pointing at the un-trailing-slash variant, or a category root. Audit the actual <link> tag in the page source." },
      { problem: "Images tab shows 0 missing alt but the live page clearly has alt-less images", fix: "Re-ingest with --force. The image_count / images_no_alt columns are only filled on new ingestion." },
    ],
  },

  "/history": {
    title: "Score History",
    what:
      "Timeline view of every conflict check the team has run. Track score regressions and mark editorial outcomes.",
    howToUse: [
      "Search the left list by URL/topic to find a check.",
      "Click an entry to see its trend line + the latest matches that triggered the score.",
      "Use the dropdown next to each historical score to mark the outcome: published / merged / redirected / discarded.",
      "Outcomes feed the dashboard's 'Caught / Published last 90 days' tiles — leadership reporting comes from here.",
    ],
    readingIt: [
      "If the same URL has been checked multiple times, the trend chart shows whether your edits are reducing the conflict score (good) or accidentally increasing it (bad).",
      "ScorePill colour: red ≥80, orange ≥60, amber ≥35, green <35.",
    ],
    troubleshoot: [
      { problem: "My outcome doesn't save", fix: "Check the network tab for the /api/check/outcome request. If WEBHOOK_API_KEY is set, this endpoint needs the X-API-Key header — open a ticket." },
      { problem: "List is empty even though I've run checks", fix: "Checks only persist when DATABASE_URL is set AND the persist call succeeded. Recent rate-limit denials don't persist." },
    ],
  },

  "/catalog-conflicts": {
    title: "Catalog Conflicts",
    what:
      "Precomputed snapshot of near-duplicate pairs across the existing catalogue. Use it to plan merges/redirects, not to gate publishing.",
    howToUse: [
      "Pick a pair_type chip to focus: duplicate / cannibalization / category-bleed / subcategory-bleed / overlap.",
      "Use the Min similarity slider to drop low-confidence pairs.",
      "Click either side of a pair to inspect the page. Decide: merge, redirect, or leave alone.",
    ],
    readingIt: [
      "'cannibalization' (≥85% similar, same content_type) is the dangerous one for SEO — both pages compete for the same SERP slot.",
      "'duplicate' is ≥95% similar — usually a CMS templating accident or a redirect that should exist.",
      "'category-bleed' / 'subcategory-bleed' = a category/subcategory page is too narrow (or a course/blog too generic).",
    ],
    troubleshoot: [
      { problem: "Page is empty after ingesting the corpus", fix: "The precompute hasn't run yet. An admin needs to run `npm run catalog-conflicts` once, or wait for the weekly cron." },
      { problem: "Pairs include obvious junk like /enquiry-form ↔ /book-a-demo", fix: "That class was filtered out in Session 4. If it's back, an admin reverted the static-page exclusion." },
    ],
  },

  "/search-console": {
    title: "Search Console",
    what:
      "Pulls Google Search Console data into actionable views: cannibalization, striking distance, CTR opportunity, movers, untapped, catalog gaps, stale pages, index coverage.",
    howToUse: [
      "Click 'Connect Google' (top right) once. Sign in with the account that has GSC access to edstellar.com.",
      "Pick a range across the top: 24 hours → 12 months.",
      "Switch tabs to ask different questions: 'where can I rewrite a title to grab more clicks?' (CTR Opportunity), 'who's about to break into the top 3?' (Striking Distance), etc.",
      "Use the lookup box at the top to drill into a single URL or query without switching tab.",
      "Click any row in 'Top pages' to open the per-page drilldown modal (queries / countries / devices / trend).",
    ],
    readingIt: [
      "By Country uses full names (India, United States, …) — the alpha-3 codes from the API are translated client-side.",
      "CTR Opportunity flags page-1 queries where the click rate is well below the industry curve — title rewrite candidates.",
      "Striking Distance flags positions 8–20 with enough impressions to matter — content/internal-link work moves them into top-3.",
    ],
    troubleshoot: [
      { problem: "'User does not have sufficient permission for site …' banner", fix: "Either the connected account isn't a user on the property, OR GSC_SITE_URL is set to a property the account can't see. The resolver tries trailing-slash + sc-domain variants automatically — the error message lists what IS accessible." },
      { problem: "Connect Google → redirect_uri_mismatch", fix: "Two-side fix. Add the Vercel URL to Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs AND set GOOGLE_REDIRECT_URI in Vercel env vars to that same URL with /api/gsc/callback." },
      { problem: "All tabs show 0 data even though Google says we have traffic", fix: "GSC has 2–3 day data latency. If 24h returns 0, try 7d or 28d." },
    ],
  },

  "/competitors": {
    title: "Competitors",
    what:
      "Per-topic competitor research using live SERP data. See who ranks for a query and how they're framing it differently.",
    howToUse: [
      "Type a topic (e.g. 'leadership development') into the input. Hit Research.",
      "We pull the top organic results, drop noise destinations (YouTube, Quora, PDFs, Edstellar itself), dedupe by domain, and summarize the survivors.",
      "Read each card's 'angle' line — that's how they're framing the topic, useful for picking a different angle yourself.",
    ],
    readingIt: [
      "Known competitor pill (indigo) = on the curated list (skillsoft, kornferry, pluralsight, etc.). New-faces are anything else above the dedup cut.",
      "Per-domain dedup means top results from one big site (e.g. coursera.org) get collapsed — so you see 6 different competitors, not 6 articles from one.",
    ],
    troubleshoot: [
      { problem: "'SERPER_API_KEY is not set' error", fix: "An admin needs to add a Serper.dev key to env vars. Free tier covers 2,500 searches/month." },
      { problem: "Same domains every time", fix: "Pick a more specific topic. Generic queries always pull the same authority sites." },
    ],
  },

  "/corpus": {
    title: "Corpus",
    what:
      "Index of every URL the Conflict Checker compares against. Browse, filter, and inspect what's actually in our search-space.",
    howToUse: [
      "Use the chip filters to scope: content_type / course type / category / tag.",
      "Search title or URL with the search box.",
      "Click any row's URL to open the live page in a new tab.",
      "The 'Signals' column flags Owner pages, Stale pages, image-alt debt, and canonical mismatches in one glance.",
    ],
    readingIt: [
      "'Clicks 28d' column is populated by the daily gsc-snapshot cron. Bold = ≥100 clicks (the page actually pulls traffic).",
      "Owner pill = this is the editorial winner for its topic. Stale pill = low traffic + old lastmod. Alt: N = N images missing alt text. Canonical chip = canonical URL ≠ this URL.",
    ],
    troubleshoot: [
      { problem: "Row has 'not embedded' label", fix: "The embedder failed on that URL — usually a 404 / timeout / very short body. Re-ingest with --force." },
      { problem: "Counts in the tiles don't sum to total", fix: "They will once the home page (single static row) is included. The 'All' tile is authoritative." },
    ],
  },
};
