# Conflict Rules

Precise rules the checker evaluates, in evaluation order. First hard conflict short-circuits; soft conflicts are accumulated and returned together.

## Evaluation Order

1. **Trainer exists & active** — inactive trainer = `H-COMPETENCY` (treated as missing).
2. **Competency check** — required course tags ⊆ trainer tags. If not → `H-COMPETENCY`.
3. **Mode approval** — trainer.modes ∋ batch.mode. If not → `H-MODE`.
4. **Blackout check** — any blackout interval intersects proposed window → `H-BLACKOUT`.
5. **Session overlap** — any confirmed session intersects proposed window → `H-OVERLAP`.
6. **Travel feasibility** (ILT only) — for each adjacent ILT session in a different city, compute `travel_time(city_a, city_b)`; if `gap < travel_time` → `H-TRAVEL`.
7. **Daily load** — sum of session hours on the same trainer-local date including new session > 8 → `H-MAX-LOAD`.
8. **Soft checks** — buffer, weekly load, timezone fatigue, language, rating. All evaluated, all returned.

## Overlap Math

Two intervals `[a_start, a_end)` and `[b_start, b_end)` overlap iff `a_start < b_end AND b_start < a_end`. Both endpoints are UTC; comparison is half-open (touching = no overlap).

## Travel Time Table (defaults)

| Scenario | Min gap required |
|----------|------------------|
| Same city, same venue | 0 (only buffer applies) |
| Same city, different venue | 1 hr |
| Different city, same country, < 500 km | 4 hr |
| Different city, same country, ≥ 500 km | 8 hr (overnight) |
| Different country | 24 hr |

Override per-trainer via `trainer.travel_overrides`.

## Buffer Defaults

| Mode | Pre | Post |
|------|-----|------|
| VILT | 15 min | 15 min |
| ILT same city | 1 hr | 1 hr |
| ILT travel day | half-day | half-day |
| 1-on-1 coaching | 5 min | 5 min |

## Precedence on Multiple Conflicts

If both hard and soft conflicts apply to the same proposed session, return **all hard conflicts** and suppress soft ones in the response (UI shows hard first; soft only surface when zero hard).

## Override Authority

| Role | Can override soft | Can override hard |
|------|-------------------|-------------------|
| Booker | ✅ | ❌ |
| Ops Lead | ✅ | ❌ |
| Admin | ✅ | ✅ (with audit log + reason) |
