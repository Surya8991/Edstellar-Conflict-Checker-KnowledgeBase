/** npx tsx --test lib/gsc.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFullMonths } from "./gsc";

const jul15 = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15

test("resolveFullMonths returns completed calendar months (mid-July)", () => {
  // Current month (July) is excluded; June is the last complete month.
  assert.deepEqual(resolveFullMonths(1, jul15), { startDate: "2026-06-01", endDate: "2026-06-30" });
  assert.deepEqual(resolveFullMonths(3, jul15), { startDate: "2026-04-01", endDate: "2026-06-30" });
  assert.deepEqual(resolveFullMonths(6, jul15), { startDate: "2026-01-01", endDate: "2026-06-30" });
});

test("resolveFullMonths crosses the year boundary", () => {
  const jan10 = new Date(Date.UTC(2026, 0, 10)); // 2026-01-10
  assert.deepEqual(resolveFullMonths(1, jan10), { startDate: "2025-12-01", endDate: "2025-12-31" });
  assert.deepEqual(resolveFullMonths(3, jan10), { startDate: "2025-10-01", endDate: "2025-12-31" });
  assert.deepEqual(resolveFullMonths(6, jan10), { startDate: "2025-07-01", endDate: "2025-12-31" });
});

test("resolveFullMonths endDate is always the last day of the previous month", () => {
  const mar1 = new Date(Date.UTC(2026, 2, 1)); // 2026-03-01
  assert.equal(resolveFullMonths(1, mar1).endDate, "2026-02-28"); // 2026 not a leap year
});
