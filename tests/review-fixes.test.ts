import { describe, expect, it } from 'vitest';
import { BOOM } from '../src/data/boom';
import { CONTRACTOR_OVERRUN_CAP } from '../src/engine/concessions';
import { pruneClosedDeals } from '../src/engine/deal-opportunities';
import { exportOffers, mineralRoyaltyDaily } from '../src/engine/export-contracts';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { withoutEvents } from './helpers';

const act = (s: ReturnType<typeof createGame>, id: number, action: 'review' | 'sign') => applyCommand(s, { type: 'deal', id, action }, s.clock.hour * 60);
const boom = () => createGame(11, 'balanced', 'malaysia', { months: 36, boom: true });

describe('Review fixes (D-133)', () => {
  it('a concession overrun is recorded on the deal and capped, so the contractor does not fund unlimited work', () => {
    const run = (price: number) => {
      const s = createGame(1722), d = s.deals.items.find((x) => x.kind === 'concession')!;
      act(s, d.id, 'review');
      expect(act(s, d.id, 'sign').ok).toBe(true);
      const p = s.government.projects.find((x) => x.id === d.projectId)!;
      for (let i = 0; i < 24 * (p.durationDays + 60) && p.status === 'building'; i++) { s.sectors.prop.price = price; runHeadless(s, 1); }
      return { d, p };
    };
    const mild = run(1.35);
    expect(mild.p.status).toBe('complete');
    expect(mild.d.overrunMinor).toBeGreaterThan(0);
    expect(mild.d.overrunMinor!).toBeLessThanOrEqual(Math.round(mild.d.assetCostMinor! * CONTRACTOR_OVERRUN_CAP));
    const extreme = run(6);
    expect(extreme.d.overrunMinor!).toBeLessThanOrEqual(Math.round(extreme.d.assetCostMinor! * CONTRACTOR_OVERRUN_CAP));
    expect(extreme.p.status).not.toBe('complete'); // a six-fold price is beyond what a fixed-price contractor absorbs
  });

  it('the mining royalty is a cost in the sector profit and equals the treasury receipt', () => withoutEvents(() => {
    const s = boom(), control = boom();
    s.government.treasury = 5e12; control.government.treasury = 5e12;
    runHeadless(s, 24 * 95); runHeadless(control, 24 * 95);
    const d = s.deals.items.find((x) => x.template === 'export:copper' && x.status === 'opportunity')!;
    act(s, d.id, 'review'); expect(act(s, d.id, 'sign').ok).toBe(true);
    expect(mineralRoyaltyDaily(s, 'util')).toBe(0); // nothing is delivered on the signing day
    runHeadless(s, 24 * (BOOM.mineralBuildDays + 3)); runHeadless(control, 24 * (BOOM.mineralBuildDays + 3));
    const royalty = mineralRoyaltyDaily(s, 'util');
    expect(royalty).toBeGreaterThan(0);
    expect(mineralRoyaltyDaily(s, 'fin')).toBe(0); // only the supplying sector bears it
    const total = (g: typeof s) => g.reports.reduce((a, r) => a + r.gov.policyLevy, 0) + g.government.mtd.policyLevy;
    const before = total(s) - total(control), n = 10;
    runHeadless(s, 24 * n); runHeadless(control, 24 * n);
    // Other policy levies are the same in both games, so the extra receipts over the control are the royalty.
    const extra = total(s) - total(control) - before;
    expect(extra).toBeGreaterThan(0.7 * n * royalty);
    expect(extra).toBeLessThan(1.3 * n * royalty);
  }));

  it('pruning closed deals does not bring the same export buyer back', () => withoutEvents(() => {
    const s = boom();
    runHeadless(s, 24 * 40);
    const t = 'export:chips';
    const first = s.deals.items.find((x) => x.template === t && x.status === 'opportunity')!;
    expect(first).toBeTruthy();
    const name = first.counterparty;
    first.status = 'expired'; // the offer lapses and is pruned
    pruneClosedDeals(s, 0);
    expect(s.deals.items.some((x) => x.id === first.id)).toBe(false);
    exportOffers(s);
    const next = s.deals.items.find((x) => x.template === t && x.status === 'opportunity')!;
    expect(next).toBeTruthy();
    expect(next.counterparty).not.toBe(name);
  }));
});
