import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { prunePledges } from '../src/engine/fdi';
import { bankIdentityGap } from '../src/engine/banks';
import { standingBoard } from '../src/engine/standing';
import { deserialize, findNonFinite, serialize } from '../src/persistence/save';
import type { FdiPledge } from '../src/types/game';
import { clone, infraAutopilot, withoutEvents } from './helpers';

type S = ReturnType<typeof createGame>;
const usdAt = (s: S, label: string) => { const r = s.reports.find((x) => x.label === label)!; return (r.nominalGdp * 365) / 31 / r.myrPerUsd; };
function play(s: S) {
  runHeadless(s, 24 * 31 * 130, (g) => {
    infraAutopilot(g);
    if (g.clock.hour % 24 === 9) for (const p of g.fdi.pledges) if (p.status === 'offered') applyCommand(g, { type: 'decidePledge', id: p.id, approve: true, incentive: Math.min(0.3, p.ask) }, g.clock.hour * 60);
  });
}

describe('campaign length and Boom mode (D-079)', () => {
  it('defaults to a realistic 24-month term; options set the end date and campaign id', () => {
    const s = createGame(1);
    expect(s.mode).toEqual({ boom: false, months: 24 });
    const b = createGame(1, 'balanced', 'malaysia', { months: 36, boom: true });
    expect(b.mode).toEqual({ boom: true, months: 36 });
    expect((b.clock.endHour - b.clock.startHour) / 24).toBe(365 * 3 + 1); // 2027–2029 includes 29 Feb 2028
    expect(b.campaignId).toContain('-boom-36m');
    expect(createGame(1, 'balanced', 'malaysia', { months: 7 as 24 }).mode.months).toBe(24); // invalid length falls back
  });

  it('a realistic campaign is unchanged by the Boom code paths', () => withoutEvents(() => {
    const a = createGame(5), b = clone(a);
    b.mode = { boom: false, months: 24 };
    runHeadless(a, 24 * 90); runHeadless(b, 24 * 90);
    expect(a.reports.map((r) => r.realGdp)).toEqual(b.reports.map((r) => r.realGdp));
  }));

  it('Boom reaches about US$2tn by the end of year three with the books intact', () => withoutEvents(() => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 36, boom: true });
    play(s);
    expect(s.scheduler.campaignEnded).toBe(true);
    expect(s.reports).toHaveLength(36);
    expect(usdAt(s, 'Dec 2029')).toBeGreaterThan(1.6e12);
    expect(usdAt(s, 'Dec 2029')).toBeLessThan(3e12);
    expect(s.reports.every((r) => r.reconciliation!.cashResidualMinor === 0 && r.reconciliation!.debtResidualMinor === 0)).toBe(true);
    expect(Math.abs(bankIdentityGap(s))).toBeLessThan(1);
    expect(findNonFinite(s)).toBeNull();
    expect(s.reports.slice(12).every((r) => r.inflationYoY > -0.06 && r.inflationYoY < 0.14)).toBe(true); // infrastructure bottlenecks (D-084) push the year-two overheating hump to about 11–12%
    expect(deserialize(serialize(s))).toEqual(s);
  }), 120_000);

  it('a ten-year Boom term runs to the end, keeps every report and climbs the world table', () => withoutEvents(() => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 120, boom: true });
    play(s);
    expect(s.reports).toHaveLength(120);
    expect(s.fdi.standing.length).toBe(121);
    const me = standingBoard(s).find((x) => x.isMalaysia)!;
    expect(me.rank).toBeLessThanOrEqual(3);
    expect(s.government.treasury).toBeLessThan(Number.MAX_SAFE_INTEGER / 2);
    expect(s.deals.items.length).toBeLessThanOrEqual(200);
    expect(s.fdi.pledges.filter((p) => p.status === 'operating').length).toBeGreaterThan(50);
  }), 300_000);

  it('pruning pledges never drops projects that are building or operating', () => {
    const p = (id: number, status: FdiPledge['status']) => ({ id, status }) as FdiPledge;
    const f = { pledges: [p(1, 'operating'), p(2, 'withdrawn'), p(3, 'building'), p(4, 'declined'), p(5, 'operating')] } as Parameters<typeof prunePledges>[0];
    prunePledges(f, 2);
    expect(f.pledges.map((x) => x.id)).toEqual([1, 3, 5]);
  });

  it('older saves migrate to a realistic 24-month term', () => {
    const s = createGame(9);
    const file = JSON.parse(serialize(s));
    delete file.state.mode;
    file.state.schemaVersion = 13;
    expect(deserialize(JSON.stringify(file)).mode).toEqual({ boom: false, months: 24 });
  });
});
