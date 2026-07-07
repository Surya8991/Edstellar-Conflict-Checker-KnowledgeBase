-- Editable exclusion list (PROJECTLOG §17P): blog series to hide from the
-- ANALYSIS features (Content Clusters + Conflict Checker matches). Pages stay in
-- the corpus/Database and in GSC - this is a display/query filter only. Managed
-- from the Settings page (/settings).
CREATE TABLE IF NOT EXISTS excluded_series (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  -- Slug substrings; a URL is excluded if it contains ANY of them (case-insensitive).
  patterns   text[] NOT NULL DEFAULT '{}',
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed the two series the user asked for, only when the table is empty.
INSERT INTO excluded_series (name, patterns)
SELECT v.name, v.patterns FROM (VALUES
  ('In-Demand Skills', ARRAY['skills-in-demand-in-', 'in-demand-skills', 'most-in-demand']),
  ('Corporate Training Companies in [Country]', ARRAY['corporate-training-companies-'])
) AS v(name, patterns)
WHERE NOT EXISTS (SELECT 1 FROM excluded_series);
