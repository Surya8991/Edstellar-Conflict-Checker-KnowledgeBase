import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { google } from "googleapis";
import { getAuthorizedClient, resolveSiteUrl } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily cron — snapshot yesterday's totals + branded vs non-branded into
 * gsc_daily_totals. Lets us compare arbitrary windows later, not just presets.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const client = await getAuthorizedClient();
    if (!client) throw new Error("Not connected to GSC.");
    const siteUrl = await resolveSiteUrl(client);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const webmasters = google.webmasters({ version: "v3", auth: client });

    const byDate = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: yesterday, endDate: yesterday, dimensions: ["date"], rowLimit: 1 },
    });
    const day = (byDate.data.rows ?? [])[0];

    const byQuery = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: yesterday, endDate: yesterday, dimensions: ["query"], rowLimit: 1000 },
    });
    const brandTerms = (process.env.BRAND_TERMS || "edstellar")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    let bc = 0, bi = 0;
    for (const r of byQuery.data.rows ?? []) {
      const q = (r.keys?.[0] ?? "").toLowerCase();
      if (brandTerms.some((t) => q.includes(t))) {
        bc += r.clicks ?? 0; bi += r.impressions ?? 0;
      }
    }

    const sql = neon(process.env.DATABASE_URL!);
    await sql.query(
      `INSERT INTO gsc_daily_totals
         (site_url, date, clicks, impressions, ctr, position, branded_clicks, branded_impressions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (site_url, date) DO UPDATE SET
         clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions,
         ctr=EXCLUDED.ctr, position=EXCLUDED.position,
         branded_clicks=EXCLUDED.branded_clicks, branded_impressions=EXCLUDED.branded_impressions,
         fetched_at=now()`,
      [siteUrl, yesterday, day?.clicks ?? 0, day?.impressions ?? 0,
       day?.ctr ?? 0, day?.position ?? 0, bc, bi],
    );
    return NextResponse.json({ date: yesterday, clicks: day?.clicks ?? 0, branded_clicks: bc });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
