import { describe, expect, it } from 'vitest';
import type { DailyPoint } from '../src/types/game';
import { compactBillions, signedBillions, treasuryTrend } from '../src/utils/treasury-trend';

const pt = (t: number, treasury: number) => ({ t, treasury }) as DailyPoint;

describe('treasury trend (bottom-bar chip)', () => {
  it('formats day changes in signed billions, falling back to millions for small moves', () => {
    expect(signedBillions(1e9)).toBe('+1.0B');
    expect(signedBillions(-2.46e9)).toBe('−2.5B');
    expect(signedBillions(35e6)).toBe('+35.0M');
    expect(signedBillions(0)).toBe('+0.0B');
    expect(compactBillions(868.5e9, '$')).toBe('$868.5B');
    expect(compactBillions(7.0174e9)).toBe('RM 7.02B');
  });

  it('is empty before the first daily close', () => {
    expect(treasuryTrend([])).toEqual({ close: null, dayChange: 0, weekChange: 0, weekPct: 0, history: [] });
  });

  it('uses the latest close, the previous close and the close seven days earlier', () => {
    const daily = Array.from({ length: 40 }, (_, i) => pt(i, 10e9 + i * 0.5e9));
    const t = treasuryTrend(daily);
    expect(t.close).toBe(daily[39].treasury);
    expect(t.dayChange).toBeCloseTo(0.5e9);
    expect(t.weekChange).toBeCloseTo(3.5e9);
    expect(t.weekPct).toBeCloseTo(3.5e9 / daily[32].treasury);
    expect(t.history).toHaveLength(30);
    expect(t.history[0]).toBe(daily[10].treasury);
  });

  it('measures the week from the oldest close when history is shorter than a week', () => {
    const t = treasuryTrend([pt(0, 10e9), pt(1, 9e9), pt(2, 8.5e9)]);
    expect(t.dayChange).toBeCloseTo(-0.5e9);
    expect(t.weekChange).toBeCloseTo(-1.5e9);
    expect(t.weekPct).toBeCloseTo(-0.15);
  });
});

describe('corporate tax instalments (D-072)', () => {
  it('smooth month-one cash and settle only the difference at month close', async () => {
    const { createGame, runHeadless } = await import('../src/engine/game');
    const s = createGame(2027, 'balanced');
    const open = s.government.treasury;
    runHeadless(s, 24 * 7);
    expect(s.government.mtd.taxCorporate).toBeGreaterThan(0); // collected before month close
    expect(open - s.government.treasury).toBeLessThan(4.0e9 * 100); // week-one burn is well below the unsmoothed ~RM4.3bn
    runHeadless(s, 24 * 25);
    expect(s.reports).toHaveLength(1);
    expect(s.government.mtd.taxCorporate).toBeLessThan(s.reports[0].gov.taxCorporate * 0.5);
  });

  it('refund instalments above the bill: a 0% rate collects nothing, and the books still reconcile', async () => {
    const { applyCommand, createGame } = await import('../src/engine/game');
    const { runUntil, withoutEvents } = await import('./helpers');
    withoutEvents(() => {
      const s = createGame(2027, 'balanced');
      runUntil(s, 2027, 3, 31, 9);
      expect(applyCommand(s, { type: 'queueTax', patch: { corporate: 0 } }, s.clock.hour * 60).ok).toBe(true);
      runUntil(s, 2027, 5, 1, 1);
      const april = s.reports.at(-1)!;
      expect(april.label).toMatch(/Apr/);
      expect(s.reports.at(-2)!.gov.taxCorporate).toBeGreaterThan(1e9); // March still taxed at 24%
      expect(Math.abs(april.gov.taxCorporate)).toBeLessThan(1); // instalments at the old rate were all refunded
      expect(april.reconciliation!.cashResidualMinor).toBe(0);
    });
  });

  it('do not count palm-plantation tax as a sector instalment', async () => {
    const { createGame, runHeadless } = await import('../src/engine/game');
    const { clone, runUntil, withoutEvents } = await import('./helpers');
    withoutEvents(() => {
      const s = createGame(2027, 'balanced');
      runUntil(s, 2027, 3, 31, 23);
      const withPalm = clone(s), noPalm = clone(s);
      noPalm.world.mtdPalmProfit = 0;
      const palmTax = Math.max(0, s.world.mtdPalmProfit) * s.government.policies.tax.corporate;
      expect(palmTax).toBeGreaterThan(1e8);
      runHeadless(withPalm, 1); runHeadless(noPalm, 1);
      expect(withPalm.reports.at(-1)!.gov.taxCorporate - noPalm.reports.at(-1)!.gov.taxCorporate).toBeCloseTo(palmTax, 0);
    });
  });
});
