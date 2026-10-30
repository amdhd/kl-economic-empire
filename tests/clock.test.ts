import { describe, expect, it } from 'vitest';
import { accumulate, displayMinutes, GAME_MS_PER_REAL_MS, MAX_FRAME_MS } from '../src/engine/clock';
import { advance, createGame, runHeadless } from '../src/engine/game';
import { formatKL, klParts } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';
import { runUntil } from './helpers';

/** Simulate a browser render loop at a given frame interval for `realMs` milliseconds. */
function play(s: ReturnType<typeof createGame>, realMs: number, frameMs: number) {
  let ticks = 0;
  for (let t = 0; t < realMs - 1e-9; t += frameMs) ticks += advance(s, Math.min(frameMs, realMs - t));
  return ticks;
}

describe('game clock', () => {
  it('starts 2027-01-01 08:00 KL time, paused', () => {
    const s = createGame(1);
    expect(formatKL(s.clock.hour * 60)).toMatchObject({ date: '01 Jan 2027', time: '08:00' });
    expect(s.clock.paused).toBe(true);
  });

  it('maps 1 real second to 20 game minutes at 1x', () => {
    expect(GAME_MS_PER_REAL_MS).toBe(1200);
    const s = createGame(1);
    s.clock.paused = false;
    const m0 = displayMinutes(s.clock);
    play(s, 1000, 16);
    expect(displayMinutes(s.clock) - m0).toBeCloseTo(20, 6);
  });

  it('1x: 3 real seconds = 1 game hour (within one frame of tolerance)', () => {
    const s = createGame(1);
    s.clock.paused = false;
    expect(play(s, 2980, 16.6667)).toBe(0);
    expect(play(s, 40, 16.6667)).toBe(1);
    expect(s.clock.hour - s.clock.startHour).toBe(1);
  });

  it('2x: 1.5 real seconds = 1 game hour; 3x: 1 real second = 1 game hour', () => {
    const a = createGame(1);
    a.clock.paused = false;
    a.clock.speed = 2;
    expect(play(a, 1500, 10)).toBe(1);
    const b = createGame(1);
    b.clock.paused = false;
    b.clock.speed = 3;
    expect(play(b, 1000, 10)).toBe(1);
    expect(play(b, 9000, 33)).toBe(9);
  });

  it('pause stops game time and all state changes', () => {
    const s = createGame(1);
    const before = JSON.stringify(s);
    expect(play(s, 60_000, 16)).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('clamps long frames: a 10-minute background gap advances at most one frame', () => {
    const s = createGame(1);
    s.clock.paused = false;
    s.clock.speed = 3;
    const ticks = advance(s, 10 * 60_000);
    expect(ticks).toBe(0); // 250ms × 3 × 1200 = 15 game minutes < 1 hour
    expect(displayMinutes(s.clock) - s.clock.startHour * 60).toBeCloseTo((MAX_FRAME_MS * 3 * 1200) / 60000, 6);
  });

  it('accumulate never runs while paused', () => {
    const s = createGame(1);
    expect(accumulate(s.clock, 5000)).toBe(0);
  });

  it('produces identical state at 1x and 3x for the same number of game hours', () => {
    const a = createGame(7);
    const b = createGame(7);
    a.clock.paused = b.clock.paused = false;
    b.clock.speed = 3;
    play(a, 3000 * 50, 16); // 50 hours at 1x
    play(b, 1000 * 50, 33); // 50 hours at 3x
    expect(a.clock.hour).toBe(b.clock.hour);
    a.clock.speed = b.clock.speed;
    a.clock.subHourMs = b.clock.subHourMs = 0;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('month-end applies exactly once per month, incl. leap-year February 2028', () => {
    const s = createGame(3);
    runUntil(s, 2028, 3, 1, 1);
    const labels = s.reports.map((r) => r.label);
    expect(labels).toEqual(['Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027', 'Jul 2027', 'Aug 2027', 'Sep 2027', 'Oct 2027', 'Nov 2027', 'Dec 2027', 'Jan 2028', 'Feb 2028']);
    // February 2028 has 29 settled days
    expect(s.daily.filter((d) => klParts(d.t * 1440 - 480).month === 2 && klParts(d.t * 1440 - 480).year === 2028)).toHaveLength(29);
  });

  it('save/load restores clock, RNG and economy exactly, without accrual or replay', () => {
    const a = createGame(11);
    runHeadless(a, 24 * 45 + 7);
    a.clock.subHourMs = 1_234_567;
    const json = serialize(a);
    const b = deserialize(json);
    expect(b.clock.hour).toBe(a.clock.hour);
    expect(b.clock.subHourMs).toBe(a.clock.subHourMs);
    expect(b.reports.length).toBe(a.reports.length);
    runHeadless(a, 24 * 40);
    runHeadless(b, 24 * 40);
    a.clock.paused = b.clock.paused;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('campaign ends exactly once at 2029-01-01 08:00 and pauses', () => {
    const s = createGame(5);
    runHeadless(s, 30_000);
    expect(s.scheduler.campaignEnded).toBe(true);
    expect(s.clock.paused).toBe(true);
    expect(formatKL(s.clock.hour * 60)).toMatchObject({ date: '01 Jan 2029', time: '08:00' });
    expect(s.reports).toHaveLength(24);
    expect(s.news.filter((n) => n.title.startsWith('Campaign complete'))).toHaveLength(1);
  });
});

describe('save migration', () => {
  it('upgrades a schema-1 save (projects without `work`) to the current schema', () => {
    const s = createGame(3);
    s.government.projects.push({ id: 1, templateId: 'fibre', name: 'x', kind: 'connectivity', cost: 6e8, spent: 1e8, work: 0, startDay: 0, durationDays: 180, status: 'building' });
    const file = JSON.parse(serialize(s));
    file.state.schemaVersion = 1;
    delete file.state.government.projects[0].work;
    const loaded = deserialize(JSON.stringify(file));
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.government.projects[0].work).toBe(1e8);
  });
});
