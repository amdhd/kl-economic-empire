// Commodities, trading partners, state enterprises and the resource sector (Malaysia campaigns only).
// Provenance: figures marked OFFICIAL come from Budget 2027 documents pinned in docs/data-sources.md.
// Everything marked APPROX is a rounded public-scale reference recalled for calibration and must be
// re-verified before being cited; everything marked ASSUMPTION is a model choice. All simulated
// paths after the opening day are fictional.
import type { CommodityId, PartnerId, TickerId } from '../types/game';

export const COMMODITY_IDS: CommodityId[] = ['oil', 'gas', 'coal', 'palm', 'rubber', 'rice', 'wheat', 'steel', 'aluminium', 'copper'];
export const COMMODITY_GROUPS: { id: 'energy' | 'agri' | 'metals'; label: string; items: CommodityId[] }[] = [
  { id: 'energy', label: 'Energy', items: ['oil', 'gas', 'coal'] },
  { id: 'agri', label: 'Agriculture', items: ['palm', 'rubber', 'rice', 'wheat'] },
  { id: 'metals', label: 'Metals', items: ['steel', 'aluminium', 'copper'] },
];

export interface CommodityMeta {
  name: string;
  unit: string;
  /** Reference price at index 1 (APPROX, rounded); the index is what the model uses. */
  reference: number;
  currency: 'USD' | 'MYR';
  /** Daily AR(1) shock size and persistence (ASSUMPTION). Oil reuses the external oil cycle. */
  sd: number;
  persist: number;
  color: string;
}

export const COMMODITIES: Record<CommodityId, CommodityMeta> = {
  oil: { name: 'Crude oil (Brent)', unit: 'bbl', reference: 75, currency: 'USD', sd: 0, persist: 0, color: '#f59e0b' },
  gas: { name: 'LNG (Asia spot)', unit: 'MMBtu', reference: 12, currency: 'USD', sd: 0.01, persist: 0.99, color: '#38bdf8' },
  coal: { name: 'Thermal coal', unit: 'tonne', reference: 120, currency: 'USD', sd: 0.011, persist: 0.995, color: '#a8a29e' },
  palm: { name: 'Crude palm oil', unit: 'tonne', reference: 4000, currency: 'MYR', sd: 0.011, persist: 0.995, color: '#84cc16' },
  rubber: { name: 'Natural rubber (SMR 20)', unit: 'tonne', reference: 1700, currency: 'USD', sd: 0.01, persist: 0.995, color: '#4ade80' },
  rice: { name: 'Rice (Thai 5%)', unit: 'tonne', reference: 420, currency: 'USD', sd: 0.008, persist: 0.996, color: '#fde68a' },
  wheat: { name: 'Wheat', unit: 'tonne', reference: 230, currency: 'USD', sd: 0.011, persist: 0.995, color: '#eab308' },
  steel: { name: 'Steel (hot-rolled coil)', unit: 'tonne', reference: 520, currency: 'USD', sd: 0.009, persist: 0.995, color: '#94a3b8' },
  aluminium: { name: 'Aluminium', unit: 'tonne', reference: 2500, currency: 'USD', sd: 0.009, persist: 0.995, color: '#cbd5e1' },
  copper: { name: 'Copper', unit: 'tonne', reference: 9500, currency: 'USD', sd: 0.01, persist: 0.995, color: '#fb923c' },
};

/** Seeded supply/demand episodes (ASSUMPTION): weekly hazard, log price shock, optional volume hit. */
export const COMMODITY_EPISODES: { id: string; commodity: Exclude<CommodityId, 'oil'>; title: string; hazard: number; shock: number; volume?: number; minDays: number; maxDays: number }[] = [
  { id: 'grain_disruption', commodity: 'wheat', title: 'Black Sea grain shipments disrupted', hazard: 0.006, shock: 0.25, minDays: 45, maxDays: 120 },
  { id: 'bumper_harvest', commodity: 'wheat', title: 'Bumper global wheat harvest', hazard: 0.006, shock: -0.15, minDays: 60, maxDays: 150 },
  { id: 'el_nino_palm', commodity: 'palm', title: 'El Niño drought cuts palm yields', hazard: 0.006, shock: 0.2, volume: -0.08, minDays: 60, maxDays: 150 },
  { id: 'biodiesel_mandate', commodity: 'palm', title: 'Indonesia raises biodiesel mandate', hazard: 0.005, shock: 0.12, minDays: 60, maxDays: 160 },
  { id: 'steel_dumping', commodity: 'steel', title: 'Wave of low-priced steel exports floods Asia', hazard: 0.007, shock: -0.18, minDays: 60, maxDays: 160 },
  { id: 'steel_stimulus', commodity: 'steel', title: 'Infrastructure stimulus lifts steel demand', hazard: 0.005, shock: 0.15, minDays: 45, maxDays: 120 },
  { id: 'rice_export_ban', commodity: 'rice', title: 'A major exporter restricts rice exports', hazard: 0.005, shock: 0.3, minDays: 60, maxDays: 150 },
  { id: 'lng_squeeze', commodity: 'gas', title: 'Cold northern winter tightens LNG markets', hazard: 0.006, shock: 0.25, minDays: 45, maxDays: 110 },
  { id: 'coal_demand', commodity: 'coal', title: 'Power shortages lift Asian coal imports', hazard: 0.005, shock: 0.2, minDays: 45, maxDays: 120 },
  { id: 'copper_mine', commodity: 'copper', title: 'Major copper mine disrupted', hazard: 0.005, shock: 0.15, minDays: 60, maxDays: 160 },
  { id: 'smelter_cuts', commodity: 'aluminium', title: 'Smelter power curbs cut aluminium supply', hazard: 0.005, shock: 0.12, minDays: 45, maxDays: 120 },
  { id: 'rubber_disease', commodity: 'rubber', title: 'Leaf disease cuts rubber output', hazard: 0.004, shock: 0.15, volume: -0.06, minDays: 60, maxDays: 150 },
];

// ------------------------------------------------------------------ trading partners
export interface PartnerMeta {
  name: string;
  /** Shares of Malaysia's goods exports / imports (APPROX, rounded 2024 orders of magnitude). */
  exportShare: number;
  importShare: number;
  /** Partner demand follows the US cycle (else the global cycle). */
  usCycle: boolean;
  /** Fraction of a Malaysian tariff surcharge the partner mirrors on Malaysian exports (ASSUMPTION). */
  retaliation: number;
  flag: string;
}

export const PARTNER_IDS: PartnerId[] = ['SG', 'CN', 'US', 'EU', 'JP', 'ASEAN', 'IN', 'ROW'];
export const PARTNERS: Record<PartnerId, PartnerMeta> = {
  SG: { name: 'Singapore', exportShare: 0.145, importShare: 0.1, usCycle: false, retaliation: 0.3, flag: 'SG' },
  CN: { name: 'China', exportShare: 0.12, importShare: 0.21, usCycle: false, retaliation: 1.0, flag: 'CN' },
  US: { name: 'United States', exportShare: 0.13, importShare: 0.08, usCycle: true, retaliation: 1.0, flag: 'US' },
  EU: { name: 'European Union', exportShare: 0.085, importShare: 0.075, usCycle: false, retaliation: 0.8, flag: 'EU' },
  JP: { name: 'Japan', exportShare: 0.06, importShare: 0.06, usCycle: false, retaliation: 0.5, flag: 'JP' },
  ASEAN: { name: 'Other ASEAN', exportShare: 0.16, importShare: 0.14, usCycle: false, retaliation: 0.6, flag: 'ASEAN' },
  IN: { name: 'India', exportShare: 0.035, importShare: 0.025, usCycle: false, retaliation: 0.8, flag: 'IN' },
  ROW: { name: 'Rest of world', exportShare: 0.265, importShare: 0.31, usCycle: false, retaliation: 0.5, flag: 'ROW' },
};
/** Export demand elasticity to a partner's tariff, and import substitution elasticity across partners (ASSUMPTION). */
export const EXPORT_TARIFF_ELASTICITY = 2.5;
export const IMPORT_SUBSTITUTION = 4;
export const RETALIATION_LAG_DAYS = 60;
export const AGREEMENT_DAYS = 180;
export const AGREEMENT_ACCESS = 0.05; // export access gain per agreement tier
export const AGREEMENT_IMPORT_SAVING = 0.02; // import cost saving per tier with that partner

// ------------------------------------------------------------------ resource sector (Malaysia)
/** Upstream oil & gas production value at index 1, MYR/yr (APPROX: mining ≈ 5–6% of GDP). */
export const UPSTREAM_VALUE0 = 148e9;
export const UPSTREAM_VA_SHARE = 0.75;
/** Fixed upstream costs as a share of opening value added (ASSUMPTION: operating leverage). */
export const UPSTREAM_FIXED_SHARE = 0.35;
export const PITA_RATE = 0.38; // Petroleum income tax rate (statutory)
/** Palm oil production value at index 1, MYR/yr (APPROX: ~19m t × ~RM4,000/t). */
export const PALM_VALUE0 = 80e9;
export const PALM_VA_SHARE = 0.6;
export const PALM_WAGE_SHARE = 0.3; // of palm value added
export const PALM_FIXED_SHARE = 0.3; // fixed costs as a share of opening gross profit (ASSUMPTION)
export const PALM_SMALLHOLDER_SHARE = 0.4; // of plantation profit accruing to households (APPROX planted-area share)
/** Dutiable crude palm oil exports as a share of palm production value (ASSUMPTION), and the opening
 * duty rate chosen so opening receipts ≈ the OFFICIAL 2027 export duty estimate of RM1.914bn. */
export const PALM_DUTIABLE_SHARE = 0.28;
export const PALM_DUTY0 = 1_914_000_000 / (PALM_DUTIABLE_SHARE * PALM_VALUE0);
/** Natural rubber: ~350kt a year, ~93% from smallholders (APPROX). */
export const RUBBER_VALUE0 = 2.5e9;
export const RUBBER_VA_SHARE = 0.7;
export const RUBBER_SMALLHOLDER_SHARE = 0.9;
export const RESOURCE_VA0 = UPSTREAM_VALUE0 * UPSTREAM_VA_SHARE + PALM_VALUE0 * PALM_VA_SHARE + RUBBER_VALUE0 * RUBBER_VA_SHARE;
export const RESOURCE_EXPORT_SHARE = { oil: 0.6, palm: 0.8, rubber: 0.5 };

// ------------------------------------------------------------------ fuel & food subsidies
/** RON95 retail ceiling (RM/litre) and unsubsidised reference price at oil index 1 (APPROX). */
export const FUEL_CEILING0 = 1.99;
export const FUEL_MARKET0 = 2.6;
/** Share of the pump price that moves with crude (ASSUMPTION; the rest is taxes, margins, logistics). */
export const FUEL_CRUDE_SHARE = 0.55;
export const FUEL_VOLUME = 17e9; // litres/yr of RON95 (APPROX)
export const FUEL_ELIGIBLE0 = 0.85; // citizens-only targeting (APPROX)
/** Subsidised fuel leaks to non-targets (smuggling, non-residents) under blanket schemes (ASSUMPTION). */
export const FUEL_LEAKAGE = 0.12;
export const FUEL_CPI_WEIGHT = 0.055; // household fuel weight in the CPI (APPROX)
const effectivePrice = (market: number, ceiling: number, eligible: number) => eligible * Math.min(market, ceiling) + (1 - eligible) * market;
export const fuelEffectivePrice = effectivePrice;
export const FUEL_EFFECTIVE0 = effectivePrice(FUEL_MARKET0, FUEL_CEILING0, FUEL_ELIGIBLE0);
export const fuelSubsidyAnnual = (market: number, ceiling: number, eligible: number) =>
  FUEL_VOLUME * eligible * Math.max(0, market - ceiling) * (1 + FUEL_LEAKAGE * Math.max(0, eligible - FUEL_ELIGIBLE0) / (1 - FUEL_ELIGIBLE0));
/** Opening RON95 subsidy bill, carved out of the official operating budget's residual. */
export const FUEL_SUBSIDY0 = fuelSubsidyAnnual(FUEL_MARKET0, FUEL_CEILING0, FUEL_ELIGIBLE0);

/** Commodity shares of each sector's imported inputs (ASSUMPTION). Energy keeps its own share. */
export const COMMODITY_IMPORT: Partial<Record<'fin' | 'prop' | 'util' | 'tech' | 'cons' | 'health' | 'ind', Partial<Record<CommodityId, number>>>> = {
  cons: { wheat: 0.12, rice: 0.06 },
  prop: { steel: 0.3, aluminium: 0.03, copper: 0.03 },
  ind: { steel: 0.2, aluminium: 0.05, copper: 0.05 },
  tech: { copper: 0.05 },
};
/** Commodities whose import-price rises the food subsidy covers. */
export const FOOD_COMMODITIES = ['wheat', 'rice'] as const;
/** Power generation fuel mix felt by utilities (ASSUMPTION; regulated gas and ICPT pass-through damp it). */
export const UTILITY_FUEL_PASSTHROUGH = { oil: 0.15, gas: 0.25, coal: 0.25 };

// ------------------------------------------------------------------ development expenditure
/** OFFICIAL: net federal development expenditure 2027, RM81.5bn (Fiscal Outlook 2027 federal finance table:
 * gross RM83.0bn less RM1.5bn loan recoveries). The expenditure book's RM85bn line adds a RM2bn contingency reserve. */
export const DEVELOPMENT_ANNUAL0 = 81_500_000_000;
/** Close to the private capital-goods mix (structures, equipment, ICT), plus social programmes (ASSUMPTION). */
export const DEVELOPMENT_PURCHASES = { prop: 0.4, ind: 0.3, tech: 0.18, health: 0.12 };
/** Public capital depreciation and output elasticity (ASSUMPTION; the literature centres near 0.05–0.08). */
export const PUBLIC_CAPITAL_DEPRECIATION = 0.04;
export const PUBLIC_CAPITAL_ELASTICITY = 0.05;

// ------------------------------------------------------------------ state-owned enterprises
/** PETRONAS (wholly state-owned). Opening scale APPROX; all simulated results fictional. */
export const PETRONAS = {
  dividend0: 32e9, // APPROX annual dividend to the government in recent years
  capex0: 50e9, // APPROX annual capital expenditure
  cash0: 150e9, // ASSUMPTION opening cash
  debt0: 60e9, // ASSUMPTION opening borrowings
  depreciation: 30e9, // ASSUMPTION annual non-cash charge added back to cash flow
  downstreamProfit0: 12e9, // ASSUMPTION after-tax downstream/other profit excluding listed subsidiaries
  declineRate: 0.06, // natural decline offset by capex at capex0 (ASSUMPTION)
  cashFloor: 30e9, // below this, PETRONAS cuts capex
  domesticCapexShare: 0.4, // of capex spent on Malaysian goods and services (ASSUMPTION)
  /** APPROX controlling stakes in listed subsidiaries. */
  stakes: { 'MY:5183': 0.64, 'MY:6033': 0.51 } as Partial<Record<TickerId, number>>,
};
/** Khazanah Nasional (government investment holding). Stakes APPROX, rounded; verify before citing. */
export const KHAZANAH = {
  cash0: 10e9, // ASSUMPTION
  payout0: 0.6, // share of dividend income paid to the government (ASSUMPTION)
  stakes: { 'MY:6888': 0.36, 'MY:5225': 0.26, 'MY:4863': 0.2, 'MY:1023': 0.23 } as Partial<Record<TickerId, number>>,
  blockDiscount: 0.03,
};

/** Household-held listed equity driving the wealth effect (ASSUMPTION), and the annual MPC out of wealth. */
export const HOUSEHOLD_EQUITY0 = 450e9;
export const WEALTH_MPC = 0.03;

/** KL's share of national output (APPROX ~15%): scales the national effect of KL city projects. */
export const KL_ECONOMY_SHARE = 0.15;

/** Fiscal rule defaults modelled on the Public Finance and Fiscal Responsibility Act 2023 targets. */
export const FISCAL_RULE0 = { deficitCap: 0.03, debtCap: 0.6, goldenRule: true };
export const REVENUE_SEMI_ELASTICITY = 0.2; // cyclical balance per unit output gap (ASSUMPTION)
