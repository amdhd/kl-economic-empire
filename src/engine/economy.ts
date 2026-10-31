import { contractedSteel } from './supply-contracts';
import { sectorTax } from './policy-controls';
import { confidenceChannels, householdBehaviour, householdSpending } from './household-behavior';
import { calibrationFor } from './calibration';
import { baselineFor, demandFor, nationalV2, trendFor } from '../data/economic-baseline';
import { COMMODITY_IMPORT, UTILITY_FUEL_PASSTHROUGH, FUEL_CPI_WEIGHT, HOUSEHOLD_EQUITY0, PUBLIC_CAPITAL_ELASTICITY, WEALTH_MPC } from '../data/world';
import { publicCapitalFactor } from './fiscal-rules';
import { aiMismatch, aiProductivity, carbonCost, EMISSION_INTENSITY, greenFuelSaving, hiringBoost, labourCostMultiplier, wageMultiplier, abatement } from './policy';
import { fdiExports } from './fdi';
import { palmHouseholdDelta } from './soe';
import { foodUserPrice, fuelPriceIndex, householdFuelBillDelta } from './world';
// Aggregate KL economy: households, 7 input–output sectors, labour, prices and investment.
// See docs/economy-model.md for the equations; every rule here has a matching section there.
import { BASE_TAX, CPI_WEIGHTS, INVESTMENT_GOODS, IO, SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { CommodityId, GameState, SectorId } from '../types/game';
import {
  CREDIT_SPEND, HOUSEHOLD_AMORT_MONTHLY, HOUSEHOLD_RATE_PREMIUM,
  NORMAL_UTIL, PROPERTY_LEVY_BASE, SURCHARGE_BASE_SHARE, type Vec,
} from './calibration';
import type { AggregatedMods } from './external';
import { post, type GovDay } from './government';
import { clamp, toMinor } from './util';

/** Monthly amounts are 'per average month'; daily flow = monthly × 12/365. */
export const PER_DAY = 12 / 365;
const zero = (): Vec => Object.fromEntries(SECTOR_IDS.map((s) => [s, 0])) as Vec;
const PRICE_SPEED = 0.025; // daily convergence of sector prices to cost-based targets
const RENT_SPEED = 0.01;
const LABOR_STRETCH = 1.08;

export interface DayEconomy {
  gdpNominal: number;
  gdpReal: number;
  levy: number;
  householdTax: number;
}

/** Share of steel imports replaced by domestic producers under a safeguard duty (ASSUMPTION). */
const STEEL_SUBSTITUTION = 0.4;

/**
 * Imported inputs per unit of a sector's import requirement, in ringgit. `user` is what firms pay
 * (duties included, subsidies netted); the other fields split it for settlement. Model 2 prices
 * generic goods across trading partners (bilateral tariffs, diversion) and wheat/steel separately.
 */
export function importCost(s: GameState, j: SectorId) {
  const BASELINE = baselineFor(s);
  const e = s.external;
  const fxf = e.myrPerUsd / BASELINE.myrPerUsd;
  const es = SECTORS[j].energyImportShare;
  const mfn = s.trade.policy.tariff;
  if (!nationalV2(s)) {
    const cif = fxf * ((1 - es) * e.usPrice + es * e.oil);
    return { user: cif * (1 + mfn), cif, mfnDuty: cif * mfn, bilateralDuty: 0, steelDuty: 0, steelSubstituted: 0, wheatQty: 0, riceQty: 0 };
  }
  const w = s.world;
  const shares = COMMODITY_IMPORT[j] ?? {};
  const commodityShare = Object.values(shares).reduce((x, v) => x + (v ?? 0), 0);
  const generic = (1 - es - commodityShare) * e.usPrice * w.importPriceIndex;
  const bilateralDuty = generic * w.importDutyShare;
  const sub = STEEL_SUBSTITUTION * w.policy.steelSafeguard;
  let user = 0, cifCommodities = 0, steelDuty = 0;
  for (const [c, share] of Object.entries(shares) as [CommodityId, number][]) {
    const p = c==='steel' && j==='ind' ? contractedSteel(s,w.prices[c]) : w.prices[c];
    if (c === 'steel') {
      // Domestic steel sells at import parity, so users pay the duty-inclusive price on all steel.
      const imported = share * p * (1 - sub);
      steelDuty = imported * w.policy.steelSafeguard;
      cifCommodities += imported;
      user += share * p * (1 + w.policy.steelSafeguard);
    } else {
      cifCommodities += share * p;
      user += share * (c === 'wheat' || c === 'rice' ? foodUserPrice(s, c) : p);
    }
  }
  // Power generation runs on regulated domestic gas and coal, with fuel costs passed to tariffs only partly
  // (ICPT): utilities feel a damped oil/LNG/coal mix; other sectors buy fuel at world crude prices.
  const pt = UTILITY_FUEL_PASSTHROUGH;
  // Renewables built under the green programme displace part of the power sector's imported fuel (schema 9).
  const energy = j === 'util' ? (1 + pt.oil * (e.oil - 1) + pt.gas * (w.prices.gas - 1) + pt.coal * (w.prices.coal - 1)) * (1 - greenFuelSaving(s)) : e.oil;
  const preMfnUser = generic + es * energy + user;
  const cif = generic - bilateralDuty + es * energy + cifCommodities;
  return {
    user: fxf * preMfnUser * (1 + mfn),
    cif: fxf * cif,
    mfnDuty: fxf * cif * mfn,
    bilateralDuty: fxf * bilateralDuty,
    steelDuty: fxf * steelDuty,
    steelSubstituted: (shares.steel ?? 0) * sub, // real domestic steel demand per unit of import requirement
    wheatQty: shares.wheat ?? 0,
    riceQty: shares.rice ?? 0,
  };
}

/** Public infrastructure and capital raise every sector's productivity (model 2), 1 at opening. */
export function productivityBoost(s: GameState, j: SectorId): number {
  const pcf = nationalV2(s) ? publicCapitalFactor(s, PUBLIC_CAPITAL_ELASTICITY) : 1;
  return (1 + s.sectors[j].infraBoost) * pcf * aiProductivity(s, j);
}

/**
 * Export demand index (real) for a sector. External demand × price competitiveness: KL prices
 * relative to foreign prices in MYR (FX × US price level). Visitors also respond to the levy.
 */
export function exportIndex(s: GameState, j: SectorId): number {
  const BASELINE = baselineFor(s);
  const e = s.external;
  const fxf = e.myrPerUsd / BASELINE.myrPerUsd;
  const rel = s.sectors[j].price / (fxf * e.usPrice);
  const levyHit = clamp(1 - demandFor(s).visitorLevyElasticity * (s.government.policies.tax.consumption - BASE_TAX.consumption), 0.4, 1.3);
  const mix = SECTORS[j].exportMix;
  let idx = 0;
  idx += (mix.my ?? 0) * e.myDemand * Math.pow(s.sectors[j].price / (s.indicators.cpi / 100), -0.3);
  // Model 2: goods exports are shared across trading partners, whose cycles, tariffs and agreements set access.
  const access = nationalV2(s) ? s.world.exportAccess : 1;
  idx += (mix.global ?? 0) * e.globalDemand * access * Math.pow(rel, -0.6);
  idx += (mix.tourism ?? 0) * e.tourism * (1 + s.government.tourismBoost) * levyHit * Math.pow(rel, -0.8);
  idx += (mix.tech ?? 0) * Math.sqrt(e.techCycle * e.globalDemand) * access * Math.pow(rel, -0.5);
  return idx * (1 + s.trade.readiness);
}

/** Read-only household spending plan, shared by settlement and static policy previews. */
export function householdDemand(s: GameState, transfersPaid: number) {
  const CAL = calibrationFor(s);
  const hh = s.households;
  const bank = s.bank;
  const tax = s.government.policies.tax;

  // --- Household income (MYR/day) ------------------------------------------------------------
  let wages = 0;
  const wagesBy = zero();
  for (const j of SECTOR_IDS) {
    wagesBy[j] = s.sectors[j].employment * CAL.wage0[j] * hh.wageIndex * wageMultiplier(s, j);
    wages += wagesBy[j];
  }
  // Palm smallholder profit and estate wages move with world palm prices (model 2, relative to opening).
  const other = hh.otherIncomeMonthly * PER_DAY + palmHouseholdDelta(s);
  const householdTax = toMinor(tax.household * wages * SURCHARGE_BASE_SHARE) / 100;
  const hhRate = bank.lendingRate + HOUSEHOLD_RATE_PREMIUM;
  const interestH = (bank.loansH * hhRate) / 365;
  const amortH = bank.loansH * HOUSEHOLD_AMORT_MONTHLY * PER_DAY;
  const disposable = wages + transfersPaid + other - householdTax - interestH - amortH;
  // Permanent-income smoothing: households spend out of a blend of current and smoothed income,
  // drawing down savings when income dips (spec: DrawdownFromSavings).
  // Model 3: households also expect trend nominal income growth, and correct toward current income slowly (D-056).
  const D = demandFor(s);
  const permanentIncome = hh.permanentIncome * (1 + D.permanentDrift / 365) + D.permanentSpeed * (disposable - hh.permanentIncome);
  // Wealth effect: households spend a small share of listed-equity gains and losses (model 2).
  const wealthSpend = nationalV2(s) ? (WEALTH_MPC / 365) * HOUSEHOLD_EQUITY0 * (hh.equityIndex - 1) : 0;
  // Pump prices: extra fuel spending comes out of the household budget for other goods (model 2).
  const { consumption: basket, spending, fuelAdjustment } = householdSpending(disposable, permanentIncome, hh.savings, hh.mpc, wealthSpend, householdFuelBillDelta(s), D.currentIncomeWeight);
  // A share of the non-fuel basket buys finished imports directly; it leaves the domestic sectors (model 3).
  const importedConsumption = basket * D.importedConsumption;
  const consumption = basket - importedConsumption;
  const credit = hh.newCreditMonthly * PER_DAY;
  return { wagesBy, wages, other, householdTax, interestH, amortH, disposable, permanentIncome, consumption, importedConsumption, spending, fuelAdjustment, credit };
}

export function daily(s: GameState, mods: AggregatedMods, gov: GovDay): DayEconomy {
  const BASELINE = baselineFor(s);
  const CAL = calibrationFor(s);
  const hh = s.households;
  const bank = s.bank;
  const tax = s.government.policies.tax;
  const { wagesBy, wages, other, householdTax, interestH, amortH, disposable, permanentIncome, consumption, spending, credit } = householdDemand(s, gov.transfersPaid);
  post(s.government, 'taxHousehold', householdTax);
  bank.mtdInterestH += interestH;
  bank.mtdAmortH += amortH;
  hh.permanentIncome = permanentIncome;
  hh.savings = (hh.savings + disposable) - spending;

  // Discretionary export services are paid only from available treasury cash.
  const support = post(s.government, 'exportSupport', s.trade.policy.exportBudgetMonthly * PER_DAY);
  gov.purchases.tech += support * 0.6;
  gov.purchases.fin += support * 0.4;
  const targetReadiness = clamp(support / (1e9 * PER_DAY) * 0.12, 0, 0.12);
  s.trade.readiness += (targetReadiness - s.trade.readiness) / 90;
  const exports = zero();
  const fdiX = fdiExports(s);
  // --- Final demand (nominal MYR → real) -------------------------------------------------------
  const finalReal: number[] = [];
  let levy = 0;
  let consPurchasesReal = 0;
  const sectorTotal: Vec = zero();
  for (const j of SECTOR_IDS) {
    const sec = s.sectors[j];
    let c = consumption * SECTORS[j].consumption + credit * (CREDIT_SPEND[j] ?? 0);
    if (j === 'cons') {
      const net = c / (1 + tax.consumption);
      levy += c - net;
      c = net;
    }
    if (j === 'prop') hh.mtd.rent += consumption * SECTORS[j].consumption;
    let inv = 0;
    for (const k of SECTOR_IDS) inv += s.sectors[k].investmentMonthly * PER_DAY * (INVESTMENT_GOODS[j] ?? 0);
    const domesticNominal = c + gov.purchases[j] + inv;
    const xReal = CAL.X0[j] * exportIndex(s, j) * (j === 'prop' ? mods.propDemand : 1) + fdiX[j];
    exports[j] = xReal;
    if (j === 'cons') {
      // Visitors (the tourism share of consumer exports) pay the levy on top of the sector price.
      const visitors = xReal * (SECTORS.cons.exportMix.tourism ?? 0);
      levy += visitors * sec.price * tax.consumption;
      consPurchasesReal += c / sec.price + visitors;
    }
    let fr = (domesticNominal * (j === 'prop' ? mods.propDemand : 1)) / sec.price + xReal;
    // A steel safeguard shifts part of steel demand to domestic producers (yesterday's quantities).
    if (j === 'ind' && nationalV2(s) && s.world.policy.steelSafeguard > 0) {
      for (const k of SECTOR_IDS) fr += SECTORS[k].importShare * importCost(s, k).steelSubstituted * s.sectors[k].output;
    }
    finalReal.push(fr);
    sectorTotal[j] = fr;
  }
  post(s.government, 'taxConsumption', levy);

  // --- Leontief production, capped by capacity --------------------------------------------------
  const Y = CAL.leontief.map((row) => row.reduce((a, x, k) => a + x * finalReal[k], 0));
  let gdpNominal = levy;
  let gdpReal = BASE_TAX.consumption * consPurchasesReal;
  const Ktot = SECTOR_IDS.reduce((a, j) => a + s.sectors[j].capital, 0);
  const rateF = bank.lendingRate;
  let tariffReceipts = 0;
  let steelDutyReceipts = 0;
  let bilateralReceipts = 0;
  let carbonTax = 0, emissions = 0, emissions0 = 0;
  let wheatImports = 0;
  let riceImports = 0;
  SECTOR_IDS.forEach((j, idx) => {
    const sec = s.sectors[j];
    const boost = productivityBoost(s, j);
    const cap = sec.capacity * boost * (mods.capacity[j] ?? 1);
    // Labour also limits output: staff can stretch ~8% above their normal productivity.
    const laborCap = sec.employment * CAL.laborProd0[j] * sec.productivity * boost * LABOR_STRETCH;
    const demand = Math.max(0, Y[idx]);
    sec.demandCapped = Math.min(demand, cap);
    sec.utilization = Math.max(demand / cap, (demand / laborCap) * LABOR_STRETCH * NORMAL_UTIL);
    const out = Math.min(demand, cap, laborCap);
    sec.output = out;
    const gross = sec.price * out;
    const ic = importCost(s, j);
    const req = SECTORS[j].importShare * out;
    const imports = ic.cif * req;
    tariffReceipts += (ic.mfnDuty + ic.bilateralDuty) * req;
    steelDutyReceipts += ic.steelDuty * req;
    bilateralReceipts += ic.bilateralDuty * req;
    wheatImports += ic.wheatQty * req;
    riceImports += ic.riceQty * req;
    s.trade.mtdImports += imports;
    s.trade.mtdExports += exports[j] * (demand > 0 ? out / demand : 0) * sec.price;
    let inter = ic.user * req;
    for (const i of SECTOR_IDS) inter += IO[i][j] * s.sectors[i].price * out;
    const va = gross - inter;
    const realVa = CAL.v[j] * out;
    const dep = (BASELINE.depreciation * sec.capital) / 365;
    const interest = (bank.loansF * (sec.capital / Ktot) * rateF) / 365;
    const propLevy = j === 'prop' ? tax.property * PROPERTY_LEVY_BASE * gross : 0;
    // Employers also bear the foreign-worker levy (labour cost above household wages) and any carbon tax (schema 9).
    const labourCost = wagesBy[j] * labourCostMultiplier(s, j) / wageMultiplier(s, j);
    const carbon = carbonCost(s, j) * out;
    carbonTax += carbon;
    emissions += EMISSION_INTENSITY[j] * out;
    emissions0 += EMISSION_INTENSITY[j] * CAL.Y0[j];
    const profit = va - labourCost - dep - interest - propLevy - carbon;
    sec.mtd.output += out;
    sec.mtd.nominalOutput += gross;
    sec.mtd.va += va;
    sec.mtd.realVa += realVa;
    sec.mtd.wages += wagesBy[j];
    sec.mtd.profit += profit;
    sec.mtd.taxableProfit += profit;
    sec.mtd.demand += demand;
    sec.avgUtil += (sec.utilization - sec.avgUtil) * 0.03;
    gdpNominal += va;
    gdpReal += realVa;
  });

  const tariffPaid = post(s.government, 'importTariff', tariffReceipts);
  if (s.policy?.enabled) {
    s.policy.mtd.carbonTax += post(s.government, 'policyLevy', carbonTax);
    s.policy.emissionsIndex = emissions * (1 - abatement(s)) / Math.max(1e-9, emissions0);
  }
  const steelDutyPaid = post(s.government, 'commodityDuty', steelDutyReceipts);
  if (nationalV2(s)) {
    s.world.mtd.bilateralDuty += bilateralReceipts;
    s.world.mtd.steelDuty += steelDutyPaid;
    s.world.lastWheatImports = wheatImports;
    s.world.lastRiceImports = riceImports;
  }
  // Tariffs are net product taxes. They offset the domestic input-tax deduction in VA;
  // they do not create real output or enter base-price real GDP (opening tariff = zero).
  gdpNominal += tariffPaid + steelDutyPaid;
  // --- Prices: move toward cost-based targets with demand-pressure markups -----------------------
  // Model 3 anchors margins to pre-tax domestic prices, so a levy or pump-price change is not re-marked-up by every sector.
  const cpiIdx = demandFor(s).taxFreePriceAnchor ? producerAnchor(s) : s.indicators.cpi / 100;
  const nextP: Vec = zero();
  for (const j of SECTOR_IDS) {
    const sec = s.sectors[j];
    let target = SECTORS[j].importShare * importCost(s, j).user;
    for (const i of SECTOR_IDS) target += IO[i][j] * s.sectors[i].price;
    const ulc = hh.wageIndex * labourCostMultiplier(s, j) / sec.productivity / productivityBoost(s, j);
    const markup = clamp(1 + 0.8 * (sec.utilization - NORMAL_UTIL), 0.85, 1.3);
    const ls = SECTORS[j].laborShare;
    target += CAL.v[j] * (ls * ulc + (1 - ls) * markup * cpiIdx);
    if (j === 'prop') target *= 1 + 0.5 * (tax.property - BASE_TAX.property);
    target += carbonCost(s, j);
    nextP[j] = sec.price + PRICE_SPEED * (target - sec.price);
  }
  for (const j of SECTOR_IDS) s.sectors[j].price = clamp(nextP[j], 0.3, 5);
  const prop = s.sectors.prop;
  const rentTarget = prop.price * s.government.housingFactor * clamp(1 + 0.8 * (prop.avgUtil - NORMAL_UTIL), 0.8, 1.3) * (1 + 0.5 * (tax.property - BASE_TAX.property));
  hh.rentIndex += RENT_SPEED * (rentTarget - hh.rentIndex);
  s.indicators.cpi = computeCpi(s);

  hh.mtd.wages += wages;
  hh.mtd.transfers += gov.transfersPaid;
  hh.mtd.other += other;
  hh.mtd.tax += householdTax;
  hh.mtd.debtService += interestH + amortH;
  hh.mtd.disposable += disposable;
  hh.mtd.consumption += spending + credit;
  return { gdpNominal, gdpReal, levy, householdTax };
}

/** Basket-weighted domestic prices excluding the consumption levy and pump prices (1 at opening). */
export function producerAnchor(s: GameState): number {
  let c = 0;
  for (const j of SECTOR_IDS) c += CPI_WEIGHTS[j] * (j === 'prop' ? s.households.rentIndex : s.sectors[j].price);
  return c;
}

export function computeCpi(s: GameState): number {
  const levyF = (1 + s.government.policies.tax.consumption) / (1 + BASE_TAX.consumption);
  let c = 0;
  for (const j of SECTOR_IDS) {
    const p = j === 'prop' ? s.households.rentIndex : j === 'cons' ? s.sectors[j].price * levyF : s.sectors[j].price;
    c += CPI_WEIGHTS[j] * p;
  }
  // Model 2: household pump prices (capped for eligible buyers) carry their own CPI weight.
  if (nationalV2(s)) c = (1 - FUEL_CPI_WEIGHT) * c + FUEL_CPI_WEIGHT * fuelPriceIndex(s);
  return 100 * c;
}

/** Weekly: hiring/firing toward output-implied labour demand, bounded by the labour force. */
export function weekly(s: GameState): void {
  const CAL = calibrationFor(s);
  const hh = s.households;
  let total = 0;
  for (const j of SECTOR_IDS) {
    const sec = s.sectors[j];
    // Hire toward the labour needed for demand that capital capacity can serve.
    // Higher labour costs (minimum wage, levy) trim labour demand with elasticity −0.3; reskilling speeds hiring.
    const need = sec.demandCapped / (CAL.laborProd0[j] * sec.productivity * productivityBoost(s, j)) / Math.pow(labourCostMultiplier(s, j), 0.3);
    sec.employment += demandFor(s).hiringSpeed * (need > sec.employment ? hiringBoost(s) : 1) * (need - sec.employment);
    total += sec.employment;
  }
  const maxEmp = hh.laborForce * 0.985;
  if (total > maxEmp) for (const j of SECTOR_IDS) s.sectors[j].employment *= maxEmp / total;
  hh.employed = Math.min(total, maxEmp);
}

/**
 * Month close for the private economy. Called after government settlement so that
 * `taxRate` is the rate that applied during the month. Sets next month's investment plans,
 * credit, wages, expectations and household behaviour.
 */
export function monthClose(s: GameState, inflationYoY: number, unemployment: number, incomeTrend: number, days: number, coreInflation = inflationYoY): void {
  const BASELINE = baselineFor(s);
  const CAL = calibrationFor(s);
  const BASE_LEND_RATE = baselineFor(s).opr + 0.02;
  const TREND = trendFor(s);
  const DEMAND = demandFor(s);
  const hh = s.households;
  const bank = s.bank;
  const confidence = confidenceChannels(hh.confidence);


  // Profits → distributions and internal funds (normalised to an average-length month)
  const perAvgMonth = 365 / 12 / days;
  let distributed = 0;
  const desired: Vec = zero();
  const internal: Vec = zero();
  for (const j of SECTOR_IDS) {
    const sec = s.sectors[j];
    const profit = sec.mtd.profit;
    const afterTax = profit - Math.max(0, sec.mtd.taxableProfit) * sectorTax(s,j);
    sec.lastMonthProfit = profit;
    distributed += Math.max(0, afterTax) * BASELINE.transferShareToHouseholdsOfProfit * perAvgMonth;
    sec.retained = Math.max(0, afterTax) * (1 - BASELINE.transferShareToHouseholdsOfProfit) * perAvgMonth;
    // Investment: after-tax return vs baseline, cost of credit, utilisation and confidence
    const rok = (afterTax * 365) / days / sec.capital;
    const g = clamp(
      TREND.capitalGrowth + 0.12 * (rok - CAL.rok0[j]) - DEMAND.investmentRate * (bank.lendingRate - BASE_LEND_RATE) + 0.12 * (sec.avgUtil - NORMAL_UTIL) + confidence.investmentGrowth
        // Tobin's q (model 3, D-058): firms invest more when listed equity is valued above its opening level.
        + DEMAND.tobinQ * Math.log(hh.equityIndex),
      -0.02,
      0.09,
    );
    // Partial adjustment: plans move 30% of the way toward the target each month.
    desired[j] = 0.7 * sec.investmentMonthly + 0.3 * ((sec.capital * (BASELINE.depreciation + g)) / 12);
    internal[j] = sec.retained * 0.9;
  }
  hh.otherIncomeMonthly = distributed;

  // Credit: firms' external financing need + households' borrowing demand vs bank supply
  let firmNeed = 0;
  for (const j of SECTOR_IDS) firmNeed += Math.max(0, desired[j] - internal[j]);
  const hhDemand = bank.loansH * (HOUSEHOLD_AMORT_MONTHLY + 0.004 * confidence.creditGrowthMultiplier * clamp(1 - DEMAND.creditRate * (bank.lendingRate - BASE_LEND_RATE), 0.2, 1.6));
  const firmRepay = bank.loansF * 0.01;
  const supply = creditSupply(s);
  const demandTotal = firmNeed + firmRepay + hhDemand;
  const ratio = demandTotal > 0 ? clamp(supply / demandTotal, 0, 1) : 1;
  bank.firmCreditRatio = ratio;
  const newFirm = (firmNeed + firmRepay) * ratio;
  const newHh = hhDemand * ratio;
  hh.newCreditMonthly = newHh;

  for (const j of SECTOR_IDS) {
    const sec = s.sectors[j];
    const need = Math.max(0, desired[j] - internal[j]);
    sec.investmentMonthly = Math.max(0, Math.min(desired[j], internal[j]) + need * ratio);
    // capital & capacity
    const pInv = SECTOR_IDS.reduce((a, k) => a + (INVESTMENT_GOODS[k] ?? 0) * s.sectors[k].price, 0);
    sec.capital += sec.investmentMonthly - (sec.capital * BASELINE.depreciation) / 12;
    const matured = sec.pipeline.shift() ?? 0;
    sec.pipeline.push(sec.investmentMonthly / pInv / CAL.capitalPerCap[j]);
    sec.capacity += matured - (sec.capacity * BASELINE.depreciation) / 12;
    sec.productivity *= 1 + TREND.productivity / 12;
  }
  // Bank balance sheet: new loans create deposits; repayments destroy them.
  bank.loansF += newFirm - firmRepay;
  bank.deposits += newFirm - firmRepay;
  const amortH = bank.mtdAmortH;
  bank.mtdAmortH = 0;
  bank.loansH += newHh - amortH;
  bank.deposits += newHh - amortH;
  bank.mtdNewLoans = newFirm + newHh;
  hh.loans = bank.loansH;

  // Wages: expectations + trend productivity + Phillips-curve tightness
  const wg = clamp((hh.expectedInflation + TREND.productivity + 0.6 * (TREND.naturalUnemployment - unemployment)) / 12, -0.003, 0.012);
  hh.wageIndex *= 1 + wg;
  hh.expectedInflation = clamp(0.82 * hh.expectedInflation + 0.1 * inflationYoY + 0.08 * BASELINE.inflationTarget, -0.02, 0.15);
  // Workforce (incl. commuters/migrants) grows on trend and partially follows labour demand.
  hh.laborForce *= 1 + TREND.laborForce / 12;
  // AI task displacement adds mismatch unemployment unless reskilling keeps pace (schema 9).
  hh.laborForce += DEMAND.laborForcePull * (hh.employed / (1 - TREND.naturalUnemployment - aiMismatch(s)) - hh.laborForce);
  hh.population *= 1 + 0.012 / 12;

  const behaviour = householdBehaviour(hh.confidence, hh.mpc, unemployment - TREND.naturalUnemployment, coreInflation, incomeTrend, s.external.riskAppetite);
  hh.confidence = behaviour.confidence;
  hh.mpc = behaviour.mpc;
}

/** New lending capacity this month: capital headroom × willingness. */
export function creditSupply(s: GameState): number {
  const b = s.bank;
  const loans = b.loansH + b.loansF;
  const headroom = Math.max(0, b.capital / 0.1 - loans);
  return Math.min(headroom, loans * 0.03) * b.willingness;
}

export function resetMonthToDate(s: GameState): void {
  for (const j of SECTOR_IDS) s.sectors[j].mtd = { output: 0, nominalOutput: 0, va: 0, realVa: 0, wages: 0, profit: 0, taxableProfit: 0, demand: 0 };
  s.households.mtd = { wages: 0, transfers: 0, other: 0, tax: 0, debtService: 0, disposable: 0, consumption: 0, rent: 0 };
}
