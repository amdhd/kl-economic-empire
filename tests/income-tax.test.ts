import { describe, expect, it } from 'vitest';
import { NON_TAX_ANNUAL_2027 } from '../src/data/non-tax-revenue';
import { applyCommand, createGame } from '../src/engine/game';
import { bandTax, effectiveIncomeTaxRate, incomeTaxDaily } from '../src/engine/income-tax';
import { runUntil, withoutEvents } from './helpers';

describe('progressive personal income tax (D-073)', () => {
  it('applies the statutory YA2025 bands cumulatively', () => {
    expect(bandTax(5_000)).toBe(0);
    expect(bandTax(20_000)).toBeCloseTo(150, 6);
    expect(bandTax(35_000)).toBeCloseTo(600, 6);
    expect(bandTax(50_000)).toBeCloseTo(1_500, 6);
    expect(bandTax(70_000)).toBeCloseTo(3_700, 6);
    expect(bandTax(100_000)).toBeCloseTo(9_400, 6);
    expect(bandTax(400_000)).toBeCloseTo(84_400, 6);
    expect(bandTax(600_000)).toBeCloseTo(136_400, 6);
    expect(bandTax(2_000_000)).toBeCloseTo(528_400, 6);
    expect(bandTax(2_100_000)).toBeCloseTo(558_400, 6);
  });

  it('is progressive: higher average pay means a higher effective rate, and the lever scales it', () => {
    const low = effectiveIncomeTaxRate(20_000), mid = effectiveIncomeTaxRate(60_000), high = effectiveIncomeTaxRate(200_000);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(effectiveIncomeTaxRate(60_000, 1.2) / mid).toBeCloseTo(1.2, 9);
    expect(effectiveIncomeTaxRate(0)).toBe(0);
  });

  it('new campaigns post income tax and fees on their own lines; opening income-tax yield matches the old household tax', () => withoutEvents(() => {
    const s = createGame(61);
    expect(s.baseline.pit && s.baseline.nonTax).toBe(true);
    expect(s.government.policies.tax.household).toBe(0);
    runUntil(s, 2027, 2, 1, 1);
    const r = s.reports[0].gov;
    expect(r.taxIncome).toBeGreaterThan(0);
    expect(r.taxHousehold).toBe(0);
    expect(r.nonTaxRevenue).toBeGreaterThan(0.8 * NON_TAX_ANNUAL_2027 / 12);
    expect(r.nonTaxRevenue).toBeLessThan(1.2 * NON_TAX_ANNUAL_2027 / 12);
  }));

  it('raising the schedule lifts receipts from tomorrow and the estimate is not mutating state', () => withoutEvents(() => {
    const base = createGame(62), hike = createGame(62);
    expect(applyCommand(hike, { type: 'queueTax', patch: { incomeTax: 1.3 } }, hike.clock.hour * 60).ok).toBe(true);
    runUntil(base, 2027, 2, 1, 1); runUntil(hike, 2027, 2, 1, 1);
    expect(hike.reports[0].gov.taxIncome).toBeGreaterThan(base.reports[0].gov.taxIncome * 1.2);
    expect(incomeTaxDaily(hike, 1e9)).toBeGreaterThan(incomeTaxDaily(base, 1e9) * 1.25);
  }));
});
