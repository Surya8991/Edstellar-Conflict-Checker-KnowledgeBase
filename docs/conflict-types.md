# Conflict Types

Every conflict the checker can raise, grouped by severity.

## Hard Conflicts (block booking)

| Code | Name | Trigger |
|------|------|---------|
| `H-OVERLAP` | Session overlap | Proposed session window intersects an existing confirmed session for the same trainer. |
| `H-BLACKOUT` | Trainer blackout | Window falls inside a trainer-declared unavailable period. |
| `H-COMPETENCY` | Missing competency | Trainer lacks a required skill / certification tag for the course. |
| `H-MODE` | Mode mismatch | Trainer not approved for the requested mode (e.g. VILT-only trainer assigned to ILT). |
| `H-TRAVEL` | Impossible travel | ILT in city A ends and ILT in city B starts before minimum travel time elapses (default: same-day intercity = conflict unless cities are within commute distance). |
| `H-MAX-LOAD` | Daily load cap exceeded | Trainer would exceed configured max hours/day (default 8) including the new session. |

## Soft Conflicts (warn, allow override)

| Code | Name | Trigger |
|------|------|---------|
| `S-BUFFER` | Back-to-back | Gap between adjacent sessions is less than the buffer (default 30 min VILT, 2 hr ILT same city). |
| `S-TZ-FATIGUE` | Timezone fatigue | Trainer scheduled in their local night window (22:00–06:00) more than 2 days in a row. |
| `S-WEEKLY-LOAD` | Weekly load high | Trainer would exceed soft weekly cap (default 40 hr) including the new session. |
| `S-LANGUAGE` | Language preference | Trainer's primary language ≠ batch language preference (but they are listed as secondary-language qualified). |
| `S-RATING` | Low recent rating | Trainer's last-30-day average rating below threshold for this course. |

## Informational (no block, surfaced for visibility)

| Code | Name | Trigger |
|------|------|---------|
| `I-NEW-CLIENT` | First batch with client | Trainer has never delivered for this client before. |
| `I-NEW-COURSE` | First delivery of course | Trainer is certified but has never run a paid batch of this course. |
