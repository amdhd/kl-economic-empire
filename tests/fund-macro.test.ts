// D-058: sovereign fund trades have modest macro effects in model 3 (capital-flow FX pressure, persistent price
// impact, Tobin's q). Model 1/2 saves keep trades macro-neutral.
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../src/engine/game';
import { navMYR } from '../src/engine/sovereign-fund';
import type { GameState } from '../src/types/game';
import { clone, runUntil, withoutEvents } from './helpers';

const act = (s: GameState, c: Parameters<typeof applyCommand>[1]) => applyCommand(s, c, s.clock.hour * 60);

describe('sovereign fund macro effects (model 3)', () => {
  it('treats MYR→USD conversions as capital outflows and repatriation as inflows', () => withoutEvents(() => {
    const s = createGame(901);
    runUntil(s, 2027, 1, 4, 10);
    const base = clone(s);
    const myr = s.fund.myrCash;
    expect(act(s, { type: 'fx', from: 'MYR', amountMinor: myr }).ok).toBe(true);
    const usdBn = s.fund.usdCash / 100 / 1e9 - base.fund.usdCash / 100 / 1e9;
    expect(s.centralBank.pressure - base.centralBank.pressure).toBeCloseTo(0.003 * usdBn, 12);
    // Rotating the fund's ~RM15bn of ringgit cash abroad weakens the ringgit by about 4% at the next fixing (RM60bn, D-120).
    runUntil(s, 2027, 1, 5, 1);
    runUntil(base, 2027, 1, 5, 1);
    const weaker = s.external.myrPerUsd / base.external.myrPerUsd - 1;
    expect(weaker).toBeGreaterThan(0.03);
    expect(weaker).toBeLessThan(0.06);
    // Repatriating the same dollars reverses the pressure (minus the spread).
    const before = s.centralBank.pressure;
    expect(act(s, { type: 'fx', from: 'USD', amountMinor: s.fund.usdCash - base.fund.usdCash }).ok).toBe(true);
    expect(s.centralBank.pressure).toBeLessThan(before - 0.0099);
    // The pressure decays over ~30 days like an intervention.
    const p = s.centralBank.pressure;
    runUntil(s, 2027, 2, 4, 1);
    expect(Math.abs(s.centralBank.pressure)).toBeLessThan(Math.abs(p) * 0.4);
  }));

  it('rotating the whole ~RM100bn fund abroad weakens the ringgit by 4–6% at peak', () => withoutEvents(() => {
    const s = createGame(902);
    runUntil(s, 2027, 1, 4, 10);
    const base = clone(s);
    // Inject treasury cash so the fund's ringgit equals its total opening NAV, then convert it all.
    const extra = Math.round(navMYR(s) * 100) - s.fund.myrCash - Math.round(s.fund.usdCash * s.external.myrPerUsd);
    s.fund.myrCash += extra;
    expect(act(s, { type: 'fx', from: 'MYR', amountMinor: s.fund.myrCash }).ok).toBe(true);
    runUntil(s, 2027, 1, 5, 1);
    runUntil(base, 2027, 1, 5, 1);
    const weaker = s.external.myrPerUsd / base.external.myrPerUsd - 1;
    expect(weaker).toBeGreaterThan(0.04);
    expect(weaker).toBeLessThan(0.07);
  }));

  it('lets part of a domestic purchase persist in sentiment, lifting the price, then fading', () => withoutEvents(() => {
    const s = createGame(903);
    runUntil(s, 2027, 1, 4, 10);
    const base = clone(s);
    expect(act(s, { type: 'placeOrder', ticker: 'MY:1155', side: 'buy', units: 4_000_000 }).ok).toBe(true);
    const order = s.fund.orders.at(-1)!;
    expect(order.status).toBe('filled');
    const lift = s.companies['MY:1155'].sentiment - base.companies['MY:1155'].sentiment;
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThan(0.05); // half of a ~4% impact on a large order
    runUntil(s, 2027, 1, 11, 10);
    runUntil(base, 2027, 1, 11, 10);
    expect(s.market.quotes['MY:1155'].price).toBeGreaterThan(base.market.quotes['MY:1155'].price);
    expect(s.market.indices.MY.value).toBeGreaterThan(base.market.indices.MY.value);
    runUntil(s, 2027, 3, 1, 10);
    runUntil(base, 2027, 3, 1, 10);
    expect(s.companies['MY:1155'].sentiment - base.companies['MY:1155'].sentiment).toBeLessThan(lift * 0.1);
  }));

  it('does not let the fund profit from its own impact: a buy-then-sell round trip loses value', () => withoutEvents(() => {
    const s = createGame(904);
    runUntil(s, 2027, 1, 4, 10);
    const base = clone(s);
    expect(act(s, { type: 'placeOrder', ticker: 'MY:1155', side: 'buy', units: 4_000_000 }).ok).toBe(true);
    runUntil(s, 2027, 1, 11, 10);
    runUntil(base, 2027, 1, 11, 10);
    expect(act(s, { type: 'placeOrder', ticker: 'MY:1155', side: 'sell', units: 4_000_000 }).ok).toBe(true);
    expect(s.fund.orders.at(-1)!.status).toBe('filled');
    expect(navMYR(s)).toBeLessThan(navMYR(base));
  }));

  it("raises private investment plans when listed equity is valued higher (Tobin's q)", () => withoutEvents(() => {
    const s = createGame(905);
    runUntil(s, 2027, 1, 31, 12);
    const high = clone(s);
    high.households.equityIndex = 1.1;
    runUntil(s, 2027, 2, 1, 1);
    runUntil(high, 2027, 2, 1, 1);
    const plans = (g: GameState) => Object.values(g.sectors).reduce((a, x) => a + x.investmentMonthly, 0);
    const gain = plans(high) / plans(s) - 1;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(0.01); // modest: 30% partial adjustment of ~0.08pp higher desired growth
  }));

  it('keeps trades macro-neutral in model-2 saves', () => withoutEvents(() => {
    const s = createGame(906);
    s.baseline.model = 2;
    runUntil(s, 2027, 1, 4, 10);
    const pressure = s.centralBank.pressure, sentiment = s.companies['MY:1155'].sentiment;
    expect(act(s, { type: 'fx', from: 'MYR', amountMinor: 100e9 * 100 / 100 }).ok).toBe(true);
    expect(act(s, { type: 'placeOrder', ticker: 'MY:1155', side: 'buy', units: 1_000_000 }).ok).toBe(true);
    expect(s.centralBank.pressure).toBe(pressure);
    expect(s.companies['MY:1155'].sentiment).toBe(sentiment);
  }));
});
