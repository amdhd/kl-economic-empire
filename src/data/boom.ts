// Boom sandbox mode (D-079, user request). An opt-in "for fun" mode that removes the realistic speed limits on growth so a
// player can chase world-beating GDP. Every value here is a game-design assumption, not an economic estimate. Normal
// campaigns never read these numbers.
import type { GameState } from '../types/game';

export const CAMPAIGN_LENGTHS = [24, 36, 60, 120] as const;
export type CampaignMonths = (typeof CAMPAIGN_LENGTHS)[number];

export const BOOM = {
  /** Extra desired net capital growth a year, and the cap on total desired growth (realistic mode: +0 and 9%). */
  capitalPush: 0.12,
  maxCapitalGrowth: 0.6,
  /** The investment drive phases in over this many months, so demand does not run far ahead of new capacity at once. */
  pushRampMonths: 12,
  /** Investment plans close this share of the gap to their target each month (realistic: 0.3). */
  planSpeed: 0.6,
  /** Extra productivity growth a year (automation, AI, skills). It raises what each worker and each machine can produce,
   * so capital capacity grows by the same rate on top of new investment. */
  productivity: 0.28,
  /** Share of productivity gains passed into wages each month, and the monthly wage-growth cap (realistic: 1.2%). */
  wagePassThrough: 1.15,
  maxWageGrowthMonthly: 0.04,
  /** Labour force: extra trend growth a year (migration) and how fast it follows labour demand (realistic pull 0.15). */
  laborForceGrowth: 0.06,
  laborForcePull: 0.5,
  /** Weekly hiring speed toward labour demand (realistic model 3: 0.02). */
  hiringSpeed: 0.12,
  /** Banks may lend this share of the loan book a month (realistic 3%) against half the capital they need. */
  creditShare: 0.12,
  capitalRequirement: 0.05,
  /** Small open economy: foreign demand scales with what Malaysia can make (sector capacity ÷ opening). */
  exportCapacityElasticity: 1,
  /** Productivity-led ringgit appreciation: log MYR/USD falls by this × log(real GDP ÷ opening). Floor MYR1.00. */
  fxProductivityElasticity: 0.35,
  fxFloor: 1,
  /** FDI: arrival hazard multiplier and pledge size growth (× (base + perYear × years)). */
  fdiHazard: 4,
  fdiSizeBase: 3,
  fdiSizePerYear: 2,
};

export const boomOn = (s: Pick<GameState, 'mode'>) => !!s.mode?.boom;
export const campaignMonths = (s: Pick<GameState, 'mode'>) => s.mode?.months ?? 24;

/** Money is stored in sen with exact integer accounting, which caps any balance at about RM90 trillion. New public debt
 * stops at this level so a runaway boom cannot overflow the ledger. */
export const DEBT_LIMIT_MYR = 85e12;
