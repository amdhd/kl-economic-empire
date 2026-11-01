// Export buyer contracts in the Deal Room (D-077). A fictional foreign buyer commits to buy a yearly value of a Malaysian
// product at an agreed price; the treasury posts a 2% performance bond in escrow. Half of the contracted volume is extra
// exports (the rest would have sold on the spot market anyway). If the supplying sector runs above capacity, part of the
// volume is not delivered and a shortfall penalty is drawn from the bond, then from the treasury. The LNG contract is a
// price hedge instead: PETRONAS gains or loses the gap between the contract price and spot. Buyers and prices are fictional.
import { EXPORT_PRODUCT_IDS, EXPORT_PRODUCTS, type ExportProductId } from '../data/trade';
import { PARTNER_IDS } from '../data/world';
import type { Deal } from '../types/deals';
import type { GameState, PartnerId } from '../types/game';
import { addDeal, dealLog, releaseDeal, reserveDeal, spendDeal, DEAL_ROUNDS } from './deals';
import { post } from './government';
import { boomOn } from '../data/boom';
import { toMinor } from './util';

export const EXPORT_ADDITIONALITY = 0.5;
export const BOND_SHARE = 0.02;
const SHORTFALL_PENALTY = 0.25; // share of the undelivered value

export interface ExportContractSpec { product: ExportProductId; partner: PartnerId; name: string; counterparty: string; volume: number; hedge?: boolean; note: string }
export const EXPORT_CONTRACTS: Record<string, ExportContractSpec> = {
  'export:lng': { product: 'lng', partner: 'JP', name: 'LNG offtake: Japanese utility', counterparty: 'Higashi Power (fictional)', volume: 8e9, hedge: true,
    note: 'A price hedge on RM8bn a year of LNG. A fixed price protects PETRONAS if gas prices fall and costs it if they rise. Volume is already sold, so no extra exports.' },
  'export:chips': { product: 'ee', partner: 'US', name: 'Chip test & packaging supply: US device maker', counterparty: 'Northbay Devices (fictional)', volume: 6e9,
    note: 'RM6bn a year of packaged chips. Half is new business for Malaysian E&E plants; shortfalls when they run above capacity cost penalties.' },
  'export:steel': { product: 'metals', partner: 'ROW', name: 'Steel sections: Gulf construction group', counterparty: 'Al Noor Build (fictional)', volume: 2e9,
    note: 'RM2bn a year of structural steel. Half is new business for local mills.' },
  'export:halal': { product: 'food', partner: 'ASEAN', name: 'Halal food: regional supermarket chain', counterparty: 'Nusantara Mart (fictional)', volume: 1.5e9,
    note: 'RM1.5bn a year of halal processed food across ASEAN stores. Half is new business for local food makers.' },
  'export:palm': { product: 'palm', partner: 'IN', name: 'Palm oil G2G supply: Indian refiner', counterparty: 'Ganga Edible Oils (fictional)', volume: 4e9,
    note: 'RM4bn a year of palm oil. Half is new demand; plantations cannot grow output quickly, so a hot sector misses deliveries.' },
};
export const EXPORT_CONTRACT_IDS = Object.keys(EXPORT_CONTRACTS);
const spec = (d: Deal) => EXPORT_CONTRACTS[d.template.split(':cohort')[0]] ?? EXPORT_CONTRACTS[d.template];

/** Spot price index of a contract's product in ringgit (1 near the opening). */
export function exportSpot(s: GameState, product: ExportProductId): number {
  const fxf = s.external.myrPerUsd / (s.tradeBook?.base.fx || s.external.myrPerUsd);
  if (product === 'lng') return s.world.prices.gas * fxf;
  if (product === 'palm') return s.world.prices.palm * fxf;
  if (product === 'metals') return s.world.prices.steel * fxf;
  return s.sectors[EXPORT_PRODUCTS[product].sector].price;
}
export function exportUnitPrice(s: GameState, d: Deal): number {
  const spot = exportSpot(s, d.product!);
  return (d.lockedPrice ?? spot) * (1 - d.terms.protection) + spot * d.terms.priceFactor * d.terms.protection;
}
/** Share of contracted volume delivered: full until the supplying sector runs above capacity. */
export function deliveryShare(s: GameState, d: Deal): number {
  if (d.product === 'lng') return s.soe.petronas.enabled ? Math.min(1, s.soe.petronas.production / 0.9) : 1;
  const util = s.sectors[EXPORT_PRODUCTS[d.product!].sector].utilization;
  return Math.min(1, Math.max(0.5, 1 - 2 * (util - 1)));
}
const live = (s: GameState, d: Deal) => d.kind === 'export' && ['agreed', 'active'].includes(d.status) && s.scheduler.lastDay >= d.nextDay && s.scheduler.lastDay < (d.operationEndDay ?? Infinity);

export function exportOffers(s: GameState): void {
  if (!s.deals.enabled || !s.tradeBook?.enabled) return;
  for (const template of EXPORT_CONTRACT_IDS) {
    if (s.deals.items.some((d) => d.template === template && ['opportunity', 'negotiating', 'agreed', 'active'].includes(d.status))) continue;
    const c = EXPORT_CONTRACTS[template];
    const d = addDeal(s, template, 'export', c.name, 'treasury', c.volume * BOND_SHARE, EXPORT_PRODUCTS[c.product].sector);
    d.counterparty = c.counterparty;
    d.product = c.product;
    d.volume = c.volume;
    d.terms.months = 24;
    d.terms.priceFactor = 1;
    d.terms.protection = 0.5;
    d.deadline = s.scheduler.lastDay + 60;
    d.note = c.note;
  }
}
/** The buyer pays more only for shorter or more indexed contracts (it bears the risk of a fixed price). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for callers; the rule no longer reads these
export const buyerMaxPrice = (_months?: number, _protection?: number, _s?: Pick<GameState, 'mode'>) => 1.3; // D-097: buyers accept any price in the allowed range

export function offerExport(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || d.rounds >= DEAL_ROUNDS || s.scheduler.lastDay >= d.deadline) return 'Negotiation is closed.';
  const t = { ...d.terms, ...terms };
  if (!(Number.isInteger(t.months) && t.months >= 12 && t.months <= 60 && t.priceFactor >= 0.9 && t.priceFactor <= 1.3 && t.protection >= 0 && t.protection <= 1))
    return 'Use 12–60 months, a 0.90–1.30 price multiplier and 0–100% indexation.';
  const max = buyerMaxPrice(t.months, t.protection, s);
  d.terms = { ...t, priceFactor: Math.min(t.priceFactor, Math.floor(max * 1000) / 1000) };
  d.version++;
  d.rounds++;
  dealLog(s, d, t.priceFactor > max ? `Buyer countered at ${d.terms.priceFactor.toFixed(3)}× spot for this length and indexation.` : 'Buyer accepts this price, length and indexation.');
  return null;
}
export function signExport(s: GameState, d: Deal): string | null {
  if (s.deals.items.some((x) => x.id !== d.id && x.template === d.template && ['agreed', 'active'].includes(x.status))) return 'A contract with this buyer is already running.';
  if (d.terms.priceFactor > buyerMaxPrice(d.terms.months, d.terms.protection, s) + 1e-9) return 'The buyer will not pay this price for these terms. Revise the offer.';
  const err = reserveDeal(s, d, d.priceMinor);
  if (err) return err;
  d.lockedPrice = exportSpot(s, d.product!) * d.terms.priceFactor;
  d.nextDay = s.scheduler.lastDay + 1;
  d.operationEndDay = d.nextDay + Math.round((d.terms.months * 365) / 12);
  d.status = 'agreed';
  d.committedMinor = 0;
  d.guaranteeMinor = d.priceMinor;
  d.delivered = 0;
  d.penaltyMinor = 0;
  dealLog(s, d, 'Signed. The performance bond is held in escrow; deliveries start tomorrow.');
  return null;
}
export function cancelExport(s: GameState, d: Deal): void {
  const fee = d.status === 'active' ? Math.min(d.escrowMinor, Math.round(d.priceMinor * 0.5)) : 0;
  spendDeal(s, d, fee);
  releaseDeal(s, d);
  d.guaranteeMinor = 0;
  d.status = 'completed';
  dealLog(s, d, `Contract exited early${fee ? `; half the bond (${(fee / 1e8).toFixed(1)}m) is forfeited to the buyer` : ''}.`);
}
export function dailyExportContract(s: GameState, d: Deal, day: number): void {
  if (d.kind !== 'export' || !['agreed', 'active'].includes(d.status) || day < d.nextDay) return;
  if (day >= (d.operationEndDay ?? day)) {
    releaseDeal(s, d);
    d.status = 'completed';
    d.progress = 1;
    d.guaranteeMinor = 0;
    dealLog(s, d, 'Contract term completed; the bond is returned.');
    return;
  }
  d.status = 'active';
  d.progress = (day - d.nextDay) / Math.max(1, (d.operationEndDay ?? day + 1) - d.nextDay);
  const spot = exportSpot(s, d.product!), unit = exportUnitPrice(s, d);
  if (unit > spot / 0.7 && !boomOn(s)) { // Boom mode (D-090): buyers never walk away from a premium
    releaseDeal(s, d);
    d.status = 'failed';
    d.guaranteeMinor = 0;
    dealLog(s, d, 'The buyer walked away: the contract price ran more than 40% above the market. The bond is returned; no penalty applies.');
    return;
  }
  const daily = (d.volume ?? 0) / 365, share = deliveryShare(s, d);
  d.delivered = (d.delivered ?? 0) + daily * share;
  if (spec(d)?.hedge && s.soe.petronas.enabled) s.soe.petronas.cash += daily * share * (unit / spot - 1);
  else if (!spec(d)?.hedge) {
    // D-105: the gap between the contract price and spot on every delivered unit is income for the exporting sector (a
    // terms-of-trade gain, or a loss when spot runs above a locked price). It adds to nominal value added, not to real output.
    const premium = contractUnits(s, d, spot) * (unit - spot);
    const sec = s.sectors[EXPORT_PRODUCTS[d.product!].sector];
    sec.mtd.profit += premium;
    sec.mtd.taxableProfit += premium;
    sec.mtd.va += premium;
    s.scheduler.mtdGdpNominal += premium;
  }
  if (share < 1) {
    const penalty = boomOn(s) ? 0 : toMinor(daily * (1 - share) * SHORTFALL_PENALTY);
    const fromBond = spendDeal(s, d, penalty);
    const due = penalty - fromBond + d.arrearsMinor;
    const paid = due > 0 ? toMinor(post(s.government, 'policyGrant', due / 100)) : 0;
    d.arrearsMinor = due - paid;
    d.penaltyMinor = (d.penaltyMinor ?? 0) + fromBond + paid;
  }
  d.note = `${(d.delivered / 1e9).toFixed(2)}bn delivered, ${(share * 100).toFixed(0)}% of today's volume. Contract price ${unit.toFixed(3)} vs spot ${spot.toFixed(3)}.`;
}

/** Units delivered today, measured at the spot price when the contract was signed (so volume × spot is today's market value). */
function contractUnits(s: GameState, d: Deal, spot: number): number {
  return (d.volume ?? 0) / 365 * deliveryShare(s, d) / ((d.lockedPrice ?? spot) / d.terms.priceFactor);
}

/** Today's contract flows for the trade ledger (MYR/day) (D-105): `volume` is the extra real exports valued at spot, which
 * is new demand for the sector; `price` is the contract-price gap on every delivered unit (the LNG hedge, and premiums or
 * discounts on the other contracts), which is export value but not extra output. */
export function exportContractFlows(s: GameState) {
  const volume = Object.fromEntries(EXPORT_PRODUCT_IDS.map((k) => [k, 0])) as Record<ExportProductId, number>;
  const price = { ...volume };
  const byPartner = Object.fromEntries(PARTNER_IDS.map((k) => [k, 0])) as Record<PartnerId, number>;
  for (const d of s.deals?.items ?? []) {
    if (!live(s, d)) continue;
    const c = spec(d);
    if (!c) continue;
    const spot = exportSpot(s, c.product), unit = exportUnitPrice(s, d);
    if (c.hedge) {
      const gain = (d.volume ?? 0) / 365 * deliveryShare(s, d) * (unit / spot - 1);
      price[c.product] += gain;
      byPartner[c.partner] += gain;
      continue;
    }
    const units = contractUnits(s, d, spot), extra = units * EXPORT_ADDITIONALITY * spot, gap = units * (unit - spot);
    volume[c.product] += extra;
    price[c.product] += gap;
    byPartner[c.partner] += extra + gap;
  }
  return { volume, price, byPartner };
}
