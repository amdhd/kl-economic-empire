import { describe, expect, it } from 'vitest';
import { BASELINE } from '../src/data/economic-baseline';
import { campaignReport } from '../src/engine/campaign-report';
import { displayMinutes } from '../src/engine/clock';
import { advance, applyCommand, createGame, runHeadless } from '../src/engine/game';
import { annualRealOutput, computeScore, externalGrowthAdjustment, MAX_EXTERNAL_ADJUSTMENT, outcomeLabel, publicNetWorth, scoreDrivers } from '../src/engine/indicators';
import { injectFund } from '../src/engine/sovereign-fund';
import { daysInMonth, klDay, klToEpochMin } from '../src/engine/time';
import { deserialize, findNonFinite, serialize } from '../src/persistence/save';
import type { GameState } from '../src/types/game';
import { clone, runUntil, withoutEvents } from './helpers';

describe('Phase 6 score calibration', () => {
  it('measures identical daily real output equally across 28-, 29- and 31-day months', () => withoutEvents(() => {
    const s = createGame(601);
    runUntil(s, 2028, 3, 1);
    for (const r of s.reports) r.realGdp = s.baseline.realGdpAnnual / 365 * daysInMonth(Math.floor(r.monthKey / 12), r.monthKey % 12 + 1);
    for (const r of s.reports) expect(annualRealOutput([r])).toBeCloseTo(s.baseline.realGdpAnnual, 3);
    expect(annualRealOutput(s.reports.slice(-3))).toBeCloseTo(s.baseline.realGdpAnnual, 3);
    expect(scoreDrivers(s).realGrowth).toBeCloseTo(0, 12);
  }));

  it('only uses elapsed macro exposure, with bounded headwind and tailwind adjustments', () => {
    const s = createGame(602);
    const start = klDay(s.clock.startHour * 60);
    s.scheduler.lastDay = start + 90;
    const event = { id: 1, templateId: 'credit_crunch', title: 'Test', startDay: start, endDay: start + 180, magnitude: 100 };
    s.events.log = [event];
    expect(externalGrowthAdjustment(s)).toBe(-MAX_EXTERNAL_ADJUSTMENT);
    event.templateId = 'tourism_boom';
    expect(externalGrowthAdjustment(s)).toBe(MAX_EXTERNAL_ADJUSTMENT);
    event.startDay = start + 100;
    expect(externalGrowthAdjustment(s)).toBe(0);
    event.startDay = start;
    event.templateId = 'company_beat';
    expect(externalGrowthAdjustment(s)).toBe(0);
    event.templateId = 'credit_crunch';
    event.endDay = start + 90;
    const value = externalGrowthAdjustment(s);
    event.endDay = start + 1000; // knowledge of a future extension cannot change elapsed exposure
    expect(externalGrowthAdjustment(s)).toBe(value);
  });

  it('does not count nominal inflation as extra public wealth', () => {
    const s = createGame(603);
    const initial = scoreDrivers(s).realWealthChange;
    s.indicators.cpi = 120;
    expect(scoreDrivers(s).realWealthChange).toBeLessThan(initial);
    expect(computeScore(s).wealth).toBeLessThan(50);
  });

  it('reduces positive wealth credit when services deteriorate, while retaining the full loss penalty', () => {
    const s = createGame(604);
    s.government.treasury += 1e12;
    const healthy = computeScore(s).wealth;
    s.government.serviceQuality = BASELINE.serviceQuality * 0.5;
    expect(computeScore(s).wealth - 50).toBeCloseTo((healthy - 50) * 0.5, 10);
    s.government.treasury = 0;
    s.government.publicAssets = 0;
    expect(computeScore(s).wealth).toBe(scoreDrivers(s).rawWealthScore);
  });

  it('explains the score without changing any balances, histories or RNG', () => {
    const s = createGame(605), before = clone(s);
    campaignReport(s);
    computeScore(s);
    scoreDrivers(s);
    expect(s).toEqual(before);
  });

  it.each(['insolvency', 'unemployment', 'approval'] as const)('applies the %s failure cap and prevents victory', (failure) => {
    const s = createGame(606);
    if (failure === 'insolvency') s.government.insolvent = true;
    if (failure === 'unemployment') s.households.employed = s.households.laborForce * 0.8;
    if (failure === 'approval') s.indicators.approval = 20;
    s.indicators.score = computeScore(s);
    expect(s.indicators.score.total).toBeLessThanOrEqual(failure === 'insolvency' ? 30 : 40);
    expect(s.indicators.score.caps).toHaveLength(1);
    expect(outcomeLabel(s).won).toBe(false);
  });
});

describe('Phase 6 report and campaign completion', () => {
  it('compares actual opening balances and separates transfers from fund gain and fiscal revenue', () => withoutEvents(() => {
    const s = createGame(607);
    const initial = campaignReport(s);
    expect(injectFund(s, 100e6)).toBeNull();
    expect(campaignReport(s).fundGain).toBeCloseTo(0, 4);
    runUntil(s, 2027, 3, 1);
    const r = campaignReport(s);
    expect(r.opening).toEqual(initial.opening);
    expect(r.opening.treasury).toBe(BASELINE.treasury);
    expect(r.opening.treasury).not.toBe(s.reports[0].treasury);
    expect(r.fundNetTransfers).toBe(100e6);
    expect(r.fiscal.borrowing).toBeGreaterThanOrEqual(0);
    expect(r.fiscalBalance).toBeCloseTo(r.revenue - r.outlays, 3);
    const cashChange = r.revenue - r.outlays + r.fiscal.borrowing - r.fiscal.principal - r.fiscal.swfContribution + r.fiscal.swfTransferIn;
    expect(r.closing.treasury - r.opening.treasury).toBeCloseTo(cashChange, 2);
  }));

  it('stops fractional visual time at the exact campaign boundary and rejects further actions', () => {
    const s = createGame(608);
    runUntil(s, 2029, 1, 1, 7);
    s.clock.paused = false;
    s.clock.speed = 3;
    s.clock.subHourMs = 3_500_000;
    advance(s, 250);
    expect(displayMinutes(s.clock)).toBe(klToEpochMin(2029, 1, 1, 8));
    expect(s.clock.paused).toBe(true);
    expect(s.indicators.publicNetWorth).toBe(publicNetWorth(s));
    const before = JSON.stringify(s);
    expect(applyCommand(s, { type: 'issueBonds', amount: 1e9 }, s.clock.hour * 60).ok).toBe(false);
    runHeadless(s, 100);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.reports).toHaveLength(24);
    expect(s.news.filter((n) => n.title.startsWith('Campaign complete'))).toHaveLength(1);
  });

  it.each([609, 610, 611])('replays seed %i through a mid-campaign save without corruption or duplicate settlements', (seed) => {
    const s = createGame(seed);
    applyCommand(s, { type: 'queueTax', patch: { corporate: 0.2 } }, s.clock.hour * 60);
    applyCommand(s, { type: 'startProject', templateId: 'fibre' }, s.clock.hour * 60);
    runUntil(s, 2028, 1, 1);
    const restored = deserialize(serialize(s));
    for (const game of [s, restored]) runHeadless(game, 30_000);
    expect(JSON.stringify(restored) === JSON.stringify(s)).toBe(true);
    expect(findNonFinite(restored)).toBeNull();
    expect(restored.reports).toHaveLength(24);
    for (const report of restored.reports) {
      expect(report.reconciliation!.cashResidualMinor).toBe(0);
      expect(report.reconciliation!.debtResidualMinor).toBe(0);
    }
    expect(restored.daily.length).toBeLessThanOrEqual(800);
    expect(restored.events.log.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(deserialize(serialize(restored))) === JSON.stringify(restored)).toBe(true);
  });
});

describe('Phase 6 corrupt save rejection', () => {
  it.each([
    (s: GameState) => { s.clock.speed = 4 as never; },
    (s: GameState) => { s.clock.subHourMs = '0' as never; },
    (s: GameState) => { s.clock.hour = s.clock.endHour + 1; },
    (s: GameState) => { s.rng.a = 1.5; },
    (s: GameState) => { s.indicators.cpi = 0; },
    (s: GameState) => { s.sectors.tech.capacity = -1; },
    (s: GameState) => { s.sectors.tech.capacity = '1' as never; },
    (s: GameState) => { s.sectors.prop.pipeline[0] = '1' as never; },
    (s: GameState) => { s.sectors.prop.pipeline = []; },
    (s: GameState) => { delete (s.market.quotes as Partial<typeof s.market.quotes>)['US:NVDA']; },
  ])('rejects an unusable clock, RNG, economy or security snapshot (%#)', (corrupt) => {
    const s = createGame(612);
    corrupt(s);
    expect(() => deserialize(serialize(s))).toThrow(/Corrupt save/);
  });
});
