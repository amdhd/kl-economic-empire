import { describe, expect, it } from 'vitest';
import { gdpHistory } from '../src/engine/gdp-history';
import { createGame, runHeadless } from '../src/engine/game';
import { bnTick } from '../src/utils/format';

describe('axis and summary amounts read in trillions from 1,000bn up', () => {
  it('bnTick ignores the tick index charts pass as a second argument', () => {
    expect(bnTick(130, 0 as unknown as string)).toBe('RM130bn');
    expect(bnTick(1150, 3 as unknown as string)).toBe('RM1.15tn');
    expect(bnTick(4240)).toBe('RM4.24tn');
    expect(bnTick(1500, 'US$')).toBe('US$1.5tn');
  });

  it('GDP history reasons never print four-digit billions', () => {
    const s = createGame(5, 'balanced', 'malaysia', { months: 24, boom: true });
    s.government.policies.tax.corporate = 0.18;
    runHeadless(s, 24 * 31 * 3);
    s.reports.forEach((r) => (r.nominalGdp *= 6)); // push the run rate past US$1,000bn
    for (const m of gdpHistory(s)) for (const r of m.reasons) expect(r).not.toMatch(/\b\d{4}bn/);
  });
});
