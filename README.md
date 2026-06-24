# Edstellar Conflict Checker — Repo

Monorepo for the **Edstellar Conflict Checker**: a tool that detects SEO content conflicts (duplication, cannibalization, partial overlap) across Edstellar's published pages **before** new content is published.

## Layout

| Path | What it is |
|------|------------|
| [`conflict-checker/`](conflict-checker/) | The Next.js 16 app (App Router, Neon Postgres + pgvector). See its [README](conflict-checker/README.md) to run locally. |
| [`docs/`](docs/) | Domain knowledge base — what the tool does, how scoring works, data sources, worked examples. Read this before extending the app. |
| [`reference/`](reference/) | Static reference artifacts (e.g. the Intelligence Hub HTML). Not built or shipped. |
| [`PROJECTLOG.md`](PROJECTLOG.md) | Session-by-session history of what shipped and why. |

## Quick links

- **About Edstellar** — [docs/about-edstellar.md](docs/about-edstellar.md)
- **What "conflict" means here** — [docs/conflict-types.md](docs/conflict-types.md)
- **Scoring model** — [docs/conflict-rules.md](docs/conflict-rules.md)
- **Glossary** — [docs/glossary.md](docs/glossary.md)
- **Worked examples** — [docs/examples.md](docs/examples.md)
- **Data sources & pipelines** — [docs/data-sources.md](docs/data-sources.md)

## One-sentence summary

Paste a URL or topic → summarize + embed → pgvector nearest-neighbor search across the Edstellar corpus → LLM judges the top candidates → blended 0–100 conflict score with a typed verdict (`duplicate` / `cannibalization` / `partial-overlap` / `none`).
