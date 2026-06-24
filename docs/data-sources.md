# Data Sources

Where the Conflict Checker reads from. All sources are internal to Edstellar's platform; no third-party data.

| Entity | Source of Truth | Notes |
|--------|-----------------|-------|
| Trainer profile (tags, modes, home TZ, travel overrides) | `trainers` service | Cached 5 min. |
| Trainer availability / blackout calendar | `availability` service | Real-time, no cache — blackouts can change minute-to-minute. |
| Confirmed batches / sessions | `scheduling` service | Real-time. Only `Confirmed` and `In-Delivery` states block; `Draft` does not. |
| Course catalog (required tags, duration, mode) | `catalog` service | Daily refresh. |
| City distance matrix (for travel rule) | Static table in this repo: [`data/city-distances.csv`](../data/city-distances.csv) | Updated quarterly. |
| Client preferences (language, etc.) | `clients` service | Cached 1 hr. |

## Freshness Guarantees

- **Availability + scheduling**: must be live. Stale data here causes double-bookings.
- **Catalog + clients**: tolerate hour-scale staleness.
- **City distances**: change rarely; static file is acceptable.

## Failure Modes

If a source is unreachable:

| Source | Fallback |
|--------|----------|
| `availability` | Fail closed — return `H-BLACKOUT` with reason "availability unknown". |
| `scheduling` | Fail closed — return `H-OVERLAP` with reason "schedule unknown". |
| `catalog` | Fail open — assume any trainer can deliver (logged warning). |
| `clients` | Fail open — skip language soft check. |

Fail-closed on availability and scheduling is deliberate: a false-positive conflict is recoverable (booker investigates); a missed conflict is a customer-visible delivery failure.
