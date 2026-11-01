// Commodities and trading partners (model-2 Malaysia campaigns). World prices are exogenous: the
// player cannot set them, only domestic prices (ceilings, subsidies), duties and bilateral tariffs.
// All randomness here comes from `s.world.rng`, a separate persisted stream, so adding this module
// does not change the draw order of the existing economy, market or events.
import { baselineFor, nationalV2 } from '../data/economic-baseline';
import {
  AGREEMENT_ACCESS, AGREEMENT_DAYS, AGREEMENT_IMPORT_SAVING, COMMODITIES, COMMODITY_EPISODES, COMMODITY_IDS,
  EXPORT_TARIFF_ELASTICITY, FUEL_CEILING0, FUEL_CPI_WEIGHT, FUEL_CRUDE_SHARE, FUEL_EFFECTIVE0, FUEL_ELIGIBLE0, FUEL_MARKET0, FUEL_VOLUME, IMPORT_SUBSTITUTION,
  PALM_DUTY0, PARTNER_IDS, PARTNERS, RETALIATION_LAG_DAYS, fuelEffectivePrice, fuelSubsidyAnnual,
} from '../data/world';
import type { CommodityId, CommodityPolicy, GameState, PartnerId, PartnerState, WorldState } from '../types/game';
import { subsidyCut } from './fiscal-levers';
import { rand, randInt, randnClipped, seedRng } from './rng';
import { klDay } from './time';
import { dealsInForce } from './trade-book';
import { clamp, news, pushBounded } from './util';

export const initialCommodityPolicy = (): CommodityPolicy => ({
  fuelCeiling: FUEL_CEILING0, fuelEligible: FUEL_ELIGIBLE0, wheatSubsidy: 0, steelSafeguard: 0, palmExportDuty: PALM_DUTY0,
});

const initialPartner = (): PartnerState => ({ ourTariff: 0, theirTariff: 0, relations: 70, agreement: 0, negotiationDoneDay: null, retaliationDay: null, retaliationTarget: 0 });

export function initialWorld(seed: number, enabled: boolean): WorldState {
  const cycles: Record<string, number> = {};
  for (const c of COMMODITY_IDS) cycles[c] = 0;
  for (const p of PARTNER_IDS) cycles[`p_${p}`] = 0;
  return {
    enabled,
    // A separate stream (golden-ratio offset) keeps the existing seeded outcomes unchanged.
    rng: seedRng((seed ^ 0x9e3779b9) >>> 0),
    cycles,
    prices: Object.fromEntries(COMMODITY_IDS.map((c) => [c, 1])) as Record<CommodityId, number>,
    gasIndex: 1,
    palmVolume: 1,
    rubberVolume: 1,
    episodes: [],
    episodeLog: [],
    nextId: 1,
    policy: initialCommodityPolicy(),
    partners: Object.fromEntries(PARTNER_IDS.map((p) => [p, initialPartner()])) as Record<PartnerId, PartnerState>,
    exportAccess: 1,
    importPriceIndex: 1,
    importDutyShare: 0,
    history: [],
    lastWheatImports: 0,
    lastRiceImports: 0,
    mtdPalmProfit: 0,
    mtd: { fuelSubsidy: 0, wheatSubsidy: 0, palmDuty: 0, steelDuty: 0, bilateralDuty: 0, resourceVa: 0 },
  };
}

/** Days of synthetic pre-game price history shown on the commodity chart (display only). */
export const WORLD_SEED_DAYS = 180;

/**
 * Fictional pre-game price paths so the chart is not empty at campaign start: a backward AR(1) walk per
 * commodity ending at today's index of 1. Uses its own throwaway stream, never `world.rng` or `s.rng`,
 * so it changes no simulated outcome.
 */
export function seedWorldHistory(w: WorldState, seed: number, startDay: number): void {
  const rng = seedRng((seed ^ 0x51ed270b) >>> 0);
  const path = {} as Record<CommodityId, number[]>;
  for (const c of COMMODITY_IDS) {
    let x = 0;
    const sd = c === 'oil' ? 0.012 : COMMODITIES[c].sd;
    path[c] = [];
    for (let k = 0; k < WORLD_SEED_DAYS; k++) {
      path[c].push(Math.exp(x));
      x = 0.995 * x + sd * randnClipped(rng);
    }
    path[c].reverse();
  }
  w.history = Array.from({ length: WORLD_SEED_DAYS }, (_, k) => ({
    t: startDay - WORLD_SEED_DAYS + k,
    ...(Object.fromEntries(COMMODITY_IDS.map((c) => [c, path[c][k]])) as Record<CommodityId, number>),
  }));
}

/** Episode strength ramps in over 7 days and out over the last 14. */
function episodeStrength(startDay: number, endDay: number, day: number): number {
  if (day < startDay || day >= endDay) return 0;
  return Math.min(1, (day - startDay + 1) / 7, (endDay - day) / 14);
}

/** Daily world update for the day that just ended. Runs after the external economy. */
export function updateWorld(s: GameState, day: number): void {
  const w = s.world;
  if (!w.enabled) return;
  const e = s.external;
  for (const c of COMMODITY_IDS) {
    const m = COMMODITIES[c];
    if (m.sd > 0) w.cycles[c] = m.persist * w.cycles[c] + m.sd * randnClipped(w.rng);
  }
  for (const p of PARTNER_IDS) w.cycles[`p_${p}`] = 0.985 * w.cycles[`p_${p}`] + 0.0025 * randnClipped(w.rng);

  const volume: Partial<Record<CommodityId, number>> = {};
  const shock = Object.fromEntries(COMMODITY_IDS.map((c) => [c, 0])) as Record<CommodityId, number>;
  for (const ep of w.episodes) {
    const k = episodeStrength(ep.startDay, ep.endDay, day);
    shock[ep.commodity] += ep.shock * k;
    volume[ep.commodity] = (volume[ep.commodity] ?? 0) + ep.volume * k;
  }
  const gg = e.cycles.global ?? 0;
  const lnOil = Math.log(Math.max(e.oil, 0.05));
  // Cross-links: biofuels tie palm to crude; metals and rubber follow the global industrial cycle;
  // food and coal carry fuel and freight costs. Long-term LNG contracts reprice with a ~6-month lag to oil.
  const links: Record<Exclude<CommodityId, 'oil' | 'gas'>, number> = {
    coal: 0.3 * lnOil + gg, palm: 0.4 * lnOil + 0.3 * gg, rubber: 0.3 * lnOil + 2 * gg, rice: 0.1 * lnOil,
    wheat: 0.25 * lnOil, steel: 3 * gg, aluminium: 0.2 * lnOil + 2 * gg, copper: 3 * gg,
  };
  w.gasIndex += (e.oil - w.gasIndex) / 180;
  w.prices.oil = e.oil;
  w.prices.gas = w.gasIndex * Math.exp(w.cycles.gas + shock.gas);
  for (const [c, link] of Object.entries(links) as [Exclude<CommodityId, 'oil' | 'gas'>, number][]) w.prices[c] = Math.exp(w.cycles[c] + link + shock[c]);
  w.palmVolume = Math.exp(volume.palm ?? 0);
  w.rubberVolume = Math.exp(volume.rubber ?? 0);
  pushBounded(w.history, { t: day, ...w.prices }, 800);

  updatePartners(s, day);
}

/** Weekly (Monday): seeded commodity episodes from the world stream. */
export function weeklyWorld(s: GameState, today: number): void {
  const w = s.world;
  if (!w.enabled) return;
  w.episodes = w.episodes.filter((ep) => ep.endDay > today);
  for (const t of COMMODITY_EPISODES) {
    const r = rand(w.rng);
    if (r >= t.hazard || w.episodes.some((ep) => ep.templateId === t.id)) continue;
    const days = randInt(w.rng, t.minDays, t.maxDays);
    const size = 0.75 + 0.5 * rand(w.rng);
    const ep = { id: w.nextId++, templateId: t.id, commodity: t.commodity, title: t.title, startDay: today, endDay: today + days, shock: t.shock * size, volume: (t.volume ?? 0) * size };
    w.episodes.push(ep);
    pushBounded(w.episodeLog, ep, 100);
    const dir = t.shock > 0 ? 'up' : 'down';
    news(s, { kind: 'event', tone: 'neutral', title: `Commodities: ${t.title}`, body: `World ${COMMODITIES[t.commodity].name.toLowerCase()} prices pushed ${dir} roughly ${Math.abs(Math.round((Math.exp(ep.shock) - 1) * 100))}% for ~${days} days. Simulated.` });
  }
}

// ------------------------------------------------------------------ partners
function updatePartners(s: GameState, day: number): void {
  const w = s.world;
  for (const id of PARTNER_IDS) {
    const p = w.partners[id];
    if (p.retaliationDay !== null && day >= p.retaliationDay) {
      const before = p.theirTariff;
      p.theirTariff = p.retaliationTarget;
      p.retaliationDay = null;
      if (p.theirTariff > before) news(s, { kind: 'policy', tone: 'bad', title: `${PARTNERS[id].name} retaliates`, body: `It now charges a ${(p.theirTariff * 100).toFixed(1)}% surcharge on Malaysian exports. Simulated response.` });
      else if (p.theirTariff < before) news(s, { kind: 'policy', tone: 'good', title: `${PARTNERS[id].name} lifts its surcharge`, body: `Its surcharge on Malaysian exports is now ${(p.theirTariff * 100).toFixed(1)}%.` });
    }
    if (p.negotiationDoneDay !== null && day >= p.negotiationDoneDay) {
      p.negotiationDoneDay = null;
      if (p.ourTariff === 0 && p.theirTariff === 0) {
        p.agreement = Math.min(2, p.agreement + 1);
        p.relations = clamp(p.relations + 8, 0, 100);
        news(s, { kind: 'policy', tone: 'good', title: `Trade agreement upgraded with ${PARTNERS[id].name}`, body: `Lower non-tariff barriers: exports gain access, imports from this partner cost less.` });
      } else news(s, { kind: 'policy', tone: 'bad', title: `Talks with ${PARTNERS[id].name} collapsed`, body: 'Negotiations cannot conclude while tariffs are in dispute.' });
    }
    // Relations drift back toward a level set by the dispute; product deals in force (D-077) add goodwill.
    const target = 70 - 150 * p.ourTariff - 50 * p.theirTariff + 8 * p.agreement + 4 * dealsInForce(s, id);
    p.relations += (clamp(target, 0, 100) - p.relations) / 60;
  }
  // Export access: partner demand cycles × tariff barriers × agreements, weighted by export shares.
  let access = 0;
  for (const id of PARTNER_IDS) access += PARTNERS[id].exportShare * partnerAccessTerm(s, id);
  w.exportAccess = access;
  // CES import price across partners: tariffs divert purchases toward untariffed sources.
  const sigma = IMPORT_SUBSTITUTION;
  let denom = 0, duty = 0, spend = 0;
  for (const id of PARTNER_IDS) {
    const p = w.partners[id];
    const price = (1 + p.ourTariff) * (1 - AGREEMENT_IMPORT_SAVING * p.agreement);
    const share = PARTNERS[id].importShare * Math.pow(price, 1 - sigma);
    denom += share;
    spend += share;
    duty += share * (p.ourTariff / (1 + p.ourTariff));
  }
  w.importPriceIndex = Math.pow(denom, 1 / (1 - sigma));
  w.importDutyShare = spend > 0 ? duty / spend : 0;
}

/** One partner's export-access term: its demand cycle × its tariff on Malaysia × agreement tier (1 with no shocks). */
export function partnerAccessTerm(s: GameState, id: PartnerId): number {
  const w = s.world, e = s.external, m = PARTNERS[id], p = w.partners[id];
  const cycle = w.cycles[`p_${id}`] + (m.usCycle ? (e.cycles.us ?? 0) - (e.cycles.global ?? 0) : 0);
  return Math.exp(cycle) * Math.pow(1 + p.theirTariff, -EXPORT_TARIFF_ELASTICITY) * (1 + AGREEMENT_ACCESS * p.agreement);
}

/** Schedule the partner's response to a change in Malaysia's surcharge on its goods. */
export function scheduleRetaliation(s: GameState, id: PartnerId, today: number): void {
  const p = s.world.partners[id];
  const target = Math.round(PARTNERS[id].retaliation * p.ourTariff * 1000) / 1000;
  if (target === p.theirTariff) {
    p.retaliationDay = null;
    return;
  }
  p.retaliationTarget = target;
  // Partners escalate after a delay but de-escalate faster.
  p.retaliationDay = today + (target > p.theirTariff ? RETALIATION_LAG_DAYS : 30);
}

export function startNegotiation(s: GameState, id: PartnerId, atMin: number): { ok: boolean; message: string } {
  const p = s.world.partners[id];
  if (!s.world.enabled) return { ok: false, message: 'Trade partners are available in new Malaysia campaigns.' };
  if (p.agreement >= 2) return { ok: false, message: 'This agreement is already at its deepest modelled tier.' };
  if (p.negotiationDoneDay !== null) return { ok: false, message: 'Negotiations are already under way.' };
  if (p.ourTariff > 0 || p.theirTariff > 0) return { ok: false, message: 'Remove tariff disputes with this partner before negotiating.' };
  if (p.relations < 50) return { ok: false, message: 'Relations are too strained (below 50) to open talks.' };
  p.negotiationDoneDay = klDay(atMin) + AGREEMENT_DAYS;
  return { ok: true, message: `Negotiations with ${PARTNERS[id].name} opened; they conclude in about six months if no tariff dispute arises.` };
}

// ------------------------------------------------------------------ domestic prices and duties
/** Unsubsidised pump price (RM/litre) from crude in ringgit. */
export function fuelMarketPrice(s: GameState): number {
  const fxf = s.external.myrPerUsd / baselineFor(s).myrPerUsd;
  return FUEL_MARKET0 * (1 - FUEL_CRUDE_SHARE + FUEL_CRUDE_SHARE * s.external.oil * fxf);
}

/** Subsidy targeting (D-114): the saving per litre that higher-income households now pay at the pump (RM/litre). */
function targetingPremium(s: GameState): number {
  const cut = subsidyCut(s);
  if (cut <= 0) return 0;
  const pol = s.world.policy;
  return cut * fuelSubsidyAnnual(fuelMarketPrice(s), pol.fuelCeiling, pol.fuelEligible) / FUEL_VOLUME;
}

/** Household pump-price index relative to opening (1 = opening mix of capped and market prices). */
export function fuelPriceIndex(s: GameState): number {
  if (!nationalV2(s)) return 1;
  const pol = s.world.policy;
  return (fuelEffectivePrice(fuelMarketPrice(s), pol.fuelCeiling, pol.fuelEligible) + targetingPremium(s)) / FUEL_EFFECTIVE0;
}

/** CPI excluding the administered pump-price component (model 2), same base as the CPI. */
export function coreCpiOf(s: GameState): number {
  if (!nationalV2(s)) return s.indicators.cpi;
  return (s.indicators.cpi - 100 * FUEL_CPI_WEIGHT * fuelPriceIndex(s)) / (1 - FUEL_CPI_WEIGHT);
}

/** Extra household fuel and food spending versus opening (MYR/day): pump prices × volume, plus the food subsidy targeting removes. Model 2 only. */
export function householdFuelBillDelta(s: GameState): number {
  if (!nationalV2(s)) return 0;
  const pol = s.world.policy;
  const foodSaved = subsidyCut(s) * rawWheatSubsidyDaily(s);
  return (FUEL_VOLUME / 365) * (fuelEffectivePrice(fuelMarketPrice(s), pol.fuelCeiling, pol.fuelEligible) + targetingPremium(s) - FUEL_EFFECTIVE0) + foodSaved;
}

/** Fuel subsidy owed today (MYR/day), after the share targeting removes. */
export function fuelSubsidyDaily(s: GameState): number {
  if (!nationalV2(s)) return 0;
  return fuelSubsidyAnnual(fuelMarketPrice(s), s.world.policy.fuelCeiling, s.world.policy.fuelEligible) / 365 * (1 - subsidyCut(s));
}

/** Food import price paid by importers after the subsidy (index). It covers part of any rise above reference. */
export function foodUserPrice(s: GameState, c: 'wheat' | 'rice'): number {
  const p = s.world.prices[c];
  return p > 1 ? 1 + (1 - s.world.policy.wheatSubsidy) * (p - 1) : p;
}
/** Back-compatible name for the wheat leg. */
export const wheatUserPrice = (s: GameState) => foodUserPrice(s, 'wheat');

/** Food subsidy owed for yesterday's wheat and rice imports (MYR/day), before subsidy targeting. */
function rawWheatSubsidyDaily(s: GameState): number {
  if (!nationalV2(s) || s.world.policy.wheatSubsidy <= 0) return 0;
  const w = s.world;
  const fxf = s.external.myrPerUsd / baselineFor(s).myrPerUsd;
  const owed = (qty: number, p: number) => qty * fxf * Math.max(0, p - 1);
  return (owed(w.lastWheatImports, w.prices.wheat) + owed(w.lastRiceImports, w.prices.rice)) * w.policy.wheatSubsidy;
}

/** Food subsidy owed (MYR/day), after the share targeting removes (D-114). */
export const wheatSubsidyDaily = (s: GameState): number => rawWheatSubsidyDaily(s) * (1 - subsidyCut(s));

export function validateCommodityPolicy(p: Partial<CommodityPolicy>): string | null {
  const bad = (v: number | undefined, lo: number, hi: number) => v !== undefined && !(Number.isFinite(v) && v >= lo && v <= hi);
  if (bad(p.fuelCeiling, 1.5, 4)) return 'Fuel ceiling must be RM1.50–4.00 per litre.';
  if (bad(p.fuelEligible, 0, 1)) return 'Eligible share must be 0–100%.';
  if (bad(p.wheatSubsidy, 0, 1)) return 'Wheat subsidy must cover 0–100% of the rise.';
  if (bad(p.steelSafeguard, 0, 0.5)) return 'Steel safeguard duty must be 0–50%.';
  if (bad(p.palmExportDuty, 0, 0.2)) return 'Palm export duty must be 0–20%.';
  return null;
}

export function validateWorld(w: WorldState): void {
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!w || typeof w.enabled !== 'boolean' || !w.rng || !w.prices || !w.partners || !w.policy || !Array.isArray(w.episodes) || !Array.isArray(w.history)) throw new Error('Corrupt save: invalid world state');
  if (validateCommodityPolicy(w.policy)) throw new Error('Corrupt save: invalid commodity policy');
  for (const c of COMMODITY_IDS) if (!finite(w.prices[c]) || w.prices[c] <= 0) throw new Error('Corrupt save: invalid commodity price');
  for (const id of PARTNER_IDS) {
    const p = w.partners[id];
    if (!p || !(p.ourTariff >= 0 && p.ourTariff <= 0.5) || !(p.theirTariff >= 0 && p.theirTariff <= 0.5) || !(p.relations >= 0 && p.relations <= 100)
      || ![0, 1, 2].includes(p.agreement)) throw new Error('Corrupt save: invalid trade partner');
  }
  if (!(w.importPriceIndex > 0) || !(w.exportAccess > 0) || !(w.palmVolume > 0) || !(w.gasIndex > 0)) throw new Error('Corrupt save: invalid world indices');
}
