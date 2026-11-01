import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { LEVER_IDS, buildProductivity } from '../src/engine/policy';
import { deserialize, serialize } from '../src/persistence/save';
import { withoutEvents } from './helpers';

const set = (s: ReturnType<typeof createGame>, value: number) =>
  expect(applyCommand(s, { type: 'setLever', lever: 'buildProductivity', value }, s.clock.hour * 60).ok).toBe(true);
const boom = (seed: number) => createGame(seed, 'balanced', 'malaysia', { months: 36, boom: true });

describe('construction & industry productivity programme (D-126)', () => {
  it('relieves a sector running far above capacity in Boom mode, and prices follow', () => withoutEvents(() => {
    const a = boom(21), b = boom(21);
    for (const s of [a, b]) for (const j of ['prop', 'ind'] as const) s.sectors[j].capacity *= 0.65; // an overheated economy
    set(b, 0.5);
    runHeadless(a, 24 * 240); runHeadless(b, 24 * 240);
    expect(a.sectors.prop.avgUtil).toBeGreaterThan(1.15);
    expect(b.sectors.prop.avgUtil).toBeLessThan(a.sectors.prop.avgUtil - 0.1);
    expect(b.sectors.ind.avgUtil).toBeLessThan(a.sectors.ind.avgUtil - 0.1);
    expect(b.indicators.cpi).toBeLessThan(a.indicators.cpi - 5);
    expect(b.indicators.nominalGdpAnnual).toBeGreaterThan(a.indicators.nominalGdpAnnual * 0.95);
  }));
  it('scales output per worker by sector at the full setting', () => withoutEvents(() => {
    const s = boom(21);
    set(s, 1);
    runHeadless(s, 24 * 90);
    expect(buildProductivity(s, 'prop')).toBeCloseTo(1.6, 6);
    expect(buildProductivity(s, 'ind')).toBeCloseTo(1.5, 6);
  }));
  it('does nothing in Realistic mode', () => withoutEvents(() => {
    const s = createGame(22);
    set(s, 1);
    expect(buildProductivity(s, 'prop')).toBe(1);
  }));
  it('an older save gains the lever switched off', () => {
    const s = createGame(23);
    const file = JSON.parse(serialize(s));
    delete file.state.policy.levers.buildProductivity;
    file.state.schemaVersion = 18; file.schemaVersion = 18;
    const t = deserialize(JSON.stringify(file));
    expect(LEVER_IDS.every((id) => t.policy.levers[id])).toBe(true);
    expect(t.policy.levers.buildProductivity.value).toBe(0);
  });
});
