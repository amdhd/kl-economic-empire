import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { dailyGovernment } from '../src/engine/government';
import { klDay } from '../src/engine/time';

const setup = () => {
  const s = createGame(2027, 'balanced', 'malaysia', { months: 24 });
  s.government.projects.push({ ...structuredClone(s.government.projects[0] ?? {}), id: 999, templateId: 'test', name: 'Test works', kind: 'transport', cost: 5e9, spent: 0, work: 0, startDay: 0, durationDays: 100, status: 'building' } as never);
  return s;
};
const today = (s: ReturnType<typeof setup>) => klDay(s.clock.hour * 60);

describe('Treasury payment priority when cash is short (D-137)', () => {
  it('pays today’s operating bills and transfers in full before old arrears and capital works', () => {
    const s = setup();
    const gov = s.government;
    gov.marketAccess = false;
    gov.unpaidObligations = 50e9;
    // Measure a normal day's operating bill, then leave about 1.5 days of it in the treasury.
    const probe = setup();
    probe.government.treasury = 1e14;
    probe.government.unpaidObligations = 0;
    const before = { ...probe.government.mtd };
    dailyGovernment(probe, today(probe));
    const essentials = probe.government.mtd.opex - before.opex + probe.government.mtd.subsidy - before.subsidy;
    gov.treasury = Math.round(essentials * 1.5 * 100);
    const day = dailyGovernment(s, today(s));
    expect(day.paidFraction).toBe(1);
    expect(gov.mtd.capex).toBe(0); // the remaining cash went to arrears, not works
    expect(gov.unpaidObligations).toBeGreaterThan(49e9);
    expect(gov.unpaidObligations).toBeLessThan(50e9);
  });

  it('bridge financing does not multiply old arrears into the cash buffer', () => {
    const s = setup();
    const gov = s.government;
    gov.treasury = 0;
    gov.unpaidObligations = 50e9;
    dailyGovernment(s, today(s));
    // Arrears are borrowed once; the buffer adds about a week of recurring dues (1 month × 0.25 × 30 days), not 7.5× the arrears.
    expect(gov.mtd.borrowing).toBeGreaterThan(50e9);
    expect(gov.mtd.borrowing).toBeLessThan(50e9 + 30e9);
    expect(gov.unpaidObligations).toBeLessThan(1e6);
  });
});
