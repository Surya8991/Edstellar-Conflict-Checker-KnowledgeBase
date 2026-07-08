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
 * Write for someone non-technical who has never seen this app before.
 * Short sentences. Everyday words. Explain any term the moment you use it -
 * never assume the reader knows what "cosine similarity" or "embedding"
 * means. Exact button/label names stay in quotes since they're literally on
 * screen. Troubleshoot fixes can name a setting or file when that's the only
 * way to actually fix it, but keep the surrounding sentence plain.
 */
export interface HelpEntry {
  title: string;
  what: string;
  howToUse: string[];
  readingIt: string[];
  troubleshoot: { problem: string; fix: string }[];
}

export const HELP: Record<string, HelpEntry> = {
  // "/" itself has no entry - it's a server-side redirect straight to
  // /corpus (the Edstellar Database), so the Help panel never actually
  // renders for that pathname. This content used to live under "/" back
  // when it WAS the dashboard; it moved to /dashboard and this key moved
  // with it - don't re-add a "/" key, it'll be dead the same way.
  "/dashboard": {
    title: "Dashboard",
    what:
      "One screen that shows what needs your attention today: risky drafts, broken links, thin pages, and recent activity.",
    howToUse: [
      "The page has five sections, top to bottom: Needs attention → Today's numbers → Editorial outcomes → Recent activity → Quick actions. A section only shows up if it has something to say, so you won't see a wall of zeros.",
      "Check 'Needs attention' first - red and orange items are things to act on today.",
      "Click any number under 'Today's numbers' to jump straight to that part of the app.",
      "'Editorial outcomes' appears once your team starts marking what happened to each check (published, merged, and so on) - that's where leadership reporting comes from.",
      "'Recent activity' lists the last 8 checks anyone ran. Click one to run it again.",
    ],
    readingIt: [
      "A red 'High-risk last 7d' number means someone ran a check that scored 80 or higher - that's a 'don't publish this yet' result.",
      "'Caught / Published / Stale' numbers only appear once your team starts marking outcomes.",
      "'Last ingest' shows how up to date the page list is. If it says 'never' or more than 7 days ago, the automatic update didn't run.",
    ],
    troubleshoot: [
      { problem: "Everything shows 0 and a yellow 'Database not connected' message appears", fix: "The database isn't hooked up. Ask an admin to check the site's settings." },
      { problem: "'Search Console not connected' won't go away", fix: "Go to the Search Console page and click 'Connect Google'. If you already did that, the connection may have expired - reconnect." },
      { problem: "Recent checks look empty even though I just ran some", fix: "Refresh the page fully (Ctrl+Shift+R). Saving a check rarely fails, but if it keeps happening, ask an admin to look into it." },
    ],
  },

  "/signin": {
    title: "Sign in",
    what:
      "The sign-in page. It only accepts Google accounts from the team's own domain (normally @edstellar.com) - there's no separate password.",
    howToUse: [
      "Click 'Continue with Google'.",
      "Pick your Edstellar Google account from the list (or sign in if you're not already).",
      "You'll land back on the page you were trying to reach.",
    ],
    readingIt: [
      "There's no email/password box on purpose - you sign in with Google only.",
      "If you see 'AccessDenied', the email you used isn't allowed in. Switch to your Edstellar account.",
    ],
    troubleshoot: [
      { problem: "I see 'AccessDenied'", fix: "You signed in with the wrong Google account. In the Google account picker, choose 'Use another account' and sign in with your Edstellar email." },
      { problem: "I see 'redirect_uri_mismatch'", fix: "This needs an admin - the app's web address isn't registered with Google yet. Ask them to add it in Google Cloud Console." },
      { problem: "I keep getting sent back to sign-in after signing in", fix: "A setting on the server may be missing. Ask an admin to check it." },
    ],
  },

  "/conflict-checker": {
    title: "Conflict Checker",
    what:
      "Checks a draft against everything already on edstellar.com before you publish it, and tells you how much it overlaps.",
    howToUse: [
      "Paste a draft's web address (starting with https://) or just describe the topic (e.g. 'leadership skills for first-time managers') into the box.",
      "You can adjust 'Search depth' (Quick / Standard / Thorough) if you want the check to look at more or fewer existing pages - Standard works for most cases.",
      "Click Check. The very first check of the day can take up to 15 seconds while the tool warms up; after that it's a few seconds.",
      "Look at the top score: 80 or higher means don't publish, 60-79 means rethink your angle, 35-59 means it's fine to publish but link to the overlapping pages, under 35 means you're safe.",
      "Scroll down to see every page it overlaps with. Each one comes with a suggested action (Merge / Combine / Keep both / Make more different) and names which page should 'win' - an 'Owner' badge marks the page your team has chosen as the winner for that topic.",
      "Below that, 'Net-new content suggestions' and 'AI Draft' are two extra panels you can open if you need help. Use 'Suggest' if you're stuck for an angle, then 'Copy brief' to copy a ready-made writing brief.",
      "'Generate draft' gives you a starting draft to work from - instant if we already had something similar prepared, otherwise it takes a few seconds to write one.",
    ],
    readingIt: [
      "Score colours: red 80+ (stop), orange 60+ (think twice), amber 35+ (some overlap), green under 35 (safe).",
      "'Sort by' lets you reorder the list by overall score or by pure topic closeness - pick whichever view is more useful, neither one is weighted by traffic behind the scenes.",
      "Each match shows four separate reasons it might overlap - its title, its heading, its web address, and its actual content - so you can see exactly why it was flagged.",
      "An amber 'N clicks · 28 days' badge on a match means that page already gets real traffic - overlapping with it would be costly.",
      "An indigo 'Owner' badge means that page is the one your team picked as the winner for this topic. A grey 'Non-owner' badge means that page should eventually redirect to the real owner.",
      "Click 'Show why this conflicts' on any match to read the full explanation. Click 'Analyze with AI' on a match that hasn't been explained yet to get one.",
    ],
    troubleshoot: [
      { problem: "I see an error about a module failing to load", fix: "This is a technical setup issue - it should already be fixed; if it comes back, tell engineering." },
      { problem: "The top match's content looks like menus and footers, not real content", fix: "That page may have an unusual layout our reader doesn't understand yet. Tell engineering the page's web address so they can fix it." },
      { problem: "I got rate-limited even though I'm a real user", fix: "There's a limit of 60 checks a minute from the same office network. If your whole team shares one internet connection, this can trip. Ask an admin about raising the limit." },
      { problem: "'Net-new content suggestions' comes back empty or garbled", fix: "Click 'Re-run' - this happens occasionally. If it keeps failing, an admin may need to check the AI service's status." },
      { problem: "A page I know exists never shows up as a match", fix: "It's probably on the exclusion list at Settings - either someone added it by hand, or it was auto-hidden because it's broken or redirected. The page still exists in the Database and Search Console, it's just hidden from these comparisons." },
    ],
  },

  "/clusters": {
    title: "Content Clusters",
    what:
      "Groups every page on the site by topic, no matter what kind of page it is - a category, its blog post, and its courses can all land in one group. Each group gets a topic name, a suggested action, and a 'best' page. Where the Conflict Checker looks at one page at a time, this looks at the whole site at once.",
    howToUse: [
      "The page scans automatically when you open it and remembers the result for about 5 minutes. Click 'Rescan' to force a fresh look.",
      "Narrow the list with the Action and Type filters, or search by topic name, title, or web address. You can also turn on 'show intent' (what each page is trying to do) or 'show GSC' (its Search Console numbers) - both are off by default.",
      "Click a group to see its pages. Each one shows the words it shares with the group's main page, and a percentage showing how closely its content matches. A star marks the suggested 'best' page.",
      "Some blog series - like 'Training Companies in [country]' - are grouped together automatically because they follow the same URL pattern, and get a 'series' badge.",
      "Pages that don't share a topic with anything else are listed separately near the bottom - that's not a problem, it just means that page covers something unique.",
    ],
    readingIt: [
      "Pages are grouped by the words that make their topic UNIQUE, not just any shared words. Common words every page uses ('corporate', 'training', 'courses') are ignored automatically, so a page about 'big data' only groups with other big-data pages, not with every page that happens to use the word 'training'.",
      "Every page in a group is matched directly against that group's main page - pages are never chained together through a third page, so a group can't accidentally balloon into a mix of unrelated topics.",
      "The group's name comes from what ALL its pages share, not just the main page - so a series covering 51 countries is named after what they have in common, not one country's name.",
      "'Pillar + spokes' means one hub page (like a category) with several related pages pointing at it - link them together, don't merge them into one. 'Merge → redirect' means a few pages are near-duplicates and should become one page. A large family of similar pages (or a recognized series) is treated as intentionally separate content, so it says 'Make more different' instead - the tool never suggests merging dozens of distinct pages into one.",
      "The small tags under each page are the words it shares with the group's main page. The percentage is how closely its actual content matches - that's what keeps unrelated pages out of a group.",
      "The summary line reads 'N grouped · M unique pages' - a unique page isn't a problem, it just means nothing else on the site covers that exact topic yet.",
    ],
    troubleshoot: [
      { problem: "The page says 'No clusters found'", fix: "No topic had two or more pages that were similar enough to group. The result is cached for about 5 minutes - click 'Rescan' to check again right now." },
      { problem: "Two pages I know cover the same topic aren't grouped together", fix: "They don't share enough distinctive words, or their actual content isn't close enough. Pages that only share generic words like 'corporate training' are deliberately kept apart - grouping them was a bug we fixed." },
      { problem: "A blog series is split across several groups instead of one", fix: "Series are recognized by their web-address pattern. If a series isn't collapsing into one group, tell engineering - its pattern needs to be added to the list." },
      { problem: "A page I expected to see is missing completely", fix: "It may have been marked as broken or redirected by our automatic link checks, which excludes it from groups on purpose. It could also be on the exclusion list in Settings - some broken/redirected pages get added there automatically and will reappear on their own once fixed, or someone may have added it by hand." },
    ],
  },

  "/bulk-check": {
    title: "Bulk Check",
    what:
      "Runs the Conflict Checker on up to 100 web addresses or topics at once. Each one gets a verdict (block / review / pass), and you can download the results as a spreadsheet.",
    howToUse: [
      "Paste one web address or topic per line into the box - or upload a file with one per line.",
      "Choose how many to check at the same time (1 to 6). Higher is faster but more likely to hit a limit; 3 is a safe choice.",
      "Click 'Run all checks'. Watch the progress bar - each result appears in the table as soon as it's ready.",
      "Use the verdict filter or score slider to focus on the rows that need attention.",
      "Click 'Download CSV' once the run finishes, to hand the results to writers or leadership.",
    ],
    readingIt: [
      "Block (red) = score 80 or higher / publishing this would compete with an existing page.",
      "Review (amber) = score 60-79 / think about your angle before publishing.",
      "Pass (green) = score under 60 / fine to publish, but glance at the top match anyway.",
      "Error rows mean that one item had a problem (timeout, page not found, service busy). Everything else still gets checked normally.",
    ],
    troubleshoot: [
      { problem: "I get a 'Max 100 inputs per run' error", fix: "Split your list into groups of 100 or fewer and run them separately. This limit protects the AI budget." },
      { problem: "Lots of rows show 'error: rate-limited'", fix: "Lower the concurrency setting to 1-2 and run again - you're sending requests faster than the service allows." },
      { problem: "The 'Download CSV' button won't click", fix: "Wait for the run to finish - the button will say so. It also stays disabled if there's nothing to download yet." },
    ],
  },

  "/internal-links": {
    title: "Internal Links",
    what:
      "Suggests existing pages a new draft should link to. You can check the whole draft at once, or paragraph by paragraph.",
    howToUse: [
      "Pick a mode. 'Whole page' gives one ranked list for everything you paste in - it's the fastest option. 'Per paragraph' splits your text at blank lines and gives separate suggestions for each paragraph.",
      "Paste a web address, a topic, or - for per-paragraph mode - your draft text with a blank line between paragraphs.",
      "Click the suggest button. In per-paragraph mode you'll see one block of suggestions per paragraph.",
      "Copy the web address and suggested link text into your CMS.",
    ],
    readingIt: [
      "A higher match percentage means the pages are more closely related on topic - it doesn't automatically mean it's the best page to link to. A 60%-match course page can be a better choice than an 80%-match blog post.",
      "Each suggestion shows what kind of page it is (course / blog / category) - useful if you want a mix of link types.",
      "In per-paragraph mode, the same page can be suggested for more than one paragraph - it's up to you to decide where to actually use it.",
    ],
    troubleshoot: [
      { problem: "Per-paragraph mode says my paragraphs aren't long enough", fix: "Each paragraph needs at least 80 characters. Either write longer paragraphs, or paste fewer, longer ones with blank lines between them." },
      { problem: "The suggestions look too generic", fix: "Pasting the actual text works better than pasting a web address - fetching a page can pick up menu and footer text that drowns out the real topic. Try pasting the body text directly." },
      { problem: "It keeps suggesting the same popular pages no matter what I type", fix: "Your input is too short. Add 2-3 more specific keywords." },
    ],
  },

  "/audit": {
    title: "Content Audit",
    what:
      "Scans every page for common problems: bad titles/descriptions, broken links, duplicate titles, technical tagging mistakes, missing image descriptions, and pages that have gone quiet.",
    howToUse: [
      "Pick a tab: Meta / Link Audit / Duplicates / Health Score / Canonical / Images / Stale / Clusters.",
      "On Meta: filter by the type of issue (like 'title too long') to focus on one thing at a time.",
      "On Health Score: drag the slider or click a severity level to narrow the list.",
      "On Canonical: red 'missing' rows have no canonical tag set (a technical marker of the 'real' version of a page); amber rows point to a different web address than expected, which is often a template mistake.",
      "On Images: rows are sorted by how many images are missing alt text (a text description for accessibility and search). Click a web address to go fix it in the CMS.",
      "On Stale: shows pages with very little traffic that also haven't been updated in a long time - candidates to refresh or remove.",
      "On Clusters: two tables, one for courses and one for blogs, showing which topic groups may need more content. It's normal for the blog count in the course table to often read 0 - the two are organized differently on purpose.",
    ],
    readingIt: [
      "The Health Score is built from deductions: missing title, title too short, missing description, description too short, page not yet processed, too little content, broken page, or too little text overall.",
      "Severity levels: weak (under 60), medium (60-79), strong (80+).",
      "The Stale tab only fills in once Search Console data has been collected with a connected Google account.",
    ],
    troubleshoot: [
      { problem: "The Link Audit tab is empty even though I expect data", fix: "This check runs on its own schedule and only shows pages it's already tested. If it's empty, the check probably hasn't run yet - ask an admin, or wait for the next scheduled run." },
      { problem: "Link Audit only shows broken pages but I want to see working ones too", fix: "Click the 'ok' or 'redirect' filter chip at the top of the tab - the default view shows those too." },
      { problem: "The Canonical tab flags pages I think are fine", fix: "Website templates sometimes point the canonical tag at a slightly different web address (like with or without a trailing slash) by mistake. Check the actual page source to confirm." },
      { problem: "The Images tab shows 0 missing but I can see images without descriptions on the live page", fix: "That count only updates when a page is re-scanned. Ask an admin to re-scan it." },
    ],
  },

  // "/history" was removed here on purpose (§18J - the Score History page +
  // /api/check/history were deleted; don't re-add a help entry for a page
  // that no longer exists). Outcome-marking now happens inline elsewhere
  // (dashboard "Editorial outcomes", Manager View); /api/check/outcome remains.

  "/manager": {
    title: "Manager View",
    what:
      "A leadership-facing summary: how much checking activity happened this week, how many risky drafts were caught, and who on the team is actually using the tool. Found under 'Additional Tools' in the sidebar.",
    howToUse: [
      "Look at the four top numbers first - checks this week, risky drafts caught, content published, and drafts still needing a decision. Each shows whether it's up or down from last week.",
      "'Open high-risk' is the one number that's actually a to-do list, not just a stat - those are risky checks nobody has resolved yet.",
      "Scroll down to the activity table to see whether the team is actually using the tool, not just whether the numbers look good.",
    ],
    readingIt: [
      "'Shipped this week' counts published items among checks STARTED this week - a check started last week and published today won't count here. That's different from the Dashboard's numbers, which count by when something was resolved, not when it started. Don't compare the two directly.",
      "This page only shows this week versus last week - there's no longer trend chart here.",
    ],
    troubleshoot: [
      { problem: "Every number shows 0", fix: "Either nobody ran a check in the last 7 days, or the database isn't connected - check the Dashboard for the same warning." },
      { problem: "'Open high-risk' doesn't match what I see elsewhere", fix: "This number only counts risky checks that haven't been marked with an outcome yet. Once someone marks one as published/merged/redirected/discarded, it drops off this count." },
    ],
  },

  "/catalog-conflicts": {
    title: "Catalog Conflicts",
    what:
      "A saved snapshot of near-duplicate page pairs across the existing site. Use it to plan merges or redirects - it's not meant to block publishing. It's currently hidden from the main menu; Content Clusters is the actively maintained version of this idea.",
    howToUse: [
      "Pick a type to focus on: duplicate / competing / too-narrow / too-generic / overlapping.",
      "Use the similarity slider to drop low-confidence pairs.",
      "Click either page in a pair to look at it, then decide: merge, redirect, or leave it alone.",
    ],
    readingIt: [
      "'Competing' (85%+ similar, same intent) is the risky one for SEO - both pages fight for the same search result spot.",
      "'Duplicate' (95%+ similar and same page type) is usually a template mistake or a missing redirect.",
      "'Too narrow' / 'too generic' pairs mean one page is more specific than the other on the same topic.",
      "Pages already marked broken or redirected never show up here.",
    ],
    troubleshoot: [
      { problem: "The page is empty even though the site has been fully set up", fix: "This snapshot has to be built manually - there's no automatic schedule for it. An admin needs to run the build command." },
      { problem: "I see obviously unrelated pairs, like a contact form paired with a demo-booking page", fix: "That kind of junk should be filtered out automatically. If it's showing up, tell engineering - a filter may have been accidentally removed." },
    ],
  },

  "/search-console": {
    title: "Search Console",
    what:
      "Pulls in your Google Search Console data and turns it into views you can act on: competing pages, pages about to rank higher, titles worth rewriting, pages moving up or down, missed opportunities, content gaps, quiet pages, and indexing status.",
    howToUse: [
      "Click 'Connect Google' once (top right) and sign in with an account that has access to the site's Search Console.",
      "Pick a time range along the top: anywhere from 24 hours to 12 months.",
      "Switch tabs to answer different questions - for example, 'where can I rewrite a title to get more clicks?' or 'what's about to break into the top 3 results?'",
      "Use the lookup box at the top to check a single web address or search phrase without switching tabs.",
      "Click any row in 'Top pages' to see its full details - which searches bring it traffic, which countries and devices, and its trend over time.",
    ],
    readingIt: [
      "Countries are shown by their full name, not a code.",
      "The 'title rewrite candidates' tab flags searches where your page shows up but gets fewer clicks than expected for its position.",
      "The 'about to rank higher' tab flags pages sitting just outside the top results with enough search volume to be worth improving.",
    ],
    troubleshoot: [
      { problem: "I see a 'does not have sufficient permission' message", fix: "Either the connected Google account doesn't have access to this property, or the site address is set up slightly wrong. The error message lists which addresses the account CAN see." },
      { problem: "Clicking 'Connect Google' gives a redirect error", fix: "This needs an admin - the app's web address needs to be registered with Google, in two places." },
      { problem: "Every tab shows 0 data even though the site clearly gets traffic", fix: "Google Search data is usually 2-3 days behind. If the 24-hour view shows nothing, try 7 days or 28 days instead." },
    ],
  },

  "/competitors": {
    title: "Competitors",
    what:
      "Looks up who currently ranks for a topic in Google search results, so you can see how they're framing it and write something better.",
    howToUse: [
      "Type a topic (like 'leadership development') into the box and click Research.",
      "We pull the top search results, remove noise (video sites, forums, PDFs, and your own site), remove duplicate companies, and summarize what's left.",
      "Read each result's 'angle' - how that competitor is framing the topic - for ideas on how to differentiate.",
    ],
    readingIt: [
      "A known-competitor badge means that company is on our pre-set watchlist. Anything else is a 'new face' worth a second look.",
      "Results from the same big website are combined into one entry, so you see a spread of different competitors instead of six articles from one site.",
    ],
    troubleshoot: [
      { problem: "I get a 'key is not set' error", fix: "An admin needs to add a search-data subscription key to the site's settings." },
      { problem: "I keep seeing the same competitors no matter what I search", fix: "Try a more specific topic - broad searches tend to surface the same big, well-known sites every time." },
    ],
  },

  "/corpus": {
    title: "Corpus",
    what:
      "A browsable list of every page the Conflict Checker compares against - this is the full 'search space' the tool knows about.",
    howToUse: [
      "Use the filter buttons to narrow by page type, course type, category, or tag.",
      "Search by title or web address in the search box.",
      "Click any row's web address to open the live page in a new tab.",
      "The 'Signals' column shows at a glance whether a page is an Owner page, a Stale page, missing image descriptions, or pointing somewhere unexpected.",
    ],
    readingIt: [
      "The 'Clicks 28d' column updates automatically each weekday. Bold numbers mean 100+ clicks - real traffic.",
      "'Owner' means this is the chosen best page for its topic. 'Stale' means low traffic plus no recent updates. 'Alt: N' means N images are missing descriptions. A canonical badge means this page points somewhere else as its 'real' version.",
    ],
    troubleshoot: [
      { problem: "A row says 'not embedded'", fix: "That page failed to process - usually because it's missing, timed out, or has very little content. Ask an admin to reprocess it." },
      { problem: "The counts at the top don't add up to the total", fix: "That's expected until the home page (a single row) is included too - the 'All' count is the accurate one." },
    ],
  },

  "/keyword-cannibalization": {
    title: "Keyword Cannibalization",
    what:
      "Finds search terms where two or more of your own pages are competing against each other, based on the last 3 full months of Search Console data. Each conflict gets a severity level, a page to keep, and a suggested action.",
    howToUse: [
      "Pick a tab: 'Nearer avg position' (the two pages are close enough in ranking that Google keeps swapping them - fix this first), 'No position limit' (every competing pair, however far apart), 'Course / other-page conflicts' (a different type of page is outranking a course), or 'Blogs to merge' (near-duplicate blog posts worth combining - found a different way, not by search term).",
      "Use the search box, the severity/action/status filters, and the sort options to narrow the list.",
      "Click a conflict to see every page competing for that search term, with its clicks, impressions, click rate, and ranking.",
      "Set a status (pending / in progress / done / ignored) and an optional note on each conflict. You can select several at once and set their status together.",
      "Click 'Rescan' to refresh the data right now - it otherwise updates automatically every weekday morning (not on weekends).",
    ],
    readingIt: [
      "Severity (high/medium/low) considers how close the two pages rank AND how much is at stake, not just how similar they are.",
      "'Blogs to merge' comes from the same engine as Content Clusters, not from search-term data - so it can catch pairs the other three tabs would miss.",
      "Broken or removed pages are automatically dropped from every conflict, checked fresh each time you open the page. If a conflict drops to a single live page, it disappears entirely.",
    ],
    troubleshoot: [
      { problem: "The page says 'Not computed yet'", fix: "Click 'Rescan', or go to Settings → Keyword Cannibalization data → 'Rescan now'." },
      { problem: "A page I know is broken still shows up in a conflict", fix: "This check depends on a broken-page list that updates once a day - a page that just broke may take up to a day to disappear. This is a different system than the exclusion list on the Settings page, which only affects Content Clusters and the Conflict Checker, not this page." },
      { problem: "My status or note change doesn't seem to save", fix: "Watch for an error message in the corner - a failed save now tells you instead of failing silently. Try again; if it keeps failing, the database may be unreachable." },
    ],
  },

  "/strategy": {
    title: "Funnel Strategy",
    what:
      "Shows how well your content covers each stage of the buying journey - awareness, consideration, and ready-to-buy - broken down by course type and category. Flags groups that have sales-ready pages but nothing earlier in the journey feeding them.",
    howToUse: [
      "Read the overall mix at the top for the big picture.",
      "Check 'By course type' for course types that are lopsided - heavy on ready-to-buy content but thin on awareness content.",
      "Scroll the table and look at the 'Gaps' column - any group missing a stage is flagged there.",
    ],
    readingIt: [
      "Blog posts count as awareness content, categories count as consideration content, and courses count as ready-to-buy content. Pages that don't fit one of these types aren't counted in the mix.",
      "A group that's heavy on ready-to-buy content but thin everywhere else usually means it needs more awareness-stage content written for it - that's a content opportunity, not a data mistake.",
      "The click count next to each group is a rough guide to which gaps are worth fixing first - bigger numbers mean bigger opportunity.",
    ],
    troubleshoot: [
      { problem: "The page says the database isn't reachable", fix: "Same underlying issue as every other data page on this site - the database connection is down." },
      { problem: "A course type I know exists isn't in the 'By course type' table", fix: "That table only includes pages that have a course type set. It still counts toward the overall mix at the top if its page type maps to a stage." },
    ],
  },

  "/settings": {
    title: "Settings",
    what:
      "Where the team configures the tool: how strictly Content Clusters groups pages, manual refresh buttons for the automatic data updates, syncing the page list, and the exclusion lists that hide certain pages or search terms from comparisons.",
    howToUse: [
      "Content Clusters tuning: adjust the sliders, click Save, then go rescan Content Clusters to see the effect - saving here doesn't update an already-finished scan on its own.",
      "Search Console data / Keyword Cannibalization data / Link Audit: each card shows when it last updated and has a 'Run now' button. Search Console and Keyword Cannibalization always update together, automatically, every weekday morning (not weekends). Link Audit updates every day, including weekends, on its own separate schedule. Use 'Run now' when you need fresh data immediately - you don't need to do this routinely.",
      "Sitemap sync: check first to see how many live pages are missing from the Database, then sync to add them.",
      "Exclusion lists: give it a name, add one or more patterns (part of a web address, a full web address, or a search-term keyword), choose the type, and Save. You can turn a rule on/off without deleting it, or edit it any time.",
      "'Currently excluded URLs' shows exactly which pages are hidden right now, newest first - each one shows which rule hid it and when. Click 'Remove' on any of them to bring that one page back (it moves down to 'Manually re-included pages', and stays visible even if a rule would otherwise still catch it).",
    ],
    readingIt: [
      "Web-address rules only hide pages from Content Clusters and the Conflict Checker - the page still shows up everywhere else, including the Database and Search Console.",
      "Search-term rules only hide matching keywords from the Content Clusters top-searches panel.",
      "The rule named 'Auto: dead/redirected pages (link audit)' is managed automatically - its list gets fully rebuilt every day, so a page that gets fixed will quietly disappear from it on its own. Don't edit its list by hand; turn the whole rule off instead if you want to pause it.",
    ],
    troubleshoot: [
      { problem: "My Content Clusters tuning changes don't seem to do anything", fix: "Go rescan Content Clusters after saving here - it remembers its last scan for about 5 minutes, and your new settings only apply to the next one." },
      { problem: "A page I excluded still shows up somewhere", fix: "Exclusions only affect Content Clusters and the Conflict Checker. It's expected to still show up in the Database, Search Console, and Keyword Cannibalization - that page hides broken pages a different way (see its own Help panel)." },
      { problem: "'Last run' for Search Console / Cannibalization / Link Audit never changes", fix: "Click 'Run now' to update it immediately. If that gives an error, the database may be unreachable; Search Console also needs a connected Google account." },
      { problem: "Link Audit never seems to run on its own", fix: "It runs from GitHub, not from this app, and needs two settings configured there first. Use the 'Run now' button here in the meantime, and ask an admin to check the GitHub setup." },
    ],
  },
};
