// Dev-only paired experiments. Never imported by the player app.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const output = process.argv[2] ?? 'artifacts/household-balance.json';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { createGame, applyCommand, runHeadless } = await server.ssrLoadModule('/src/engine/game.ts');
  const { EVENTS } = await server.ssrLoadModule('/src/data/events.ts');
  const { COMMODITY_EPISODES } = await server.ssrLoadModule('/src/data/world.ts');
  const { BASE_MPC } = await server.ssrLoadModule('/src/engine/calibration.ts');
  for (const e of EVENTS) e.weeklyHazard = 0;
  for (const e of COMMODITY_EPISODES) e.hazard = 0;
  const rows = [];
  for (const seed of [11, 42, 201, 2027]) {
    for (const channel of ['all', 'fixed_mpc', 'fixed_confidence']) {
      const states = {};
      for (const scenario of ['baseline', 'oil90', 'subsidy', 'recession']) {
        const s = createGame(seed, scenario === 'recession' ? 'recession' : 'balanced');
        if (scenario === 'oil90') s.events.active.push({ id: s.events.nextId++, templateId: 'oil_spike', title: 'Controlled 50% oil shock', startDay: s.scheduler.lastDay + 31, endDay: s.scheduler.lastDay + 121, magnitude: Math.log(1.5) / Math.log(1.4) });
        if (scenario === 'subsidy') {
          const result = applyCommand(s, { type: 'queueCommodity', patch: { fuelEligible: 0 } }, s.clock.hour * 60);
          if (!result.ok) throw new Error(result.message ?? 'Subsidy command rejected');
        }
        let minSavings = s.households.savings;
        runHeadless(s, 30_000, st => {
          if (channel === 'fixed_mpc') st.households.mpc = BASE_MPC;
          if (channel === 'fixed_confidence') st.households.confidence = 0.6;
          minSavings = Math.min(minSavings, st.households.savings);
        });
        states[scenario] = s;
        const base = states.baseline;
        const gaps = s.reports.map((r, i) => 100 * (r.realGdp / base.reports[i].realGdp - 1));
        rows.push({ seed, channel, scenario, troughGdpPct: Math.min(...gaps), month6GdpPct: gaps[5], month12GdpPct: gaps[11], month24GdpPct: gaps[23], unemploymentPct: s.indicators.unemployment * 100, approval: s.indicators.approval, score: s.indicators.score.total, minSavingsBn: minSavings / 1e9, finalMpc: s.households.mpc, confidence: s.households.confidence });
      }
    }
  }
  const summary = [];
  for (const channel of ['all', 'fixed_mpc', 'fixed_confidence']) for (const scenario of ['baseline', 'oil90', 'subsidy', 'recession']) {
    const sample = rows.filter(r => r.channel === channel && r.scenario === scenario);
    const means = Object.fromEntries(['troughGdpPct', 'month6GdpPct', 'month12GdpPct', 'month24GdpPct', 'unemploymentPct', 'approval', 'score', 'minSavingsBn', 'finalMpc', 'confidence'].map(k => [k, sample.reduce((a, r) => a + r[k], 0) / sample.length]));
    summary.push({ channel, scenario, ...means });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.table(summary.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]))));
  console.log(output);
} finally { await server.close(); }
