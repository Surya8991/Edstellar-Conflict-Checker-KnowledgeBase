/**
 * Fetch the live sitemap.xml URL list (handles a sitemap index by recursing one
 * level). Shared by /api/sitemap-drift and the Settings sitemap-sync (§17T).
 */
import * as cheerio from "cheerio";

export async function fetchSitemapUrls(rootHost: string): Promise<string[]> {
  const out = new Set<string>();
  const root = rootHost.replace(/\/+$/, "") + "/sitemap.xml";
  const visit = async (sm: string): Promise<void> => {
    const res = await fetch(sm, { headers: { accept: "application/xml,text/xml" } });
    if (!res.ok) return;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const subs = $("sitemap > loc").map((_, el) => $(el).text().trim()).get();
    if (subs.length) {
      // sitemap index - recurse (cap to avoid runaway fan-out).
      await Promise.all(subs.slice(0, 50).map(visit));
      return;
    }
    $("url > loc").each((_, el) => {
      const u = $(el).text().trim();
      if (u) out.add(u);
    });
  };
  await visit(root);
  return [...out];
}
