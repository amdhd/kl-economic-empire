// FICTIONAL scenario events. Each documents first-order impacts (`mods`), propagation (via the
// economy model) and duration. Nothing here is a forecast of real-world events.
import type { GlobalDriver, SectorId } from '../types/game';

export interface EventMods {
  oil?: number; // multiplicative on oil index
  fx?: number; // multiplicative on MYR per USD (>1 = ringgit weaker)
  tech?: number; // tech cycle
  tourism?: number;
  myDemand?: number;
  globalDemand?: number;
  usDemand?: number;
  risk?: number; // additive to risk appetite
  creditWillingness?: number; // multiplicative
  creditSpread?: number; // additive, decimal
  propDemand?: number; // multiplicative on property final demand
  capacity?: Partial<Record<SectorId, number>>; // multiplicative capacity disruption
  drivers?: Partial<Record<GlobalDriver, number>>;
  usRate?: number; // additive
  floodDamage?: number; // one-off public cost in MYR, scaled by (1 - resilience)
}

export interface EventTemplate {
  id: string;
  title: string;
  tone: 'good' | 'bad' | 'neutral';
  weeklyHazard: number;
  minDays: number;
  maxDays: number;
  mods: EventMods;
  description: string;
  effects: string[];
  company?: boolean; // targets a single random company
}

export const EVENTS: EventTemplate[] = [
  { id: 'oil_spike', title: 'Oil price spike', tone: 'bad', weeklyHazard: 0.012, minDays: 45, maxDays: 120, mods: { oil: 1.4, drivers: { energy: 1.12 } }, description: 'Supply disruptions push crude sharply higher.', effects: ['Energy & utility input costs ↑', 'CPI ↑ via fuel and electricity', 'Energy-producer earnings ↑', 'Real household income ↓'] },
  { id: 'oil_slump', title: 'Oil glut', tone: 'neutral', weeklyHazard: 0.008, minDays: 45, maxDays: 120, mods: { oil: 0.7, drivers: { energy: 0.88 } }, description: 'Global oversupply drives crude lower.', effects: ['Input costs ↓', 'CPI ↓', 'Energy-producer earnings ↓'] },
  { id: 'myr_weak', title: 'Ringgit depreciation', tone: 'bad', weeklyHazard: 0.01, minDays: 30, maxDays: 90, mods: { fx: 1.08, risk: -0.05 }, description: 'Capital outflows weaken the ringgit.', effects: ['Import prices ↑ → CPI ↑', 'USD assets worth more in MYR (SWF NAV ↑)', 'Exporters and tourism more competitive'] },
  { id: 'myr_strong', title: 'Ringgit rally', tone: 'neutral', weeklyHazard: 0.008, minDays: 30, maxDays: 90, mods: { fx: 0.93 }, description: 'Strong inflows lift the ringgit.', effects: ['Import prices ↓', 'USD holdings worth less in MYR', 'Tourism slightly less competitive'] },
  { id: 'ai_boom', title: 'Global AI investment boom', tone: 'good', weeklyHazard: 0.01, minDays: 60, maxDays: 160, mods: { tech: 1.18, drivers: { semis: 1.3, software: 1.12, ads: 1.08 }, risk: 0.08 }, description: 'Hyperscaler capex surges again.', effects: ['US semiconductor & software earnings ↑', 'KL tech exports ↑ (small)', 'Global risk appetite ↑'] },
  { id: 'ai_correction', title: 'AI valuation correction', tone: 'bad', weeklyHazard: 0.008, minDays: 45, maxDays: 120, mods: { tech: 0.85, drivers: { semis: 0.72, software: 0.88, ads: 0.93 }, risk: -0.12 }, description: 'Investors question AI returns; capex guidance cut.', effects: ['US tech earnings & valuations ↓', 'Risk appetite ↓ across markets'] },
  { id: 'tourism_boom', title: 'Visitor arrivals surge', tone: 'good', weeklyHazard: 0.01, minDays: 45, maxDays: 120, mods: { tourism: 1.2 }, description: 'Visa-free travel and regional events lift arrivals.', effects: ['Consumer & tourism demand ↑', 'Retail/leisure earnings ↑', 'Consumption-levy receipts ↑'] },
  { id: 'tourism_slump', title: 'Tourism slump', tone: 'bad', weeklyHazard: 0.008, minDays: 45, maxDays: 120, mods: { tourism: 0.75 }, description: 'Regional travel demand falls.', effects: ['Consumer & tourism demand ↓', 'Leisure earnings ↓', 'Jobs in retail/hospitality ↓ with lag'] },
  { id: 'credit_crunch', title: 'Banking credit crunch', tone: 'bad', weeklyHazard: 0.006, minDays: 60, maxDays: 120, mods: { creditWillingness: 0.55, creditSpread: 0.015, risk: -0.08, drivers: { finance: 0.92 } }, description: 'Funding stress makes banks pull back lending.', effects: ['New loans ↓ → investment ↓', 'Lending rates ↑', 'Bank stocks ↓', 'Unemployment ↑ with lag'] },
  { id: 'prop_glut', title: 'Commercial property oversupply', tone: 'bad', weeklyHazard: 0.006, minDays: 90, maxDays: 180, mods: { propDemand: 0.85 }, description: 'New office supply outruns demand.', effects: ['Property & construction demand ↓', 'Rents ease (affordability ↑)', 'Property levy base ↓'] },
  { id: 'flood', title: 'Flash floods hit KL', tone: 'bad', weeklyHazard: 0.007, minDays: 7, maxDays: 14, mods: { capacity: { cons: 0.9, prop: 0.9, ind: 0.92 }, floodDamage: 350e6 }, description: 'Torrential rain floods low-lying districts (fictional scenario).', effects: ['Short disruption to retail, construction, industry', 'Emergency public spending (cut by resilience projects)', 'Satisfaction ↓'] },
  { id: 'global_slowdown', title: 'Global growth slowdown', tone: 'bad', weeklyHazard: 0.005, minDays: 90, maxDays: 180, mods: { globalDemand: 0.95, usDemand: 0.96, myDemand: 0.98, risk: -0.1, drivers: { industrial: 0.9, consumer: 0.95, energy: 0.92, auto: 0.9 } }, description: 'Major economies slow at once.', effects: ['Export demand ↓', 'Industrial earnings ↓', 'Risk appetite ↓'] },
  { id: 'fed_hike', title: 'Fed surprises with hike', tone: 'bad', weeklyHazard: 0.005, minDays: 60, maxDays: 150, mods: { usRate: 0.0075, fx: 1.03, risk: -0.06 }, description: 'US policy tightens unexpectedly.', effects: ['US valuations ↓ (rate-sensitive more)', 'USD ↑ vs MYR'] },
  { id: 'company_beat', title: 'Earnings beat', tone: 'good', weeklyHazard: 0.03, minDays: 30, maxDays: 90, mods: {}, company: true, description: 'Company-specific demand win.', effects: ['That company’s revenue ↑', 'Sentiment ↑'] },
  { id: 'company_miss', title: 'Profit warning', tone: 'bad', weeklyHazard: 0.03, minDays: 30, maxDays: 90, mods: {}, company: true, description: 'Company-specific setback.', effects: ['That company’s revenue ↓', 'Sentiment ↓'] },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventTemplate>;
