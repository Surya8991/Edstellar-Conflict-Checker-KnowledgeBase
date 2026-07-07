-- Editable key-value app settings (PROJECTLOG §17R): project knobs a user can
-- change from the Settings page instead of env/code. Currently the Content
-- Clusters tuning (topic overlap / body floor / merge-max-size). Reads fall back
-- to the lib/thresholds.ts defaults when a key is absent.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);
