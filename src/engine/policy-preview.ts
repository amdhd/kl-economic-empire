import { sectorTax } from './policy-controls';
import { calibrationFor } from './calibration';
// Read-only, all-else-equal fiscal estimates; fictional MYR per average month.
import { SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { GameState, TaxPolicy } from '../types/game';
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
