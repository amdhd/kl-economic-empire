// Versioned save format. Saving never mutates game state or advances the clock.
import { assertSafeMinor } from '../engine/util';
import { SCHEMA_VERSION } from '../engine/game';
import type { GameState } from '../types/game';

export interface SaveFile {
  format: 'kl-economic-empire';
  schemaVersion: number;
  savedAtReal: string;
  label: string;
  state: GameState;
}

export function serialize(s: GameState, label = 'Manual save'): string {
  const file: SaveFile = { format: 'kl-economic-empire', schemaVersion: s.schemaVersion, savedAtReal: new Date().toISOString(), label, state: s };
  return JSON.stringify(file);
}

/** Recursively verifies that every number is finite. Returns the first bad path, or null. */
export function findNonFinite(v: unknown, path = 'state'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findNonFinite(v[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const r = findNonFinite(x, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a state from schema n to n+1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2 (master): projects track real work done (for construction-cost escalation).
  1: (s) => {
    const gov = s.government as { projects: { spent: number; work?: number }[] };
    for (const p of gov.projects) p.work = p.work ?? p.spent;
    return s;
  },
  // v2 → v3 (integration of the parallel Phase 3 branch, which also called its format "v2"):
  // fill whichever of the two branches' fields are missing, so saves from either branch load.
  2: (state) => {
    const s = state as unknown as GameState;
    for (const p of s.government.projects) p.work = p.work ?? p.spent;
    s.government.ledger ??= [];
    if (!s.fund.realized || !s.fund.dividends || s.fund.realizedMYR === undefined) {
      // Recover totals from still-held positions; gains on fully sold positions and historical
      // sale FX cannot be reconstructed, so they are not invented.
      s.fund.realized = { MYR: 0, USD: 0 };
      s.fund.realizedMYR = 0;
      s.fund.dividends = { MYR: 0, USD: 0 };
      for (const [id, p] of Object.entries(s.fund.positions)) if (p) {
        const currency = id.startsWith('US:') ? 'USD' : 'MYR';
        s.fund.realized[currency] += p.realizedMinor;
        if (currency === 'MYR') s.fund.realizedMYR += p.realizedMinor;
        s.fund.dividends[currency] += p.dividendsMinor;
      }
    }
    return state;
  },
};

export function deserialize(json: string): GameState {
  let file: SaveFile;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Error('Save file is not valid JSON');
  }
  if (file?.format !== 'kl-economic-empire' || !file.state) throw new Error('Not a KL Economic Empire save');
  let st = file.state as unknown as Record<string, unknown>;
  let v = Number(st.schemaVersion);
  if (!Number.isInteger(v) || v < 1) throw new Error('Unknown save schema');
  if (v > SCHEMA_VERSION) throw new Error(`Save is from a newer version (schema ${v})`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from schema ${v}`);
    st = m(st);
    v += 1;
    st.schemaVersion = v;
  }
  const s = st as unknown as GameState;
  const bad = findNonFinite(s);
  if (bad) throw new Error(`Corrupt save: non-finite number at ${bad}`);
  for (const key of ['clock', 'scheduler', 'rng', 'government', 'fund', 'market', 'sectors', 'households', 'bank', 'external'] as const) {
    if (!s[key]) throw new Error(`Corrupt save: missing ${key}`);
  }
  if (!(s.clock.subHourMs >= 0 && s.clock.subHourMs < 3_600_000)) throw new Error('Corrupt save: clock out of range');
  if (s.fund.myrCash < 0 || s.fund.usdCash < 0) throw new Error('Corrupt save: negative fund cash');
  for (const n of [s.fund.myrCash, s.fund.usdCash, s.government.treasury, s.government.debt, ...Object.values(s.fund.realized), ...Object.values(s.fund.dividends), s.fund.realizedMYR]) assertSafeMinor(n);
  if (s.government.treasury < 0 || s.government.debt < 0) throw new Error('Corrupt save: negative treasury or debt');
  for (const [id, p] of Object.entries(s.fund.positions)) if (p) {
    if (!s.companies[id as keyof typeof s.companies] || !Number.isSafeInteger(p.units) || p.units <= 0 || p.costMinor < 0 || p.costMYR < 0) throw new Error('Corrupt save: invalid position');
    for (const n of [p.costMinor, p.costMYR, p.realizedMinor, p.dividendsMinor]) assertSafeMinor(n);
  }
  if (!(s.external.myrPerUsd > 0)) throw new Error('Corrupt save: invalid FX rate');
  for (const [id, quote] of Object.entries(s.market.quotes)) {
    if (!s.companies[id as keyof typeof s.companies] || !(quote.price > 0)) throw new Error('Corrupt save: invalid quote');
  }
  for (const o of s.fund.orders) {
    if (o.status === 'queued' && (!s.companies[o.ticker] || !Number.isSafeInteger(o.units) || o.units <= 0 || !['buy', 'sell'].includes(o.side))) throw new Error('Corrupt save: invalid pending order');
  }
  s.clock.paused = true; // always resume paused
  return s;
}
