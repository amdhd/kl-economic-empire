import { guaranteeReserve } from './deal-report';
import { privateValue } from './private-enterprises';
import { escrowValue } from './deals';
import { baselineFor, trendFor } from '../data/economic-baseline';
// Satisfaction, approval and campaign score. All weights/thresholds are transparent constants.
import { EVENT_BY_ID } from '../data/events';
import type { GameState, MonthlyReport, ScoreBreakdown } from '../types/game';
import { debtMYR, revenueOf, treasuryMYR } from './government';
import { nationalV2 } from '../data/economic-baseline';
import { soeEquity } from './soe';
import { standingComponents } from './standing';
import { navMYR } from './sovereign-fund';
import { daysInMonth, klDay } from './time';
import { clamp } from './util';

export const SCORE_WEIGHTS = { growth: 0.3, wealth: 0.3, satisfaction: 0.25, stability: 0.15 };
/** Model 3 adds global standing against the ten largest economies (D-059). */
export const SCORE_WEIGHTS_V3 = { growth: 0.25, wealth: 0.25, satisfaction: 0.22, stability: 0.13, standing: 0.15 };
export const VICTORY = { score: 75, approval: 60 }; // recalibrated from seeded replays (docs/game-balance.md)
export const GROWTH_TARGET = 0.035;
/** Growth benchmark before external adjustment: potential growth, so an economy merely on trend scores 50. */
export const growthTarget = (s: GameState): number => trendFor(s).potentialGrowth;
export const MAX_EXTERNAL_ADJUSTMENT = 0.01;

/** A duration-weighted run rate, so February and a 31-day month measure the same steady output. */
export function annualRealOutput(reports: MonthlyReport[]): number {
  const days = reports.reduce((sum, r) => sum + daysInMonth(Math.floor(r.monthKey / 12), r.monthKey % 12 + 1), 0);
  return days > 0 ? reports.reduce((sum, r) => sum + r.realGdp, 0) * 365 / days : 0;
}

/** Bounded scoring estimate from elapsed recorded shocks, not a counterfactual economic forecast. */
export function externalGrowthAdjustment(s: GameState): number {
  const start = klDay(s.clock.startHour * 60), end = s.scheduler.lastDay;
  const days = end - start;
  if (days <= 0) return 0;
  let exposure = 0;
  for (const event of s.events.log) {
    const template = EVENT_BY_ID[event.templateId];
    if (!template || template.company) continue;
    const lo = Math.max(start, event.startDay), hi = Math.min(end, event.endDay);
    if (hi <= lo) continue;
    const m = template.mods;
    const pressure = 0.35 * Math.log(m.myDemand ?? 1) + 0.25 * Math.log(m.globalDemand ?? 1)
      + 0.15 * Math.log(m.tourism ?? 1) + 0.05 * Math.log(m.tech ?? 1)
      + 0.1 * Math.log(m.creditWillingness ?? 1) - 0.1 * Math.log(m.oil ?? 1);
    let strengthDays = Math.max(0, hi - Math.max(lo, event.startDay + 7));
    for (let day = lo; day < Math.min(hi, event.startDay + 7); day++) strengthDays += (day - event.startDay + 1) / 7;
    exposure += pressure * strengthDays * event.magnitude;
  }
  return clamp(0.25 * exposure / days, -MAX_EXTERNAL_ADJUSTMENT, MAX_EXTERNAL_ADJUSTMENT);
}

/** Explainable inputs shared by the score and its UI, all derived without RNG or state changes. */
export function scoreDrivers(s: GameState) {
  const BASELINE = baselineFor(s);
  const reports = s.reports;
  const realOutput = reports.length ? annualRealOutput(reports.slice(-3)) : s.baseline.realGdpAnnual;
  const years = Math.max(reports.length / 12, 0.25);
  const realGrowth = Math.pow(realOutput / s.baseline.realGdpAnnual, 1 / years) - 1;
  const externalAdjustment = externalGrowthAdjustment(s);
  const liabilities = debtMYR(s.government) + s.government.unpaidObligations + ((s.deals?.items??[]).reduce((a,d)=>a+d.arrearsMinor,0)+guaranteeReserve(s))/100;
  // A negative opening net worth must not earn score merely by inflating nominal liabilities.
  const realWealthChange = s.baseline.profile === 'malaysia'
    ? (scoreNetWorth(s) + liabilities) / (s.indicators.cpi / 100) - liabilities - s.baseline.publicNetWorth
    : scoreNetWorth(s) / (s.indicators.cpi / 100) - s.baseline.publicNetWorth;
  const income = reports.at(-1)?.realDisposablePerCapita ?? s.baseline.realDisposablePerCapita;
  const TREND = trendFor(s);
  // Model 3 (D-057): living standards are judged against the trend path, and each 1% shortfall costs 4% of the credit,
  // so wealth bought with stagnation is not rewarded. Earlier models compare with opening levels.
  const elapsed = Math.max(0, (reports.length - 1) / 12);
  const outputPath = TREND.trendWealthCredit ? Math.pow(1 + TREND.potentialGrowth, elapsed) : 1;
  const incomePath = TREND.trendWealthCredit ? Math.pow(1 + TREND.productivity, elapsed) : 1;
  const sustained = Math.min(income / (s.baseline.realDisposablePerCapita * incomePath),
    realOutput / (s.baseline.realGdpAnnual * outputPath), s.government.serviceQuality / BASELINE.serviceQuality);
  const wealthCreditFactor = clamp(TREND.trendWealthCredit ? 1 - 4 * (1 - sustained) : sustained, 0, 1);
  const rawWealthScore = clamp(50 + TREND.wealthSlope * realWealthChange / s.baseline.nominalGdpAnnual, 0, 100);
  return { realGrowth, growthTarget: growthTarget(s) + externalAdjustment, externalAdjustment, realWealthChange,
    wealthCreditFactor, rawWealthScore };
}

/** Change in segregated reserve-account equity since campaign start. With `atOpeningFx`, USD reserves are
 * valued at the opening rate: spreads and trading losses still count, FX revaluation does not. */
export function reserveEquityChange(s: GameState, atOpeningFx = false): number {
  const cb = s.centralBank;
  const fx = atOpeningFx ? baselineFor(s).myrPerUsd : s.external.myrPerUsd;
  return cb.usdReserves / 100 * fx + cb.myrCash / 100 - cb.openingEquityMYR;
}

export function publicNetWorth(s: GameState): number {
  return treasuryMYR(s.government) + navMYR(s) + s.government.publicAssets - debtMYR(s.government) - s.government.unpaidObligations + reserveEquityChange(s)
    // State enterprises are public wealth: only changes since the start count, so a dividend that moves
    // cash from PETRONAS or Khazanah to the treasury leaves net worth unchanged.
    + soeEquity(s) - s.soe.openingEquity + (escrowValue(s, 'treasury') + escrowValue(s, 'strategic') + privateValue(s,'strategic')) / 100 - (s.deals?.items??[]).reduce((a,d)=>a+d.arrearsMinor,0)/100 - guaranteeReserve(s)/100;
}

/** Net worth used by the wealth score. Reserve revaluation is excluded, so neither random FX moves nor
 * pressure the player creates with interventions can earn score (docs/decisions.md D-029). */
export function scoreNetWorth(s: GameState): number {
  return publicNetWorth(s) - reserveEquityChange(s) + reserveEquityChange(s, true);
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
  const BASELINE = baselineFor(s);
  const ind = s.indicators;
  const reports = s.reports;
  const caps: string[] = [];
  const drivers = scoreDrivers(s);

  // Growth: annualised real GDP growth vs baseline run-rate, plus employment vs baseline.
  const u = unemploymentRate(s);
  const growth = clamp(50 + (drivers.realGrowth - drivers.growthTarget) * 1000 - (u - BASELINE.unemployment) * 400, 0, 100);

  // Public net wealth change, relative to baseline GDP.
  const wealth = drivers.rawWealthScore <= 50 ? drivers.rawWealthScore
    : 50 + (drivers.rawWealthScore - 50) * drivers.wealthCreditFactor;

  // Satisfaction: average approval over the last 6 months (current if fewer).
  const recent = reports.slice(-6);
  const satisfaction = recent.length ? recent.reduce((a, r) => a + r.approval, 0) / recent.length : ind.approval;

  // Stability: inflation deviation, debt service, banking stress.
  const infl = recent.length ? recent.reduce((a, r) => a + Math.abs(r.inflationYoY - 0.025), 0) / recent.length : 0;
  const interestToRevenue = recent.length ? recent.reduce((a, r) => a + r.gov.interest, 0) / Math.max(1, recent.reduce((a, r) => a + revenueOf(r.gov), 0)) : 0.07;
  const stability = clamp(95 - 1000 * Math.max(0, infl - 0.0125) - 150 * Math.max(0, interestToRevenue - 0.1) - 4000 * Math.max(0, s.bank.nplRate - 0.002) - (s.government.daysInArrears > 0 ? 20 : 0)
    // Model 2: abandoning the fiscal rules erodes financial stability.
    - (nationalV2(s) ? 0.3 * Math.max(0, 50 - s.fiscal.credibility) : 0), 0, 100);

  const standing = s.fdi?.enabled ? standingComponents(s).points : undefined;
  const W = standing === undefined ? { ...SCORE_WEIGHTS, standing: 0 } : SCORE_WEIGHTS_V3;
  let total = W.growth * growth + W.wealth * wealth + W.satisfaction * satisfaction + W.stability * stability + W.standing * (standing ?? 0);
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
  return { growth, wealth, satisfaction, stability, ...(standing === undefined ? {} : { standing }), total, caps };
}

export function outcomeLabel(s: GameState): { won: boolean; text: string } {
  const sc = computeScore(s);
  const won = sc.total >= VICTORY.score && s.indicators.approval >= VICTORY.approval && !s.government.insolvent;
  if (won) return { won, text: 'Economic Miracle — victory conditions met' };
  if (sc.total >= 65) return { won, text: 'Solid presidency — short of the victory threshold' };
  if (sc.total >= 45) return { won, text: 'Mixed record' };
  return { won, text: 'Troubled presidency' };
}
