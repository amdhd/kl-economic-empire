// Dev-only macro validation: paired shock experiments (tools/multipliers.ts) against published-range benchmarks.
// Usage: npm run multipliers -- [--seeds 2027,11,42] [--output artifacts/multipliers.json]
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const seeds = option('--seeds', '2027,11,42,201').split(',').map(Number);
const output = resolve(option('--output', 'artifacts/multipliers.json'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { measureShocks, BENCHMARKS } = await server.ssrLoadModule('/tools/multipliers.ts');
  const rows = seeds.map((seed) => measureShocks(seed));
  const keys = Object.keys(rows[0]).filter((k) => k !== 'seed');
  const summary = Object.fromEntries(keys.map((k) => [k, +(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(3)]));
  const table = keys.map((k) => ({ metric: k, mean: summary[k], min: +Math.min(...rows.map((r) => r[k])).toFixed(3), max: +Math.max(...rows.map((r) => r[k])).toFixed(3),
    benchmark: BENCHMARKS[k] ? BENCHMARKS[k].join(' … ') : '', ok: BENCHMARKS[k] ? (summary[k] >= BENCHMARKS[k][0] && summary[k] <= BENCHMARKS[k][1] ? 'yes' : 'NO') : '' }));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ seeds, summary, rows }, null, 2) + '\n');
  console.table(table);
  console.log(`Fictional model responses: ${output}`);
} finally {
  await server.close();
}
