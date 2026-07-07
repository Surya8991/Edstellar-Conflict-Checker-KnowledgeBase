import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyInput,
  parseInputs,
  groupTabs,
  matchInputs,
  type ConflictLike,
} from "./cannibalization-assistant";

const g = (over: Partial<ConflictLike>): ConflictLike => ({
  query: "x",
  positionGap: 5,
  crossType: false,
  severity: "low",
  totalClicks: 0,
  totalImpressions: 0,
  pages: [],
  ...over,
});

test("classifyInput: URLs vs keywords", () => {
  assert.equal(classifyInput("https://www.edstellar.com/blog/x"), "url");
  assert.equal(classifyInput("www.edstellar.com/x"), "url");
  assert.equal(classifyInput("/blog/foo-bar"), "url");
  assert.equal(classifyInput("corporate training companies"), "keyword");
  assert.equal(classifyInput("  AI training  "), "keyword");
});

test("parseInputs: splits, trims, de-dupes", () => {
  assert.deepEqual(parseInputs("a\nb, c\n\na"), ["a", "b", "c"]);
});

test("groupTabs: all always; near + cross conditional", () => {
  assert.deepEqual(groupTabs(g({ positionGap: 3, crossType: false }), 10), ["all-keywords", "near-position"]);
  assert.deepEqual(groupTabs(g({ positionGap: 30, crossType: true }), 10), ["all-keywords", "cross-type"]);
  assert.deepEqual(groupTabs(g({ positionGap: 30, crossType: false }), 10), ["all-keywords"]);
});

test("matchInputs: keyword matches by query, URL matches by page", () => {
  const groups = [
    g({ query: "ai training companies", severity: "high", totalClicks: 50, pages: [{ page: "https://www.edstellar.com/blog/top-ai" }, { page: "https://www.edstellar.com/category/ai-training" }] }),
    g({ query: "leadership training", pages: [{ page: "https://www.edstellar.com/leadership-course" }] }),
  ];
  const byKeyword = matchInputs(["ai training"], groups, 10);
  assert.equal(byKeyword[0].kind, "keyword");
  assert.equal(byKeyword[0].groups.length, 1);
  assert.equal(byKeyword[0].groups[0].query, "ai training companies");

  const byUrl = matchInputs(["https://www.edstellar.com/leadership-course/"], groups, 10);
  assert.equal(byUrl[0].kind, "url");
  assert.equal(byUrl[0].groups.length, 1);
  assert.equal(byUrl[0].groups[0].query, "leadership training");

  const noHit = matchInputs(["nonexistent keyword xyz"], groups, 10);
  assert.equal(noHit[0].groups.length, 0);
});

test("matchInputs: a generic word does NOT pull unrelated groups (no reverse-substring)", () => {
  const groups = [
    g({ query: "ai training companies", pages: [{ page: "https://s.com/a" }, { page: "https://s.com/b" }] }),
    g({ query: "leadership course", pages: [{ page: "https://s.com/c" }, { page: "https://s.com/d" }] }),
  ];
  // "ai training companies for enterprises" CONTAINS "ai training companies" but
  // we only match when the STORED query contains the pasted phrase, not vice
  // versa - so this long phrase matches nothing.
  const m = matchInputs(["ai training companies for enterprises"], groups, 10);
  assert.equal(m[0].groups.length, 0);
});
