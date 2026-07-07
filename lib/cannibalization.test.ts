import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConflicts,
  classifyGroup,
  normalizeUrl,
  isBrandedQuery,
  type RawRow,
  type ConflictPage,
} from "./cannibalization";
import { THRESHOLDS } from "./thresholds";

const OPTS = {
  minImpr: 50,
  minPageImpr: 5,
  nearGap: 10,
  brandTerms: ["edstellar"],
};

function row(query: string, page: string, clicks: number, impressions: number, position: number): RawRow {
  return { query, page, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

test("normalizeUrl collapses variants", () => {
  assert.equal(normalizeUrl("https://x.com/a/"), "https://x.com/a");
  assert.equal(normalizeUrl("https://X.com/a#top"), "https://x.com/a");
  assert.equal(normalizeUrl("https://x.com/a?utm=1"), "https://x.com/a");
});

test("isBrandedQuery: exact, spaced, misspelled variants", () => {
  const b = ["edstellar"];
  assert.equal(isBrandedQuery("edstellar leadership", b), true);
  assert.equal(isBrandedQuery("ed stellar", b), true); // spaced
  assert.equal(isBrandedQuery("edsteller", b), true); // misspelling (1 sub)
  assert.equal(isBrandedQuery("edstella", b), true); // misspelling (1 del)
  assert.equal(isBrandedQuery("www.edstellar.com", b), true); // punctuation
  assert.equal(isBrandedQuery("leadership training", b), false); // unrelated
  assert.equal(isBrandedQuery("best online training", b), false); // no false positive
});

test("a query with only one real competitor is not a conflict", () => {
  const rows = [
    row("leadership training", "https://s.com/a", 10, 200, 3),
    row("leadership training", "https://s.com/b", 0, 2, 40), // below minPageImpr
  ];
  const g = buildConflicts(rows, new Map(), THRESHOLDS, OPTS);
  assert.equal(g.length, 0);
});

test("same-type near-position pages → consolidate, high severity on traffic", () => {
  const rows = [
    row("agile training", "https://s.com/blog/agile-1", 30, 400, 4),
    row("agile training", "https://s.com/blog/agile-2", 25, 350, 6),
  ];
  const types = new Map([
    ["https://s.com/blog/agile-1", "blog"],
    ["https://s.com/blog/agile-2", "blog"],
  ]);
  const [g] = buildConflicts(rows, types, THRESHOLDS, OPTS);
  assert.equal(g.action, "consolidate");
  assert.equal(g.crossType, false);
  assert.equal(g.severity, "high"); // 55 clicks total
  assert.equal(g.primaryPage, "https://s.com/blog/agile-1"); // best position
});

test("blog outranking a course (cross-type) → protect-commercial + high + commercialAtRisk", () => {
  const rows = [
    row("leadership training", "https://s.com/blog/leadership-tips", 20, 500, 3),
    row("leadership training", "https://s.com/leadership-course", 5, 300, 8),
  ];
  const types = new Map([
    ["https://s.com/blog/leadership-tips", "blog"],
    ["https://s.com/leadership-course", "course"],
  ]);
  const [g] = buildConflicts(rows, types, THRESHOLDS, OPTS);
  assert.equal(g.crossType, true);
  assert.equal(g.commercialAtRisk, true);
  assert.equal(g.action, "protect-commercial");
  assert.equal(g.severity, "high");
  // primary should be the course (protect it) even though the blog ranks higher
  assert.equal(g.primaryPage, "https://s.com/leadership-course");
});

test("URL variants of one page do not fabricate a conflict", () => {
  const rows = [
    row("scrum course", "https://s.com/scrum", 10, 300, 5),
    row("scrum course", "https://s.com/scrum/", 8, 250, 6), // same page, trailing slash
  ];
  const g = buildConflicts(rows, new Map(), THRESHOLDS, OPTS);
  assert.equal(g.length, 0); // collapses to one page → no conflict
});

test("branded queries are flagged", () => {
  const rows = [
    row("edstellar courses", "https://s.com/a", 40, 300, 2),
    row("edstellar courses", "https://s.com/b", 30, 280, 3),
  ];
  const types = new Map([["https://s.com/a", "blog"], ["https://s.com/b", "blog"]]);
  const [g] = buildConflicts(rows, types, THRESHOLDS, OPTS);
  assert.equal(g.branded, true);
});

test("classifyGroup recomputes gap/action from the pages given (post-exclusion)", () => {
  const cp = (page: string, position: number, clicks = 0, impressions = 100): ConflictPage => ({
    page,
    contentType: "blog",
    clicks,
    impressions,
    ctr: 0,
    position,
    role: "cannibal",
  });
  // Full set: two near-top pages (gap 0.6) that will be "excluded".
  const full = [cp("https://s.com/a", 4), cp("https://s.com/b", 4.6), cp("https://s.com/c", 25), cp("https://s.com/d", 60)];
  const withTop = classifyGroup("corporate training", full, { nearGap: 10, brandTerms: [] });
  assert.equal(withTop.positionGap, 0.6);
  assert.equal(withTop.action, "consolidate"); // near

  // After removing the two excluded top pages, only c(25) + d(60) remain →
  // gap 35, NOT near → differentiate, and bestPosition is 25 not 4.
  const survivors = full.slice(2);
  const after = classifyGroup("corporate training", survivors, { nearGap: 10, brandTerms: [] });
  assert.equal(after.bestPosition, 25);
  assert.equal(after.positionGap, 35);
  assert.equal(after.action, "differentiate"); // no longer near
  assert.equal(after.pageCount, 2);
});

test("far-apart same-type pages → differentiate", () => {
  const rows = [
    row("project management", "https://s.com/blog/pm-guide", 12, 400, 3),
    row("project management", "https://s.com/blog/pm-other", 1, 120, 55),
  ];
  const types = new Map([
    ["https://s.com/blog/pm-guide", "blog"],
    ["https://s.com/blog/pm-other", "blog"],
  ]);
  const [g] = buildConflicts(rows, types, THRESHOLDS, OPTS);
  assert.equal(g.action, "differentiate");
});
