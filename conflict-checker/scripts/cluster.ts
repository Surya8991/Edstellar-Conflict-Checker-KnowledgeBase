/**
 * K-means clustering over page embeddings. Writes pages.cluster_id and a
 * row per cluster into the `clusters` table (with an auto-derived label).
 * Run: npm run cluster -- --k=24
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

interface Row { id: number; title: string | null; category: string | null; embedding: string }

function parseArgs() {
  let k = 24;
  let maxIters = 20;
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, "").split("=");
    if (key === "k") k = Number(val);
    else if (key === "iters") maxIters = Number(val);
  }
  return { k, maxIters };
}

function parseVec(s: string): number[] {
  // pgvector returns "[0.1,0.2,...]"
  return s.replace(/^\[|\]$/g, "").split(",").map(Number);
}
function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return s;
}
function add(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) a[i] += b[i];
}
function scale(a: number[], s: number) {
  for (let i = 0; i < a.length; i++) a[i] *= s;
}

async function main() {
  const { k, maxIters } = parseArgs();
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`Loading embeddings...`);
  const rows = (await sql.query(
    `SELECT id, title, category, embedding::text AS embedding
       FROM pages WHERE embedding IS NOT NULL`,
  )) as Row[];
  console.log(`  ${rows.length} pages`);

  const vecs = rows.map((r) => parseVec(r.embedding));
  const dim = vecs[0].length;

  // k-means++ init
  console.log(`k-means++ init, k=${k}, dim=${dim}`);
  const centers: number[][] = [];
  centers.push(vecs[Math.floor(Math.random() * vecs.length)].slice());
  while (centers.length < k) {
    const d2 = vecs.map((v) => Math.min(...centers.map((c) => dist2(v, c))));
    const sum = d2.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let i = 0;
    while (i < d2.length && (r -= d2[i]) > 0) i++;
    centers.push(vecs[Math.min(i, vecs.length - 1)].slice());
  }

  // Lloyd's algorithm
  const assign = new Int32Array(vecs.length);
  for (let iter = 0; iter < maxIters; iter++) {
    let moved = 0;
    for (let i = 0; i < vecs.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(vecs[i], centers[c]);
        if (d < bestD) { bestD = d; best = c }
      }
      if (assign[i] !== best) { assign[i] = best; moved++ }
    }
    const newCenters: number[][] = Array.from({ length: k }, () => Array(dim).fill(0));
    const counts = new Int32Array(k);
    for (let i = 0; i < vecs.length; i++) {
      add(newCenters[assign[i]], vecs[i]);
      counts[assign[i]]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c]) scale(newCenters[c], 1 / counts[c]);
      else newCenters[c] = vecs[Math.floor(Math.random() * vecs.length)].slice();
    }
    for (let c = 0; c < k; c++) centers[c] = newCenters[c];
    console.log(`  iter ${iter + 1}: moved ${moved}`);
    if (moved === 0) break;
  }

  // Auto-label each cluster from the most common category among its members.
  const buckets: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < vecs.length; i++) buckets[assign[i]].push(i);
  await sql.query("TRUNCATE clusters");

  for (let c = 0; c < k; c++) {
    const tally = new Map<string, number>();
    for (const i of buckets[c]) {
      const cat = rows[i].category || (rows[i].title?.split(/\s+/).slice(0, 3).join(" ") ?? "");
      if (cat) tally.set(cat, (tally.get(cat) ?? 0) + 1);
    }
    const label = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Cluster ${c + 1}`;
    const ins = (await sql.query(
      `INSERT INTO clusters (label, size) VALUES ($1,$2) RETURNING id`,
      [label, buckets[c].length],
    )) as any[];
    const clusterId = Number(ins[0].id);
    const ids = buckets[c].map((i) => rows[i].id);
    if (ids.length) {
      await sql.query(`UPDATE pages SET cluster_id = $1 WHERE id = ANY($2::int[])`, [clusterId, ids]);
    }
    console.log(`  cluster ${c + 1}: "${label}" (${buckets[c].length} pages)`);
  }
  console.log(`\n✓ Done. Browse with: SELECT label, size FROM clusters ORDER BY size DESC;`);
}
main().catch((e) => { console.error(e); process.exit(1); });
