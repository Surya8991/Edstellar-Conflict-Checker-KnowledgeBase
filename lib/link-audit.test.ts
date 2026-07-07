import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcludeWorthy, PERMANENT_REDIRECT_STATUSES, DEAD_STATUSES } from "./link-audit";

test("301 and 308 are exclude-worthy (permanent move)", () => {
  assert.equal(isExcludeWorthy(301), true);
  assert.equal(isExcludeWorthy(308), true);
});

test("404 and 410 are exclude-worthy (permanently gone)", () => {
  assert.equal(isExcludeWorthy(404), true);
  assert.equal(isExcludeWorthy(410), true);
});

test("temporary redirects, live pages, server errors, and network failures are NOT exclude-worthy", () => {
  for (const status of [200, 204, 301 - 1 /* 300 */, 302, 303, 307, 429, 500, 503, 0]) {
    assert.equal(isExcludeWorthy(status), false, `status ${status} should not be exclude-worthy`);
  }
});

test("PERMANENT_REDIRECT_STATUSES and DEAD_STATUSES don't overlap", () => {
  for (const s of PERMANENT_REDIRECT_STATUSES) assert.equal(DEAD_STATUSES.has(s), false);
});
