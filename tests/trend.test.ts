// D-055: an untouched model-3 economy grows near its potential with stable unemployment; older saves keep their trend.
import { describe, expect, it } from 'vitest';
import { BASE_BUDGET, LEGACY_TREND, NATIONAL_TREND, trendFor } from '../src/data/economic-baseline';
import { CAL, CAL_V2, calibrationFor } from '../src/engine/calibration';
import { createGame, runHeadless } from '../src/engine/game';
import { otherPublicReceiptsMonthly } from '../src/engine/government';
import { growthTarget, scoreDrivers } from '../src/engine/indicators';
import { outputGap } from '../src/engine/scheduler';
import { daysInMonth } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';
import type { BudgetCategory, MonthlyReport } from '../src/types/game';
import { runUntil, withoutEvents } from './helpers';

const perDay = (r: MonthlyReport) => r.realGdp / daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1);

describe('national trend (model 3)', () => {
  it('opens on a steady path: first-month output, jobs and investment match the opening calibration', () => withoutEvents(() => {
    const s = createGame(2027);
    expect(s.baseline.model).toBe(3);
    expect(calibrationFor(s)).toBe(CAL);
    const open = s.baseline.realGdpAnnual / 365;
    runUntil(s, 2027, 2, 1);
    expect(Math.abs(perDay(s.reports[0]) / open - 1)).toBeLessThan(0.003);
    expect(Math.abs(s.indicators.unemployment - 0.03)).toBeLessThan(0.003);
    for (const sec of Object.values(s.sectors)) {
      const steady = (CAL.K0[sec.id] * (0.05 + NATIONAL_TREND.capitalGrowth)) / 12;
      expect(Math.abs(sec.investmentMonthly / steady - 1)).toBeLessThan(0.02);
    }
  }));

  it('grows near potential over 24 months with no events and keeps unemployment near its opening rate', () => withoutEvents(() => {
    let growth = 0, endU = 0, maxU = 0;
    const seeds = [2027, 11, 42];
    for (const seed of seeds) {
      const s = createGame(seed);
      const open = s.baseline.realGdpAnnual / 365;
      runHeadless(s, 24 * 731, st => { maxU = Math.max(maxU, st.indicators.unemployment); });
      const last = s.reports.slice(-3);
      const run = last.reduce((a, r) => a + r.realGdp, 0) / last.reduce((a, r) => a + r.realGdp / perDay(r), 0);
      growth += Math.pow(run / open, 12 / (s.reports.length - 1.5)) - 1;
      endU += s.indicators.unemployment;
    }
    growth /= seeds.length;
    endU /= seeds.length;
    // Before D-055 (8171ec3) these seeds averaged ~2.2% growth.
    expect(growth).toBeGreaterThan(0.029);
    expect(growth).toBeLessThan(NATIONAL_TREND.potentialGrowth + 0.01);
    expect(endU).toBeGreaterThan(0.025);
    expect(endU).toBeLessThan(0.038);
    expect(maxU).toBeLessThan(0.046);
  }), 120_000);

  it('inherits monthly-indexed ministry plans that the player can see, replace or cancel', () => withoutEvents(() => {
    const s = createGame(55);
    expect(s.controls.plans.map(p => p.category).sort()).toEqual((Object.keys(BASE_BUDGET) as BudgetCategory[]).sort());
    expect(s.controls.plans.every(p => p.everyMonths === 1 && p.remaining === 60)).toBe(true);
    expect(s.news.some(n => n.title === 'Inherited budget path')).toBe(true);
    const logBefore = s.policyLog.length;
    runUntil(s, 2028, 1, 1, 1);
    // Twelve monthly steps (1 Feb 2027 … 1 Jan 2028) compound to the annual escalation.
    expect(s.government.policies.budget.health / BASE_BUDGET.health).toBeCloseTo(1 + NATIONAL_TREND.budgetEscalation, 10);
    expect(s.fiscal.developmentAnnual).toBe(createGame(55).fiscal.developmentAnnual);
    expect(s.policyLog.length).toBe(logBefore);
  }));

  it('indexes the omitted-receipts residual to nominal GDP; earlier models keep it fixed', () => {
    const s = createGame(56);
    const base = otherPublicReceiptsMonthly(s);
    s.indicators.nominalGdpAnnual *= 1.05;
    expect(otherPublicReceiptsMonthly(s) / base).toBeCloseTo(1.05, 12);
    s.government.policies.tax.corporate = 0.3;
    expect(otherPublicReceiptsMonthly(s) / base).toBeCloseTo(1.05, 12);
    s.baseline.model = 2;
    expect(otherPublicReceiptsMonthly(s)).toBe(otherPublicReceiptsMonthly({ ...s, indicators: { ...s.indicators, nominalGdpAnnual: s.baseline.nominalGdpAnnual } }));
  });

  it('measures the OPR output gap and the growth score against the same potential', () => {
    const s = createGame(57);
    expect(growthTarget(s)).toBe(NATIONAL_TREND.potentialGrowth);
    s.reports.push({ monthKey: s.scheduler.lastMonthKey, realGdp: (s.baseline.realGdpAnnual / 365) * 31 * Math.pow(1 + NATIONAL_TREND.potentialGrowth, 1 / 12) } as MonthlyReport);
    expect(outputGap(s)).toBeCloseTo(0, 10);
  });

  it('judges wealth sustainability against the trend path, not opening levels (D-057)', () => withoutEvents(() => {
    const s = createGame(60);
    runUntil(s, 2028, 1, 1, 1);
    const onTrend = scoreDrivers(s);
    // Output exactly at its opening level after eleven months is a ~3.3% shortfall versus trend (credit ≈ 0.87 at most).
    for (const r of s.reports) r.realGdp = (s.baseline.realGdpAnnual / 365) * daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1);
    const flat = scoreDrivers(s);
    expect(flat.wealthCreditFactor).toBeLessThan(0.88);
    expect(flat.wealthCreditFactor).toBeLessThan(onTrend.wealthCreditFactor);
    s.baseline.model = 2;
    expect(scoreDrivers(s).wealthCreditFactor).toBeCloseTo(Math.min(1, s.government.serviceQuality / 0.62, s.reports.at(-1)!.realDisposablePerCapita / s.baseline.realDisposablePerCapita), 10);
  }));

  it('loads schema-7 saves as model 2 on the KL-era trend, calibration and fixed receipts', () => {
    const s = createGame(58);
    const file = JSON.parse(serialize(s));
    file.state.schemaVersion = 7;
    file.state.baseline.model = 2;
    file.state.controls.plans = [];
    const t = deserialize(JSON.stringify(file));
    expect(t.baseline.model).toBe(2);
    expect(trendFor(t)).toBe(LEGACY_TREND);
    expect(calibrationFor(t)).toBe(CAL_V2);
    expect(growthTarget(t)).toBe(0.035);
    const fixed = otherPublicReceiptsMonthly(t);
    t.indicators.nominalGdpAnnual *= 1.1;
    expect(otherPublicReceiptsMonthly(t)).toBe(fixed);
  });

  it('rejects malformed plan intervals', () => {
    const s = createGame(59);
    const file = JSON.parse(serialize(s));
    file.state.controls.plans[0].everyMonths = 3;
    expect(() => deserialize(JSON.stringify(file))).toThrow();
    file.state.controls.plans[0].everyMonths = 12;
    expect(() => deserialize(JSON.stringify(file))).toThrow(); // annual plans run at most five years
  });
});
