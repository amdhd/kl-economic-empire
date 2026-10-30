import type { Currency } from '../types/game';

const nf = (d: number) => new Intl.NumberFormat('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = nf(0);
const fmt1 = nf(1);
const fmt2 = nf(2);

const SYMBOL: Record<Currency, string> = { MYR: 'RM', USD: 'US$' };

/** Compact money: RM 1.23bn, RM 456.7m, RM 12.3k. `value` is in major units. */
export function money(value: number, currency: Currency = 'MYR', digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const a = Math.abs(value);
  const sym = SYMBOL[currency];
  const d = nf(digits);
  if (a >= 1e12) return `${sign}${sym} ${d.format(a / 1e12)}tn`;
  if (a >= 1e9) return `${sign}${sym} ${d.format(a / 1e9)}bn`;
  if (a >= 1e6) return `${sign}${sym} ${d.format(a / 1e6)}m`;
  if (a >= 1e4) return `${sign}${sym} ${d.format(a / 1e3)}k`;
  return `${sign}${sym} ${fmt2.format(a)}`;
}

/** Money from integer minor units (sen / cents). */
export function moneyMinor(minor: number, currency: Currency = 'MYR', digits = 1): string {
  return money(minor / 100, currency, digits);
}

/** Exact money with 2 decimals, e.g. share prices: RM 9.84 / US$ 412.10 */
export function price(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return '—';
  return `${SYMBOL[currency]} ${fmt2.format(value)}`;
}

/** 0.0512 -> "5.1%" */
export function pct(value: number, digits = 1, signed = false): string {
  if (!Number.isFinite(value)) return '—';
  const s = nf(digits).format(Math.abs(value) * 100);
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${s}%`;
}

export function num(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return digits === 0 ? fmt0.format(value) : digits === 1 ? fmt1.format(value) : nf(digits).format(value);
}

/** MYR per USD, 4 decimals */
export function fx(rate: number): string {
  return `${nf(4).format(rate)}`;
}

export const FICTIONAL_LABEL = 'Simulated · fictional data';
