import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { BOOM } from '../src/data/boom';
import { dealSpot, deliveryShare, exportContractFlows, mineralIndex, mineralRamp } from '../src/engine/export-contracts';
import { withoutEvents } from './helpers';

const boom = () => createGame(11, 'balanced', 'malaysia', { months: 36, boom: true });
const openMineral = (s: ReturnType<typeof boom>, template = 'export:copper') => {
  s.government.treasury = 5e12; // RM50bn in sen: plenty for the bond and build-out
  runHeadless(s, 24 * 95); // past the first quarterly cohort so every offer exists
  return s.deals.items.find((d) => d.template === template && d.status === 'opportunity')!;
};

describe('Mining and processing ventures (D-130)', () => {
  it('mineral offers exist in Boom mode only', () => withoutEvents(() => {
    const b = boom(); const r = createGame(11, 'balanced', 'malaysia');
    runHeadless(b, 24 * 40); runHeadless(r, 24 * 40);
    const minerals = ['export:copper', 'export:lithium', 'export:tin', 'export:rareearths'];
    for (const t of minerals) expect(b.deals.items.some((d) => d.template === t), t).toBe(true);
    for (const t of minerals) expect(r.deals.items.some((d) => d.template === t), t).toBe(false);
  }));

  it('a copper venture costs a bond and a build-out, ramps output, adds capacity and pays a royalty', () => withoutEvents(() => {
    const s = boom(), control = boom();
    const d = openMineral(s); runHeadless(control, 24 * 95);
    expect(d).toBeTruthy();
    expect(d.assetCostMinor).toBeGreaterThan(0);
    expect(d.priceMinor).toBeCloseTo((d.volume! * (BOOM.mineralBondShare + BOOM.mineralCapexShare)) * 100, -2);
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'review' }, 0).ok).toBe(true);
    const cash0 = s.government.treasury, cap0 = s.sectors.util.capacity;
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'sign' }, 0).ok).toBe(true);
    expect(s.government.treasury).toBeLessThan(cash0 - d.priceMinor + 1);
    // Build-out: ramp rises over the build days; deliveries start at zero.
    runHeadless(s, 24 * 2);
    expect(mineralRamp(s, d)).toBeGreaterThan(0);
    expect(mineralRamp(s, d)).toBeLessThan(0.1);
    runHeadless(s, 24 * 60);
    const midRamp = mineralRamp(s, d);
    expect(midRamp).toBeGreaterThan(0.4); expect(midRamp).toBeLessThan(0.6);
    const flowsMid = exportContractFlows(s).volume.mining;
    runHeadless(s, 24 * (BOOM.mineralBuildDays - 60 + 5));
    expect(mineralRamp(s, d)).toBe(1);
    expect(d.integrationDone).toBe(true);
    expect(s.sectors.util.capacity).toBeGreaterThan(cap0); // the venture adds capacity
    const flowsFull = exportContractFlows(s).volume.mining;
    expect(flowsFull).toBeGreaterThan(flowsMid * 1.5);
    expect(flowsFull).toBeGreaterThan(d.volume! * 0.4 / 365 * 0.5); // at least a large part of the extra half of the contract
    // The build-out was paid from escrow, so only the bond remains.
    expect(d.escrowMinor).toBe(d.priceMinor - d.assetCostMinor!);
    expect(d.paidMinor).toBeGreaterThan(0.95 * d.assetCostMinor!);
    // The state collected a royalty.
    expect(s.government.mtd.policyLevy + s.reports.reduce((a, r) => a + r.gov.policyLevy, 0)).toBeGreaterThan(control.government.mtd.policyLevy + control.reports.reduce((a, r) => a + r.gov.policyLevy, 0));
  }));

  it('revenue follows the mineral price, and lithium is more volatile than copper', () => withoutEvents(() => {
    const s = boom();
    const d = openMineral(s, 'export:lithium');
    applyCommand(s, { type: 'deal', id: d.id, action: 'review' }, 0); applyCommand(s, { type: 'deal', id: d.id, action: 'sign' }, 0);
    runHeadless(s, 24 * (BOOM.mineralBuildDays + 3));
    const v1 = exportContractFlows(s).volume.mining;
    s.world.prices.copper *= 1.5; // lithium follows copper with a beta above one
    const v2 = exportContractFlows(s).volume.mining;
    expect(v2).toBeGreaterThan(v1 * 1.5);
    expect(dealSpot(s, d)).toBeCloseTo(mineralIndex(s, 'lithium') * (s.external.myrPerUsd / (s.tradeBook.base.fx || s.external.myrPerUsd)), 9);
    const spread = (id: 'copper' | 'lithium') => { const xs: number[] = []; for (let day = 0; day < 1500; day += 25) { s.external.daysElapsed = day; xs.push(mineralIndex(s, id)); } return Math.max(...xs) / Math.min(...xs); };
    s.world.prices.copper = 1;
    expect(spread('lithium')).toBeGreaterThan(spread('copper') * 1.4);
  }));

  it('delivery is capped by the supplying sector’s utilisation', () => withoutEvents(() => {
    const s = boom();
    const d = openMineral(s);
    applyCommand(s, { type: 'deal', id: d.id, action: 'review' }, 0); applyCommand(s, { type: 'deal', id: d.id, action: 'sign' }, 0);
    runHeadless(s, 24 * (BOOM.mineralBuildDays + 3));
    s.sectors.util.utilization = 1;
    const full = deliveryShare(s, d);
    s.sectors.util.utilization = 1.2;
    expect(deliveryShare(s, d)).toBeLessThan(full);
  }));
});
