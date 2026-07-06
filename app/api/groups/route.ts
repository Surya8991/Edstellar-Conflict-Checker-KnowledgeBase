import { NextRequest, NextResponse } from "next/server";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { rowsOf } from "@/lib/db/exec";
import { connectedComponents, type Edge } from "@/lib/cluster";
import { classifyIntent } from "@/lib/intent";
import { pageAuthority, pickWinner, groupAction, type AuthorityInput } from "@/lib/resolution";
import { fetchInboundCounts } from "@/lib/inbound-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/groups — group similar pages (Stage 6+7+8 of
 * plans/01-conflict-automation.md).
 *
 * Reads the precomputed near-duplicate pairs (catalog_conflicts), builds
 * connected components (topic clusters), then for each cluster attaches the
 * deterministic winner (internal-link authority + depth + URL cleanliness) and
 * a cluster-level action (merge / consolidate / differentiate).
 *
 * Query: ?minSize=2 (default 2), ?limit=50 (max groups returned).
 * Session-gated by the auth proxy like the rest of the dashboard.
 */
interface PairRow {
  a_url: string; a_title: string | null; a_type: string | null;
  b_url: string; b_title: string | null; b_type: string | null;
  similarity: number; pair_type: string | null;
}
export async function GET(request: NextRequest) {
  try {
    const p = new URL(request.url).searchParams;
    const minSize = Math.max(2, Number(p.get("minSize")) || 2);
    const limit = Math.min(Math.max(Number(p.get("limit")) || 50, 1), 200);

    const pairs = rowsOf<PairRow>(await db.execute(sql`
      SELECT a_url, a_title, a_type, b_url, b_title, b_type, similarity, pair_type
      FROM catalog_conflicts
    `));
    if (pairs.length === 0) {
      return NextResponse.json({ groups: [], totalGroups: 0, totalPairs: 0 });
    }

    // 1. Connected components over the pair graph.
    const edges: Edge[] = pairs.map((r) => [r.a_url, r.b_url] as Edge);
    const components = connectedComponents(edges).filter((g) => g.length >= minSize);

    // 2. Metadata for every member: title/type from the pair rows, plus
    //    token_count (depth) from pages and inbound-link counts (authority).
    const meta = new Map<string, { title: string | null; type: string | null }>();
    for (const r of pairs) {
      if (!meta.has(r.a_url)) meta.set(r.a_url, { title: r.a_title, type: r.a_type });
      if (!meta.has(r.b_url)) meta.set(r.b_url, { title: r.b_title, type: r.b_type });
    }
    const memberUrls = [...new Set(components.flat())];
    const tokenByUrl = new Map<string, number | null>();
    if (memberUrls.length) {
      const rows = await db
        .select({ url: pages.url, tokenCount: pages.tokenCount })
        .from(pages)
        .where(inArray(pages.url, memberUrls));
      for (const r of rows) tokenByUrl.set(r.url, r.tokenCount);
    }
    const inbound = memberUrls.length ? await fetchInboundCounts(memberUrls) : {};

    // Strongest similarity within each component, keyed by root member set.
    const maxSimByPair = new Map<string, number>();
    for (const r of pairs) {
      const key = [r.a_url, r.b_url].sort().join("|");
      maxSimByPair.set(key, Math.max(maxSimByPair.get(key) ?? 0, Number(r.similarity)));
    }
    const pairTypeByPair = new Map<string, string>();
    for (const r of pairs) {
      const key = [r.a_url, r.b_url].sort().join("|");
      if (r.pair_type) pairTypeByPair.set(key, r.pair_type);
    }

    // 3. Assemble each group with winner + action.
    const groups = components.map((urls) => {
      const authorities: AuthorityInput[] = urls.map((url) => ({
        url,
        inbound: inbound[url] ?? 0,
        tokenCount: tokenByUrl.get(url) ?? null,
        clicks: null,
      }));
      const winner = authorities.reduce((best, cur) => pickWinner(best, cur));

      const intents = urls.map((url) => {
        const m = meta.get(url);
        return classifyIntent({ title: m?.title, slug: url, contentType: m?.type }).label;
      });

      // Max similarity among edges whose BOTH ends are in this group.
      let maxSim = 0;
      const pairTypes = new Set<string>();
      const set = new Set(urls);
      for (const [key, sim] of maxSimByPair) {
        const [a, b] = key.split("|");
        if (set.has(a) && set.has(b)) {
          maxSim = Math.max(maxSim, sim);
          const pt = pairTypeByPair.get(key);
          if (pt) pairTypes.add(pt);
        }
      }

      const action = groupAction(maxSim, intents);

      const members = urls
        .map((url, i) => ({
          url,
          title: meta.get(url)?.title ?? null,
          type: meta.get(url)?.type ?? null,
          intent: intents[i],
          inbound: inbound[url] ?? 0,
          tokens: tokenByUrl.get(url) ?? null,
          authority: Number(pageAuthority(authorities[i]).toFixed(4)),
          isWinner: url === winner.url,
        }))
        .sort((a, b) => b.authority - a.authority);

      return {
        size: urls.length,
        maxSimilarity: Number(maxSim.toFixed(4)),
        action,
        winnerUrl: winner.url,
        pairTypes: [...pairTypes],
        members,
      };
    });

    // Sort: biggest, then most-similar, first.
    groups.sort((a, b) => b.size - a.size || b.maxSimilarity - a.maxSimilarity);

    return NextResponse.json({
      totalGroups: groups.length,
      totalPairs: pairs.length,
      groups: groups.slice(0, limit),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, groups: [] }, { status: 500 });
  }
}
