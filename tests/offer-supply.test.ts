import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { attractiveness } from '../src/engine/fdi';
import { infraAutopilot, withoutEvents } from './helpers';

/** A hostile policy mix that used to drive the investment climate to its floor. */
const hostile = (g: ReturnType<typeof createGame>) => {
  g.government.policies.tax.corporate = 0.4;
  g.policy.levers.wealthTax.value = 0.02;
  g.policy.levers.capitalGainsTax.value = 0.3;
  g.policy.levers.topBandSurcharge.value = 0.1;
  g.policy.levers.transactionTax.value = 0.005;
};

/** Plays a Boom campaign for 24 months, signing every offer that appears, and records what arrived each month. */
function play(hostileClimate: boolean) {
  const g = createGame(20270101, 'balanced', 'malaysia', { months: 36, boom: true });
  if (hostileClimate) hostile(g);
  const pledgesByMonth: number[] = [], exportOpenByMonth: number[] = [];
  let seen = g.fdi.nextId - 1;
  for (let m = 1; m <= 24; m++) {
    let exportOpen = 0; // most export offers awaiting a decision at the start of a day this month
    for (let day = 0; day < 30; day++) {
      runHeadless(g, 24, (x) => {
        infraAutopilot(x);
        if (x.clock.hour % 24 === 8) exportOpen = Math.max(exportOpen, x.deals.items.filter((d) => d.kind === 'export' && ['opportunity', 'negotiating'].includes(d.status)).length);
        if (x.clock.hour % 24 !== 9) return;
        for (const p of x.fdi.pledges) if (p.status === 'offered') applyCommand(x, { type: 'decidePledge', id: p.id, approve: true, incentive: Math.min(0.3, p.ask) }, x.clock.hour * 60);
        // This player signs at most one export contract a month, the first on the list.
        const open = x.deals.items.find((d) => d.kind === 'export' && ['opportunity', 'negotiating'].includes(d.status));
        if (open && x.clock.hour % (24 * 30) === 9) { applyCommand(x, { type: 'deal', id: open.id, action: 'review' }, x.clock.hour * 60); applyCommand(x, { type: 'deal', id: open.id, action: 'sign' }, x.clock.hour * 60); }
      });

    }
    pledgesByMonth.push(g.fdi.nextId - 1 - seen);
    seen = g.fdi.nextId - 1;
    exportOpenByMonth.push(exportOpen);
  }
  return { g, pledgesByMonth, exportOpenByMonth };
}

describe('Boom offers keep arriving (D-130)', () => {
  it('FDI pledges and export offers appear in months 6, 12 and 24', () => withoutEvents(() => {
    const { pledgesByMonth, exportOpenByMonth } = play(false);
    for (const m of [6, 12, 24]) {
      expect(pledgesByMonth.slice(m - 3, m).reduce((a, b) => a + b, 0), `pledges in months ${m - 2}-${m}`).toBeGreaterThan(0);
      expect(exportOpenByMonth[m - 1], `export offers in month ${m}`).toBeGreaterThan(0);
    }
    // No month after the opening has an unbroken drought of more than two months.
    for (let m = 3; m < 24; m++) expect(pledgesByMonth.slice(m - 2, m + 1).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }), 240_000);

  it('a hostile tax and fiscal mix cannot switch off pledges', () => withoutEvents(() => {
    const g = createGame(20270101, 'balanced', 'malaysia', { months: 36, boom: true });
    hostile(g);
    expect(attractiveness(g, 'datacentre')).toBeLessThan(35); // the climate really is poor
    const { pledgesByMonth } = play(true);
    for (const m of [6, 12, 24]) expect(pledgesByMonth.slice(m - 3, m).reduce((a, b) => a + b, 0), `hostile, months ${m - 2}-${m}`).toBeGreaterThan(0);
  }), 240_000);

  it('realistic mode keeps its climate-driven hazard (no forced pledges)', () => withoutEvents(() => {
    const g = createGame(20270101, 'balanced', 'malaysia');
    hostile(g);
    g.fdi.pledges = [];
    runHeadless(g, 24 * 200);
    expect(g.fdi.pledges.filter((p) => p.offeredDay > g.deals.startDay).length).toBeLessThanOrEqual(3);
  }), 120_000);
});
