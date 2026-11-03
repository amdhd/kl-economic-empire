import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { updateSatisfaction } from '../src/engine/indicators';
import { trendFor } from '../src/data/economic-baseline';

describe('Income approval follows the trend path (D-138)', () => {
  it('income growing exactly on trend scores the neutral 62 after five years, not a saturated 100', () => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 60 });
    s.reports = Array.from({ length: 60 }, () => s.reports[0] ?? ({} as never));
    const onTrend = s.baseline.realDisposablePerCapita * Math.pow(1 + trendFor(s).productivity, 5);
    updateSatisfaction(s, onTrend, s.baseline.rentBurden, 0.025);
    expect(s.indicators.satisfaction.income).toBeCloseTo(62, 5);
  });

  it('maximum taxes cost lasting approval over a five-year term', () => {
    const run = (taxes: boolean) => {
      const s = createGame(2027, 'balanced', 'malaysia', { months: 60 });
      if (taxes) applyCommand(s, { type: 'queueTax', patch: { corporate: 0.35, property: 0.1, consumption: 0.12, incomeTax: 1.5 } }, s.clock.hour * 60);
      runHeadless(s, 24 * 31 * 60);
      return s.indicators;
    };
    const base = run(false), taxed = run(true);
    expect(taxed.satisfaction.income).toBeLessThan(base.satisfaction.income - 30);
    expect(taxed.approval).toBeLessThan(base.approval - 10);
  }, 120_000);
});
