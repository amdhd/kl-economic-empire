import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../src/engine/game';
import { baselineMonth, monthCloseCompanies } from '../src/engine/companies';
import { COMPANY_BY_ID } from '../src/data/companies';
import {
  executeOrder,
  processQueuedOrders,
  placeOrder,
  convertFx,
  navMYR,
  quoteFill,
} from '../src/engine/sovereign-fund';
import { klToEpochMin } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';
import { runUntil } from './helpers';

const id = 'MY:1155' as const;
const open = () => {
  const s = createGame(17);
  runUntil(s, 2027, 1, 4, 10);
  return s;
};

describe('Phase 3 settlement regressions', () => {
  it('settlement functions enforce exchange hours and never settle twice', () => {
    const s = createGame(17);
    const o = placeOrder(s, id, 'buy', 100, s.clock.hour * 60);
    const before = s.fund.myrCash;
    executeOrder(s, o, s.clock.hour * 60);
    processQueuedOrders(s, 'MY', s.clock.hour * 60);
    expect(o.status).toBe('queued');
    expect(s.fund.myrCash).toBe(before);
    const t = klToEpochMin(2027, 1, 4, 10);
    executeOrder(s, o, t);
    const paid = s.fund.myrCash;
    executeOrder(s, o, t);
    expect(s.fund.myrCash).toBe(paid);
    expect(s.fund.positions[id]!.units).toBe(100);
    expect(s.fund.tx.at(-1)!.atMin).toBe(t);
  });

  it('expired orders cannot execute even through direct settlement', () => {
    const s = createGame();
    const o = placeOrder(s, id, 'buy', 100, s.clock.hour * 60);
    executeOrder(s, o, klToEpochMin(2027, 1, 11, 10));
    expect(o.status).toBe('expired');
    expect(s.fund.positions[id]).toBeUndefined();
  });

  it('invalid security, direction, quantities and FX inputs reject without changing balances', () => {
    const s = open();
    const cash = s.fund.myrCash;
    expect(placeOrder(s, 'MY:UNKNOWN', 'buy', 100, s.clock.hour * 60).status).toBe('rejected');
    for (const n of [NaN, Infinity, -100, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(placeOrder(s, id, 'buy', n, s.clock.hour * 60).status).toBe('rejected');
      expect(convertFx(s, 'MYR', n)).not.toBeNull();
    }
    expect(placeOrder(s, id, 'wrong' as 'buy', 100, s.clock.hour * 60).status).toBe('rejected');
    expect(convertFx(s, 'XYZ' as 'MYR', 100)).not.toBeNull();
    expect(s.fund.myrCash).toBe(cash);
    for (const amount of [NaN, Infinity, Number.MAX_VALUE, -1, 0.001]) {
      expect(applyCommand(s, { type: 'fundInject', amount }, s.clock.hour * 60).ok).toBe(false);
      expect(applyCommand(s, { type: 'fundWithdraw', amount }, s.clock.hour * 60).ok).toBe(false);
    }
    expect(s.fund.myrCash).toBe(cash);
  });

  it('full liquidation retains realized gains; selling and rebuying does not erase them', () => {
    const s = open();
    const t = s.clock.hour * 60;
    placeOrder(s, id, 'buy', 1000, t);
    const cost = s.fund.positions[id]!.costMinor;
    s.market.quotes[id].price *= 1.3;
    const proceeds = Math.round(quoteFill(s, id, 'sell', 1000).total * 100);
    placeOrder(s, id, 'sell', 1000, t);
    expect(s.fund.positions[id]).toBeUndefined();
    expect(s.fund.realized.MYR).toBe(proceeds - cost);
    expect(s.fund.realizedMYR).toBe(proceeds - cost);
    placeOrder(s, id, 'buy', 100, t);
    expect(s.fund.realized.MYR).toBe(proceeds - cost);
    expect(deserialize(serialize(s)).fund.realized).toEqual(s.fund.realized);
  });

  it('FX records both cash legs and round trips lose only spread and rounding', () => {
    const s = open();
    const before = navMYR(s);
    const usd = s.fund.usdCash;
    expect(convertFx(s, 'MYR', 1_000_000_00)).toBeNull();
    const received = s.fund.usdCash - usd;
    const tx = s.fund.tx.at(-1)!;
    expect(tx.counterAmountMinor).toBe(received);
    expect(tx.fx).toBe(s.external.myrPerUsd);
    expect(convertFx(s, 'USD', received)).toBeNull();
    expect(s.fund.usdCash).toBe(usd);
    expect(navMYR(s)).toBeLessThan(before);
    expect(before - navMYR(s)).toBeLessThan(5100);
  });

  it('queued buys compete for cash in order without overdrawing and sell reservations release on cancel', () => {
    const s = createGame();
    const t = s.clock.hour * 60;
    placeOrder(s, id, 'buy', 1000, t);
    placeOrder(s, id, 'buy', 1000, t);
    s.fund.myrCash = Math.round(quoteFill(s, id, 'buy', 1000).total * 100);
    processQueuedOrders(s, 'MY', klToEpochMin(2027, 1, 4, 10));
    expect(s.fund.orders.map((o) => o.status)).toEqual(['filled', 'rejected']);
    expect(s.fund.myrCash).toBe(0);
    const sell = placeOrder(s, id, 'sell', 1000, t);
    expect(placeOrder(s, id, 'sell', 100, t).status).toBe('rejected');
    applyCommand(s, { type: 'cancelOrder', id: sell.id }, t);
    expect(placeOrder(s, id, 'sell', 1000, t).status).toBe('queued');
  });
});

describe('company statements and fiscal reconciliation', () => {
  it('company close reconciles earnings, cash and debt and cannot be repeated', () => {
    const s = open();
    const c = s.companies[id];
    const cash = c.cash;
    const retained = c.retained;
    const debt = c.debt;
    c.mtd = { revenue: 1000, laborCost: 100, energyCost: 50, otherCost: 200, depreciation: 20, interest: 30 };
    const key = 2027 * 12;
    monthCloseCompanies(s, key);
    const f = c.history.at(-1)!;
    expect(f.ebitda).toBe(650);
    expect(f.ebit).toBe(630);
    expect(f.pbt).toBe(600);
    expect(f.netIncome).toBe(600 - f.taxKL - f.taxOther);
    expect(c.retained - retained).toBeCloseTo(f.netIncome - f.dividends, 5);
    expect(c.cash - cash - (c.debt - debt)).toBeCloseTo(f.netIncome - f.dividends, 5);
    const snapshot = JSON.stringify(c);
    monthCloseCompanies(s, key);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('a loss requires matching corporate debt; dividends cannot exceed retained earnings or cash', () => {
    const s = open();
    const c = s.companies[id];
    c.cash = 10;
    c.retained = -100;
    c.mtd = { revenue: 0, laborCost: 0, energyCost: 0, otherCost: 1000, depreciation: 0, interest: 0 };
    const d0 = c.debt;
    monthCloseCompanies(s, 2027 * 12);
    expect(c.cash).toBe(0);
    expect(c.debt - d0).toBe(990);
    c.cash = 10000;
    c.mtd.revenue = 100;
    const dividend = monthCloseCompanies(s, 2027 * 12 + 2);
    expect(dividend.find((d) => d.id === id)).toBeUndefined();
  });

  it('KL company taxes are apportioned, with global profits outside KL jurisdiction', () => {
    const seed = COMPANY_BY_ID['US:NVDA'];
    const a = baselineMonth(seed, 0, 0.18);
    const b = baselineMonth(seed, 0, 0.25);
    expect(b.taxKL - a.taxKL).toBeCloseTo(Math.max(0, a.pbt * seed.exposure.kl) * 0.07);
    expect(b.taxOther).toBe(a.taxOther);
  });

  it('every monthly cash/debt identity reconciles including same-month dividend distributions', () => {
    const s = open();
    const t = s.clock.hour * 60;
    placeOrder(s, id, 'buy', 100_000, t);
    applyCommand(s, { type: 'setDividendTransfer', pct: 1 }, t);
    applyCommand(s, { type: 'fundInject', amount: 1234567.89 }, t);
    runUntil(s, 2028, 1, 1, 1);
    expect(s.reports).toHaveLength(12);
    for (const r of s.reports) {
      expect(r.reconciliation!.cashResidualMinor, r.label).toBe(0);
      expect(r.reconciliation!.debtResidualMinor, r.label).toBe(0);
    }
    const march = s.reports[2];
    expect(march.gov.swfTransferIn).toBeGreaterThan(0);
    expect(s.reports[3].gov.swfTransferIn).toBe(0);
    expect(s.fund.dividends.MYR).toBeGreaterThan(0);
    const saved = deserialize(serialize(s));
    expect(saved.fund).toEqual(s.fund);
    runUntil(saved, 2028, 1, 1, 1);
    expect(saved.reports).toEqual(s.reports);
  });

  it('rejects corrupt fractional ledger balances on load and migrates schema 1', () => {
    const s = createGame();
    s.fund.myrCash = 0.5;
    expect(() => deserialize(serialize(s))).toThrow(/Unsafe/);
    const old = createGame();
    old.schemaVersion = 1;
    expect(deserialize(serialize(old)).schemaVersion).toBe(2);
  });
});
