// Calendar utilities. All game time is stored as UTC epoch minutes/hours.
// Kuala Lumpur is UTC+8 all year (no DST), so KL hour boundaries align with UTC hours.

export const KL_OFFSET_MIN = 8 * 60;
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;

export interface CalendarParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

function partsFromUtcMs(ms: number): CalendarParts {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** Epoch minutes for a wall-clock time in Kuala Lumpur. */
export function klToEpochMin(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute) / 60000 - KL_OFFSET_MIN;
}

export function klParts(epochMin: number): CalendarParts {
  return partsFromUtcMs((epochMin + KL_OFFSET_MIN) * 60000);
}

/** Days since 1970-01-01 in KL local time. */
export function klDay(epochMin: number): number {
  return Math.floor((epochMin + KL_OFFSET_MIN) / MIN_PER_DAY);
}

export function klDayStartMin(day: number): number {
  return day * MIN_PER_DAY - KL_OFFSET_MIN;
}

export function monthKey(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function monthKeyOf(epochMin: number): number {
  const p = klParts(epochMin);
  return monthKey(p.year, p.month);
}

export function monthKeyLabel(key: number): string {
  const y = Math.floor(key / 12);
  const m = key % 12;
  return `${MONTHS[m]} ${y}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** n-th weekday (0=Sun) of a month, n>=1; n=-1 for last. Returns day of month. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const dim = daysInMonth(year, month);
  const last = new Date(Date.UTC(year, month - 1, dim)).getUTCDay();
  return dim - ((last - weekday + 7) % 7);
}

/** US Eastern offset (minutes from UTC) at an instant, with post-2007 DST rules. */
export function nyOffsetMin(epochMin: number): number {
  const y = new Date(epochMin * 60000).getUTCFullYear();
  // DST starts 2nd Sunday of March 02:00 EST (07:00 UTC), ends 1st Sunday Nov 02:00 EDT (06:00 UTC)
  const start = Date.UTC(y, 2, nthWeekday(y, 3, 0, 2), 7) / 60000;
  const end = Date.UTC(y, 10, nthWeekday(y, 11, 0, 1), 6) / 60000;
  return epochMin >= start && epochMin < end ? -240 : -300;
}

export function nyParts(epochMin: number): CalendarParts {
  return partsFromUtcMs((epochMin + nyOffsetMin(epochMin)) * 60000);
}

export function formatKL(epochMin: number): { date: string; time: string; weekday: string } {
  const p = klParts(epochMin);
  return {
    date: `${String(p.day).padStart(2, '0')} ${MONTHS[p.month - 1]} ${p.year}`,
    time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    weekday: WEEKDAYS[p.weekday],
  };
}

export function klDayLabel(day: number): string {
  const p = klParts(klDayStartMin(day));
  return `${p.day} ${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`;
}
