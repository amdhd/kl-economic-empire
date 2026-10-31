import { describe, expect, it } from 'vitest';
import { bankIdentityGap } from '../src/engine/banks';
import { monetaryEffects } from '../src/engine/central-bank';
import { applyCommand, createGame } from '../src/engine/game';
import { reserveEquityChange } from '../src/engine/indicators';
import { clone, runUntil, withoutEvents } from './helpers';

const act = (s: ReturnType<typeof createGame>, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, s.clock.hour * 60);

describe('central bank powers (D-075)', () => {
  it('starts neutral: automatic rule, 2% reserve requirement, no bonds or bills', () => {
    const s = createGame(81);
    expect(s.centralBank).toMatchObject({ mode: 'auto', srr: 0.02, qeHoldings: 0, bills: 0, credibility: 80 });
    expect(s.centralBank.targetOpr).toBe(s.external.opr);
    expect(monetaryEffects(s)).toEqual({ inflation: 0, yield: 0, fx: 0 });
  });

  it('moves the OPR only at MPC meetings, by at most 50bp, towards the president’s target; far-off policy costs credibility', () => withoutEvents(() => {
    const s = createGame(82);
    const start = s.external.opr;
    expect(act(s, { type: 'cbPolicy', mode: 'manual', targetOpr: 0.0125 }).ok).toBe(true);
    expect(s.external.opr).toBe(start); // nothing moves until the meeting
    runUntil(s, 2027, 3, 2);
    expect(s.external.opr).toBeLessThan(start);
    expect(start - s.external.opr).toBeLessThanOrEqual(0.005 + 1e-12);
    runUntil(s, 2027, 11, 2);
    expect(s.external.opr).toBeCloseTo(0.0125, 9);
    expect(s.centralBank.credibility).toBeLessThan(80);
    expect(s.centralBank.mpc.length).toBeGreaterThan(2);
    expect(monetaryEffects(s).inflation).toBeGreaterThan(0);
  }));

  it('rejects out-of-range settings atomically', () => {
    const s = createGame(83), before = clone(s);
    for (const cmd of [{ targetOpr: 0.2 }, { srr: 0.5 }, { remitShare: 2 }, { targetOpr: NaN }] as const)
      expect(act(s, { type: 'cbPolicy', ...cmd }).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('bills drain bank liquidity into the BNM float without changing reserve equity or breaking the bank identity', () => {
    const s = createGame(84);
    const gap0 = bankIdentityGap(s), eq0 = reserveEquityChange(s), reserves0 = s.bank.reserves, cash0 = s.centralBank.myrCash;
    expect(act(s, { type: 'cbBills', amountMYR: 10e9 }).ok).toBe(true);
    expect(s.bank.reserves).toBeCloseTo(reserves0 - 10e9, 0);
    expect(s.centralBank.myrCash).toBe(cash0 + 10e9 * 100);
    expect(bankIdentityGap(s)).toBeCloseTo(gap0, 3);
    expect(reserveEquityChange(s)).toBeCloseTo(eq0, 3);
    expect(act(s, { type: 'cbBills', amountMYR: 1e12 }).ok).toBe(false);
    expect(act(s, { type: 'cbBills', amountMYR: -10e9 }).ok).toBe(true);
    expect(s.centralBank.bills).toBe(0);
  });

  it('bond buying lowers the 10y yield and weakens the ringgit, within the GDP cap', () => withoutEvents(() => {
    const base = createGame(85), qe = createGame(85);
    for (let i = 0; i < 5; i++) expect(act(qe, { type: 'cbBonds', amountMYR: 20e9 }).ok).toBe(true);
    expect(act(qe, { type: 'cbBonds', amountMYR: 20e9 }).ok).toBe(true);
    runUntil(base, 2027, 2, 15); runUntil(qe, 2027, 2, 15);
    expect(qe.external.mgs10).toBeLessThan(base.external.mgs10);
    expect(qe.external.myrPerUsd).toBeGreaterThan(base.external.myrPerUsd);
    expect(act(qe, { type: 'cbBonds', amountMYR: 20e9 * 100 }).ok).toBe(false);
    expect(act(qe, { type: 'cbBonds', amountMYR: -1e12 }).ok).toBe(false);
  }));

  it('earns reserve income each month; a remittance share pays the treasury and reconciles to the sen', () => withoutEvents(() => {
    const base = createGame(86), pay = createGame(86);
    expect(act(pay, { type: 'cbPolicy', remitShare: 1 }).ok).toBe(true);
    runUntil(base, 2027, 3, 2); runUntil(pay, 2027, 3, 2);
    expect(base.centralBank.lastIncome).toBeGreaterThan(0);
    expect(pay.reports[0].gov.soeDividend).toBeGreaterThan(base.reports[0].gov.soeDividend);
    expect(pay.centralBank.myrCash).toBeLessThan(base.centralBank.myrCash);
    for (const r of pay.reports) {
      expect(r.reconciliation?.cashResidualMinor).toBe(0);
      expect(r.reconciliation?.debtResidualMinor).toBe(0);
    }
  }));

  it('a higher reserve requirement tightens credit', () => withoutEvents(() => {
    const base = createGame(87), tight = createGame(87);
    expect(act(tight, { type: 'cbPolicy', srr: 0.06 }).ok).toBe(true);
    runUntil(base, 2027, 2, 2); runUntil(tight, 2027, 2, 2);
    expect(tight.bank.lendingRate).toBeGreaterThan(base.bank.lendingRate);
    expect(tight.bank.willingness).toBeLessThanOrEqual(base.bank.willingness);
  }));
});
