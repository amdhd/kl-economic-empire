import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { BASE_BUDGET } from '../src/data/economic-baseline';
import { INSOLVENCY_EXIT_MONTHS } from '../src/engine/government';
import { deserialize, serialize } from '../src/persistence/save';
import { withoutEvents } from './helpers';

const closes = (s: ReturnType<typeof createGame>, n: number) => {
  const target = s.reports.length + n;
  runHeadless(s, 24 * 31 * (n + 1), (st) => { if (st.reports.length >= target) st.scheduler.campaignEnded = true; });
  s.scheduler.campaignEnded = false;
};

describe('Insolvency exit (D-136)', () => {
  it('a solvent government with no arrears regains market access after six clean closes', () => withoutEvents(() => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 24 });
    s.government.insolvent = true;
    s.government.marketAccess = false;
    s.government.treasury += 1e14; // RM1tn of cash: no borrowing is needed to stay current
    closes(s, INSOLVENCY_EXIT_MONTHS - 1);
    expect(s.government.insolvent).toBe(true);
    expect(s.government.solventMonths).toBe(INSOLVENCY_EXIT_MONTHS - 1);
    // The counter survives a save round trip.
    expect(deserialize(serialize(s)).government.solventMonths).toBe(INSOLVENCY_EXIT_MONTHS - 1);
    closes(s, 1);
    expect(s.government.insolvent).toBe(false);
    expect(s.government.marketAccess).toBe(true);
    expect(s.indicators.score.caps.join()).not.toMatch(/insolvency/);
  }), 60_000);

  it('a default caused by zero taxes ends after the taxes are restored, within a ten-year term', () => {
    const s = createGame(2027, 'balanced', 'malaysia', { months: 120 });
    applyCommand(s, { type: 'queueTax', patch: { corporate: 0, property: 0, consumption: 0, incomeTax: 0.5 } }, s.clock.hour * 60);
    let defaulted = -1, exited = -1;
    runHeadless(s, 24 * 31 * 120, (st) => {
      if (defaulted < 0 && st.government.insolvent) {
        defaulted = st.reports.length;
        // Without market access only a cash surplus clears arrears: taxes back up and budgets trimmed.
        applyCommand(st, { type: 'queueTax', patch: { corporate: 0.3, property: 0.08, consumption: 0.1, incomeTax: 1.3 } }, st.clock.hour * 60);
        applyCommand(st, { type: 'queueBudget', patch: Object.fromEntries(Object.entries(BASE_BUDGET).map(([k, v]) => [k, v * 0.7])) }, st.clock.hour * 60);
      }
      if (defaulted >= 0 && exited < 0 && !st.government.insolvent) exited = st.reports.length;
    });
    expect(defaulted).toBeGreaterThan(0);
    expect(exited).toBeGreaterThan(defaulted);
    expect(exited - defaulted).toBeLessThan(36);
    expect(s.government.marketAccess).toBe(true);
  }, 120_000);
});
