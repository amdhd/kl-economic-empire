import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { infraAutopilot, withoutEvents } from './helpers';

const run = (taxes: boolean) => withoutEvents(() => {
  const s = createGame(2027, 'balanced', 'malaysia', { months: 36, boom: true });
  if (taxes) applyCommand(s, { type: 'queueTax', patch: { corporate: 0.35, property: 0.1, consumption: 0.12, incomeTax: 1.5 } }, s.clock.hour * 60);
  runHeadless(s, 24 * 31 * 24, infraAutopilot);
  const sec = Object.values(s.sectors);
  return { productivity: sec.reduce((a, x) => a + x.productivity, 0) / sec.length, gdp: s.reports.slice(-3).reduce((a, r) => a + r.realGdp, 0), approval: s.indicators.approval };
});

describe('Boom policies have consequences (D-140)', () => {
  it('maximum taxes slow Boom productivity growth, cut GDP and cost approval', () => {
    const base = run(false), taxed = run(true);
    // Old rule: productivity grew at the same exogenous rate whatever the policy, and approval moved by about 2 points.
    expect(taxed.productivity / base.productivity).toBeLessThan(0.97);
    expect(taxed.gdp / base.gdp).toBeLessThan(0.85);
    expect(taxed.approval).toBeLessThan(base.approval - 8);
  }, 120_000);
});
