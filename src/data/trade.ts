// Official 2025 trade levels for the trade-ministry layer (schema 13, D-077). Goods: MITI/MATRADE "Malaysia's 2025 Trade
// Performance" (20 Jan 2026, provisional DOSM data, Tables 6, 7, 12, 13). Services: DOSM "Statistics of International
// Trade in Services 2025" (25 Jun 2026, Table 1). RM, calendar 2025. See docs/data-sources.md. Simulated paths start here;
// nothing after the opening is real data.
import type { PartnerId, SectorId } from '../types/game';

export type ExportProductId =
  | 'ee' | 'machinery' | 'petroleum' | 'palm' | 'chemicals' | 'metals' | 'lng' | 'mining' | 'food' | 'otherGoods'
  | 'travel' | 'business' | 'transport' | 'ict' | 'mfgServices' | 'otherServices';
export type ImportCategoryId = 'intermediate' | 'capital' | 'consumption' | 'otherGoods' | 'services';
/** What moves a product's export value in the simulation (all indices are 1 at the opening). */
export type TradeDriver = 'semis' | 'industrial' | 'oil' | 'palm' | 'industrialOil' | 'steel' | 'gas' | 'crude' | 'consumer' | 'global' | 'tourism' | 'tech';

export interface ExportProduct {
  label: string;
  short: string;
  group: 'goods' | 'services';
  /** 2025 exports, RM. */
  value2025: number;
  driver: TradeDriver;
  /** Core sector that supplies extra exports won by policy (deals, promotion, contracts). */
  sector: SectorId;
  /** Domestic value-added content of extra exports (the rest is imported inputs). ASSUMPTION, rounded. */
  domesticContent: number;
  /** Commodities sell at world prices: extra exports need extra supply, so policy can only re-route, not add volume. */
  commodity?: boolean;
  color: string;
  source: string;
}

const G = 'MITI 2025 Table 6';
const S = 'DOSM SITS 2025 Table 1';
export const EXPORT_PRODUCTS: Record<ExportProductId, ExportProduct> = {
  ee: { label: 'Electrical & electronic products', short: 'E&E', group: 'goods', value2025: 711_613.2e6, driver: 'semis', sector: 'tech', domesticContent: 0.35, color: '#60a5fa', source: G },
  machinery: { label: 'Machinery, optical & scientific equipment', short: 'Machinery', group: 'goods', value2025: (78_303.4 + 65_638.3) * 1e6, driver: 'industrial', sector: 'ind', domesticContent: 0.45, color: '#a78bfa', source: `${G} (two lines)` },
  petroleum: { label: 'Petroleum products', short: 'Petroleum', group: 'goods', value2025: 103_553.4e6, driver: 'oil', sector: 'ind', domesticContent: 0.3, color: '#f97316', source: G },
  palm: { label: 'Palm oil & palm-based products', short: 'Palm oil', group: 'goods', value2025: (84_221.8 + 40_640.2) * 1e6, driver: 'palm', sector: 'ind', domesticContent: 0.75, color: '#84cc16', source: `${G} (agriculture + manufactured)` },
  chemicals: { label: 'Chemicals & chemical products', short: 'Chemicals', group: 'goods', value2025: 65_203.6e6, driver: 'industrialOil', sector: 'ind', domesticContent: 0.5, color: '#f472b6', source: G },
  metals: { label: 'Steel & manufactures of metal', short: 'Steel & metal', group: 'goods', value2025: 63_159.0e6, driver: 'steel', sector: 'ind', domesticContent: 0.55, color: '#94a3b8', source: `${G} (manufactures of metal)` },
  lng: { label: 'Liquefied natural gas', short: 'LNG', group: 'goods', value2025: 51_633.9e6, driver: 'gas', sector: 'util', domesticContent: 0.8, commodity: true, color: '#22d3ee', source: G },
  mining: { label: 'Crude petroleum, condensates & ores', short: 'Crude & ores', group: 'goods', value2025: (92_280 - 51_633.9) * 1e6, driver: 'crude', sector: 'util', domesticContent: 0.8, commodity: true, color: '#b45309', source: 'MITI 2025 mining goods RM92.28bn less LNG' },
  food: { label: 'Processed food', short: 'Food', group: 'goods', value2025: 38_471.6e6, driver: 'consumer', sector: 'cons', domesticContent: 0.7, color: '#facc15', source: G },
  otherGoods: { label: 'Other goods (rubber products, wood, textiles, other)', short: 'Other goods', group: 'goods', value2025: 0, driver: 'global', sector: 'ind', domesticContent: 0.55, color: '#64748b', source: 'MITI 2025 total exports less the lines above' },
  travel: { label: 'Tourism & travel services', short: 'Tourism', group: 'services', value2025: 110_649.75e6, driver: 'tourism', sector: 'cons', domesticContent: 0.85, color: '#34d399', source: S },
  business: { label: 'Professional & business services', short: 'Business svcs', group: 'services', value2025: 49_625.307e6, driver: 'global', sector: 'fin', domesticContent: 0.85, color: '#2dd4bf', source: S },
  transport: { label: 'Transport & logistics services', short: 'Transport', group: 'services', value2025: 37_692.593e6, driver: 'global', sector: 'ind', domesticContent: 0.75, color: '#38bdf8', source: S },
  ict: { label: 'Digital, ICT & information services', short: 'Digital', group: 'services', value2025: 30_969.772e6, driver: 'tech', sector: 'tech', domesticContent: 0.85, color: '#818cf8', source: S },
  mfgServices: { label: 'Contract manufacturing & repair services', short: 'Mfg services', group: 'services', value2025: (22_643.597 + 9_823.25) * 1e6, driver: 'industrial', sector: 'ind', domesticContent: 0.7, color: '#c084fc', source: `${S} (items 1–2)` },
  otherServices: { label: 'Other services (finance, insurance, construction, IP, culture)', short: 'Other svcs', group: 'services', value2025: 0, driver: 'global', sector: 'fin', domesticContent: 0.85, color: '#475569', source: `${S} total less the lines above` },
};
export const GOODS_EXPORTS_2025 = 1_606_650.4e6;
export const SERVICES_EXPORTS_2025 = 277_912.164e6;
const sumGroup = (g: 'goods' | 'services') => Object.values(EXPORT_PRODUCTS).filter((p) => p.group === g).reduce((a, p) => a + p.value2025, 0);
EXPORT_PRODUCTS.otherGoods.value2025 = GOODS_EXPORTS_2025 - sumGroup('goods');
EXPORT_PRODUCTS.otherServices.value2025 = SERVICES_EXPORTS_2025 - sumGroup('services');
export const EXPORT_PRODUCT_IDS = Object.keys(EXPORT_PRODUCTS) as ExportProductId[];
export const GOODS_PRODUCT_IDS = EXPORT_PRODUCT_IDS.filter((id) => EXPORT_PRODUCTS[id].group === 'goods');

export const GOODS_IMPORTS_2025 = 1_454_847.1e6;
export const IMPORT_CATEGORIES: Record<ImportCategoryId, { label: string; value2025: number; color: string; source: string }> = {
  intermediate: { label: 'Intermediate goods (parts, materials, fuel)', value2025: 720_780e6, color: '#f59e0b', source: 'MITI 2025, imports by end use' },
  capital: { label: 'Capital goods (machinery, equipment)', value2025: 214_480e6, color: '#a78bfa', source: 'MITI 2025, imports by end use' },
  consumption: { label: 'Consumer goods', value2025: 120_150e6, color: '#34d399', source: 'MITI 2025, imports by end use' },
  otherGoods: { label: 'Other goods (re-export, dutiable, low value)', value2025: GOODS_IMPORTS_2025 - (720_780e6 + 214_480e6 + 120_150e6), color: '#64748b', source: 'MITI 2025 total imports less end-use lines' },
  services: { label: 'Services', value2025: 272_600e6, color: '#38bdf8', source: 'DOSM SITS 2025' },
};
export const IMPORT_CATEGORY_IDS = Object.keys(IMPORT_CATEGORIES) as ImportCategoryId[];

/** 2025 goods exports and imports by the game's partner groups, RM (MITI 2025 Tables 7 and 13, ASEAN and EU text).
 * India's imports are not in the release's top-ten table; they stay inside "Rest of world". */
export const PARTNER_TRADE_2025: Record<PartnerId, { exports: number; imports: number | null }> = {
  SG: { exports: 249_550.7e6, imports: 152_825.8e6 },
  US: { exports: 233_079.9e6, imports: 134_388.1e6 },
  CN: { exports: 188_875.1e6, imports: 353_026.7e6 },
  EU: { exports: 129_170e6, imports: 98_870e6 },
  JP: { exports: 76_376.1e6, imports: 66_589.2e6 },
  ASEAN: { exports: (457_620 - 249_550.7) * 1e6, imports: (319_990 - 152_825.8) * 1e6 },
  IN: { exports: 52_297.3e6, imports: null },
  ROW: { exports: 0, imports: 0 },
};
PARTNER_TRADE_2025.ROW.exports = GOODS_EXPORTS_2025 - Object.values(PARTNER_TRADE_2025).reduce((a, p) => a + p.exports, 0);
PARTNER_TRADE_2025.ROW.imports = GOODS_IMPORTS_2025 - Object.values(PARTNER_TRADE_2025).reduce((a, p) => a + (p.imports ?? 0), 0);
/** Implied 2025 nominal GDP: services trade RM550.5bn was 27.2% of GDP (DOSM SITS 2025). Scales 2025 levels to the opening. */
export const NOMINAL_GDP_2025 = 550.5e9 / 0.272;

// ------------------------------------------------------------------ policy instruments (ASSUMPTIONS, documented in D-077)
export type ProgrammeId = 'semiconductor' | 'digital' | 'halal' | 'tourism' | 'industrial' | 'missions' | 'credit';
export interface ProgrammeSpec {
  label: string;
  plain: string;
  /** Products lifted, with the most each can gain (share of its exports) at an unlimited budget. */
  products: Partial<Record<ExportProductId, number>>;
  /** Budget (RM/yr) that delivers 63% of the maximum gain: returns diminish beyond it. */
  scale: number;
  maxBudget: number;
}
export const PROGRAMMES: Record<ProgrammeId, ProgrammeSpec> = {
  semiconductor: { label: 'Semiconductor & E&E export push', plain: 'Design-win missions, test-and-packaging marketing and buyer matching abroad.', products: { ee: 0.05 }, scale: 2e9, maxBudget: 6e9 },
  digital: { label: 'Digital & business services drive', plain: 'Promotes Malaysian software, data, consulting and shared-service centres to foreign clients.', products: { ict: 0.15, business: 0.08 }, scale: 0.6e9, maxBudget: 3e9 },
  halal: { label: 'Halal food & palm diversification', plain: 'Halal certification abroad, food fairs and new palm-oil markets in Africa and Central Asia.', products: { food: 0.12, palm: 0.04 }, scale: 0.5e9, maxBudget: 2e9 },
  tourism: { label: 'Visit Malaysia campaign', plain: 'Overseas advertising, airline route support and events that bring visitors.', products: { travel: 0.1 }, scale: 1.2e9, maxBudget: 4e9 },
  industrial: { label: 'Machinery, steel & chemicals export desk', plain: 'Trade-show presence and buyer finance for machinery, steel and chemical makers.', products: { machinery: 0.06, metals: 0.08, chemicals: 0.05, mfgServices: 0.05 }, scale: 0.8e9, maxBudget: 3e9 },
  missions: { label: 'Trade missions to new markets', plain: 'Ministerial missions and trade offices in emerging markets for all goods exporters.', products: { otherGoods: 0.03, food: 0.02, metals: 0.02, machinery: 0.015 }, scale: 0.4e9, maxBudget: 1.5e9 },
  credit: { label: 'Export credit insurance', plain: 'Insures exporters against unpaid foreign invoices so smaller firms sell abroad. Pays off most in downturns.', products: { otherGoods: 0.03, food: 0.03, metals: 0.03, machinery: 0.02 }, scale: 0.3e9, maxBudget: 1.5e9 },
};
export const PROGRAMME_IDS = Object.keys(PROGRAMMES) as ProgrammeId[];
/** Promotion builds over months: the boost closes this share of the gap to its target each day (~5 months). */
export const PROGRAMME_SPEED = 1 / 150;

/** Market a partner can ask Malaysia to open in a product deal, and the domestic sector that loses sales to imports. */
export type ConcessionId = 'consumer' | 'industrial' | 'services' | 'procurement';
export const CONCESSIONS: Record<ConcessionId, { label: string; plain: string; sector: SectorId; imports: ImportCategoryId }> = {
  consumer: { label: 'Open consumer goods (cars, appliances, food)', plain: 'Shoppers buy more of their imports; local retailers and makers lose some sales.', sector: 'cons', imports: 'consumption' },
  industrial: { label: 'Open industrial goods (steel, machinery, chemicals)', plain: 'Cheaper imported inputs, but local industry loses some home sales.', sector: 'ind', imports: 'intermediate' },
  services: { label: 'Open banking, telecom & professional services', plain: 'Foreign firms compete for local clients; banks and telcos lose some business.', sector: 'fin', imports: 'services' },
  procurement: { label: 'Open government procurement', plain: 'Foreign firms can bid for public contracts; part of ministry purchases goes abroad.', sector: 'prop', imports: 'capital' },
};
export const CONCESSION_IDS = Object.keys(CONCESSIONS) as ConcessionId[];
/** Deal depth: 1 = tariff chapter, 2 = tariffs plus standards and non-tariff barriers. */
export const DEAL_ACCESS_GAIN = [0, 0.1, 0.2]; // extra exports of the product to that partner, share of that slice
export const DEAL_DISPLACEMENT = [0, 0.004, 0.009]; // home-market sales lost by the conceding sector, × partner import share × 10
export const DEAL_TALK_DAYS = [0, 30, 30]; // D-097: formal talks take one month
export const DEAL_RAMP_DAYS = 30;
