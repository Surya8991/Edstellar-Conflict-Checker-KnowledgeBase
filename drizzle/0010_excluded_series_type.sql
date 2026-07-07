-- Exclusions v2 (PROJECTLOG §17Q): a second exclusion type. 'url' = slug
-- substring / full-URL patterns (hide pages from Clusters + Conflict Checker);
-- 'query' = GSC keyword-query patterns (hide queries from the clusters GSC panel).
ALTER TABLE excluded_series ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'url';
