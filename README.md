# Edstellar Conflict Checker — Knowledge Base

Reference knowledge base for the **Edstellar Conflict Checker** tool. Captures the company context, the domain model behind scheduling conflicts, and the rules the checker enforces.

## Contents

- [About Edstellar](docs/about-edstellar.md) — company overview, offerings, audience.
- [Domain Glossary](docs/glossary.md) — trainers, batches, training requests, modes of delivery.
- [Conflict Types](docs/conflict-types.md) — every conflict the checker detects, with examples.
- [Conflict Rules](docs/conflict-rules.md) — precise rules, precedence, edge cases.
- [Examples](docs/examples.md) — worked scenarios (clean, overlap, back-to-back, timezone).
- [Data Sources](docs/data-sources.md) — where trainer / batch / request data comes from.

## Purpose

When a training batch is being scheduled or a trainer is being assigned, the Conflict Checker validates that:

1. The trainer is available for the requested window.
2. No existing batch overlaps the proposed slot.
3. Travel / buffer / timezone constraints are respected.
4. Trainer competencies match the requested course.

This repo documents **what counts as a conflict and why** — it is the source of truth the tool implements against.

## Status

Work in progress. Contributions welcome via PR.
