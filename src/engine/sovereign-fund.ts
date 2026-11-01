import { privateValue } from './private-enterprises';
import { escrowValue } from './deals';
// Government sovereign wealth fund. Cash is integer minor units (sen / US cents).
// Trades exchange cash for shares at the execution price; only fees, spread and impact reduce NAV.
// Closed-market rule (D-008): orders placed while the exchange is closed are QUEUED as market
// orders for the next open hourly tick and expire after 7 days if not filled; they can be cancelled.
import { COMPANY_BY_ID, currencyOf } from '../data/companies';
import type { Currency, Exchange, GameState, Order, Position, TickerId } from '../types/game';
import type { Dividend } from './companies';
import { post, treasuryMYR } from './government';
import { isOpen } from './market-calendar';
import { avgDailyValue } from './stock-market';
import { assertSafeMinor, clamp, news, pushBounded, toMinor } from './util';
import { demandFor } from '../data/economic-baseline';
import { boomOn } from '../data/boom';

export const FEE_RATE: Record<Exchange, number> = { MY: 0.002, US: 0.0003 }; // brokerage + clearing + stamp, simplified
export const HALF_SPREAD: Record<Exchange, number> = { MY: 0.001, US: 0.0002 };
export const IMPACT_COEF = 0.1; // × sqrt(order value / avg daily value)
export const FX_SPREAD = 0.0025;
export const LOT: Record<Exchange, number> = { MY: 100, US: 1 };
export const MAX_POSITION_PCT = 0.2;
export const MAX_ADV_SHARE = 2;
/** D-124: Boom mode has no per-session volume limit; price impact is capped instead. */
export const BOOM_MAX_IMPACT = 0.15;
export const advShareLimit = (s: Pick<GameState, 'mode'>) => (boomOn(s) ? Infinity : MAX_ADV_SHARE);
export const US_WITHHOLDING = 0.15;
export const ORDER_TTL_MIN = 7 * 1440;
const TX_LIMIT = 400;

export interface FillQuote {
  mid: number;
  px: number;
  gross: number;
  fees: number;
  total: number; // cash out (buy) or in (sell), listing currency, major units
  impact: number;
  currency: Currency;
  totalMYR: number;
}

export function quoteFill(s: GameState, id: TickerId, side: 'buy' | 'sell', units: number): FillQuote {
  const c = COMPANY_BY_ID[id];
  const mid = s.market.quotes[id].price;
  const adv = avgDailyValue(s, id);
  // Impact grows with the fund's cumulative trading in this name today, so splitting an order
  // into pieces does not avoid it.
  const raw = IMPACT_COEF * Math.sqrt((s.market.quotes[id].fundDayValue + mid * units) / Math.max(adv, 1));
  const impact = boomOn(s) ? Math.min(raw, BOOM_MAX_IMPACT) : raw;
  const slip = HALF_SPREAD[c.exchange] + impact;
  const px = mid * (side === 'buy' ? 1 + slip : 1 - slip);
  const gross = px * units;
  const fees = gross * FEE_RATE[c.exchange];
  const total = side === 'buy' ? gross + fees : gross - fees;
  const fx = c.exchange === 'US' ? s.external.myrPerUsd : 1;
  return { mid, px, gross, fees, total, impact, currency: currencyOf(id), totalMYR: total * fx };
}

export function navMYR(s: GameState): number {
  const f = s.fund;
  const fx = s.external.myrPerUsd;
  let nav = f.myrCash / 100 + (f.usdCash / 100) * fx;
  for (const [id, p] of Object.entries(f.positions) as [TickerId, Position][]) {
    nav += p.units * s.market.quotes[id].price * (id.startsWith('US:') ? fx : 1);
  }
  return nav + (escrowValue(s, 'fund')+privateValue(s,'fund')) / 100;
}

export function positionValueMYR(s: GameState, id: TickerId): number {
  const p = s.fund.positions[id];
  if (!p) return 0;
  return p.units * s.market.quotes[id].price * (id.startsWith('US:') ? s.external.myrPerUsd : 1);
}

const queuedSellUnits = (s: GameState, id: TickerId, except?: number) =>
  s.fund.orders.filter((o) => o.ticker === id && o.side === 'sell' && o.status === 'queued' && o.id !== except).reduce((a, o) => a + o.units, 0);

/** Returns a human-readable rejection reason, or null if the order can fill now. */
export function validateOrder(s: GameState, id: TickerId, side: 'buy' | 'sell', units: number, orderId?: number): string | null {
  const c = COMPANY_BY_ID[id];
  if (!c) return 'Unknown security';
  if (side !== 'buy' && side !== 'sell') return 'Invalid order side';
  if (!Number.isSafeInteger(units) || units <= 0) return 'Quantity must be a positive whole number';
  if (units % LOT[c.exchange] !== 0) return `Bursa board lot is ${LOT[c.exchange]} shares`;
  const q = quoteFill(s, id, side, units);
  if (![q.total, q.gross, q.fees].every((n) => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)))) return 'Unsafe order value';
  const adv = avgDailyValue(s, id);
  const today = s.market.quotes[id].fundDayValue;
  if (today + q.mid * units > advShareLimit(s) * adv) return `Exceeds today’s liquidity: the fund may trade at most ${MAX_ADV_SHARE * 100}% of average daily value per stock per session (${((today + q.mid * units) / adv * 100).toFixed(0)}% requested incl. earlier fills) — spread it over several sessions`;
  const f = s.fund;
  if (side === 'buy') {
    const cash = c.exchange === 'US' ? f.usdCash : f.myrCash;
    if (toMinor(q.total) > cash) return `Insufficient ${q.currency} cash (need ${q.currency} ${(q.total / 1e6).toFixed(2)}m)${c.exchange === 'US' ? ' — convert MYR to USD first' : ''}`;
    const after = positionValueMYR(s, id) + q.gross * (c.exchange === 'US' ? s.external.myrPerUsd : 1);
    const nav = navMYR(s) - (q.totalMYR - q.gross * (c.exchange === 'US' ? s.external.myrPerUsd : 1));
    if (after > MAX_POSITION_PCT * nav) return `Concentration limit: position would be ${((after / nav) * 100).toFixed(1)}% of NAV (max ${MAX_POSITION_PCT * 100}%)`;
  } else {
    const held = f.positions[id]?.units ?? 0;
    if (units > held - queuedSellUnits(s, id, orderId)) return `Cannot sell more than the fund holds (${held - queuedSellUnits(s, id, orderId)} available)`;
  }
  return null;
}

function addTx(s: GameState, type: 'buy' | 'sell' | 'dividend' | 'fx' | 'injection' | 'withdrawal', currency: Currency, amountMinor: number, note: string, extra: { ticker?: TickerId; units?: number; price?: number; fx?: number; counterCurrency?: Currency; counterAmountMinor?: number; realizedMinor?: number; realizedMYR?: number } = {}) {
  pushBounded(s.fund.tx, { id: s.fund.nextId++, atMin: s.clock.hour * 60, type, currency, amountMinor, note, ...extra }, TX_LIMIT);
}

/** Place an order. Fills immediately if the exchange is open at the current game minute. */
export function placeOrder(s: GameState, id: TickerId, side: 'buy' | 'sell', units: number, atMin: number): Order {
  const c = COMPANY_BY_ID[id];
  const order: Order = { id: s.fund.nextId++, ticker: id, side, units: Number.isSafeInteger(units) ? units : 0, status: 'queued', createdMin: atMin, expiresMin: atMin + ORDER_TTL_MIN };
  s.fund.orders.push(order);
  if (s.fund.orders.length > 200) s.fund.orders = s.fund.orders.filter((o, i, arr) => o.status === 'queued' || i >= arr.length - 150);
  // Static checks that do not depend on market state reject immediately.
  const reason = validateOrder(s, id, side, units, order.id);
  if (reason && !(c && reason.startsWith('Insufficient') && !isOpen(c.exchange, atMin))) {
    order.status = 'rejected';
    order.reason = reason;
    return order;
  }
  if (isOpen(c.exchange, atMin)) executeOrder(s, order, atMin);
  return order;
}

export function executeOrder(s: GameState, order: Order, atMin: number): void {
  if (order.status !== 'queued' || atMin < order.createdMin) return;
  if (atMin >= order.expiresMin) { order.status = 'expired'; order.reason = 'Not filled within 7 days'; return; }
  const company = COMPANY_BY_ID[order.ticker];
  if (company && !isOpen(company.exchange, atMin)) return;
  const reason = validateOrder(s, order.ticker, order.side, order.units, order.id);
  if (reason) {
    order.status = 'rejected';
    order.reason = reason;
    news(s, { kind: 'fund', tone: 'bad', title: `Order rejected: ${order.side} ${order.units.toLocaleString()} ${COMPANY_BY_ID[order.ticker]?.displayName ?? order.ticker}`, body: reason });
    return;
  }
  const c = COMPANY_BY_ID[order.ticker];
  const q = quoteFill(s, order.ticker, order.side, order.units);
  const f = s.fund;
  const fx = c.exchange === 'US' ? s.external.myrPerUsd : 1;
  const totalMinor = toMinor(q.total);
  const pos: Position = f.positions[order.ticker] ?? { units: 0, costMinor: 0, costMYR: 0, realizedMinor: 0, dividendsMinor: 0 };
  const cashKey = c.exchange === 'US' ? 'usdCash' : 'myrCash';
  assertSafeMinor(f[cashKey] + (order.side === 'buy' ? -totalMinor : totalMinor));
  if (order.side === 'buy') {
    assertSafeMinor(pos.costMinor + totalMinor);
    assertSafeMinor(pos.costMYR + toMinor(totalMinor / 100 * fx));
    assertSafeMinor(pos.units + order.units);
    if (c.exchange === 'US') f.usdCash -= totalMinor;
    else f.myrCash -= totalMinor;
    pos.units += order.units;
    pos.costMinor += totalMinor;
    pos.costMYR += toMinor(totalMinor / 100 * fx);
    addTx(s, 'buy', q.currency, -totalMinor, `Bought ${order.units.toLocaleString()} @ ${q.px.toFixed(3)} (fees ${q.fees.toFixed(2)})`, { ticker: order.ticker, units: order.units, price: q.px, fx });
  } else {
    const costPortion = Math.round(pos.costMinor * (order.units / pos.units));
    const costMyrPortion = Math.round(pos.costMYR * (order.units / pos.units));
    const realized = totalMinor - costPortion;
    const realizedMYR = toMinor(totalMinor / 100 * fx) - costMyrPortion;
    assertSafeMinor(f.realized[q.currency] + realized);
    assertSafeMinor(f.realizedMYR + realizedMYR);
    if (c.exchange === 'US') f.usdCash += totalMinor;
    else f.myrCash += totalMinor;
    f.realized[q.currency] += realized;
    f.realizedMYR += realizedMYR;
    assertSafeMinor(pos.realizedMinor + realized);
    pos.realizedMinor += realized;
    pos.costMinor -= costPortion;
    pos.costMYR -= costMyrPortion;
    pos.units -= order.units;
    addTx(s, 'sell', q.currency, totalMinor, `Sold ${order.units.toLocaleString()} @ ${q.px.toFixed(3)} (fees ${q.fees.toFixed(2)})`, { ticker: order.ticker, units: order.units, price: q.px, fx, realizedMinor: realized, realizedMYR });
  }
  if (pos.units > 0) f.positions[order.ticker] = pos;
  else delete f.positions[order.ticker];
  f.feesPaidMYR += q.fees * fx;
  s.market.quotes[order.ticker].fundDayValue += q.gross;
  // Model 3 (D-058): part of the price impact persists as company sentiment (valuation premium), decaying 5%/day.
  s.companies[order.ticker].sentiment += (order.side === 'buy' ? 1 : -1) * demandFor(s).fundImpactPersistence * q.impact;
  s.fund.tx.at(-1)!.atMin = atMin;
  order.status = 'filled';
  order.filledMin = atMin;
  order.fillPrice = q.px;
  order.feesMinor = toMinor(q.fees);
}

/** At an open tick, fill queued orders for that exchange in placement order; expire stale ones. */
export function processQueuedOrders(s: GameState, ex: Exchange, atMin: number): void {
  for (const o of s.fund.orders) {
    if (o.status !== 'queued' || COMPANY_BY_ID[o.ticker].exchange !== ex) continue;
    if (atMin >= o.expiresMin) {
      o.status = 'expired';
      o.reason = 'Not filled within 7 days';
      continue;
    }
    executeOrder(s, o, atMin);
  }
}

export function expireOrders(s: GameState, atMin: number): void {
  for (const o of s.fund.orders) if (o.status === 'queued' && atMin >= o.expiresMin) {
    o.status = 'expired';
    o.reason = 'Not filled within 7 days';
  }
}

export function cancelOrder(s: GameState, orderId: number): boolean {
  const o = s.fund.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'queued') return false;
  o.status = 'cancelled';
  return true;
}

/** Convert between the fund's MYR and USD cash at the current rate with an explicit spread. */
/** Model 3 (D-058): a fund conversion is a capital flow. Buying `usdMinor` (negative = selling USD) moves the same
 * bounded, decaying ringgit pressure as a central-bank operation, from the next daily fixing. */
function fundFxPressure(s: GameState, usdMinor: number): void {
  const k = demandFor(s).fundFxPressure;
  if (k > 0) s.centralBank.pressure = clamp(s.centralBank.pressure + k * (usdMinor / 100 / 1e9), -0.08, 0.08);
}

export function convertFx(s: GameState, from: Currency, amountMinor: number): string | null {
  const f = s.fund;
  const fx = s.external.myrPerUsd;
  if (from !== 'MYR' && from !== 'USD') return 'Unknown currency';
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 'Amount must be a positive safe minor-unit integer';
  if (!Number.isFinite(fx) || fx <= 0) return 'Invalid FX rate';
  if (from === 'MYR') {
    if (amountMinor > f.myrCash) return 'Insufficient MYR cash';
    const usd = Math.floor(amountMinor / (fx * (1 + FX_SPREAD)));
    if (usd < 1 || !Number.isSafeInteger(f.usdCash + usd)) return 'Conversion is too small or unsafe';
    f.myrCash -= amountMinor;
    f.usdCash += usd;
    f.feesPaidMYR += (amountMinor / 100) * (FX_SPREAD / (1 + FX_SPREAD));
    fundFxPressure(s, usd);
    addTx(s, 'fx', 'MYR', -amountMinor, `Converted to $${(usd / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} @ ${(fx * (1 + FX_SPREAD)).toFixed(4)}`, { fx, counterCurrency: 'USD', counterAmountMinor: usd });
  } else {
    if (amountMinor > f.usdCash) return 'Insufficient USD cash';
    const myr = Math.floor(amountMinor * fx * (1 - FX_SPREAD));
    if (myr < 1 || !Number.isSafeInteger(f.myrCash + myr)) return 'Conversion is too small or unsafe';
    f.usdCash -= amountMinor;
    f.myrCash += myr;
    f.feesPaidMYR += (amountMinor / 100) * fx * FX_SPREAD;
    fundFxPressure(s, -amountMinor);
    addTx(s, 'fx', 'USD', -amountMinor, `Converted to RM ${(myr / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} @ ${(fx * (1 - FX_SPREAD)).toFixed(4)}`, { fx, counterCurrency: 'MYR', counterAmountMinor: myr });
  }
  return null;
}

export function receiveDividends(s: GameState, divs: Dividend[]): void {
  const f = s.fund;
  let totalMYR = 0;
  for (const d of divs) {
    const p = f.positions[d.id];
    if (!p) continue;
    const us = d.id.startsWith('US:');
    const net = p.units * d.dps * (us ? 1 - US_WITHHOLDING : 1);
    const minor = toMinor(net);
    if (minor <= 0) continue;
    assertSafeMinor((us ? f.usdCash : f.myrCash) + minor);
    assertSafeMinor(f.dividends[us ? 'USD' : 'MYR'] + minor);
    f.dividends[us ? 'USD' : 'MYR'] += minor;
    if (us) f.usdCash += minor;
    else f.myrCash += minor;
    assertSafeMinor(p.dividendsMinor + minor);
    p.dividendsMinor += minor;
    const myr = (minor / 100) * (us ? s.external.myrPerUsd : 1);
    totalMYR += myr;
    f.pendingDividendTransfer += toMinor(myr * f.dividendTransferPct);
    addTx(s, 'dividend', us ? 'USD' : 'MYR', minor, `Dividend ${d.dps.toFixed(4)}/share${us ? ' (15% withholding)' : ''}`, { ticker: d.id, units: p.units });
  }
  if (totalMYR > 0) news(s, { kind: 'fund', tone: 'good', title: `SWF dividends received: RM ${(totalMYR / 1e6).toFixed(1)}m`, body: 'Quarterly dividends credited to fund cash.' });
}

/** Treasury → fund. A transfer between public accounts: public net worth unchanged. */
export function injectFund(s: GameState, amountMYR: number): string | null {
  if (!Number.isFinite(amountMYR) || amountMYR <= 0 || !Number.isSafeInteger(Math.round(amountMYR * 100)) || Math.round(amountMYR * 100) < 1) return 'Amount must be positive and safe';
  if (amountMYR > treasuryMYR(s.government)) return 'Treasury cash is insufficient';
  assertSafeMinor(s.fund.myrCash + toMinor(amountMYR));
  const posted = post(s.government, 'swfContribution', amountMYR);
  s.fund.myrCash += toMinor(posted);
  s.fund.totalInjectedMYR += posted;
  addTx(s, 'injection', 'MYR', toMinor(posted), 'Capital injection from treasury');
  return null;
}

/** Fund → treasury, from MYR cash only. */
export function withdrawFund(s: GameState, amountMYR: number): string | null {
  if (!Number.isFinite(amountMYR) || amountMYR <= 0 || !Number.isSafeInteger(Math.round(amountMYR * 100)) || Math.round(amountMYR * 100) < 1) return 'Amount must be positive and safe';
  if (toMinor(amountMYR) > s.fund.myrCash) return 'Fund MYR cash is insufficient — sell holdings or convert USD first';
  assertSafeMinor(s.government.treasury + toMinor(amountMYR));
  const posted = post(s.government, 'swfTransferIn', amountMYR);
  s.fund.myrCash -= toMinor(posted);
  s.fund.totalWithdrawnMYR += posted;
  addTx(s, 'withdrawal', 'MYR', -toMinor(posted), 'Distribution to treasury');
  return null;
}

/** Month close: transfer the policy share of dividends to the treasury. */
export function monthCloseFund(s: GameState): void {
  const f = s.fund;
  const amt = Math.min(f.pendingDividendTransfer, f.myrCash);
  f.pendingDividendTransfer -= amt;
  if (amt > 0) withdrawFund(s, amt / 100);
}

// ------------------------------------------------------------------ target allocation
export interface RebalanceLeg {
  ticker: TickerId;
  side: 'buy' | 'sell';
  units: number;
  valueMYR: number;
}
export interface RebalancePlan {
  legs: RebalanceLeg[];
  fxMinorMYR: number; // MYR sen to convert into USD before US buys
  estCostsMYR: number;
}

/**
 * Plan orders that move the fund toward target MY/US equity weights (rest stays cash).
 * Buys are cap-weighted across that exchange's 20 names, sells are pro-rata across holdings;
 * every leg respects lots, the 20% concentration limit and the per-order liquidity limit.
 */
export function planRebalance(s: GameState, targetMY: number, targetUS: number): RebalancePlan {
  const nav = navMYR(s);
  const fxr = s.external.myrPerUsd;
  const legs: RebalanceLeg[] = [];
  let usBuyUSD = 0;
  let costs = 0;
  for (const ex of ['MY', 'US'] as Exchange[]) {
    const fxEx = ex === 'US' ? fxr : 1;
    const names = Object.values(COMPANY_BY_ID).filter((c) => c.exchange === ex);
    const cur = names.reduce((a, c) => a + positionValueMYR(s, c.id), 0);
    const diff = (ex === 'MY' ? targetMY : targetUS) * nav - cur;
    if (Math.abs(diff) < 0.005 * nav) continue;
    if (diff > 0) {
      const caps = names.map((c) => s.market.quotes[c.id].price * s.companies[c.id].shares);
      const total = caps.reduce((a, b) => a + b, 0);
      names.forEach((c, i) => {
        const px = s.market.quotes[c.id].price;
        const room = MAX_POSITION_PCT * 0.97 * nav - positionValueMYR(s, c.id);
        const liq = (advShareLimit(s) * 0.95 * avgDailyValue(s, c.id) - s.market.quotes[c.id].fundDayValue) * fxEx;
        const alloc = Math.max(0, Math.min((diff * caps[i]) / total, room, liq));
        const units = Math.floor(alloc / (px * fxEx) / LOT[ex]) * LOT[ex];
        if (units <= 0) return;
        const q = quoteFill(s, c.id, 'buy', units);
        legs.push({ ticker: c.id, side: 'buy', units, valueMYR: q.totalMYR });
        costs += (q.total - q.mid * units) * fxEx;
        if (ex === 'US') usBuyUSD += q.total;
      });
    } else {
      const frac = Math.min(1, -diff / cur);
      for (const c of names) {
        const p = s.fund.positions[c.id];
        if (!p) continue;
        const units = frac >= 0.999 ? p.units : Math.floor((p.units * frac) / LOT[ex]) * LOT[ex];
        if (units <= 0) continue;
        const q = quoteFill(s, c.id, 'sell', units);
        legs.push({ ticker: c.id, side: 'sell', units, valueMYR: q.totalMYR });
        costs += (q.mid * units - q.total) * fxEx;
      }
    }
  }
  const usdShort = Math.max(0, usBuyUSD - s.fund.usdCash / 100);
  const fxMinorMYR = Math.min(s.fund.myrCash, Math.ceil(usdShort * fxr * (1 + FX_SPREAD) * 1.002 * 100));
  costs += (fxMinorMYR / 100) * FX_SPREAD;
  return { legs, fxMinorMYR, estCostsMYR: costs };
}

/** Execute a plan: sells first, then FX, then buys (queued if that exchange is closed). */
export function executeRebalance(s: GameState, targetMY: number, targetUS: number, atMin: number): { placed: number; rejected: number } {
  const plan = planRebalance(s, targetMY, targetUS);
  let placed = 0;
  let rejected = 0;
  const run = (side: 'buy' | 'sell') => {
    for (const l of plan.legs.filter((x) => x.side === side)) {
      const o = placeOrder(s, l.ticker, l.side, l.units, atMin);
      if (o.status === 'rejected') rejected++;
      else placed++;
    }
  };
  run('sell');
  if (plan.fxMinorMYR > 0) convertFx(s, 'MYR', plan.fxMinorMYR);
  run('buy');
  return { placed, rejected };
}
