// Satisfaction, approval and campaign score. All weights/thresholds are transparent constants.
import { BASELINE } from '../data/economic-baseline';
import type { GameState, ScoreBreakdown } from '../types/game';
import { debtMYR, treasuryMYR } from './government';
import { navMYR } from './sovereign-fund';
import { clamp } from './util';

export const SCORE_WEIGHTS = { growth: 0.3, wealth: 0.3, satisfaction: 0.25, stability: 0.15 };
export const VICTORY = { score: 80, approval: 60 };

export function publicNetWorth(s: GameState): number {
  return treasuryMYR(s.government) + navMYR(s) + s.government.publicAssets - debtMYR(s.government) - s.government.unpaidObligations;
}

export function unemploymentRate(s: GameState): number {
  return clamp(1 - s.households.employed / s.households.laborForce, 0, 1);
}

/** Monthly: satisfaction components (0–100) and approval. */
export function updateSatisfaction(s: GameState, realDispPerCap: number, rentBurden: number, inflationYoY: number): void {
  const ind = s.indicators;
  const u = unemploymentRate(s);
  const base = s.baseline;
  const employment = clamp(100 - (u - 0.02) * 1200, 0, 100);
  const income = clamp(62 + 600 * (realDispPerCap / base.realDisposablePerCapita - 1), 0, 100);
  const affordability = clamp(66 - 500 * (rentBurden - base.rentBurden), 0, 100);
  const services = clamp(s.government.serviceQuality * 100 * (1 - Math.min(0.5, s.government.daysInArrears / 60)), 0, 100);
  s.policyChurn *= 0.75;
  const taxPain = 250 * Math.max(0, s.government.policies.tax.household - 0.02) + 150 * Math.max(0, s.government.policies.tax.consumption - 0.04);
  const trust = clamp(70 - s.policyChurn - taxPain - (s.government.daysInArrears > 0 ? 15 : 0) - (s.government.insolvent ? 40 : 0) + 2 * (s.government.creditRating - 8), 0, 100);
  const infDev = Math.max(0, Math.abs(inflationYoY - 0.025) - 0.01);
  const stability = clamp(85 - 1500 * infDev - 300 * Math.max(0, u - 0.05) - 30 * (0.5 - s.external.riskAppetite), 0, 100);
  ind.satisfaction = { employment, income, affordability, services, trust, stability };
  const sat = 0.25 * employment + 0.25 * income + 0.15 * affordability + 0.15 * services + 0.1 * trust + 0.1 * stability;
  ind.approval = clamp(ind.approval + 0.35 * (sat - ind.approval), 0, 100);
}

/** Campaign score preview (0–100) from cumulative performance since the start. */
export function computeScore(s: GameState): ScoreBreakdown {
  const ind = s.indicators;
  const base = s.baseline;
  const reports = s.reports;
  const months = Math.max(1, reports.length);
  const caps: string[] = [];

  // Growth: annualised real GDP growth vs baseline run-rate, plus employment vs baseline.
  const lastReal = reports.length ? reports.slice(-3).reduce((a, r) => a + r.realGdp, 0) / Math.min(3, reports.length) * 12 : base.realGdpAnnual;
  const years = Math.max(months / 12, 0.25);
  const g = Math.pow(lastReal / base.realGdpAnnual, 1 / years) - 1;
  const u = unemploymentRate(s);
  const growth = clamp(50 + (g - 0.035) * 1500 - (u - BASELINE.unemployment) * 400, 0, 100);

  // Public net wealth change, relative to baseline GDP.
  const dNw = (publicNetWorth(s) - base.publicNetWorth) / base.nominalGdpAnnual;
  const wealth = clamp(50 + 400 * dNw, 0, 100);

  // Satisfaction: average approval over the last 6 months (current if fewer).
  const recent = reports.slice(-6);
  const satisfaction = recent.length ? recent.reduce((a, r) => a + r.approval, 0) / recent.length : ind.approval;

  // Stability: inflation deviation, debt service, banking stress.
  const infl = recent.length ? recent.reduce((a, r) => a + Math.abs(r.inflationYoY - 0.025), 0) / recent.length : 0;
  const interestToRevenue = recent.length ? recent.reduce((a, r) => a + r.gov.interest, 0) / Math.max(1, recent.reduce((a, r) => a + r.gov.taxCorporate + r.gov.taxProperty + r.gov.taxConsumption + r.gov.taxHousehold + r.gov.federalGrant, 0)) : 0.07;
  const stability = clamp(95 - 1500 * Math.max(0, infl - 0.01) - 150 * Math.max(0, interestToRevenue - 0.1) - 4000 * Math.max(0, s.bank.nplRate - 0.002) - (s.government.daysInArrears > 0 ? 20 : 0), 0, 100);

  let total = SCORE_WEIGHTS.growth * growth + SCORE_WEIGHTS.wealth * wealth + SCORE_WEIGHTS.satisfaction * satisfaction + SCORE_WEIGHTS.stability * stability;
  if (s.government.insolvent) {
    total = Math.min(total, 30);
    caps.push('Government insolvency caps the score at 30');
  }
  if (u > 0.12) {
    total = Math.min(total, 40);
    caps.push('Unemployment above 12% caps the score at 40');
  }
  if (ind.approval < 25) {
    total = Math.min(total, 40);
    caps.push('Approval below 25 caps the score at 40');
  }
  return { growth, wealth, satisfaction, stability, total, caps };
}

export function outcomeLabel(s: GameState): { won: boolean; text: string } {
  const sc = s.indicators.score;
  const won = sc.total >= VICTORY.score && s.indicators.approval >= VICTORY.approval && !s.government.insolvent;
  if (won) return { won, text: 'Economic Miracle — victory conditions met' };
  if (sc.total >= 65) return { won, text: 'Solid presidency — short of the victory threshold' };
  if (sc.total >= 45) return { won, text: 'Mixed record' };
  return { won, text: 'Troubled presidency' };
}
