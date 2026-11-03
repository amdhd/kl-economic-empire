import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { withoutEvents } from './helpers';

const capital = (corporate?: number) => withoutEvents(() => {
  const s = createGame(2027, 'balanced', 'malaysia', { months: 36, boom: true });
  if (corporate !== undefined) applyCommand(s, { type: 'queueTax', patch: { corporate } }, s.clock.hour * 60);
  runHeadless(s, 24 * 31 * 24);
  return Object.values(s.sectors).reduce((a, x) => a + x.capital, 0);
});

describe('Boom investment drive follows after-tax returns (D-139)', () => {
  it('after two years a 35% corporate tax leaves ~8% less capital than the opening rate and a zero rate ~5% more (old rule: ±1–2%)', () => {
    const base = capital(), high = capital(0.35), zero = capital(0);
    expect(high / base).toBeLessThan(0.95);
    expect(zero / base).toBeGreaterThan(1.03);
  }, 120_000);
});
