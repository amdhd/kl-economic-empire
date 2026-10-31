import { describe, expect, it } from 'vitest';
import { advance, createGame, runHeadless } from '../src/engine/game';
import { addDeal } from '../src/engine/deals';
import { runSkip, skipRefusal, startSkip, stepSkip, type SkipKind } from '../src/engine/skip';
import { klParts } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';

/** A game with no open offers, so only the stop condition under test can fire. */
function quiet(seed = 3) {
  const s = createGame(seed);
  s.deals.items = [];
  s.fdi.pledges = [];
  return s;
}

/** Run a skip to completion, passing every stop, and return the total game hours advanced. */
function skipThrough(s: ReturnType<typeof createGame>, kind: SkipKind, ack = new Set<string>()) {
  let hours = 0;
  for (let i = 0; i < 20; i++) {
    const r = runSkip(s, kind, ack);
    if (typeof r === 'string') throw new Error(r);
    hours += r.hours;
    if (r.stop === 'done') return hours;
  }
  throw new Error('skip never finished');
}

describe('safe time skip (D-083)', () => {
  it('is refused unless the game is paused, and after the term ends', () => {
    const s = quiet();
    s.clock.paused = false;
    expect(skipRefusal(s)).toMatch(/Pause/);
    expect(typeof startSkip(s, 'days15')).toBe('string');
    expect(s.clock.hour).toBe(s.clock.startHour);
    s.clock.paused = true;
    expect(skipRefusal(s)).toBeNull();
    s.scheduler.campaignEnded = true;
    expect(skipRefusal(s)).toMatch(/ended/);
  });

  it('Skip 15 days equals 360 normal hourly ticks (state-identical), and does not use real time', () => {
    const a = quiet(), b = quiet();
    const sub = a.clock.subHourMs = b.clock.subHourMs = 1_234_567;
    expect(skipThrough(a, 'days15')).toBe(15 * 24);
    runHeadless(b, 15 * 24);
    expect(a.clock.subHourMs).toBe(sub);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('also equals the real-time driver over the same game hours', () => {
    const a = quiet();
    skipThrough(a, 'days15');
    const c = quiet();
    c.clock.paused = false;
    let h = 0;
    while (h < 15 * 24) h += advance(c, 250);
    expect(c.clock.hour).toBe(a.clock.hour);
    c.clock.paused = a.clock.paused;
    c.clock.subHourMs = a.clock.subHourMs;
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it('Skip to month close ends exactly on the tick that closes a month and matches a normal run', () => {
    const a = quiet(), b = quiet();
    const closed = a.scheduler.lastMonthKey;
    const hours = skipThrough(a, 'monthClose');
    expect(a.scheduler.lastMonthKey).toBe(closed + 1);
    expect(klParts(a.clock.hour * 60)).toMatchObject({ day: 1, hour: 0 });
    expect(a.reports.length).toBe(1);
    runHeadless(b, hours);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('steps one game day per frame and can be cancelled between frames at a whole tick', () => {
    const s = quiet();
    const plan = startSkip(s, 'days15');
    if (typeof plan === 'string') throw new Error(plan);
    const ack = new Set<string>();
    expect(stepSkip(s, plan, ack)).toEqual({ hours: 24, stop: null });
    expect(stepSkip(s, plan, ack)).toEqual({ hours: 24, stop: null });
    // The UI cancels by dropping the plan: state is a whole number of hours in, paused, no partial tick.
    expect(s.clock.hour - s.clock.startHour).toBe(48);
    expect(s.clock.paused).toBe(true);
    const b = quiet();
    runHeadless(b, 48);
    expect(JSON.stringify(s)).toBe(JSON.stringify(b));
  });

  it('never runs past the end of the term and reports it', () => {
    const s = quiet();
    s.clock.endHour = s.clock.hour + 40;
    const r = runSkip(s, 'days15');
    expect(r).toMatchObject({ stop: 'termEnd', hours: 40 });
    expect(s.scheduler.campaignEnded).toBe(true);
  });

  it('stops before a critical alert day completes, via the daily check', () => {
    const s = quiet();
    let day = 0;
    const r = runSkip(s, 'days15', new Set(), () => ++day === 3);
    expect(r).toMatchObject({ stop: 'criticalAlert' });
    if (typeof r === 'string') throw new Error(r);
    expect(klParts(s.clock.hour * 60).hour).toBe(0); // evaluated at a day boundary
    expect(r.hours).toBeLessThan(15 * 24);
  });

  it('stops for a Deal Room offer about to close, once, then lets it lapse', () => {
    const s = quiet();
    const d = addDeal(s, 'test', 'diligence', 'Test offer', 'treasury', 1000);
    d.deadline = s.scheduler.lastDay + 5; // closes in 5 days
    const ack = new Set<string>();
    const r = runSkip(s, 'days15', ack);
    expect(r).toMatchObject({ stop: 'dealOffer' });
    if (typeof r === 'string') throw new Error(r);
    expect(d.status).toBe('opportunity'); // stopped before it could expire
    expect(r.hours).toBeGreaterThan(0);
    expect(r.hours).toBeLessThan(15 * 24);
    // Skipping again passes it deliberately.
    expect(runSkip(s, 'days15', ack)).toMatchObject({ stop: 'done' });
    expect(d.status).toBe('expired');
  });

  it('stops for an FDI pledge about to lapse', () => {
    const s = quiet();
    s.fdi.pledges.push({ id: 99, investor: 'US:GOOGL', kind: 'datacentre', sector: 'fin', title: 'Test pledge', amount: 1e9, ask: 0.1, incentive: 0,
      jobs: 1, buildMonths: 6, offeredDay: s.scheduler.lastDay, decideByDay: s.scheduler.lastDay + 6, startDay: -1, spent: 0, status: 'offered' } as never);
    expect(runSkip(s, 'days15')).toMatchObject({ stop: 'fdiPledge' });
    expect(s.fdi.pledges[0].status).toBe('offered');
  });

  it('stops before an MPC meeting only when the player is steering the rate', () => {
    const auto = quiet();
    expect(skipThrough(auto, 'monthClose')).toBeGreaterThan(0); // never stopped for an MPC
    const s = quiet();
    s.centralBank.mode = 'manual';
    // Move to the day before 1 March (an odd month: MPC meets).
    const target = Date.UTC(2027, 1, 28, 16, 0) / 3_600_000; // 00:00 KL on 1 Mar
    runHeadless(s, target - s.clock.hour - 1);
    const ack = new Set<string>();
    expect(runSkip(s, 'days15', ack)).toMatchObject({ stop: 'mpcMeeting', hours: 0 });
    expect(s.centralBank.mpc.length).toBe(0);
    // Stopped for once; a second skip passes the meeting, which then happens.
    expect(runSkip(s, 'days15', ack)).toMatchObject({ stop: 'done' });
    expect(s.centralBank.mpc.length).toBe(1);
  });

  it('autosave/undo: a serialized pre-skip state restores exactly', () => {
    const s = quiet();
    const snapshot = serialize(s, 'Before skip');
    skipThrough(s, 'days15');
    expect(s.clock.hour).toBeGreaterThan(s.clock.startHour);
    const restored = deserialize(snapshot);
    expect(restored.clock.hour).toBe(restored.clock.startHour);
    expect(restored.clock.paused).toBe(true);
    // The restored game replays the same future as the original.
    const t = quiet();
    expect(JSON.stringify(restored)).toBe(JSON.stringify(deserialize(serialize(t))));
    skipThrough(restored, 'days15');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(s));
  });
});
