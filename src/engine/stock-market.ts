import { baselineFor } from '../data/economic-baseline';
// Fictional price discovery: price mean-reverts toward a fundamental value (forward earnings ×
// sector P/E × rate & risk multipliers × sentiment), plus seeded market, sector and idiosyncratic
// shocks. Prices only move while that exchange's session is open.
import { COMPANIES, COMPANY_BY_ID } from '../data/companies';
import type { Bar, Exchange, GameState, IndexState, MarketState, QuoteState, RngState, TickerId } from '../types/game';
import { baseEps, initialCompany, ttmNetIncome } from './companies';
import { isOpen, localDayOf, localParts, previousTradingDays, sessionDateKey, sessionTickMinutes } from './market-calendar';
import { rand, randnClipped, seedRng } from './rng';
import { daysInMonth, klDayStartMin, klParts } from './time';
import { clamp, pushBounded } from './util';

const ERP = 0.05;
const HOURS_PER_SESSION = 6;
const ADJUST = 0.012; // hourly pull toward fundamental (half-life ≈ 9.5 trading days)
const MARKET_VOL: Record<Exchange, number> = { MY: 0.11, US: 0.15 };
const SECTOR_VOL = 0.1;
export const TURNOVER: Record<Exchange, number> = { MY: 0.0015, US: 0.006 }; // daily traded value / market cap
const MAX_HOURLY_MOVE = 0.06;
export const DAILY_BARS = 800;
export const HOURLY_BARS = 120; // ≈ 20 sessions

export function fundamentalValue(s: GameState, id: TickerId): number {
  const BASELINE = baselineFor(s);
  const c = COMPANY_BY_ID[id];
  const st = s.companies[id];
  const klTax = s.government.policies.tax.corporate;
  const ttm = ttmNetIncome(st);
  const recent = st.history.slice(-3).reduce((a, h) => a + h.netIncome, 0) * 4;
  const eps0 = baseEps(c, klTax, s.baseline.profile);
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
    quotes[c.id] = { price, prevClose: price, open: price, dayHigh: price, dayLow: price, dayVolume: 0, fundDayValue: 0, fundamental: fv, daily: [], hourly: [] };
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

/** Trading days of synthetic (fictional) pre-game daily history per security. */
export const SEED_DAYS = 180;
/** Most recent pre-game sessions that also receive synthetic hourly bars. */
export const SEED_HOURLY_SESSIONS = 10;

/**
 * Pre-generate synthetic, FICTIONAL history so charts are not empty at game start. Bars fall only
 * on real trading dates of each exchange calendar (weekends/holidays skipped), the last daily
 * close equals the opening game price, and hourly bars sit on the session's whole-hour ticks and
 * are a Brownian bridge between that day's open and close. All draws come from `s.rng`.
 */
export function seedHistory(s: GameState, startDay: number): void {
  const startMin = klDayStartMin(startDay) + 8 * 60;
  for (const ex of ['MY', 'US'] as Exchange[]) {
    const days = previousTradingDays(ex, localDayOf(ex, startMin) + 1, SEED_DAYS);
    const ticks = days.slice(-SEED_HOURLY_SESSIONS).map((d) => sessionTickMinutes(ex, d));
    for (const c of COMPANIES) if (c.exchange === ex) seedQuoteHistory(s, c.id, days, ticks, s.rng);
    const idx = s.market.indices[ex];
    idx.daily = days.map((t, k) => {
      let cap = 0;
      for (const c of COMPANIES) if (c.exchange === ex) cap += s.market.quotes[c.id].daily[k].c * c.shares;
      return { t, v: cap / idx.divisor };
    });
  }
}

/** Synthetic daily bars on `days` ending at today's price, plus hourly bars for the sessions in `ticks` (the latest days). */
function seedQuoteHistory(s: GameState, id: TickerId, days: number[], ticks: number[][], rng: RngState): void {
  const c = COMPANY_BY_ID[id];
  const q = s.market.quotes[id];
  const sigma = c.vol / Math.sqrt(252);
  let p = q.price;
  const bars: Bar[] = [];
  // Walk backwards from today's opening price, then reverse.
  for (let k = days.length - 1; k >= 0; k--) {
    const prev = p / Math.exp(sigma * randnClipped(rng, 3));
    const hi = Math.max(p, prev) * (1 + Math.abs(sigma * 0.4 * rand(rng)));
    const lo = Math.min(p, prev) * (1 - Math.abs(sigma * 0.4 * rand(rng)));
    bars.push({ t: days[k], o: prev, h: hi, l: lo, c: p, v: avgDailyValue(s, id) * (0.6 + 0.8 * rand(rng)) });
    p = prev;
  }
  q.daily = bars.reverse();
  q.hourly = [];
  const first = q.daily.length - ticks.length;
  ticks.forEach((mins, i) => seedSessionHours(rng, q.daily[first + i], mins, sigma, q.hourly));
}

/**
 * Lists securities a save predates (D-080 migration). Each newcomer opens from baseline financials for the save's
 * current month and a fundamental price, with fictional history on the same dates as its exchange's existing bars.
 * Draws come from a per-security stream derived from the campaign seed, so the save's own `rng` is untouched, and
 * each index divisor is rescaled so index values do not jump.
 */
export function addMissingListings(s: GameState): TickerId[] {
  const added = COMPANIES.filter((c) => !s.companies[c.id]);
  if (!added.length) return [];
  const klTax = s.government.policies.tax.corporate;
  const mk = s.scheduler.lastMonthKey;
  const elapsed = Math.max(0, klParts(s.clock.hour * 60).day - 1) / daysInMonth(Math.floor(mk / 12), (mk % 12) + 1);
  for (const ex of ['MY', 'US'] as Exchange[]) {
    const fresh = added.filter((c) => c.exchange === ex);
    if (!fresh.length) continue;
    const ref = COMPANIES.find((c) => c.exchange === ex && s.market.quotes[c.id])!;
    const refQuote = s.market.quotes[ref.id];
    const before = indexCap(s, ex);
    for (const c of fresh) {
      const st = initialCompany(c, mk, klTax, s.baseline.profile);
      // Month-to-date accruals so far this month, at the baseline run rate, so the first close is a full month.
      const b = st.history.at(-1)!;
      const opex = (c.revenue * (1 - c.ebitdaMargin)) / 12;
      st.mtd = { revenue: b.revenue * elapsed, laborCost: opex * c.laborShare * elapsed, energyCost: opex * c.energyShare * elapsed, otherCost: opex * (1 - c.laborShare - c.energyShare) * elapsed, depreciation: ((c.revenue * c.depreciationPct) / 12) * elapsed, interest: b.interest * elapsed };
      s.companies[c.id] = st;
      const rng = seedRng((s.seed ^ hashId(c.id)) >>> 0);
      const fv = fundamentalValue(s, c.id);
      const price = roundTick(fv * (0.88 + 0.24 * rand(rng)), ex);
      s.market.quotes[c.id] = { price, prevClose: price, open: price, dayHigh: price, dayLow: price, dayVolume: 0, fundDayValue: 0, fundamental: fv, daily: [], hourly: [] };
      const days = refQuote.daily.map((d) => d.t);
      const sessions = days.slice(-SEED_HOURLY_SESSIONS).map((d) => sessionTickMinutes(ex, d));
      seedQuoteHistory(s, c.id, days, sessions, rng);
    }
    const after = indexCap(s, ex);
    if (before > 0) s.market.indices[ex].divisor *= after / before;
  }
  return added.map((c) => c.id);
}

function indexCap(s: GameState, ex: Exchange): number {
  let cap = 0;
  for (const c of COMPANIES) if (c.exchange === ex && s.market.quotes[c.id] && s.companies[c.id]) cap += s.market.quotes[c.id].price * s.companies[c.id].shares;
  return cap;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Hourly path from bar.o to bar.c over the session's ticks; widens the daily high/low to contain it. */
function seedSessionHours(rng: RngState, bar: Bar, mins: number[], dailySigma: number, out: Bar[]): void {
  const n = mins.length;
  const step = (dailySigma / Math.sqrt(n)) * 0.8;
  const walk = [0];
  for (let i = 1; i <= n; i++) walk.push(walk[i - 1] + step * randnClipped(rng, 3));
  const gap = Math.log(bar.c / bar.o) - walk[n];
  const path = walk.map((w, i) => bar.o * Math.exp(w + (gap * i) / n));
  for (let i = 0; i < n; i++) {
    const o = path[i];
    const c = path[i + 1];
    const wick = Math.abs(step * 0.3 * rand(rng));
    const h = Math.max(o, c) * (1 + wick);
    const l = Math.min(o, c) * (1 - wick);
    bar.h = Math.max(bar.h, h);
    bar.l = Math.min(bar.l, l);
    pushBounded(out, { t: mins[i] / 60, o, h, l, c, v: bar.v / n }, HOURLY_BARS);
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
    q.fundDayValue = 0;
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

