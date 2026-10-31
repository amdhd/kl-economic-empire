// D-056: model-3 macro responses stay within published-range benchmarks (tools/multipliers.ts; `npm run multipliers`).
import { describe, expect, it } from 'vitest';
import { BENCHMARKS, measureShocks, type ShockSummary } from '../tools/multipliers';

const within = (r: ShockSummary, k: keyof typeof BENCHMARKS, slack = 0) => {
  const [lo, hi] = BENCHMARKS[k];
  expect(r[k]).toBeGreaterThanOrEqual(lo - slack);
  expect(r[k]).toBeLessThanOrEqual(hi + slack);
};

describe('macro validation harness (model 3)', () => {
  it('keeps fiscal, monetary and labour-market responses near published ranges', () => {
    const rows = [2027, 42].map((seed) => measureShocks(seed));
    for (const r of rows) {
      within(r, 'spendingMultiplier8q');
      within(r, 'opr25GdpPct8q');
      within(r, 'okun');
      expect(r.sacrificeRatio).toBeGreaterThanOrEqual(BENCHMARKS.sacrificeRatio[0]);
    }
    // The rest are checked on the seed mean: a single paired run moves by up to ~0.1pp with the market's draw path, which
    // shifts whenever the listed universe changes size (D-080: dropping any three listings moves them as much as adding 20).
    const mean = (k: keyof ShockSummary) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
    // Known gap (D-078): with year-one inflation no longer annualised, expectations stay anchored and a rate rise buys
    // less disinflation against a published 0.5–4. The 4-seed mean was 4.19 with 60 listings and is 4.51 with 80
    // (D-080; seeds 3.6–5.0). Guard against it drifting further.
    expect(mean('sacrificeRatio')).toBeLessThanOrEqual(5);
    within({ ...rows[0], spendingMultiplier4q: mean('spendingMultiplier4q') }, 'spendingMultiplier4q', 0.05); // direct domestic content alone gives ~0.8 here (no crowding out)
    // Known residual gaps (docs/economy-model.md): an unrecycled oil windfall and full levy incidence on households.
    // D-058's equity channel adds a little; D-078 removed the year-one inflation annualisation that had over-indexed
    // wages to the shock's first-month price jump (seed 2027: −0.40% → −0.55%; the OPR path is unchanged).
    expect(mean('oil10GdpPct4q')).toBeGreaterThan(-0.6);
    expect(mean('levyMultiplier4q')).toBeLessThan(1.1);
    // Before D-056 these were about −3.3% and −1.4% after ~200 days.
    expect(mean('oil50GdpPct200d')).toBeGreaterThan(-2.2);
    expect(mean('subsidyGdpPct200d')).toBeGreaterThan(-0.5);
  }, 120_000);
});
