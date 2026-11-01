import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless, type Command } from '../src/engine/game';
import { debtMYR, issueDebt, sweepExcessCash, treasuryMYR } from '../src/engine/government';
import { reconcileMonth } from '../src/engine/reconciliation';
import { sectorTax } from '../src/engine/policy-controls';
import { visaRentPressure, zoneFeeDaily, zoneTaxRelief } from '../src/engine/policy';
import { exportContractFlows } from '../src/engine/export-contracts';
import { TREASURY_LIMIT_MYR } from '../src/data/boom';
import { SECTOR_IDS } from '../src/data/economic-baseline';
import type { GameState, GovMonthFlows, MonthlyReport } from '../src/types/game';
import { runUntil, withoutEvents } from './helpers';

const act = (s: GameState, cmd: Command) => applyCommand(s, cmd, s.clock.hour * 60);

describe('treasury cash ceiling (D-101)', () => {
  it('borrowing stops at the ceiling', () => {
    const s = createGame(1, 'balanced', 'malaysia', { months: 120, boom: true });
    s.government.treasury = Math.round((TREASURY_LIMIT_MYR - 1e9) * 100);
    expect(issueDebt(s, 1e12, 'test')).toBeLessThanOrEqual(1e9);
    expect(treasuryMYR(s.government)).toBeLessThanOrEqual(TREASURY_LIMIT_MYR);
  });

  it('cash above the ceiling buys back debt first, then moves to the sovereign fund', () => {
    const s = createGame(1, 'balanced', 'malaysia', { months: 120, boom: true });
    s.government.treasury = Math.round((TREASURY_LIMIT_MYR + 5e12) * 100);
    s.government.debt = Math.round(2e12 * 100);
    const fund0 = s.fund.myrCash;
    expect(sweepExcessCash(s)).toBeCloseTo(5e12, -2);
    expect(debtMYR(s.government)).toBe(0);
    expect((s.fund.myrCash - fund0) / 100).toBeCloseTo(3e12, -2);
    expect(treasuryMYR(s.government)).toBeCloseTo(TREASURY_LIMIT_MYR, -2);
    expect(sweepExcessCash(s)).toBe(0);
  });
});

describe('reconciliation carries balances in sen (D-102)', () => {
  it('a treasury above RM35tn reconciles to the sen', () => {
    const closing = 3_812_345_678_901_237; // about RM38tn, odd sen: not exactly representable as ringgit
    const previous = { treasury: closing / 100, debt: 0, reconciliation: { closingTreasuryMinor: closing, closingDebtMinor: 0 } } as unknown as MonthlyReport;
    const flows = Object.fromEntries(Object.keys(createGame(1).government.mtd).map((k) => [k, 0])) as unknown as GovMonthFlows;
    const r = reconcileMonth(previous, flows, closing, 0);
    expect(r.cashResidualMinor).toBe(0);
    expect(r.debtResidualMinor).toBe(0);
  });
});

describe('hub policies have real costs (D-103)', () => {
  it('free zones charge zone firms 0.2% of GDP a year and waive part of their corporate tax', () => {
    const s = createGame(98);
    const rate0 = sectorTax(s, 'ind');
    s.policy.levers.freeZones.value = 1;
    const fees = SECTOR_IDS.reduce((a, j) => a + zoneFeeDaily(s, j), 0) * 365;
    expect(fees / s.indicators.nominalGdpAnnual).toBeCloseTo(0.002, 6);
    expect(zoneFeeDaily(s, 'health')).toBe(0);
    expect(zoneTaxRelief(s, 'ind')).toBeCloseTo(0.24, 9);
    expect(sectorTax(s, 'ind')).toBeCloseTo(rate0 * 0.76, 9);
    expect(sectorTax(s, 'health')).toBe(sectorTax(createGame(98), 'health'));
  });

  it('free zones are no longer a free gain: lost corporate tax outweighs the zone fees', () => withoutEvents(() => {
    const run = (on: boolean) => {
      const s = createGame(98);
      runHeadless(s, 24);
      if (on) expect(act(s, { type: 'setLever', lever: 'freeZones', value: 1 }).ok).toBe(true);
      runUntil(s, 2028, 1, 1, 2);
      const last = s.reports.slice(-3);
      return last.reduce((a, r) => a + r.gov.taxCorporate + r.gov.policyLevy, 0);
    };
    expect(run(true)).toBeLessThan(run(false));
  }));

  it('the golden visa raises rents by up to 2%', () => {
    const s = createGame(98);
    expect(visaRentPressure(s)).toBe(0);
    s.policy.levers.goldenVisa.value = 1;
    expect(visaRentPressure(s)).toBeCloseTo(0.02, 9);
  });
});

describe('Boom mode opens balanced (D-104)', () => {
  it('a shock scenario chosen with Boom starts balanced, with no adverse opening events', () => {
    for (const sc of ['recession', 'export-slump', 'energy-shock'] as const) {
      const s = createGame(4, sc, 'malaysia', { months: 36, boom: true });
      expect(s.scenario).toBe('balanced');
      expect(s.events.active).toHaveLength(0);
      expect(createGame(4, sc, 'malaysia', { months: 36 }).scenario).toBe(sc);
    }
  });
});

describe('export contract premiums are price, not volume (D-105)', () => {
  const signed = (pf: number) => {
    const s = createGame(306), d = s.deals.items.find((x) => x.template === 'export:chips')!;
    act(s, { type: 'deal', id: d.id, action: 'review' });
    act(s, { type: 'dealOffer', id: d.id, terms: { months: 12, priceFactor: pf, protection: 0 } });
    expect(act(s, { type: 'deal', id: d.id, action: 'sign' }).ok).toBe(true);
    runHeadless(s, 24 * 3);
    return s;
  };

  it('a 1.3× price adds the same extra real exports as spot, plus a price gain on every delivered unit', () => withoutEvents(() => {
    const spot = exportContractFlows(signed(1)), premium = exportContractFlows(signed(1.3));
    expect(premium.volume.ee).toBeCloseTo(spot.volume.ee, 0);
    expect(Math.abs(spot.price.ee)).toBeLessThan(0.01 * 6e9 / 365); // only spot drift since signing
    // At full delivery the gap is 0.3 × the whole daily volume (RM6bn a year), about RM4.9m a day.
    expect(premium.price.ee).toBeGreaterThan(0.25 * 6e9 / 365 * 0.5);
  }));

  it('the premium is exporter income: sector profit rises and real output does not', () => withoutEvents(() => {
    const a = signed(1), b = signed(1.3);
    expect(b.sectors.tech.mtd.profit).toBeGreaterThan(a.sectors.tech.mtd.profit);
    expect(b.tradeBook.policyReal.tech).toBeCloseTo(a.tradeBook.policyReal.tech, 3);
  }));
});
