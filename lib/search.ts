import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface VectorMatch {
  id: number;
  url: string;
  title: string | null;
  contentType: string | null;
  snippet: string;
  similarity: number; // cosine similarity 0..1
}

/** Format a JS number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Cosine-nearest pages to a query embedding, using pgvector's <=> operator.
 * similarity = 1 - cosine_distance. Excludes an optional URL (self-match).
 */
export async function vectorSearchPages(
  embedding: number[],
  opts: { limit?: number; excludeUrl?: string } = {},
): Promise<VectorMatch[]> {
  const limit = opts.limit ?? 10;
  const vec = toVectorLiteral(embedding);
  const exclude = opts.excludeUrl ?? "";

  const rows = await db.execute(sql`
    SELECT id, url, title, content_type,
           left(coalesce(content_text, meta_description, ''), 600) AS snippet,
           1 - (embedding <=> ${vec}::vector) AS similarity
    FROM pages
    WHERE embedding IS NOT NULL
      AND url <> ${exclude}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${limit}
  `);

  const data: any[] = (rows as any).rows ?? (rows as any);
  return data.map((r: any) => ({
    id: Number(r.id),
    url: r.url,
    title: r.title,
    contentType: r.content_type,
    snippet: r.snippet ?? "",
    similarity: Number(r.similarity),
  }));
}
