import * as cheerio from "cheerio";

export interface ExtractedPage {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  contentText: string;
}

/** Fetch a URL and extract its main textual content for embedding/summarizing. */
export async function fetchAndExtract(
  url: string,
  timeoutMs = 20000,
): Promise<ExtractedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; EdstellarConflictChecker/1.0; +https://www.edstellar.com)",
        accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Fetch ${url} → ${res.status}`);
    const html = await res.text();
    return extractFromHtml(url, html);
  } finally {
    clearTimeout(timer);
  }
}

/** Parse already-fetched HTML into a clean ExtractedPage. */
export function extractFromHtml(url: string, html: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").first().text().trim() ||
    null;
  const metaDescription =
    $("meta[name='description']").attr("content")?.trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    null;
  const h1 = $("h1").first().text().trim() || null;

  // Drop non-content elements before reading text.
  $(
    "script, style, noscript, nav, header, footer, svg, form, iframe, [aria-hidden='true']",
  ).remove();

  const main = $("main").first();
  const root = main.length ? main : $("body");
  const contentText = normalizeWhitespace(root.text());

  return { url, title, metaDescription, h1, contentText };
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Rough token estimate (~4 chars/token) for cost/limit awareness. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Derive a content_type from an Edstellar URL path. */
export function classifyUrl(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path === "/" || path === "") return "page";
    if (path.startsWith("/blog")) return "blog";
    if (path.includes("category") || path.includes("training-programs"))
      return "category";
    // Course detail pages on Edstellar are typically deep single-segment slugs
    // ending in "-training" / "-course"; treat the rest as generic pages.
    if (path.includes("-training") || path.includes("-course")) return "course";
    return "page";
  } catch {
    return "page";
  }
}
