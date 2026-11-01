import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { petronasOutlook } from '../src/engine/soe';
import { clone, withoutEvents } from './helpers';

describe('PETRONAS 12-month outlook', () => {
  it('is pure, and capex trades cash now for output later', () => withoutEvents(() => {
    const s = createGame(401);
    const before = JSON.stringify(s);
    const base = petronasOutlook(s, s.soe.petronas.dividendAnnual, s.soe.petronas.capexAnnual);
    expect(JSON.stringify(s)).toBe(before);
    const low = petronasOutlook(s, s.soe.petronas.dividendAnnual, 20e9);
    const high = petronasOutlook(s, s.soe.petronas.dividendAnnual, 90e9);
    expect(low.endCash).toBeGreaterThan(base.endCash);
    expect(high.endCash).toBeLessThan(base.endCash);
    expect(low.endProduction).toBeLessThan(base.endProduction);
    expect(high.endProduction).toBeGreaterThan(base.endProduction);
    expect(base.cashChange).toBeCloseTo(base.profitAfterTax + 30e9 - base.capex - base.dividend, 0);
  }));

  it('warns when a big dividend would push cash below the floor', () => withoutEvents(() => {
    const s = createGame(402);
    expect(petronasOutlook(s, s.soe.petronas.dividendAnnual, s.soe.petronas.capexAnnual).daysToFloor).toBeNull();
    s.soe.petronas.cash = 60e9; // after earlier special dividends
    const o = petronasOutlook(s, 80e9, 100e9);
    expect(o.daysToFloor).not.toBeNull();
    expect(o.daysToFloor!).toBeGreaterThan(0);
  }));

  it('matches what the books then show after a year, to within a modest margin', () => withoutEvents(() => {
    const s = createGame(403);
    const o = petronasOutlook(s, s.soe.petronas.dividendAnnual, s.soe.petronas.capexAnnual);
    const real = clone(s);
    runHeadless(real, 24 * 365);
    const actual = real.soe.petronas.cash;
    expect(Math.abs(actual - o.endCash)).toBeLessThan(0.2 * Math.max(actual, o.endCash));
  }));
});
