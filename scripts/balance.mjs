// Dev-only CLI. Vite resolves the engine's TypeScript imports; no browser or player save is used.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const seeds = option('--seeds', '2027,11,42,201,202,203,204,205,206,207,208,209').split(',').map(Number);
if (!seeds.length || seeds.some((s) => !Number.isSafeInteger(s))) throw new Error('--seeds must be comma-separated integers');
const output = resolve(option('--output', 'artifacts/balance.json'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { play, STRATEGIES } = await server.ssrLoadModule('/tools/campaigns.ts');
  const { outcomeLabel, scoreDrivers } = await server.ssrLoadModule('/src/engine/indicators.ts');
  const rows = [];
  for (const seed of seeds) {
    for (const strategy of [...Object.keys(STRATEGIES), 'adaptive', 'adverse_recession']) {
      const adaptive = strategy === 'adaptive';
      const scenario = strategy === 'adverse_recession' ? 'recession' : 'balanced';
      const state = play(seed, STRATEGIES[adaptive ? 'balanced_growth' : strategy] ?? [], scenario, adaptive);
      const drivers = scoreDrivers ? scoreDrivers(state) : {};
      rows.push({ seed, strategy, ...state.indicators.score, approval: state.indicators.approval,
        realGdpAnnual: state.indicators.realGdpAnnual, unemployment: state.indicators.unemployment,
        realIncome: state.reports.at(-1).realDisposablePerCapita, treasury: state.government.treasury / 100,
        debt: state.government.debt / 100, won: outcomeLabel(state).won, ...drivers });
    }
  }
  const summary = [...new Set(rows.map((r) => r.strategy))].map((strategy) => {
    const sample = rows.filter((r) => r.strategy === strategy);
    const mean = (key) => sample.reduce((sum, r) => sum + r[key], 0) / sample.length;
    return { strategy, seeds: sample.length, score: +mean('total').toFixed(2), min: +Math.min(...sample.map((r) => r.total)).toFixed(2),
      max: +Math.max(...sample.map((r) => r.total)).toFixed(2), growth: +mean('growth').toFixed(2), wealth: +mean('wealth').toFixed(2),
      approval: +mean('approval').toFixed(2), wins: sample.filter((r) => r.won).length };
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ seeds, summary, rows }, null, 2) + '\n');
  console.table(summary);
  console.log(`Detailed fictional replay results: ${output}`);
} finally {
  await server.close();
}
