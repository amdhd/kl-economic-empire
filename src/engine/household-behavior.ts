// Fictional aggregate behaviour: bounded precautionary saving, not a second income shock.
import type { GameState } from '../types/game';
import { BASE_MPC } from './calibration';
import { clamp } from './util';

/** Modest confidence adjustments; profitability, utilisation, rates and bank supply remain primary. */
export function confidenceChannels(confidence: number) {
  return {
    investmentGrowth: 0.01 * (confidence - 0.6),
    creditGrowthMultiplier: clamp(1 + 0.5 * (confidence - 0.6), 0.8, 1.2),
  };
}

/** Geometric monthly change over up to three completed monthly intervals, not since campaign start.
 * Reports already contain calendar-normalised real income per person; no new saved state or RNG.
 */
export function recentIncomeTrend(s: GameState, realIncomePerCapita: number): number {
  const months = Math.min(3, s.reports.length);
  const prior = months ? s.reports[s.reports.length - months].realDisposablePerCapita : s.baseline.realDisposablePerCapita;
  if (realIncomePerCapita <= 0) return -0.03;
  if (prior <= 0) return 0.03;
  return clamp(Math.pow(realIncomePerCapita / prior, 1 / Math.max(1, months)) - 1, -0.03, 0.03);
}

export function householdBehaviour(confidence: number, mpc: number, unemploymentGap: number, coreInflation: number, incomeTrend: number, riskAppetite: number) {
  const inflationStress = Math.max(0, coreInflation - 0.03);
  const targetConfidence = clamp(0.6 - unemploymentGap - 0.5 * inflationStress
    + 1.5 * incomeTrend + 0.15 * (riskAppetite - 0.5), 0.1, 0.95);
  const nextConfidence = confidence + 0.25 * (targetConfidence - confidence);
  // Lost wages already reduce income. Unemployment affects precaution only through confidence.
  // Limit the aggregate saving-rate response to -2.5/+1.5 percentage points around opening MPC.
  const targetMpc = BASE_MPC + clamp(0.06 * (nextConfidence - 0.6) - 0.1 * inflationStress, -0.025, 0.015);
  const nextMpc = mpc + clamp(0.25 * (targetMpc - mpc), -0.005, 0.005);
  return { confidence: nextConfidence, mpc: nextMpc };
}

/** Income and savings finance ordinary consumption; separately granted credit stays in its own channel.
 * Fuel is a reallocation of the spending envelope, not a fictitious addition to savings.
 * If mandatory deductions already exceed resources, no discretionary drawdown is permitted.
 */
export function householdSpending(disposable: number, permanentIncome: number, savings: number, mpc: number, wealthSpend: number, fuelDelta: number) {
  const available = Math.max(0, disposable + savings);
  const desired = Math.max(0, (0.5 * disposable + 0.5 * permanentIncome) * mpc + wealthSpend);
  const spending = Math.min(desired, available);
  // A fuel cost increase can crowd out the entire other-goods basket, but cannot spend more than
  // available cash. A price reduction frees basket spending within the same total cash envelope.
  const fuelAdjustment = Math.min(fuelDelta, spending);
  const consumption = spending > 0 ? spending - fuelAdjustment : 0;
  return { spending, consumption, fuelAdjustment: spending > 0 ? fuelAdjustment : 0 };
}
