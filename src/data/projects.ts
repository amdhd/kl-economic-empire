import type { ProjectKind, SectorId } from '../types/game';

export interface ProjectTemplate {
  id: string;
  name: string;
  kind: ProjectKind;
  cost: number; // MYR
  durationDays: number;
  /** Productivity uplift per sector once complete (multiplicative, e.g. 0.01 = +1%). */
  productivity: Partial<Record<SectorId, number>>;
  rentEffect: number; // change to housing-cost factor on completion (negative = cheaper)
  serviceEffect: number; // permanent addition to service-quality target
  resilience: number; // share of flood damage avoided
  tourism: number; // permanent tourism demand uplift
  description: string;
}

export const PROJECTS: ProjectTemplate[] = [
  { id: 'brt', name: 'Bus Rapid Transit corridor', kind: 'transport', cost: 1.2e9, durationDays: 270, productivity: { cons: 0.008, prop: 0.006, health: 0.004 }, rentEffect: -0.005, serviceEffect: 0.02, resilience: 0, tourism: 0.005, description: 'Dedicated busways linking Sentul, KL Sentral and Cheras. Fast to build, modest gains.' },
  { id: 'lrt', name: 'LRT circle line extension', kind: 'transport', cost: 4.5e9, durationDays: 540, productivity: { cons: 0.02, prop: 0.015, fin: 0.01, tech: 0.01, health: 0.008 }, rentEffect: -0.012, serviceEffect: 0.04, resilience: 0, tourism: 0.02, description: 'Large rail project. Big construction demand during build; payoff arrives late in the campaign.' },
  { id: 'fibre', name: 'City fibre & 5G backbone', kind: 'connectivity', cost: 0.6e9, durationDays: 180, productivity: { tech: 0.025, fin: 0.01, cons: 0.004 }, rentEffect: 0, serviceEffect: 0.01, resilience: 0, tourism: 0, description: 'Neutral-host fibre and small cells. Lifts tech and finance productivity.' },
  { id: 'housing', name: 'Affordable housing programme', kind: 'housing', cost: 2.0e9, durationDays: 360, productivity: { cons: 0.003 }, rentEffect: -0.04, serviceEffect: 0.01, resilience: 0, tourism: 0, description: '12,000 public rental units. Cools rents and improves affordability.' },
  { id: 'flood', name: 'Flood resilience & drainage', kind: 'resilience', cost: 0.8e9, durationDays: 240, productivity: { prop: 0.002, cons: 0.002 }, rentEffect: 0, serviceEffect: 0.015, resilience: 0.6, tourism: 0, description: 'Retention ponds and SMART-tunnel upgrades. Cuts flood-event damage by 60%.' },
  { id: 'clinics', name: 'Community clinics network', kind: 'health', cost: 0.5e9, durationDays: 150, productivity: { health: 0.01 }, rentEffect: 0, serviceEffect: 0.05, resilience: 0, tourism: 0, description: '40 clinics. Raises service quality and satisfaction quickly.' },
  { id: 'heritage', name: 'Heritage & tourism quarter', kind: 'transport', cost: 0.7e9, durationDays: 210, productivity: { cons: 0.006 }, rentEffect: 0.003, serviceEffect: 0.005, resilience: 0, tourism: 0.06, description: 'Pedestrianised Merdeka–Petaling Street precinct. Boosts visitor demand.' },
];

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p])) as Record<string, ProjectTemplate>;
