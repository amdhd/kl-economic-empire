import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { BOOM } from '../src/data/boom';
import { INFRA, NETWORKS, NETWORK_SPECS } from '../src/data/infrastructure';
import { dailyInfra, infraCapacityMult, orderCost, projectedLoad, utilisation } from '../src/engine/infrastructure';
import { deserialize, findNonFinite, serialize } from '../src/persistence/save';
import { infraAutopilot, withoutEvents } from './helpers';

const boom = (months: 24 | 36 = 36) => createGame(2027, 'balanced', 'malaysia', { months, boom: true });
const usd = (s: ReturnType<typeof boom>, label: string) => { const r = s.reports.find((x) => x.label === label)!; return (r.nominalGdp * 365) / 31 / r.myrPerUsd; };

describe('infrastructure capacity (D-084)', () => {
  it('exists only in Boom mode, opens with a 25% reserve, and realistic play never reads it', () => {
    expect(createGame(1).infra).toBeUndefined();
    const s = boom();
    expect(s.infra).toBeDefined();
    for (const n of NETWORKS) expect(s.infra!.nets[n].capacity).toBe(INFRA.openingCapacity);
    expect(applyCommand(createGame(1), { type: 'buildInfra', network: 'power', steps: 1 }, 0).ok).toBe(false);
    const j = 'ind' as const;
    expect(infraCapacityMult(createGame(1), j)).toBe(1);
  });

  it('overload throttles sector capacity, bounded by the floor; spare capacity does not', () => {
    const s = boom();
    const st = s.infra!;
    st.gdpFast = st.gdpSlow = st.openingGdpReal * 1.2; // load ≈ 1.17 on power, below the 1.25 capacity
    dailyInfra(s, st.gdpFast / 365);
    expect(infraCapacityMult(s, 'ind')).toBe(1);
    st.gdpFast = st.gdpSlow = st.openingGdpReal * 3;
    for (let i = 0; i < 400; i++) dailyInfra(s, st.openingGdpReal * 3 / 365);
    expect(utilisation(st, 'power')).toBeGreaterThan(1);
    const m = infraCapacityMult(s, 'ind');
    expect(m).toBeLessThan(0.9);
    expect(m).toBeGreaterThanOrEqual(INFRA.floor);
    expect(s.news.some((n) => n.title.includes('over capacity'))).toBe(true);
    // Industry (weight 1) is hurt at least as much as finance (weight 0.3) on every network.
    expect(infraCapacityMult(s, 'ind')).toBeLessThanOrEqual(infraCapacityMult(s, 'fin'));
  });

  it('ordering validates input, costs scale with the economy, and capacity arrives only after the build time', () => withoutEvents(() => {
    const s = boom();
    expect(applyCommand(s, { type: 'buildInfra', network: 'power', steps: 3 }, 0).ok).toBe(false);
    expect(applyCommand(s, { type: 'buildInfra', network: 'nope' as never, steps: 1 }, 0).ok).toBe(false);
    const cost = orderCost(s, 'power', 2);
    expect(cost).toBeCloseTo(BOOM.infraCostFactor * NETWORK_SPECS.power.costGdpShare * 2 * INFRA.step * s.baseline.nominalGdpAnnual * (s.indicators.cpi / 100), 0);
    expect(orderCost(s, 'power', 4)).toBeCloseTo(cost * 2, 0);
    s.infra!.gdpFast = s.infra!.openingGdpReal * 4;
    expect(orderCost(s, 'power', 2)).toBeGreaterThan(cost * 1.8); // size^0.5
    s.infra!.gdpFast = s.infra!.openingGdpReal;
    for (let i = 0; i < INFRA.maxBuildsPerNetwork; i++) expect(applyCommand(s, { type: 'buildInfra', network: 'power', steps: 1 }, s.clock.hour * 60).ok).toBe(true);
    expect(applyCommand(s, { type: 'buildInfra', network: 'power', steps: 1 }, s.clock.hour * 60).ok).toBe(false);
    runHeadless(s, 24 * 10);
    expect(s.infra!.nets.power.capacity).toBe(INFRA.openingCapacity);
    runHeadless(s, 24 * (NETWORK_SPECS.power.buildDays + 30));
    expect(s.infra!.nets.power.capacity).toBeCloseTo(INFRA.openingCapacity + 4 * INFRA.step, 9);
    expect(s.infra!.builds).toHaveLength(0);
    expect(s.news.some((n) => n.title.startsWith('Completed: Power grid'))).toBe(true);
  }));

  it('a cancelled build stops spending and adds nothing', () => withoutEvents(() => {
    const s = boom();
    applyCommand(s, { type: 'buildInfra', network: 'housing', steps: 1 }, 0);
    runHeadless(s, 24 * 10);
    const id = s.infra!.builds[0].id;
    expect(applyCommand(s, { type: 'cancelInfra', id }, s.clock.hour * 60).ok).toBe(true);
    runHeadless(s, 24 * 400);
    expect(s.infra!.nets.housing.capacity).toBe(INFRA.openingCapacity);
    expect(applyCommand(s, { type: 'cancelInfra', id }, s.clock.hour * 60).ok).toBe(false);
  }));

  it('the planning projection rises on a growing economy', () => withoutEvents(() => {
    const s = boom();
    runHeadless(s, 24 * 400);
    for (const n of NETWORKS) expect(projectedLoad(s.infra!, n)).toBeGreaterThanOrEqual(s.infra!.nets[n].load);
  }));

  it('a player who ignores capacity ends well behind one who builds ahead, with the books intact', () => withoutEvents(() => {
    const lazy = boom(), keen = boom();
    runHeadless(lazy, 24 * 31 * 40);
    runHeadless(keen, 24 * 31 * 40, infraAutopilot);
    expect(lazy.scheduler.campaignEnded && keen.scheduler.campaignEnded).toBe(true);
    expect(usd(keen, 'Dec 2029')).toBeGreaterThan(usd(lazy, 'Dec 2029') * 1.1); // was 1.15 before power took one month (D-096): the whole bill now lands at once
    expect(usd(keen, 'Dec 2029')).toBeGreaterThan(1.6e12);
    expect(Math.min(...NETWORKS.map((n) => utilisation(lazy.infra!, n)))).toBeLessThan(10);
    expect(Math.max(...NETWORKS.map((n) => utilisation(lazy.infra!, n)))).toBeGreaterThan(1.3);
    expect(Math.max(...NETWORKS.map((n) => utilisation(keen.infra!, n)))).toBeLessThan(1.3);
    for (const s of [lazy, keen]) {
      expect(s.reports.every((r) => r.reconciliation!.cashResidualMinor === 0 && r.reconciliation!.debtResidualMinor === 0)).toBe(true);
      expect(findNonFinite(s)).toBeNull();
    }
  }), 120_000);

  it('saves round-trip with builds in progress and reject corrupt infrastructure', () => withoutEvents(() => {
    const s = boom();
    applyCommand(s, { type: 'buildInfra', network: 'transport', steps: 2 }, 0);
    runHeadless(s, 24 * 60);
    expect(deserialize(serialize(s))).toEqual(s);
    const bad = JSON.parse(serialize(s));
    bad.state.infra.nets.power.capacity = -1;
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/infrastructure/);
  }));
});
