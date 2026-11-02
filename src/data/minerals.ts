// Boom-mode mineral export ventures (D-130). Prices are FICTIONAL simulated indices (1 = the opening), not market data: copper
// follows the engine's copper price; lithium, tin and rare earths are derived from it and the other metals plus a slow
// seeded cycle, so no new random numbers or saved prices are needed. Reference prices are rounded orders of magnitude (ASSUMPTION).
export type MineralId = 'copper' | 'lithium' | 'tin' | 'rareEarths';
export const MINERAL_IDS: MineralId[] = ['copper', 'lithium', 'tin', 'rareEarths'];
export interface MineralMeta {
  name: string;
  unit: string;
  /** Reference price at index 1, USD (ASSUMPTION, rounded). */
  reference: number;
  /** How strongly the index follows copper, aluminium and its own cycle (cycle length in days, amplitude as a share). */
  copperBeta: number;
  aluminiumBeta: number;
  cycleDays: number;
  cycleAmp: number;
}
export const MINERALS: Record<MineralId, MineralMeta> = {
  copper: { name: 'Copper cathode & concentrate', unit: 'tonne', reference: 9500, copperBeta: 1, aluminiumBeta: 0, cycleDays: 1, cycleAmp: 0 },
  lithium: { name: 'Lithium carbonate', unit: 'tonne', reference: 15000, copperBeta: 1.6, aluminiumBeta: 0, cycleDays: 540, cycleAmp: 0.3 },
  tin: { name: 'Refined tin', unit: 'tonne', reference: 28000, copperBeta: 0.5, aluminiumBeta: 0.6, cycleDays: 400, cycleAmp: 0.15 },
  rareEarths: { name: 'Rare-earth oxides', unit: 'tonne', reference: 60000, copperBeta: 0.4, aluminiumBeta: 0, cycleDays: 700, cycleAmp: 0.25 },
};
