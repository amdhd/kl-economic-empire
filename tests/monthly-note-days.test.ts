import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { withoutEvents } from './helpers';

describe('Monthly report compares output per day (D-143)', () => {
  it('no month-on-month real output note swings with month length', () => withoutEvents(() => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 24 });
    runHeadless(s, 24 * 31 * 14);
    const moves = s.reports.slice(1).map((r) => {
      const note = r.notes.find((n) => n.startsWith('Real output'));
      expect(note).toBeDefined();
      return Number(/(\d+\.\d)%/.exec(note!)![1]);
    });
    expect(moves.length).toBeGreaterThan(10);
    // Raw monthly sums would show about 10% for January → February and 3% for every 30/31-day step.
    for (const m of moves) expect(m).toBeLessThan(2.5);
  }), 120_000);
});
