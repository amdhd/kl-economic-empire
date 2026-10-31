// Real-time → game-time conversion. 1 real second = 20 game minutes at 1×.
// Visual time advances continuously; the economy only changes on whole-hour ticks.
import type { ClockState, GameSpeed } from '../types/game';

export const GAME_MS_PER_REAL_MS = 1200; // 20 min * 60 000 ms / 1000 ms
export const HOUR_MS = 3_600_000;
/** Frames longer than this (tab throttling, debugger, GC) are clamped — no catch-up. */
export const MAX_FRAME_MS = 250;
/** Pause plus these speeds only (5× added at user request, D-081); there is no skip. */
export const SPEEDS: readonly GameSpeed[] = [1, 2, 3, 5];

export function gameMsForReal(deltaRealMs: number, speed: GameSpeed): number {
  if (!(deltaRealMs > 0)) return 0;
  return Math.min(deltaRealMs, MAX_FRAME_MS) * speed * GAME_MS_PER_REAL_MS;
}

/**
 * Accumulates real elapsed time into the clock. Returns how many whole game hours were crossed;
 * the caller must run exactly that many hourly ticks (each tick advances `clock.hour`).
 * Does nothing while paused or after campaign end.
 */
export function accumulate(clock: ClockState, deltaRealMs: number): number {
  if (clock.paused) return 0;
  let ms = clock.subHourMs + gameMsForReal(deltaRealMs, clock.speed);
  let hours = 0;
  while (ms >= HOUR_MS) {
    ms -= HOUR_MS;
    hours++;
  }
  clock.subHourMs = ms;
  return hours;
}

/** Continuous display time in epoch minutes (fractional). */
export function displayMinutes(clock: ClockState): number {
  return clock.hour * 60 + clock.subHourMs / 60000;
}
