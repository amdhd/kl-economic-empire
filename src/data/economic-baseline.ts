// Seven fictional sector weights and behavioral assumptions. Legacy KL constants are preserved;
// new campaigns use dated Malaysia opening observations below. Units: MYR, annual unless noted.
import type { BudgetCategory, BudgetPolicy, SectorId, TaxPolicy } from '../types/game';
import { FUEL_SUBSIDY0 } from './world';

export const SECTOR_IDS: SectorId[] = ['fin', 'prop', 'util', 'tech', 'cons', 'health', 'ind'];

export interface SectorMeta {
  name: string;
  short: string;
  color: string;
  vaAnnual: number; // base value added, MYR/yr
  laborShare: number; // wages / value added
  importShare: number; // imported inputs per unit gross output (m_j)
  energyImportShare: number; // share of imported inputs that is fuel/energy
  capitalToVa: number; // K / VA
  consumption: number; // share of household consumption basket
  /** Weights of the external demand index for this sector's exports. */
  exportMix: Partial<Record<'my' | 'global' | 'tourism' | 'tech', number>>;
}

export const SECTORS: Record<SectorId, SectorMeta> = {
  fin: { name: 'Banking & finance', short: 'Finance', color: '#60a5fa', vaAnnual: 60e9, laborShare: 0.42, importShare: 0.05, energyImportShare: 0.05, capitalToVa: 2.0, consumption: 0.1, exportMix: { my: 0.6, global: 0.4 } },
  prop: { name: 'Property & construction', short: 'Property', color: '#f59e0b', vaAnnual: 45e9, laborShare: 0.45, importShare: 0.08, energyImportShare: 0.1, capitalToVa: 3.0, consumption: 0.14, exportMix: { my: 1 } },
  util: { name: 'Utilities & energy', short: 'Utilities', color: '#f43f5e', vaAnnual: 15e9, laborShare: 0.25, importShare: 0.3, energyImportShare: 0.8, capitalToVa: 5.0, consumption: 0.07, exportMix: { my: 1 } },
  tech: { name: 'Telecom & technology', short: 'Tech', color: '#a78bfa', vaAnnual: 36e9, laborShare: 0.45, importShare: 0.15, energyImportShare: 0.05, capitalToVa: 2.5, consumption: 0.09, exportMix: { my: 0.5, tech: 0.5 } },
  cons: { name: 'Consumer, retail & tourism', short: 'Consumer', color: '#34d399', vaAnnual: 66e9, laborShare: 0.5, importShare: 0.15, energyImportShare: 0.1, capitalToVa: 1.8, consumption: 0.46, exportMix: { my: 0.5, tourism: 0.5 } },
  health: { name: 'Healthcare & public services', short: 'Health', color: '#22d3ee', vaAnnual: 42e9, laborShare: 0.6, importShare: 0.08, energyImportShare: 0.1, capitalToVa: 2.2, consumption: 0.07, exportMix: { my: 0.7, tourism: 0.3 } },
  ind: { name: 'Industrial & materials', short: 'Industry', color: '#94a3b8', vaAnnual: 36e9, laborShare: 0.4, importShare: 0.25, energyImportShare: 0.3, capitalToVa: 3.0, consumption: 0.07, exportMix: { global: 0.6, my: 0.4 } },
};

/** A[i][j]: input purchased from sector i per MYR of gross output of sector j (columns sum < 1 − m_j). */
export const IO: Record<SectorId, Record<SectorId, number>> = {
  //        buyer→  fin    prop   util   tech   cons   health ind
  fin: /*   */ { fin: 0.08, prop: 0.05, util: 0.03, tech: 0.04, cons: 0.04, health: 0.03, ind: 0.04 },
  prop: /*  */ { fin: 0.05, prop: 0.1, util: 0.02, tech: 0.04, cons: 0.05, health: 0.04, ind: 0.03 },
  util: /*  */ { fin: 0.01, prop: 0.02, util: 0.1, tech: 0.02, cons: 0.03, health: 0.03, ind: 0.06 },
  tech: /*  */ { fin: 0.06, prop: 0.02, util: 0.02, tech: 0.12, cons: 0.03, health: 0.03, ind: 0.02 },
  cons: /*  */ { fin: 0.02, prop: 0.02, util: 0.01, tech: 0.02, cons: 0.08, health: 0.04, ind: 0.02 },
  health: /**/ { fin: 0.0, prop: 0.0, util: 0.0, tech: 0.0, cons: 0.0, health: 0.05, ind: 0.0 },
  ind: /*   */ { fin: 0.01, prop: 0.18, util: 0.05, tech: 0.04, cons: 0.1, health: 0.06, ind: 0.2 },
};

/** Where each MYR of private/public investment spending lands. */
export const INVESTMENT_GOODS: Partial<Record<SectorId, number>> = { prop: 0.4, ind: 0.38, tech: 0.22 };

/** Where each MYR of each budget line is purchased (transfers go to households, not sectors). */
export const BUDGET_PURCHASES: Record<Exclude<BudgetCategory, 'transfers'>, Partial<Record<SectorId, number>>> = {
  health: { health: 0.85, ind: 0.1, tech: 0.05 },
  services: { health: 0.6, prop: 0.2, tech: 0.2 },
  safety: { health: 0.7, ind: 0.2, tech: 0.1 },
  development: { tech: 0.4, fin: 0.3, prop: 0.3 },
  admin: { fin: 0.4, tech: 0.3, health: 0.3 },
};

export const BASE_TAX: TaxPolicy = { corporate: 0.18, property: 0.04, consumption: 0.04, household: 0.02 };

export const LEGACY_BUDGET: BudgetPolicy = {
  health: 900e6,
  services: 700e6,
  safety: 350e6,
  development: 250e6,
  admin: 300e6,
  transfers: 500e6,
};

export const BUDGET_LABELS: Record<BudgetCategory, string> = {
  health: 'Healthcare',
  services: 'Public services',
  safety: 'Safety',
  development: 'Economic development',
  admin: 'Administration',
  transfers: 'Household transfers',
};

export const TAX_LABELS: Record<keyof TaxPolicy, { label: string; min: number; max: number; hint: string }> = {
  corporate: { label: 'Corporate tax on domestic profits', min: 0, max: 0.35, hint: 'Applies only to domestic taxable profit. Raises receipts; dampens investment.' },
  property: { label: 'Commercial property levy', min: 0, max: 0.1, hint: 'On commercial rental value. Partly passed through to rents.' },
  consumption: { label: 'Consumption & visitor levy', min: 0, max: 0.12, hint: 'Regressive; cuts real spending and tourism demand.' },
  household: { label: 'Household income surcharge', min: 0, max: 0.08, hint: 'Progressive; lower-income wages exempt. Hits disposable income.' },
};

export const LEGACY_BASELINE = {
  population: 2.1e6, // residents
  laborForce: 1.75e6, // KL workforce incl. commuters
  unemployment: 0.036,
  householdLoans: 150e9,
  firmLoans: 200e9,
  bankCapitalRatio: 0.13,
  bankReserves: 40e9,
  householdSavings: 120e9,
  treasury: 7e9,
  debt: 60e9,
  debtRate: 0.04,
  federalGrantMonthly: 1.0e9,
  publicAssets: 45e9,
  fundMYR: 15e9,
  fundUSD: 2.5e9,
  opr: 0.03,
  fedRate: 0.04,
  mgs10: 0.038,
  ust10: 0.042,
  myrPerUsd: 4.4,
  depreciation: 0.05, // per year
  trendProductivity: 0.015, // per year
  naturalUnemployment: 0.035,
  inflationTarget: 0.02,
  approval: 62,
  serviceQuality: 0.62,
  transferShareToHouseholdsOfProfit: 0.35,
};

export const CPI_WEIGHTS: Record<SectorId, number> = Object.fromEntries(
  SECTOR_IDS.map((s) => [s, SECTORS[s].consumption]),
) as Record<SectorId, number>;

/** Official observations are dated in national-baseline.ts; all unspecified stocks remain model assumptions.
 * Schema-5 national campaigns (model 1) keep this split unchanged. */
export const BASE_BUDGET_V1: BudgetPolicy = {
  health: 40_954_794_000 / 12,
  services: (63_473_399_800 + 15_129_293_500) / 12,
  safety: (14_523_000_000 + 18_019_701_600) / 12,
  development: (1_146_184_500 + 1_673_604_200) / 12,
  transfers: 44_000_000_000 / 12,
  admin: (376_840_000_000 - 61_013_000_000 - 40_954_794_000 - 63_473_399_800 - 15_129_293_500 - 14_523_000_000 - 18_019_701_600 - 1_146_184_500 - 1_673_604_200 - 44_000_000_000) / 12,
};
/** Model 2: the RON95 subsidy is modelled explicitly, so its opening bill leaves the administration residual;
 * total operating spending still equals the official 2027 estimate. */
export const BASE_BUDGET: BudgetPolicy = { ...BASE_BUDGET_V1, admin: BASE_BUDGET_V1.admin - FUEL_SUBSIDY0 / 12 };
export const NATIONAL_GDP = 2_025_379_140_000;
const scale = NATIONAL_GDP / 303.6e9;
export const BASELINE = {
  ...LEGACY_BASELINE,
  population: 34.2e6, laborForce: 17.49e6, unemployment: 0.03,
  householdLoans: LEGACY_BASELINE.householdLoans * scale,
  firmLoans: LEGACY_BASELINE.firmLoans * scale,
  householdSavings: LEGACY_BASELINE.householdSavings * scale,
  bankReserves: LEGACY_BASELINE.bankReserves * scale,
  treasury: 8_865_574_579, debt: 1_378_895_000_000,
  debtRate: 61_013_000_000 / 1_378_895_000_000,
  federalGrantMonthly: (72_548_410_000 + 10_598_980_000) / 12,
  opr: 0.0275,
  // Reserve valuation ratio, NOT a spot FX quote.
  myrPerUsd: 538_759_540_269 / 132.1e9,
};
export const baselineFor = (s: { baseline: { profile: 'malaysia' | 'legacy-kl' } }) => s.baseline.profile === 'legacy-kl' ? LEGACY_BASELINE : BASELINE;
export const budgetFor = (s: { baseline: { profile: 'malaysia' | 'legacy-kl'; model?: 1 | 2 } }) =>
  s.baseline.profile === 'legacy-kl' ? LEGACY_BUDGET : s.baseline.model === 1 ? BASE_BUDGET_V1 : BASE_BUDGET;
/** Model-2 national campaigns carry the resource sector, development budget, SOEs, commodities and partners. */
export const nationalV2 = (s: { baseline: { profile: 'malaysia' | 'legacy-kl'; model?: 1 | 2 } }) => s.baseline.profile === 'malaysia' && s.baseline.model !== 1;
