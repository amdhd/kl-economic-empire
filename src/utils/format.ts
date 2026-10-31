import type { Currency } from '../types/game';

const nf = (d: number) => new Intl.NumberFormat('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = nf(0);
const fmt1 = nf(1);
const fmt2 = nf(2);

const SYMBOL: Record<Currency, string> = { MYR: 'RM', USD: '$' };
/** "RM 1.2bn" keeps a space after RM; dollars read "$1.2bn". */
const prefix = (c: Currency) => (c === 'USD' ? '$' : 'RM ');

/** Compact money: RM 1.23bn, RM 456.7m, RM 12.3k. `value` is in major units. */
export function money(value: number, currency: Currency = 'MYR', digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const a = Math.abs(value);
  const pre = prefix(currency);
  const d = nf(digits);
  if (a >= 1e12) return `${sign}${pre}${d.format(a / 1e12)}tn`;
  if (a >= 1e9) return `${sign}${pre}${d.format(a / 1e9)}bn`;
  if (a >= 1e6) return `${sign}${pre}${d.format(a / 1e6)}m`;
  if (a >= 1e4) return `${sign}${pre}${d.format(a / 1e3)}k`;
  return `${sign}${pre}${fmt2.format(a)}`;
}

/** Money from integer minor units (sen / cents). */
export function moneyMinor(minor: number, currency: Currency = 'MYR', digits = 1): string {
  return money(minor / 100, currency, digits);
}

/** Exact money with 2 decimals, e.g. share prices: RM 9.84 / $412.10 */
export function price(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return '—';
  return `${prefix(currency)}${fmt2.format(value)}`;
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

/** Share price at quote precision: Bursa sub-RM1 prices use 3 decimals (0.005 tick), else 2. */
export function sharePrice(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return '—';
  const digits = currency === 'MYR' && value < 1 ? 3 : 2;
  return `${prefix(currency)}${nf(digits).format(value)}`;
}

export const currencySymbol = (c: Currency) => SYMBOL[c];

/** Full digits in whole ringgit/dollars, without compact suffixes. */
export function fullMoneyMinor(minor: number, currency: Currency = 'MYR'): string {
  if (!Number.isSafeInteger(minor)) return '—';
  const a = Math.abs(minor);
  // Whole ringgit/dollars: the sen/cents still exist in the ledger but are not shown (user preference).
  return `${minor < 0 ? '−' : ''}${prefix(currency)}${fmt0.format(Math.floor(a / 100))}`;
}
