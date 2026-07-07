-- §18: impression-weighted position variance per conflict group (SERP volatility).
-- Computed in lib/cannibalization.classifyGroup and stored on the snapshot row.
-- Idempotent.

ALTER TABLE keyword_conflicts ADD COLUMN IF NOT EXISTS position_variance real;
