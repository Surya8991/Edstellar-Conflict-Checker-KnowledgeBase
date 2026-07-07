/**
 * Help content registry. One entry per dashboard route. The HelpButton
 * component reads this with usePathname() and renders the matching section
 * in a side panel.
 *
 * Each entry has four blocks - keep them tight and copy-edit-friendly:
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
      "Single-screen view of everything the team should care about today: high-risk drafts, broken links, thin pages, and recent checks.",
    howToUse: [
      "Sections from top to bottom: Needs attention → Today's signals → Editorial outcomes → Recent activity → Quick actions. Each section is gated, so empty ones disappear instead of filling the page with zeros.",
      "Scan 'Needs attention' first - red and amber items are things to act on today.",
      "Click any stat tile in 'Today's signals' to drop into the relevant tab (Pages ingested → Corpus, Checks run → History, etc.).",
      "'Editorial outcomes' appears once your team marks outcomes on the History page - leadership reporting comes from here.",
      "'Recent activity' shows the last 8 checks. Click any check to re-run it.",
    ],
    readingIt: [
      "Red 'High-risk last 7d' tile means somebody ran a check that scored ≥ 80 - that's a 'don't publish' verdict.",
      "'Caught / Published / Stale' tiles only appear once the team starts marking outcomes on the History page.",
      "'Last ingest' hint shows how fresh the corpus is. If it says 'never' or > 7d ago, the cron didn't run.",
    ],
    troubleshoot: [
      { problem: "All tiles show 0 and an amber 'Database not connected' banner appears", fix: "DATABASE_URL is missing in env. Ask an admin to set it in Vercel → Settings → Environment Variables." },
      { problem: "'GSC not connected' info banner won't go away", fix: "Visit /search-console → Connect Google. If you've already done that, your OAuth refresh token may have expired - reconnect." },
      { problem: "Recent checks panel is empty after I ran some checks", fix: "Try a hard refresh (Ctrl+Shift+R). The DB write is best-effort and very rarely fails silently - check the network tab for /api/check responses." },
    ],
  },

  "/signin": {
    title: "Sign in",
    what:
      "Locked-down sign-in page. The dashboard only accepts Google accounts on the team's allow-listed domain (defaults to @edstellar.com).",
    howToUse: [
      "Click 'Continue with Google'.",
      "Pick your Edstellar Google account from the chooser (or sign in if you're not).",
      "You'll land back where you were trying to go.",
    ],
    readingIt: [
      "There's no email/password form on purpose - SSO only.",
      "If you see 'AccessDenied' it means the email you signed in with isn't on the allow-list. Switch accounts.",
    ],
    troubleshoot: [
      { problem: "I see 'AccessDenied'", fix: "You're signed into the wrong Google account. In the Google chooser, pick 'Use another account' and sign in with your Edstellar email." },
      { problem: "I see 'redirect_uri_mismatch'", fix: "An admin needs to add the prod redirect URI to Google Cloud Console → Credentials → OAuth client. The URI is `https://<host>/api/auth/callback/google`." },
      { problem: "Loop back to sign-in after signing in", fix: "AUTH_SECRET may not be set in the deployed env. Ask an admin to set it and redeploy." },
    ],
  },

  "/conflict-checker": {
    title: "Conflict Checker",
    what:
      "Pre-publish duplication detector. Paste a URL or a topic, and we score how much it overlaps with what's already on edstellar.com.",
    howToUse: [
      "Paste a draft URL (https://…) or a topic phrase (e.g. 'leadership skills for first-time managers') into the input box.",
      "Adjust 'Search depth' (Quick 25 / Standard 100 / Thorough 500) if you want more or fewer candidates surfaced - Standard is fine for most cases.",
      "Hit Check. First check after a deploy takes 8–15 s while the embedder warms up; subsequent checks are 2–4 s.",
      "Read the top score: ≥80 means don't publish, 60–79 means reconsider angle, 35–59 means publish but link to overlapping pages, <35 means safe.",
      "Scroll the match list. Each card's Resolution panel names an action (Merge / Consolidate / Differentiate / Keep both) and a winner page - cards with 'Owner' badges are the editorial winners, so non-owner matches should redirect to them.",
      "Below the matches, 'Net-new content suggestions' and 'AI Draft' are collapsible panels (closed by default; click the title to open, or just hit the button and they auto-open). Use 'Suggest' when stuck for an angle, then 'Copy brief' to drop a Markdown writer brief on your clipboard.",
      "'Generate draft' in the AI Draft panel gives a starting draft - instant if a similar page was pre-generated, otherwise a few seconds via a live model call.",
    ],
    readingIt: [
      "Score colour: red ≥80 (block), orange ≥60 (review), amber ≥35 (partial overlap), green <35 (safe).",
      "Use the 'Sort by' control to switch the match list between conflict score and raw topic similarity - pick whichever ordering you actually want; there's no hidden traffic-weighting behind either option.",
      "Each match's Resolution panel breaks the score into four separate signals (Title / H1 / URL / Body) so you can see WHY it conflicts, plus a search-intent label and the suggested action.",
      "Amber 'N clicks · 28 days' chip on a match means that page actually pulls traffic - cannibalizing it is expensive.",
      "Indigo 'Owner' pill = that match IS the team's chosen winning page for this topic. Gray 'Non-owner' = the match should redirect to an owner URL set elsewhere.",
      "Click 'Show why this conflicts' on any match to expand the LLM rationale; click 'Analyze with AI' to lazily classify rows that landed past the initial top-15 cutoff.",
    ],
    troubleshoot: [
      { problem: "Got 'Failed to load external module @xenova/transformers'", fix: "Next.config.ts `serverExternalPackages` is misconfigured. Should be fixed in main; ping engineering if it returns." },
      { problem: "Top match's body is mostly nav/footer junk", fix: "The page might have unusual class names the extractor's noise selectors miss. Add the selector to lib/extract.ts NOISE_SELECTORS and re-ingest." },
      { problem: "Rate-limited (429) even though I'm a real user", fix: "The default limit is 60 checks/minute per IP. If your team shares an office IP this can trip; ask an admin to set WEBHOOK_API_KEY and use that path instead." },
      { problem: "Net-new content suggestions returns 'No angles' or weird text", fix: "Hit Re-run - the LLM occasionally returns invalid JSON. If it persists, GROQ_API_KEY may have rate-limited; check status.groq.com." },
    ],
  },

  "/clusters": {
    title: "Content Clusters",
    what:
      "Groups the WHOLE live corpus by TOPIC across content types - a category page, its blog, and its courses land in ONE cluster. Each cluster gets a topic label, a suggested action, and a winner (pillar) page. This is the corpus-wide view, versus the Conflict Checker's one-page-at-a-time view.",
    howToUse: [
      "The page auto-scans on load and caches the result for about 5 minutes; click 'Rescan' to force a fresh scan.",
      "Filter with the labeled Action and Type rows, or the search box (matches the topic label, a title, or a URL). Tick 'show intent' for each page's search-intent badge, or 'show GSC' for its Search Console metrics - last 1/3/6 full months of clicks, impressions, and average position, plus its top-5 queries. Both are off by default.",
      "Click a cluster row to expand its members; each shows the page, the distinctive topic tokens it shares with the pillar, and its % content match. The ★ marks the suggested winner (the pillar page for a pillar cluster).",
      "Programmatic blog series - Training Companies, Roles & Responsibilities, In-Demand Skills, Games & Exercises, Digital Transformation, Work Culture - are grouped into one cluster by their URL template (they'd otherwise fragment) and carry a 'series' badge.",
      "Unique-topic pages (nothing else on the site shares their topic) are listed in a collapsible, searchable section at the bottom - browse it, it's an answer not a dead-end.",
    ],
    readingIt: [
      "Membership is by DISTINCTIVE topic tokens, not raw similarity: template words every page shares ('corporate', 'training', 'courses') are auto-learned from the corpus and dropped, so 'big data' groups with big-data pages, never with 'sales' pages that merely share the same template.",
      "Every member matches the cluster's SEED (pillar) directly - pages are never chained together, so a cluster stays on one topic instead of ballooning into a mixed-topic mega-cluster.",
      "The label comes from what the MEMBERS share, not one page's tokens, so a 51-country 'skills in demand' series reads 'demand', not the seed's country.",
      "'Pillar + spokes' = a hub page (category/subcategory) with cross-type spokes on one topic - link the spokes to the pillar, don't merge them. 'Merge → 301' collapses a SMALL same-type near-duplicate set into the winner; a large same-type family (or a 'series') is intentional variants, so it's 'Differentiate' - you never 301 dozens of distinct pages into one.",
      "The chips under each page are the distinctive tokens it shares with the pillar; the % is the body-embedding content match (the check that keeps an off-topic page out).",
      "The meta line reads 'N clustered · M unique-topic pages' - a unique-topic page is a real answer (nothing else covers that topic), not a coverage gap.",
    ],
    troubleshoot: [
      { problem: "Page says 'No clusters found'", fix: "No topic had two or more pages clear the overlap + body-floor bar. Results are cached ~5 min; hit 'Rescan' to force a fresh live scan." },
      { problem: "Two pages I know are on the same topic aren't grouped", fix: "Their distinctive-token overlap is below the bar, or one fails the body-content floor vs the pillar. Two pages that only share template words ('corporate training') are deliberately NOT grouped - that was the old mega-cluster bug." },
      { problem: "A blog series is split across several clusters", fix: "Series are matched by URL template in lib/series.ts. If a family isn't collapsing, its slug pattern isn't covered yet - add it there." },
      { problem: "A page I expected to see is missing entirely", fix: "It may be marked as a redirect/canonicalized-away/dead by the redirect-detection scan (`is_stale`) - those never appear in clusters, by design." },
    ],
  },

  "/bulk-check": {
    title: "Bulk Check",
    what:
      "Run the Conflict Checker on up to 100 URLs/topics at once. Each row gets a verdict (block / review / pass) and you can export everything as CSV.",
    howToUse: [
      "Paste one URL or topic per line into the textarea - or upload a CSV/TXT file (one column).",
      "Pick a Concurrency between 1–6. Higher = faster but rate-limit risk; 3 is safe.",
      "Click 'Run all checks'. Watch the progress bar - each row lands in the table as soon as it finishes.",
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
      "For a draft URL, topic, or pasted text, suggests the top existing pages it should link to. Two modes: whole-page (one ranked list) and per-paragraph (separate suggestions per paragraph of text).",
    howToUse: [
      "Pick a mode. 'Whole page' = one ranked list for the entire input - fastest. 'Per paragraph' = the input is split on blank lines and each paragraph gets its own short list.",
      "Paste a URL (https://…), a topic phrase, or - for per-paragraph mode - your draft text with blank lines between paragraphs.",
      "Click the suggest button. Per-paragraph mode shows one block per paragraph with the top targets for that paragraph.",
      "Copy the URL + suggested anchor (the matched page's title) into your CMS.",
    ],
    readingIt: [
      "Higher similarity = more topically related, not necessarily a stronger link choice. A 60%-similarity course page might be a better hub link than an 80%-similarity blog.",
      "Each card shows the page's content type (course / blog / category) - useful for picking variety in anchor types.",
      "In per-paragraph mode the same target page can show up in multiple paragraphs - the editor decides where to actually use it.",
    ],
    troubleshoot: [
      { problem: "Per-paragraph mode says 'no paragraphs long enough'", fix: "Each paragraph needs at least 80 characters. Either lengthen them or paste fewer, longer ones with blank lines between." },
      { problem: "Suggestions look generic", fix: "Pasted text wins over a URL - the URL fetcher captures nav/footer noise that drowns out the actual topic. If using URL mode and seeing generic results, paste the body text instead." },
      { problem: "Always returns the same hub pages regardless of input", fix: "Your input is short - fewer keywords = vector search defaults to popular pages. Add 2–3 keywords inline." },
    ],
  },

  "/audit": {
    title: "Content Audit",
    what:
      "Per-page health scanner. Catches meta-length issues, broken links, duplicate titles/H1s, canonical bugs, missing image alt text, and stale low-traffic pages.",
    howToUse: [
      "Pick a tab: Meta / Link Audit / Duplicates / Health Score / Canonical / Images / Stale / Clusters.",
      "On Meta: filter by flag pill (title-too-long etc.) to focus on one class of issue.",
      "On Health Score: drag the 'Min health' slider or click a severity chip to scope the list.",
      "On Canonical: red 'missing' rows have no canonical tag; amber 'cross-canonical' rows point to another URL (often a CMS template bug).",
      "On Images: rows are sorted by absolute missing-alt count. Click each URL to fix in the CMS.",
      "On Stale: the gsc-snapshot cron flags pages with <5 clicks/28d AND lastmod > 12 mo. Refresh or prune candidates.",
      "On Clusters: two tables. Course clusters by (course type × category) with content-debt score. Blog clusters by blog category (separate taxonomy) with traffic + stale ratio. Blog count in the course table is mostly 0 because the two corpora use different category vocabularies - that's expected, not a bug.",
    ],
    readingIt: [
      "Health Score breakdown: -20 missing title, -8 title-too-short, -15 missing meta, -6 meta-too-short, -10 not-embedded, -10 thin body, -30 4xx/5xx status, -8 low token count.",
      "Severity bands: weak <60, medium 60–79, strong ≥80.",
      "Stale tab is only populated after the gsc-snapshot cron has run with a connected GSC account.",
    ],
    troubleshoot: [
      { problem: "Link Audit tab is empty even though I expect data", fix: "The link audit cron runs weekly and only populates pages that have been HEAD-checked. Empty means the cron hasn't run yet - ask an admin or wait a week." },
      { problem: "Link Audit only shows 4xx/5xx but I want to see 2xx too", fix: "Click the 'ok 2xx' or 'redirect 3xx' chip at the top of the tab - the default 'all' view also shows them. Status bands also filter via the chips." },
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
      "Outcomes feed the dashboard's 'Caught / Published last 90 days' tiles - leadership reporting comes from here.",
    ],
    readingIt: [
      "If the same URL has been checked multiple times, the trend chart shows whether your edits are reducing the conflict score (good) or accidentally increasing it (bad).",
      "ScorePill colour: red ≥80, orange ≥60, amber ≥35, green <35.",
    ],
    troubleshoot: [
      { problem: "My outcome doesn't save", fix: "Check the network tab for the /api/check/outcome request. If WEBHOOK_API_KEY is set, this endpoint needs the X-API-Key header - open a ticket." },
      { problem: "List is empty even though I've run checks", fix: "Checks only persist when DATABASE_URL is set AND the persist call succeeded. Recent rate-limit denials don't persist." },
    ],
  },

  "/manager": {
    title: "Manager View",
    what:
      "Leadership-facing summary of program activity: week-over-week volume, high-risk catches, and per-user adoption. Lives under Additional Tools in the sidebar, not the top-level nav.",
    howToUse: [
      "Check the four top tiles first - 'Checks · last 7d', 'High-risk caught · 7d', 'Shipped · 7d', and 'Open high-risk' - each shows a week-over-week delta so you can tell if the trend is improving or not.",
      "'Open high-risk' is the one tile that's an action queue, not just a metric - those are checks that scored ≥80 and haven't been resolved yet.",
      "Scroll to the per-user activity table to see whether the team is actually using the tool, not just whether the corpus looks healthy.",
    ],
    readingIt: [
      "'Shipped · 7d' counts published outcomes among checks CREATED in the last 7 days - a check created last week and published today won't count in this week's tile. That's a different clock than the Dashboard's 90-day tiles (which key off when the outcome was resolved, not when the check was created); don't directly compare the two numbers.",
      "This page is a snapshot, not a trend line - there's no week-by-week series here, only a single this-week-vs-last-week delta per tile.",
    ],
    troubleshoot: [
      { problem: "All tiles show 0", fix: "Either no checks have run in the last 7 days, or DATABASE_URL isn't set. Check the Dashboard for the same 'Database not connected' banner." },
      { problem: "'Open high-risk' count doesn't match what I see on History", fix: "This tile only counts checks with NO outcome set yet. Once someone marks an outcome on History (published/merged/redirected/discarded), it drops off this count." },
    ],
  },

  "/catalog-conflicts": {
    title: "Catalog Conflicts",
    what:
      "Precomputed snapshot of near-duplicate pairs across the existing catalogue. Use it to plan merges/redirects, not to gate publishing. Currently unlinked from the sidebar (Session 11) but still reachable directly at this URL - ask an admin why before assuming it's the tool you want; Content Clusters (/clusters) is the actively-maintained equivalent for grouping.",
    howToUse: [
      "Pick a pair_type chip to focus: duplicate / cannibalization / category-bleed / subcategory-bleed / overlap.",
      "Use the Min similarity slider to drop low-confidence pairs.",
      "Click either side of a pair to inspect the page. Decide: merge, redirect, or leave alone.",
    ],
    readingIt: [
      "'cannibalization' (≥85% similar, same search intent) is the dangerous one for SEO - both pages compete for the same SERP slot. Same content_type is no longer required, since a course and a blog can share intent too.",
      "'duplicate' is ≥95% similar AND same content_type - usually a CMS templating accident or a redirect that should exist.",
      "'category-bleed' / 'subcategory-bleed' = a category/subcategory page is too narrow (or a course/blog too generic).",
      "Redirected/canonicalized-away pages never appear here - a page marked stale by the redirect scan is excluded on both sides of every pair.",
    ],
    troubleshoot: [
      { problem: "Page is empty after ingesting the corpus", fix: "The precompute hasn't run yet - this is a MANUAL refresh, there is no cron for it. An admin needs to run `npm run catalog-conflicts`." },
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
      "By Country uses full names (India, United States, …) - the alpha-3 codes from the API are translated client-side.",
      "CTR Opportunity flags page-1 queries where the click rate is well below the industry curve - title rewrite candidates.",
      "Striking Distance flags positions 8–20 with enough impressions to matter - content/internal-link work moves them into top-3.",
    ],
    troubleshoot: [
      { problem: "'User does not have sufficient permission for site …' banner", fix: "Either the connected account isn't a user on the property, OR GSC_SITE_URL is set to a property the account can't see. The resolver tries trailing-slash + sc-domain variants automatically - the error message lists what IS accessible." },
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
      "Read each card's 'angle' line - that's how they're framing the topic, useful for picking a different angle yourself.",
    ],
    readingIt: [
      "Known competitor pill (indigo) = on the curated list (skillsoft, kornferry, pluralsight, etc.). New-faces are anything else above the dedup cut.",
      "Per-domain dedup means top results from one big site (e.g. coursera.org) get collapsed - so you see 6 different competitors, not 6 articles from one.",
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
      { problem: "Row has 'not embedded' label", fix: "The embedder failed on that URL - usually a 404 / timeout / very short body. Re-ingest with --force." },
      { problem: "Counts in the tiles don't sum to total", fix: "They will once the home page (single static row) is included. The 'All' tile is authoritative." },
    ],
  },
};
