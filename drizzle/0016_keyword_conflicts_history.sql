-- §18: keyword-cannibalization trend history. One row per (query, snapshot_date)
-- so the daily snapshot writes today's severity/traffic/gap and the trend can be
-- charted over time. Written by lib/cannibalization-snapshot.ts after the main
-- keyword_conflicts full-refresh. Idempotent.

CREATE TABLE IF NOT EXISTS keyword_conflicts_history (
  id                serial PRIMARY KEY,
  site_url          text,
  query             text NOT NULL,
  snapshot_date     date NOT NULL,
  severity          text,
  total_clicks      integer,
  total_impressions integer,
  position_gap      real,
  best_position     real,
  page_count        integer,
  computed_at       timestamp DEFAULT now(),
  UNIQUE (query, snapshot_date)
);

CREATE INDEX IF NOT EXISTS keyword_conflicts_history_query_date_idx
  ON keyword_conflicts_history (query, snapshot_date);
