import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  vector,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Embedding dimension. Local model (bge-small-en-v1.5) = 384.
// When switching to OpenAI text-embedding-3-small (1536), run the documented
// re-embed migration that recreates this column at the new dimension.
export const EMBED_DIM = 384;

/** The existing-content corpus we compare new content against. */
export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    title: text("title"),
    metaDescription: text("meta_description"),
    h1: text("h1"),
    contentText: text("content_text"),
    // course | blog | category | subcategory | page
    contentType: text("content_type").default("page"),
    category: text("category"),
    subcategory: text("subcategory"),
    lastmod: text("lastmod"),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    tokenCount: integer("token_count"),
    crawledAt: timestamp("crawled_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("pages_url_idx").on(t.url),
    index("pages_content_type_idx").on(t.contentType),
    // Cosine-distance ANN index. Created in the migration via raw SQL too.
    index("pages_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

/** One conflict-check run (URL or topic input). */
export const checks = pgTable("checks", {
  id: serial("id").primaryKey(),
  inputType: text("input_type").notNull(), // url | topic
  inputValue: text("input_value").notNull(),
  summary: text("summary"),
  keywords: text("keywords"), // JSON array string
  candidateEmbedding: vector("candidate_embedding", { dimensions: EMBED_DIM }),
  topScore: real("top_score"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Per-check ranked matches against the corpus. */
export const checkMatches = pgTable(
  "check_matches",
  {
    id: serial("id").primaryKey(),
    checkId: integer("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    pageId: integer("page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    pageUrl: text("page_url"),
    pageTitle: text("page_title"),
    similarity: real("similarity"), // cosine 0..1
    conflictScore: integer("conflict_score"), // 0..100
    conflictType: text("conflict_type"), // duplicate | cannibalization | partial-overlap | none
    rationale: text("rationale"),
    rank: integer("rank"),
  },
  (t) => [index("check_matches_check_idx").on(t.checkId)],
);

/** Stored Google Search Console OAuth tokens. */
export const gscConnections = pgTable("gsc_connections", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  siteUrl: text("site_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiry: timestamp("expiry"),
  scope: text("scope"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Cached GSC Search Analytics rows. */
export const gscMetrics = pgTable(
  "gsc_metrics",
  {
    id: serial("id").primaryKey(),
    siteUrl: text("site_url"),
    page: text("page"),
    query: text("query"),
    clicks: real("clicks"),
    impressions: real("impressions"),
    ctr: real("ctr"),
    position: real("position"),
    date: text("date"),
    rangeLabel: text("range_label"),
    fetchedAt: timestamp("fetched_at").defaultNow(),
  },
  (t) => [index("gsc_metrics_date_page_idx").on(t.date, t.page)],
);

/** Precomputed near-duplicate page pairs across the corpus. */
export const catalogConflicts = pgTable(
  "catalog_conflicts",
  {
    id: serial("id").primaryKey(),
    aId: integer("a_id"),
    aUrl: text("a_url"),
    aTitle: text("a_title"),
    aType: text("a_type"),
    bId: integer("b_id"),
    bUrl: text("b_url"),
    bTitle: text("b_title"),
    bType: text("b_type"),
    similarity: real("similarity"),
    pairType: text("pair_type"),
    computedAt: timestamp("computed_at").defaultNow(),
  },
  (t) => [index("catalog_conflicts_sim_idx").on(t.similarity)],
);

/** Competitor research results per topic. */
export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  competitorUrl: text("competitor_url"),
  title: text("title"),
  summary: text("summary"),
  domain: text("domain"),
  estAuthority: text("est_authority"),
  isKnownCompetitor: integer("is_known_competitor").default(0),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Check = typeof checks.$inferSelect;
export type CheckMatch = typeof checkMatches.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
