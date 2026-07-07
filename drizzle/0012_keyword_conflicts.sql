-- Keyword Cannibalization (PROJECTLOG §18): pre-computed query→pages conflicts,
-- populated from a GSC ["query","page"] pull by lib/cannibalization-snapshot.ts
-- (Job 5 of the daily gsc-snapshot cron, or `npm run cannibalization`).
-- One row per conflicting query. `pages` holds the per-page breakdown (jsonb).
CREATE TABLE IF NOT EXISTS keyword_conflicts (
  id                 serial PRIMARY KEY,
  site_url           text,
  query              text NOT NULL,
  range_label        text NOT NULL DEFAULT '3m',
  total_clicks       integer NOT NULL DEFAULT 0,
  total_impressions  integer NOT NULL DEFAULT 0,
  page_count         integer NOT NULL DEFAULT 0,
  position_gap       real,      -- avg-position gap between the top-2 pages
  best_position      real,      -- best (lowest) avg position in the group
  cross_type         boolean NOT NULL DEFAULT false,  -- pages span >= 2 content types
  branded            boolean NOT NULL DEFAULT false,  -- query contains a brand term
  commercial_at_risk boolean NOT NULL DEFAULT false,  -- a course/category is outranked by a lesser page
  severity           text NOT NULL DEFAULT 'low',     -- high | medium | low
  primary_page       text,      -- the page recommended to win/keep
  recommended_action text,      -- consolidate | protect-commercial | differentiate | monitor
  pages              jsonb NOT NULL DEFAULT '[]',
  computed_at        timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS keyword_conflicts_range_sev_idx ON keyword_conflicts (range_label, severity);
CREATE INDEX IF NOT EXISTS keyword_conflicts_query_idx ON keyword_conflicts (query);
