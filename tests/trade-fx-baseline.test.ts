import { describe, expect, it } from 'vitest';
import { BASE_BUDGET, BASELINE, BASE_TAX, LEGACY_BASELINE, NATIONAL_GDP, SECTOR_IDS } from '../src/data/economic-baseline';
import { CAL, LEGACY_CAL } from '../src/engine/calibration';
import { domesticExposure } from '../src/engine/companies';
import { COMPANIES } from '../src/data/companies';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { isInflow, otherPublicReceiptsMonthly } from '../src/engine/government';
import { publicNetWorth, scoreDrivers } from '../src/engine/indicators';
import { quoteIntervention } from '../src/engine/trade-fx';
import { deserialize, serialize } from '../src/persistence/save';
import { fullMoneyMinor } from '../src/utils/format';
import { clone, runUntil, withoutEvents } from './helpers';

const act = (s: ReturnType<typeof createGame>, c: Parameters<typeof applyCommand>[1]) => applyCommand(s, c, s.clock.hour * 60);

describe('dated Malaysia opening, with separate legacy calibration', () => {
  it('uses DOSM quarterly nominal GDP, BNM cash/debt and MOF operating estimates with correct units', () => {
    const s = createGame(701);
    const dosmMillions = 485106.586 + 489742.018 + 517572.546 + 532957.990;
    expect(s.indicators.nominalGdpAnnual).toBeCloseTo(dosmMillions * 1e6, 2);
    expect(s.indicators.realGdpAnnual).toBe(s.indicators.nominalGdpAnnual); // rebased, not 2015-price GDP
    expect(s.government.treasury).toBe(8_865_574_579 * 100);
    expect(s.government.debt).toBe(1_378_895 * 1e6 * 100);
    expect(BASE_BUDGET.health * 12).toBe(40_954_794_000);
    expect(Object.values(BASE_BUDGET).reduce((a, b) => a + b, 0) * 12 + 61_013_000_000).toBeCloseTo(376_840_000_000, 2);
    expect(s.centralBank.usdReserves).toBe(116.4e9 * 100);
    expect(s.external.opr).toBe(0.0275);
    expect(s.government.policies.borrowing.maxDebtToGdp).toBeGreaterThan(s.indicators.debtToGdp);
    expect(SECTOR_IDS.every(j => CAL.X0[j] > 0)).toBe(true);
  });

  it('calibrates omitted fiscal receipts to the published total without making them respond to tax sliders', () => {
    const s = createGame(702);
    const taxesDaily = SECTOR_IDS.reduce((a, j) => a + Math.max(0, CAL.profit0[j]) * BASE_TAX.corporate, 0)
      + BASE_TAX.property * 0.5 * CAL.Y0.prop + CAL.levyBase + CAL.hh.tax;
    const other = otherPublicReceiptsMonthly(s);
    expect(taxesDaily * 365 + other * 12).toBeCloseTo(380_816_996_000, 2);
    s.government.policies.tax.corporate = 0.35;
    expect(otherPublicReceiptsMonthly(s)).toBe(other);
  });

  it('maps both domestic exposure weights into national jurisdiction; global profit stays separate', () => {
    for (const c of COMPANIES) {
      expect(domesticExposure(c, 'malaysia')).toBe(c.exposure.kl + c.exposure.my);
      expect(domesticExposure(c, 'legacy-kl')).toBe(c.exposure.kl);
    }
  });

  it('preserves v3 money, RNG, history and old economic calibration on load without granting reserves', () => {
    const old = createGame(703, 'balanced', 'legacy-kl');
    runHeadless(old, 200);
    const file = JSON.parse(serialize(old));
    file.state.schemaVersion = 3;
    delete file.state.baseline.profile;
    delete file.state.baseline.openingTreasury;
    delete file.state.baseline.openingDebt;
    delete file.state.centralBank;
    delete file.state.trade;
    delete file.state.government.mtd.importTariff;
    delete file.state.government.mtd.exportSupport;
    const restored = deserialize(JSON.stringify(file));
    expect(restored.schemaVersion).toBe(5);
    expect(restored.baseline.profile).toBe('legacy-kl');
    expect(restored.baseline.openingTreasury).toBe(LEGACY_BASELINE.treasury);
    expect(restored.government.treasury).toBe(old.government.treasury);
    expect(restored.government.debt).toBe(old.government.debt);
    expect(restored.rng).toEqual(old.rng);
    expect(restored.daily).toEqual(old.daily);
    expect(restored.centralBank.usdReserves).toBe(0);
    expect(restored.baseline.nominalGdpAnnual).toBe(LEGACY_CAL.gdpDaily * 365);
    // v3 did not record trade flows; only the remaining days can be observed after migration.
    old.trade.mtdExports = 0; old.trade.mtdImports = 0; old.trade.trackingStartDay = old.scheduler.lastDay;
    runHeadless(old, 800); runHeadless(restored, 800);
    expect(restored).toEqual(old);
  });

  it('never turns unchanged negative nominal net worth into a wealth bonus through inflation', () => {
    const s = createGame(704);
    expect(s.baseline.publicNetWorth).toBeLessThan(0);
    s.indicators.cpi = 120;
    expect(scoreDrivers(s).realWealthChange).toBeLessThan(0);
  });
});

describe('import tariffs and funded export services', () => {
  it('settles January under the old policy and includes later tariffs/support in exact treasury reconciliation', () => withoutEvents(() => {
    const s = createGame(710);
    expect(act(s, { type: 'queueTrade', tariff: 0.1, exportBudgetMonthly: 100e6 }).ok).toBe(true);
    runUntil(s, 2027, 2, 1);
    expect(s.reports[0].gov.importTariff).toBe(0);
    expect(s.reports[0].gov.exportSupport).toBe(0);
    expect(s.trade.policy.tariff).toBe(0.1);
    runUntil(s, 2027, 3, 1);
    const r = s.reports[1];
    expect(r.gov.importTariff).toBeGreaterThan(0);
    expect(r.gov.exportSupport).toBeGreaterThan(0);
    expect(r.reconciliation?.cashResidualMinor).toBe(0);
    expect(r.reconciliation?.debtResidualMinor).toBe(0);
    expect(s.trade.history[1].tariff).toBe(r.gov.importTariff);
    expect(s.trade.history[1].exports).toBeGreaterThan(0);
    expect(s.trade.history[1].imports).toBeGreaterThan(0);
    expect(isInflow('importTariff')).toBe(true);
    expect(isInflow('exportSupport')).toBe(false);
  }));

  it('tariffs raise input costs and sector prices, while funded promotion builds export access with a lag', () => withoutEvents(() => {
    const base = createGame(711), tariff = clone(base), promotion = clone(base);
    tariff.trade.policy.tariff = 0.2;
    promotion.trade.policy.exportBudgetMonthly = 1e9;
    expect(promotion.trade.readiness).toBe(0);
    runHeadless(base, 24 * 20); runHeadless(tariff, 24 * 20); runHeadless(promotion, 24 * 20);
    expect(tariff.indicators.cpi).toBeGreaterThan(base.indicators.cpi);
    expect(tariff.government.mtd.importTariff).toBeGreaterThan(0);
    expect(tariff.sectors.ind.mtd.profit).toBeLessThan(base.sectors.ind.mtd.profit);
    expect(promotion.trade.readiness).toBeGreaterThan(0);
    expect(promotion.trade.readiness).toBeLessThan(0.12);
    expect(promotion.government.mtd.exportSupport).toBeGreaterThan(0);
    expect(promotion.trade.mtdExports).toBeGreaterThan(base.trade.mtdExports);
  }));

  it('unfunded discretionary support earns no boost or double-counted arrears', () => withoutEvents(() => {
    const s = createGame(712);
    s.trade.policy.exportBudgetMonthly = 2e9;
    s.government.marketAccess = false; s.government.treasury = 0;
    // Disable all public receipts and fiscal taxes for this isolated lack-of-funds case.
    s.baseline.profile = 'legacy-kl';
    s.government.policies.budget.admin = 20e9;
    s.government.policies.tax.household = 0;
    s.government.policies.tax.consumption = 0;
    runHeadless(s, 16);
    expect(s.government.mtd.exportSupport).toBe(0);
    expect(s.trade.readiness).toBe(0);
  }));

  it('rejects invalid policies atomically', () => {
    for (const [tariff, budget] of [[-0.01, 0], [0.21, 0], [NaN, 0], [0, -1], [0, Infinity], [0, 2e9 + 1]]) {
      const s = createGame(713), before = clone(s);
      expect(act(s, { type: 'queueTrade', tariff, exportBudgetMonthly: budget }).ok).toBe(false);
      expect(s).toEqual(before);
    }
  });
});

describe('reserve-backed central-bank FX', () => {
  it('posts both reserve legs including spread without moving treasury, SWF or GDP; fees reduce public wealth', () => {
    const s = createGame(720), before = clone(s), wealth = publicNetWorth(s);
    expect(act(s, { type: 'interveneFx', side: 'sellUSD', usdMinor: 100e6 * 100 }).ok).toBe(true);
    expect(s.centralBank.usdReserves).toBe(before.centralBank.usdReserves - 100e6 * 100);
    expect(s.centralBank.myrCash - before.centralBank.myrCash).toBe(Math.floor(100e6 * before.external.myrPerUsd * 0.998 * 100));
    expect(publicNetWorth(s)).toBeLessThan(wealth);
    expect(s.government).toEqual(before.government);
    expect(s.fund).toEqual(before.fund);
    expect(s.indicators.nominalGdpAnnual).toBe(before.indicators.nominalGdpAnnual);
    expect(s.rng).toEqual(before.rng);
  });

  it('selling supports MYR and buying weakens it at the next daily fixing, with unchanged RNG order', () => withoutEvents(() => {
    const base = createGame(721), sell = clone(base), buy = clone(base);
    act(sell, { type: 'interveneFx', side: 'sellUSD', usdMinor: 1e9 * 100 });
    act(buy, { type: 'interveneFx', side: 'buyUSD', usdMinor: 1e9 * 100 });
    expect(sell.external.myrPerUsd).toBe(base.external.myrPerUsd);
    runHeadless(base, 16); runHeadless(sell, 16); runHeadless(buy, 16);
    expect(sell.external.myrPerUsd).toBeLessThan(base.external.myrPerUsd);
    expect(buy.external.myrPerUsd).toBeGreaterThan(base.external.myrPerUsd);
    expect(Math.abs(sell.centralBank.pressure)).toBeLessThan(0.003);
    expect(sell.rng).toEqual(base.rng); expect(buy.rng).toEqual(base.rng);
  }));

  it('enforces a shared daily turnover cap, prevents negative inventory and rejects unsafe amounts atomically', () => {
    const s = createGame(722);
    expect(act(s, { type: 'interveneFx', side: 'sellUSD', usdMinor: 1e9 * 100 }).ok).toBe(true);
    for (const usdMinor of [1, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const before = clone(s);
      expect(act(s, { type: 'interveneFx', side: 'buyUSD', usdMinor }).ok).toBe(false);
      expect(s).toEqual(before);
    }
    const empty = createGame(723, 'balanced', 'legacy-kl');
    expect(quoteIntervention(empty, 'sellUSD', 100, empty.clock.hour * 60).ok).toBe(false);
    expect(quoteIntervention(empty, 'buyUSD', 100, empty.clock.hour * 60).ok).toBe(false);
    runHeadless(s, 24);
    expect(quoteIntervention(s, 'sellUSD', 100, s.clock.hour * 60).ok).toBe(true);
  });

  it('an immediate round trip loses the spread and preserves all other accounts', () => {
    const s = createGame(724), before = clone(s), wealth = publicNetWorth(s);
    expect(act(s, { type: 'interveneFx', side: 'sellUSD', usdMinor: 100e6 * 100 }).ok).toBe(true);
    expect(act(s, { type: 'interveneFx', side: 'buyUSD', usdMinor: 100e6 * 100 }).ok).toBe(true);
    expect(s.centralBank.usdReserves).toBe(before.centralBank.usdReserves);
    expect(s.centralBank.myrCash).toBeLessThan(before.centralBank.myrCash);
    expect(s.centralBank.pressure).toBe(0);
    expect(publicNetWorth(s)).toBeLessThan(wealth);
    expect(s.government).toEqual(before.government); expect(s.fund).toEqual(before.fund);
  });

  it('round-trips active policy, balances, pressure and RNG then continues deterministically', () => {
    const s = createGame(725);
    act(s, { type: 'queueTrade', tariff: 0.05, exportBudgetMonthly: 100e6 });
    act(s, { type: 'interveneFx', side: 'sellUSD', usdMinor: 100e6 * 100 });
    runHeadless(s, 300);
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    runHeadless(s, 1200); runHeadless(loaded, 1200);
    expect(loaded).toEqual(s);
  });

  it('rejects corrupt reserve and trade state on import', () => {
    for (const modify of [(s: ReturnType<typeof createGame>) => { s.centralBank.usdReserves = -1; },
      (s: ReturnType<typeof createGame>) => { s.trade.policy.tariff = 1; },
      (s: ReturnType<typeof createGame>) => { s.centralBank.pressure = 2; }]) {
      const s = createGame(726); modify(s);
      expect(() => deserialize(serialize(s))).toThrow();
    }
  });
});

it('formats full cash balances with exact cents, including zero and large safe amounts', () => {
  expect(fullMoneyMinor(BASELINE.treasury * 100)).toBe('RM 8,865,574,579.00');
  expect(fullMoneyMinor(12345678901, 'USD')).toBe('US$ 123,456,789.01');
  expect(fullMoneyMinor(0)).toBe('RM 0.00');
  expect(fullMoneyMinor(Number.MAX_SAFE_INTEGER)).toBe('RM 90,071,992,547,409.91');
  expect(NATIONAL_GDP).toBeGreaterThan(2e12);
});
