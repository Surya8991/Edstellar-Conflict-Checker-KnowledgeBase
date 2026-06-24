import type { EmbeddingProvider } from "./types";

// Lazy-loaded Transformers.js feature-extraction pipeline.
// bge-small-en-v1.5 → 384-dimensional sentence embeddings, runs in Node, no key.
let pipePromise: Promise<any> | null = null;

async function getPipe() {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Allow remote model download (cached under node_modules/.cache) on first run.
      env.allowLocalModels = false;
      return pipeline("feature-extraction", "Xenova/bge-small-en-v1.5");
    })();
  }
  return pipePromise;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local:bge-small-en-v1.5";
  readonly dimensions = 384;

  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await getPipe();
    const out: number[][] = [];
    for (const text of texts) {
      const res = await pipe(text.slice(0, 8000), {
        pooling: "mean",
        normalize: true,
      });
      out.push(Array.from(res.data as Float32Array));
    }
    return out;
  }
}
