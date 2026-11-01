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
  /** Regional project outside Kuala Lumpur (D-096): its effects reach the national economy at full strength, not at KL's share. */
  national?: boolean;
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

// Regional projects (D-096). Fictional, illustrative designs; sizes are game-balance assumptions, not estimates of real projects.
// They are built by the same pipeline as the KL projects, so they cost real treasury cash and cannot fail or be cancelled by chance.
const regional = (t: Omit<ProjectTemplate, 'national' | 'rentEffect' | 'resilience'> & Partial<Pick<ProjectTemplate, 'rentEffect' | 'resilience'>>): ProjectTemplate => ({ rentEffect: 0, resilience: 0, ...t, national: true });
export const REGIONAL_PROJECTS: ProjectTemplate[] = [
  regional({ id: 'jb_zone', name: 'Johor financial & special economic zone', kind: 'zone', cost: 6e9, durationDays: 720, productivity: { fin: 0.012, tech: 0.008, prop: 0.006, cons: 0.004 }, serviceEffect: 0.004, tourism: 0.008, description: 'A cross-border finance, logistics and tech zone beside Singapore. Pulls in firms, jobs and trade; big construction demand while it is built.' }),
  regional({ id: 'rts_link', name: 'Johor–Singapore rapid transit link', kind: 'transport', cost: 3e9, durationDays: 450, productivity: { cons: 0.006, fin: 0.004, prop: 0.004 }, serviceEffect: 0.004, tourism: 0.012, description: 'A short cross-border rail shuttle for commuters and visitors. Speeds up the Johor zone and lifts tourism.' }),
  regional({ id: 'penang_port', name: 'Penang port & logistics expansion', kind: 'port', cost: 3.2e9, durationDays: 540, productivity: { ind: 0.014, cons: 0.004, tech: 0.002 }, serviceEffect: 0.002, tourism: 0, description: 'Deeper berths, new cranes and a container yard for the northern industrial belt. Lowers freight costs for factories.' }),
  regional({ id: 'klang_gateway', name: 'Port Klang gateway upgrade', kind: 'port', cost: 4e9, durationDays: 600, productivity: { ind: 0.015, cons: 0.006, fin: 0.002 }, serviceEffect: 0.002, tourism: 0, description: 'More container capacity and rail links at the main national gateway. Helps every goods exporter.' }),
  regional({ id: 'ecrl', name: 'East Coast rail link', kind: 'transport', cost: 8e9, durationDays: 720, productivity: { ind: 0.01, cons: 0.006, prop: 0.006 }, serviceEffect: 0.006, tourism: 0.015, description: 'A long rail line joining the east coast to the west. Opens land, jobs and tourism; the largest regional build.' }),
  regional({ id: 'kulim_tech', name: 'Kulim high-tech & chip park', kind: 'industrial', cost: 2.5e9, durationDays: 540, productivity: { tech: 0.015, ind: 0.01 }, serviceEffect: 0.002, tourism: 0, description: 'Serviced land, power and water for chip and electronics plants. Raises tech and industrial productivity.' }),
  regional({ id: 'borneo_energy', name: 'Borneo hydro & green-energy grid', kind: 'energy', cost: 4e9, durationDays: 600, productivity: { util: 0.02, ind: 0.006, tech: 0.004 }, serviceEffect: 0.004, tourism: 0, description: 'Hydro and solar with a long transmission line. Cheaper, cleaner power lifts utilities and heavy industry.' }),
  regional({ id: 'langkawi_hub', name: 'Langkawi airport & tourism hub', kind: 'transport', cost: 1.5e9, durationDays: 360, productivity: { cons: 0.004 }, serviceEffect: 0.002, tourism: 0.03, description: 'A bigger terminal, longer runway and resort infrastructure. A strong boost to tourism for a small price.' }),
];
PROJECTS.push(...REGIONAL_PROJECTS);

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p])) as Record<string, ProjectTemplate>;
