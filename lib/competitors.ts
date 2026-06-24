import { neon } from "@neondatabase/serverless";
import { getChat } from "@/lib/ai";
import { fetchAndExtract } from "@/lib/extract";

// Corporate-training competitors Edstellar benchmarks against (from the hub).
export const KNOWN_COMPETITORS = [
  "skillsoft.com",
  "linkedin.com",
  "dalecarnegie.com",
  "kornferry.com",
  "pluralsight.com",
  "oreilly.com",
  "ideou.com",
  "td.org",
  "coachfederation.org",
  "udemy.com",
  "coursera.org",
  "edx.org",
];

export interface CompetitorResult {
  url: string;
  title: string;
  domain: string;
  summary: string;
  angle: string;
  isKnownCompetitor: boolean;
  source: string;
}

interface SerpOrganic {
  title: string;
  link: string;
  snippet?: string;
}

/** Google SERP via Serper.dev (set SERPER_API_KEY). Returns organic results. */
async function serperSearch(query: string, num = 10): Promise<SerpOrganic[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    throw new Error(
      "SERPER_API_KEY is not set. Add a free key from https://serper.dev to enable competitor SERP lookups.",
    );
  }
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "content-type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper search failed: ${res.status}`);
  const json = (await res.json()) as { organic?: SerpOrganic[] };
  return json.organic ?? [];
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Research competitors for a topic: SERP → filter → summarize top results. */
export async function researchCompetitors(
  topic: string,
  opts: { limit?: number; persist?: boolean } = {},
): Promise<CompetitorResult[]> {
  const limit = opts.limit ?? 6;
  const chat = getChat();

  const organic = await serperSearch(`${topic} corporate training`, 12);
  // Skip Edstellar's own results; prefer known competitors first.
  const filtered = organic
    .filter((o) => !domainOf(o.link).includes("edstellar"))
    .sort((a, b) => {
      const ak = KNOWN_COMPETITORS.includes(domainOf(a.link)) ? 0 : 1;
      const bk = KNOWN_COMPETITORS.includes(domainOf(b.link)) ? 0 : 1;
      return ak - bk;
    })
    .slice(0, limit);

  const results: CompetitorResult[] = [];
  for (const o of filtered) {
    const domain = domainOf(o.link);
    let summary = o.snippet ?? "";
    let angle = "";
    try {
      const page = await fetchAndExtract(o.link, 15000);
      const s = await chat.summarizeCompetitor({
        topic,
        url: o.link,
        title: o.title,
        content: [page.title, page.h1, page.contentText].filter(Boolean).join("\n"),
      });
      summary = s.summary || summary;
      angle = s.angle;
    } catch {
      // Keep SERP snippet if the page can't be fetched/summarized.
    }
    results.push({
      url: o.link,
      title: o.title,
      domain,
      summary,
      angle,
      isKnownCompetitor: KNOWN_COMPETITORS.includes(domain),
      source: "serper",
    });
  }

  if (opts.persist !== false && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      for (const r of results) {
        await sql.query(
          `INSERT INTO competitors (topic, competitor_url, title, summary, domain, is_known_competitor, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [topic, r.url, r.title, `${r.summary}\n\nDifferentiation: ${r.angle}`, r.domain, r.isKnownCompetitor ? 1 : 0, r.source],
        );
      }
    } catch (e) {
      console.warn("[competitors] persist failed:", (e as Error).message);
    }
  }

  return results;
}
