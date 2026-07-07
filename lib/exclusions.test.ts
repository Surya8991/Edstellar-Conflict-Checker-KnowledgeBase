/** npx tsx --test lib/exclusions.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcludedUrl } from "./exclusions";

const PATTERNS = ["skills-in-demand-in-", "in-demand-skills", "most-in-demand", "corporate-training-companies-"];

test("excludes the two seeded series", () => {
  assert.equal(isExcludedUrl("https://www.edstellar.com/blog/skills-in-demand-in-norway", PATTERNS), true);
  assert.equal(isExcludedUrl("https://www.edstellar.com/blog/most-in-demand-skills-in-it", PATTERNS), true);
  assert.equal(isExcludedUrl("https://www.edstellar.com/blog/corporate-training-companies-japan", PATTERNS), true);
});

test("does NOT exclude other -training-companies blogs (country subset only)", () => {
  assert.equal(isExcludedUrl("https://www.edstellar.com/blog/big-data-training-companies", PATTERNS), false);
  assert.equal(isExcludedUrl("https://www.edstellar.com/blog/best-ai-training-companies-japan", PATTERNS), false);
  assert.equal(isExcludedUrl("https://www.edstellar.com/category/big-data-training", PATTERNS), false);
});

test("case-insensitive; empty patterns/url never exclude", () => {
  assert.equal(isExcludedUrl("HTTPS://x.com/blog/SKILLS-IN-DEMAND-IN-Spain", PATTERNS), true);
  assert.equal(isExcludedUrl("https://x.com/blog/anything", []), false);
  assert.equal(isExcludedUrl(null, PATTERNS), false);
  assert.equal(isExcludedUrl("", PATTERNS), false);
});
