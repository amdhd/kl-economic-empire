import { describe, expect, it } from 'vitest';
import { SECTOR_IDS } from '../src/data/economic-baseline';
import { bankIdentityGap } from '../src/engine/banks';
import { CAL } from '../src/engine/calibration';
import { COMPANY_BY_ID } from '../src/engine/companies';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { issueDebt, isInflow } from '../src/engine/government';
import { findNonFinite } from '../src/persistence/save';
import type { GameState, GovMonthFlows } from '../src/types/game';
import { runUntil, withoutEvents } from './helpers';

describe('calibration', () => {
  it('starts in a positive-export steady state with GDP ≈ RM 300bn', () => {
    for (const j of SECTOR_IDS) {
      expect(CAL.X0[j]).toBeGreaterThan(0);
      expect(CAL.v[j]).toBeGreaterThan(0.2);
    }
    expect(CAL.gdpDaily * 365).toBeGreaterThan(290e9);
    expect(CAL.gdpDaily * 365).toBeLessThan(320e9);
  });
});

describe('accounting identities', () => {
  it('government budget identity holds every month (exact to the sen)', () => {
    const s = createGame(9);
    let start = s.government.treasury;
    for (let m = 0; m < 14; m++) {
      const before = s.reports.length;
      while (s.reports.length === before) runHeadless(s, 24);
      // flows of the closed month + flows already posted after the close in the same tick
      const r = s.reports.at(-1)!;
      const net = (f: GovMonthFlows) => (Object.keys(f) as (keyof GovMonthFlows)[]).reduce((a, k) => a + (isInflow(k) ? 1 : -1) * Math.round(f[k] * 100), 0);
      const end = s.government.treasury - net(s.government.mtd);
      expect(end - start).toBe(net(r.gov));
      start = end;
    }
  });

  it('bank balance sheet reconciles: reserves + loans = deposits + capital', () => {
    const s = createGame(10);
    for (let k = 0; k < 18; k++) {
      runHeadless(s, 24 * 30);
      expect(Math.abs(bankIdentityGap(s))).toBeLessThan(1);
    }
  });

  it('borrowing raises cash and debt equally; repayment lowers both', () => {
    const s = createGame(1);
    const t0 = s.government.treasury, d0 = s.government.debt;
    const got = issueDebt(s, 2e9, 'test', true);
    expect(s.government.treasury - t0).toBe(Math.round(got * 100));
    expect(s.government.debt - d0).toBe(Math.round(got * 100));
    applyCommand(s, { type: 'repayDebt', amount: 1e9 }, s.clock.hour * 60);
    expect(s.government.treasury - t0).toBe(Math.round(got * 100) - 1e11);
    expect(s.government.debt - d0).toBe(Math.round(got * 100) - 1e11);
  });

  it('no NaN/Infinity, no negative fund cash or impossible balances over a full campaign', () => {
    const s = createGame(12);
    runHeadless(s, 30_000);
    expect(findNonFinite(s)).toBeNull();
    expect(s.fund.myrCash).toBeGreaterThanOrEqual(0);
    expect(s.fund.usdCash).toBeGreaterThanOrEqual(0);
    expect(s.government.debt).toBeGreaterThanOrEqual(0);
    for (const j of SECTOR_IDS) expect(s.sectors[j].output).toBeGreaterThan(0);
    for (const r of s.reports) {
      expect(r.unemployment).toBeGreaterThanOrEqual(0);
      expect(r.unemployment).toBeLessThan(0.3);
      expect(Math.abs(r.inflationYoY)).toBeLessThan(0.2);
    }
  });
});

describe('GDP measurement', () => {
  it('is value added: SWF share trading does not change GDP', () => {
    const run = (trade: boolean) =>
      withoutEvents(() => {
        const s = createGame(21);
        runUntil(s, 2027, 1, 4, 10);
        if (trade) applyCommand(s, { type: 'placeOrder', ticker: 'MY:1155', side: 'buy', units: 2_000_000 }, s.clock.hour * 60);
        runUntil(s, 2027, 2, 1, 1);
        return s.reports.at(-1)!.nominalGdp;
      });
    expect(run(true)).toBe(run(false));
  });

  it('nominal GDP equals the sum of sector value added plus the consumption levy', () => {
    const s = createGame(22);
    runUntil(s, 2027, 2, 1, 1);
    const r = s.reports.at(-1)!;
    const va = SECTOR_IDS.reduce((a, j) => a + r.gdpBySector[j], 0);
    expect(r.nominalGdp - va).toBeCloseTo(r.gov.taxConsumption, -3);
  });
});

describe('causal chains (events disabled, same seed)', () => {
  function scenario(setup: (s: GameState) => void, until: [number, number, number] = [2027, 9, 1]) {
    return withoutEvents(() => {
      const s = createGame(31);
      setup(s);
      runUntil(s, until[0], until[1], until[2], 1);
      return s;
    });
  }

  it('corporate tax 18% → 25%: receipts up, after-tax profits and investment down with a lag', () => {
    const base = scenario(() => {});
    const hike = scenario((s) => applyCommand(s, { type: 'queueTax', patch: { corporate: 0.25 } }, s.clock.hour * 60));
    const sum = (s: GameState, k: 'taxCorporate') => s.reports.slice(1).reduce((a, r) => a + r.gov[k], 0);
    expect(sum(hike, 'taxCorporate')).toBeGreaterThan(sum(base, 'taxCorporate') * 1.2);
    // January (before effective date) identical
    expect(hike.reports[0].gov.taxCorporate).toBe(base.reports[0].gov.taxCorporate);
    const inv = (s: GameState) => SECTOR_IDS.reduce((a, j) => a + s.sectors[j].investmentMonthly, 0);
    expect(inv(hike)).toBeLessThan(inv(base));
    // KL-exposed featured company: lower net income; US company essentially unaffected
    const ni = (s: GameState, id: 'MY:1155' | 'US:NVDA') => s.companies[id].history.slice(-6).reduce((a, h) => a + h.netIncome, 0);
    expect(ni(hike, 'MY:1155')).toBeLessThan(ni(base, 'MY:1155'));
    const usDiff = Math.abs(ni(hike, 'US:NVDA') / ni(base, 'US:NVDA') - 1);
    expect(usDiff).toBeLessThan(0.002);
  });

  it('infrastructure: spending starts immediately, productivity benefits only after completion', () => {
    const s = withoutEvents(() => {
      const g = createGame(32);
      applyCommand(g, { type: 'startProject', templateId: 'fibre' }, g.clock.hour * 60);
      runUntil(g, 2027, 4, 1, 1);
      return g;
    });
    const p = s.government.projects[0];
    expect(p.spent).toBeGreaterThan(0);
    expect(p.status).toBe('building');
    expect(s.sectors.tech.infraBoost).toBe(0);
    withoutEvents(() => runUntil(s, 2027, 7, 15, 1));
    expect(p.status).toBe('complete');
    expect(s.sectors.tech.infraBoost).toBeGreaterThan(0);
    expect(s.reports.some((r) => r.gov.capex > 0)).toBe(true);
  });

  it('imported energy shock raises CPI and lowers real disposable income', () => {
    const base = scenario(() => {}, [2027, 7, 1]);
    const shock = scenario((s) => {
      s.events.active.push({ id: 999, templateId: 'oil_spike', title: 'Oil price spike', startDay: s.scheduler.lastDay, endDay: s.scheduler.lastDay + 400, magnitude: 1.5 });
    }, [2027, 7, 1]);
    expect(shock.indicators.cpi).toBeGreaterThan(base.indicators.cpi + 0.5);
    expect(shock.reports.at(-1)!.realDisposablePerCapita).toBeLessThan(base.reports.at(-1)!.realDisposablePerCapita);
  });

  it('AI boom mainly lifts US tech earnings; KL tax changes do not', () => {
    const base = scenario(() => {}, [2027, 7, 1]);
    const boom = scenario((s) => {
      s.events.active.push({ id: 998, templateId: 'ai_boom', title: 'AI boom', startDay: s.scheduler.lastDay, endDay: s.scheduler.lastDay + 400, magnitude: 1.2 });
    }, [2027, 7, 1]);
    const rev = (s: GameState, id: 'US:NVDA' | 'MY:5296') => s.companies[id].history.slice(-3).reduce((a, h) => a + h.revenue, 0);
    const nv = rev(boom, 'US:NVDA') / rev(base, 'US:NVDA') - 1;
    const diy = Math.abs(rev(boom, 'MY:5296') / rev(base, 'MY:5296') - 1);
    expect(nv).toBeGreaterThan(0.1);
    expect(diy).toBeLessThan(nv / 5);
    expect(COMPANY_BY_ID['US:NVDA'].exposure.kl).toBeLessThan(0.01);
  });

  it('more public-service spending raises service quality with a lag, costs the treasury', () => {
    const base = scenario(() => {}, [2027, 6, 1]);
    const more = scenario((s) => applyCommand(s, { type: 'queueBudget', patch: { health: 1.4e9, services: 1.0e9 } }, s.clock.hour * 60), [2027, 6, 1]);
    expect(more.government.serviceQuality).toBeGreaterThan(base.government.serviceQuality + 0.03);
    expect(more.government.treasury - more.government.debt).toBeLessThan(base.government.treasury - base.government.debt);
  });
});
