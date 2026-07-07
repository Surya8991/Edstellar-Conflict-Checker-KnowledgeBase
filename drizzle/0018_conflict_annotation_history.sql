-- §18J: audit trail for conflict annotation changes. One append-only row per
-- status/note change (single or bulk), written by
-- app/api/cannibalization/annotation POST after each successful upsert.
-- Idempotent.

CREATE TABLE IF NOT EXISTS conflict_annotation_history (
  id         serial PRIMARY KEY,
  query      text NOT NULL,
  status     text,
  note       text,
  changed_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conflict_annotation_history_query_idx
  ON conflict_annotation_history (query, changed_at);
