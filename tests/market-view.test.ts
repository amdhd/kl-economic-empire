// Phase 2: seeded price history, market view models, exchange status and MYR/USD rendering.
import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../src/data/companies';
import { createGame } from '../src/engine/game';
import { isOpen, isTradingDate, sessionTickMinutes } from '../src/engine/market-calendar';
import { aggregateMonthly, exchangeStatus, filterRows, fxView, indexView, priceSeries, securityRows } from '../src/engine/market-view';
import { SEED_DAYS, SEED_HOURLY_SESSIONS } from '../src/engine/stock-market';
import { klToEpochMin } from '../src/engine/time';
import { sharePrice } from '../src/utils/format';
import { runUntil } from './helpers';

const dateOf = (day: number) => {
  const d = new Date(day * 86400000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] as const;
};

describe('synthetic opening prices and history', () => {
  const s = createGame();

  it('is deterministic per seed and differs across seeds', () => {
    const a = createGame(42);
    const b = createGame(42);
    const c = createGame(43);
    expect(JSON.stringify(a.market)).toBe(JSON.stringify(b.market));
    expect(JSON.stringify(a.rng)).toBe(JSON.stringify(b.rng));
    expect(a.market.quotes['MY:1155'].price).not.toBe(c.market.quotes['MY:1155'].price);
  });

  it('daily bars fall only on that exchange’s trading dates, strictly increasing, ending at the opening price', () => {
    for (const co of COMPANIES) {
      const q = s.market.quotes[co.id];
      expect(q.daily).toHaveLength(SEED_DAYS);
      for (let i = 0; i < q.daily.length; i++) {
        const b = q.daily[i];
        expect(isTradingDate(co.exchange, ...dateOf(b.t)), `${co.id} ${dateOf(b.t)}`).toBe(true);
        if (i) expect(b.t).toBeGreaterThan(q.daily[i - 1].t);
        expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c) + 1e-9);
        expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c) - 1e-9);
        expect(b.l).toBeGreaterThan(0);
        expect(b.v).toBeGreaterThan(0);
      }
      expect(q.daily[q.daily.length - 1].c).toBeCloseTo(q.price, 9);
    }
    // Last pre-game session: Thu 31 Dec 2026 in both KL and New York (1 Jan is a holiday for both).
    expect(dateOf(s.market.quotes['MY:1155'].daily.at(-1)!.t)).toEqual([2026, 12, 31]);
    expect(dateOf(s.market.quotes['US:NVDA'].daily.at(-1)!.t)).toEqual([2026, 12, 31]);
    // 25 Dec is skipped by both calendars
    expect(s.market.quotes['US:NVDA'].daily.some((b) => dateOf(b.t).join('-') === '2026-12-25')).toBe(false);
  });

  it('hourly bars sit on open whole-hour ticks and bridge each session open→close', () => {
    for (const co of COMPANIES) {
      const q = s.market.quotes[co.id];
      for (const h of q.hourly) expect(isOpen(co.exchange, h.t * 60), `${co.id} ${h.t}`).toBe(true);
      const lastDay = q.daily.at(-1)!;
      const ticks = sessionTickMinutes(co.exchange, lastDay.t);
      expect(ticks.length).toBe(6);
      const lastHours = q.hourly.slice(-ticks.length);
      expect(lastHours.map((h) => h.t * 60)).toEqual(ticks);
      expect(lastHours[0].o).toBeCloseTo(lastDay.o, 9);
      expect(lastHours.at(-1)!.c).toBeCloseTo(lastDay.c, 9);
      for (const h of lastHours) {
        expect(h.h).toBeLessThanOrEqual(lastDay.h + 1e-9);
        expect(h.l).toBeGreaterThanOrEqual(lastDay.l - 1e-9);
      }
    }
    expect(s.market.quotes['US:NVDA'].hourly.length).toBe(SEED_HOURLY_SESSIONS * 6);
  });

  it('index history aggregates the same dates as the constituents', () => {
    expect(s.market.indices.MY.daily.map((p) => p.t)).toEqual(s.market.quotes['MY:1155'].daily.map((b) => b.t));
    expect(s.market.indices.US.daily.at(-1)!.v).toBeCloseTo(1000, 6);
    expect(indexView(s, 'MY').name).toBe('KL Economic Stock Index');
  });
});

describe('market rows, search and charts', () => {
  const s = createGame();
  const rows = securityRows(s);

  it('formats MYR and USD prices distinctly', () => {
    expect(sharePrice(16.84, 'MYR')).toBe('RM 16.84');
    expect(sharePrice(0.355, 'MYR')).toBe('RM 0.355');
    expect(sharePrice(1234.5, 'USD')).toBe('US$ 1,234.50');
    expect(rows.filter((r) => r.currency === 'MYR')).toHaveLength(26);
    expect(rows.filter((r) => r.currency === 'USD').every((r) => r.exchange === 'US')).toBe(true);
    const nvda = rows.find((r) => r.id === 'US:NVDA')!;
    expect(nvda.marketCapMYR).toBeCloseTo(nvda.marketCap * s.external.myrPerUsd, 3);
  });

  it('rows are finite with positive P/E and yields', () => {
    for (const r of rows) {
      for (const v of [r.price, r.dayChange, r.monthChange, r.pe, r.dividendYield, r.marketCap]) expect(Number.isFinite(v), r.id).toBe(true);
      expect(r.pe).toBeGreaterThan(0);
    }
  });

  it('searches ticker, code, display and legal names across markets', () => {
    expect(filterRows(rows, { query: 'nvda' }).map((r) => r.id)).toEqual(['US:NVDA']);
    expect(filterRows(rows, { query: '1155' }).map((r) => r.id)).toEqual(['MY:1155']);
    expect(filterRows(rows, { query: 'malayan banking' }).map((r) => r.id)).toEqual(['MY:1155']);
    expect(filterRows(rows, { query: 'brk.b' }).map((r) => r.id)).toEqual(['US:BRK.B']);
    expect(filterRows(rows, { query: 'genting' })).toHaveLength(2);
    expect(filterRows(rows, { exchange: 'US' })).toHaveLength(34);
    expect(filterRows(rows, { exchange: 'MY', sector: 'fin' }).map((r) => r.id).sort()).toEqual(['MY:1023', 'MY:1155', 'MY:1295']);
    const g = filterRows(rows, { exchange: 'MY', sort: 'cap' });
    for (let i = 1; i < g.length; i++) expect(g[i - 1].marketCapMYR).toBeGreaterThanOrEqual(g[i].marketCapMYR);
  });

  it('provides hour/day/month series and a live bar while a session runs', () => {
    expect(priceSeries(s, 'MY:1155', 'day')).toHaveLength(SEED_DAYS);
    expect(priceSeries(s, 'MY:1155', 'hour').length).toBeGreaterThan(10);
    const months = priceSeries(s, 'MY:1155', 'month');
    expect(months.length).toBeGreaterThanOrEqual(8);
    expect(months.at(-1)!.c).toBeCloseTo(s.market.quotes['MY:1155'].price, 9);

    const g = createGame();
    runUntil(g, 2027, 1, 4, 11); // Monday, Bursa open since 09:00
    expect(g.market.sessionOpen.MY).toBe(true);
    const day = priceSeries(g, 'MY:1155', 'day');
    expect(day.at(-1)!.live).toBe(true);
    expect(dateOf(day.at(-1)!.t)).toEqual([2027, 1, 4]);
    expect(day.at(-1)!.c).toBe(g.market.quotes['MY:1155'].price);
    runUntil(g, 2027, 1, 4, 18); // after close: finalised, no duplicate live bar
    const after = priceSeries(g, 'MY:1155', 'day');
    expect(after.filter((b) => b.t === day.at(-1)!.t)).toHaveLength(1);
    expect(after.at(-1)!.live).toBeUndefined();
  });

  it('aggregates monthly OHLC correctly', () => {
    const m = aggregateMonthly([
      { t: Date.UTC(2027, 0, 4) / 864e5, o: 10, h: 12, l: 9, c: 11, v: 1 },
      { t: Date.UTC(2027, 0, 5) / 864e5, o: 11, h: 15, l: 10, c: 14, v: 2 },
      { t: Date.UTC(2027, 1, 1) / 864e5, o: 14, h: 14, l: 8, c: 9, v: 3 },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ o: 10, h: 15, l: 9, c: 14, v: 3, label: 'Jan 27' });
    expect(m[1]).toMatchObject({ o: 14, h: 14, l: 8, c: 9, label: 'Feb 27' });
  });

  it('prices do not move while both markets are closed (holiday + weekend)', () => {
    const g = createGame();
    const before = JSON.stringify(Object.values(g.market.quotes).map((q) => q.price));
    runUntil(g, 2027, 1, 4, 8); // Fri 1 Jan (holiday) → Mon 08:00 KL; US closed for weekend by Sat morning KL
    const usMoved = COMPANIES.filter((c) => c.exchange === 'US').some((c) => g.market.quotes[c.id].price !== JSON.parse(before)[COMPANIES.indexOf(c)]);
    const myMoved = COMPANIES.filter((c) => c.exchange === 'MY').some((c) => g.market.quotes[c.id].price !== JSON.parse(before)[COMPANIES.indexOf(c)]);
    expect(myMoved).toBe(false); // Bursa never opened
    expect(usMoved).toBe(false); // NY: Fri 1 Jan holiday, then weekend
  });
});

describe('exchange status and FX display', () => {
  const kl = (y: number, m: number, d: number, h: number, min = 0) => klToEpochMin(y, m, d, h, min);

  it('shows New York time with EST in winter and EDT in summer', () => {
    const jan = exchangeStatus('US', kl(2027, 1, 12, 23, 0)); // 10:00 EST
    expect(jan).toMatchObject({ open: true, tz: 'EST', localTime: '10:00' });
    expect(jan.nextChangeLabel).toBe('Closes 16:00 EST');
    const jul = exchangeStatus('US', kl(2027, 7, 13, 22, 0)); // 10:00 EDT
    expect(jul).toMatchObject({ open: true, tz: 'EDT', localTime: '10:00' });
    expect(exchangeStatus('US', kl(2027, 7, 13, 21, 0)).label).toBe('Pre-open');
  });

  it('labels Bursa lunch break, weekends and holidays and gives the next open', () => {
    expect(exchangeStatus('MY', kl(2027, 1, 4, 13)).label).toBe('Lunch break');
    expect(exchangeStatus('MY', kl(2027, 1, 4, 13)).nextChangeLabel).toBe('Opens 14:30 MYT');
    const sat = exchangeStatus('MY', kl(2027, 1, 9, 10));
    expect(sat.label).toBe('Closed · weekend');
    expect(sat.nextChangeLabel).toBe('Opens Mon 11 Jan 09:00 MYT');
    expect(exchangeStatus('MY', kl(2027, 1, 1, 10)).label).toBe('Closed · holiday');
  });

  it('crossing DST changes the US open in KL time but not in NY time', () => {
    const before = exchangeStatus('US', kl(2027, 3, 12, 23)); // Fri 12 Mar, EST
    const after = exchangeStatus('US', kl(2027, 3, 16, 22)); // Tue 16 Mar, EDT
    expect(before).toMatchObject({ tz: 'EST', localTime: '10:00', open: true });
    expect(after).toMatchObject({ tz: 'EDT', localTime: '10:00', open: true });
  });

  it('FX view reports both quote directions and builds history daily', () => {
    const g = createGame();
    const f0 = fxView(g);
    expect(f0.usdPerMyr).toBeCloseTo(1 / f0.myrPerUsd, 12);
    expect(f0.history).toHaveLength(0);
    runUntil(g, 2027, 1, 4, 1);
    expect(fxView(g).history).toHaveLength(3);
  });
});
