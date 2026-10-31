import { EVENTS } from '../src/data/events';
import type { GameState } from '../src/types/game';
import { klToEpochMin } from '../src/engine/time';
import { applyCommand, runHeadless } from '../src/engine/game';
import { INFRA, NETWORKS } from '../src/data/infrastructure';
import { pendingSteps, projectedLoad } from '../src/engine/infrastructure';

/** Disable random events for controlled causal experiments (restores after fn). */
export function withoutEvents<T>(fn: () => T): T {
  const saved = EVENTS.map((e) => e.weeklyHazard);
  for (const e of EVENTS) e.weeklyHazard = 0;
  try {
    return fn();
  } finally {
    EVENTS.forEach((e, i) => (e.weeklyHazard = saved[i]));
  }
}

/** Run hourly ticks until the clock reaches the given KL wall time. */
export function runUntil(s: GameState, y: number, m: number, d: number, h = 0): void {
  const target = klToEpochMin(y, m, d, h) / 60;
  runHeadless(s, target - s.clock.hour);
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** A competent Boom-mode player for tests (D-084): every fortnight, order capacity ahead of each network's projected load. */
export function infraAutopilot(g: GameState): void {
  if (!g.infra || g.clock.hour % (24 * 15) !== 0) return;
  for (const n of NETWORKS) {
    const have = g.infra.nets[n].capacity + INFRA.step * pendingSteps(g.infra, n);
    const need = projectedLoad(g.infra, n);
    if (need * 1.25 > have) applyCommand(g, { type: 'buildInfra', network: n, steps: have < need ? 4 : 2 }, g.clock.hour * 60);
  }
}
