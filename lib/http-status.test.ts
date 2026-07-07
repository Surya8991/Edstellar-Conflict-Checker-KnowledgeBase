import { test } from "node:test";
import assert from "node:assert/strict";
import { isBrokenStatus } from "./http-status";

test("isBrokenStatus: unreachable (0) and 4xx/5xx are broken; 2xx/3xx are not", () => {
  assert.equal(isBrokenStatus(0), true); // fetch failed / aborted
  assert.equal(isBrokenStatus(404), true);
  assert.equal(isBrokenStatus(410), true);
  assert.equal(isBrokenStatus(500), true);
  assert.equal(isBrokenStatus(503), true);
  assert.equal(isBrokenStatus(200), false);
  assert.equal(isBrokenStatus(301), false); // redirect resolves to a live page
  assert.equal(isBrokenStatus(308), false);
});
