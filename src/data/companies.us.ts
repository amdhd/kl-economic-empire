import type { CompanySeed } from '../types/game';
import { GEO } from './geo';

// 20 S&P 500 constituents (membership per knowledge as of mid-2026; reconfirm — see docs/data-sources.md).
// Tickers and names are real; every financial value is FICTIONAL seed data in USD.
type Row = Omit<CompanySeed, 'id' | 'exchange' | 'sector' | 'laborShare' | 'energyShare' | 'depreciationPct' | 'rateSensitivity' | 'exposure'> &
  Partial<Pick<CompanySeed, 'laborShare' | 'energyShare' | 'depreciationPct' | 'rateSensitivity' | 'sector'>> & { kl?: number };

const rows: Row[] = [
  { code: 'NVDA', displayName: 'NVIDIA', legalName: 'NVIDIA Corporation', driver: 'semis', industry: 'Semiconductors / AI', sector: 'tech', revenue: 185e9, ebitdaMargin: 0.6, debt: 9e9, cash: 50e9, shares: 24.4e9, basePE: 36, payout: 0.02, vol: 0.45, rateSensitivity: 1.6 },
  { code: 'META', displayName: 'Meta Platforms', legalName: 'Meta Platforms, Inc.', driver: 'ads', industry: 'Digital advertising', sector: 'tech', revenue: 185e9, ebitdaMargin: 0.5, debt: 30e9, cash: 60e9, shares: 2.52e9, basePE: 25, payout: 0.08, vol: 0.32, rateSensitivity: 1.4 },
  { code: 'MSFT', displayName: 'Microsoft', legalName: 'Microsoft Corporation', driver: 'software', industry: 'Software / cloud', sector: 'tech', revenue: 295e9, ebitdaMargin: 0.55, debt: 45e9, cash: 80e9, shares: 7.43e9, basePE: 32, payout: 0.25, vol: 0.22, rateSensitivity: 1.4 },
  { code: 'AAPL', displayName: 'Apple', legalName: 'Apple Inc.', driver: 'consumer', industry: 'Devices / services', sector: 'tech', revenue: 415e9, ebitdaMargin: 0.34, debt: 95e9, cash: 60e9, shares: 14.8e9, basePE: 29, payout: 0.15, vol: 0.22, rateSensitivity: 1.3 },
  { code: 'AMZN', displayName: 'Amazon', legalName: 'Amazon.com, Inc.', driver: 'consumer', industry: 'Commerce / cloud', sector: 'cons', revenue: 700e9, ebitdaMargin: 0.19, debt: 60e9, cash: 90e9, shares: 10.7e9, basePE: 33, payout: 0, vol: 0.28, rateSensitivity: 1.4 },
  { code: 'GOOGL', displayName: 'Alphabet (Class A)', legalName: 'Alphabet Inc.', driver: 'ads', industry: 'Advertising / cloud', sector: 'tech', revenue: 385e9, ebitdaMargin: 0.42, debt: 25e9, cash: 95e9, shares: 12.1e9, basePE: 22, payout: 0.08, vol: 0.27, rateSensitivity: 1.3, geo: GEO.google, kl: 0.003 },
  { code: 'AVGO', displayName: 'Broadcom', legalName: 'Broadcom Inc.', driver: 'semis', industry: 'Semiconductors / infrastructure', sector: 'tech', revenue: 64e9, ebitdaMargin: 0.6, debt: 65e9, cash: 10e9, shares: 4.7e9, basePE: 34, payout: 0.45, vol: 0.38, rateSensitivity: 1.5 },
  { code: 'TSLA', displayName: 'Tesla', legalName: 'Tesla, Inc.', driver: 'auto', industry: 'Automotive / energy', sector: 'ind', revenue: 102e9, ebitdaMargin: 0.14, debt: 7e9, cash: 35e9, shares: 3.22e9, basePE: 105, payout: 0, vol: 0.55, rateSensitivity: 1.8, geo: GEO.tesla, kl: 0.002 },
  { code: 'JPM', displayName: 'JPMorgan Chase', legalName: 'JPMorgan Chase & Co.', driver: 'finance', industry: 'Banking', sector: 'fin', revenue: 172e9, ebitdaMargin: 0.45, debt: 0, cash: 40e9, shares: 2.75e9, basePE: 13, payout: 0.3, vol: 0.2, rateSensitivity: 0.8 },
  { code: 'V', displayName: 'Visa', legalName: 'Visa Inc.', driver: 'finance', industry: 'Payments', sector: 'fin', revenue: 41e9, ebitdaMargin: 0.7, debt: 20e9, cash: 18e9, shares: 1.95e9, basePE: 29, payout: 0.22, vol: 0.18, rateSensitivity: 1.2 },
  { code: 'MA', displayName: 'Mastercard', legalName: 'Mastercard Incorporated', driver: 'finance', industry: 'Payments', sector: 'fin', revenue: 32e9, ebitdaMargin: 0.62, debt: 18e9, cash: 9e9, shares: 0.91e9, basePE: 33, payout: 0.2, vol: 0.19, rateSensitivity: 1.2 },
  { code: 'BRK.B', displayName: 'Berkshire Hathaway (B)', legalName: 'Berkshire Hathaway Inc.', driver: 'finance', industry: 'Diversified holding', sector: 'fin', revenue: 380e9, ebitdaMargin: 0.16, debt: 120e9, cash: 300e9, shares: 2.16e9, basePE: 21, payout: 0, vol: 0.15, rateSensitivity: 0.9 },
  { code: 'XOM', displayName: 'Exxon Mobil', legalName: 'Exxon Mobil Corporation', driver: 'energy', industry: 'Integrated energy', sector: 'util', revenue: 335e9, ebitdaMargin: 0.18, energyShare: 0.2, debt: 40e9, cash: 20e9, shares: 4.3e9, basePE: 14, payout: 0.45, vol: 0.22, rateSensitivity: 0.8, geo: GEO.exxon, kl: 0.002 },
  { code: 'COST', displayName: 'Costco Wholesale', legalName: 'Costco Wholesale Corporation', driver: 'consumer', industry: 'Warehouse retail', sector: 'cons', revenue: 275e9, ebitdaMargin: 0.045, depreciationPct: 0.01, debt: 6e9, cash: 15e9, shares: 0.443e9, basePE: 47, payout: 0.3, vol: 0.18, rateSensitivity: 1.2 },
  { code: 'WMT', displayName: 'Walmart', legalName: 'Walmart Inc.', driver: 'consumer', industry: 'Retail', sector: 'cons', revenue: 700e9, ebitdaMargin: 0.065, depreciationPct: 0.02, debt: 40e9, cash: 10e9, shares: 8.0e9, basePE: 35, payout: 0.35, vol: 0.17, rateSensitivity: 1 },
  { code: 'PG', displayName: 'Procter & Gamble', legalName: 'The Procter & Gamble Company', driver: 'consumer', industry: 'Consumer staples', sector: 'cons', revenue: 86e9, ebitdaMargin: 0.28, debt: 30e9, cash: 9e9, shares: 2.35e9, basePE: 24, payout: 0.6, vol: 0.14, rateSensitivity: 1 },
  { code: 'AMD', displayName: 'Advanced Micro Devices', legalName: 'Advanced Micro Devices, Inc.', driver: 'semis', industry: 'Semiconductors', sector: 'tech', revenue: 33e9, ebitdaMargin: 0.22, debt: 2e9, cash: 6e9, shares: 1.62e9, basePE: 40, payout: 0, vol: 0.48, rateSensitivity: 1.6 },
  { code: 'NFLX', displayName: 'Netflix', legalName: 'Netflix, Inc.', driver: 'consumer', industry: 'Entertainment streaming', sector: 'cons', revenue: 46e9, ebitdaMargin: 0.32, debt: 15e9, cash: 8e9, shares: 4.25e9, basePE: 40, payout: 0, vol: 0.32, rateSensitivity: 1.4 },
  { code: 'UNH', displayName: 'UnitedHealth Group', legalName: 'UnitedHealth Group Incorporated', driver: 'health', industry: 'Health insurance & care', sector: 'health', revenue: 415e9, ebitdaMargin: 0.07, depreciationPct: 0.01, laborShare: 0.5, debt: 75e9, cash: 25e9, shares: 0.905e9, basePE: 18, payout: 0.4, vol: 0.3, rateSensitivity: 0.9 },
  { code: 'PLTR', displayName: 'Palantir', legalName: 'Palantir Technologies Inc.', driver: 'software', industry: 'Enterprise software', sector: 'tech', revenue: 4.6e9, ebitdaMargin: 0.3, debt: 0, cash: 6e9, shares: 2.37e9, basePE: 170, payout: 0, vol: 0.6, rateSensitivity: 2 },
];

export const US_COMPANIES: CompanySeed[] = rows.map(({ kl, ...r }) => {
  const klx = kl ?? 0.001;
  return {
    laborShare: 0.35,
    energyShare: 0.05,
    depreciationPct: Math.min(0.05, 0.3 * r.ebitdaMargin),
    rateSensitivity: 1,
    sector: 'tech',
    ...r,
    id: `US:${r.code}`,
    exchange: 'US',
    // US issuers: tiny Malaysia footprint, almost everything is US/global.
    exposure: { kl: klx, my: 0.004, global: 1 - klx - 0.004 },
  };
});
