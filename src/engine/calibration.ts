// One-off steady-state calibration of the KL input–output economy. Pure and deterministic.
// Final demand f = (I − A)·Y0; household, government and investment components come from the
// behavioural rules evaluated at baseline, and exports are the residual (asserted positive in tests).
import { BASE_BUDGET, BASE_TAX, BASELINE, LEGACY_BASELINE, LEGACY_BUDGET, NATIONAL_GDP, BUDGET_PURCHASES, INVESTMENT_GOODS, IO, SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { BudgetCategory, SectorId, GameState } from '../types/game';

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
export const CAPITAL_GROWTH0 = 0.035; // baseline desired net capital growth, per year
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

function calibrate(BASELINE = LEGACY_BASELINE, BASE_BUDGET = LEGACY_BUDGET, scale = 1): Calibration {
  const BASE_LEND_RATE = BASELINE.opr + 0.02;
  const vaAnnual = (j: SectorId) => SECTORS[j].vaAnnual * scale;
  const n = SECTOR_IDS.length;
  const v = zero(), Y0 = zero(), L0 = zero(), wage0 = zero(), K0 = zero(), cap0 = zero(), capitalPerCap = zero(), laborProd0 = zero();
  for (const j of SECTOR_IDS) {
    const colSum = SECTOR_IDS.reduce((s, i) => s + IO[i][j], 0);
    v[j] = 1 - colSum - SECTORS[j].importShare;
    Y0[j] = vaAnnual(j) / 365 / v[j];
    K0[j] = SECTORS[j].capitalToVa * vaAnnual(j);
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
    let spend = consumption * SECTORS[j].consumption + credit * (CREDIT_SPEND[j] ?? 0);
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
  const Itot = (Ktot * (BASELINE.depreciation + CAPITAL_GROWTH0)) / 365;
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
const c1 = calibrate(BASELINE, BASE_BUDGET, 1).gdpDaily * 365;
const c2 = calibrate(BASELINE, BASE_BUDGET, 2).gdpDaily * 365;
export const NATIONAL_SCALE = 1 + (NATIONAL_GDP - c1) / (c2 - c1);
export const CAL: Calibration = calibrate(BASELINE, BASE_BUDGET, NATIONAL_SCALE);
export const calibrationFor = (s: Pick<GameState, 'baseline'>): Calibration => s.baseline.profile === 'legacy-kl' ? LEGACY_CAL : CAL;
export const SECTOR_INDEX: Record<SectorId, number> = Object.fromEntries(SECTOR_IDS.map((s, i) => [s, i])) as Record<SectorId, number>;
