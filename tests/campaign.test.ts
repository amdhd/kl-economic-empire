// Seeded 24-month campaign regression suite (headless runner — test tooling only).
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless, type Command } from '../src/engine/game';
import { outcomeLabel } from '../src/engine/indicators';
import { klToEpochMin } from '../src/engine/time';
import type { GameState, ScenarioId } from '../src/types/game';

type Script = { at: [number, number, number, number]; cmd: Command }[];

/** Counter-cyclical rule applied at each month start: stimulate when jobless > 4.5%, withdraw below 3%. */
function counterCyclical(st: GameState, lastMonth: { n: number }) {
  if (st.reports.length === lastMonth.n) return;
  lastMonth.n = st.reports.length;
  const u = st.indicators.unemployment;
  const stim = u > 0.045 ? 1 : u < 0.03 ? -1 : 0;
  const b = st.government.policies.budget;
  const target = { transfers: 500e6 + stim * 250e6, development: 250e6 + stim * 200e6 };
  if (target.transfers !== b.transfers || target.development !== b.development) applyCommand(st, { type: 'queueBudget', patch: target }, st.clock.hour * 60);
}

function play(seed: number, script: Script, scenario: ScenarioId = 'balanced', adaptive = false): GameState {
  const s = createGame(seed, scenario);
  const queue = script.map((x) => ({ min: klToEpochMin(...x.at), cmd: x.cmd })).sort((a, b) => a.min - b.min);
  const lastMonth = { n: 0 };
  runHeadless(s, 30_000, (st) => {
    while (queue.length && queue[0].min <= st.clock.hour * 60) applyCommand(st, queue.shift()!.cmd, st.clock.hour * 60);
    if (adaptive) counterCyclical(st, lastMonth);
  });
  return s;
}

const STRATEGIES: Record<string, Script> = {
  hands_off: [],
  balanced_growth: [
    { at: [2027, 1, 4, 10], cmd: { type: 'startProject', templateId: 'fibre' } },
    { at: [2027, 1, 4, 10], cmd: { type: 'startProject', templateId: 'clinics' } },
    { at: [2027, 1, 4, 10], cmd: { type: 'startProject', templateId: 'brt' } },
    { at: [2027, 1, 4, 10], cmd: { type: 'queueTax', patch: { corporate: 0.17, property: 0.045 } } },
    // Deploy the SWF gradually (liquidity limits): rebalance each Tuesday morning for 8 weeks.
    ...[5, 12, 19, 26].flatMap((d) => [{ at: [2027, 1, d, 10] as [number, number, number, number], cmd: { type: 'rebalance', targetMY: 0.35, targetUS: 0.35 } as Command }]),
    ...[2, 9, 16, 23].flatMap((d) => [{ at: [2027, 2, d, 10] as [number, number, number, number], cmd: { type: 'rebalance', targetMY: 0.35, targetUS: 0.35 } as Command }]),
    { at: [2027, 7, 1, 10], cmd: { type: 'startProject', templateId: 'housing' } },
  ],
  tax_maximiser: [
    { at: [2027, 1, 4, 10], cmd: { type: 'queueTax', patch: { corporate: 0.3, property: 0.08, consumption: 0.1, household: 0.06 } } },
  ],
  investment_heavy: [
    { at: [2027, 1, 4, 10], cmd: { type: 'setBorrowing', patch: { maxDebtToGdp: 0.6 } } },
    ...['lrt', 'brt', 'fibre', 'housing', 'flood', 'clinics', 'heritage'].map((t) => ({ at: [2027, 1, 4, 10] as [number, number, number, number], cmd: { type: 'startProject', templateId: t } as Command })),
  ],
  austerity: [
    { at: [2027, 1, 4, 10], cmd: { type: 'queueBudget', patch: { health: 600e6, services: 450e6, safety: 250e6, development: 100e6, admin: 200e6, transfers: 250e6 } } },
  ],
};

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
