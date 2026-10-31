// Infrastructure capacity (D-084, user request). A Boom-mode game-design layer, not an economic estimate: growth loads
// three national networks, and a network running above its capacity throttles the sectors that depend on it. Capacity
// only grows when the player commissions it, and it takes years to arrive, so the player must build ahead of demand.
// Normal campaigns never read these numbers.
import type { SectorId } from '../types/game';

export const NETWORKS = ['power', 'transport', 'housing'] as const;
export type NetworkId = (typeof NETWORKS)[number];

export interface NetworkSpec {
  label: string;
  blurb: string;
  /** Load = (real GDP ÷ opening) ^ elasticity; housing also scales with the labour force (see engine). */
  loadElasticity: number;
  /** Cost of +1.00 capacity as a share of the opening annual nominal GDP. */
  costGdpShare: number;
  buildDays: number;
  /** How strongly each sector's output capacity falls per unit of overload. */
  weights: Record<SectorId, number>;
}

export const INFRA = {
  /** Capacity index at the opening (load 1.00): a 25% reserve margin. */
  openingCapacity: 1.25,
  /** Capacity added by one step. Orders are 1, 2 or 4 steps. */
  step: 0.25,
  orderSteps: [1, 2, 4] as const,
  maxBuildsPerNetwork: 4,
  /** Sector capacity multiplier = max(floor, 1 ÷ (1 + penalty × Σ weight × overload)). */
  penalty: 1.2,
  floor: 0.35,
  /** Cost per unit of capacity grows with the economy's real size to this power. */
  costScale: 0.5,
  /** Daily smoothing of the GDP signal (days), and the slower average used to read the trend. */
  fastDays: 30,
  slowDays: 180,
  /** Planning horizon shown to the player (days). */
  horizonDays: 548,
  /** Utilisation above which the panel warns. */
  warnAt: 0.9,
  /** Housing load: labour-force growth plus this share of income-per-worker growth. */
  housingIncomeElasticity: 0.5,
};

export const NETWORK_SPECS: Record<NetworkId, NetworkSpec> = {
  power: {
    label: 'Power grid', blurb: 'Generation and transmission. Factories and data centres stall first.',
    loadElasticity: 0.85, costGdpShare: 0.06, buildDays: 540,
    weights: { fin: 0.3, prop: 0.4, util: 0.5, tech: 0.9, cons: 0.5, health: 0.5, ind: 1 },
  },
  transport: {
    label: 'Transport & ports', blurb: 'Roads, rail, ports and airports. Freight and shops slow down.',
    loadElasticity: 0.7, costGdpShare: 0.08, buildDays: 720,
    weights: { fin: 0.3, prop: 0.7, util: 0.3, tech: 0.3, cons: 0.9, health: 0.4, ind: 1 },
  },
  housing: {
    label: 'Housing & services', blurb: 'Homes, water and schools for a bigger workforce. Firms cannot hire people who cannot live nearby.',
    loadElasticity: 1, costGdpShare: 0.06, buildDays: 360,
    weights: { fin: 0.6, prop: 0.2, util: 0.3, tech: 0.6, cons: 0.8, health: 0.6, ind: 0.5 },
  },
};
