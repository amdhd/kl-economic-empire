// Fictional price discovery: price mean-reverts toward a fundamental value (forward earnings ×
// sector P/E × rate & risk multipliers × sentiment), plus seeded market, sector and idiosyncratic
// shocks. Prices only move while that exchange's session is open.
import { COMPANIES, COMPANY_BY_ID } from '../data/companies';
import { BASELINE } from '../data/economic-baseline';
import type { Bar, Exchange, GameState, IndexState, MarketState, QuoteState, TickerId } from '../types/game';
import { baseEps, ttmNetIncome } from './companies';
import { isOpen, localParts, sessionDateKey } from './market-calendar';
import { rand, randnClipped } from './rng';
import { clamp, pushBounded } from './util';

const ERP = 0.05;
const HOURS_PER_SESSION = 6;
const ADJUST = 0.012; // hourly pull toward fundamental (half-life ≈ 9.5 trading days)
const MARKET_VOL: Record<Exchange, number> = { MY: 0.11, US: 0.15 };
const SECTOR_VOL = 0.1;
export const TURNOVER: Record<Exchange, number> = { MY: 0.0015, US: 0.006 }; // daily traded value / market cap
const MAX_HOURLY_MOVE = 0.06;
const DAILY_BARS = 800;
const HOURLY_BARS = 96;

export function fundamentalValue(s: GameState, id: TickerId): number {
  const c = COMPANY_BY_ID[id];
  const st = s.companies[id];
  const klTax = s.government.policies.tax.corporate;
  const ttm = ttmNetIncome(st);
  const recent = st.history.slice(-3).reduce((a, h) => a + h.netIncome, 0) * 4;
  const eps0 = baseEps(c, klTax);
  const eps = Math.max((0.5 * ttm + 0.5 * recent) / st.shares, 0.15 * Math.abs(eps0));
  const r = c.exchange === 'MY' ? s.external.mgs10 : s.external.ust10;
  const r0 = c.exchange === 'MY' ? BASELINE.mgs10 : BASELINE.ust10;
  const rateMult = Math.pow((r0 + ERP) / (r + ERP), c.rateSensitivity * 1.5);
  const riskMult = Math.exp(0.6 * (s.external.riskAppetite - 0.5));
  return eps * c.basePE * rateMult * riskMult * Math.exp(st.sentiment);
}

export const marketCap = (s: GameState, id: TickerId) => s.market.quotes[id].price * s.companies[id].shares;
export const avgDailyValue = (s: GameState, id: TickerId) => marketCap(s, id) * TURNOVER[COMPANY_BY_ID[id].exchange];

function indexValue(s: GameState, ex: Exchange): number {
  let cap = 0;
  for (const c of COMPANIES) if (c.exchange === ex) cap += marketCap(s, c.id);
  return cap / s.market.indices[ex].divisor;
}

export function initialMarket(s: GameState): MarketState {
  const quotes = {} as Record<TickerId, QuoteState>;
  const m: MarketState = {
    quotes,
    indices: { MY: { value: 1000, prevClose: 1000, divisor: 1, daily: [] }, US: { value: 1000, prevClose: 1000, divisor: 1, daily: [] } },
    sessionOpen: { MY: false, US: false },
    sessionDay: { MY: 0, US: 0 },
    closedDay: { MY: 0, US: 0 },
    sectorShock: {},
  };
  s.market = m;
  for (const c of COMPANIES) {
    const fv = fundamentalValue(s, c.id);
    // Fictional starting price: fundamental ± up to 12%, rounded to a tick.
    const raw = fv * (0.88 + 0.24 * rand(s.rng));
    const price = roundTick(raw, c.exchange);
    quotes[c.id] = { price, prevClose: price, open: price, dayHigh: price, dayLow: price, dayVolume: 0, fundamental: fv, daily: [], hourly: [] };
  }
  for (const ex of ['MY', 'US'] as Exchange[]) {
    let cap = 0;
    for (const c of COMPANIES) if (c.exchange === ex) cap += quotes[c.id].price * c.shares;
    m.indices[ex].divisor = cap / 1000;
  }
  return m;
}

export function roundTick(p: number, ex: Exchange): number {
  if (ex === 'US') return Math.max(0.01, Math.round(p * 100) / 100);
  // Bursa-style tick sizes (simplified)
  const tick = p < 1 ? 0.005 : p < 10 ? 0.01 : p < 100 ? 0.02 : 0.1;
  return Math.max(0.005, Math.round(p / tick) * tick);
}

/** Pre-generate synthetic history (fictional) so charts are not empty at game start. */
export function seedHistory(s: GameState, startDay: number): void {
  for (const c of COMPANIES) {
    const q = s.market.quotes[c.id];
    const sigma = c.vol / Math.sqrt(252);
    let p = q.price;
    const bars: Bar[] = [];
    // walk backwards 180 trading days, then reverse
    for (let k = 1; k <= 180; k++) {
      const r = sigma * randnClipped(s.rng, 3);
      const prev = p / Math.exp(r);
      const hi = Math.max(p, prev) * (1 + Math.abs(sigma * 0.4 * rand(s.rng)));
      const lo = Math.min(p, prev) * (1 - Math.abs(sigma * 0.4 * rand(s.rng)));
      bars.push({ t: startDay - Math.round(k * 7 / 5), o: prev, h: hi, l: lo, c: p, v: avgDailyValue(s, c.id) * (0.6 + 0.8 * rand(s.rng)) });
      p = prev;
    }
    q.daily = bars.reverse();
  }
  for (const ex of ['MY', 'US'] as Exchange[]) {
    const idx = s.market.indices[ex];
    const n = s.market.quotes[COMPANIES.find((c) => c.exchange === ex)!.id].daily.length;
    for (let k = 0; k < n; k++) {
      let cap = 0;
      let t = 0;
      for (const c of COMPANIES) {
        if (c.exchange !== ex) continue;
        const b = s.market.quotes[c.id].daily[k];
        cap += b.c * c.shares;
        t = b.t;
      }
      idx.daily.push({ t, v: cap / idx.divisor });
    }
  }
}

function localDayNumber(key: number): number {
  const y = Math.floor(key / 10000);
  const m = Math.floor((key % 10000) / 100);
  const d = key % 100;
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Hourly market step for both exchanges at the current tick time. */
export function hourlyMarket(s: GameState, epochMin: number): void {
  for (const ex of ['MY', 'US'] as Exchange[]) {
    const open = isOpen(ex, epochMin);
    const key = sessionDateKey(ex, epochMin);
    const m = s.market;
    // Finalise yesterday's/this session's bar once the session is over.
    if (!open && m.sessionDay[ex] && m.closedDay[ex] !== m.sessionDay[ex] && (key !== m.sessionDay[ex] || afterClose(ex, epochMin))) {
      finaliseSession(s, ex);
    }
    m.sessionOpen[ex] = open;
    if (!open) continue;
    if (m.sessionDay[ex] !== key) startSession(s, ex, key);
    stepPrices(s, ex, epochMin);
  }
}

/** True once the local clock is past the exchange's closing time. */
function afterClose(ex: Exchange, epochMin: number): boolean {
  const p = localParts(ex, epochMin);
  const m = p.hour * 60 + p.minute;
  return m >= (ex === 'MY' ? 17 * 60 : 16 * 60);
}

function startSession(s: GameState, ex: Exchange, key: number): void {
  s.market.sessionDay[ex] = key;
  for (const c of COMPANIES) {
    if (c.exchange !== ex) continue;
    const q = s.market.quotes[c.id];
    q.prevClose = q.price;
    q.open = q.price;
    q.dayHigh = q.price;
    q.dayLow = q.price;
    q.dayVolume = 0;
  }
  s.market.indices[ex].prevClose = s.market.indices[ex].value;
}

function finaliseSession(s: GameState, ex: Exchange): void {
  const day = localDayNumber(s.market.sessionDay[ex]);
  for (const c of COMPANIES) {
    if (c.exchange !== ex) continue;
    const q = s.market.quotes[c.id];
    pushBounded(q.daily, { t: day, o: q.open, h: q.dayHigh, l: q.dayLow, c: q.price, v: q.dayVolume }, DAILY_BARS);
  }
  const idx: IndexState = s.market.indices[ex];
  pushBounded(idx.daily, { t: day, v: idx.value }, DAILY_BARS);
  s.market.closedDay[ex] = s.market.sessionDay[ex];
}

function stepPrices(s: GameState, ex: Exchange, epochMin: number): void {
  const h = Math.sqrt(252 * HOURS_PER_SESSION);
  const zMkt = randnClipped(s.rng, 3.5) * (0.6 + 0.8 * (1 - s.external.riskAppetite));
  const sectorZ: Record<string, number> = {};
  for (const c of COMPANIES) {
    if (c.exchange !== ex) continue;
    const q = s.market.quotes[c.id];
    if (sectorZ[c.driver] === undefined) sectorZ[c.driver] = randnClipped(s.rng, 3.5);
    const fv = fundamentalValue(s, c.id);
    q.fundamental = fv;
    const beta = 0.7 + 0.4 * Math.min(c.vol / 0.25, 2);
    const drift = ADJUST * Math.log(fv / q.price);
    const shock = (MARKET_VOL[ex] / h) * beta * zMkt + (SECTOR_VOL / h) * sectorZ[c.driver] + (c.vol / h) * 0.8 * randnClipped(s.rng, 4);
    const r = clamp(drift + shock, -MAX_HOURLY_MOVE, MAX_HOURLY_MOVE);
    const prev = q.price;
    const next = roundTick(prev * Math.exp(r), ex);
    q.price = Number.isFinite(next) && next > 0 ? next : prev;
    q.dayHigh = Math.max(q.dayHigh, q.price);
    q.dayLow = Math.min(q.dayLow, q.price);
    const val = (avgDailyValue(s, c.id) / HOURS_PER_SESSION) * (0.5 + rand(s.rng) + 2 * Math.abs(r) / (c.vol / h));
    q.dayVolume += val;
    pushBounded(q.hourly, { t: Math.floor(epochMin / 60), o: prev, h: Math.max(prev, q.price), l: Math.min(prev, q.price), c: q.price, v: val }, HOURLY_BARS);
  }
  s.market.indices[ex].value = indexValue(s, ex);
}

