import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

/** Parse the bundled sitemap CSV (url,lastmod,sitemap). Minimal CSV reader
 *  that handles the double-quoted fields in our export. */
export function readSitemapCsv(
  path = join(process.cwd(), "data", "sitemap-urls.csv"),
): SitemapEntry[] {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: SitemapEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const url = cols[0]?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push({ url, lastmod: cols[1]?.trim() || null });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
