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

describe('treasury explanation', () => {
  it('measures month-one cash change from the opening balance in ringgit', async () => {
    const { createGame } = await import('../src/engine/game');
    const { explainEconomy } = await import('../src/engine/economic-explanations');
    const s = createGame(20270101, 'balanced');
    expect(explainEconomy(s, 'treasury').summary).toContain('change RM0.000bn');
  });
});
