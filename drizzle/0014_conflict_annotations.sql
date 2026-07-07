-- Per-conflict editorial annotations for the Keyword Cannibalization page:
-- a workflow status + a free-text note. Keyed by the conflict's `query` (the
-- group identity), so annotations survive re-snapshots of keyword_conflicts.
CREATE TABLE IF NOT EXISTS conflict_annotations (
  id         serial PRIMARY KEY,
  query      text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'pending',   -- pending | in-progress | completed | ignored
  note       text NOT NULL DEFAULT '',          -- capped at 300 chars in the API
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conflict_annotations_status_idx ON conflict_annotations (status);
