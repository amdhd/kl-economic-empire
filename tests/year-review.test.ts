import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { budgetOutlook, currentBudget, indexedBudget, latestClosedYear, planGrowth, yearReview } from '../src/engine/year-review';

const runMonths = (s: ReturnType<typeof createGame>, months: number) => runHeadless(s, months * 24 * 30.5);

describe('year in review (D-095)', () => {
  it('has no closed year until a December report exists, then summarises it', () => {
    const s = createGame(11);
    expect(latestClosedYear(s)).toBeNull();
    runMonths(s, 13);
    const year = latestClosedYear(s);
    expect(year).not.toBeNull();
    const r = yearReview(s, year!)!;
    expect(r.months).toBeGreaterThan(0);
    expect(r.months).toBeLessThanOrEqual(12);
    expect(r.gdp.usdEnd).toBeGreaterThan(0);
    expect(r.fiscal.revenue).toBeGreaterThan(0);
    expect(r.fiscal.outlays).toBeGreaterThan(0);
    expect(r.fiscal.deficit).toBeCloseTo(r.fiscal.outlays - r.fiscal.revenue, 0);
    expect(r.headlines.length).toBeGreaterThanOrEqual(3);
    expect(yearReview(s, year! + 5)).toBeNull();
  });

  it('is read-only: reviewing and projecting leave the state byte-identical', () => {
    const s = createGame(12);
    runMonths(s, 13);
    const before = JSON.stringify(s);
    yearReview(s, latestClosedYear(s)!);
    budgetOutlook(s, indexedBudget(s, 0.03));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('projects a smaller deficit for a cut and a larger one for a rise, and never mutates the budget', () => {
    const s = createGame(13);
    runMonths(s, 13);
    const now = currentBudget(s);
    const same = budgetOutlook(s, now)!;
    const cut = budgetOutlook(s, { ...now, admin: now.admin * 0.9 })!;
    const rise = budgetOutlook(s, { ...now, admin: now.admin * 1.1 })!;
    expect(cut.deficit).toBeLessThan(same.deficit);
    expect(rise.deficit).toBeGreaterThan(same.deficit);
    // An unchanged line keeps its plan's escalation (half the annual rise on average); a changed line is frozen at the new value.
    expect(cut.budgetChange - same.budgetChange).toBeCloseTo(-(0.1 + planGrowth(s, 'admin') / 2) * now.admin * 12, 0);
    expect(same.budgetChange).toBeGreaterThan(0);
    expect(cut.ratingScore).toBeGreaterThanOrEqual(same.ratingScore);
    expect(currentBudget(s)).toEqual(now);
  });

  it('queued plan lands through the normal queueBudget command', () => {
    const s = createGame(14);
    runMonths(s, 13);
    const now = currentBudget(s);
    const res = applyCommand(s, { type: 'queueBudget', patch: { admin: now.admin * 0.9 } }, Math.floor(s.clock.hour * 60));
    expect(res.ok).toBe(true);
    expect(currentBudget(s).admin).toBeCloseTo(Math.round((now.admin * 0.9) / 1e6) * 1e6, 0);
  });
});
