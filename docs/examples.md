# Worked Examples

Each example shows the input (existing schedule + proposed session) and the checker's expected output.

## 1. Clean Booking

**Existing:** Trainer T1 has no sessions on 2026-07-01.
**Proposed:** VILT, 2026-07-01 09:00–13:00 UTC, course C1 (T1 certified).
**Result:** ✅ No conflicts.

## 2. Hard Overlap

**Existing:** T1 confirmed VILT 09:00–12:00 UTC.
**Proposed:** VILT 11:00–14:00 UTC.
**Result:** ❌ `H-OVERLAP` — proposed 11:00 < existing 12:00 and existing 09:00 < proposed 14:00.

## 3. Back-to-Back Touching (No Conflict)

**Existing:** T1 confirmed 09:00–12:00 UTC.
**Proposed:** 12:00–15:00 UTC.
**Result:** ⚠️ `S-BUFFER` (0 min gap < 15 min VILT buffer). No hard conflict — half-open intervals do not overlap at the touching endpoint.

## 4. Travel Conflict (ILT)

**Existing:** T1 confirmed ILT in Bengaluru, ends 2026-07-01 17:00 IST.
**Proposed:** ILT in Mumbai, starts 2026-07-01 19:00 IST.
**Result:** ❌ `H-TRAVEL` — Bengaluru↔Mumbai is intercity ≥500 km, requires 8 hr gap; only 2 hr available.

## 5. Missing Competency

**Proposed:** Course "AWS Solutions Architect Pro" assigned to T1, whose tags include `aws-saa` but not `aws-sap`.
**Result:** ❌ `H-COMPETENCY`.

## 6. Timezone Fatigue (Soft)

**Existing:** T1 (home TZ: IST) ran sessions 23:00–02:00 IST on Mon and Tue.
**Proposed:** 23:00–02:00 IST on Wed.
**Result:** ⚠️ `S-TZ-FATIGUE` — third consecutive night-window session.

## 7. Blackout

**Existing:** T1 declared PTO 2026-07-01 to 2026-07-07.
**Proposed:** Any session in that range.
**Result:** ❌ `H-BLACKOUT`.

## 8. Daily Load Cap

**Existing:** T1 has 6 hr of sessions on 2026-07-01.
**Proposed:** 3 hr session same date.
**Result:** ❌ `H-MAX-LOAD` — 6+3 = 9 > 8 hr cap.

## 9. Multiple Conflicts (Hard Suppresses Soft)

**Existing:** Overlap + low rating apply.
**Result:** Response includes `H-OVERLAP` only; `S-RATING` suppressed until hard conflict resolved.
