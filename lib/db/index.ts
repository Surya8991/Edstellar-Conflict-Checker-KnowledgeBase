import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  // Throw lazily at query time rather than crash module import during build.
  console.warn("[db] DATABASE_URL is not set — database calls will fail.");
}

// A syntactically valid placeholder keeps neon() from throwing at import time
// when DATABASE_URL is unset/empty (e.g. during `next build` or before .env is
// filled). `||` is intentional so an empty-string env var also falls back.
// Real queries against the placeholder fail at runtime, which is the intended
// "DB not configured" path.
const sql = neon(url || "postgresql://user:password@localhost/db");
export const db = drizzle(sql, { schema });
export { schema };
