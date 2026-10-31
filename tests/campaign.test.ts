// Seeded 24-month campaign regression suite (headless runner — test tooling only).
import { describe, expect, it } from 'vitest';
import { outcomeLabel } from '../src/engine/indicators';
import type { Command } from '../src/engine/game';
import { play, STRATEGIES, type Script } from '../tools/campaigns';

describe('24-month campaign', () => {
  it('is deterministic: same seed + same actions → identical monthly reports', () => {
    const a = play(77, STRATEGIES.balanced_growth);
    const b = play(77, STRATEGIES.balanced_growth);
    expect(JSON.stringify(a.reports)).toBe(JSON.stringify(b.reports));
    expect(JSON.stringify(a.daily)).toBe(JSON.stringify(b.daily));
  });

  it('different strategies produce meaningfully different outcomes', () => {
    const results = Object.fromEntries(Object.entries(STRATEGIES).map(([k, v]) => [k, play(2027, v)]));
    const summary = Object.entries(results).map(([k, s]) => ({
      strategy: k,
      score: +s.indicators.score.total.toFixed(1),
      growth: +s.indicators.score.growth.toFixed(0),
      wealth: +s.indicators.score.wealth.toFixed(0),
      sat: +s.indicators.score.satisfaction.toFixed(0),
      stab: +s.indicators.score.stability.toFixed(0),
      approval: +s.indicators.approval.toFixed(0),
      debtBn: +(s.government.debt / 1e11).toFixed(1),
      unemp: +(s.indicators.unemployment * 100).toFixed(1),
      outcome: outcomeLabel(s).text,
    }));
    console.table(summary);
    const scores = summary.map((x) => x.score);
    // Household feedback is bounded (D-051): require a material score spread, rather than
    // preserving the old multiplier's amplified gap. Also check the actual policy trade-offs.
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(5);
    // Tax maximiser hurts approval vs hands-off; austerity hurts services
    expect(results.tax_maximiser.indicators.approval).toBeLessThan(results.hands_off.indicators.approval);
    expect(results.hands_off.indicators.approval - results.tax_maximiser.indicators.approval).toBeGreaterThan(15);
    expect(results.tax_maximiser.government.debt).toBeLessThan(results.hands_off.government.debt);
    expect(results.austerity.government.serviceQuality).toBeLessThan(results.hands_off.government.serviceQuality);
    expect(results.investment_heavy.government.debt).toBeGreaterThan(results.hands_off.government.debt);
    for (const s of Object.values(results)) expect(s.scheduler.campaignEnded).toBe(true);
  });

  it('responsive (counter-cyclical) play stabilises unemployment in recessions at a small score cost', () => {
    // D-056: with multipliers near published ranges, stimulus mainly cushions jobs; its fiscal cost roughly offsets
    // the growth benefit in the score, so it is no longer expected to raise the score by itself.
    const swf: Script = [5, 12, 19, 26].map((d) => ({ at: [2027, 1, d, 10] as [number, number, number, number], cmd: { type: 'rebalance', targetMY: 0.4, targetUS: 0.4 } as Command }));
    const seeds = Array.from({ length: 8 }, (_, i) => 301 + i);
    const meanU = (s: ReturnType<typeof play>) => s.reports.reduce((a, r) => a + r.unemployment, 0) / s.reports.length;
    const pairs = seeds.map((seed) => [play(seed, [], 'recession'), play(seed, swf, 'recession', true)]);
    const avg = (f: (p: (typeof pairs)[number]) => number) => pairs.reduce((a, p) => a + f(p), 0) / pairs.length;
    expect(avg(([p, a]) => meanU(a) - meanU(p))).toBeLessThan(0);
    expect(avg(([p, a]) => a.indicators.score.total - p.indicators.score.total)).toBeGreaterThan(-1);
  });

  it('an adverse global recession reduces cumulative output and household income across seeds', () => {
    // Recovery may improve the endpoint score (which partly compensates external shocks).
    // Measure the recession's economic cost over the whole campaign, not that adjusted score.
    const seeds = Array.from({ length: 20 }, (_, i) => 201 + i);
    const gaps = seeds.map((seed) => {
      const base = play(seed, [], 'balanced'), recession = play(seed, [], 'recession');
      const total = (s: typeof base, key: 'realGdp' | 'realDisposablePerCapita') => s.reports.reduce((a, r) => a + r[key], 0);
      return { output: total(recession, 'realGdp') / total(base, 'realGdp') - 1,
        income: total(recession, 'realDisposablePerCapita') / total(base, 'realDisposablePerCapita') - 1 };
    });
    const avg = (key: 'output' | 'income') => gaps.reduce((a, x) => a + x[key], 0) / gaps.length;
    expect(avg('output')).toBeLessThan(-0.01);
    expect(avg('income')).toBeLessThan(0);
  });
});
