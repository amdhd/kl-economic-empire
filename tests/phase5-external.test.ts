import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../src/data/companies';
import { baselineFor } from '../src/data/economic-baseline';
import { bankIdentityGap, monthCloseBank } from '../src/engine/banks';
import { dailyCompanies, monthCloseCompanies } from '../src/engine/companies';
import { creditSupply, PER_DAY } from '../src/engine/economy';
import { aggregateMods, updateExternal } from '../src/engine/external';
import { applyCommand, createGame } from '../src/engine/game';
import { dailyGovernment, monthCloseGovernment } from '../src/engine/government';
import { computeScore, updateSatisfaction } from '../src/engine/indicators';
import { navMYR } from '../src/engine/sovereign-fund';
import { fundamentalValue, hourlyMarket } from '../src/engine/stock-market';
import { klDay, klToEpochMin, monthKey } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';
import type { GameState } from '../src/types/game';
import { clone, runUntil, withoutEvents } from './helpers';

function addEvent(s: GameState, templateId: string, days = 90, ticker?: 'US:NVDA') {
  const ev = { id: s.events.nextId++, templateId, title: templateId, startDay: s.scheduler.lastDay, endDay: s.scheduler.lastDay + days, magnitude: 1, ticker };
  s.events.active.push(ev);
  s.events.log.push(ev);
  return ev;
}

describe('Phase 5 event lifecycle', () => {
  it('records the initial recession shocks in history and news without changing RNG', () => {
    const calm = createGame(501), recession = createGame(501, 'recession');
    expect(recession.rng).toEqual(calm.rng);
    expect(recession.events.log.map((e) => e.templateId)).toEqual(['global_slowdown', 'credit_crunch']);
    expect(recession.news.filter((n) => n.kind === 'event')).toHaveLength(2);
  });

  it('ramps macro shocks only within their start-inclusive, end-exclusive dates', () => {
    const s = createGame(502);
    const ev = addEvent(s, 'oil_spike', 90);
    expect(aggregateMods(s, ev.startDay - 1).oil).toBe(1);
    expect(aggregateMods(s, ev.startDay).oil).toBeGreaterThan(1);
    expect(aggregateMods(s, ev.startDay).oil).toBeLessThan(1.4);
    expect(aggregateMods(s, ev.startDay + 6).oil).toBeCloseTo(1.4);
    expect(aggregateMods(s, ev.endDay - 1).oil).toBeCloseTo(1.4);
    expect(aggregateMods(s, ev.endDay).oil).toBe(1);
  });

  it('settles company shocks through their last valid day, then lets the residual decay', () => withoutEvents(() => {
    const s = createGame(503);
    addEvent(s, 'company_beat', 1, 'US:NVDA');
    runUntil(s, 2027, 1, 2);
    const peak = s.companies['US:NVDA'].revenueShock;
    expect(peak).toBeGreaterThan(1);
    expect(s.events.active).toHaveLength(0);
    runUntil(s, 2027, 1, 3);
    expect(s.companies['US:NVDA'].revenueShock).toBeLessThan(peak);
    expect(s.companies['US:NVDA'].revenueShock).toBeGreaterThan(1);
    expect(s.events.log).toHaveLength(1);
  }));

  it('closes January credit using its last settled day even when the crunch expires on 1 February', () => withoutEvents(() => {
    const base = createGame(504), shock = createGame(504);
    addEvent(shock, 'credit_crunch', 31);
    for (const s of [base, shock]) runUntil(s, 2027, 2, 1);
    expect(shock.events.active).toHaveLength(0);
    expect(shock.bank.lendingRate).toBeGreaterThan(base.bank.lendingRate + 0.01);
    expect(shock.bank.willingness).toBeLessThan(base.bank.willingness);
    expect(shock.reports[0].investment).toBeLessThan(base.reports[0].investment);
  }));

  it('does not apply a February-start credit shock to January lending decisions', () => withoutEvents(() => {
    const base = createGame(505), future = createGame(505);
    const ev = addEvent(future, 'credit_crunch', 90);
    ev.startDay = klDay(klToEpochMin(2027, 2, 1));
    ev.endDay = ev.startDay + 90;
    for (const s of [base, future]) runUntil(s, 2027, 2, 1);
    expect(future.bank).toEqual(base.bank);
    expect(future.reports[0].investment).toBe(base.reports[0].investment);
  }));

  it('replays across shock expiry and month close identically after save/load', () => withoutEvents(() => {
    const s = createGame(506);
    addEvent(s, 'credit_crunch', 31);
    runUntil(s, 2027, 1, 31, 23);
    const restored = deserialize(serialize(s));
    for (const game of [s, restored]) runUntil(game, 2027, 3, 1);
    expect(restored.reports).toEqual(s.reports);
    expect(restored.bank).toEqual(s.bank);
    expect(restored.events).toEqual(s.events);
    expect(restored.rng).toEqual(s.rng);
  }));
});

describe('Phase 5 external earnings, valuation and FX', () => {
  it('AI investment lifts both semiconductor issuers much more than unrelated US or KL retail', () => withoutEvents(() => {
    const base = createGame(507), boom = createGame(507);
    addEvent(boom, 'ai_boom', 120);
    for (const s of [base, boom]) runUntil(s, 2027, 4, 1);
    const growth = (id: 'US:NVDA' | 'US:AMD' | 'US:WMT' | 'MY:5296') => boom.companies[id].history.at(-1)!.revenue / base.companies[id].history.at(-1)!.revenue - 1;
    for (const id of ['US:NVDA', 'US:AMD'] as const) {
      expect(growth(id)).toBeGreaterThan(0.2);
      expect(Math.abs(growth('US:WMT'))).toBeLessThan(growth(id) / 5);
      expect(Math.abs(growth('MY:5296'))).toBeLessThan(growth(id) / 5);
      expect(fundamentalValue(boom, id)).toBeGreaterThan(fundamentalValue(base, id));
    }
  }));

  it('taxes only domestic profit exposure when worldwide pretax earnings are held fixed', () => {
    const base = createGame(508);
    dailyCompanies(base);
    const hike = clone(base);
    hike.government.policies.tax.corporate = 0.25;
    for (const s of [base, hike]) monthCloseCompanies(s, monthKey(2027, 1));
    for (const c of COMPANIES) {
      const a = base.companies[c.id].history.at(-1)!, b = hike.companies[c.id].history.at(-1)!;
      expect(b.revenue).toBe(a.revenue);
      expect(b.pbt).toBe(a.pbt);
      expect(b.taxOther).toBe(a.taxOther);
      expect(a.netIncome - b.netIncome).toBeCloseTo(Math.max(0, a.pbt) * (c.exposure.kl + c.exposure.my) * 0.07, 5);
      if (c.exchange === 'US') expect(Math.abs(b.netIncome / a.netIncome - 1)).toBeLessThan(0.001);
    }
  });

  it('marks filled USD shares and cash into MYR at FX without changing units, USD quotes or ledger balances', () => withoutEvents(() => {
    const s = createGame(509);
    runUntil(s, 2027, 1, 4, 23);
    expect(applyCommand(s, { type: 'placeOrder', ticker: 'US:NVDA', side: 'buy', units: 1000 }, s.clock.hour * 60).ok).toBe(true);
    expect(s.fund.orders.at(-1)!.status).toBe('filled');
    const positions = clone(s.fund.positions), cash = s.fund.usdCash, treasury = s.government.treasury;
    const quote = s.market.quotes['US:NVDA'].price;
    const usdAssets = cash / 100 + quote * positions['US:NVDA']!.units;
    const nav = navMYR(s), fx = s.external.myrPerUsd;
    s.external.myrPerUsd = fx * 1.1;
    expect(navMYR(s) - nav).toBeCloseTo(usdAssets * fx * 0.1, 3);
    expect(s.fund.positions).toEqual(positions);
    expect(s.fund.usdCash).toBe(cash);
    expect(s.government.treasury).toBe(treasury);
    expect(s.market.quotes['US:NVDA'].price).toBe(quote);
  }));

  it('ringgit depreciation passes imported costs into CPI and real household income', () => withoutEvents(() => {
    const base = createGame(515), depreciation = createGame(515);
    addEvent(depreciation, 'myr_weak', 120);
    for (const s of [base, depreciation]) runUntil(s, 2027, 4, 1);
    expect(depreciation.external.myrPerUsd).toBeGreaterThan(base.external.myrPerUsd);
    expect(depreciation.indicators.cpi).toBeGreaterThan(base.indicators.cpi);
    expect(depreciation.reports.at(-1)!.realDisposablePerCapita).toBeLessThan(base.reports.at(-1)!.realDisposablePerCapita);
  }));

  it('higher US rates discount sensitive US shares more and feed same-RNG price discovery without repricing MY fundamentals', () => {
    const base = createGame(510), hike = clone(base);
    hike.external.ust10 += 0.02;
    const fall = (id: 'US:PLTR' | 'US:XOM') => 1 - fundamentalValue(hike, id) / fundamentalValue(base, id);
    expect(fall('US:PLTR')).toBeGreaterThan(fall('US:XOM'));
    expect(fundamentalValue(hike, 'MY:1155')).toBe(fundamentalValue(base, 'MY:1155'));
    const at = klToEpochMin(2027, 1, 4, 23);
    for (const s of [base, hike]) hourlyMarket(s, at);
    expect(hike.market.quotes['US:PLTR'].price).toBeLessThan(base.market.quotes['US:PLTR'].price);
    expect(hike.rng).toEqual(base.rng);
  });

  it('Malaysia and US/global demand stay separate under a local rate/output-gap change', () => {
    const base = createGame(511), local = clone(base);
    const mods = aggregateMods(base, base.scheduler.lastDay);
    updateExternal(base, mods, 0.02, 1, 3, 0);
    updateExternal(local, mods, 0.08, 1, 3, -0.1);
    expect(local.external.opr).not.toBe(base.external.opr);
    expect(local.external.usDemand).toBe(base.external.usDemand);
    expect(local.external.drivers).toEqual(base.external.drivers);
    expect(local.external.fedRate).toBe(base.external.fedRate);
    expect(local.rng).toEqual(base.rng);
  });
});

describe('Phase 5 credit and fiscal stress', () => {
  it('a sustained credit crunch constrains loans and investment with a reconciled bank balance sheet', () => withoutEvents(() => {
    const base = createGame(512), stress = createGame(512);
    addEvent(stress, 'credit_crunch', 180);
    for (const s of [base, stress]) runUntil(s, 2027, 5, 1);
    expect(stress.bank.lendingRate).toBeGreaterThan(base.bank.lendingRate);
    expect(stress.reports.at(-1)!.newLoans).toBeLessThan(base.reports.at(-1)!.newLoans);
    expect(stress.reports.at(-1)!.investment).toBeLessThan(base.reports.at(-1)!.investment);
    expect(Math.abs(bankIdentityGap(stress))).toBeLessThan(1);
    const totalLoans = stress.bank.loansF + stress.bank.loansH;
    const capitalReduction = stress.bank.capital - totalLoans * 0.09;
    stress.bank.capital -= capitalReduction;
    stress.bank.deposits += capitalReduction;
    expect(creditSupply(stress)).toBe(0);
    monthCloseBank(stress, aggregateMods(stress, stress.scheduler.lastDay), 0.15);
    expect(Math.abs(bankIdentityGap(stress))).toBeLessThan(1);
  }));

  it('unfunded capex and emergency balances are carried once and never paid again as operating arrears', () => {
    const s = createGame(513), gov = s.government;
    s.fiscal.developmentAnnual = 0; // isolate project capex from the federal development programme
    applyCommand(s, { type: 'startProject', templateId: 'fibre' }, s.clock.hour * 60);
    gov.treasury = 0;
    gov.marketAccess = false;
    gov.pendingEmergency = 350e6;
    const operatingDue = Object.values(gov.policies.budget).reduce((a, b) => a + b, 0) * PER_DAY;
    dailyGovernment(s, s.scheduler.lastDay);
    expect(gov.unpaidObligations + gov.mtd.opex).toBeCloseTo(operatingDue, 2);
    expect(gov.pendingEmergency + gov.mtd.emergency).toBe(350e6);
    gov.treasury = 1e12;
    dailyGovernment(s, s.scheduler.lastDay + 1);
    expect(gov.mtd.opex).toBeCloseTo(2 * operatingDue, 1); // two postings, each rounded to the sen
    expect(gov.unpaidObligations).toBeLessThan(0.02);
    expect(gov.pendingEmergency + gov.mtd.emergency).toBeCloseTo(350e6, 2);
    expect(gov.mtd.capex).toBe(gov.projects[0].spent);
  });

  it('high debt raises yields and debt service; prolonged unfunded arrears trigger insolvency and trust loss', () => {
    const base = createGame(514, 'balanced', 'legacy-kl'), stress = clone(base);
    stress.government.debt = Math.round(stress.indicators.nominalGdpAnnual * 1.2 * 100);
    stress.government.marketAccess = false;
    stress.government.treasury = 0;
    for (let day = 0; day < 31; day++) {
      dailyGovernment(base, base.scheduler.lastDay + day);
      dailyGovernment(stress, stress.scheduler.lastDay + day);
    }
    const interest = stress.government.debt / 100 * stress.government.avgDebtRate * 31 / 365;
    expect(stress.government.accruedInterest).toBeCloseTo(interest, 3);
    for (const s of [base, stress]) {
      monthCloseGovernment(s);
      updateSatisfaction(s, s.baseline.realDisposablePerCapita, s.baseline.rentBurden, 0.02);
    }
    expect(stress.government.bondYield).toBeGreaterThan(base.government.bondYield + 0.05);
    expect(stress.government.insolvent).toBe(true);
    expect(stress.government.marketAccess).toBe(false);
    expect(stress.indicators.satisfaction.trust).toBeLessThan(base.indicators.satisfaction.trust);
    expect(stress.indicators.approval).toBeLessThan(base.indicators.approval);
    expect(computeScore(stress).total).toBeLessThanOrEqual(30);
    expect(stress.government.treasury).toBeGreaterThanOrEqual(0);
    expect(stress.government.debt).toBeGreaterThan(baselineFor(base).debt * 100);
  });
});
