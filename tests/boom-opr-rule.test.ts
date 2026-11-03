import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { infraAutopilot, withoutEvents } from './helpers';

describe('Boom automatic OPR rule (D-134)', () => {
  it('does not ask for a double-digit rate while inflation is low, and trust stays healthy', () => withoutEvents(() => {
    const s = createGame(20270101, 'balanced', 'malaysia', { months: 36, boom: true });
    runHeadless(s, 24 * 31 * 24, infraAutopilot);
    expect(s.centralBank.mpc.length).toBeGreaterThan(8);
    for (const m of s.centralBank.mpc) expect(m.rule).toBeLessThanOrEqual(0.06 + 1e-9);
    expect(s.external.opr).toBeLessThan(0.055);
    expect(s.centralBank.credibility).toBeGreaterThan(70);
  }), 120_000);
});
