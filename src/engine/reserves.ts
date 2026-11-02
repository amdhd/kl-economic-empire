// Reserve-accumulation programme (D-132). A player policy for BNM to build foreign-exchange reserves in
// US dollars and gold, the way a large exporter does. Every month close, until the target is reached, BNM buys a set value of foreign
// assets for ringgit. The ringgit is raised by selling sterilisation bills to banks (as much as the player asks, within the bills cap);
// the rest is newly created base money, which is recorded as a BNM liability (`moneyCreated`) so public net worth stays honest.
// Reserves still cannot be spent on the budget or the fund. Gold is priced by a FICTIONAL deterministic index (no random numbers).
import { BOOM, boomOn } from '../data/boom';
import type { GameState } from '../types/game';
import { BILLS_MAX_SHARE } from './central-bank';
import { flavourDraw } from './deal-flavour';
import { FX_INTERVENTION_SPREAD } from './trade-fx';
import { assertSafeMinor, clamp, pushBounded, toMinor } from './util';

export const RESERVE_MAX_MONTHLY_USD = 5e9; // realistic mode; Boom uses BOOM.reserveMaxMonthlyUsd
export const RESERVE_MAX_TARGET_USD = 800e9;
export const RESERVE_MAX_GOLD_SHARE = 0.6;
export const GOLD_OZ_PER_TONNE = 32150.7;
export const GOLD_REFERENCE_USD = 2600; // per troy ounce at index 1 (ASSUMPTION; fictional)
export const GOLD_STORAGE_COST = 0.002; // a year, share of the gold's value
export const GOLD_SPREAD = 0.005;
const FX_PRESSURE_PER_USD_BN = 0.003; // as for the FX desk
const LIQUIDITY_DECAY = 0.85; // unsterilised money fades from the inflation and FX effects by 15% a month

export interface ReservePolicy {
  /** Monthly purchase, US$ (0 = programme off). */
  monthlyUsd: number;
  /** Stop when total reserves (dollars plus gold at market) reach this, US$. */
  targetUsd: number;
  /** Share of each month's purchase that goes into gold. */
  goldShare: number;
  /** Share of the ringgit paid out that BNM tries to mop up with bills (0–1). */
  sterilise: number;
}
export const maxMonthlyUsd = (s: Pick<GameState, 'mode'>) => (boomOn(s) ? BOOM.reserveMaxMonthlyUsd : RESERVE_MAX_MONTHLY_USD);

/** Fictional gold price index (1 at the opening): a 4% a year drift, two slow cycles with campaign-seeded phases, and a dip when
 * US yields rise. A pure function of the day, the seed and the 10-year yield. */
export function goldIndex(s: GameState): number {
  const d = s.external.daysElapsed;
  const drift = Math.pow(1.04, d / 365);
  const c1 = 1 + 0.12 * Math.sin((2 * Math.PI * d) / 480 + 2 * Math.PI * flavourDraw(s, 'gold:1'));
  const c2 = 1 + 0.06 * Math.sin((2 * Math.PI * d) / 150 + 2 * Math.PI * flavourDraw(s, 'gold:2'));
  const yieldDrag = 1 - 2 * (s.external.ust10 - 0.04);
  return clamp(drift * c1 * c2 * yieldDrag, 0.5, 3);
}
export const goldUsdPerTonne = (s: GameState) => GOLD_OZ_PER_TONNE * GOLD_REFERENCE_USD * goldIndex(s);
/** Gold at market, US cents. */
export const goldValueUsdMinor = (s: GameState) => Math.round((s.centralBank.goldTonnes ?? 0) * goldUsdPerTonne(s) * 100);
/** Dollars plus gold at market, US$. */
export const totalReservesUsd = (s: GameState) => s.centralBank.usdReserves / 100 + goldValueUsdMinor(s) / 100;

export function setReservePolicy(s: GameState, cmd: Partial<ReservePolicy>, atMin: number): string | null {
  if (s.baseline.profile !== 'malaysia') return 'The reserve programme is for Malaysia campaigns.';
  const p = s.centralBank.reserveProgramme;
  const max = maxMonthlyUsd(s);
  if (cmd.monthlyUsd !== undefined && !(cmd.monthlyUsd >= 0 && cmd.monthlyUsd <= max)) return `Monthly purchases must be US$0–${max / 1e9}bn.`;
  if (cmd.targetUsd !== undefined && !(cmd.targetUsd >= 0 && cmd.targetUsd <= RESERVE_MAX_TARGET_USD)) return `The reserve target must be US$0–${RESERVE_MAX_TARGET_USD / 1e9}bn.`;
  if (cmd.goldShare !== undefined && !(cmd.goldShare >= 0 && cmd.goldShare <= RESERVE_MAX_GOLD_SHARE)) return `The gold share must be 0–${RESERVE_MAX_GOLD_SHARE * 100}%.`;
  if (cmd.sterilise !== undefined && !(cmd.sterilise >= 0 && cmd.sterilise <= 1)) return 'Sterilisation must be 0–100%.';
  const next = { ...p, ...cmd };
  if (next.monthlyUsd > 0 && next.targetUsd <= totalReservesUsd(s)) return 'Set a target above today’s reserves, or the programme has nothing to buy.';
  if (next.monthlyUsd === p.monthlyUsd && next.targetUsd === p.targetUsd && next.goldShare === p.goldShare && next.sterilise === p.sterilise) return 'No change to apply.';
  Object.assign(p, { monthlyUsd: next.monthlyUsd, targetUsd: next.targetUsd, goldShare: Math.round(next.goldShare * 100) / 100, sterilise: Math.round(next.sterilise * 100) / 100 });
  pushBounded(s.policyLog, { atMin, effectiveMin: atMin, label: p.monthlyUsd > 0
    ? `Reserve programme: US$${(p.monthlyUsd / 1e9).toFixed(1)}bn a month to US$${(p.targetUsd / 1e9).toFixed(0)}bn, ${(p.goldShare * 100).toFixed(0)}% gold, ${(p.sterilise * 100).toFixed(0)}% sterilised`
    : 'Reserve programme switched off' }, 2000);
  return null;
}

/** Month close: buy this month's reserves. Returns nothing; all state changes are in `centralBank`, `bank` and the policy log. */
export function monthlyReservePurchase(s: GameState): void {
  const cb = s.centralBank, b = s.bank, p = cb.reserveProgramme;
  p.lastBoughtUsd = 0; p.lastGoldUsd = 0; p.lastBills = 0; p.lastCreated = 0;
  cb.reserveLiquidity *= LIQUIDITY_DECAY;
  if (!(p.monthlyUsd > 0)) return;
  const room = p.targetUsd - totalReservesUsd(s);
  const usd = Math.min(p.monthlyUsd, room);
  if (!(usd > 1e6)) return;
  const fx = s.external.myrPerUsd;
  const goldUsd = usd * p.goldShare, cashUsd = usd - goldUsd;
  // What BNM pays: the dollar leg at the desk spread, the gold leg at the gold spread.
  const myr = cashUsd * fx * (1 + FX_INTERVENTION_SPREAD) + goldUsd * fx * (1 + GOLD_SPREAD);
  const myrMinor = toMinor(myr);
  // Sterilise as much as asked, within the bills cap on the stock of bills (half of banks' reserves before any bills).
  const billRoom = Math.max(0, BILLS_MAX_SHARE * (b.reserves + cb.bills / 100) - cb.bills / 100);
  const billsMinor = Math.min(myrMinor, toMinor(Math.min(myr * p.sterilise, billRoom)));
  const createdMinor = myrMinor - billsMinor;
  const cashMinor = Math.floor(cashUsd * 100), goldMinor = Math.floor(goldUsd * 100);
  const tonnes = Math.round((goldMinor / 100 / goldUsdPerTonne(s)) * 1e6) / 1e6;
  assertSafeMinor(cb.usdReserves + cashMinor); assertSafeMinor(cb.bills + billsMinor); assertSafeMinor(cb.moneyCreated + createdMinor); assertSafeMinor(cb.goldCostUsd + goldMinor);
  cb.usdReserves += cashMinor;
  cb.goldTonnes += tonnes;
  cb.goldCostUsd += goldMinor;
  cb.bills += billsMinor;
  cb.moneyCreated += createdMinor;
  // The ringgit paid lands in bank deposits and reserves; bills then take the sterilised part back out of reserves into BNM's books.
  b.deposits += myrMinor / 100;
  b.reserves += (myrMinor - billsMinor) / 100;
  // Ringgit pressure like the FX desk's, less when sterilised; unsterilised money also lingers as extra liquidity.
  cb.pressure = clamp(cb.pressure + FX_PRESSURE_PER_USD_BN * (usd / 1e9) * (1 - 0.5 * p.sterilise), -0.08, 0.08);
  cb.reserveLiquidity += createdMinor / 100;
  p.lastBoughtUsd = cashMinor + goldMinor; p.lastGoldUsd = goldMinor; p.lastBills = billsMinor; p.lastCreated = createdMinor;
  p.totalBoughtUsd += cashMinor + goldMinor;
  if (p.targetUsd - totalReservesUsd(s) <= 1e6) {
    p.monthlyUsd = 0;
    pushBounded(s.policyLog, { atMin: s.clock.hour * 60, effectiveMin: s.clock.hour * 60, label: 'Reserve programme reached its target and stopped' }, 2000);
  }
}
