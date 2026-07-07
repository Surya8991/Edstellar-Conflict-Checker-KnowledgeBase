-- Remove the "money page" concept: the commercial-at-risk signal and the
-- protect-commercial action are gone from the app. Drop the now-unused column.
-- Stored recommended_action = 'protect-commercial' rows are harmless: the API
-- re-classifies every group at read time, so they surface as monitor/differentiate.
ALTER TABLE keyword_conflicts DROP COLUMN IF EXISTS commercial_at_risk;
