import { describe, expect, it } from 'vitest';
import { NATIONAL_GDP, SECTOR_IDS } from '../src/data/economic-baseline';
import { DEVELOPMENT_ANNUAL0, FUEL_SUBSIDY0, KHAZANAH, PETRONAS, RESOURCE_VA0 } from '../src/data/world';
import { CAL } from '../src/engine/calibration';
import { importCost } from '../src/engine/economy';
import { credibilityPremium, deficitTarget } from '../src/engine/fiscal-rules';
import { applyCommand, createGame, runHeadless, SCHEMA_VERSION } from '../src/engine/game';
import { otherPublicReceiptsMonthly, outlaysOf, revenueOf } from '../src/engine/government';
import { publicNetWorth } from '../src/engine/indicators';
import { nextOpen } from '../src/engine/market-calendar';
import { khazanahNav, modelledResourceRevenue0 } from '../src/engine/soe';
import { fuelSubsidyDaily } from '../src/engine/world';
import { deserialize, serialize } from '../src/persistence/save';
import type { GameState } from '../src/types/game';
import { clone, runUntil, withoutEvents } from './helpers';

// eslint-friendly shape for tampering with serialized saves in tests
type SaveJson = { state: { world: GameState['world'] & { partners: Record<string, { ourTariff: number }> }; soe: GameState['soe']; fiscal: GameState['fiscal'] } };
const act = (s: GameState, c: Parameters<typeof applyCommand>[1]) => applyCommand(s, c, s.clock.hour * 60);
const sum = (s: GameState, k: keyof GameState['reports'][number]['gov']) => s.reports.reduce((a, r) => a + r.gov[k], 0);

describe('national accounts with resources, development spending and SOEs', () => {
  it('opens at official GDP, official revenue and the official deficit implied by Budget 2027', () => {
    const s = createGame(901);
    expect(s.indicators.nominalGdpAnnual).toBeCloseTo(NATIONAL_GDP, 0);
    expect(CAL.gdpDaily * 365 + RESOURCE_VA0).toBeCloseTo(NATIONAL_GDP, 0);
    const taxes = SECTOR_IDS.reduce((a, j) => a + Math.max(0, CAL.profit0[j]) * 0.18, 0) + 0.04 * 0.5 * CAL.Y0.prop + CAL.levyBase + CAL.hh.tax;
    expect(taxes * 365 + modelledResourceRevenue0() + otherPublicReceiptsMonthly(s) * 12).toBeCloseTo(380_816_996_000, 0);
    expect(s.fiscal.developmentAnnual).toBe(DEVELOPMENT_ANNUAL0);
    // (operating 376.84bn + development 85bn − revenue 380.82bn) / GDP ≈ 4.0%
    expect(s.fiscal.openingDeficit).toBeCloseTo((376_840_000_000 + 85e9 - 380_816_996_000) / NATIONAL_GDP, 6);
    expect(fuelSubsidyDaily(s) * 365).toBeCloseTo(FUEL_SUBSIDY0, -3);
  });

  it('measures a first-quarter deficit near the opening estimate and reconciles every sen', () => withoutEvents(() => {
    const s = createGame(902);
    runUntil(s, 2027, 4, 1, 1);
    const f = s.fiscal.history.at(-1)!;
    expect(f.deficit).toBeGreaterThan(0.03);
    expect(f.deficit).toBeLessThan(0.05);
    for (const r of s.reports) {
      expect(r.reconciliation?.cashResidualMinor).toBe(0);
      expect(r.reconciliation?.debtResidualMinor).toBe(0);
      expect(r.gov.soeDividend).toBeGreaterThan(0);
      expect(r.gov.petroleumTax).toBeGreaterThan(0);
      expect(r.gov.subsidy).toBeGreaterThan(0);
    }
  }));

  it('keeps the existing random stream untouched: world shocks use their own seeded stream', () => withoutEvents(() => {
    const a = createGame(903), b = createGame(903);
    runHeadless(a, 24 * 20);
    runHeadless(b, 24 * 20, (s) => { s.world.cycles.wheat = 0.3; });
    expect(b.rng).toEqual(a.rng);
    expect(b.world.prices.wheat).toBeGreaterThan(a.world.prices.wheat);
  }));
});

describe('state-owned enterprises', () => {
  it('a bigger PETRONAS dividend moves cash to the treasury without creating public wealth or GDP', () => withoutEvents(() => {
    const base = createGame(910), rich = clone(base);
    act(rich, { type: 'petronasPolicy', dividendAnnual: 60e9, capexAnnual: PETRONAS.capex0 });
    runUntil(base, 2027, 3, 1, 1); runUntil(rich, 2027, 3, 1, 1);
    expect(sum(rich, 'soeDividend') - sum(base, 'soeDividend')).toBeGreaterThan(4e9);
    expect(rich.soe.petronas.cash).toBeLessThan(base.soe.petronas.cash - 4e9);
    expect(Math.abs(publicNetWorth(rich) - publicNetWorth(base))).toBeLessThan(0.5e9);
    expect(rich.reports[0].nominalGdp).toBeCloseTo(base.reports[0].nominalGdp, -6);
  }));

  it('cutting PETRONAS capex lowers demand now and production later', () => withoutEvents(() => {
    const base = createGame(911), cut = clone(base);
    act(cut, { type: 'petronasPolicy', dividendAnnual: PETRONAS.dividend0, capexAnnual: 20e9 });
    runUntil(base, 2027, 9, 1, 1); runUntil(cut, 2027, 9, 1, 1);
    expect(cut.sectors.ind.output).toBeLessThan(base.sectors.ind.output);
    expect(cut.soe.petronas.production).toBeLessThan(base.soe.petronas.production);
    expect(cut.soe.petronas.cash).toBeGreaterThan(base.soe.petronas.cash);
  }));

  it('Khazanah receives listed dividends, pays its payout to the treasury and trades blocks in session only', () => withoutEvents(() => {
    const s = createGame(912);
    const before = s.soe.khazanah.shares['MY:6888']!;
    expect(before).toBe(Math.round(s.companies['MY:6888'].shares * KHAZANAH.stakes['MY:6888']!));
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.02 }).ok).toBe(false); // 08:00, Bursa closed
    runHeadless(s, (nextOpen('MY', s.clock.hour * 60) - s.clock.hour * 60) / 60 + 1);
    const cash = s.soe.khazanah.cash, sentiment = s.companies['MY:6888'].sentiment, nav = khazanahNav(s);
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.02 }).ok).toBe(true);
    expect(s.soe.khazanah.shares['MY:6888']).toBe(before - Math.round(s.companies['MY:6888'].shares * 0.02));
    expect(s.soe.khazanah.cash).toBeGreaterThan(cash);
    expect(s.companies['MY:6888'].sentiment).toBeLessThan(sentiment);
    expect(khazanahNav(s)).toBeLessThan(nav); // the block discount is a real cost
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.1 }).ok).toBe(true);
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.1 }).ok).toBe(true);
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.1 }).ok).toBe(true);
    expect(act(s, { type: 'khazanahTrade', ticker: 'MY:6888', side: 'sell', fraction: 0.1 }).ok).toBe(false); // holds only ~36%
    expect(act(s, { type: 'khazanahTrade', ticker: 'US:NVDA' as never, side: 'buy', fraction: 0.01 }).ok).toBe(false);
    runUntil(s, 2027, 5, 1, 1);
    expect(s.soe.khazanah.history.some((h) => h.income > 0 && h.dividend > 0)).toBe(true);
  }));

  it('a special dividend is a transfer between public accounts, capped by the enterprise’s cash', () => {
    const s = createGame(913);
    const nw = publicNetWorth(s), treasury = s.government.treasury;
    expect(act(s, { type: 'soeSpecialDividend', entity: 'petronas', amount: 10e9 }).ok).toBe(true);
    expect(s.government.treasury - treasury).toBe(10e9 * 100);
    expect(publicNetWorth(s)).toBeCloseTo(nw, 0);
    expect(act(s, { type: 'soeSpecialDividend', entity: 'khazanah', amount: 1e15 }).ok).toBe(false);
  });
});

describe('commodities, subsidies and duties', () => {
  it('raising the fuel ceiling takes effect next month, cuts the subsidy bill and raises the CPI', () => withoutEvents(() => {
    const base = createGame(920), cut = clone(base);
    expect(act(cut, { type: 'queueCommodity', patch: { fuelCeiling: 2.6 } }).ok).toBe(true);
    runUntil(base, 2027, 2, 1, 1); runUntil(cut, 2027, 2, 1, 1);
    expect(cut.reports[0].gov.subsidy).toBe(base.reports[0].gov.subsidy); // January under the old ceiling
    runUntil(base, 2027, 4, 1, 1); runUntil(cut, 2027, 4, 1, 1);
    expect(cut.reports.at(-1)!.gov.subsidy).toBeLessThan(base.reports.at(-1)!.gov.subsidy * 0.2);
    expect(cut.indicators.cpi).toBeGreaterThan(base.indicators.cpi);
    expect(cut.policyChurn).toBeGreaterThan(base.policyChurn);
  }));

  it('blanket subsidies leak: the same ceiling for everyone costs more than proportionally', () => {
    const s = createGame(921);
    const targeted = fuelSubsidyDaily(s);
    s.world.policy.fuelEligible = 1;
    expect(fuelSubsidyDaily(s)).toBeGreaterThan(targeted / 0.85 * 1.1);
  });

  it('a steel safeguard collects duty, raises construction input costs and shifts demand to domestic steel', () => withoutEvents(() => {
    const base = createGame(922), duty = clone(base);
    act(duty, { type: 'queueCommodity', patch: { steelSafeguard: 0.25 } });
    runUntil(base, 2027, 4, 1, 1); runUntil(duty, 2027, 4, 1, 1);
    expect(importCost(duty, 'prop').user).toBeGreaterThan(importCost(base, 'prop').user);
    expect(sum(duty, 'commodityDuty')).toBeGreaterThan(sum(base, 'commodityDuty'));
    expect(duty.sectors.ind.output).toBeGreaterThan(base.sectors.ind.output);
    expect(duty.sectors.prop.price).toBeGreaterThan(base.sectors.prop.price);
  }));

  it('a wheat subsidy costs nothing at reference prices and shields food costs when wheat spikes', () => withoutEvents(() => {
    const calm = createGame(923), calmSubsidised = clone(calm);
    act(calmSubsidised, { type: 'queueCommodity', patch: { wheatSubsidy: 1 } });
    const cheap = (s: GameState) => { s.world.cycles.wheat = -0.1; };
    runHeadless(calm, 24 * 70, cheap); runHeadless(calmSubsidised, 24 * 70, cheap);
    expect(sum(calmSubsidised, 'subsidy')).toBe(sum(calm, 'subsidy')); // below reference: nothing to pay
    const spike = createGame(923), shielded = clone(spike);
    act(shielded, { type: 'queueCommodity', patch: { wheatSubsidy: 1 } });
    const shock = (s: GameState) => { s.world.cycles.wheat = Math.log(1.4); };
    runHeadless(spike, 24 * 90, shock); runHeadless(shielded, 24 * 90, shock);
    expect(importCost(shielded, 'cons').user).toBeLessThan(importCost(spike, 'cons').user);
    expect(sum(shielded, 'subsidy')).toBeGreaterThan(sum(spike, 'subsidy'));
  }));

  it('higher palm prices raise duty, exports and household income', () => withoutEvents(() => {
    const base = createGame(924), boom = clone(base);
    const up = (s: GameState) => { s.world.cycles.palm = Math.log(1.4); };
    runUntil(base, 2027, 4, 1, 1);
    runHeadless(boom, base.clock.hour - boom.clock.hour, up);
    expect(sum(boom, 'commodityDuty')).toBeGreaterThan(sum(base, 'commodityDuty'));
    expect(boom.trade.history.at(-1)!.exports).toBeGreaterThan(base.trade.history.at(-1)!.exports);
    expect(boom.reports.at(-1)!.resourceGdp!).toBeGreaterThan(base.reports.at(-1)!.resourceGdp!);
  }));
});

describe('trading partners', () => {
  it('a surcharge on one partner diverts imports, collects duty and draws retaliation after a lag', () => withoutEvents(() => {
    const base = createGame(930), war = clone(base);
    expect(act(war, { type: 'partnerTariff', partner: 'CN', tariff: 0.25 }).ok).toBe(true);
    expect(war.world.partners.CN.ourTariff).toBe(0); // queued for next month
    runUntil(base, 2027, 2, 5); runUntil(war, 2027, 2, 5);
    expect(war.world.partners.CN.ourTariff).toBe(0.25);
    expect(war.world.importPriceIndex).toBeGreaterThan(1);
    expect(war.world.importPriceIndex).toBeLessThan(1 + 0.21 * 0.25); // diversion: less than the naive cost
    expect(war.world.partners.CN.theirTariff).toBe(0);
    runUntil(base, 2027, 4, 15); runUntil(war, 2027, 4, 15);
    expect(war.world.partners.CN.theirTariff).toBeCloseTo(0.25, 6);
    expect(war.world.exportAccess).toBeLessThan(base.world.exportAccess);
    expect(sum(war, 'importTariff')).toBeGreaterThan(sum(base, 'importTariff'));
    expect(war.world.partners.CN.relations).toBeLessThan(base.world.partners.CN.relations);
  }));

  it('trade agreements need calm relations and conclude after about six months', () => withoutEvents(() => {
    const s = createGame(931);
    expect(act(s, { type: 'negotiateAgreement', partner: 'EU' }).ok).toBe(true);
    expect(act(s, { type: 'negotiateAgreement', partner: 'EU' }).ok).toBe(false);
    const access = s.world.exportAccess;
    runUntil(s, 2027, 7, 15);
    expect(s.world.partners.EU.agreement).toBe(1);
    expect(s.world.exportAccess).toBeGreaterThan(access);
    const t = createGame(932);
    act(t, { type: 'partnerTariff', partner: 'US', tariff: 0.1 });
    runUntil(t, 2027, 2, 2);
    expect(act(t, { type: 'negotiateAgreement', partner: 'US' }).ok).toBe(false);
  }));
});

describe('fiscal rules', () => {
  it('glides the deficit target from the opening deficit to the ceiling over two years', () => {
    const s = createGame(940);
    expect(deficitTarget(s.fiscal, 0)).toBeCloseTo(s.fiscal.openingDeficit, 6);
    expect(deficitTarget(s.fiscal, 24)).toBeCloseTo(0.03, 6);
    expect(deficitTarget(s.fiscal, 12)).toBeLessThan(s.fiscal.openingDeficit);
  });

  it('consolidation builds credibility and lowers the risk premium; drift erodes it', () => withoutEvents(() => {
    const drift = createGame(941), tight = clone(drift);
    act(tight, { type: 'setDevelopment', annual: 60e9 });
    act(tight, { type: 'queueTax', patch: { consumption: 0.06 } });
    runUntil(drift, 2028, 1, 2); runUntil(tight, 2028, 1, 2);
    expect(tight.fiscal.history.at(-1)!.deficit).toBeLessThan(drift.fiscal.history.at(-1)!.deficit);
    expect(tight.fiscal.credibility).toBeGreaterThan(drift.fiscal.credibility);
    expect(credibilityPremium(tight)).toBeLessThan(credibilityPremium(drift));
    const f = drift.fiscal.history.at(-1)!;
    expect(f.primaryDeficit).toBeLessThan(f.deficit); // interest is part of the overall deficit
    const window = drift.reports.slice(-12);
    const days = window.reduce((d, r) => d + new Date(Date.UTC(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1, 0)).getUTCDate(), 0);
    expect(f.revenue).toBeCloseTo(window.reduce((a, r) => a + revenueOf(r.gov), 0) * 365 / days, -3);
    expect(f.outlays).toBeCloseTo(window.reduce((a, r) => a + outlaysOf(r.gov), 0) * 365 / days, -3);
  }));

  it('loosening the rule or escaping without a downturn costs credibility; a justified escape costs little', () => {
    const a = createGame(942);
    const c0 = a.fiscal.credibility;
    expect(act(a, { type: 'setFiscalRule', patch: { deficitCap: 0.05 } }).ok).toBe(true);
    expect(a.fiscal.credibility).toBeLessThan(c0 - 15);
    const b = createGame(943);
    expect(act(b, { type: 'fiscalEscape', invoke: true }).ok).toBe(true);
    expect(b.fiscal.escape?.justified).toBe(false);
    expect(b.fiscal.credibility).toBe(c0 - 20);
    const r = createGame(944, 'recession');
    expect(act(r, { type: 'fiscalEscape', invoke: true }).ok).toBe(true);
    expect(r.fiscal.escape?.justified).toBe(true);
    expect(r.fiscal.credibility).toBe(c0 - 2);
    expect(act(r, { type: 'fiscalEscape', invoke: false }).ok).toBe(true);
    expect(act(r, { type: 'setFiscalRule', patch: { debtCap: 2 } }).ok).toBe(false);
  });

  it('cutting development spending lowers public capital and, over time, productivity', () => withoutEvents(() => {
    const base = createGame(945), cut = clone(base);
    act(cut, { type: 'setDevelopment', annual: 40e9 });
    runUntil(base, 2028, 1, 2); runUntil(cut, 2028, 1, 2);
    expect(cut.fiscal.publicCapital).toBeLessThan(base.fiscal.publicCapital);
    expect(sum(cut, 'capex')).toBeLessThan(sum(base, 'capex') - 30e9);
  }));
});

describe('stock-market wealth effect', () => {
  it('higher Bursa prices raise household spending through the wealth effect', () => withoutEvents(() => {
    const base = createGame(950), bull = clone(base);
    runHeadless(base, 24 * 60);
    runHeadless(bull, 24 * 60, (s) => { for (const c of Object.values(s.companies)) if (c.id.startsWith('MY:')) c.sentiment = 0.25; });
    expect(bull.households.equityIndex).toBeGreaterThan(base.households.equityIndex + 0.1);
    expect(bull.sectors.cons.output).toBeGreaterThan(base.sectors.cons.output);
  }));
});

describe('saves', () => {
  it('round-trips schema 6 world, SOE and fiscal state and continues deterministically', () => withoutEvents(() => {
    const s = createGame(960);
    act(s, { type: 'partnerTariff', partner: 'JP', tariff: 0.1 });
    act(s, { type: 'queueCommodity', patch: { steelSafeguard: 0.1 } });
    runHeadless(s, 24 * 70);
    const t = deserialize(serialize(s));
    expect(t.schemaVersion).toBe(SCHEMA_VERSION);
    expect(t.world).toEqual(s.world);
    runHeadless(s, 24 * 30); runHeadless(t, 24 * 30);
    expect(t.indicators).toEqual(s.indicators);
    expect(t.soe).toEqual(s.soe);
  }));

  it('upgrades schema-5 national saves with these systems off, keeping the old calibration', () => {
    const s = createGame(961);
    const file = JSON.parse(serialize(s));
    file.state.schemaVersion = 5;
    for (const k of ['world', 'soe', 'fiscal']) delete file.state[k];
    delete file.state.baseline.model;
    delete file.state.households.equityIndex;
    for (const k of ['soeDividend', 'petroleumTax', 'commodityDuty', 'subsidy']) delete file.state.government.mtd[k];
    const t = deserialize(JSON.stringify(file));
    expect(t.baseline.model).toBe(1);
    expect(t.world.enabled).toBe(false);
    expect(t.soe.petronas.enabled).toBe(false);
    expect(act(t, { type: 'partnerTariff', partner: 'CN', tariff: 0.1 }).ok).toBe(false);
    runHeadless(t, 24 * 40);
    expect(t.reports[0].gov.soeDividend).toBe(0);
    expect(t.reports[0].gov.subsidy).toBe(0);
  });

  it('rejects corrupt world, SOE and fiscal state', () => {
    const s = createGame(962);
    for (const corrupt of [
      (f: SaveJson) => { f.state.world.partners.CN.ourTariff = 2; },
      (f: SaveJson) => { f.state.world.policy.fuelCeiling = -1; },
      (f: SaveJson) => { f.state.soe.khazanah.shares['MY:6888'] = -5; },
      (f: SaveJson) => { f.state.fiscal.credibility = 400; },
      (f: SaveJson) => { f.state.world.enabled = false; },
    ]) {
      const file = JSON.parse(serialize(s));
      corrupt(file);
      expect(() => deserialize(JSON.stringify(file))).toThrow(/Corrupt save/);
    }
  });
});
