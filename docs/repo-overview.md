# Repository Overview

This repo is a **single Next.js 16 app deployed to Vercel** plus a domain knowledge base.

## Top-level layout

| Path | What it is |
|------|------------|
| [`app/`](../app/) | App Router routes: dashboard pages + `/api/*` endpoints. |
| [`lib/`](../lib/) | AI providers, conflict pipeline (`conflict.ts`), scoring (`score.ts`), DB schema, GSC, competitors, etc. |
| [`scripts/`](../scripts/) | One-off / cron-target scripts run via `tsx` (`db:setup`, `ingest`, `catalog-conflicts`, ...). |
| [`data/`](../data/) | Bundled sitemap CSV + taxonomy JSON shipped with the repo. |
| [`drizzle/`](../drizzle/) | SQL migrations (run by `npm run db:setup`). |
| [`public/`](../public/) | Static assets served by Next. |
| `docs/` | This knowledge base. Not built; reference only. |
| [`reference/`](../reference/) | Static artifacts (e.g. Intelligence Hub HTML). |
| [`PROJECTLOG.md`](../PROJECTLOG.md) | Session-by-session shipping log. |
| [`SETUP_GUIDE.md`](../SETUP_GUIDE.md) | Long-form setup walkthrough. |
| [`.env.example`](../.env.example) | Every env var the app reads, with comments. |
| [`vercel.json`](../vercel.json) | Cron schedules for `/api/cron/*`. |

## Where to start

- **Running locally** → [README.md](../README.md) → "Setup".
- **Deploying** → [README.md](../README.md) → "Deploy to Vercel".
- **Understanding scoring** → [conflict-rules.md](conflict-rules.md) + [conflict-types.md](conflict-types.md).
- **Adding a data source / cron** → [data-sources.md](data-sources.md).
- **History of what shipped** → [../PROJECTLOG.md](../PROJECTLOG.md).
