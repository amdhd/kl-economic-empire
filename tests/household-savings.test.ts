import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { withoutEvents } from './helpers';

describe('Household liquid savings track income (D-144)', () => {
  it('the savings-to-income ratio stays near its opening level over five years instead of rising by half', () => withoutEvents(() => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 60 });
    const ratio = () => s.households.savings / (s.households.permanentIncome * 365);
    const opening = ratio();
    runHeadless(s, 24 * 365 * 5);
    // Old rule: every ringgit not spent stayed liquid, and the ratio rose from 0.87 to about 1.24 in five years.
    expect(ratio() / opening).toBeGreaterThan(0.9);
    expect(ratio() / opening).toBeLessThan(1.1);
  }), 120_000);
});
