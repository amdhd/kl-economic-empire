// Display-only train service rule for the living map: follows service hours, peaks, jobs and new rail.
import { describe, expect, it } from 'vitest';
import { RAIL_LINES } from '../src/data/rail';
import { createGame } from '../src/engine/game';
import { klToEpochMin } from '../src/engine/time';
import { trainsOnLine } from '../src/map/train-service';

const kj = RAIL_LINES.find(l => l.id === 'KJ')!;
const at = (h: number) => { const s = createGame(77); s.clock.hour = klToEpochMin(2027, 1, 5, h) / 60; return s; };

describe('living map trains', () => {
  it('pins the seven KL lines from OpenStreetMap with plausible lengths', () => {
    expect(RAIL_LINES.map(l => l.id).sort()).toEqual(['11', '12', '9', 'AG', 'KJ', 'MR', 'SP'].sort());
    for (const l of RAIL_LINES) for (const [lng, lat] of l.path) expect(lng > 101.4 && lng < 101.95 && lat > 2.85 && lat < 3.35).toBe(true);
  });
  it('runs no trains overnight, more at peaks, fewer when jobs fall, more after the LRT project', () => {
    expect(trainsOnLine(at(3), kj, 45_000)).toBe(0);
    const mid = trainsOnLine(at(13), kj, 45_000), peak = trainsOnLine(at(8), kj, 45_000);
    expect(peak).toBeGreaterThan(mid);
    const slump = at(13);
    slump.households.employed *= 0.95;
    expect(trainsOnLine(slump, kj, 45_000)).toBeLessThan(mid);
    const rail = at(13);
    rail.government.projects.push({ id: 1, templateId: 'lrt', name: 'LRT', kind: 'transport', cost: 1, spent: 1, work: 1, startDay: 0, durationDays: 1, status: 'complete' });
    expect(trainsOnLine(rail, kj, 45_000)).toBeGreaterThan(mid);
  });
});
