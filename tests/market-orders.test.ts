import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../src/data/companies';
import { MY_COMPANIES } from '../src/data/companies.my';
import { US_COMPANIES } from '../src/data/companies.us';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { publicNetWorth } from '../src/engine/indicators';
import { convertFx, navMYR, placeOrder, planRebalance, positionValueMYR, quoteFill, FX_SPREAD } from '../src/engine/sovereign-fund';
import { avgDailyValue } from '../src/engine/stock-market';
import { klToEpochMin } from '../src/engine/time';
import type { GameState } from '../src/types/game';
import { runUntil } from './helpers';

const MBB = 'MY:1155' as const;
const NVDA = 'US:NVDA' as const;
const atMin = (s: GameState) => s.clock.hour * 60;

function openBursa(seed = 1) {
  const s = createGame(seed);
  runUntil(s, 2027, 1, 4, 10); // Monday 10:00 MYT
  expect(s.market.sessionOpen.MY).toBe(true);
  return s;
}

describe('equity universe', () => {
  it('has exactly 36 MY + 44 US distinct securities with correct currencies', () => {
    expect(MY_COMPANIES).toHaveLength(36);
    expect(US_COMPANIES).toHaveLength(44);
    expect(new Set(COMPANIES.map((c) => c.id)).size).toBe(80);
    expect(new Set(COMPANIES.map((c) => c.legalName)).size).toBe(80);
    for (const c of COMPANIES) {
      expect(c.id.startsWith(`${c.exchange}:`)).toBe(true);
      const ex = c.exposure;
      expect(ex.kl + ex.my + ex.global).toBeCloseTo(1, 6);
    }
  });

  it('every map marker carries a verification source and a location type', () => {
    for (const c of COMPANIES) if (c.geo) {
      expect(c.geo.verificationSource).toMatch(/OpenStreetMap/);
      expect(['hq', 'office', 'branch', 'asset']).toContain(c.geo.locationType);
      expect(c.geo.lat).toBeGreaterThan(3.0);
      expect(c.geo.lat).toBeLessThan(3.3);
    }
  });
});

describe('sovereign fund orders', () => {
  it('buy exchanges cash for shares; NAV drops only by fees + spread + impact', () => {
    const s = openBursa();
    const nav0 = navMYR(s);
    const cash0 = s.fund.myrCash;
    const q = quoteFill(s, MBB, 'buy', 100_000);
    const r = applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 100_000 }, atMin(s));
    expect(r.ok).toBe(true);
    const pos = s.fund.positions[MBB]!;
    expect(pos.units).toBe(100_000);
    expect(cash0 - s.fund.myrCash).toBe(Math.round(q.total * 100));
    const cost = q.total - q.mid * 100_000;
    expect(nav0 - navMYR(s)).toBeCloseTo(cost, 0);
    expect(cost).toBeGreaterThan(0);
  });

  it('sell computes realised P&L from actual cost basis', () => {
    const s = openBursa();
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 200_000 }, atMin(s));
    const basis = s.fund.positions[MBB]!.costMinor;
    const q = quoteFill(s, MBB, 'sell', 100_000);
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'sell', units: 100_000 }, atMin(s));
    const p = s.fund.positions[MBB]!;
    expect(p.units).toBe(100_000);
    expect(p.costMinor).toBe(basis - Math.round(basis / 2));
    expect(p.realizedMinor).toBe(Math.round(q.total * 100) - Math.round(basis / 2));
  });

  it('cannot sell more than held, and respects the 100-share board lot', () => {
    const s = openBursa();
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'sell', units: 100 }, atMin(s)).ok).toBe(false);
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 1000 }, atMin(s));
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'sell', units: 1100 }, atMin(s)).ok).toBe(false);
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'sell', units: 1000 }, atMin(s)).ok).toBe(true);
    expect(s.fund.positions[MBB]).toBeUndefined();
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 150 }, atMin(s)).message).toMatch(/board lot/);
  });

  it('closed market: order queues, then fills at the next open tick; never fills while closed', () => {
    const s = createGame(2);
    runUntil(s, 2027, 1, 2, 10); // Saturday
    expect(s.market.sessionOpen.MY).toBe(false);
    const r = applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 10_000 }, atMin(s));
    expect(r.message).toMatch(/queued/);
    const o = s.fund.orders.at(-1)!;
    runUntil(s, 2027, 1, 4, 8);
    expect(o.status).toBe('queued');
    expect(s.fund.positions[MBB]).toBeUndefined();
    runUntil(s, 2027, 1, 4, 9);
    expect(o.status).toBe('filled');
    expect(o.filledMin).toBe(klToEpochMin(2027, 1, 4, 9));
    expect(s.fund.positions[MBB]!.units).toBe(10_000);
  });

  it('queued orders can be cancelled and never double-fill', () => {
    const s = createGame(2);
    runUntil(s, 2027, 1, 2, 10);
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 10_000 }, atMin(s));
    const o = s.fund.orders.at(-1)!;
    expect(applyCommand(s, { type: 'cancelOrder', id: o.id }, atMin(s)).ok).toBe(true);
    runUntil(s, 2027, 1, 5, 12);
    expect(o.status).toBe('cancelled');
    expect(s.fund.positions[MBB]).toBeUndefined();
    const buys = s.fund.tx.filter((t) => t.type === 'buy');
    expect(buys).toHaveLength(0);
  });

  it('US buys need USD cash; FX conversion applies explicit rate and spread', () => {
    const s = createGame(4);
    s.fund.usdCash = 0;
    runUntil(s, 2027, 1, 12, 23); // NY open (Tue 10:00 ET)
    expect(s.market.sessionOpen.US).toBe(true);
    expect(applyCommand(s, { type: 'placeOrder', ticker: NVDA, side: 'buy', units: 1000 }, atMin(s)).message).toMatch(/Insufficient USD/);
    const fx = s.external.myrPerUsd;
    const nav0 = navMYR(s);
    expect(convertFx(s, 'MYR', 100_000_000_00)).toBeNull(); // RM 100m
    expect(s.fund.usdCash).toBe(Math.floor(100_000_000_00 / (fx * (1 + FX_SPREAD))));
    expect(nav0 - navMYR(s)).toBeCloseTo(100e6 - (100e6 / (fx * (1 + FX_SPREAD))) * fx, -1);
    expect(applyCommand(s, { type: 'placeOrder', ticker: NVDA, side: 'buy', units: 1000 }, atMin(s)).ok).toBe(true);
  });

  it('US NAV includes FX: a weaker ringgit raises MYR value without changing share counts', () => {
    const s = createGame(4);
    runUntil(s, 2027, 1, 12, 23);
    applyCommand(s, { type: 'placeOrder', ticker: NVDA, side: 'buy', units: 10_000 }, atMin(s));
    const units = s.fund.positions[NVDA]!.units;
    const nav0 = navMYR(s);
    const usdValue = units * s.market.quotes[NVDA].price + s.fund.usdCash / 100;
    s.external.myrPerUsd *= 1.1;
    expect(navMYR(s) - nav0).toBeCloseTo(usdValue * s.external.myrPerUsd * (1 - 1 / 1.1), 0);
    expect(s.fund.positions[NVDA]!.units).toBe(units);
  });

  it('splitting an order does not avoid the liquidity cap or price impact', () => {
    const s = openBursa();
    const adv = avgDailyValue(s, MBB);
    const lot = Math.floor((0.2 * adv) / s.market.quotes[MBB].price / 100) * 100;
    const one = quoteFill(s, MBB, 'buy', lot);
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: lot }, atMin(s)).ok).toBe(true);
    const second = quoteFill(s, MBB, 'buy', lot);
    expect(second.impact).toBeGreaterThan(one.impact); // cumulative impact
    expect(applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: lot }, atMin(s)).message).toMatch(/liquidity/);
  });

  it('enforces the 20% NAV concentration limit and liquidity limit', () => {
    const s = openBursa();
    const r = placeOrder(s, 'MY:5296', 'buy', 50_000_000, atMin(s));
    expect(r.status).toBe('rejected');
    expect(r.reason).toMatch(/liquidity|Concentration/);
  });

  it('treasury → SWF transfer leaves public net worth unchanged; is not revenue', () => {
    const s = openBursa();
    const pnw = publicNetWorth(s);
    const taxes = s.government.mtd.taxCorporate + s.government.mtd.taxConsumption;
    expect(applyCommand(s, { type: 'fundInject', amount: 1e9 }, atMin(s)).ok).toBe(true);
    expect(publicNetWorth(s)).toBeCloseTo(pnw, 2);
    expect(applyCommand(s, { type: 'fundWithdraw', amount: 5e8 }, atMin(s)).ok).toBe(true);
    expect(publicNetWorth(s)).toBeCloseTo(pnw, 2);
    expect(s.government.mtd.taxCorporate + s.government.mtd.taxConsumption).toBe(taxes);
  });

  it('market gains are not tax revenue', () => {
    const s = openBursa();
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 1_000_000 }, atMin(s));
    const taxBefore = s.government.mtd.taxCorporate;
    s.market.quotes[MBB].price *= 1.5;
    const r = applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'sell', units: 1_000_000 }, atMin(s));
    expect(r.ok).toBe(true);
    expect(s.fund.tx.at(-1)!.type).toBe('sell');
    expect(s.government.mtd.taxCorporate).toBe(taxBefore);
  });

  it('dividends flow into fund cash', () => {
    const s = openBursa();
    applyCommand(s, { type: 'placeOrder', ticker: MBB, side: 'buy', units: 1_000_000 }, atMin(s));
    runHeadless(s, 24 * 95); // through end of March (quarter end)
    expect(s.fund.tx.some((t) => t.type === 'dividend' && t.ticker === MBB && t.amountMinor > 0)).toBe(true);
    expect(s.fund.positions[MBB]!.dividendsMinor).toBeGreaterThan(0);
  });
});

describe('target allocation rebalance', () => {
  it('moves the fund toward targets without creating value, respecting limits', () => {
    const s = createGame(8);
    runUntil(s, 2027, 1, 5, 10); // Tue: Bursa open; US closed (queues)
    const nav0 = navMYR(s);
    const r = applyCommand(s, { type: 'rebalance', targetMY: 0.4, targetUS: 0.3 }, s.clock.hour * 60);
    expect(r.ok).toBe(true);
    const nav1 = navMYR(s);
    expect(nav1).toBeLessThanOrEqual(nav0);
    expect(nav0 - nav1).toBeLessThan(nav0 * 0.01); // only costs
    for (const [id] of Object.entries(s.fund.positions)) {
      expect(positionValueMYR(s, id as 'MY:1155') / nav1).toBeLessThanOrEqual(0.2001);
    }
    const myShare = Object.keys(s.fund.positions).filter((id) => id.startsWith('MY:')).reduce((a, id) => a + positionValueMYR(s, id as 'MY:1155'), 0) / nav1;
    expect(myShare).toBeGreaterThan(0.003); // one session of liquidity on a ~RM 100bn fund
    expect(myShare).toBeLessThan(0.41);
    // A second rebalance in the same session cannot exceed the cumulative liquidity cap.
    const again = planRebalance(s, 0.4, 0.3).legs.filter((l) => l.ticker.startsWith('MY:') && l.side === 'buy');
    for (const l of again) expect(s.market.quotes[l.ticker].fundDayValue + s.market.quotes[l.ticker].price * l.units).toBeLessThanOrEqual(0.25 * avgDailyValue(s, l.ticker) + 1);
    expect(s.fund.usdCash).toBeGreaterThan(0);
    expect(s.fund.orders.some((o) => o.ticker.startsWith('US:') && o.status === 'queued')).toBe(true);
    runUntil(s, 2027, 1, 6, 1); // NY session fills queued US buys
    runUntil(s, 2027, 1, 6, 10); // next Bursa session: liquidity resets, more can be bought
    applyCommand(s, { type: 'rebalance', targetMY: 0.4, targetUS: 0.3 }, s.clock.hour * 60);
    const myShare2 = Object.keys(s.fund.positions).filter((id) => id.startsWith('MY:')).reduce((a, id) => a + positionValueMYR(s, id as 'MY:1155'), 0) / navMYR(s);
    expect(myShare2).toBeGreaterThan(myShare * 1.5);
    expect(Object.keys(s.fund.positions).some((id) => id.startsWith('US:'))).toBe(true);
    expect(s.fund.myrCash).toBeGreaterThanOrEqual(0);
    expect(s.fund.usdCash).toBeGreaterThanOrEqual(0);
  });
});
