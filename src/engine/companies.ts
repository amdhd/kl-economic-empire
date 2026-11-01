import { sectorTax } from './policy-controls';
import { boomOn } from '../data/boom';
import { calibrationFor, exportReach } from './calibration';
import { baselineFor, nationalV2 } from '../data/economic-baseline';
// Featured listed companies (40). Their KL revenue is a *share of* the sector aggregates, so they
// are a sample inside the economy, not an addition to it: government taxes are computed on sector
// aggregates and company-level KL tax is informational. See docs/decisions.md D-006.
import { COMPANIES, COMPANY_BY_ID } from '../data/companies';
import type { CommodityId, CompanySeed, CompanyState, GameState, MonthlyFinancials, TickerId } from '../types/game';
import { companyEventTargets } from './events';
import { news } from './util';

export const OTHER_TAX = { MY: 0.24, US: 0.21 };
const FIXED_COST_SHARE = 0.35;
/** Stored geographic weights retain their meaning; the tax jurisdiction follows campaign scope. */
export const domesticExposure = (c: CompanySeed, profile: GameState['baseline']['profile']) => c.exposure.kl + (profile === 'malaysia' ? c.exposure.my : 0);

/** Baseline monthly figures (used to seed 12 months of history). */
export function baselineMonth(c: CompanySeed, monthKey: number, klTax: number, profile: GameState['baseline']['profile'] = 'legacy-kl'): MonthlyFinancials {
  const revenue = c.revenue / 12;
  const ebitda = revenue * c.ebitdaMargin;
  const ebit = ebitda - revenue * c.depreciationPct;
  const interest = (c.debt * (c.exchange === 'MY' ? 0.045 : 0.05)) / 12 - (c.cash * (c.exchange === 'MY' ? 0.02 : 0.035)) / 12;
  const pbt = ebit - interest;
  const taxKL = Math.max(0, pbt * domesticExposure(c, profile)) * klTax;
  const taxOther = Math.max(0, pbt * (1 - domesticExposure(c, profile))) * OTHER_TAX[c.exchange];
  const netIncome = pbt - taxKL - taxOther;
  return { monthKey, revenue, ebitda, ebit, interest, pbt, taxKL, taxOther, netIncome, dividends: Math.max(0, netIncome) * c.payout };
}

export function initialCompany(c: CompanySeed, startMonthKey: number, klTax: number, profile: GameState['baseline']['profile'] = 'legacy-kl'): CompanyState {
  const history: MonthlyFinancials[] = [];
  for (let k = 12; k >= 1; k--) history.push(baselineMonth(c, startMonthKey - k, klTax, profile));
  return {
    id: c.id,
    mtd: { revenue: 0, laborCost: 0, energyCost: 0, otherCost: 0, depreciation: 0, interest: 0 },
    history,
    cash: c.cash,
    debt: c.debt,
    retained: history.reduce((total, h) => total + h.netIncome - h.dividends, 0),
    shares: c.shares,
    revenueShock: 1,
    sentiment: 0,
    lastDps: 0,
  };
}

/** Real demand indices that drive a company's revenue, by geography. */
export function demandIndices(s: GameState, c: CompanySeed) {
  const CAL = calibrationFor(s);
  const sec = s.sectors[c.sector];
  const kl = (sec.output / CAL.Y0[c.sector]) * sec.price; // nominal KL sector activity index
  const my = s.baseline.profile === 'malaysia' ? kl : s.external.myDemand * (s.indicators.cpi / 100); // KL CPI as a proxy for national prices
  const gl = s.external.drivers[c.driver] * s.external.usPrice; // USD nominal
  return { kl, my, gl };
}

/** Daily revenue & cost accrual (listing currency). */
export function dailyCompanies(s: GameState, day = s.scheduler.lastDay): void {
  const BASELINE = baselineFor(s);
  const CAL = calibrationFor(s);
  const fxf = s.external.myrPerUsd / BASELINE.myrPerUsd;
  const targets = companyEventTargets(s, day);
  const v2 = nationalV2(s);
  for (const c of COMPANIES) {
    const st = s.companies[c.id];
    const t = targets.get(c.id) ?? { revenue: 1, sentiment: 0 };
    st.revenueShock += 0.06 * (t.revenue - st.revenueShock);
    st.sentiment += 0.05 * (t.sentiment - st.sentiment);
    const { kl, my, gl } = demandIndices(s, c);
    const e = c.exposure;
    // Model 2: Malaysian exporters' foreign sales depend on access to trading partners.
    const access = v2 && c.exchange === 'MY' ? s.world.exportAccess : 1;
    // Boom mode (D-110): Malaysian firms' foreign sales grow with their sector's capacity, as the core exports do (reach is 1 otherwise).
    const reach = c.exchange === 'MY' ? exportReach(s, c.sector) : 1;
    const mix = c.exchange === 'MY' ? e.kl * kl + e.my * my + e.global * gl * fxf * access * reach : (e.kl * kl + e.my * my) / fxf + e.global * gl;
    const realVol = (e.kl * (s.sectors[c.sector].output / CAL.Y0[c.sector]) + e.my * (s.baseline.profile === 'malaysia' ? s.sectors[c.sector].output / CAL.Y0[c.sector] : s.external.myDemand) + e.global * s.external.drivers[c.driver] * reach) * st.revenueShock;
    // Producers' realised prices follow world commodity indices (e.g. aluminium for a smelter), model 2.
    let priceMix = 1;
    if (v2 && c.commodityRevenue) for (const [k, share] of Object.entries(c.commodityRevenue) as [CommodityId, number][]) priceMix += share * (s.world.prices[k] - 1);
    const revenue = (c.revenue / 365) * mix * st.revenueShock * priceMix;
    const opex0 = (c.revenue * (1 - c.ebitdaMargin)) / 365;
    const scale = FIXED_COST_SHARE + (1 - FIXED_COST_SHARE) * realVol;
    // Boom mode (D-110): wages rise with productivity, so a firm's labour cost per unit is wages ÷ its sector's productivity.
    const labIdx = c.exchange === 'MY' ? s.households.wageIndex / (boomOn(s) ? s.sectors[c.sector].productivity : 1) : s.external.usPrice;
    const enIdx = c.exchange === 'MY' ? s.external.oil * fxf : s.external.oil;
    const othIdx = c.exchange === 'MY' ? s.indicators.cpi / 100 : s.external.usPrice;
    const os = 1 - c.laborShare - c.energyShare;
    // Commodity inputs (model 2) are part of "other" costs but priced off world indices, in listing currency.
    let commodityShare = 0;
    let commodityCost = 0;
    if (v2 && c.commodityCost) for (const [k, share] of Object.entries(c.commodityCost) as [CommodityId, number][]) {
      commodityShare += share;
      commodityCost += share * s.world.prices[k] * (c.exchange === 'MY' ? fxf : 1);
    }
    st.mtd.revenue += revenue;
    st.mtd.laborCost += opex0 * scale * c.laborShare * labIdx;
    st.mtd.energyCost += opex0 * scale * c.energyShare * enIdx;
    st.mtd.otherCost += opex0 * scale * ((os - commodityShare) * othIdx + commodityCost);
    st.mtd.depreciation += (c.revenue * c.depreciationPct) / 365;
    const rate = c.exchange === 'MY' ? s.bank.lendingRate - 0.005 : s.external.ust10 + 0.008;
    const cashRate = c.exchange === 'MY' ? s.bank.depositRate : s.external.fedRate - 0.005;
    st.mtd.interest += (st.debt * rate - st.cash * cashRate) / 365;
  }
}

export interface Dividend {
  id: TickerId;
  dps: number;
}

/** Month close: income statement, taxes, dividends (quarter-end), cash. Returns dividends declared. */
export function monthCloseCompanies(s: GameState, monthKey: number): Dividend[] {
  const profile = s.baseline.profile;
  const klTax = s.government.policies.tax.corporate;
  const quarterEnd = monthKey % 3 === 2;
  const out: Dividend[] = [];
  for (const c of COMPANIES) {
    const st = s.companies[c.id];
    if (st.history.at(-1)!.monthKey >= monthKey) continue;
    const m = st.mtd;
    const ebitda = m.revenue - m.laborCost - m.energyCost - m.otherCost;
    const ebit = ebitda - m.depreciation;
    const pbt = ebit - m.interest;
    const taxKL = Math.max(0, pbt * domesticExposure(c, profile)) * sectorTax(s,c.sector);
    const taxOther = Math.max(0, pbt * (1 - domesticExposure(c, profile))) * OTHER_TAX[c.exchange];
    const netIncome = pbt - taxKL - taxOther;
    // Simplified accrual→cash: depreciation ≈ maintenance capex, so cash moves by net income.
    st.cash += netIncome;
    let dividends = 0;
    if (quarterEnd) {
      const q = st.history.slice(-2).reduce((a, h) => a + h.netIncome, 0) + netIncome;
      dividends = Math.max(0, Math.min(q * c.payout, st.cash * 0.5, st.retained + netIncome));
      st.cash -= dividends;
      st.lastDps = dividends / st.shares;
      if (dividends > 0) out.push({ id: c.id, dps: st.lastDps });
    }
    st.retained += netIncome - dividends;
    if (st.cash < 0) {
      // Funding gap is covered by new debt — explicit liability, not free cash.
      st.debt += -st.cash;
      st.cash = 0;
    }
    st.history.push({ monthKey, revenue: m.revenue, ebitda, ebit, interest: m.interest, pbt, taxKL, taxOther, netIncome, dividends });
    if (st.history.length > 24) st.history.shift();
    st.mtd = { revenue: 0, laborCost: 0, energyCost: 0, otherCost: 0, depreciation: 0, interest: 0 };
    const base = baselineMonth(c, monthKey, klTax, profile).netIncome;
    const prevNi = st.history.at(-2)?.netIncome ?? base;
    if (base > 0 && netIncome < base * 0.6 && prevNi >= base * 0.6) news(s, { kind: 'market', tone: 'bad', title: `${c.displayName} profit slumps`, body: `Monthly net income ${(netIncome / base * 100).toFixed(0)}% of its normal level.` });
  }
  return out;
}

/** Trailing-12-month net income. */
export function ttmNetIncome(st: CompanyState): number {
  return st.history.slice(-12).reduce((a, h) => a + h.netIncome, 0);
}

export function baseEps(c: CompanySeed, klTax: number, profile: GameState['baseline']['profile'] = 'legacy-kl'): number {
  return (baselineMonth(c, 0, klTax, profile).netIncome * 12) / c.shares;
}

export { COMPANY_BY_ID };
