// One-off steady-state calibration of the KL input–output economy. Pure and deterministic.
// Final demand f = (I − A)·Y0; household, government and investment components come from the
// behavioural rules evaluated at baseline, and exports are the residual (asserted positive in tests).
import { BASE_BUDGET, BASE_BUDGET_V1, BASE_TAX, BASELINE, LEGACY_BASELINE, LEGACY_BUDGET, LEGACY_TREND, NATIONAL_DEMAND, NATIONAL_GDP, NATIONAL_TREND, BUDGET_PURCHASES, INVESTMENT_GOODS, IO, SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { BudgetCategory, SectorId, GameState } from '../types/game';
import { BOOM, boomOn } from '../data/boom';
import { DEVELOPMENT_ANNUAL0, DEVELOPMENT_PURCHASES, RESOURCE_VA0 } from '../data/world';

export type Vec = Record<SectorId, number>;
const zero = (): Vec => Object.fromEntries(SECTOR_IDS.map((s) => [s, 0])) as Vec;

/** Inverse of an n×n matrix (Gauss–Jordan with partial pivoting). */
export function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f !== 0) for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row) => row.slice(n));
}

export const BASE_LEND_RATE = BASELINE.opr + 0.02;
export const HOUSEHOLD_RATE_PREMIUM = 0.005;
export const HOUSEHOLD_AMORT_MONTHLY = 0.01;
export const HOUSEHOLD_CREDIT_GROWTH = 0.004; // monthly net growth at baseline
export const CREDIT_SPEND: Partial<Vec> = { prop: 0.35, cons: 0.65 };
export const SURCHARGE_BASE_SHARE = 0.7; // share of the wage bill above the exemption threshold
export const PROPERTY_LEVY_BASE = 0.5; // commercial rental value as a share of property gross output
export const BASE_MPC = 0.86;
export const NORMAL_UTIL = 0.85;
/** Baseline desired net capital growth of the KL-era trend (model 1/2); see `trendFor` for model 3. */
export const CAPITAL_GROWTH0 = LEGACY_TREND.capitalGrowth;
export const RELATIVE_WAGE: Vec = { fin: 1.6, prop: 0.9, util: 1.3, tech: 1.4, cons: 0.75, health: 1.0, ind: 1.0 };

export interface Calibration {
  v: Vec; // value-added ratio
  Y0: Vec; // daily gross output (real, base prices)
  f0: Vec;
  L0: Vec;
  wage0: Vec; // MYR per worker per day at wage index 1
  K0: Vec;
  cap0: Vec;
  capitalPerCap: Vec; // MYR capital per MYR/day of capacity
  laborProd0: Vec; // output per worker per day
  C0: Vec; // household purchases (sector receipts) per day
  G0: Vec;
  I0: Vec;
  X0: Vec; // real export demand per day at index 1
  profit0: Vec; // daily pre-tax profit
  rok0: Vec; // annual after-tax return on capital
  leontief: number[][];
  hh: { wages: number; transfers: number; other: number; tax: number; debtService: number; disposable: number; consumption: number; credit: number; levy: number };
  levyBase: number; // daily consumption levy at baseline
  gdpDaily: number;
}

function calibrate(BASELINE = LEGACY_BASELINE, BASE_BUDGET = LEGACY_BUDGET, scale = 1, developmentAnnual = 0, capitalGrowth = CAPITAL_GROWTH0, importedConsumption = 0): Calibration {
  const BASE_LEND_RATE = BASELINE.opr + 0.02;
  const vaAnnual = (j: SectorId) => SECTORS[j].vaAnnual * scale;
  const n = SECTOR_IDS.length;
  const v = zero(), Y0 = zero(), L0 = zero(), wage0 = zero(), K0 = zero(), cap0 = zero(), capitalPerCap = zero(), laborProd0 = zero();
  // Sector capital-output ratios describe the whole capital stock. When federal development spending is
  // modelled explicitly, its share of gross fixed investment is public capital, so the private stock
  // (and private investment) is reduced by that share rather than counting public investment twice.
  const fullInvestment = SECTOR_IDS.reduce((a, j) => a + SECTORS[j].capitalToVa * vaAnnual(j), 0) * (BASELINE.depreciation + capitalGrowth);
  const privateShare = 1 - developmentAnnual / fullInvestment;
  for (const j of SECTOR_IDS) {
    const colSum = SECTOR_IDS.reduce((s, i) => s + IO[i][j], 0);
    v[j] = 1 - colSum - SECTORS[j].importShare;
    Y0[j] = vaAnnual(j) / 365 / v[j];
    K0[j] = SECTORS[j].capitalToVa * vaAnnual(j) * privateShare;
    cap0[j] = Y0[j] / NORMAL_UTIL;
    capitalPerCap[j] = K0[j] / cap0[j];
  }
  // Employment split by wage bill and relative wage
  const employed0 = BASELINE.laborForce * (1 - BASELINE.unemployment);
  const weights = SECTOR_IDS.map((j) => (SECTORS[j].laborShare * vaAnnual(j)) / RELATIVE_WAGE[j]);
  const wsum = weights.reduce((a, b) => a + b, 0);
  SECTOR_IDS.forEach((j, k) => {
    L0[j] = (employed0 * weights[k]) / wsum;
    wage0[j] = (SECTORS[j].laborShare * vaAnnual(j)) / 365 / L0[j];
    laborProd0[j] = Y0[j] / L0[j];
  });
  // f0 = (I - A) Y0
  const f0 = zero();
  for (const i of SECTOR_IDS) f0[i] = Y0[i] - SECTOR_IDS.reduce((s, j) => s + IO[i][j] * Y0[j], 0);

  // Baseline profits (daily)
  const Ktot = SECTOR_IDS.reduce((s, j) => s + K0[j], 0);
  const profit0 = zero(), rok0 = zero();
  let afterTaxTotal = 0;
  for (const j of SECTOR_IDS) {
    const va = vaAnnual(j) / 365;
    const wages = SECTORS[j].laborShare * va;
    const dep = (BASELINE.depreciation * K0[j]) / 365;
    const interest = (BASELINE.firmLoans * (K0[j] / Ktot) * BASE_LEND_RATE) / 365;
    const levy = j === 'prop' ? BASE_TAX.property * PROPERTY_LEVY_BASE * Y0[j] : 0;
    profit0[j] = va - wages - dep - interest - levy;
    const at = profit0[j] - Math.max(0, profit0[j]) * BASE_TAX.corporate;
    rok0[j] = (at * 365) / K0[j];
    afterTaxTotal += Math.max(0, at);
  }

  // Households (daily)
  const wages = SECTOR_IDS.reduce((s, j) => s + L0[j] * wage0[j], 0);
  const transfers = (BASE_BUDGET.transfers * 12) / 365;
  const other = BASELINE.transferShareToHouseholdsOfProfit * afterTaxTotal;
  const tax = BASE_TAX.household * wages * SURCHARGE_BASE_SHARE;
  const debtService = (BASELINE.householdLoans * (BASE_LEND_RATE + HOUSEHOLD_RATE_PREMIUM)) / 365 + (BASELINE.householdLoans * HOUSEHOLD_AMORT_MONTHLY * 12) / 365;
  const disposable = wages + transfers + other - tax - debtService;
  const consumption = disposable * BASE_MPC;
  const credit = (BASELINE.householdLoans * (HOUSEHOLD_AMORT_MONTHLY + HOUSEHOLD_CREDIT_GROWTH) * 12) / 365;

  const C0 = zero();
  let levy = 0;
  for (const j of SECTOR_IDS) {
    let spend = consumption * (1 - importedConsumption) * SECTORS[j].consumption + credit * (CREDIT_SPEND[j] ?? 0);
    if (j === 'cons') {
      levy += spend - spend / (1 + BASE_TAX.consumption);
      spend /= 1 + BASE_TAX.consumption;
    }
    C0[j] = spend;
  }
  const G0 = zero();
  for (const cat of Object.keys(BUDGET_PURCHASES) as Exclude<BudgetCategory, 'transfers'>[]) {
    const daily = (BASE_BUDGET[cat] * 12) / 365;
    for (const [j, sh] of Object.entries(BUDGET_PURCHASES[cat])) G0[j as SectorId] += daily * (sh as number);
  }
  // Federal development spending buys construction, equipment and services like other purchases.
  for (const [j, sh] of Object.entries(DEVELOPMENT_PURCHASES)) G0[j as SectorId] += (developmentAnnual / 365) * sh;
  const Itot = (Ktot * (BASELINE.depreciation + capitalGrowth)) / 365;
  const I0 = zero();
  for (const [j, sh] of Object.entries(INVESTMENT_GOODS)) I0[j as SectorId] = Itot * (sh as number);

  const X0 = zero();
  for (const j of SECTOR_IDS) X0[j] = f0[j] - C0[j] - G0[j] - I0[j];
  // Visitors also pay the consumption levy on the tourism share of consumer exports.
  levy += X0.cons * (SECTORS.cons.exportMix.tourism ?? 0) * BASE_TAX.consumption;

  const A = SECTOR_IDS.map((i) => SECTOR_IDS.map((j) => (i === j ? 1 : 0) - IO[i][j]));
  const leontief = invert(A);
  void n;
  const gdpDaily = SECTOR_IDS.reduce((s, j) => s + vaAnnual(j) / 365, 0) + levy;
  return {
    v, Y0, f0, L0, wage0, K0, cap0, capitalPerCap, laborProd0, C0, G0, I0, X0, profit0, rok0, leontief,
    hh: { wages, transfers, other, tax, debtService, disposable, consumption, credit, levy },
    levyBase: levy,
    gdpDaily,
  };
}

export const LEGACY_CAL: Calibration = calibrate();
/** Linear solve for the sector scale whose GDP (sector value added + product levy) hits `target`. */
function nationalScale(budget: typeof BASE_BUDGET, target: number, developmentAnnual: number, capitalGrowth = CAPITAL_GROWTH0, importedConsumption = 0): number {
  const c1 = calibrate(BASELINE, budget, 1, developmentAnnual, capitalGrowth, importedConsumption).gdpDaily * 365;
  const c2 = calibrate(BASELINE, budget, 2, developmentAnnual, capitalGrowth, importedConsumption).gdpDaily * 365;
  return 1 + (target - c1) / (c2 - c1);
}
/** Model 1 (schema-5 saves): the seven sectors carry all of GDP; no development budget. */
export const NATIONAL_SCALE_V1 = nationalScale(BASE_BUDGET_V1, NATIONAL_GDP, 0);
export const CAL_V1: Calibration = calibrate(BASELINE, BASE_BUDGET_V1, NATIONAL_SCALE_V1);
/** Model 2: oil & gas and palm oil are a separate resource sector, so the seven sectors carry the rest.
 * Kept for model-2 saves, whose opening investment used the KL-era 3.5% capital growth. */
export const NATIONAL_SCALE = nationalScale(BASE_BUDGET, NATIONAL_GDP - RESOURCE_VA0, DEVELOPMENT_ANNUAL0);
export const CAL_V2: Calibration = calibrate(BASELINE, BASE_BUDGET, NATIONAL_SCALE, DEVELOPMENT_ANNUAL0);
/** Model 3 (current national campaigns): the same economy, with opening investment on the national capital-growth
 * trend (D-055). */
export const NATIONAL_SCALE_V3 = nationalScale(BASE_BUDGET, NATIONAL_GDP - RESOURCE_VA0, DEVELOPMENT_ANNUAL0, NATIONAL_TREND.capitalGrowth, NATIONAL_DEMAND.importedConsumption);
export const CAL: Calibration = calibrate(BASELINE, BASE_BUDGET, NATIONAL_SCALE_V3, DEVELOPMENT_ANNUAL0, NATIONAL_TREND.capitalGrowth, NATIONAL_DEMAND.importedConsumption);
export const calibrationFor = (s: Pick<GameState, 'baseline'>): Calibration =>
  s.baseline.profile === 'legacy-kl' ? LEGACY_CAL : s.baseline.model === 1 ? CAL_V1 : s.baseline.model === 2 ? CAL_V2 : CAL;
/** Boom mode (D-079): a small open economy sells what it can make, so foreign demand scales with sector capacity. 1 in realistic campaigns. */
export const exportReach = (s: Pick<GameState, 'baseline' | 'mode' | 'sectors'>, j: SectorId): number =>
  boomOn(s) ? Math.pow(Math.max(1, s.sectors[j].capacity / calibrationFor(s).cap0[j]), BOOM.exportCapacityElasticity) : 1;
export const SECTOR_INDEX: Record<SectorId, number> = Object.fromEntries(SECTOR_IDS.map((s, i) => [s, i])) as Record<SectorId, number>;
