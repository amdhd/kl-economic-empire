// Exchange calendars. Bursa Malaysia (MYT, UTC+8) and NYSE/Nasdaq (America/New_York, with DST).
// Sessions are evaluated at the economic hourly ticks *and* continuously for the UI status chip.
import type { Exchange } from '../types/game';
import { klParts, nthWeekday, nyParts, type CalendarParts } from './time';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// --- Bursa Malaysia ------------------------------------------------------------------------
// Fixed-date holidays are exact. Lunar/religious holidays below are a DOCUMENTED APPROXIMATION
// (see docs/decisions.md D-009); replace with the official Bursa trading calendar when available.
const BURSA_FIXED = ['01-01', '05-01', '08-31', '09-16', '12-25'];
const BURSA_LUNAR: Record<number, string[]> = {
  2027: ['2027-02-08', '2027-02-09', '2027-03-10', '2027-03-11', '2027-05-17', '2027-05-20', '2027-06-07', '2027-10-28'],
  2028: ['2028-01-26', '2028-01-27', '2028-02-28', '2028-02-29', '2028-05-05', '2028-05-08', '2028-05-26', '2028-10-17'],
  2029: ['2029-02-13', '2029-02-14', '2029-02-15', '2029-02-16', '2029-04-24', '2029-05-27', '2029-11-05'],
};

export function isBursaHoliday(p: Pick<CalendarParts, 'year' | 'month' | 'day'>): boolean {
  const md = `${pad(p.month)}-${pad(p.day)}`;
  if (BURSA_FIXED.includes(md)) return true;
  return (BURSA_LUNAR[p.year] ?? []).includes(ymd(p.year, p.month, p.day));
}

// --- NYSE -----------------------------------------------------------------------------------
/** Gregorian Easter Sunday (anonymous algorithm). */
export function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function observed(year: number, month: number, day: number, allowFridayBefore = true): string {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (wd === 6) {
    if (!allowFridayBefore) return '';
    dt.setUTCDate(dt.getUTCDate() - 1);
  } else if (wd === 0) dt.setUTCDate(dt.getUTCDate() + 1);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

const nyseCache = new Map<number, Set<string>>();
export function nyseHolidays(year: number): Set<string> {
  const hit = nyseCache.get(year);
  if (hit) return hit;
  const e = easter(year);
  const gf = new Date(Date.UTC(year, e.month - 1, e.day - 2));
  const list = [
    observed(year, 1, 1, false), // NYSE does not close the prior Friday (Dec 31)
    ymd(year, 1, nthWeekday(year, 1, 1, 3)), // MLK
    ymd(year, 2, nthWeekday(year, 2, 1, 3)), // Presidents
    ymd(year, gf.getUTCMonth() + 1, gf.getUTCDate()), // Good Friday
    ymd(year, 5, nthWeekday(year, 5, 1, -1)), // Memorial
    observed(year, 6, 19), // Juneteenth
    observed(year, 7, 4), // Independence
    ymd(year, 9, nthWeekday(year, 9, 1, 1)), // Labor
    ymd(year, 11, nthWeekday(year, 11, 4, 4)), // Thanksgiving
    observed(year, 12, 25), // Christmas
  ].filter(Boolean);
  // A Saturday Jan 1 of NEXT year is not observed on Dec 31 of this year (handled by allowFridayBefore=false).
  const set = new Set(list);
  nyseCache.set(year, set);
  return set;
}

export function isNyseHoliday(p: Pick<CalendarParts, 'year' | 'month' | 'day'>): boolean {
  return nyseHolidays(p.year).has(ymd(p.year, p.month, p.day));
}

// --- Sessions ---------------------------------------------------------------------------------
export type SessionPhase = 'open' | 'pre' | 'break' | 'post' | 'closed-day';

export interface ExchangeInfo {
  id: Exchange;
  name: string;
  tz: string;
  hours: string;
}

export const EXCHANGES: Record<Exchange, ExchangeInfo> = {
  MY: { id: 'MY', name: 'Bursa Malaysia', tz: 'MYT (UTC+8)', hours: '09:00–12:30, 14:30–17:00 MYT' },
  US: { id: 'US', name: 'NYSE / Nasdaq', tz: 'America/New_York', hours: '09:30–16:00 ET' },
};

export function localParts(ex: Exchange, epochMin: number): CalendarParts {
  return ex === 'MY' ? klParts(epochMin) : nyParts(epochMin);
}

export function isTradingDay(ex: Exchange, epochMin: number): boolean {
  const p = localParts(ex, epochMin);
  if (p.weekday === 0 || p.weekday === 6) return false;
  return ex === 'MY' ? !isBursaHoliday(p) : !isNyseHoliday(p);
}

/** Whether a local calendar date (in the exchange's own timezone) is a trading day. */
export function isTradingDate(ex: Exchange, year: number, month: number, day: number): boolean {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const p = { year, month, day };
  return ex === 'MY' ? !isBursaHoliday(p) : !isNyseHoliday(p);
}

/**
 * The `count` most recent trading dates strictly before `beforeDay`, oldest first.
 * Days are "local day numbers": Date.UTC(localY, localM, localD) / 86 400 000.
 */
export function previousTradingDays(ex: Exchange, beforeDay: number, count: number): number[] {
  const out: number[] = [];
  for (let d = beforeDay - 1; out.length < count; d--) {
    const dt = new Date(d * 86400000);
    if (isTradingDate(ex, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())) out.push(d);
  }
  return out.reverse();
}

/** Epoch minutes of the whole-hour economic ticks at which the exchange is open on a local day. */
export function sessionTickMinutes(ex: Exchange, localDay: number): number[] {
  const dt = new Date(localDay * 86400000);
  const key = dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  const out: number[] = [];
  // Local midnight is within UTC-14h..UTC+14h of UTC midnight; scan whole hours across that window.
  for (let t = localDay * 1440 - 14 * 60; t < localDay * 1440 + 38 * 60; t += 60) {
    if (sessionDateKey(ex, t) === key && isOpen(ex, t)) out.push(t);
  }
  return out;
}

/** Local day number of the exchange's current calendar date at an instant. */
export function localDayOf(ex: Exchange, epochMin: number): number {
  const p = localParts(ex, epochMin);
  return Date.UTC(p.year, p.month - 1, p.day) / 86400000;
}

/** Next instant (epoch minutes, 30-minute steps) at which an open session closes or breaks. */
export function nextClose(ex: Exchange, fromMin: number): number {
  const start = Math.ceil(fromMin / 30) * 30;
  for (let t = start; t < start + 60 * 24 * 14; t += 30) if (!isOpen(ex, t)) return t;
  return start;
}

/** Session phase at an instant. Open intervals are half-open [open, close). */
export function sessionPhase(ex: Exchange, epochMin: number): SessionPhase {
  if (!isTradingDay(ex, epochMin)) return 'closed-day';
  const p = localParts(ex, epochMin);
  const m = p.hour * 60 + p.minute;
  if (ex === 'MY') {
    if (m < 9 * 60) return 'pre';
    if (m < 12 * 60 + 30) return 'open';
    if (m < 14 * 60 + 30) return 'break';
    if (m < 17 * 60) return 'open';
    return 'post';
  }
  if (m < 9 * 60 + 30) return 'pre';
  if (m < 16 * 60) return 'open';
  return 'post';
}

export const isOpen = (ex: Exchange, epochMin: number) => sessionPhase(ex, epochMin) === 'open';

/** Local trading-date key (YYYYMMDD number) for bar bookkeeping. */
export function sessionDateKey(ex: Exchange, epochMin: number): number {
  const p = localParts(ex, epochMin);
  return p.year * 10000 + p.month * 100 + p.day;
}

/** Next instant (epoch minutes, searched in 30-minute steps) at which the exchange opens. */
export function nextOpen(ex: Exchange, fromMin: number): number {
  const start = Math.ceil(fromMin / 30) * 30;
  for (let t = start; t < start + 60 * 24 * 14; t += 30) if (isOpen(ex, t)) return t;
  return start;
}
