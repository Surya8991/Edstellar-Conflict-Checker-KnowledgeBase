/** npx tsx --test lib/cluster.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedComponents, shouldGroupPair } from "./cluster";

test("transitive edges form one component", () => {
  // A-B, B-C ⇒ {A,B,C} even though A-C was never a direct edge.
  const groups = connectedComponents([["a", "b"], ["b", "c"]]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], ["a", "b", "c"]);
});

test("disjoint edges form separate components", () => {
  const groups = connectedComponents([["a", "b"], ["x", "y"], ["y", "z"]]);
  assert.equal(groups.length, 2);
  // Largest first: {x,y,z} before {a,b}.
  assert.deepEqual(groups[0], ["x", "y", "z"]);
  assert.deepEqual(groups[1], ["a", "b"]);
});

test("no edges ⇒ no components (singletons omitted)", () => {
  assert.deepEqual(connectedComponents([]), []);
});

test("extraNodes with no edges appear as singletons", () => {
  const groups = connectedComponents([["a", "b"]], ["solo"]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], ["a", "b"]);
  assert.deepEqual(groups[1], ["solo"]);
});

test("duplicate edges don't duplicate members", () => {
  const groups = connectedComponents([["a", "b"], ["a", "b"], ["b", "a"]]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], ["a", "b"]);
});

test("chained merge across many edges", () => {
  const groups = connectedComponents([
    ["1", "2"], ["3", "4"], ["2", "3"], ["5", "6"],
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], ["1", "2", "3", "4"]);
  assert.deepEqual(groups[1], ["5", "6"]);
});

// ── shouldGroupPair (type-aware precision rules) ──────────────────────────

test("cross-type pairs never group (bleed, not duplication)", () => {
  assert.equal(shouldGroupPair({ aType: "category", bType: "course", aTitle: "x", bTitle: "x", sim: 0.99 }), false);
  assert.equal(shouldGroupPair({ aType: null, bType: null, aTitle: "x", bTitle: "x", sim: 0.99 }), false);
});

test("distinct courses with template-inflated similarity do NOT group", () => {
  // Express.js vs Node.js: different products, title Jaccard 0.5, body ~0.74-0.90.
  assert.equal(shouldGroupPair({
    aType: "course", bType: "course",
    aTitle: "Express JS Training", bTitle: "Node JS Training",
    sim: 0.90,
  }), false);
});

test("true duplicate courses group at the hard bar", () => {
  assert.equal(shouldGroupPair({
    aType: "course", bType: "course",
    aTitle: "Anything", bTitle: "Entirely Different",
    sim: 0.95,
  }), true);
});

test("re-listed course (same title) groups at the softer bar", () => {
  assert.equal(shouldGroupPair({
    aType: "course", bType: "course",
    aTitle: "Leadership Skills Training", bTitle: "Leadership Skills Training",
    sim: 0.89,
  }), true);
});

test("blogs group at the editorial threshold", () => {
  assert.equal(shouldGroupPair({ aType: "blog", bType: "blog", aTitle: "a", bTitle: "b", sim: 0.86 }), true);
  assert.equal(shouldGroupPair({ aType: "blog", bType: "blog", aTitle: "a", bTitle: "b", sim: 0.84 }), false);
});
