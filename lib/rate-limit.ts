import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

/**
 * Postgres-backed sliding-window rate limiter — fits the existing Neon-only
 * deploy without adding Upstash/Redis. Cross-instance correct on Vercel.
 *
 * One row per (ip, route). On each call we either:
 *   - bump count if we're still inside the current window, or
 *   - reset count to 1 + advance window_start to now.
 *
 * `consume` returns `{ ok, remaining, resetIn }`. Callers convert to a 429
 * response. The DB call is one upsert; ~1ms on Neon pooled.
 */
export interface RateLimitOk {
  ok: true;
  remaining: number;
  resetIn: number;
}
export interface RateLimitDenied {
  ok: false;
  remaining: 0;
  resetIn: number;
}
export type RateLimitResult = RateLimitOk | RateLimitDenied;

interface ConsumeOpts {
  /** Max requests allowed inside the window. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
}

/** Read the client IP off a NextRequest. Vercel sets x-forwarded-for. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function consume(
  ip: string,
  route: string,
  opts: ConsumeOpts,
): Promise<RateLimitResult> {
  if (!process.env.DATABASE_URL) {
    // Dev / DB-down: fail open with a console warning. Never block real users
    // because the rate-limit DB hiccupped.
    return { ok: true, remaining: opts.max, resetIn: opts.windowSec };
  }
  const sql = neon(process.env.DATABASE_URL);

  try {
    const rows = (await sql.query(
      `
      INSERT INTO rate_limits (ip, route, count, window_start)
      VALUES ($1, $2, 1, now())
      ON CONFLICT (ip, route) DO UPDATE
        SET count = CASE
              WHEN rate_limits.window_start < now() - ($3 || ' seconds')::interval
                THEN 1
              ELSE rate_limits.count + 1
            END,
            window_start = CASE
              WHEN rate_limits.window_start < now() - ($3 || ' seconds')::interval
                THEN now()
              ELSE rate_limits.window_start
            END
      RETURNING count, EXTRACT(EPOCH FROM (now() - window_start))::int AS age_sec
      `,
      [ip, route, String(opts.windowSec)],
    )) as { count: number; age_sec: number }[];

    const r = rows[0];
    if (!r) return { ok: true, remaining: opts.max, resetIn: opts.windowSec };
    const resetIn = Math.max(0, opts.windowSec - r.age_sec);
    if (r.count > opts.max) {
      return { ok: false, remaining: 0, resetIn };
    }
    return { ok: true, remaining: Math.max(0, opts.max - r.count), resetIn };
  } catch {
    // Same fail-open policy as no-DB.
    return { ok: true, remaining: opts.max, resetIn: opts.windowSec };
  }
}

/** Convenience: 429 response builder. */
export function denied(result: RateLimitDenied): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded.",
      retryAfterSec: result.resetIn,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.resetIn),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(result.resetIn),
      },
    },
  );
}
