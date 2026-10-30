// Dev-only deterministic engine benchmark. Timing measurements do not enter GameState or RNG.
import { createGame } from '../src/engine/game';
import { runHourTick } from '../src/engine/scheduler';
import { serialize } from '../src/persistence/save';

export function profileEngine(seed = 20270101) {
  const s = createGame(seed);
  const hourly: number[] = [], daily: number[] = [], monthly: number[] = [];
  while (!s.scheduler.campaignEnded) {
    const day = s.scheduler.lastDay, reports = s.reports.length;
    const start = performance.now();
    runHourTick(s);
    const elapsed = performance.now() - start;
    (s.reports.length !== reports ? monthly : s.scheduler.lastDay !== day ? daily : hourly).push(elapsed);
  }
  const stats = (sample: number[]) => {
    const sorted = [...sample].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { count: sample.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) };
  };
  const saves: number[] = [];
  let bytes = 0;
  for (let n = 0; n < 10; n++) {
    const start = performance.now();
    const json = serialize(s);
    saves.push(performance.now() - start);
    bytes = new TextEncoder().encode(json).length;
  }
  return { seed, hourly: stats(hourly), daily: stats(daily), monthly: stats(monthly), serialize: stats(saves), saveBytes: bytes };
}
