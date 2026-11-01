// House price index (D-118). A simple, fictional readout: a slow-moving index (opening 100) that drifts toward a "fair
// value" built from variables the game already simulates. It has no levers and only a mild approval effect; the
// numbers are game-balance constants, not real market data. Pure and deterministic: no randomness at all.
import { BASE_TAX } from '../data/economic-baseline';
import { fdiToGdp } from './fdi';
import { clamp } from './util';
import type { GameState, HousingState } from '../types/game';

export const HOUSING = {
  /** Share of the gap to fair value closed each month. */
  speed: 0.1,
  /** Largest monthly move, as a share of the index. */
  maxStep: 0.02,
  /** Incomes: fair value follows the wage index with this elasticity. */
  incomeElasticity: 0.8,
  /** Fair value change per point of unemployment above the opening rate (0.01 = 1pp). */
  jobs: 1.5,
  /** Rate rise of 1pp lowers fair value by about this share (exponent per unit of OPR). */
  rate: 5,
  /** Fair value change per unit of commercial property levy above the opening 4%. */
  levy: 2.5,
  /** Fair value change per unit of FDI (share of GDP), capped. */
  fdi: 3,
  fdiCap: 0.08,
  /** Scarcity: property-sector utilisation, and (Boom) housing load against its capacity. */
  utilisation: 0.6,
  scarcityLoad: 0.6,
  scarcityRange: [-0.12, 0.15] as [number, number],
  bounds: [50, 250] as [number, number],
  /** Price-to-income ratio (against the opening) read as good / watch / bad. */
  watchAbove: 1.1,
  badAbove: 1.3,
  /** Approval: affordability points lost per 1.00 of ratio above `badAbove`, capped. Mild by design. */
  approvalPenalty: 30,
  approvalCap: 5,
};

export function initialHousing(s: Pick<GameState, 'external' | 'sectors' | 'infra'> & { indicators: { unemployment: number } }): HousingState {
  const net = s.infra?.nets.housing;
  return { index: 100, oprRef: s.external.opr, unemploymentRef: s.indicators.unemployment, utilRef: s.sectors.prop.avgUtil, loadRef: net ? net.load / net.capacity : 1 };
}

/** Where prices are heading (index points): the fair value the monthly index drifts toward. */
export function housingFairValue(s: GameState): number {
  const h = s.housing;
  if (!h) return 100;
  const income = Math.pow(s.households.wageIndex, HOUSING.incomeElasticity);
  const jobs = 1 - HOUSING.jobs * (clamp(1 - s.households.employed / s.households.laborForce, 0, 1) - h.unemploymentRef);
  const rates = Math.exp(-HOUSING.rate * (s.external.opr - h.oprRef));
  const levy = 1 - HOUSING.levy * (s.government.policies.tax.property - BASE_TAX.property);
  const fdi = 1 + Math.min(HOUSING.fdiCap, HOUSING.fdi * fdiToGdp(s));
  let scarcity = HOUSING.utilisation * (s.sectors.prop.avgUtil - h.utilRef);
  if (s.infra) {
    const net = s.infra.nets.housing;
    scarcity += HOUSING.scarcityLoad * (net.load / net.capacity - h.loadRef);
  }
  scarcity = clamp(scarcity, HOUSING.scarcityRange[0], HOUSING.scarcityRange[1]);
  return clamp(100 * income * jobs * rates * levy * fdi * (1 + scarcity), HOUSING.bounds[0], HOUSING.bounds[1]);
}

/** Monthly close: move the index a damped step toward fair value. */
export function monthCloseHousing(s: GameState): void {
  const h = s.housing;
  if (!h) return;
  const step = clamp(HOUSING.speed * (housingFairValue(s) - h.index), -HOUSING.maxStep * h.index, HOUSING.maxStep * h.index);
  h.index = clamp(h.index + step, HOUSING.bounds[0], HOUSING.bounds[1]);
}

/** House prices against incomes, relative to the opening (1.00 = as affordable as at the start). */
export function housingPriceToIncome(s: GameState): number {
  return (s.housing?.index ?? 100) / 100 / s.households.wageIndex;
}

export type HousingTone = 'good' | 'watch' | 'bad';
export function housingStatus(s: GameState): { tone: HousingTone; label: string; ratio: number } {
  const ratio = housingPriceToIncome(s);
  if (ratio > HOUSING.badAbove) return { tone: 'bad', label: 'Unaffordable', ratio };
  if (ratio > HOUSING.watchAbove) return { tone: 'watch', label: 'Stretched', ratio };
  return { tone: 'good', label: 'Affordable', ratio };
}

/** Affordability points (0–100 scale) taken off the approval formula when homes are unaffordable. */
export function housingApprovalPenalty(s: GameState): number {
  return clamp(HOUSING.approvalPenalty * (housingPriceToIncome(s) - HOUSING.badAbove), 0, HOUSING.approvalCap);
}

export function validateHousing(h: HousingState | undefined): void {
  if (!h) throw new Error('Corrupt save: missing housing');
  for (const v of [h.index, h.oprRef, h.unemploymentRef, h.utilRef, h.loadRef]) if (!Number.isFinite(v)) throw new Error('Corrupt save: invalid housing');
  if (h.index < HOUSING.bounds[0] || h.index > HOUSING.bounds[1]) throw new Error('Corrupt save: housing index out of range');
}
