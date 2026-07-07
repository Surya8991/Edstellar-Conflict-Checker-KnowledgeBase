/**
 * Constant-time string comparison for API-key/secret checks - avoids timing
 * side-channels that let an attacker infer a secret's length or prefix via
 * response-time differences. Mirrors the pattern already used in
 * lib/cron-auth.ts; this shared helper closes the same gap in the other
 * key-comparison call sites (§19C).
 */
import { timingSafeEqual } from "crypto";

export function safeEqual(candidate: string | null | undefined, expected: string): boolean {
  if (candidate == null) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
