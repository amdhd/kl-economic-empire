import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { capacitySlot, leverRampDays } from '../src/data/boom';
import { NETWORKS, NETWORK_SPECS } from '../src/data/infrastructure';
import { orderCost } from '../src/engine/infrastructure';
import { withoutEvents } from './helpers';

const supplyDeals = (s: ReturnType<typeof createGame>) => s.deals.items.filter((d) => d.kind === 'supply').length;

describe('Boom power builds and supply offers (D-108)', () => {
  it('a power order is delivered in about a month', () => withoutEvents(() => {
    const s = createGame(21, 'balanced', 'malaysia', { months: 36, boom: true });
    expect(NETWORK_SPECS.power.buildDays).toBe(30);
    const before = s.infra!.nets.power.capacity;
    expect(applyCommand(s, { type: 'buildInfra', network: 'power', steps: 1 }, 0).ok).toBe(true);
    expect(s.infra!.builds[0].durationDays).toBe(30);
    runHeadless(s, 24 * 45);
    expect(s.infra!.builds.length).toBe(0);
    expect(s.infra!.nets.power.capacity).toBeCloseTo(before + 0.25, 6);
  }));

  it('Boom mode offers fuel and steel supply every quarter; realistic mode keeps its schedule', () => withoutEvents(() => {
    const boom = createGame(22, 'balanced', 'malaysia', { months: 36, boom: true });
    const real = createGame(22, 'balanced', 'malaysia', { months: 36 });
    runHeadless(boom, 24 * 31 * 18);
    runHeadless(real, 24 * 31 * 18);
    expect(supplyDeals(real)).toBe(4);
    expect(supplyDeals(boom)).toBeGreaterThanOrEqual(supplyDeals(real) + 6);
  }));
});

describe('Boom build times and infrastructure cost (D-109)', () => {
  const boom = () => createGame(31, 'balanced', 'malaysia', { months: 36, boom: true });
  const real = () => createGame(31, 'balanced', 'malaysia', { months: 36 });

  it('projects take one to two months in Boom mode and keep their template time otherwise', () => {
    const b = boom(), r = real();
    for (const id of ['brt', 'jb_zone', 'clinics']) {
      expect(applyCommand(b, { type: 'startProject', templateId: id }, 0).ok).toBe(true);
      expect(applyCommand(r, { type: 'startProject', templateId: id }, 0).ok).toBe(true);
    }
    for (const p of b.government.projects) expect(p.durationDays).toBeGreaterThanOrEqual(30), expect(p.durationDays).toBeLessThanOrEqual(60);
    expect(r.government.projects.find((p) => p.templateId === 'brt')!.durationDays).toBe(270);
  });

  it('infrastructure orders cost a quarter of the realistic price and every network builds in at most two months', () => {
    const s = boom();
    expect(orderCost(s, 'power', 4)).toBeCloseTo(0.25 * NETWORK_SPECS.power.costGdpShare * s.baseline.nominalGdpAnnual * (s.indicators.cpi / 100), 0);
    for (const n of NETWORKS) expect(NETWORK_SPECS[n].buildDays).toBeLessThanOrEqual(60);
  });

  it('new capacity arrives after two months in Boom mode and six otherwise; policy phase-ins last at most a month', () => {
    const b = boom(), r = real();
    expect(capacitySlot(b)).toBe(1);
    expect(capacitySlot(r)).toBe(5);
    expect(b.sectors.tech.pipeline.map((v) => v > 0)).toEqual([true, true, false, false, false, false]);
    expect(r.sectors.tech.pipeline.every((v) => v > 0)).toBe(true);
    expect(leverRampDays(b, 365)).toBe(30);
    expect(leverRampDays(b, 20)).toBe(20);
    expect(leverRampDays(r, 365)).toBe(365);
  });
});
