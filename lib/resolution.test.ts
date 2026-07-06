/** npx tsx --test lib/resolution.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  urlCleanliness,
  pageAuthority,
  pickWinner,
  decidePair,
  groupAction,
  type AuthorityInput,
} from "./resolution";
import type { SignalScores } from "./signals";

const sig = (o: Partial<SignalScores>): SignalScores => ({
  title: 0, h1: 0, slug: 0, body: 0, ...o,
});
const page = (o: Partial<AuthorityInput> & { url: string }): AuthorityInput => ({
  inbound: 0, tokenCount: 0, ...o,
});

test("urlCleanliness: shorter/shallower wins", () => {
  assert.ok(urlCleanliness("https://x.com/a") > urlCleanliness("https://x.com/a/b/c/d/e"));
});

test("pageAuthority rises with inbound links + depth", () => {
  const weak = pageAuthority(page({ url: "https://x.com/a", inbound: 0, tokenCount: 100 }));
  const strong = pageAuthority(page({ url: "https://x.com/a", inbound: 40, tokenCount: 3000 }));
  assert.ok(strong > weak);
});

test("pickWinner selects higher authority", () => {
  const a = page({ url: "https://x.com/weak", inbound: 0, tokenCount: 200 });
  const b = page({ url: "https://x.com/strong", inbound: 30, tokenCount: 2500 });
  assert.equal(pickWinner(a, b).url, "https://x.com/strong");
});

test("different intent → keep-both, no winner", () => {
  const r = decidePair(page({ url: "a" }), page({ url: "b" }), sig({ body: 0.9 }), "informational", "transactional");
  assert.equal(r.action, "keep-both");
  assert.equal(r.winnerUrl, undefined);
});

test("same intent + high body → merge", () => {
  const r = decidePair(
    page({ url: "https://x.com/a", inbound: 1 }),
    page({ url: "https://x.com/b", inbound: 20 }),
    sig({ body: 0.88 }),
    "commercial", "commercial",
  );
  assert.equal(r.action, "merge");
  assert.equal(r.winnerUrl, "https://x.com/b"); // more inbound links
});

test("near-duplicate title triggers merge even at lower body", () => {
  const r = decidePair(
    page({ url: "https://x.com/a" }),
    page({ url: "https://x.com/b" }),
    sig({ body: 0.4, title: 0.9 }),
    "commercial", "commercial",
  );
  assert.equal(r.action, "merge");
});

test("mid body → consolidate", () => {
  const r = decidePair(page({ url: "a" }), page({ url: "b" }), sig({ body: 0.6 }), "informational", "informational");
  assert.equal(r.action, "consolidate");
});

test("low body + same intent → differentiate", () => {
  const r = decidePair(page({ url: "a" }), page({ url: "b" }), sig({ body: 0.4 }), "informational", "informational");
  assert.equal(r.action, "differentiate");
});

test("groupAction: same intent scales with max similarity", () => {
  assert.equal(groupAction(0.9, ["commercial", "commercial"]), "merge");
  assert.equal(groupAction(0.65, ["commercial", "commercial"]), "consolidate");
  assert.equal(groupAction(0.4, ["commercial", "commercial"]), "differentiate");
});

test("groupAction: mixed intent → differentiate regardless of similarity", () => {
  assert.equal(groupAction(0.95, ["commercial", "informational"]), "differentiate");
});
