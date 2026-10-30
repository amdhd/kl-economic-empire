// Resource sector and state-owned enterprises (model-2 Malaysia campaigns).
// Upstream oil & gas and palm oil are value added outside the seven input–output sectors; their opening
// value added was carved out of the sector calibration, so GDP still starts at the official level.
// PETRONAS (upstream + listed subsidiaries) and Khazanah (listed stakes) pay dividends to the treasury.
// Opening levels of every modelled receipt are subtracted from the residual "other receipts", so total
// opening revenue still equals the official 2027 estimate. See docs/economy-model.md "Resources & SOEs".
import { COMPANIES, COMPANY_BY_ID } from '../data/companies';
import { BASE_TAX, baselineFor, nationalV2 } from '../data/economic-baseline';
import {
  KHAZANAH, PALM_DUTIABLE_SHARE, PALM_DUTY0, PALM_FIXED_SHARE, PALM_SMALLHOLDER_SHARE, PALM_VA_SHARE, PALM_VALUE0, PALM_WAGE_SHARE,
  PETRONAS, PITA_RATE, RESOURCE_EXPORT_SHARE, RUBBER_SMALLHOLDER_SHARE, RUBBER_VA_SHARE, RUBBER_VALUE0, UPSTREAM_FIXED_SHARE, UPSTREAM_VA_SHARE, UPSTREAM_VALUE0,
} from '../data/world';
import type { GameState, KhazanahState, PetronasState, SectorId, SoeState, TickerId } from '../types/game';
import type { Dividend } from './companies';
import { baselineMonth } from './companies';
import { post } from './government';
import { isOpen } from './market-calendar';
import { clamp, news, pushBounded } from './util';

const PER_YEAR = 1 / 365;
const UPSTREAM_VA0 = UPSTREAM_VALUE0 * UPSTREAM_VA_SHARE;
const PALM_VA0 = PALM_VALUE0 * PALM_VA_SHARE;
const PALM_GROSS0 = PALM_VA0 * (1 - PALM_WAGE_SHARE);
const PALM_DUTY_RECEIPTS0 = PALM_DUTY0 * PALM_DUTIABLE_SHARE * PALM_VALUE0;
/** Opening annual palm operating profit before corporate tax. */
const PALM_PROFIT0 = PALM_GROSS0 - PALM_DUTY_RECEIPTS0 - PALM_FIXED_SHARE * PALM_GROSS0;

/** Opening Khazanah dividend income (annual) from its stakes at seed dividends. */
function khazanahIncome0(): number {
  let total = 0;
  for (const [id, stake] of Object.entries(KHAZANAH.stakes) as [TickerId, number][]) {
    const c = COMPANY_BY_ID[id];
    total += baselineMonth(c, 0, BASE_TAX.corporate, 'malaysia').dividends * 12 * stake;
  }
  return total;
}

/** Opening annual receipts from the modelled resource sector and SOEs (removed from the residual). */
export function modelledResourceRevenue0(): number {
  const pita0 = PITA_RATE * (UPSTREAM_VA0 - UPSTREAM_FIXED_SHARE * UPSTREAM_VA0);
  const palmTax0 = BASE_TAX.corporate * PALM_PROFIT0;
  return pita0 + palmTax0 + PALM_DUTY_RECEIPTS0 + PETRONAS.dividend0 + KHAZANAH.payout0 * khazanahIncome0();
}

export function initialSoe(enabled: boolean): SoeState {
  const shares = (stakes: Partial<Record<TickerId, number>>) =>
    Object.fromEntries(Object.entries(stakes).map(([id, st]) => [id, Math.round(COMPANY_BY_ID[id as TickerId].shares * (st as number))])) as Partial<Record<TickerId, number>>;
  const petronas: PetronasState = {
    enabled, cash: PETRONAS.cash0, debt: PETRONAS.debt0, production: 1, capexAnnual: PETRONAS.capex0, capexAvg: PETRONAS.capex0,
    dividendAnnual: PETRONAS.dividend0, shares: enabled ? shares(PETRONAS.stakes) : {},
    mtd: { revenue: 0, upstreamVa: 0, taxableProfit: 0, pita: 0, subsidiaryDividends: 0, capex: 0, dividend: 0, profitAfterTax: 0 },
    history: [],
  };
  const khazanah: KhazanahState = {
    enabled, cash: KHAZANAH.cash0, shares: enabled ? shares(KHAZANAH.stakes) : {}, payout: KHAZANAH.payout0, accrued: 0, mtdIncome: 0, history: [], tx: [],
  };
  return { petronas, khazanah, openingEquity: 0 };
}

export function khazanahNav(s: GameState): number {
  const k = s.soe.khazanah;
  let nav = k.cash;
  for (const [id, n] of Object.entries(k.shares) as [TickerId, number][]) nav += n * s.market.quotes[id].price;
  return nav;
}

/** Book equity of PETRONAS (cash − debt; producing assets held at cost) plus Khazanah at market. */
export function soeEquity(s: GameState): number {
  if (!s.soe.petronas.enabled) return 0;
  return s.soe.petronas.cash - s.soe.petronas.debt + khazanahNav(s);
}

const fxFactor = (s: GameState) => s.external.myrPerUsd / baselineFor(s).myrPerUsd;
/** PETRONAS realised price index in ringgit: 60% oil-linked, 40% LNG (which reprices with a lag to oil). */
export const upstreamPriceIndex = (s: GameState) => (0.6 * s.external.oil + 0.4 * s.world.prices.gas) * fxFactor(s);
export const palmPriceMYR = (s: GameState) => s.world.prices.palm * fxFactor(s);

/** Effective PETRONAS capex: the policy, cut by 30% while cash sits below its floor. */
export const petronasCapex = (p: PetronasState) => (p.cash < PETRONAS.cashFloor ? p.capexAnnual * 0.7 : p.capexAnnual);

/** Palm-sector income reaching households, relative to opening (MYR/day): smallholder profit and estate wages. */
export function palmHouseholdDelta(s: GameState): number {
  if (!nationalV2(s)) return 0;
  const value = PALM_VALUE0 * s.world.palmVolume * palmPriceMYR(s);
  const va = value * PALM_VA_SHARE;
  const duty = s.world.policy.palmExportDuty * PALM_DUTIABLE_SHARE * value;
  const profit = va * (1 - PALM_WAGE_SHARE) - duty - PALM_FIXED_SHARE * PALM_GROSS0 * (s.indicators.cpi / 100);
  const afterTax = (x: number) => x - Math.max(0, x) * s.government.policies.tax.corporate;
  const dProfit = afterTax(profit) - afterTax(PALM_PROFIT0);
  const dWages = va * PALM_WAGE_SHARE - PALM_VA0 * PALM_WAGE_SHARE;
  // Rubber is overwhelmingly a smallholder crop: most of its value-added change reaches households directly.
  const rubberVa = RUBBER_VALUE0 * RUBBER_VA_SHARE * s.world.rubberVolume * s.world.prices.rubber * fxFactor(s);
  const dRubber = RUBBER_SMALLHOLDER_SHARE * (rubberVa - RUBBER_VALUE0 * RUBBER_VA_SHARE);
  return (PALM_SMALLHOLDER_SHARE * dProfit + dWages + dRubber) * PER_YEAR;
}

export interface ResourceDay { gdpNominal: number; gdpReal: number }

/** Daily resource production. Adds PETRONAS capex above/below its opening level to domestic purchases. */
export function dailyResources(s: GameState, purchases: Record<SectorId, number>): ResourceDay {
  if (!nationalV2(s)) return { gdpNominal: 0, gdpReal: 0 };
  const p = s.soe.petronas;
  const cpiF = s.indicators.cpi / 100;
  // Upstream oil & gas.
  const upRevenue = UPSTREAM_VALUE0 * PER_YEAR * p.production * upstreamPriceIndex(s);
  const upVa = upRevenue * UPSTREAM_VA_SHARE;
  p.mtd.revenue += upRevenue;
  p.mtd.upstreamVa += upVa;
  p.mtd.taxableProfit += upVa - UPSTREAM_FIXED_SHARE * UPSTREAM_VA0 * PER_YEAR * cpiF;
  const capex = petronasCapex(p);
  p.mtd.capex += capex * PER_YEAR;
  p.capexAvg += (capex - p.capexAvg) / 365;
  // Natural decline is offset only when trailing capex keeps up with the opening programme.
  p.production *= 1 + (PETRONAS.declineRate * PER_YEAR) * (p.capexAvg / PETRONAS.capex0 - 1);
  const dCapex = (capex - PETRONAS.capex0) * PER_YEAR * PETRONAS.domesticCapexShare;
  purchases.ind += dCapex * 0.5;
  purchases.prop += dCapex * 0.3;
  purchases.tech += dCapex * 0.2;
  // Palm oil: duty is paid daily on dutiable crude exports.
  const palmValue = PALM_VALUE0 * PER_YEAR * s.world.palmVolume * palmPriceMYR(s);
  const palmVa = palmValue * PALM_VA_SHARE;
  const duty = post(s.government, 'commodityDuty', s.world.policy.palmExportDuty * PALM_DUTIABLE_SHARE * palmValue);
  s.world.mtd.palmDuty += duty;
  s.world.mtdPalmProfit += palmVa * (1 - PALM_WAGE_SHARE) - duty - PALM_FIXED_SHARE * PALM_GROSS0 * PER_YEAR * cpiF;
  const rubberValue = RUBBER_VALUE0 * PER_YEAR * s.world.rubberVolume * s.world.prices.rubber * fxFactor(s);
  s.trade.mtdExports += upRevenue * RESOURCE_EXPORT_SHARE.oil + palmValue * RESOURCE_EXPORT_SHARE.palm + rubberValue * RESOURCE_EXPORT_SHARE.rubber;
  const realUp = UPSTREAM_VA0 * PER_YEAR * p.production;
  const realPalm = PALM_VA0 * PER_YEAR * s.world.palmVolume;
  const realRubber = RUBBER_VALUE0 * RUBBER_VA_SHARE * PER_YEAR * s.world.rubberVolume;
  return { gdpNominal: upVa + palmVa + rubberValue * RUBBER_VA_SHARE, gdpReal: realUp + realPalm + realRubber };
}

/** Month close: petroleum tax, palm corporate tax, dividends in and out, PETRONAS cash and debt. */
export function monthCloseSoe(s: GameState, monthKey: number, divs: Dividend[], days: number): void {
  if (!nationalV2(s)) return;
  const gov = s.government;
  const p = s.soe.petronas;
  const k = s.soe.khazanah;
  // Palm plantations pay corporate tax on positive monthly profit.
  post(gov, 'taxCorporate', Math.max(0, s.world.mtdPalmProfit) * gov.policies.tax.corporate);
  s.world.mtdPalmProfit = 0;

  // PETRONAS
  const pita = post(gov, 'petroleumTax', Math.max(0, p.mtd.taxableProfit) * PITA_RATE);
  p.mtd.pita = pita;
  let subsidiary = 0;
  let khazanahIncome = 0;
  for (const d of divs) {
    subsidiary += (p.shares[d.id] ?? 0) * d.dps;
    khazanahIncome += (k.shares[d.id] ?? 0) * d.dps;
  }
  p.mtd.subsidiaryDividends = subsidiary;
  const yearShare = days / 365;
  p.mtd.profitAfterTax = p.mtd.taxableProfit - pita + PETRONAS.downstreamProfit0 * yearShare + subsidiary;
  const dividend = p.dividendAnnual * yearShare;
  p.mtd.dividend = post(gov, 'soeDividend', dividend);
  const interest = (p.cash * s.external.opr - p.debt * (s.external.mgs10 + 0.01)) * yearShare;
  const wasAboveFloor = p.cash >= PETRONAS.cashFloor;
  p.cash += p.mtd.profitAfterTax + PETRONAS.depreciation * yearShare - p.mtd.capex - p.mtd.dividend + interest;
  if (p.cash < 0) {
    p.debt -= p.cash;
    p.cash = 0;
  }
  if (wasAboveFloor && p.cash < PETRONAS.cashFloor) news(s, { kind: 'policy', tone: 'bad', title: 'PETRONAS cuts capital spending', body: 'Cash has fallen below its floor after dividends and capex. Upstream investment is cut by 30%, which slows future production. Simulated.' });
  pushBounded(p.history, { monthKey, revenue: p.mtd.revenue, pita, profitAfterTax: p.mtd.profitAfterTax, dividend: p.mtd.dividend, capex: p.mtd.capex, production: p.production, cash: p.cash, debt: p.debt }, 60);
  p.mtd = { revenue: 0, upstreamVa: 0, taxableProfit: 0, pita: 0, subsidiaryDividends: 0, capex: 0, dividend: 0, profitAfterTax: 0 };

  // Khazanah: pays the government its payout share of dividend income each month.
  const paid = post(gov, 'soeDividend', khazanahIncome * k.payout);
  k.cash += khazanahIncome - paid + k.cash * s.external.opr * yearShare;
  k.mtdIncome = 0;
  pushBounded(k.history, { monthKey, income: khazanahIncome, dividend: paid, nav: khazanahNav(s) }, 60);
}

// ------------------------------------------------------------------ player commands
export interface CommandOutcome { ok: boolean; message: string }

export function setPetronasPolicy(s: GameState, dividendAnnual: number, capexAnnual: number): CommandOutcome {
  const p = s.soe.petronas;
  if (!p.enabled) return { ok: false, message: 'State enterprises are available in new Malaysia campaigns.' };
  if (!Number.isFinite(dividendAnnual) || dividendAnnual < 0 || dividendAnnual > 80e9) return { ok: false, message: 'PETRONAS dividend must be RM0–80bn a year.' };
  if (!Number.isFinite(capexAnnual) || capexAnnual < 10e9 || capexAnnual > 100e9) return { ok: false, message: 'PETRONAS capex must be RM10–100bn a year.' };
  p.dividendAnnual = Math.round(dividendAnnual / 1e8) * 1e8;
  p.capexAnnual = Math.round(capexAnnual / 1e8) * 1e8;
  return { ok: true, message: `PETRONAS: dividend RM${(p.dividendAnnual / 1e9).toFixed(1)}bn/yr, capex RM${(p.capexAnnual / 1e9).toFixed(1)}bn/yr from now.` };
}

export function soeSpecialDividend(s: GameState, entity: 'petronas' | 'khazanah', amount: number): CommandOutcome {
  const e = s.soe[entity];
  if (!e.enabled) return { ok: false, message: 'State enterprises are available in new Malaysia campaigns.' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > e.cash) return { ok: false, message: 'A special dividend must be positive and no larger than the enterprise’s cash.' };
  const paid = post(s.government, 'soeDividend', Math.round(amount / 1e6) * 1e6);
  e.cash -= paid;
  return { ok: true, message: `${entity === 'petronas' ? 'PETRONAS' : 'Khazanah'} paid a RM${(paid / 1e9).toFixed(2)}bn special dividend. Its cash falls by the same amount; public wealth is unchanged.` };
}

export function setKhazanahPayout(s: GameState, payout: number): CommandOutcome {
  if (!s.soe.khazanah.enabled) return { ok: false, message: 'State enterprises are available in new Malaysia campaigns.' };
  if (!Number.isFinite(payout) || payout < 0 || payout > 1) return { ok: false, message: 'Payout must be 0–100% of dividend income.' };
  s.soe.khazanah.payout = Math.round(payout * 100) / 100;
  return { ok: true, message: `Khazanah now pays ${(s.soe.khazanah.payout * 100).toFixed(0)}% of its dividend income to the government.` };
}

/** Khazanah block trade in a Bursa stock: executed at the last price ∓ a block discount, moving sentiment. */
export function khazanahTrade(s: GameState, ticker: TickerId, side: 'buy' | 'sell', fraction: number, atMin: number): CommandOutcome {
  const k = s.soe.khazanah;
  const c = COMPANY_BY_ID[ticker];
  if (!k.enabled) return { ok: false, message: 'State enterprises are available in new Malaysia campaigns.' };
  if (!c || c.exchange !== 'MY') return { ok: false, message: 'Khazanah trades Bursa Malaysia stocks only.' };
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 0.1) return { ok: false, message: 'A block trade covers 0.1–10% of the company’s shares.' };
  if (!isOpen('MY', atMin)) return { ok: false, message: 'Block trades settle during Bursa trading hours.' };
  const st = s.companies[ticker];
  const units = Math.round(st.shares * fraction);
  const held = k.shares[ticker] ?? 0;
  const q = s.market.quotes[ticker];
  const price = q.price * (side === 'sell' ? 1 - KHAZANAH.blockDiscount : 1 + KHAZANAH.blockDiscount);
  const value = units * price;
  if (side === 'sell' && units > held) return { ok: false, message: 'Khazanah cannot sell more than it holds.' };
  if (side === 'buy' && value > k.cash) return { ok: false, message: 'Khazanah lacks the cash for this block.' };
  k.shares[ticker] = held + (side === 'buy' ? units : -units);
  if (!k.shares[ticker]) delete k.shares[ticker];
  k.cash += side === 'buy' ? -value : value;
  // A large block signals state intent: selling weighs on the price, buying supports it, and both fade.
  st.sentiment = clamp(st.sentiment + (side === 'buy' ? 1 : -1) * Math.min(0.08, fraction * 0.8), -1, 1);
  pushBounded(k.tx, { atMin, ticker, side, shares: units, price, value }, 200);
  return { ok: true, message: `Khazanah ${side === 'buy' ? 'bought' : 'sold'} ${(fraction * 100).toFixed(1)}% of ${c.displayName} for RM${(value / 1e9).toFixed(2)}bn at a ${(KHAZANAH.blockDiscount * 100).toFixed(0)}% block ${side === 'buy' ? 'premium' : 'discount'}.` };
}

export function validateSoe(soe: SoeState): void {
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const p = soe?.petronas, k = soe?.khazanah;
  if (!p || !k || typeof p.enabled !== 'boolean' || typeof k.enabled !== 'boolean' || !finite(soe.openingEquity)) throw new Error('Corrupt save: invalid state enterprises');
  if (!(p.cash >= 0) || !(p.debt >= 0) || !(p.production > 0) || !(p.capexAnnual >= 10e9 && p.capexAnnual <= 100e9) || !(p.dividendAnnual >= 0 && p.dividendAnnual <= 80e9) || !finite(p.capexAvg)) throw new Error('Corrupt save: invalid PETRONAS state');
  if (!(k.cash >= 0) || !(k.payout >= 0 && k.payout <= 1) || !Array.isArray(k.tx) || !Array.isArray(p.history)) throw new Error('Corrupt save: invalid Khazanah state');
  for (const shares of [p.shares, k.shares]) for (const [id, n] of Object.entries(shares)) {
    if (!COMPANIES.some((c) => c.id === id) || !Number.isSafeInteger(n) || (n as number) <= 0) throw new Error('Corrupt save: invalid SOE holding');
  }
}
