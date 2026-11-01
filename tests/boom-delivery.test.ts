import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { investmentDelivery } from '../src/engine/economy';
import { exportReach, calibrationFor } from '../src/engine/calibration';
import { fdiProductExports, baseExports, recordTradeDay, type TradeDayInputs } from '../src/engine/trade-book';
import { fdiExports } from '../src/engine/fdi';
import { EXPORT_PRODUCT_IDS, EXPORT_PRODUCTS } from '../src/data/trade';
import { SECTOR_IDS } from '../src/data/economic-baseline';
import { clone, runUntil, withoutEvents } from './helpers';

const ones = () => Object.fromEntries(SECTOR_IDS.map((j) => [j, 1])) as Record<(typeof SECTOR_IDS)[number], number>;

describe('Boom supply limits reach capital, exports and the trade ledger (D-099)', () => {
  it('investment delivery is the price-weighted share of investment-goods demand that was produced', () => {
    const s = createGame(3);
    for (const j of SECTOR_IDS) s.sectors[j].mtd = { ...s.sectors[j].mtd, demand: 100, output: 100 };
    expect(investmentDelivery(s)).toBeCloseTo(1, 12);
    for (const j of SECTOR_IDS) s.sectors[j].mtd.output = 50;
    expect(investmentDelivery(s)).toBeCloseTo(0.5, 12);
    for (const j of SECTOR_IDS) s.sectors[j].mtd.demand = 0;
    expect(investmentDelivery(s)).toBe(1);
  });

  it('rationed investment goods add proportionally less capacity at month close', () => withoutEvents(() => {
    const a = createGame(11, 'balanced', 'malaysia', { months: 24, boom: true });
    runUntil(a, 2027, 1, 31, 23);
    const b = clone(a);
    for (const j of SECTOR_IDS) b.sectors[j].mtd.output = b.sectors[j].mtd.demand * 0.4;
    runUntil(a, 2027, 2, 1, 2);
    runUntil(b, 2027, 2, 1, 2);
    expect(a.reports).toHaveLength(1);
    expect(b.reports).toHaveLength(1);
    const added = (x: typeof a, j: (typeof SECTOR_IDS)[number]) => x.sectors[j].pipeline.at(-1)! / x.sectors[j].investmentMonthly;
    for (const j of SECTOR_IDS) expect(added(b, j)).toBeLessThan(added(a, j) * 0.6);
  }));

  it('export reach uses capacity the infrastructure lets a sector use', () => {
    const s = createGame(5, 'balanced', 'malaysia', { months: 24, boom: true });
    s.sectors.tech.capacity = 3 * calibrationFor(s).cap0.tech;
    expect(exportReach(s, 'tech')).toBeCloseTo(3, 9);
    s.infra!.mult.tech = 0.5;
    expect(exportReach(s, 'tech')).toBeCloseTo(1.5, 9);
    s.infra!.mult.tech = 0.2; // throttled below the opening size: reach never falls under 1
    expect(exportReach(s, 'tech')).toBe(1);
  });

  it('ledger exports of manufactures and services ship only what their sector produced; commodities are untouched', () => {
    const s = createGame(7, 'balanced', 'malaysia', { months: 24, boom: true });
    runHeadless(s, 24 * 3);
    const inputs: TradeDayInputs = { inputImports: 1e9, consumerImports: 1e8, displaced: Object.fromEntries(SECTOR_IDS.map((j) => [j, 0])) as TradeDayInputs['displaced'], served: ones(), fdiImports: 0, gdpNominal: 5e9 };
    const full = clone(s), half = clone(s);
    recordTradeDay(full, inputs);
    recordTradeDay(half, { ...inputs, served: { ...ones(), tech: 0.5, ind: 0.5 } });
    for (const id of EXPORT_PRODUCT_IDS) {
      const p = EXPORT_PRODUCTS[id];
      const expected = !p.commodity && (p.sector === 'tech' || p.sector === 'ind') ? 0.5 : 1;
      expect(half.tradeBook.day.exports[id] / full.tradeBook.day.exports[id]).toBeCloseTo(expected, 9);
    }
    const sum = (r: Record<string, number>) => Object.values(r).reduce((x, v) => x + v, 0);
    expect(sum(half.tradeBook.day.partners)).toBeLessThan(sum(full.tradeBook.day.partners));
  });

  it('operating FDI plants export through the ledger at the core value, split across their sector products', () => {
    const s = createGame(9, 'balanced', 'malaysia', { months: 24, boom: true });
    const p = s.fdi.pledges[0];
    p.status = 'operating';
    const fdiX = fdiExports(s);
    const out = fdiProductExports(s, baseExports(s));
    const value = SECTOR_IDS.reduce((a, j) => a + fdiX[j] * s.sectors[j].price, 0);
    expect(value).toBeGreaterThan(0);
    expect(Object.values(out).reduce((a, v) => a + v, 0)).toBeCloseTo(value, 3);
    for (const id of EXPORT_PRODUCT_IDS) if (EXPORT_PRODUCTS[id].commodity || EXPORT_PRODUCTS[id].sector !== p.sector) expect(out[id]).toBe(0);
  });

  it('a lazy Boom run keeps ledger exports near the core instead of running past GDP', () => {
    const s = createGame(78, 'balanced', 'malaysia', { months: 36, boom: true });
    runHeadless(s, 24 * 365 * 3);
    const tb = s.tradeBook.history.at(-1)!;
    const ledger = EXPORT_PRODUCT_IDS.reduce((a, id) => a + tb.exports[id], 0) * 365 / tb.days;
    // Before D-099 this run's ledger exports were about 98% of GDP at month 36 and rising (124% by year five).
    expect(ledger / s.indicators.nominalGdpAnnual).toBeLessThan(0.9);
    expect(ledger / s.indicators.nominalGdpAnnual).toBeGreaterThan(0.3);
    expect(s.reports.every((r) => r.reconciliation!.cashResidualMinor === 0)).toBe(true);
  }, 120_000);
});
