import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../src/engine/game';
import { navMYR, positionValueMYR } from '../src/engine/sovereign-fund';
import { COMPANIES } from '../src/data/companies';
import { runUntil, withoutEvents } from './helpers';

const myValue = (s: ReturnType<typeof createGame>) => COMPANIES.filter((c) => c.exchange === 'MY').reduce((a, c) => a + positionValueMYR(s, c.id), 0);

describe('Boom mode fund orders have no volume limit (D-124)', () => {
  it('a Boom fund can build a RM50bn+ Malaysian position in one Bursa session; Realistic cannot', () => withoutEvents(() => {
    const run = (boom: boolean) => {
      const s = createGame(8, 'balanced', 'malaysia', { months: 36, boom });
      runUntil(s, 2027, 1, 5, 10); // Tue: Bursa open
      expect(applyCommand(s, { type: 'rebalance', targetMY: 0.6, targetUS: 0 }, s.clock.hour * 60).ok).toBe(true);
      return { bought: myValue(s), nav: navMYR(s) };
    };
    const boom = run(true), real = run(false);
    expect(boom.bought).toBeGreaterThan(50e9);
    expect(real.bought).toBeLessThan(10e9);
  }));
});
