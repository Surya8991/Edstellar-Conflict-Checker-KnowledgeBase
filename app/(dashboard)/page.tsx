import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { readSitemapCsv } from "@/lib/sitemap";
import { PageHeader, Card } from "@/app/components/ui";

export const dynamic = "force-dynamic";

async function getStats() {
  let sitemapCount = 0;
  try {
    sitemapCount = readSitemapCsv().length;
  } catch {
    /* ignore */
  }
  const stats = {
    sitemapCount,
    ingested: 0,
    checks: 0,
    competitors: 0,
    dbReady: false,
  };
  try {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT count(*) FROM pages)::int AS ingested,
        (SELECT count(*) FROM checks)::int AS checks,
        (SELECT count(*) FROM competitors)::int AS competitors
    `)) as any;
    const r = (rows.rows ?? rows)[0];
    stats.ingested = r?.ingested ?? 0;
    stats.checks = r?.checks ?? 0;
    stats.competitors = r?.competitors ?? 0;
    stats.dbReady = true;
  } catch {
    /* DB not set up yet */
  }
  return stats;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <div className="text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </Card>
  );
}

export default async function DashboardHome() {
  const stats = await getStats();
  return (
    <div>
      <PageHeader
        title="Content Intelligence Hub"
        subtitle="Conflict detection, Search Console performance, and competitor research for Edstellar."
      />
      <div className="space-y-8 p-8">
        {!stats.dbReady && (
          <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
            Database not connected yet. Set <code>DATABASE_URL</code> in{" "}
            <code>.env</code>, then run <code>npm run db:setup</code> and{" "}
            <code>npm run ingest</code>.
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Sitemap URLs" value={stats.sitemapCount.toLocaleString()} />
          <Stat label="Pages ingested" value={stats.ingested.toLocaleString()} />
          <Stat label="Checks run" value={stats.checks.toLocaleString()} />
          <Stat label="Competitor records" value={stats.competitors.toLocaleString()} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Action
              href="/conflict-checker"
              title="Check a topic or URL"
              body="Score new content against the corpus before you publish."
            />
            <Action
              href="/search-console"
              title="Search Console"
              body="Pull clicks, impressions & positions from 24h to 12 months."
            />
            <Action
              href="/competitors"
              title="Research competitors"
              body="See who ranks for a topic and how to differentiate."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Action({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:border-slate-400 hover:shadow">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm text-slate-500">{body}</div>
      </Card>
    </Link>
  );
}
