import { EVENTS } from '../src/data/events';
import type { GameState } from '../src/types/game';
import { klToEpochMin } from '../src/engine/time';
import { runHeadless } from '../src/engine/game';

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
