import { describe, expect, it } from 'vitest';
import { BASE_MPC } from '../src/engine/calibration';
import { daily, householdDemand } from '../src/engine/economy';
import { aggregateMods } from '../src/engine/external';
import { createGame, runHeadless } from '../src/engine/game';
import { dailyGovernment } from '../src/engine/government';
import { confidenceChannels, householdBehaviour, householdSpending, recentIncomeTrend } from '../src/engine/household-behavior';
import { deserialize, serialize } from '../src/persistence/save';
import { clone, withoutEvents } from './helpers';

describe('household consumption feedback', () => {
  it('limits confidence effects on investment and new credit without suppressing either channel', () => {
    const low = confidenceChannels(0.1), neutral = confidenceChannels(0.6), high = confidenceChannels(0.95);
    expect(low.investmentGrowth).toBeLessThan(neutral.investmentGrowth);
    expect(high.investmentGrowth).toBeGreaterThan(neutral.investmentGrowth);
    expect(high.investmentGrowth - low.investmentGrowth).toBeLessThan(0.01);
    expect(low.creditGrowthMultiplier).toBeGreaterThanOrEqual(0.8);
    expect(high.creditGrowthMultiplier).toBeLessThanOrEqual(1.2);
    expect(low.creditGrowthMultiplier).toBeLessThan(neutral.creditGrowthMultiplier);
    expect(high.creditGrowthMultiplier).toBeGreaterThan(neutral.creditGrowthMultiplier);
    expect(neutral).toEqual({ investmentGrowth: 0, creditGrowthMultiplier: 1 });
  });
  it('lets confidence recover after income stabilises below its opening level', () => withoutEvents(() => {
    const s = createGame(1101);
    runHeadless(s, 24 * 95);
    const opening = s.baseline.realDisposablePerCapita;
    for (const r of s.reports) r.realDisposablePerCapita = opening * 0.8;
    expect(recentIncomeTrend(s, opening * 0.8)).toBeCloseTo(0, 12);
    let behaviour = { confidence: 0.3, mpc: 0.84 };
    for (let m = 0; m < 12; m++) behaviour = householdBehaviour(behaviour.confidence, behaviour.mpc, 0, 0.02, recentIncomeTrend(s, opening * 0.8), 0.5);
    expect(behaviour.confidence).toBeGreaterThan(0.58);
    expect(behaviour.mpc).toBeGreaterThan(0.855);
    // No mutation of the baseline used by approval and the campaign score.
    expect(s.baseline.realDisposablePerCapita).toBe(opening);
    expect(recentIncomeTrend(s, opening * 0.8 * 1.03 ** 3)).toBeCloseTo(0.03, 12);
    expect(recentIncomeTrend(s, 0)).toBe(-0.03);
  }));

  it('uses opening income only before the first report and bounds exceptional trends', () => {
    const s = createGame(1102);
    const opening = s.baseline.realDisposablePerCapita;
    expect(recentIncomeTrend(s, opening)).toBe(0);
    expect(recentIncomeTrend(s, opening * 0.99)).toBeCloseTo(-0.01, 12);
    expect(recentIncomeTrend(s, opening * 10)).toBe(0.03);
  });

  it('keeps precautionary saving small and gradual even under persistent stress', () => {
    let b = { confidence: 0.6, mpc: BASE_MPC };
    for (let m = 0; m < 120; m++) {
      const next = householdBehaviour(b.confidence, b.mpc, 0.2, 0.15, -0.03, 0.05);
      expect(Math.abs(next.mpc - b.mpc)).toBeLessThanOrEqual(0.005 + 1e-12);
      expect(next.mpc).toBeGreaterThanOrEqual(BASE_MPC - 0.025 - 1e-12);
      b = next;
    }
    expect(b.confidence).toBeLessThan(0.6);
    expect(b.mpc).toBeLessThan(BASE_MPC);
    // Opening conditions preserve the calibrated consumption propensity.
    expect(householdBehaviour(0.6, BASE_MPC, 0, 0.02, 0, 0.5)).toEqual({ confidence: 0.6, mpc: BASE_MPC });
  });

  it('draws only available savings and cannot fund consumption from future income or paper gains', () => {
    const p = householdSpending(20, 100, 5, 0.86, 1_000, 0);
    expect(p.spending).toBe(25);
    expect(p.consumption).toBe(25);
    expect(5 + 20 - p.spending).toBe(0);
    expect(householdSpending(0, 100, 0, 0.86, 1000, 0).spending).toBe(0);
    expect(householdSpending(-20, 100, 10, 0.86, 1000, 0).spending).toBe(0);
    expect(householdSpending(20, 100, -10, 0.86, 1000, 0).spending).toBe(10);
    // A sustained income loss still lowers spending once permanent income has adjusted.
    expect(householdSpending(80, 80, 100, BASE_MPC, 0, 0).spending)
      .toBeLessThan(householdSpending(100, 100, 100, BASE_MPC, 0, 0).spending);
  });

  it('accounts for fuel costs inside the cash envelope, including price reductions and exhausted cash', () => {
    for (const delta of [-10, 0, 10, 1000]) {
      const p = householdSpending(100, 100, 0, BASE_MPC, 0, delta);
      expect(p.spending).toBe(86);
      expect(p.consumption + p.fuelAdjustment).toBe(p.spending);
      expect(100 - p.spending).toBe(14); // a higher fuel bill is not saved
      expect(p.consumption).toBeGreaterThanOrEqual(0);
    }
    expect(householdSpending(0, 100, 0, BASE_MPC, 0, -10).consumption).toBe(0);
  });

  it('settles the funded envelope once, keeps credit separate and leaves previews read-only', () => {
    const s = createGame(1103);
    s.world.policy.fuelEligible = 0;
    s.households.savings = 5;
    s.households.permanentIncome *= 20;
    const gov = dailyGovernment(s, s.scheduler.lastDay);
    const before = clone(s);
    const plan = householdDemand(s, gov.transfersPaid);
    expect(s).toEqual(before);
    expect(plan.spending).toBeCloseTo(plan.disposable + 5, 5);
    expect(plan.fuelAdjustment).toBeGreaterThan(0);
    daily(s, aggregateMods(s, s.scheduler.lastDay), gov);
    expect(s.households.savings).toBeCloseTo(0, 5);
    expect(s.households.mtd.consumption).toBeCloseTo(plan.spending + plan.credit, 5);
    expect(s.bank.loansH).toBe(before.bank.loansH); // no emergency borrowing invented
  });

  it('continues identically after saving during recovery and preserves RNG streams', () => withoutEvents(() => {
    const a = createGame(1104, 'recession');
    runHeadless(a, 24 * 210);
    const b = deserialize(serialize(a));
    runHeadless(a, 24 * 90);
    runHeadless(b, 24 * 90);
    expect(b.households).toEqual(a.households);
    expect(b.reports).toEqual(a.reports);
    expect(b.rng).toEqual(a.rng);
    expect(b.world.rng).toEqual(a.world.rng);
  }));
});
