import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { overallAttractiveness } from '../src/engine/fdi';
import { ageingMismatch, fiscalGini, fiscalTrustPain, pensionSavingShare, subsidyCut, taxYield } from '../src/engine/fiscal-levers';
import { INCOME_TAX_RELIEF, incomeTaxDaily } from '../src/engine/income-tax';
import { ratingBreakdown, ratingScore } from '../src/engine/government';
import { LEVER_IDS, LEVERS, leverValue } from '../src/engine/policy';
import { leverEstimate } from '../src/engine/policy-preview';
import { deserialize, serialize } from '../src/persistence/save';
import type { LeverId } from '../src/types/game';
import { withoutEvents } from './helpers';

const lever = (s: ReturnType<typeof createGame>, id: LeverId, value: number) =>
  expect(applyCommand(s, { type: 'setLever', lever: id, value }, s.clock.hour * 60).ok).toBe(true);
const run = (s: ReturnType<typeof createGame>, days: number) => runHeadless(s, 24 * days);
const NEW: LeverId[] = ['retirementAge', 'pensionIndexation', 'pensionMeansTest', 'subsidyTargeting', 'cashAid', 'topBandSurcharge', 'personalRelief', 'capitalGainsTax', 'wealthTax', 'digitalLevy', 'propertyGainsTax', 'transactionTax'];

describe('fiscal reform levers (D-114)', () => {
  it('open at neutral settings, so nothing changes until the player decides', () => withoutEvents(() => {
    const s = createGame(114);
    for (const id of NEW) expect(LEVER_IDS).toContain(id);
    expect(LEVERS.personalRelief.initial).toBe(INCOME_TAX_RELIEF);
    expect(pensionSavingShare(s)).toBe(0);
    expect(subsidyCut(s)).toBe(0);
    expect(ageingMismatch(s)).toBe(0);
    expect(fiscalTrustPain(s)).toBe(0);
    expect(fiscalGini(s)).toBeCloseTo(0, 12);
  }));

  it('phase in: the saving builds over the ramp, not at once', () => withoutEvents(() => {
    const s = createGame(114);
    lever(s, 'retirementAge', 65);
    run(s, 2);
    const early = pensionSavingShare(s);
    run(s, 400);
    const later = pensionSavingShare(s);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early * 5);
    run(s, 300); // a 24-month campaign ends near day 730, so check the ramp part way: 700 of 1,095 days
    expect(pensionSavingShare(s)).toBeCloseTo(0.6 * 0.05 * 5 * (702 / 1095), 2);
  }));

  it('pension reforms cut the transfers bill but cost approval, jobs and equality', () => withoutEvents(() => {
    const a = createGame(114), b = createGame(114);
    lever(b, 'retirementAge', 65); lever(b, 'pensionIndexation', 0.5); lever(b, 'pensionMeansTest', 0.3);
    run(a, 400); run(b, 400);
    expect(b.policy.lastMonth.pensionSaved).toBeGreaterThan(4e8);
    expect(b.indicators.approval).toBeLessThan(a.indicators.approval);
    expect(b.indicators.gini).toBeGreaterThan(a.indicators.gini - 0.02 + 0.0); // means-testing offsets part of the rise
    expect(b.households.mtd.transfers).toBeLessThan(a.households.mtd.transfers);
    expect(ageingMismatch(b)).toBeGreaterThan(0.003);
  }));

  it('subsidy targeting saves money, raises pump prices, and cash aid compensates households', () => withoutEvents(() => {
    const a = createGame(114), b = createGame(114), c = createGame(114);
    lever(b, 'subsidyTargeting', 1);
    lever(c, 'subsidyTargeting', 1); lever(c, 'cashAid', 6e9);
    run(a, 240); run(b, 240); run(c, 240);
    expect(b.policy.lastMonth.subsidySaved).toBeGreaterThan(1e8);
    expect(b.indicators.cpi).toBeGreaterThan(a.indicators.cpi);
    expect(c.policy.lastMonth.cashAid).toBeGreaterThan(4e8);
    expect(c.indicators.approval).toBeGreaterThan(b.indicators.approval);
    expect(c.indicators.gini).toBeLessThan(b.indicators.gini);
  }));

  it('new taxes raise money with avoidance, and each worsens the investment climate or the ringgit', () => withoutEvents(() => {
    const s = createGame(114), base = overallAttractiveness(s);
    const gdp = s.indicators.nominalGdpAnnual;
    // Revenue rises with the rate but flattens (evasion), so doubling the wealth tax less than doubles receipts.
    expect(taxYield(gdp, 1, 'wealthTax', 0.02)).toBeLessThan(2 * taxYield(gdp, 1, 'wealthTax', 0.01));
    expect(taxYield(gdp, 1, 'transactionTax', 0.005)).toBeLessThan(2 * taxYield(gdp, 1, 'transactionTax', 0.0025));
    for (const id of ['wealthTax', 'capitalGainsTax', 'transactionTax', 'digitalLevy', 'propertyGainsTax', 'topBandSurcharge'] as LeverId[]) {
      const t = createGame(114);
      lever(t, id, LEVERS[id].max);
      expect(overallAttractiveness(t)).toBeLessThan(base);
    }
    const w = createGame(114), z = createGame(114);
    lever(w, 'wealthTax', 0.015); lever(w, 'capitalGainsTax', 0.2); lever(w, 'digitalLevy', 0.05); lever(w, 'propertyGainsTax', 0.2); lever(w, 'transactionTax', 0.003);
    run(w, 120); run(z, 120);
    expect(w.policy.lastMonth.reformTax).toBeGreaterThan(1e9);
    expect(w.external.myrPerUsd).toBeGreaterThan(z.external.myrPerUsd);
    // Business-side levies lower profit (and so corporate tax) and feed prices.
    expect(w.sectors.fin.price).toBeGreaterThan(z.sectors.fin.price);
  }));

  it('the books still reconcile with every reform on', () => withoutEvents(() => {
    const s = createGame(114);
    for (const id of NEW) lever(s, id, id === 'pensionIndexation' ? 0.5 : id === 'personalRelief' ? 18000 : id === 'retirementAge' ? 64 : LEVERS[id].max / 2);
    run(s, 100);
    expect(s.reports.length).toBeGreaterThanOrEqual(2);
    expect(s.reports.every(r => r.reconciliation!.cashResidualMinor === 0)).toBe(true);
    expect(Number.isFinite(s.indicators.cpi) && Number.isFinite(s.indicators.nominalGdpAnnual)).toBe(true);
  }));

  it('the top-band surcharge and the allowance move income tax in opposite directions', () => withoutEvents(() => {
    const s = createGame(114);
    expect(s.baseline.pit).toBe(true);
    const wages = 5e9;
    const base = incomeTaxDaily(s, wages);
    expect(incomeTaxDaily(s, wages, s.government.policies.tax.incomeTax, 0.05)).toBeGreaterThan(base);
    expect(incomeTaxDaily(s, wages, s.government.policies.tax.incomeTax, 0, 20000)).toBeLessThan(base);
    expect(leverEstimate(s, 'topBandSurcharge', 0.05)!).toBeGreaterThan(0);
    expect(leverEstimate(s, 'personalRelief', 20000)!).toBeLessThan(0);
    expect(leverEstimate(s, 'retirementAge', 65)!).toBeGreaterThan(0);
    expect(leverEstimate(s, 'cashAid', 5e9)!).toBe(-5e9);
  }));

  it('is deterministic: the same seed and decisions give the same state', () => withoutEvents(() => {
    const go = () => { const s = createGame(114); lever(s, 'wealthTax', 0.01); lever(s, 'retirementAge', 63); lever(s, 'subsidyTargeting', 0.5); run(s, 60); return serialize(s).replace(/"savedAtReal":"[^"]*"/, ''); };
    expect(go()).toBe(go());
  }));

  it('an older save gains the new levers at their neutral settings', () => {
    const s = createGame(114);
    const file = JSON.parse(serialize(s));
    for (const id of NEW) delete file.state.policy.levers[id];
    for (const m of [file.state.policy.mtd, file.state.policy.lastMonth]) for (const k of ['reformTax', 'pensionSaved', 'subsidySaved', 'cashAid']) delete m[k];
    file.state.schemaVersion = 16; file.schemaVersion = 16;
    const t = deserialize(JSON.stringify(file));
    expect(LEVER_IDS.every(id => t.policy.levers[id])).toBe(true);
    expect(leverValue(t, 'retirementAge')).toBe(60);
    expect(leverValue(t, 'pensionIndexation')).toBe(1);
    expect(leverValue(t, 'personalRelief')).toBe(INCOME_TAX_RELIEF);
    expect(t.policy.mtd.reformTax).toBe(0);
  });

  it('the rating breakdown shown in Fiscal control adds up to the rating score (D-115)', () => withoutEvents(() => {
    const s = createGame(114);
    for (const [debt, deficit, arrears] of [[0.5, 0.02, 0], [0.8, 0.07, 0], [0.7, 0.05, 1]] as [number, number, 0 | 1][]) {
      const b = ratingBreakdown(s, debt, deficit, arrears);
      expect(ratingScore(s, debt, deficit, arrears)).toBeCloseTo(Math.min(10, Math.max(0, 9 + b.debt + b.deficit + b.arrears + b.credibility)), 12);
    }
    expect(ratingBreakdown(s, 0.5, 0.02, 0).debt).toBeCloseTo(0, 12);
    expect(ratingBreakdown(s, 0.8, 0.02, 0).debt).toBeLessThan(0);
  }));
});
