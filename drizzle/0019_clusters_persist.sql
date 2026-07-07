-- §17: persist the live Content Clusters scan so cluster membership survives
-- between /api/groups computations. The `clusters` table + pages.cluster_id
-- already exist (drizzle/0002_audit.sql: id, label, size, created_at); this adds
-- the columns /api/groups needs to store its per-cluster metadata. Idempotent.

ALTER TABLE clusters ADD COLUMN IF NOT EXISTS action      text;
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS winner_url  text;
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS computed_at timestamp DEFAULT now();
