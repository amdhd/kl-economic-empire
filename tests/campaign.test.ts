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
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(8);
    // Tax maximiser hurts approval vs hands-off; austerity hurts services
    expect(results.tax_maximiser.indicators.approval).toBeLessThan(results.hands_off.indicators.approval);
    expect(results.austerity.government.serviceQuality).toBeLessThan(results.hands_off.government.serviceQuality);
    expect(results.investment_heavy.government.debt).toBeGreaterThan(results.hands_off.government.debt);
    for (const s of Object.values(results)) expect(s.scheduler.campaignEnded).toBe(true);
  });

  it('responsive (counter-cyclical) play pays off in downturns', () => {
    // Single seeds are bimodal and shift whenever the RNG stream changes (D-P2-05), so test
    // across 12 seeds: the payoff should come where passive play struggles.
    const swf: Script = [5, 12, 19, 26].map((d) => ({ at: [2027, 1, d, 10] as [number, number, number, number], cmd: { type: 'rebalance', targetMY: 0.4, targetUS: 0.4 } as Command }));
    const seeds = Array.from({ length: 12 }, (_, i) => 301 + i);
    const pairs = seeds.map((seed) => [play(seed, []).indicators.score.total, play(seed, swf, 'balanced', true).indicators.score.total]);
    const weak = pairs.filter(([passive]) => passive < 55);
    expect(weak.length).toBeGreaterThanOrEqual(2);
    const gain = weak.reduce((a, [p, a2]) => a + a2 - p, 0) / weak.length;
    expect(gain).toBeGreaterThan(3); // ≈ +6.5 at time of writing
    const all = pairs.reduce((a, [p, a2]) => a + a2 - p, 0) / pairs.length;
    expect(all).toBeGreaterThan(0);
  });

  it('adverse global recession scenario is harder than the balanced baseline', () => {
    // Single-seed outcomes are bimodal (~40 vs ~70), far wider than the scenario effect, so compare
    // a 20-seed average (see docs/decisions.md D-P2-05).
    const seeds = Array.from({ length: 20 }, (_, i) => 201 + i);
    const scores = seeds.map((seed) => [play(seed, [], 'balanced').indicators.score.total, play(seed, [], 'recession').indicators.score.total]);
    const avg = (i: number) => scores.reduce((a, x) => a + x[i], 0) / scores.length;
    expect(avg(1)).toBeLessThan(avg(0));
  });
});
