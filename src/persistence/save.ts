import { initialDeals, validateDeals } from '../engine/deals';
import { appearanceSnapshot, type MapAppearance } from '../map/appearance';
import { initialControls, validateControls } from '../engine/policy-controls';
// Versioned save format. Saving never mutates game state or advances the clock.
import { assertSafeMinor } from '../engine/util';
import { createGame, SCHEMA_VERSION } from '../engine/game';
import { COMMODITY_IDS } from '../data/world';
import { COMPANIES } from '../data/companies';
import { LEGACY_BASELINE, SECTOR_IDS } from '../data/economic-baseline';
import { initialCentralBank, neutralMonetaryPolicy } from '../engine/trade-fx';
import { initialFiscal, validateFiscal } from '../engine/fiscal-rules';
import { initialSoe, validateSoe } from '../engine/soe';
import { initialWorld, validateCommodityPolicy, validateWorld } from '../engine/world';
import { initialPolicy, validatePolicy } from '../engine/policy';
import { initialFdi, validateFdi } from '../engine/fdi';
import { initialTradeBook, validateTradeBook } from '../engine/trade-book';
import type { GameState } from '../types/game';

export interface SaveFile {
  appearance?: MapAppearance;
  format: 'kl-economic-empire';
  schemaVersion: number;
  savedAtReal: string;
  label: string;
  state: GameState;
}

export function serialize(s: GameState, label = 'Manual save'): string {
  const file: SaveFile = { format: 'kl-economic-empire', schemaVersion: s.schemaVersion, savedAtReal: new Date().toISOString(), label, state: s, appearance: appearanceSnapshot() };
  return JSON.stringify(file);
}

/** Recursively verifies that every number is finite. Returns the first bad path, or null. */
export function findNonFinite(v: unknown, path = 'state'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findNonFinite(v[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const r = findNonFinite(x, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a state from schema n to n+1. */
const MIGRATIONS: Record<number, Migration> = {
  9: state => {
    const s = state as unknown as GameState;
    s.deals ??= initialDeals(s.seed, false, s.scheduler.lastDay);
    for (const f of [s.government.mtd, ...s.reports.map(r => r.gov)]) { f.dealEscrowOut = 0; f.dealEscrowIn = 0; }
    return state;
  },
  // v12 → v13: trade-ministry ledger (D-077). Model-3 Malaysia saves open it from today at official 2025 levels; nothing
  // already settled changes. Earlier models keep it switched off.
  12: state => {
    const s = state as unknown as GameState;
    s.tradeBook ??= initialTradeBook(s, !!s.fdi?.enabled && !!s.world?.enabled);
    return state;
  },
  // v11 → v12: central-bank monetary policy. Existing campaigns stay on the automatic rule with neutral settings.
  11: state => {
    const s = state as unknown as GameState;
    const cb = s.centralBank as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries({ ...neutralMonetaryPolicy(), targetOpr: s.external.opr })) cb[k] ??= v;
    return state;
  },
  // v10 → v11: progressive income tax. Existing campaigns keep their flat surcharge (no `pit` flag); the new rate
  // lever and treasury line exist but stay inert, so balances, replays and scores are unchanged.
  10: state => {
    const s = state as unknown as GameState;
    s.government.policies.tax.incomeTax ??= 1;
    for (const f of [s.government.mtd, ...s.reports.map((r) => r.gov)]) { f.taxIncome ??= 0; f.nonTaxRevenue ??= 0; }
    return state;
  },
  // v8 → v9: policy levers, AI adoption and FDI. Existing saves keep them switched off (neutral, no new draws) and gain
  // zero policy treasury lines, so balances, replays and scores are unchanged.
  8: state => {
    const s = state as unknown as GameState;
    s.policy ??= initialPolicy(false);
    s.fdi ??= initialFdi(s.seed, false);
    for (const flows of [s.government.mtd, ...s.reports.map((r) => r.gov)]) {
      flows.policyLevy ??= 0;
      flows.policyGrant ??= 0;
    }
    return state;
  },
  // v7 → v8: ministry plans gain an optional step interval (absent = annual). Existing campaigns keep their model
  // generation (1 or 2) and trend; only new campaigns use model 3's national trend and monthly opening budget path.
  7: state => state,
  4: state => { (state as unknown as GameState).controls ??= initialControls(); return state; },
  // v6 → v7: ten commodities and 60 securities. New commodity indices start at reference; new companies take their
  // opening state from a fresh game with the same seed, and index divisors are rescaled so index values do not jump.
  6: (state) => {
    const s = state as unknown as GameState;
    const fresh = createGame(s.seed, s.scenario, s.baseline.profile);
    const w = s.world;
    for (const c of COMMODITY_IDS) {
      w.prices[c] ??= c === 'gas' ? w.gasIndex : 1;
      w.cycles[c] ??= 0;
      for (const h of w.history) h[c] ??= 1;
    }
    w.rubberVolume ??= 1;
    w.lastRiceImports ??= 0;
    const added = COMPANIES.filter((c) => !s.companies[c.id]);
    for (const ex of ['MY', 'US'] as const) {
      const cap = (ids: typeof COMPANIES) => ids.filter((c) => c.exchange === ex).reduce((a, c) => a + s.market.quotes[c.id].price * s.companies[c.id].shares, 0);
      const before = cap(COMPANIES.filter((c) => s.companies[c.id]));
      for (const c of added.filter((x) => x.exchange === ex)) {
        s.companies[c.id] = fresh.companies[c.id];
        s.market.quotes[c.id] = fresh.market.quotes[c.id];
      }
      const after = cap(COMPANIES);
      if (before > 0) s.market.indices[ex].divisor *= after / before;
    }
    return state;
  },
  // v5 → v6: resource sector, SOEs, commodities, trading partners and fiscal rules. Existing campaigns keep
  // their calibration (model 1) with these systems switched off, so balances and outcomes are unchanged.
  5: (state) => {
    const s = state as unknown as GameState;
    s.baseline.model ??= 1;
    s.world ??= initialWorld(s.seed, false);
    s.soe ??= initialSoe(false);
    s.fiscal ??= initialFiscal(0, 0);
    s.households.equityIndex ??= 1;
    for (const flows of [s.government.mtd, ...s.reports.map((r) => r.gov)]) {
      flows.soeDividend ??= 0;
      flows.petroleumTax ??= 0;
      flows.commodityDuty ??= 0;
      flows.subsidy ??= 0;
    }
    return state;
  },
  // v1 → v2 (master): projects track real work done (for construction-cost escalation).
  1: (s) => {
    const gov = s.government as { projects: { spent: number; work?: number }[] };
    for (const p of gov.projects) p.work = p.work ?? p.spent;
    return s;
  },
  // v2 → v3 (integration of the parallel Phase 3 branch, which also called its format "v2"):
  // fill whichever of the two branches' fields are missing, so saves from either branch load.
  2: (state) => {
    const s = state as unknown as GameState;
    for (const p of s.government.projects) p.work = p.work ?? p.spent;
    s.government.ledger ??= [];
    if (!s.fund.realized || !s.fund.dividends || s.fund.realizedMYR === undefined) {
      // Recover totals from still-held positions; gains on fully sold positions and historical
      // sale FX cannot be reconstructed, so they are not invented.
      s.fund.realized = { MYR: 0, USD: 0 };
      s.fund.realizedMYR = 0;
      s.fund.dividends = { MYR: 0, USD: 0 };
      for (const [id, p] of Object.entries(s.fund.positions)) if (p) {
        const currency = id.startsWith('US:') ? 'USD' : 'MYR';
        s.fund.realized[currency] += p.realizedMinor;
        if (currency === 'MYR') s.fund.realizedMYR += p.realizedMinor;
        s.fund.dividends[currency] += p.dividendsMinor;
      }
    }
    return state;
  },
  3: (state) => {
    const s = state as unknown as GameState;
    // Tests may deliberately downgrade a current snapshot; retain explicit provenance if present.
    s.baseline.profile ??= 'legacy-kl';
    s.baseline.openingTreasury ??= LEGACY_BASELINE.treasury;
    s.baseline.openingDebt ??= LEGACY_BASELINE.debt;
    s.centralBank ??= initialCentralBank('legacy-kl', s.external.myrPerUsd);
    s.trade ??= { trackingStartDay: s.scheduler.lastDay, policy: { tariff: 0, exportBudgetMonthly: 0 }, readiness: 0, mtdExports: 0, mtdImports: 0, history: [] };
    for (const flows of [s.government.mtd, ...s.reports.map(r => r.gov)]) {
      flows.importTariff ??= 0;
      flows.exportSupport ??= 0;
    }
    return state;
  },
};

export function deserialize(json: string): GameState {
  let file: SaveFile;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Error('Save file is not valid JSON');
  }
  if (file?.format !== 'kl-economic-empire' || !file.state) throw new Error('Not a KL Economic Empire save');
  let st = file.state as unknown as Record<string, unknown>;
  let v = Number(st.schemaVersion);
  if (!Number.isInteger(v) || v < 1) throw new Error('Unknown save schema');
  if (v > SCHEMA_VERSION) throw new Error(`Save is from a newer version (schema ${v})`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from schema ${v}`);
    st = m(st);
    v += 1;
    st.schemaVersion = v;
  }
  const s = st as unknown as GameState;
  validateControls(s.controls);
  validateDeals(s);
  const bad = findNonFinite(s);
  if (bad) throw new Error(`Corrupt save: non-finite number at ${bad}`);
  for (const key of ['clock', 'scheduler', 'rng', 'government', 'fund', 'market', 'sectors', 'households', 'bank', 'external', 'trade', 'centralBank', 'world', 'soe', 'fiscal'] as const) {
    if (!s[key]) throw new Error(`Corrupt save: missing ${key}`);
  }
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const nonnegative = (value: unknown): value is number => value === 0 || positive(value);
  if (!nonnegative(s.clock.subHourMs) || s.clock.subHourMs >= 3_600_000) throw new Error('Corrupt save: clock out of range');
  if (![s.clock.hour, s.clock.startHour, s.clock.endHour].every(Number.isSafeInteger)
    || s.clock.endHour <= s.clock.startHour || s.clock.hour < s.clock.startHour || s.clock.hour > s.clock.endHour
    || ![1, 2, 3].includes(s.clock.speed) || typeof s.clock.paused !== 'boolean') throw new Error('Corrupt save: invalid clock');
  if (typeof s.scheduler.campaignEnded !== 'boolean' || (s.scheduler.campaignEnded && s.clock.hour !== s.clock.endHour)
    || ![s.scheduler.lastDay, s.scheduler.lastWeekDay, s.scheduler.lastMonthKey, s.scheduler.ticks].every(Number.isSafeInteger)) throw new Error('Corrupt save: invalid scheduler');
  if (!['a', 'b', 'c', 'd'].every((k) => {
    const word = s.rng[k as keyof typeof s.rng];
    return Number.isInteger(word) && word >= -2147483648 && word <= 4294967295;
  })) throw new Error('Corrupt save: invalid RNG');
  if (![s.reports, s.daily, s.news, s.actions, s.policyLog, s.events?.active, s.events?.log].every(Array.isArray)) throw new Error('Corrupt save: missing history');
  if (!positive(s.indicators?.cpi) || !positive(s.baseline?.realGdpAnnual) || !positive(s.baseline.nominalGdpAnnual)
    || !positive(s.households.population) || !positive(s.households.laborForce) || !positive(s.households.wageIndex)) throw new Error('Corrupt save: invalid economy');
  for (const j of SECTOR_IDS) {
    const sector = s.sectors[j];
    if (!sector || sector.id !== j || !positive(sector.price) || !positive(sector.capital) || !positive(sector.capacity)
      || !positive(sector.productivity) || !nonnegative(sector.employment) || !Array.isArray(sector.pipeline)
      || sector.pipeline.length !== 6 || sector.pipeline.some((v) => !nonnegative(v))) throw new Error('Corrupt save: invalid sector');
  }
  for (const company of COMPANIES) {
    if (!s.companies?.[company.id] || !s.market.quotes?.[company.id] || !Array.isArray(s.companies[company.id].history)) throw new Error('Corrupt save: missing security');
  }
  validateWorld(s.world);
  validateSoe(s.soe);
  validateFiscal(s.fiscal);
  validatePolicy(s.policy);
  validateFdi(s.fdi);
  validateTradeBook(s.tradeBook);
  if (s.policy.enabled !== s.fdi.enabled || (s.policy.enabled && s.baseline.model !== 3)) throw new Error('Corrupt save: inconsistent policy generation');
  if (![1, 2, 3].includes(s.baseline.model) || !(s.households.equityIndex > 0)
    || (s.baseline.profile !== 'malaysia' || s.baseline.model === 1) !== !s.world.enabled) throw new Error('Corrupt save: inconsistent model generation');
  if (!['a', 'b', 'c', 'd'].every((k) => {
    const word = s.world.rng[k as keyof typeof s.world.rng];
    return Number.isInteger(word) && word >= -2147483648 && word <= 4294967295;
  })) throw new Error('Corrupt save: invalid world RNG');
  for (const p of s.government.pending) {
    if (p.kind === 'commodity' && validateCommodityPolicy(p.patch as object)) throw new Error('Corrupt save: invalid pending commodity policy');
    if (p.kind === 'development' && !((p.patch as { annual: number }).annual >= 0 && (p.patch as { annual: number }).annual <= 200e9)) throw new Error('Corrupt save: invalid pending development budget');
    if (p.kind === 'partner') {
      const q = p.patch as { partner: string; tariff: number };
      if (!(q.partner in s.world.partners) || !(q.tariff >= 0 && q.tariff <= 0.5)) throw new Error('Corrupt save: invalid pending partner tariff');
    }
  }
  if (!['malaysia', 'legacy-kl'].includes(s.baseline.profile)
    || !nonnegative(s.baseline.openingTreasury) || !nonnegative(s.baseline.openingDebt)
    || !nonnegative(s.trade.policy?.tariff) || s.trade.policy.tariff > 0.2
    || !nonnegative(s.trade.policy.exportBudgetMonthly) || s.trade.policy.exportBudgetMonthly > 2e9
    || !nonnegative(s.trade.readiness) || s.trade.readiness > 0.12
    || !Number.isSafeInteger(s.trade.trackingStartDay) || !nonnegative(s.trade.mtdExports) || !nonnegative(s.trade.mtdImports) || !Array.isArray(s.trade.history)
    || !nonnegative(s.centralBank.dailyUsdUsed) || s.centralBank.dailyUsdUsed > 1e9
    || !Number.isSafeInteger(s.centralBank.lastInterventionDay) || Math.abs(s.centralBank.pressure) > 0.08
    || !nonnegative(s.centralBank.openingEquityMYR) || !Array.isArray(s.centralBank.tx)) throw new Error('Corrupt save: invalid trade or central bank');
  for (const n of [s.centralBank.usdReserves, s.centralBank.myrCash]) {
    assertSafeMinor(n);
    if (n < 0) throw new Error('Corrupt save: negative central-bank inventory');
  }
  for (const p of s.government.pending) if (p.kind === 'trade') {
    const t = p.patch as { tariff?: number; exportBudgetMonthly?: number };
    if ((t.tariff !== undefined && (!nonnegative(t.tariff) || t.tariff > 0.2))
      || (t.exportBudgetMonthly !== undefined && (!nonnegative(t.exportBudgetMonthly) || t.exportBudgetMonthly > 2e9))) throw new Error('Corrupt save: invalid pending trade policy');
  }
  if (s.fund.myrCash < 0 || s.fund.usdCash < 0) throw new Error('Corrupt save: negative fund cash');
  for (const n of [s.fund.myrCash, s.fund.usdCash, s.government.treasury, s.government.debt, ...Object.values(s.fund.realized), ...Object.values(s.fund.dividends), s.fund.realizedMYR]) assertSafeMinor(n);
  if (s.government.treasury < 0 || s.government.debt < 0) throw new Error('Corrupt save: negative treasury or debt');
  for (const [id, p] of Object.entries(s.fund.positions)) if (p) {
    if (!s.companies[id as keyof typeof s.companies] || !Number.isSafeInteger(p.units) || p.units <= 0 || p.costMinor < 0 || p.costMYR < 0) throw new Error('Corrupt save: invalid position');
    for (const n of [p.costMinor, p.costMYR, p.realizedMinor, p.dividendsMinor]) assertSafeMinor(n);
  }
  if (!positive(s.external.myrPerUsd)) throw new Error('Corrupt save: invalid FX rate');
  for (const [id, quote] of Object.entries(s.market.quotes)) {
    if (!s.companies[id as keyof typeof s.companies] || !positive(quote.price)) throw new Error('Corrupt save: invalid quote');
  }
  for (const o of s.fund.orders) {
    if (o.status === 'queued' && (!s.companies[o.ticker] || !Number.isSafeInteger(o.units) || o.units <= 0 || !['buy', 'sell'].includes(o.side))) throw new Error('Corrupt save: invalid pending order');
  }
  if (s.scheduler.campaignEnded) s.clock.subHourMs = 0; // correct legacy end-screen overshoot, without accrual
  s.clock.paused = true; // always resume paused
  return s;
}
