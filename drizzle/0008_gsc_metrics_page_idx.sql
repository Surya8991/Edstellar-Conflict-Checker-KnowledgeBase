-- Content Clusters GSC panel (PROJECTLOG §17O): the clusters route reads
-- gsc_metrics by page (WHERE page = ANY(...)) for every clustered member, so an
-- index on `page` keeps that batch read fast. Also created idempotently by
-- lib/gsc-metrics.ensureGscMetricsIndex, so this migration is belt-and-braces.
CREATE INDEX IF NOT EXISTS gsc_metrics_page_idx ON gsc_metrics (page);
