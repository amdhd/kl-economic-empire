// Pure, read-only view models for the market UI (tables, search, charts, exchange status, FX).
// Nothing here mutates GameState or draws random numbers, so the UI can call it freely.
// All prices and financials are FICTIONAL simulations.
import { COMPANIES, COMPANY_BY_ID, currencyOf } from '../data/companies';
import { BASELINE } from '../data/economic-baseline';
import type { Bar, CompanySeed, Currency, Exchange, GameState, QuoteState, SectorId, TickerId } from '../types/game';
import { ttmNetIncome } from './companies';
import { localParts, nextClose, nextOpen, sessionPhase, type SessionPhase } from './market-calendar';
import { MONTHS, nyOffsetMin } from './time';

/** Trading sessions in the "1M" change window. */
export const MONTH_SESSIONS = 21;

export interface SecurityRow {
  id: TickerId;
  code: string;
  name: string;
  legalName: string;
  exchange: Exchange;
  currency: Currency;
  sector: SectorId;
  industry: string;
  price: number;
  dayChange: number; // fraction vs previous close
  monthChange: number; // fraction vs close ~21 sessions ago
  pe: number; // NaN when trailing earnings are not positive
  dividendYield: number; // trailing 12 months
  marketCap: number; // listing currency, major units
  marketCapMYR: number;
  open: boolean;
  hasKlLocation: boolean;
}

export function securityRow(s: GameState, c: CompanySeed): SecurityRow {
  const q = s.market.quotes[c.id];
  const st = s.companies[c.id];
  const eps = ttmNetIncome(st) / st.shares;
  const dps = st.history.slice(-12).reduce((a, h) => a + h.dividends, 0) / st.shares;
  const ref = q.daily.length ? q.daily[Math.max(0, q.daily.length - MONTH_SESSIONS)].c : q.price;
  const cap = q.price * st.shares;
  return {
    id: c.id,
    code: c.code,
    name: c.displayName,
    legalName: c.legalName,
    exchange: c.exchange,
    currency: currencyOf(c.id),
    sector: c.sector,
    industry: c.industry,
    price: q.price,
    dayChange: q.prevClose > 0 ? q.price / q.prevClose - 1 : 0,
    monthChange: ref > 0 ? q.price / ref - 1 : 0,
    pe: eps > 0 ? q.price / eps : NaN,
    dividendYield: q.price > 0 ? dps / q.price : 0,
    marketCap: cap,
    marketCapMYR: c.exchange === 'US' ? cap * s.external.myrPerUsd : cap,
    open: s.market.sessionOpen[c.exchange],
    hasKlLocation: !!c.geo,
  };
}

export const securityRows = (s: GameState): SecurityRow[] => COMPANIES.map((c) => securityRow(s, c));

export type SortKey = 'default' | 'gainers' | 'losers' | 'cap' | 'month' | 'name';
export interface RowFilter {
  query?: string;
  exchange?: Exchange | 'ALL';
  sector?: SectorId | 'ALL';
  sort?: SortKey;
}

/** Ticker search matches ID (`US:NVDA`), exchange code (`1155`), display or legal name; case-insensitive. */
export function matchesQuery(r: Pick<SecurityRow, 'id' | 'code' | 'name' | 'legalName' | 'industry'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [r.id, r.code, r.name, r.legalName, r.industry].some((f) => f.toLowerCase().includes(q));
}

export function filterRows(rows: SecurityRow[], f: RowFilter): SecurityRow[] {
  const out = rows.filter(
    (r) =>
      (!f.exchange || f.exchange === 'ALL' || r.exchange === f.exchange) &&
      (!f.sector || f.sector === 'ALL' || r.sector === f.sector) &&
      matchesQuery(r, f.query ?? ''),
  );
  const by: Record<SortKey, ((a: SecurityRow, b: SecurityRow) => number) | null> = {
    default: null,
    gainers: (a, b) => b.dayChange - a.dayChange,
    losers: (a, b) => a.dayChange - b.dayChange,
    cap: (a, b) => b.marketCapMYR - a.marketCapMYR,
    month: (a, b) => b.monthChange - a.monthChange,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const cmp = by[f.sort ?? 'default'];
  return cmp ? out.sort(cmp) : out;
}

// ------------------------------------------------------------------ charts
export type Resolution = 'hour' | 'day' | 'month';
export interface ChartPoint {
  /** Hour: epoch hour. Day: local day number. Month: year*12+month0. */
  t: number;
  label: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  live?: boolean;
}

function dayLabel(day: number): string {
  const d = new Date(day * 86400000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** Hourly bars are labelled in the exchange's local time. */
function hourLabel(ex: Exchange, epochHour: number): string {
  const p = localParts(ex, epochHour * 60);
  return `${p.day} ${MONTHS[p.month - 1]} ${String(p.hour).padStart(2, '0')}:00`;
}

/** The current session as a provisional daily bar, if one is running and not yet finalised. */
function liveDailyBar(s: GameState, id: TickerId): Bar | null {
  const ex = COMPANY_BY_ID[id].exchange;
  const m = s.market;
  const key = m.sessionDay[ex];
  if (!key || m.closedDay[ex] === key) return null;
  const q = m.quotes[id];
  const t = Date.UTC(Math.floor(key / 10000), Math.floor((key % 10000) / 100) - 1, key % 100) / 86400000;
  return { t, o: q.open, h: q.dayHigh, l: q.dayLow, c: q.price, v: q.dayVolume };
}

export function aggregateMonthly(bars: Bar[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const b of bars) {
    const d = new Date(b.t * 86400000);
    const t = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else {
      out.push({ t, label: `${MONTHS[t % 12]} ${String(Math.floor(t / 12)).slice(2)}`, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
  }
  return out;
}

export function priceSeries(s: GameState, id: TickerId, res: Resolution): ChartPoint[] {
  const q: QuoteState = s.market.quotes[id];
  const ex = COMPANY_BY_ID[id].exchange;
  if (res === 'hour') return q.hourly.map((b) => ({ ...b, label: hourLabel(ex, b.t) }));
  const live = liveDailyBar(s, id);
  const bars = live ? [...q.daily, live] : q.daily;
  if (res === 'month') {
    const pts = aggregateMonthly(bars);
    if (live && pts.length) pts[pts.length - 1].live = true;
    return pts;
  }
  return bars.map((b) => ({ ...b, label: dayLabel(b.t), live: b === live || undefined }));
}

export function indexSeries(s: GameState, ex: Exchange): { t: number; label: string; v: number }[] {
  return s.market.indices[ex].daily.map((p) => ({ ...p, label: dayLabel(p.t) }));
}

// ------------------------------------------------------------------ exchange status
export interface ExchangeStatus {
  exchange: Exchange;
  phase: SessionPhase;
  open: boolean;
  label: string;
  localTime: string;
  tz: string; // MYT / EST / EDT
  nextChangeMin: number; // next open (if closed) or close/break (if open)
  nextChangeLabel: string;
}

export function tzAbbrev(ex: Exchange, epochMin: number): string {
  if (ex === 'MY') return 'MYT';
  return nyOffsetMin(epochMin) === -240 ? 'EDT' : 'EST';
}

const PHASE_LABEL: Record<SessionPhase, string> = {
  open: 'Open',
  pre: 'Pre-open',
  break: 'Lunch break',
  post: 'Closed',
  'closed-day': 'Closed',
};

export function exchangeStatus(ex: Exchange, epochMin: number): ExchangeStatus {
  const phase = sessionPhase(ex, epochMin);
  const open = phase === 'open';
  const p = localParts(ex, epochMin);
  const weekend = p.weekday === 0 || p.weekday === 6;
  let label = PHASE_LABEL[phase];
  if (phase === 'closed-day') label = weekend ? 'Closed · weekend' : 'Closed · holiday';
  const next = open ? nextClose(ex, epochMin) : nextOpen(ex, epochMin);
  const np = localParts(ex, next);
  const hhmm = `${String(np.hour).padStart(2, '0')}:${String(np.minute).padStart(2, '0')}`;
  const sameDay = np.year === p.year && np.month === p.month && np.day === p.day;
  const when = sameDay ? hhmm : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][np.weekday]} ${np.day} ${MONTHS[np.month - 1]} ${hhmm}`;
  return {
    exchange: ex,
    phase,
    open,
    label,
    localTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    tz: tzAbbrev(ex, epochMin),
    nextChangeMin: next,
    nextChangeLabel: `${open ? 'Closes' : 'Opens'} ${when} ${tzAbbrev(ex, next)}`,
  };
}

// ------------------------------------------------------------------ FX & indices
export interface FxView {
  myrPerUsd: number;
  usdPerMyr: number;
  change: number; // vs previous daily close (or baseline before the first close)
  history: { t: number; label: string; v: number }[];
}

export function fxView(s: GameState): FxView {
  const r = s.external.myrPerUsd;
  const prev = s.daily.length ? s.daily[s.daily.length - 1].fx : BASELINE.myrPerUsd;
  return {
    myrPerUsd: r,
    usdPerMyr: 1 / r,
    change: prev > 0 ? r / prev - 1 : 0,
    history: s.daily.map((d) => ({ t: d.t, label: dayLabel(d.t), v: d.fx })),
  };
}

export interface IndexView {
  exchange: Exchange;
  name: string;
  value: number;
  change: number;
}

export const INDEX_NAMES: Record<Exchange, string> = { MY: 'KL Economic Stock Index', US: 'US Game Index' };

export function indexView(s: GameState, ex: Exchange): IndexView {
  const i = s.market.indices[ex];
  return { exchange: ex, name: INDEX_NAMES[ex], value: i.value, change: i.prevClose > 0 ? i.value / i.prevClose - 1 : 0 };
}

/** Value of a listing-currency amount in MYR at the current fictional rate. */
export const toMYR = (s: GameState, amount: number, currency: Currency) => (currency === 'USD' ? amount * s.external.myrPerUsd : amount);
