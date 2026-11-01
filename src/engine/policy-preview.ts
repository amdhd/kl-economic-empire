import { sectorTax } from './policy-controls';
import { calibrationFor } from './calibration';
// Read-only, all-else-equal fiscal estimates; fictional MYR per average month.
import { SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { GameState, LeverId, TaxPolicy } from '../types/game';
import { PENSION_SHARE, SUBSIDY_TARGET_SAVING, subsidyCut, taxYield } from './fiscal-levers';
import { LEVERS } from './policy';
import { fuelSubsidyDaily, wheatSubsidyDaily } from './world';
import { CREDIT_SPEND, PROPERTY_LEVY_BASE, SURCHARGE_BASE_SHARE } from './calibration';
import { exportIndex, householdDemand, PER_DAY } from './economy';
import { incomeTaxDaily } from './income-tax';
import { daysInMonth, klParts, klToEpochMin } from './time';

/** Freeze current demand/prices and the last closed corporate-profit base. No RNG or postings. */
export function estimateTaxChange(s: GameState, proposed: TaxPolicy): Record<keyof TaxPolicy, number> {
  const CAL = calibrationFor(s);
  const current = s.government.policies.tax;
  const last = s.reports.at(-1);
  const profitDays = last ? daysInMonth(Math.floor(last.monthKey / 12), last.monthKey % 12 + 1) : 30.4;
  const date = klParts(s.clock.hour*60);
  const effective = date.month === 12 ? klToEpochMin(date.year+1,1,1) : klToEpochMin(date.year,date.month+1,1);
  const corporateChange = SECTOR_IDS.reduce((sum,j)=>sum+Math.max(0,s.sectors[j].lastMonthProfit)*(sectorTax(s,j,effective,proposed.corporate)-sectorTax(s,j,effective,current.corporate)),0)/profitDays/PER_DAY;
  const hh = householdDemand(s, s.government.policies.budget.transfers * PER_DAY);
  // Residents have a tax-inclusive spending envelope; visitors pay the levy on top.
  const consumerBudget = hh.consumption * SECTORS.cons.consumption + hh.credit * (CREDIT_SPEND.cons ?? 0);
  const visitorBase = CAL.X0.cons * exportIndex(s, 'cons') * (SECTORS.cons.exportMix.tourism ?? 0) * s.sectors.cons.price;
  const levy = (rate: number) => consumerBudget * rate / (1 + rate) + visitorBase * rate;
  return {
    corporate: corporateChange,
    property: (proposed.property - current.property) * PROPERTY_LEVY_BASE * s.sectors.prop.output * s.sectors.prop.price / PER_DAY,
    consumption: (levy(proposed.consumption) - levy(current.consumption)) / PER_DAY,
    household: (proposed.household - current.household) * hh.wages * SURCHARGE_BASE_SHARE / PER_DAY,
    incomeTax: (incomeTaxDaily(s, hh.wages, proposed.incomeTax) - incomeTaxDaily(s, hh.wages, current.incomeTax)) / PER_DAY,
  };
}

/** Annual treasury effect (MYR, positive = better for the treasury) of putting lever `id` at `value` instead of its
 * opening setting, at full effect and all else equal. Read-only; null for levers with no fiscal estimate here. */
export function leverEstimate(s: GameState, id: LeverId, value: number): number | null {
  if (!s.policy?.enabled) return null;
  const gdp = s.indicators.nominalGdpAnnual;
  const transfers = s.government.policies.budget.transfers * 12;
  const opening = LEVERS[id].initial;
  switch (id) {
    case 'retirementAge': return transfers * PENSION_SHARE * 0.05 * (value - opening);
    case 'pensionIndexation': return transfers * PENSION_SHARE * 0.3 * (opening - value);
    case 'pensionMeansTest': return transfers * PENSION_SHARE * 0.3 * (value - opening);
    case 'cashAid': return -(value - opening);
    case 'subsidyTargeting': {
      const bill = (fuelSubsidyDaily(s) + wheatSubsidyDaily(s)) * 365 / Math.max(1e-9, 1 - subsidyCut(s));
      return bill * SUBSIDY_TARGET_SAVING * (value - opening);
    }
    case 'capitalGainsTax': case 'wealthTax': case 'digitalLevy': case 'propertyGainsTax': case 'transactionTax':
      return taxYield(gdp, s.households.equityIndex, id, value) - taxYield(gdp, s.households.equityIndex, id, opening);
    case 'topBandSurcharge': case 'personalRelief': {
      if (!s.baseline.pit) return null;
      const wages = householdDemand(s, s.government.policies.budget.transfers * PER_DAY).wages;
      const pick = (id2: LeverId, v: number) => (id === id2 ? v : LEVERS[id2].initial);
      const at = (v: number) => incomeTaxDaily(s, wages, s.government.policies.tax.incomeTax, id === 'topBandSurcharge' ? v : pick('topBandSurcharge', 0), id === 'personalRelief' ? v : pick('personalRelief', 0)) * 365;
      return at(value) - at(opening);
    }
    default: return null;
  }
}
