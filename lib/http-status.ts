/**
 * Corpus HTTP-status refresh - HEAD-check page URLs and write `pages.http_status`
 * + `last_audited_at`. Shared by the weekly `/api/cron/audit-links` full sweep and
 * the daily `/api/cron/gsc-snapshot` bounded refresh (Job 6), so dead pages get
 * caught quickly and stay out of Keyword Cannibalization (§18L / §18M).
 *
 * Refreshes the OLDEST-audited pages first (`last_audited_at NULLS FIRST`), so a
 * small daily batch rotates through the whole corpus every few days on top of the
 * weekly full sweep.
 */
import { neon } from "@neondatabase/serverless";

/** A page is "broken" if it failed to resolve (0) or returned a 4xx/5xx. */
export function isBrokenStatus(status: number): boolean {
  return !status || status >= 400;
}

async function probe(url: string): Promise<number> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: c.signal, redirect: "follow" });
    let status = res.status;
    if (status === 405 || status === 501) {
      const r2 = await fetch(url, { method: "GET", signal: c.signal, redirect: "follow" });
      status = r2.status;
    }
    return status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

export interface RefreshResult {
  checked: number;
  broken: number;
  brokenRate: number;
}

/**
 * HEAD-check up to `limit` least-recently-audited corpus URLs (concurrency
 * `concurrency`) and write their status back in `writeBatch`-sized UNNEST UPDATEs.
 */
export async function refreshHttpStatus({
  limit = 1500,
  concurrency = 10,
  writeBatch = 200,
}: { limit?: number; concurrency?: number; writeBatch?: number } = {}): Promise<RefreshResult> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    "SELECT id, url FROM pages ORDER BY last_audited_at NULLS FIRST LIMIT $1",
    [limit],
  )) as { id: number; url: string }[];

  let broken = 0;
  const results: { id: number; status: number }[] = [];

  // Concurrent worker pool - probe URLs in parallel.
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++;
      const r = rows[i]!;
      const status = await probe(r.url);
      if (isBrokenStatus(status)) broken++;
      results.push({ id: r.id, status });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Batched UNNEST UPDATEs.
  for (let i = 0; i < results.length; i += writeBatch) {
    const slice = results.slice(i, i + writeBatch);
    const ids = slice.map((r) => r.id);
    const statuses = slice.map((r) => r.status || null);
    await sql.query(
      `UPDATE pages
          SET http_status = data.status,
              last_audited_at = now()
         FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS status) AS data
        WHERE pages.id = data.id`,
      [ids, statuses],
    );
  }

  const checked = rows.length;
  const brokenRate = checked > 0 ? broken / checked : 0;
  return { checked, broken, brokenRate: Number(brokenRate.toFixed(3)) };
}
