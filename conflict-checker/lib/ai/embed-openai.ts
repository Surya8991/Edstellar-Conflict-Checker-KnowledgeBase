import type { EmbeddingProvider } from "./types";

// Inert until OPENAI_API_KEY is set. Wired so switching AI_EMBED_PROVIDER=openai
// works with no business-logic changes. Note: 1536 dims — requires the
// documented re-embed migration to widen pages.embedding from 384 to 1536.
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai:text-embedding-3-small";
  readonly dimensions = 1536;
  private model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

  async embed(texts: string[]): Promise<number[][]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is not set. Keep AI_EMBED_PROVIDER=local until you add a key.",
      );
    }
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts.map((t) => t.slice(0, 8000)),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}
