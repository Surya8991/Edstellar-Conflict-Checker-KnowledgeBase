/**
 * Connected-components clustering (plans/01-conflict-automation.md, Stage 6).
 *
 * The corpus scan (scripts/catalog-conflicts.ts) emits near-duplicate PAIRS.
 * A topic cluster is a connected component of that graph: page A links B, B
 * links C ⇒ {A,B,C} is one group even if A↔C was never directly compared.
 *
 * Pure + deterministic (union-find with path compression). Unit-tested.
 */

/** A single similarity edge between two node ids (e.g. page URLs). */
export type Edge = readonly [string, string];

class UnionFind {
  private parent = new Map<string, string>();

  private find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    // Walk to the root.
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression: point every node on the path straight at the root.
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  add(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  root(x: string): string {
    return this.find(x);
  }
}

/**
 * Group nodes into connected components from a list of edges. Returns each
 * component as a sorted array of node ids; singletons (nodes with no edges)
 * are omitted unless passed in `extraNodes`. Components are sorted largest
 * first, then by first member for a stable order.
 */
export function connectedComponents(
  edges: Edge[],
  extraNodes: string[] = [],
): string[][] {
  const uf = new UnionFind();
  for (const [a, b] of edges) uf.union(a, b);
  for (const n of extraNodes) uf.add(n);

  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    for (const node of [a, b]) {
      if (seen.has(node)) continue;
      seen.add(node);
      const r = uf.root(node);
      const g = groups.get(r) ?? [];
      g.push(node);
      groups.set(r, g);
    }
  }
  for (const n of extraNodes) {
    if (seen.has(n)) continue;
    seen.add(n);
    const r = uf.root(n);
    const g = groups.get(r) ?? [];
    g.push(n);
    groups.set(r, g);
  }

  return [...groups.values()]
    .map((g) => g.slice().sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
