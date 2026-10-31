import { describe, expect, it } from 'vitest';
import { NATIONAL_DEMAND, SECTOR_IDS, SECTORS } from '../src/data/economic-baseline';
import { CAL } from '../src/engine/calibration';
import { PER_DAY } from '../src/engine/economy';
import { createGame } from '../src/engine/game';
import { estimateTaxChange } from '../src/engine/policy-preview';
import { clone, runUntil, withoutEvents } from './helpers';

describe('static policy forecasts', () => {
  it('uses tax-inclusive resident spending and tax-exclusive visitor spending without mutating state or RNG', () => {
    const s = createGame(50);
    const before = clone(s);
    const forecast = estimateTaxChange(s, { ...s.government.policies.tax, consumption: 0.08 });
    // Model 3: a share of the cash basket buys finished imports directly and carries no domestic levy (D-056).
    const residents = CAL.hh.consumption * (1 - NATIONAL_DEMAND.importedConsumption) * SECTORS.cons.consumption + CAL.hh.credit * 0.65;
    const visitors = CAL.X0.cons * 0.5;
    const expected = (residents * (0.08 / 1.08 - 0.04 / 1.04) + visitors * 0.04) / PER_DAY;
    expect(forecast.consumption / expected).toBeCloseTo(1, 3); // permanent income's one-day trend drift (D-056)
    expect(forecast.corporate).toBe(0);
    expect(forecast.property).toBe(0);
    expect(forecast.household).toBe(0);
    expect(s).toEqual(before);
  });

  it('can forecast reintroducing a levy after a full zero-rate month', () => withoutEvents(() => {
    const s = createGame(51);
    s.government.policies.tax.consumption = 0;
    runUntil(s, 2027, 2, 1);
    expect(s.reports[0].gov.taxConsumption).toBe(0);
    const forecast = estimateTaxChange(s, { ...s.government.policies.tax, consumption: 0.04 });
    expect(forecast.consumption).toBeGreaterThan(100e6);
    expect(Number.isFinite(forecast.consumption)).toBe(true);
    // Stale receipts at a different rate cannot distort the current demand-based forecast.
    s.reports[0].gov.taxConsumption = 1e12;
    expect(estimateTaxChange(s, { ...s.government.policies.tax, consumption: 0.04 })).toEqual(forecast);
  }));

  it('normalises the closed profit base to an average month, including short February', () => withoutEvents(() => {
    const s = createGame(52);
    runUntil(s, 2027, 3, 1);
    const last = s.reports.at(-1)!;
    const positiveProfits = SECTOR_IDS.reduce((sum, j) => sum + Math.max(0, s.sectors[j].lastMonthProfit), 0);
    const forecast = estimateTaxChange(s, { ...s.government.policies.tax, corporate: 0.25 });
    expect(last.label).toContain('Feb');
    expect(forecast.corporate).toBeCloseTo(positiveProfits * 0.07 / 28 / PER_DAY, 4);
  }));
});
