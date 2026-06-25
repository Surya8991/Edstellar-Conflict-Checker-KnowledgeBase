/**
 * SERP overlap, domain comparison, content freshness — built on top of the
 * existing Serper integration + corpus + competitor sitemap fetches.
 */
import { KNOWN_COMPETITORS } from "@/lib/competitors";
import { fetchAndExtract } from "@/lib/extract";

interface SerpOrganic { title: string; link: string; snippet?: string; position?: number }
interface SerpAiOverview {
  summary?: string;
  citations?: { title?: string; link?: string; snippet?: string }[];
}
interface SerperResponse {
  organic?: SerpOrganic[];
  /** Serper has used several field names for AI Overviews — handle both. */
  aiOverview?: SerpAiOverview;
  aiOverviews?: SerpAiOverview | SerpAiOverview[];
  answerBox?: { title?: string; link?: string; snippet?: string };
}

async function serperSearch(query: string, num = 10): Promise<SerperResponse> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not set.");
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "content-type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper failed: ${res.status}`);
  return (await res.json()) as SerperResponse;
}

function pickAiOverview(r: SerperResponse): SerpAiOverview | undefined {
  if (r.aiOverview) return r.aiOverview;
  if (Array.isArray(r.aiOverviews)) return r.aiOverviews[0];
  if (r.aiOverviews) return r.aiOverviews;
  return undefined;
}

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "") } catch { return "" } };

/** SERP overlap: for a topic, which competitor URLs rank in top-10 and is Edstellar there? */
export interface SerpOverlapResult {
  topic: string;
  organic: { rank: number; url: string; domain: string; title: string; isEdstellar: boolean; isKnown: boolean }[];
  edstellarRank: number | null;
  edstellarUrl: string | null;
  competitorsInTop10: string[];
  /** Google AI Overview citations for this query, if Google surfaced one. */
  aiOverview: {
    summary: string;
    citations: { domain: string; url: string; title: string; isEdstellar: boolean; isKnown: boolean }[];
    edstellarCited: boolean;
  } | null;
}
export async function serpOverlap(topic: string): Promise<SerpOverlapResult> {
  const res = await serperSearch(topic, 10);
  const organic = res.organic ?? [];
  const list = organic.map((o, i) => ({
    rank: o.position ?? i + 1,
    url: o.link,
    domain: domainOf(o.link),
    title: o.title,
    isEdstellar: domainOf(o.link).includes("edstellar"),
    isKnown: KNOWN_COMPETITORS.includes(domainOf(o.link)),
  }));
  const eds = list.find((r) => r.isEdstellar);
  const compDomains = Array.from(new Set(list.filter((r) => !r.isEdstellar).map((r) => r.domain)));

  const ai = pickAiOverview(res);
  const aiOverview = ai
    ? {
        summary: ai.summary ?? "",
        citations: (ai.citations ?? [])
          .filter((c) => !!c.link)
          .map((c) => ({
            domain: domainOf(c.link!),
            url: c.link!,
            title: c.title ?? c.snippet ?? c.link!,
            isEdstellar: domainOf(c.link!).includes("edstellar"),
            isKnown: KNOWN_COMPETITORS.includes(domainOf(c.link!)),
          })),
        edstellarCited: (ai.citations ?? []).some((c) => c.link && domainOf(c.link).includes("edstellar")),
      }
    : null;

  return {
    topic,
    organic: list,
    edstellarRank: eds?.rank ?? null,
    edstellarUrl: eds?.url ?? null,
    competitorsInTop10: compDomains,
    aiOverview,
  };
}

/**
 * Domain comparison: how many top-10 placements each competitor has across
 * a list of topics (vs Edstellar). Free-tier-friendly: cap topics at 8.
 */
export interface DomainCompareRow { domain: string; appearances: number; topRank: number | null }
export async function domainCompare(topics: string[]): Promise<{ topics: string[]; rows: DomainCompareRow[] }> {
  const trimmed = topics.slice(0, 8);
  const all = await Promise.all(
    trimmed.map((t) =>
      serperSearch(t, 10).catch(() => ({ organic: [] } as SerperResponse)),
    ),
  );
  const tally = new Map<string, { count: number; topRank: number | null }>();
  for (const resp of all) {
    (resp.organic ?? []).forEach((o, i) => {
      const d = domainOf(o.link);
      if (!d) return;
      const e = tally.get(d) ?? { count: 0, topRank: null };
      e.count++;
      e.topRank = e.topRank == null ? i + 1 : Math.min(e.topRank, i + 1);
      tally.set(d, e);
    });
  }
  const rows: DomainCompareRow[] = [...tally.entries()]
    .map(([domain, v]) => ({ domain, appearances: v.count, topRank: v.topRank }))
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 25);
  return { topics: trimmed, rows };
}

/**
 * Content-freshness audit: pull a competitor's sitemap and report
 * how fresh / how many URLs they have, vs Edstellar's known sitemap-size.
 */
export interface FreshnessResult {
  domain: string;
  totalUrls: number;
  recent90d: number;
  oldest: string | null;
  newest: string | null;
  sample: { url: string; lastmod: string }[];
}
export async function competitorFreshness(domain: string): Promise<FreshnessResult> {
  const root = domain.startsWith("http") ? domain : `https://${domain}`;
  const candidates = [
    `${root}/sitemap.xml`,
    `${root}/sitemap_index.xml`,
    `${root}/sitemap-index.xml`,
  ];
  let xml = "";
  let chosen = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) { xml = await res.text(); chosen = url; break }
    } catch { /* try next */ }
  }
  if (!xml) throw new Error(`Could not fetch sitemap for ${domain}.`);
  // If it's a sitemap index, follow the first child.
  if (/<sitemapindex/i.test(xml)) {
    const first = xml.match(/<loc>([^<]+)<\/loc>/i)?.[1];
    if (first) {
      try {
        const r2 = await fetch(first, { signal: AbortSignal.timeout(15_000) });
        if (r2.ok) xml = await r2.text();
      } catch { /* fallthrough */ }
    }
  }
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => {
    const block = m[1];
    return {
      url: (block.match(/<loc>([^<]+)<\/loc>/i)?.[1] ?? "").trim(),
      lastmod: (block.match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1] ?? "").trim().slice(0, 10),
    };
  }).filter((e) => e.url);

  const now = Date.now();
  const recent90d = entries.filter((e) => {
    if (!e.lastmod) return false;
    const t = Date.parse(e.lastmod);
    return !isNaN(t) && now - t < 90 * 86_400_000;
  }).length;
  const dates = entries.map((e) => e.lastmod).filter(Boolean).sort();
  return {
    domain,
    totalUrls: entries.length,
    recent90d,
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
    sample: entries.slice(0, 12),
  };
}
