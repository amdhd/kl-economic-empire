import { BASE_BUDGET, budgetFor, trendFor } from '../src/data/economic-baseline';
// Test/dev campaign strategies, shared by replays and the command-line balance runner.
import { applyCommand, createGame, runHeadless, type Command } from '../src/engine/game';
import { klToEpochMin } from '../src/engine/time';
import type { GameState, ScenarioId } from '../src/types/game';

export type Script = { at: [number, number, number, number]; cmd: Command }[];

/** Counter-cyclical rule applied at each month start: stimulate when jobless > 4.5%, withdraw below 3%. */
function counterCyclical(st: GameState, lastMonth: { n: number }) {
  if (st.reports.length === lastMonth.n) return;
  lastMonth.n = st.reports.length;
  const u = st.indicators.unemployment;
  const stim = u > 0.045 ? 1 : u < 0.03 ? -1 : 0;
  const b = st.government.policies.budget;
  // Neutral is the inherited budget path (model 3 indexes it monthly, D-055), not the 2027 level.
  const path = Math.pow(1 + trendFor(st).budgetEscalation, st.reports.length / 12);
  const base = budgetFor(st);
  const target = { transfers: base.transfers * path * (1 + stim * 0.5), development: base.development * path * (1 + stim * 0.8) };
  if (target.transfers !== b.transfers || target.development !== b.development) applyCommand(st, { type: 'queueBudget', patch: target }, st.clock.hour * 60);
}

export function play(seed: number, script: Script, scenario: ScenarioId = 'balanced', adaptive = false): GameState {
  const s = createGame(seed, scenario);
  const queue = script.map((x) => ({ min: klToEpochMin(...x.at), cmd: x.cmd })).sort((a, b) => a.min - b.min);
  const lastMonth = { n: 0 };
  runHeadless(s, 30_000, (st) => {
    while (queue.length && queue[0].min <= st.clock.hour * 60) applyCommand(st, queue.shift()!.cmd, st.clock.hour * 60);
    if (adaptive) counterCyclical(st, lastMonth);
  });
  return s;
}

export const STRATEGIES: Record<string, Script> = {
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
    { at: [2027, 1, 4, 10], cmd: { type: 'setBorrowing', patch: { maxDebtToGdp: 0.8 } } },
    ...['lrt', 'brt', 'fibre', 'housing', 'flood', 'clinics', 'heritage'].map((t) => ({ at: [2027, 1, 4, 10] as [number, number, number, number], cmd: { type: 'startProject', templateId: t } as Command })),
  ],
  austerity: [
    { at: [2027, 1, 4, 10], cmd: { type: 'queueBudget', patch: { health: BASE_BUDGET.health * 2 / 3, services: BASE_BUDGET.services * 450 / 700, safety: BASE_BUDGET.safety * 250 / 350, development: BASE_BUDGET.development * 0.4, admin: BASE_BUDGET.admin * 2 / 3, transfers: BASE_BUDGET.transfers * 0.5 } } },
  ],
};

