import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { overallAttractiveness } from '../src/engine/fdi';
import { LEVER_IDS } from '../src/engine/policy';
import { deserialize, serialize } from '../src/persistence/save';
import type { LeverId } from '../src/types/game';
import { withoutEvents } from './helpers';

const lever = (s: ReturnType<typeof createGame>, id: LeverId, value: number) =>
  expect(applyCommand(s, { type: 'setLever', lever: id, value }, s.clock.hour * 60).ok).toBe(true);

describe('hub and free-zone policies (D-098)', () => {
  it('raise the investment climate at once', () => withoutEvents(() => {
    const s = createGame(98), base = overallAttractiveness(s);
    lever(s, 'hqRegime', 1); lever(s, 'freeZones', 1);
    expect(overallAttractiveness(s)).toBeGreaterThan(base + 10);
  }));

  it('strengthen the ringgit', () => withoutEvents(() => {
    const a = createGame(98), b = createGame(98);
    lever(b, 'ringgitPush', 1); lever(b, 'financialHub', 1);
    runHeadless(a, 24 * 120); runHeadless(b, 24 * 120);
    expect(b.external.myrPerUsd).toBeLessThan(a.external.myrPerUsd * 0.95);
  }));

  it('bring fees into the treasury, and the books still reconcile', () => withoutEvents(() => {
    const s = createGame(98);
    lever(s, 'financialHub', 1); lever(s, 'freeZones', 1); lever(s, 'goldenVisa', 1); lever(s, 'hqRegime', 1); lever(s, 'tourismDrive', 1e9);
    runHeadless(s, 24 * 90);
    expect(s.policy.lastMonth.hubFees).toBeGreaterThan(0);
    expect(s.policy.lastMonth.hubSpend).toBeGreaterThan(0);
    expect(s.reports.length).toBeGreaterThanOrEqual(2);
    expect(s.reports.every((r) => r.reconciliation!.cashResidualMinor === 0)).toBe(true);
  }));

  it('the golden visa and the promotion budget lift tourism exports', () => withoutEvents(() => {
    const a = createGame(98), b = createGame(98);
    lever(b, 'goldenVisa', 1); lever(b, 'tourismDrive', 2e9);
    runHeadless(a, 24 * 150); runHeadless(b, 24 * 150);
    expect(b.sectors.cons.demandCapped).toBeGreaterThan(a.sectors.cons.demandCapped);
  }));

  it('an older save gains the new levers switched off', () => {
    const s = createGame(98);
    const file = JSON.parse(serialize(s));
    for (const id of ['hqRegime', 'financialHub', 'freeZones', 'goldenVisa', 'tourismDrive', 'ringgitPush']) delete file.state.policy.levers[id];
    delete file.state.policy.mtd.hubFees; delete file.state.policy.lastMonth.hubSpend;
    file.state.schemaVersion = 15; file.schemaVersion = 15;
    const t = deserialize(JSON.stringify(file));
    expect(LEVER_IDS.every((id) => t.policy.levers[id])).toBe(true);
    expect(t.policy.levers.goldenVisa.value).toBe(0);
    expect(t.policy.mtd.hubFees).toBe(0);
  });
});
