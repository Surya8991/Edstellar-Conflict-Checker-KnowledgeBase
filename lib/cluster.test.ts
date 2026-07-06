/** npx tsx --test lib/cluster.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedComponents } from "./cluster";

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
