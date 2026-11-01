// Trade-ministry ledger (schema 13, model 3; D-077). A product-level view of Malaysia's trade at official 2025 levels,
// moved by the simulation's own drivers (demand cycles, world prices, FX, partner access). It is a satellite account:
// the opening economy is unchanged, and only exports won by policy — promotion programmes, product deals and buyer
// contracts — feed back into the core model, as extra export demand for the supplying sector at its domestic content.
// Concessions given in deals send part of a sector's home sales to imports. Pure and deterministic: no RNG.
import { SECTOR_IDS } from '../data/economic-baseline';
import {
  CONCESSION_IDS, CONCESSIONS, DEAL_ACCESS_GAIN, DEAL_DISPLACEMENT, DEAL_RAMP_DAYS, DEAL_TALK_DAYS, EXPORT_PRODUCT_IDS, EXPORT_PRODUCTS,
  GOODS_PRODUCT_IDS, IMPORT_CATEGORIES, IMPORT_CATEGORY_IDS, NOMINAL_GDP_2025, PARTNER_TRADE_2025, PROGRAMME_IDS, PROGRAMME_SPEED, PROGRAMMES,
  type ConcessionId, type ExportProductId, type ImportCategoryId, type ProgrammeId, type TradeDriver,
} from '../data/trade';
import { PARTNER_IDS, PARTNERS } from '../data/world';
import type { GameState, PartnerId, SectorId, TradeBookState, TradeDeal, TradeMonth } from '../types/game';
import { exportReach } from './calibration';
import { exportContractFlows } from './export-contracts';
import { fdiExports } from './fdi';
import { tourismLift } from './policy';
import { post } from './government';
import { BOOM, boomOn } from '../data/boom';
import { clamp, news, pushBounded } from './util';
import { partnerAccessTerm } from './world';

const DRIVER_IDS: TradeDriver[] = ['semis', 'industrial', 'oil', 'palm', 'industrialOil', 'steel', 'gas', 'crude', 'consumer', 'global', 'tourism', 'tech'];
/** Drivers that are world prices (USD): their MYR value moves one-for-one with the ringgit. */
const PRICE_DRIVERS = new Set<TradeDriver>(['oil', 'palm', 'steel', 'gas', 'crude']);
/** Export price elasticity for manufactures and services, as in the core export index. */
const COMPETITIVENESS = 0.6;
/** Trade volumes respond less than the equity-market drivers they share (ASSUMPTION): a chip-stock slump of 40%
 * becomes roughly a 25% fall in E&E export value, close to the 2009 downturn. */
const DRIVER_ELASTICITY: Partial<Record<TradeDriver, number>> = { semis: 0.5, tech: 0.5 };

const zeroBy = <K extends string>(ids: readonly K[]) => Object.fromEntries(ids.map((k) => [k, 0])) as Record<K, number>;
const emptyMonth = (monthKey = 0): TradeMonth => ({ monthKey, days: 0, exports: zeroBy(EXPORT_PRODUCT_IDS), imports: zeroBy(IMPORT_CATEGORY_IDS), partners: zeroBy(PARTNER_IDS), promotion: 0, policyExports: 0 });
/** Opening run rate of a 2025 level, MYR per day. */
const openingDaily = (s: GameState, value2025: number) => (value2025 * s.tradeBook.scale) / 365;
const partnerExportShare = (k: PartnerId) => PARTNER_TRADE_2025[k].exports / Object.values(PARTNER_TRADE_2025).reduce((a, p) => a + p.exports, 0);
/** Import share by partner; India is not separately published, so it keeps the partner model's approximate share. */
export const partnerImportShare = (k: PartnerId) => PARTNER_TRADE_2025[k].imports === null ? PARTNERS[k].importShare : PARTNER_TRADE_2025[k].imports! / 1_454_847.1e6;

function driverLevels(s: GameState): Record<TradeDriver, number> {
  const e = s.external, w = s.world, prod = s.soe.petronas.enabled ? s.soe.petronas.production : 1;
  return {
    semis: e.drivers.semis, industrial: e.drivers.industrial, oil: e.oil, palm: w.prices.palm * w.palmVolume,
    industrialOil: Math.sqrt(e.drivers.industrial * e.oil), steel: w.prices.steel * Math.sqrt(e.drivers.industrial), gas: w.prices.gas * prod,
    crude: e.oil * prod, consumer: e.drivers.consumer, global: e.globalDemand, tourism: e.tourism * (1 + s.government.tourismBoost + tourismLift(s)), tech: e.techCycle,
  };
}

export function initialTradeBook(s: GameState, enabled: boolean): TradeBookState {
  const sectorPrices = Object.fromEntries(SECTOR_IDS.map((j) => [j, s.sectors[j].price])) as Record<SectorId, number>;
  return {
    enabled,
    scale: Math.max(s.baseline.nominalGdpAnnual, 1) / NOMINAL_GDP_2025,
    base: {
      drivers: enabled ? driverLevels(s) : zeroBy(DRIVER_IDS), prices: sectorPrices, fx: s.external.myrPerUsd, fxUs: s.external.myrPerUsd * s.external.usPrice,
      access: Object.fromEntries(PARTNER_IDS.map((k) => [k, enabled ? partnerAccessTerm(s, k) : 1])) as Record<PartnerId, number>,
      inputImports: 0, consumerImports: 0, investment: 0, gdp: 0, captured: false,
    },
    programmes: Object.fromEntries(PROGRAMME_IDS.map((id) => [id, { budget: 0, boost: 0, next: null }])) as TradeBookState['programmes'],
    deals: [], nextDealId: 1,
    policyReal: zeroBy(SECTOR_IDS), displacement: zeroBy(SECTOR_IDS),
    day: { exports: zeroBy(EXPORT_PRODUCT_IDS), imports: zeroBy(IMPORT_CATEGORY_IDS), partners: zeroBy(PARTNER_IDS), promotion: 0, policyExports: 0, importedContent: 0 },
    mtd: emptyMonth(), history: [],
  };
}

/** Number of product deals in force with a partner (goodwill in its relations). */
export const dealsInForce = (s: GameState, k: PartnerId) => (s.tradeBook?.enabled ? s.tradeBook.deals.filter((d) => d.partner === k && d.status === 'inForce').length : 0);
/** Boom mode loosens trade deals (D-088); realistic campaigns read the DEAL_* constants unchanged. */
export const dealGain = (s: Pick<GameState, 'mode'>, ask: number) => boomOn(s) ? BOOM.tradeDealGain[ask] : DEAL_ACCESS_GAIN[ask];
export const dealTalkDays = (s: Pick<GameState, 'mode'>, ask: number) => boomOn(s) ? BOOM.tradeTalkDays[ask] : DEAL_TALK_DAYS[ask];
export const dealRounds = (s: Pick<GameState, 'mode'>) => boomOn(s) ? BOOM.tradeRounds : 3;
const rampDays = (s: GameState) => boomOn(s) ? BOOM.tradeRampDays : DEAL_RAMP_DAYS;
const ramp = (s: GameState, d: TradeDeal) => d.startDay === null ? 0 : clamp((s.scheduler.lastDay - d.startDay + 1) / rampDays(s), 0, 1);

/** Export value of each product today before policy gains (MYR/day), from the simulation's drivers. */
export function baseExports(s: GameState): Record<ExportProductId, number> {
  const tb = s.tradeBook, now = driverLevels(s);
  const fxf = s.external.myrPerUsd / tb.base.fx;
  const fxUs = (s.external.myrPerUsd * s.external.usPrice) / tb.base.fxUs;
  const access0 = PARTNER_IDS.reduce((a, k) => a + PARTNERS[k].exportShare * tb.base.access[k], 0);
  const access = s.world.exportAccess / Math.max(access0, 1e-9);
  const out = zeroBy(EXPORT_PRODUCT_IDS);
  for (const id of EXPORT_PRODUCT_IDS) {
    const p = EXPORT_PRODUCTS[id];
    const driver = Math.pow(now[p.driver] / Math.max(tb.base.drivers[p.driver], 1e-9), DRIVER_ELASTICITY[p.driver] ?? 1);
    let value = openingDaily(s, p.value2025) * driver;
    if (PRICE_DRIVERS.has(p.driver)) value *= fxf;
    else value *= Math.pow(s.sectors[p.sector].price / tb.base.prices[p.sector], 1 - COMPETITIVENESS) * Math.pow(fxUs, COMPETITIVENESS);
    if (p.group === 'goods' && !p.commodity) value *= access;
    // Boom mode: the core model sells more as capacity grows; the ledger must follow or its balance drifts from the core's.
    if (!p.commodity) value *= exportReach(s, p.sector);
    out[id] = value;
  }
  return out;
}

/** Policy gains as a share of each product's exports: promotion boosts plus product deals in force. */
export function policyGains(s: GameState): { promotion: Record<ExportProductId, number>; deals: Record<ExportProductId, number>; byPartner: Record<PartnerId, Record<ExportProductId, number>> } {
  const tb = s.tradeBook;
  const promotion = zeroBy(EXPORT_PRODUCT_IDS), deals = zeroBy(EXPORT_PRODUCT_IDS);
  const byPartner = Object.fromEntries(PARTNER_IDS.map((k) => [k, zeroBy(EXPORT_PRODUCT_IDS)])) as Record<PartnerId, Record<ExportProductId, number>>;
  // Export credit insurance pays off most when foreign demand is below trend.
  const slump = Math.max(0, 1 - s.external.globalDemand / Math.max(tb.base.drivers.global, 1e-9) / Math.exp(0.03 * s.external.daysElapsed / 365));
  for (const id of PROGRAMME_IDS) {
    const g = tb.programmes[id].boost * (id === 'credit' ? 1 + 3 * slump : 1);
    for (const [p, max] of Object.entries(PROGRAMMES[id].products) as [ExportProductId, number][]) promotion[p] += max * g;
  }
  for (const d of tb.deals) {
    if (d.status !== 'inForce') continue;
    const gain = partnerExportShare(d.partner) * dealGain(s, d.ask) * ramp(s, d);
    deals[d.product] += gain;
    byPartner[d.partner][d.product] += gain;
  }
  return { promotion, deals, byPartner };
}

/** Exports of operating FDI plants (core `fdiExports`, already in the core's foreign demand) in MYR/day, shared across
 * each sector's manufactured and service products by today's base exports (D-099). Without it the ledger misses the
 * plants' sales, which dominate Boom-mode exports. */
export function fdiProductExports(s: GameState, base: Record<ExportProductId, number>): Record<ExportProductId, number> {
  const out = zeroBy(EXPORT_PRODUCT_IDS), fdiX = fdiExports(s);
  for (const j of SECTOR_IDS) {
    if (!(fdiX[j] > 0)) continue;
    const ids = EXPORT_PRODUCT_IDS.filter((id) => EXPORT_PRODUCTS[id].sector === j && !EXPORT_PRODUCTS[id].commodity);
    const total = ids.reduce((a, id) => a + base[id], 0);
    for (const id of ids) out[id] = (fdiX[j] * s.sectors[j].price * (total > 0 ? base[id] / total : 1 / ids.length));
  }
  return out;
}

// ------------------------------------------------------------------ daily settlement

/** Before the economy step: pay promotion programmes, settle talks, and set today's policy exports and concessions. */
export function prepareTradeDay(s: GameState, day: number, purchases: Record<SectorId, number>): void {
  const tb = s.tradeBook;
  if (!tb?.enabled) return;
  let promotion = 0;
  for (const id of PROGRAMME_IDS) {
    const pr = tb.programmes[id];
    if (pr.next && day >= pr.next.fromDay) { pr.budget = pr.next.budget; pr.next = null; }
    const due = pr.budget / 365;
    const paid = due > 0 ? post(s.government, 'exportSupport', due) : 0;
    promotion += paid;
    // Unpaid programmes stop building; the boost then fades at the same speed it built.
    const target = 1 - Math.exp(-(paid * 365) / PROGRAMMES[id].scale);
    pr.boost += (target - pr.boost) * PROGRAMME_SPEED;
  }
  purchases.fin += promotion * 0.4;
  purchases.tech += promotion * 0.2;
  purchases.cons += promotion * 0.4;

  for (const d of tb.deals) if (d.status === 'talks' && d.concludeDay !== null && day >= d.concludeDay) concludeTalks(s, d, day);

  const base = baseExports(s), gains = policyGains(s), contracts = exportContractFlows(s), fdi = fdiProductExports(s, base);
  const exports = zeroBy(EXPORT_PRODUCT_IDS);
  tb.policyReal = zeroBy(SECTOR_IDS);
  let policyExports = 0, importedContent = 0;
  for (const id of EXPORT_PRODUCT_IDS) {
    const p = EXPORT_PRODUCTS[id];
    const won = base[id] * (gains.promotion[id] + gains.deals[id]) + contracts.volume[id];
    exports[id] = base[id] + won + contracts.hedge[id] + fdi[id];
    policyExports += won;
    // Extra exports carry imported parts: only the domestic content becomes new demand for the supplying sector.
    importedContent += won * (1 - p.domesticContent);
    tb.policyReal[p.sector] += (won * p.domesticContent) / s.sectors[p.sector].price;
  }
  tb.displacement = zeroBy(SECTOR_IDS);
  for (const d of tb.deals) {
    if (d.status !== 'inForce' || d.give === 0) continue;
    tb.displacement[CONCESSIONS[d.concession].sector] += DEAL_DISPLACEMENT[d.give] * partnerImportShare(d.partner) * 10 * ramp(s, d);
  }
  for (const j of SECTOR_IDS) tb.displacement[j] = Math.min(0.05, tb.displacement[j]);

  // Goods exports by partner: opening destination shares, moved by each partner's access, plus deal and contract gains.
  const goodsBase = GOODS_PRODUCT_IDS.reduce((a, id) => a + base[id] * (1 + gains.promotion[id]) + contracts.hedge[id] + fdi[id], 0);
  const weights = Object.fromEntries(PARTNER_IDS.map((k) => [k, partnerExportShare(k) * partnerAccessTerm(s, k) / tb.base.access[k]])) as Record<PartnerId, number>;
  const wSum = PARTNER_IDS.reduce((a, k) => a + weights[k], 0);
  const partners = zeroBy(PARTNER_IDS);
  for (const k of PARTNER_IDS) {
    partners[k] = (goodsBase * weights[k]) / wSum + contracts.byPartner[k];
    for (const id of GOODS_PRODUCT_IDS) partners[k] += base[id] * gains.byPartner[k][id];
  }
  tb.day = { ...tb.day, exports, partners, promotion, policyExports, importedContent };
}

export interface TradeDayInputs { inputImports: number; consumerImports: number; displaced: Record<SectorId, number>; served: Record<SectorId, number>; fdiImports: number; gdpNominal: number }

/** After the economy step: imports by end use (indexed to the core model's flows) and the month-to-date ledger. */
export function recordTradeDay(s: GameState, x: TradeDayInputs): void {
  const tb = s.tradeBook;
  if (!tb?.enabled) return;
  const investment = SECTOR_IDS.reduce((a, j) => a + s.sectors[j].investmentMonthly, 0);
  if (!tb.base.captured) {
    tb.base = { ...tb.base, inputImports: Math.max(x.inputImports, 1), consumerImports: Math.max(x.consumerImports, 1), investment: Math.max(investment, 1), gdp: Math.max(x.gdpNominal, 1), captured: true };
  }
  // Manufactures and services ship only what their sector could produce today, as in the core model (D-099);
  // commodities sell from resource output at world prices. Partner flows, policy gains and their imported parts scale alike.
  const before = tb.day.exports;
  const exports = { ...before };
  for (const id of EXPORT_PRODUCT_IDS) if (!EXPORT_PRODUCTS[id].commodity) exports[id] *= x.served[EXPORT_PRODUCTS[id].sector] ?? 1;
  const goodsBefore = GOODS_PRODUCT_IDS.reduce((a, id) => a + before[id], 0), allBefore = EXPORT_PRODUCT_IDS.reduce((a, id) => a + before[id], 0);
  const goodsShare = goodsBefore > 0 ? GOODS_PRODUCT_IDS.reduce((a, id) => a + exports[id], 0) / goodsBefore : 1;
  const allShare = allBefore > 0 ? EXPORT_PRODUCT_IDS.reduce((a, id) => a + exports[id], 0) / allBefore : 1;
  const partners = Object.fromEntries(PARTNER_IDS.map((k) => [k, tb.day.partners[k] * goodsShare])) as Record<PartnerId, number>;
  tb.day = { ...tb.day, exports, partners, policyExports: tb.day.policyExports * allShare, importedContent: tb.day.importedContent * allShare };
  const goods0 = GOODS_PRODUCT_IDS.reduce((a, id) => a + openingDaily(s, EXPORT_PRODUCTS[id].value2025), 0);
  const goodsNow = GOODS_PRODUCT_IDS.reduce((a, id) => a + exports[id], 0);
  const opening = (c: ImportCategoryId) => openingDaily(s, IMPORT_CATEGORIES[c].value2025);
  const displacedTo = zeroBy(IMPORT_CATEGORY_IDS);
  for (const c of CONCESSION_IDS) displacedTo[CONCESSIONS[c].imports] += x.displaced[CONCESSIONS[c].sector] ?? 0;
  const imports = zeroBy(IMPORT_CATEGORY_IDS);
  imports.intermediate = opening('intermediate') * (x.inputImports / tb.base.inputImports) + tb.day.importedContent + displacedTo.intermediate;
  imports.capital = opening('capital') * (investment / tb.base.investment) + x.fdiImports + displacedTo.capital;
  imports.consumption = opening('consumption') * (x.consumerImports / tb.base.consumerImports) + displacedTo.consumption;
  imports.otherGoods = opening('otherGoods') * (goodsNow / goods0);
  const goodsImports0 = opening('intermediate') + opening('capital') + opening('consumption');
  imports.services = opening('services') * (0.5 * (x.gdpNominal / tb.base.gdp) + 0.5 * (imports.intermediate + imports.capital + imports.consumption) / goodsImports0) + displacedTo.services;
  tb.day.imports = imports;

  const m = tb.mtd;
  m.days += 1;
  for (const id of EXPORT_PRODUCT_IDS) m.exports[id] += exports[id];
  for (const c of IMPORT_CATEGORY_IDS) m.imports[c] += imports[c];
  for (const k of PARTNER_IDS) m.partners[k] += tb.day.partners[k];
  m.promotion += tb.day.promotion;
  m.policyExports += tb.day.policyExports;
}
export function monthCloseTradeBook(s: GameState, monthKey: number): void {
  const tb = s.tradeBook;
  if (!tb?.enabled) return;
  pushBounded(tb.history, { ...tb.mtd, monthKey }, 60);
  tb.mtd = emptyMonth();
}

/** Annual run rates from the last closed month, or today's settlement before the first close (MYR/yr). */
export function tradeRunRate(s: GameState) {
  const tb = s.tradeBook, last = tb.history.at(-1);
  const per = last ? 365 / Math.max(1, last.days) : 365;
  const exports = last ? last.exports : tb.day.exports, imports = last ? last.imports : tb.day.imports;
  const goodsExports = GOODS_PRODUCT_IDS.reduce((a, id) => a + exports[id], 0) * per;
  const servicesExports = EXPORT_PRODUCT_IDS.filter((id) => EXPORT_PRODUCTS[id].group === 'services').reduce((a, id) => a + exports[id], 0) * per;
  const goodsImports = (imports.intermediate + imports.capital + imports.consumption + imports.otherGoods) * per;
  const servicesImports = imports.services * per;
  return { goodsExports, servicesExports, goodsImports, servicesImports, balance: goodsExports + servicesExports - goodsImports - servicesImports };
}

// ------------------------------------------------------------------ player commands

export function setProgramme(s: GameState, id: ProgrammeId, budgetAnnual: number): string | null {
  const tb = s.tradeBook;
  if (!tb?.enabled) return 'The trade ministry is modelled in new Malaysia campaigns.';
  const spec = PROGRAMMES[id];
  if (!spec) return 'Unknown programme.';
  if (!Number.isFinite(budgetAnnual) || budgetAnnual < 0 || budgetAnnual > spec.maxBudget) return `${spec.label}: RM0–${(spec.maxBudget / 1e9).toFixed(1)}bn a year.`;
  const budget = Math.round(budgetAnnual / 1e7) * 1e7;
  const pr = tb.programmes[id];
  if (budget === (pr.next?.budget ?? pr.budget)) return 'No change to apply.';
  pr.next = { budget, fromDay: s.scheduler.lastDay + 1 };
  return null;
}

/** The concession a partner prefers, and how deep an offer must go for it to accept our ask. */
const PREFERRED: Record<PartnerId, ConcessionId> = { SG: 'services', US: 'services', CN: 'industrial', EU: 'procurement', JP: 'industrial', ASEAN: 'consumer', IN: 'consumer', ROW: 'consumer' };
/** D-097: partners accept any offer, including giving nothing, so no depth is required. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for callers; the rule no longer reads these
export function requiredDepth(_s: GameState, _k: PartnerId, _ask: 1 | 2): number {
  return 0;
}
export const offerValue = (k: PartnerId, concession: ConcessionId, give: number, s?: Pick<GameState, 'mode'>) => give * (concession === PREFERRED[k] ? 1 : s && boomOn(s) ? BOOM.tradeOtherConcession : 0.6);

export type TradeDealAction =
  | { action: 'propose'; partner: PartnerId; product: ExportProductId; ask: 1 | 2 }
  | { action: 'offer'; id: number; concession: ConcessionId; give: 0 | 1 | 2 }
  | { action: 'sign'; id: number; concession?: ConcessionId; give?: 0 | 1 | 2 }
  | { action: 'withdraw'; id: number };

export function tradeDealCommand(s: GameState, cmd: TradeDealAction): string | null {
  const tb = s.tradeBook;
  if (!tb?.enabled || !s.world.enabled) return 'The trade ministry is modelled in new Malaysia campaigns.';
  const today = s.scheduler.lastDay;
  if (cmd.action === 'propose') {
    if (!PARTNER_IDS.includes(cmd.partner) || cmd.partner === 'ROW') return 'Choose a named trading partner.';
    const p = EXPORT_PRODUCTS[cmd.product];
    if (!p || p.commodity) return 'Commodities sell at world prices; choose a manufactured product or a service.';
    if (cmd.ask !== 1 && cmd.ask !== 2) return 'Choose a tariff chapter (1) or a deep chapter (2).';
    if (tb.deals.some((d) => d.partner === cmd.partner && d.product === cmd.product && ['draft', 'talks', 'inForce'].includes(d.status))) return 'A deal for this product with this partner is already open or in force.';
    const w = s.world.partners[cmd.partner];
    if (w.ourTariff > 0 || w.theirTariff > 0) return 'Remove the tariff dispute with this partner before negotiating.';
    const wanted = { concession: PREFERRED[cmd.partner], give: 1 as 1 | 2 };
    tb.deals.push({ id: tb.nextDealId++, partner: cmd.partner, product: cmd.product, ask: cmd.ask, concession: wanted.concession, give: 0, wanted, status: 'draft', rounds: 0, createdDay: today, concludeDay: null, startDay: null,
      note: `${PARTNERS[cmd.partner].name} will open its market for ${p.short} if Malaysia opens: ${CONCESSIONS[wanted.concession].label.toLowerCase()} (depth ${wanted.give}).` });
    tb.deals = tb.deals.slice(-60);
    return null;
  }
  const d = tb.deals.find((x) => x.id === cmd.id);
  if (!d) return 'Deal not found.';
  const name = PARTNERS[d.partner].name;
  if (cmd.action === 'offer') {
    if (d.status !== 'draft') return 'Only a draft can be revised.';
    if (!CONCESSION_IDS.includes(cmd.concession) || ![0, 1, 2].includes(cmd.give)) return 'Choose a market to open and a depth of 0–2.';
    if (d.rounds >= dealRounds(s)) return 'All rounds have been used. Sign on their terms or withdraw.';
    d.rounds += 1;
    d.concession = cmd.concession;
    d.give = cmd.give;
    const enough = offerValue(d.partner, cmd.concession, cmd.give, s) + 1e-9 >= requiredDepth(s, d.partner, d.ask);
    if (enough) d.wanted = { concession: cmd.concession, give: Math.max(1, cmd.give) as 1 | 2 };
    d.note = enough ? `${name} accepts this offer in principle. Sign to start formal talks.` : `${name} says this is not enough for its exporters. It still wants: ${CONCESSIONS[d.wanted.concession].label.toLowerCase()} (depth ${d.wanted.give}).`;
    return null;
  }
  if (cmd.action === 'sign') {
    if (d.status !== 'draft') return 'This deal is not awaiting signature.';
    // Signing on the terms shown: a final offer that needs no extra round.
    if (cmd.concession !== undefined && cmd.give !== undefined) {
      if (!CONCESSION_IDS.includes(cmd.concession) || ![0, 1, 2].includes(cmd.give)) return 'Choose a market to open and a depth of 0–2.';
      d.concession = cmd.concession;
      d.give = cmd.give;
    }
    const ok = d.concession === d.wanted.concession && d.give >= d.wanted.give || offerValue(d.partner, d.concession, d.give, s) + 1e-9 >= requiredDepth(s, d.partner, d.ask);
    if (!ok) return `${name} has not accepted these terms. Revise the offer to meet its request.`;
    d.status = 'talks';
    d.concludeDay = today + dealTalkDays(s, d.ask);
    d.note = `Formal talks under way; they conclude in about ${Math.max(1, Math.round(dealTalkDays(s, d.ask) / 30))} month.`;
    return null;
  }
  if (!['draft', 'talks', 'inForce'].includes(d.status)) return 'This deal is already closed.';
  const w = s.world.partners[d.partner];
  if (d.status === 'inForce') w.relations = clamp(w.relations - 15, 0, 100);
  else if (d.status === 'talks') w.relations = clamp(w.relations - 5, 0, 100);
  d.status = 'withdrawn';
  d.note = 'Malaysia withdrew. Any market access gained fades out at once; the partner remembers.';
  return null;
}

function concludeTalks(s: GameState, d: TradeDeal, day: number): void {
  const name = PARTNERS[d.partner].name, p = EXPORT_PRODUCTS[d.product];
  d.concludeDay = null; // D-097: talks always conclude; a partner never walks away
  d.status = 'inForce';
  d.startDay = day + 1;
  d.note = `In force. ${p.short} exporters gain access over about a month${d.give ? '; the concession phases in over the same period' : ''}.`;
  news(s, { kind: 'policy', tone: 'good', title: `${p.short} trade deal with ${name} in force`, body: `Exports of ${p.label.toLowerCase()} to ${name} can rise by up to ${(dealGain(s, d.ask) * 100).toFixed(0)}% of that market. Simulated.` });
}

export function validateTradeBook(tb: TradeBookState): void {
  const finite = (r: Record<string, number>) => Object.values(r).every(Number.isFinite);
  if (!tb || typeof tb.enabled !== 'boolean' || !(tb.scale > 0) || !tb.base || !tb.programmes || !Array.isArray(tb.deals) || !Array.isArray(tb.history) || !tb.mtd || !tb.day
    || !Number.isSafeInteger(tb.nextDealId) || !finite(tb.policyReal) || !finite(tb.displacement)) throw new Error('Corrupt save: trade ledger');
  for (const id of PROGRAMME_IDS) {
    const p = tb.programmes[id];
    if (!p || !(p.budget >= 0 && p.budget <= PROGRAMMES[id].maxBudget) || !(p.boost >= 0 && p.boost <= 1)) throw new Error('Corrupt save: trade programme');
  }
  for (const d of tb.deals) {
    if (!PARTNER_IDS.includes(d.partner) || !(d.product in EXPORT_PRODUCTS) || !CONCESSION_IDS.includes(d.concession) || ![1, 2].includes(d.ask) || ![0, 1, 2].includes(d.give)
      || !['draft', 'talks', 'inForce', 'collapsed', 'withdrawn'].includes(d.status)) throw new Error('Corrupt save: trade deal');
  }
}
