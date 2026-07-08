-- Blog Master Data signals (§33). Adds the editorial/source-of-truth fields the
-- crawler cannot reliably reconstruct, plus section-level chunk embeddings that
-- fix the 12k-char embedding-truncation blind spot (almost every blog exceeds it).
-- All new pages columns are nullable, so the rest of the corpus is unaffected.
-- Idempotent (IF NOT EXISTS everywhere). See scripts/import-blog-master.ts.

ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_title     text;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS headings       jsonb;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS internal_links text[];
ALTER TABLE pages ADD COLUMN IF NOT EXISTS outbound_links text[];
ALTER TABLE pages ADD COLUMN IF NOT EXISTS word_count     integer;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS table_count    integer;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_hash   text;

-- Section-level embeddings: one row per H2 section of a page. This is the 5th
-- place vector(384) is encoded (see AGENTS.md "Embedding dimension") - a model
-- swap must widen this too.
CREATE TABLE IF NOT EXISTS page_chunks (
  id          serial PRIMARY KEY,
  page_id     integer REFERENCES pages(id) ON DELETE CASCADE,
  url         text NOT NULL,
  heading     text,
  chunk_index integer NOT NULL,
  chunk_text  text NOT NULL,
  embedding   vector(384),
  token_count integer,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_chunks_page_idx ON page_chunks (page_id);
CREATE UNIQUE INDEX IF NOT EXISTS page_chunks_url_index_uq ON page_chunks (url, chunk_index);
CREATE INDEX IF NOT EXISTS page_chunks_embedding_idx ON page_chunks USING hnsw (embedding vector_cosine_ops);
