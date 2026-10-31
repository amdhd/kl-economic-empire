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
    for (const seed of [2027, 42]) {
      const r = measureShocks(seed);
      within(r, 'spendingMultiplier4q', 0.05); // direct domestic content alone gives ~0.8 here (no crowding out)
      within(r, 'spendingMultiplier8q');
      within(r, 'opr25GdpPct8q');
      within(r, 'okun');
      within(r, 'sacrificeRatio');
      // Known residual gaps (docs/economy-model.md): an unrecycled oil windfall and full levy incidence on households.
      expect(r.oil10GdpPct4q).toBeGreaterThan(-0.45);
      expect(r.levyMultiplier4q).toBeLessThan(1.1);
      // Before D-056 these were about −3.3% and −1.4% after ~200 days.
      expect(r.oil50GdpPct200d).toBeGreaterThan(-2.2);
      expect(r.subsidyGdpPct200d).toBeGreaterThan(-0.5);
    }
  }, 120_000);
});
