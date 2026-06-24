import { google } from "googleapis";
import { neon } from "@neondatabase/serverless";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/gsc/callback";
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GSC_SCOPE],
  });
}

/** Persist tokens from the OAuth callback. */
export async function saveTokens(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}) {
  const sql = neon(process.env.DATABASE_URL!);
  const siteUrl = process.env.GSC_SITE_URL || "";
  await sql.query(
    `INSERT INTO gsc_connections (site_url, access_token, refresh_token, expiry, scope)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      siteUrl,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      tokens.scope ?? GSC_SCOPE,
    ],
  );
}

/** Load the most recent stored connection and return an authorized client. */
export async function getAuthorizedClient() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `SELECT access_token, refresh_token, expiry FROM gsc_connections
     ORDER BY created_at DESC LIMIT 1`,
  )) as any[];
  if (!rows.length) return null;
  const client = getOAuthClient();
  client.setCredentials({
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token,
    expiry_date: rows[0].expiry ? new Date(rows[0].expiry).getTime() : undefined,
  });
  return client;
}

export type RangeKey = "24h" | "7d" | "28d" | "3m" | "6m" | "12m";

/** Resolve a preset range to start/end YYYY-MM-DD strings.
 *  GSC has ~2-3 day data latency; "24h" maps to the most recent 2 days. */
export function resolveRange(
  range: RangeKey,
  today = new Date(),
): { startDate: string; endDate: string } {
  const end = new Date(today);
  const start = new Date(today);
  const daysByRange: Record<RangeKey, number> = {
    "24h": 2,
    "7d": 7,
    "28d": 28,
    "3m": 90,
    "6m": 180,
    "12m": 365,
  };
  start.setDate(end.getDate() - daysByRange[range]);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export interface GscQueryOptions {
  range: RangeKey;
  dimensions?: ("query" | "page" | "date" | "country" | "device")[];
  rowLimit?: number;
}

export async function querySearchAnalytics(opts: GscQueryOptions) {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Not connected to Google Search Console.");
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL is not set.");

  const { startDate, endDate } = resolveRange(opts.range);
  const webmasters = google.webmasters({ version: "v3", auth: client });
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: opts.dimensions ?? ["query"],
      rowLimit: opts.rowLimit ?? 100,
    },
  });
  return { startDate, endDate, rows: res.data.rows ?? [] };
}
