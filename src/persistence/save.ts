// Versioned save format. Saving never mutates game state or advances the clock.
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
const MIGRATIONS: Record<number, Migration> = {};

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
  s.clock.paused = true; // always resume paused
  return s;
}
