// D-080: 20 more listed securities, and the schema-13 → 14 migration that lists them in older saves.
import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../src/data/companies';
import { LOGOS } from '../src/data/logos';
import { createGame, runHeadless, SCHEMA_VERSION } from '../src/engine/game';
import { deserialize, findNonFinite, serialize } from '../src/persistence/save';
import type { TickerId } from '../src/types/game';

const ADDED: TickerId[] = ['MY:5285', 'MY:2445', 'MY:7113', 'MY:5168', 'MY:5878', 'MY:5176', 'MY:5246', 'MY:3816', 'MY:7160', 'MY:7204',
  'US:ANET', 'US:KLAC', 'US:ADI', 'US:SMCI', 'US:NOW', 'US:LLY', 'US:UPS', 'US:PLD', 'US:KO', 'US:CAT'];

/** A schema-13 save as written before D-080: no newcomers, index divisors for the 60-stock universe. */
function oldSave(seed: number, days: number) {
  const s = createGame(seed);
  runHeadless(s, 24 * days);
  const file = JSON.parse(serialize(s));
  file.state.schemaVersion = 13;
  for (const id of ADDED) { delete file.state.companies[id]; delete file.state.market.quotes[id]; }
  for (const ex of ['MY', 'US'] as const) {
    const cap = Object.keys(file.state.companies).filter((id) => id.startsWith(`${ex}:`)).reduce((a, id) => a + file.state.market.quotes[id].price * file.state.companies[id].shares, 0);
    file.state.market.indices[ex].divisor = cap / s.market.indices[ex].value;
  }
  return { s, file };
}

describe('80-security universe (D-080)', () => {
  it('fills sector gaps with 10 Bursa and 10 US names, each with a logo or a documented monogram', () => {
    expect(ADDED.every((id) => COMPANIES.some((c) => c.id === id))).toBe(true);
    const sectors = new Set(COMPANIES.filter((c) => ADDED.includes(c.id)).map((c) => c.industry));
    expect(sectors.size).toBe(20);
    const monograms = ['MY:5285', 'MY:5168', 'MY:5176', 'MY:5246', 'MY:7160', 'MY:7204'];
    for (const id of ADDED) expect(!!LOGOS[id], id).toBe(!monograms.includes(id));
    // No invented map markers: none of the newcomers has a verified KL point.
    expect(COMPANIES.filter((c) => ADDED.includes(c.id) && c.geo)).toHaveLength(0);
  });

  it('lists the newcomers in schema-13 saves without touching the rng, existing accounts or index levels', () => {
    const { s, file } = oldSave(1801, 40);
    const t = deserialize(JSON.stringify(file));
    expect(t.schemaVersion).toBe(SCHEMA_VERSION);
    expect(t.rng).toEqual(s.rng);
    expect(t.fund).toEqual(s.fund);
    expect(t.companies['MY:1155']).toEqual(s.companies['MY:1155']);
    expect(t.market.quotes['US:NVDA']).toEqual(s.market.quotes['US:NVDA']);
    for (const ex of ['MY', 'US'] as const) {
      const ids = COMPANIES.filter((c) => c.exchange === ex).map((c) => c.id);
      const cap = ids.reduce((a, id) => a + t.market.quotes[id].price * t.companies[id].shares, 0);
      expect(cap / t.market.indices[ex].divisor).toBeCloseTo(s.market.indices[ex].value, 6);
    }
    for (const id of ADDED) {
      const q = t.market.quotes[id];
      const ref = t.market.quotes[id.startsWith('MY:') ? 'MY:1155' : 'US:NVDA'];
      // History on the same trading dates as its exchange, ending at today's price; current-month financials.
      expect(q.daily.map((b) => b.t)).toEqual(ref.daily.map((b) => b.t));
      expect(q.daily.at(-1)!.c).toBe(q.price);
      expect(q.hourly.length).toBeGreaterThan(0);
      expect(t.companies[id].history.at(-1)!.monthKey).toBe(t.scheduler.lastMonthKey - 1);
      expect(t.companies[id].mtd.revenue).toBeGreaterThan(0);
    }
    // Deterministic, and the campaign keeps running cleanly with the newcomers trading.
    expect(deserialize(JSON.stringify(file)).market).toEqual(t.market);
    runHeadless(t, 24 * 45);
    expect(findNonFinite(t)).toBeNull();
    for (const id of ADDED) expect(t.companies[id].history.at(-1)!.netIncome).toBeGreaterThan(0);
  });
});
