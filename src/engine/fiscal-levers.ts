// Fiscal reforms (D-114): pension, subsidy and advanced-tax levers. Pure and deterministic: no RNG, no stored state.
// Every setting is a policy lever (policy.ts), so it follows the usual cycle: announced → effective → phasing in.
// Each lever has an upside that is a number (revenue or a smaller bill) and a downside that is also a number
// (approval, inequality, evasion, investment climate, the ringgit, prices or unemployment). Fictional game-balance
// settings; the bases are ASSUMPTIONs scaled to nominal GDP, not estimates of any real regime.
import type { GameState, LeverId, SectorId } from '../types/game';
import { leverTarget, leverValue } from './policy';

export const FISCAL_LEVER_IDS: LeverId[] = [
  'retirementAge', 'pensionIndexation', 'pensionMeansTest', 'subsidyTargeting', 'cashAid',
  'topBandSurcharge', 'personalRelief', 'capitalGainsTax', 'wealthTax', 'digitalLevy', 'propertyGainsTax', 'transactionTax',
];

export const RETIREMENT_AGE0 = 60;
/** Pensions and gratuities are about three fifths of the transfers line (RM40.6bn of RM44bn in the opening budget). */
export const PENSION_SHARE = 0.6;
/** Largest share of the transfers line the pension reforms can remove in all. */
const PENSION_SAVING_CAP = 0.4;
/** Share of the fuel and food subsidy bill removed when targeting is 100% (the top 35% of households lose it). */
export const SUBSIDY_TARGET_SAVING = 0.35;

// Tax bases as shares of nominal GDP a year (ASSUMPTION) and the avoidance that grows with the rate.
const CGT_BASE = 0.03; // realised equity gains
const WEALTH_BASE = 0.6; // net wealth of the richest 1%
const DIGITAL_BASE = 0.04; // domestic digital-service sales
const PROPERTY_GAINS_BASE = 0.012; // property gains realised by sale
const TRADING_BASE = 1.2; // taxable equity, bond and FX turnover
const DIGITAL_SHARE: Partial<Record<SectorId, number>> = { tech: 0.7, cons: 0.3 };

/** Annual receipts (MYR) of a new tax at setting `v`, after avoidance. Used for the daily settlement and the previews. */
export function taxYield(gdp: number, equityIndex: number, id: LeverId, v: number): number {
  switch (id) {
    case 'capitalGainsTax': return v * CGT_BASE * gdp * Math.min(1.5, Math.max(0.5, equityIndex)) * (1 - Math.min(0.6, 1.5 * v)); // lock-in: holders delay selling
    case 'wealthTax': return v * WEALTH_BASE * gdp * (1 - Math.min(0.7, 25 * v)); // evasion and relocation
    case 'digitalLevy': return v * DIGITAL_BASE * gdp * 0.7; // 30% is sold by offshore platforms that escape the levy
    case 'propertyGainsTax': return v * PROPERTY_GAINS_BASE * gdp * (1 - Math.min(0.5, 1.2 * v)); // fewer sales
    case 'transactionTax': return v * TRADING_BASE * gdp * (1 - Math.min(0.8, 150 * v)); // trading volume migrates
    default: return 0;
  }
}
const gdpOf = (s: GameState) => s.indicators.nominalGdpAnnual;
const equityOf = (s: GameState) => s.households.equityIndex;

/** Daily receipts (MYR) from the taxes households pay out of savings: capital-gains and wealth tax. */
export function householdTaxDaily(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  return (taxYield(gdpOf(s), equityOf(s), 'capitalGainsTax', leverValue(s, 'capitalGainsTax')) + taxYield(gdpOf(s), equityOf(s), 'wealthTax', leverValue(s, 'wealthTax'))) / 365;
}
/** Daily cost (MYR) to sector j of the business-side levies (digital, property gains, transaction tax). It is the treasury's receipt. */
export function sectorTaxDaily(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 0;
  const g = gdpOf(s), e = equityOf(s);
  const digital = taxYield(g, e, 'digitalLevy', leverValue(s, 'digitalLevy')) * (DIGITAL_SHARE[j] ?? 0);
  const property = j === 'prop' ? taxYield(g, e, 'propertyGainsTax', leverValue(s, 'propertyGainsTax')) : 0;
  const trading = j === 'fin' ? taxYield(g, e, 'transactionTax', leverValue(s, 'transactionTax')) : 0;
  return (digital + property + trading) / 365;
}
/** Share of a levy that firms pass into prices (the rest comes out of profit, and so out of corporate tax). */
export const LEVY_PASS_THROUGH = 0.5;

// ---------------------------------------------------------------- pensions

/** Share of the transfers line saved by the pension reforms: later retirement, partial indexation, means-testing. */
export function pensionSavingShare(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  const age = leverValue(s, 'retirementAge') - RETIREMENT_AGE0;
  const erosion = 1 - leverValue(s, 'pensionIndexation'); // real value lost by uprating below prices
  return Math.min(PENSION_SAVING_CAP, PENSION_SHARE * (0.05 * age + 0.3 * erosion + 0.3 * leverValue(s, 'pensionMeansTest')));
}
/** Targeted cash aid paid to low-income households (MYR/day), on top of the transfers line. */
export const cashAidDaily = (s: GameState): number => (s.policy?.enabled ? leverValue(s, 'cashAid') / 365 : 0);
/** Older workers who stay on add to labour supply faster than demand adds jobs: extra structural unemployment (share of the labour force). */
export const ageingMismatch = (s: GameState): number => (s.policy?.enabled ? 0.002 * (leverValue(s, 'retirementAge') - RETIREMENT_AGE0) : 0);

// ---------------------------------------------------------------- subsidies

/** Share of the fuel and food subsidy bill removed by targeting. The saving is charged to households as higher pump and food prices. */
export const subsidyCut = (s: GameState): number => (s.policy?.enabled ? SUBSIDY_TARGET_SAVING * leverValue(s, 'subsidyTargeting') : 0);

// ---------------------------------------------------------------- reactions

/** Investment-climate points (negative) from the new taxes. Announced settings count at once: investors read signals. */
export function fiscalClimate(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  const t = (id: LeverId) => leverTarget(s, id);
  return -20 * t('wealthTax') / 0.02 - 12 * t('capitalGainsTax') / 0.3 - 10 * t('topBandSurcharge') / 0.1
    - 8 * t('transactionTax') / 0.005 - 5 * t('digitalLevy') / 0.08 - 3 * t('propertyGainsTax') / 0.3;
}
/** Log FX effect (positive weakens the ringgit): wealth and capital-gains taxes and a transaction tax push mobile money abroad. */
export function fiscalFx(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  return 0.02 * leverValue(s, 'wealthTax') / 0.02 + 0.015 * leverValue(s, 'capitalGainsTax') / 0.3 + 0.01 * leverValue(s, 'transactionTax') / 0.005;
}
/** Trust points lost (negative = gained) on the monthly approval formula. Cutting pensions and subsidies is costly; taxing the rich is popular. */
export function fiscalTrustPain(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  const v = (id: LeverId) => leverValue(s, id);
  const aidRelief = Math.min(1, v('cashAid') / 6e9); // cash aid softens the loss of the subsidy
  const subsidy = 20 * v('subsidyTargeting') * (1 - 0.6 * aidRelief);
  return 30 * (v('retirementAge') - RETIREMENT_AGE0) / 7 + 20 * (1 - v('pensionIndexation')) + 15 * v('pensionMeansTest') / 0.5 + subsidy
    + 4 * v('capitalGainsTax') / 0.3 + 5 * v('propertyGainsTax') / 0.3 + 4 * v('digitalLevy') / 0.08 + 2 * v('transactionTax') / 0.005
    - 3 * v('wealthTax') / 0.02 - 3 * v('topBandSurcharge') / 0.1;
}
/** Change to the Gini index (negative = more equal) from the fiscal reforms. */
export function fiscalGini(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  const v = (id: LeverId) => leverValue(s, id);
  return -0.03 * v('topBandSurcharge') / 0.1 - 0.03 * v('wealthTax') / 0.02 - 0.01 * v('capitalGainsTax') / 0.3
    - 0.015 * (v('personalRelief') - 13_000) / 17_000 - 0.02 * v('cashAid') / 10e9 - 0.01 * v('pensionMeansTest') / 0.5
    + 0.015 * (1 - v('pensionIndexation')) + 0.01 * (v('retirementAge') - RETIREMENT_AGE0) / 7;
}
