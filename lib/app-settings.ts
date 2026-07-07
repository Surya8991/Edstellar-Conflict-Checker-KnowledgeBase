/**
 * Editable key-value app settings (PROJECTLOG §17R). Currently the Content
 * Clusters tuning knobs; reads fall back to lib/thresholds.ts defaults. Cached
 * ~30s per instance; writes drop the cache.
 */
import { neon } from "@neondatabase/serverless";

/** Keys used by the app (kept here so the Settings UI + readers agree). */
export const SETTING_KEYS = {
  topicOverlap: "cluster.topic_overlap",
  bodyFloor: "cluster.body_floor",
  mergeMaxSize: "cluster.merge_max_size",
} as const;

let cache: { map: Record<string, string>; at: number } | null = null;
const TTL_MS = 30_000;

/** All settings as a { key: value } map. Empty on any error. */
export async function getAppSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.map;
  if (!process.env.DATABASE_URL) return {};
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql.query(`SELECT key, value FROM app_settings`)) as {
      key: string;
      value: string | null;
    }[];
    const map: Record<string, string> = {};
    for (const r of rows) if (r.value != null) map[r.key] = r.value;
    cache = { map, at: now };
    return map;
  } catch {
    return {};
  }
}

export function invalidateAppSettingsCache(): void {
  cache = null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
  invalidateAppSettingsCache();
}

/** Parse a numeric setting, clamped to [min, max], falling back if absent/bad. */
export function numSetting(
  map: Record<string, string>,
  key: string,
  fallback: number,
  min = -Infinity,
  max = Infinity,
): number {
  const v = Number(map[key]);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
