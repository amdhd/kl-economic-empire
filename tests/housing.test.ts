import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless, SCHEMA_VERSION } from '../src/engine/game';
import { HOUSING, housingApprovalPenalty, housingFairValue, housingStatus } from '../src/engine/housing';
import { deserialize, serialize } from '../src/persistence/save';
import { withoutEvents } from './helpers';

const months = (s: ReturnType<typeof createGame>, n: number) => runHeadless(s, 24 * 31 * n);

describe('house price index (D-118)', () => {
  it('opens at 100 and exactly at fair value, so nothing moves before the economy does', () => {
    for (const opts of [{}, { boom: true, months: 24 as const }]) {
      const s = createGame(117, 'balanced', 'malaysia', opts);
      expect(s.housing.index).toBe(100);
      expect(housingFairValue(s)).toBeCloseTo(100, 6);
      expect(housingStatus(s).tone).toBe('good');
      expect(housingApprovalPenalty(s)).toBe(0);
    }
  });

  it('fair value falls when the OPR or the property levy rises, and rises when rates fall', () => {
    const s = createGame(117);
    const base = housingFairValue(s);
    s.external.opr += 0.02;
    expect(housingFairValue(s)).toBeLessThan(base * 0.92);
    s.external.opr -= 0.04;
    expect(housingFairValue(s)).toBeGreaterThan(base * 1.05);
    s.external.opr += 0.02;
    s.government.policies.tax.property += 0.03;
    expect(housingFairValue(s)).toBeLessThan(base * 0.95);
  });

  it('rises with incomes, falls with unemployment, and with oversupply of homes in Boom mode', () => {
    const s = createGame(117, 'balanced', 'malaysia', { boom: true, months: 24 });
    const base = housingFairValue(s);
    s.households.wageIndex *= 1.1;
    expect(housingFairValue(s)).toBeGreaterThan(base);
    s.households.wageIndex /= 1.1;
    s.households.employed *= 0.95;
    expect(housingFairValue(s)).toBeLessThan(base);
    s.households.employed /= 0.95;
    s.infra!.nets.housing.load = s.infra!.nets.housing.capacity * 0.8 * s.housing.loadRef; // spare homes
    expect(housingFairValue(s)).toBeLessThan(base);
    s.infra!.nets.housing.load = s.infra!.nets.housing.capacity * 1.2 * s.housing.loadRef; // scarce homes
    expect(housingFairValue(s)).toBeGreaterThan(base);
  });

  it('a manual rate rise moves the index down relative to a rate cut, smoothly and within bounds', () => withoutEvents(() => {
    const hi = createGame(117), lo = createGame(117);
    applyCommand(hi, { type: 'cbPolicy', mode: 'manual', targetOpr: hi.external.opr + 0.03 }, hi.clock.hour * 60);
    applyCommand(lo, { type: 'cbPolicy', mode: 'manual', targetOpr: Math.max(0.005, lo.external.opr - 0.015) }, lo.clock.hour * 60);
    let prev = 100, worst = 0;
    runHeadless(hi, 24 * 31 * 12, (g) => {
      if (g.housing.index !== prev) { worst = Math.max(worst, Math.abs(g.housing.index / prev - 1)); prev = g.housing.index; }
    });
    months(lo, 12);
    expect(hi.housing.index).toBeLessThan(lo.housing.index);
    expect(worst).toBeLessThanOrEqual(HOUSING.maxStep + 1e-9);
    for (const s of [hi, lo]) expect(s.housing.index).toBeGreaterThanOrEqual(HOUSING.bounds[0]);
  }));

  it('a higher property levy leaves the index lower after a year', () => withoutEvents(() => {
    const a = createGame(117), b = createGame(117);
    applyCommand(b, { type: 'queueTax', patch: { property: 0.08 } }, b.clock.hour * 60);
    months(a, 8); months(b, 8);
    expect(b.housing.index).toBeLessThan(a.housing.index);
  }));

  it('is deterministic for one seed, in both modes, and records a monthly history', () => {
    for (const opts of [{}, { boom: true, months: 24 as const }]) {
      const run = () => { const s = createGame(117, 'balanced', 'malaysia', opts); months(s, 10); return s; };
      const a = run(), b = run();
      expect(a.housing).toEqual(b.housing);
      expect(a.reports.map((r) => r.housingIndex)).toEqual(b.reports.map((r) => r.housingIndex));
      expect(a.reports.every((r) => Number.isFinite(r.housingIndex))).toBe(true);
      expect(a.housing.index).toBeGreaterThan(HOUSING.bounds[0]);
      expect(a.housing.index).toBeLessThan(HOUSING.bounds[1]);
    }
  });

  it('unaffordable homes shave only a little off approval', () => {
    const s = createGame(117);
    s.housing.index = 200;
    expect(housingStatus(s).tone).toBe('bad');
    expect(housingApprovalPenalty(s)).toBeGreaterThan(0);
    expect(housingApprovalPenalty(s)).toBeLessThanOrEqual(HOUSING.approvalCap);
    s.housing.index = 118;
    expect(housingStatus(s).tone).toBe('watch');
    expect(housingApprovalPenalty(s)).toBe(0);
  });

  it('round-trips through a save, and an older save opens neutral', () => {
    const s = createGame(117);
    months(s, 4);
    const t = deserialize(serialize(s));
    expect(t.housing).toEqual(s.housing);
    const file = JSON.parse(serialize(s));
    delete file.state.housing;
    for (const r of file.state.reports) delete r.housingIndex;
    file.state.schemaVersion = 17; file.schemaVersion = 17;
    const old = deserialize(JSON.stringify(file));
    expect(old.schemaVersion).toBe(SCHEMA_VERSION);
    expect(old.housing.index).toBe(100);
    expect(Math.abs(housingFairValue(old) - 100)).toBeLessThan(5);
    expect(housingStatus(old).tone).toBe('good');
  });
});
