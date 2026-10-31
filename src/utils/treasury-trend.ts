import type { DailyPoint } from '../types/game';

/** Signed compact billions for trend badges: "+1.2B", "−0.4B"; below 0.1B it switches to millions ("+35.0M"). */
export function signedBillions(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '+';
  const a = Math.abs(value);
  if (a >= 0.1e9 || a === 0) return `${sign}${(a / 1e9).toFixed(1)}B`;
  return `${sign}${(a / 1e6).toFixed(1)}M`;
}

/** "RM 868.5B" style headline figure (major units in, two decimals below RM 100B). */
export function compactBillions(value: number, prefix = 'RM '): string {
  if (!Number.isFinite(value)) return '—';
  const a = Math.abs(value);
  return `${value < 0 ? '−' : ''}${prefix}${(a / 1e9).toFixed(a >= 100e9 ? 1 : 2)}B`;
}

export interface TreasuryTrend {
  close: number | null; // latest daily close, MYR; null before the first close
  dayChange: number; // vs the previous close, MYR
  weekChange: number; // vs the close 7 days earlier (or the oldest available), MYR
  weekPct: number; // weekChange / base close
  history: number[]; // last `span` closes, oldest first
}

/** Daily-close view of the treasury: what the bottom-bar chip and its hover card show. */
export function treasuryTrend(daily: readonly DailyPoint[], span = 30): TreasuryTrend {
  const n = daily.length;
  if (!n) return { close: null, dayChange: 0, weekChange: 0, weekPct: 0, history: [] };
  const close = daily[n - 1].treasury;
  const dayChange = n >= 2 ? close - daily[n - 2].treasury : 0;
  const base = daily[Math.max(0, n - 8)].treasury;
  const weekChange = close - base;
  return { close, dayChange, weekChange, weekPct: base ? weekChange / Math.abs(base) : 0, history: daily.slice(-span).map((d) => d.treasury) };
}
