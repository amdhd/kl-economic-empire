import type { CompanySeed } from '../types/game';
import { GEO } from './geo';

// 20 Bursa Malaysia names. Codes and names are real; every financial value is FICTIONAL seed data.
type Row = Omit<CompanySeed, 'id' | 'exchange' | 'laborShare' | 'energyShare' | 'depreciationPct' | 'rateSensitivity'> &
  Partial<Pick<CompanySeed, 'laborShare' | 'energyShare' | 'depreciationPct' | 'rateSensitivity'>>;

const rows: Row[] = [
  { code: '1155', displayName: 'Maybank', legalName: 'Malayan Banking Berhad', sector: 'fin', driver: 'finance', industry: 'Banking', exposure: { kl: 0.35, my: 0.45, global: 0.2 }, revenue: 61e9, ebitdaMargin: 0.4, debt: 0, cash: 12e9, shares: 12.1e9, basePE: 12.5, payout: 0.7, vol: 0.16, geo: GEO.maybank },
  { code: '1023', displayName: 'CIMB', legalName: 'CIMB Group Holdings Berhad', sector: 'fin', driver: 'finance', industry: 'Banking', exposure: { kl: 0.3, my: 0.4, global: 0.3 }, revenue: 24e9, ebitdaMargin: 0.42, debt: 0, cash: 6e9, shares: 10.7e9, basePE: 10.8, payout: 0.5, vol: 0.2 },
  { code: '1295', displayName: 'Public Bank', legalName: 'Public Bank Berhad', sector: 'fin', driver: 'finance', industry: 'Banking', exposure: { kl: 0.35, my: 0.55, global: 0.1 }, revenue: 13.5e9, ebitdaMargin: 0.55, debt: 0, cash: 5e9, shares: 19.4e9, basePE: 12.8, payout: 0.55, vol: 0.14, geo: GEO.publicBank },
  { code: '5347', displayName: 'Tenaga Nasional', legalName: 'Tenaga Nasional Berhad', sector: 'util', driver: 'energy', industry: 'Electric utility', exposure: { kl: 0.25, my: 0.7, global: 0.05 }, revenue: 56e9, ebitdaMargin: 0.28, energyShare: 0.55, debt: 58e9, cash: 9e9, shares: 5.8e9, basePE: 17, payout: 0.55, vol: 0.2, rateSensitivity: 1.2 },
  { code: '4863', displayName: 'Telekom Malaysia', legalName: 'Telekom Malaysia Berhad', sector: 'tech', driver: 'software', industry: 'Telecom', exposure: { kl: 0.4, my: 0.55, global: 0.05 }, revenue: 12.4e9, ebitdaMargin: 0.38, debt: 5e9, cash: 3e9, shares: 3.84e9, basePE: 15, payout: 0.55, vol: 0.2, geo: GEO.tm },
  { code: '6012', displayName: 'Maxis', legalName: 'Maxis Berhad', sector: 'tech', driver: 'software', industry: 'Telecom', exposure: { kl: 0.35, my: 0.6, global: 0.05 }, revenue: 10.3e9, ebitdaMargin: 0.4, debt: 8e9, cash: 1e9, shares: 7.83e9, basePE: 21, payout: 0.9, vol: 0.17, geo: GEO.maxis },
  { code: '6888', displayName: 'Axiata', legalName: 'Axiata Group Berhad', sector: 'tech', driver: 'consumer', industry: 'Telecom (regional)', exposure: { kl: 0.08, my: 0.12, global: 0.8 }, revenue: 22e9, ebitdaMargin: 0.4, debt: 24e9, cash: 6e9, shares: 9.2e9, basePE: 24, payout: 0.5, vol: 0.25, geo: GEO.axiata },
  { code: '5225', displayName: 'IHH Healthcare', legalName: 'IHH Healthcare Berhad', sector: 'health', driver: 'health', industry: 'Hospitals', exposure: { kl: 0.2, my: 0.25, global: 0.55 }, revenue: 23e9, ebitdaMargin: 0.25, laborShare: 0.55, debt: 12e9, cash: 4e9, shares: 8.8e9, basePE: 30, payout: 0.3, vol: 0.18, geo: GEO.ihh },
  { code: '5211', displayName: 'Sunway', legalName: 'Sunway Berhad', sector: 'prop', driver: 'industrial', industry: 'Property & diversified', exposure: { kl: 0.4, my: 0.45, global: 0.15 }, revenue: 6.4e9, ebitdaMargin: 0.18, debt: 10e9, cash: 3e9, shares: 5.8e9, basePE: 22, payout: 0.3, vol: 0.28 },
  { code: '3182', displayName: 'Genting', legalName: 'Genting Berhad', sector: 'cons', driver: 'consumer', industry: 'Leisure & diversified', exposure: { kl: 0.15, my: 0.4, global: 0.45 }, revenue: 28e9, ebitdaMargin: 0.3, debt: 35e9, cash: 25e9, shares: 3.87e9, basePE: 14, payout: 0.35, vol: 0.25, geo: GEO.genting },
  { code: '4715', displayName: 'Genting Malaysia', legalName: 'Genting Malaysia Berhad', sector: 'cons', driver: 'consumer', industry: 'Leisure & tourism', exposure: { kl: 0.25, my: 0.45, global: 0.3 }, revenue: 10.5e9, ebitdaMargin: 0.28, debt: 12e9, cash: 3e9, shares: 5.9e9, basePE: 18, payout: 0.6, vol: 0.25, geo: GEO.genting },
  { code: '5296', displayName: 'MR D.I.Y.', legalName: 'MR D.I.Y. Group (M) Berhad', sector: 'cons', driver: 'consumer', industry: 'Home improvement retail', exposure: { kl: 0.3, my: 0.65, global: 0.05 }, revenue: 5.2e9, ebitdaMargin: 0.24, debt: 1e9, cash: 0.5e9, shares: 9.4e9, basePE: 27, payout: 0.55, vol: 0.24, geo: GEO.mrdiy },
  { code: '4677', displayName: 'YTL Corporation', legalName: 'YTL Corporation Berhad', sector: 'util', driver: 'industrial', industry: 'Infrastructure & diversified', exposure: { kl: 0.15, my: 0.35, global: 0.5 }, revenue: 31e9, ebitdaMargin: 0.22, energyShare: 0.3, debt: 45e9, cash: 15e9, shares: 11e9, basePE: 13, payout: 0.3, vol: 0.32, geo: GEO.ytl },
  { code: '6742', displayName: 'YTL Power', legalName: 'YTL Power International Berhad', sector: 'util', driver: 'energy', industry: 'Power & water', exposure: { kl: 0.1, my: 0.2, global: 0.7 }, revenue: 22e9, ebitdaMargin: 0.25, energyShare: 0.45, debt: 30e9, cash: 8e9, shares: 8.2e9, basePE: 11, payout: 0.35, vol: 0.32, geo: GEO.ytl },
  { code: '8869', displayName: 'Press Metal', legalName: 'Press Metal Aluminium Holdings Berhad', sector: 'ind', driver: 'industrial', industry: 'Aluminium', exposure: { kl: 0.05, my: 0.25, global: 0.7 }, revenue: 15e9, ebitdaMargin: 0.17, energyShare: 0.4, debt: 5e9, cash: 1e9, shares: 8.24e9, basePE: 24, payout: 0.5, vol: 0.25 },
  { code: '5183', displayName: 'PETRONAS Chemicals', legalName: 'PETRONAS Chemicals Group Berhad', sector: 'ind', driver: 'energy', industry: 'Petrochemicals', exposure: { kl: 0.05, my: 0.3, global: 0.65 }, revenue: 28e9, ebitdaMargin: 0.22, energyShare: 0.5, debt: 4e9, cash: 12e9, shares: 8e9, basePE: 19, payout: 0.5, vol: 0.25, geo: GEO.petronas },
  { code: '6033', displayName: 'PETRONAS Gas', legalName: 'PETRONAS Gas Berhad', sector: 'util', driver: 'energy', industry: 'Gas infrastructure', exposure: { kl: 0.1, my: 0.85, global: 0.05 }, revenue: 6.6e9, ebitdaMargin: 0.55, debt: 2e9, cash: 3e9, shares: 1.98e9, basePE: 18, payout: 0.8, vol: 0.14, rateSensitivity: 1.2, geo: GEO.petronas },
  { code: '4197', displayName: 'Sime Darby', legalName: 'Sime Darby Berhad', sector: 'ind', driver: 'auto', industry: 'Motors & industrial', exposure: { kl: 0.1, my: 0.4, global: 0.5 }, revenue: 70e9, ebitdaMargin: 0.07, debt: 12e9, cash: 4e9, shares: 6.8e9, basePE: 12, payout: 0.6, vol: 0.2 },
  { code: '6947', displayName: 'CelcomDigi', legalName: 'CelcomDigi Berhad', sector: 'tech', driver: 'software', industry: 'Telecom', exposure: { kl: 0.3, my: 0.65, global: 0.05 }, revenue: 12.8e9, ebitdaMargin: 0.42, debt: 12e9, cash: 1e9, shares: 11.7e9, basePE: 27, payout: 0.9, vol: 0.18 },
  { code: '5398', displayName: 'Gamuda', legalName: 'Gamuda Berhad', sector: 'prop', driver: 'industrial', industry: 'Construction & infrastructure', exposure: { kl: 0.3, my: 0.35, global: 0.35 }, revenue: 12.5e9, ebitdaMargin: 0.14, debt: 10e9, cash: 4e9, shares: 5.6e9, basePE: 22, payout: 0.4, vol: 0.25 },
];

export const MY_COMPANIES: CompanySeed[] = rows.map((r) => ({
  laborShare: 0.4,
  energyShare: 0.1,
  depreciationPct: 0.06,
  rateSensitivity: 1,
  ...r,
  id: `MY:${r.code}`,
  exchange: 'MY',
}));
