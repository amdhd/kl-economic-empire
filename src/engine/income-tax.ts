// Progressive resident personal income tax (D-073). Bands are the statutory Malaysian schedule for YA2025
// (LHDN; see docs/data-sources.md). The model has no individual tax returns, so the tax is applied to a stylised
// ten-point earnings distribution around the sector-wage average, and its *level* is normalised to the opening
// household-tax calibration. The progressive shape, bracket creep and the rate lever are the real mechanics.
import { SECTOR_IDS } from '../data/economic-baseline';
import type { GameState } from '../types/game';
import { calibrationFor } from './calibration';
import { leverValue } from './policy';

/** Upper bound of each band (chargeable income, RM/year) and its statutory rate. */
export const INCOME_TAX_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 5_000, rate: 0 }, { upTo: 20_000, rate: 0.01 }, { upTo: 35_000, rate: 0.03 }, { upTo: 50_000, rate: 0.06 },
  { upTo: 70_000, rate: 0.11 }, { upTo: 100_000, rate: 0.19 }, { upTo: 400_000, rate: 0.25 }, { upTo: 600_000, rate: 0.26 },
  { upTo: 2_000_000, rate: 0.28 }, { upTo: Infinity, rate: 0.3 },
];
/** Personal relief RM9,000 plus the capped EPF relief RM4,000; other reliefs are not modelled. */
export const INCOME_TAX_RELIEF = 13_000;
/** Earnings of each tenth of earners relative to the average (normalised below to a mean of 1). */
const DECILE_RAW = [0.28, 0.42, 0.55, 0.68, 0.82, 0.98, 1.18, 1.5, 2.1, 4.0];
const DECILE_MEAN = DECILE_RAW.reduce((a, b) => a + b, 0) / DECILE_RAW.length;
const DECILES = DECILE_RAW.map((m) => m / DECILE_MEAN);

/** Income above this is charged the top-band surcharge (D-114). */
export const TOP_BAND_FROM = 100_000;
/** Share of the surcharge base that high earners avoid (shifting income, deferral, relocation) per unit of surcharge. */
const SURCHARGE_AVOIDANCE = 3;

/** Annual tax on chargeable income with every band rate multiplied by `scale`, plus `surcharge` on income above RM100,000. */
export function bandTax(chargeable: number, scale = 1, surcharge = 0): number {
  let tax = 0;
  let lower = 0;
  for (const b of INCOME_TAX_BANDS) {
    if (chargeable <= lower) break;
    tax += (Math.min(chargeable, b.upTo) - lower) * b.rate * scale;
    lower = b.upTo;
  }
  if (surcharge > 0 && chargeable > TOP_BAND_FROM) tax += (chargeable - TOP_BAND_FROM) * surcharge * (1 - Math.min(0.5, SURCHARGE_AVOIDANCE * surcharge));
  return tax;
}

/** Average tax as a share of earnings across the distribution, for workers averaging `avgAnnualWage`. */
export function effectiveIncomeTaxRate(avgAnnualWage: number, scale = 1, surcharge = 0, relief = INCOME_TAX_RELIEF): number {
  if (!(avgAnnualWage > 0)) return 0;
  const tax = DECILES.reduce((a, m) => a + bandTax(Math.max(0, m * avgAnnualWage - relief), scale, surcharge), 0);
  return tax / DECILES.reduce((a, m) => a + m * avgAnnualWage, 0);
}

export const employmentOf = (s: GameState) => SECTOR_IDS.reduce((a, j) => a + s.sectors[j].employment, 0);

/** Opening personal income tax receipts, RM a year (D-127; user request). The residual "other public receipts" shrinks by the
 * difference from the old calibrated household tax, so total opening receipts do not change. */
export const OPENING_PIT_ANNUAL = 50e9;

/** Scales the shape so that opening statutory-rate receipts equal the calibrated opening household tax. */
function levelFactor(s: GameState): number {
  const c = calibrationFor(s);
  const jobs = SECTOR_IDS.reduce((a, j) => a + c.L0[j], 0);
  const raw = c.hh.wages * effectiveIncomeTaxRate((c.hh.wages * 365) / jobs);
  return raw > 0 ? c.hh.tax / raw : 0;
}

/** Daily personal income tax receipts (MYR) for the day's wage bill; 0 unless the campaign uses the income tax. */
export function incomeTaxDaily(s: GameState, wages: number, scale = s.government.policies.tax.incomeTax, surcharge = leverValue(s, 'topBandSurcharge'), relief = leverValue(s, 'personalRelief')): number {
  if (!s.baseline.pit) return 0;
  const jobs = employmentOf(s);
  const modelled = jobs > 0 ? levelFactor(s) * wages * effectiveIncomeTaxRate((wages * 365) / jobs, scale, surcharge, relief) : 0;
  return modelled + incomeTaxUnmodelledDaily(s, wages) * scale;
}

/** The part of the opening income tax that households were not modelled as paying (RM50bn against the old calibrated RM12bn).
 * It grows with the wage bill and scales with the band-rate lever, but has no bracket creep, allowance or surcharge. It is received
 * but not charged to households at opening, so the opening economy is unchanged; a rate change moves the burden by the difference. */
export function incomeTaxUnmodelledDaily(s: GameState, wages: number): number {
  if (!s.baseline.pit) return 0;
  const c = calibrationFor(s);
  return Math.max(0, OPENING_PIT_ANNUAL / 365 - c.hh.tax) * (wages / c.hh.wages);
}

/** The old flat-surcharge equivalent of the household burden, for approval and inequality effects. */
export const surchargeEquivalent = (s: GameState): number =>
  s.government.policies.tax.household + (s.baseline.pit ? 0.02 * s.government.policies.tax.incomeTax : 0);

export const activeTaxKeys = (s: GameState): (keyof import('../types/game').TaxPolicy)[] =>
  s.baseline.pit ? ['corporate', 'property', 'consumption', 'incomeTax'] : ['corporate', 'property', 'consumption', 'household'];
