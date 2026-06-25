import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opt these out of Next's Server Components bundler — load them at runtime
  // via native `require` instead. @xenova/transformers, jsdom, and
  // onnxruntime-node are already on Next 16's default opt-out list but listing
  // them explicitly documents the dependency and is harmless. cheerio and
  // googleapis are NOT on the default list.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md
  serverExternalPackages: [
    "@xenova/transformers",
    "onnxruntime-node",
    "jsdom",
    "cheerio",
    "googleapis",
  ],

  // Ship runtime assets that @vercel/nft's static analyzer cannot trace:
  //   - data/**/*           — lib/sitemap.ts + lib/taxonomy.ts + lib/gsc-insights.ts
  //                            do readFileSync(join(process.cwd(),"data",…)) at runtime;
  //                            the dynamic path means nft never sees these files.
  //   - onnxruntime-node    — native .node + libonnxruntime.so binaries that
  //                            @xenova/transformers loads via dlopen; nft sees
  //                            the JS but not the platform binaries it picks at
  //                            runtime. Without this Vercel returns
  //                            "libonnxruntime.so.1.14.0: cannot open shared object file"
  //                            on every /api/check call.
  //   - @xenova/transformers tokenizer/config JSON — same problem, the loader
  //                            reads model JSON via dynamic paths.
  // Applied to /* (all routes) for simplicity; the trace cost is dominated by
  // the binaries which are <100MB and only counted once per function.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  outputFileTracingIncludes: {
    "/*": [
      "data/**/*",
      "node_modules/onnxruntime-node/bin/**/*",
      "node_modules/@xenova/transformers/**/*.json",
    ],
  },
};

export default nextConfig;
