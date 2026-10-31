// Reserve-backed, sterilised FX operations. These accounts cannot fund fiscal spending or the SWF.
import type { CentralBankState, GameState } from '../types/game';
import { klDay } from './time';
import { assertSafeMinor, clamp, pushBounded, toMinor } from './util';

export const FX_INTERVENTION_SPREAD = 0.002;
export const FX_DAILY_USD_LIMIT = 1e9;
export function initialCentralBank(profile: 'malaysia' | 'legacy-kl', rate: number): CentralBankState {
  const usdReserves = profile === 'malaysia' ? toMinor(116.4e9) : 0;
  const myrCash = profile === 'malaysia' ? toMinor(5e9) : 0; // fictional segregated sterilisation float
  return { usdReserves, myrCash, openingEquityMYR: usdReserves / 100 * rate + myrCash / 100,
    pressure: 0, dailyUsdUsed: 0, lastInterventionDay: -1, tx: [] };
}

export function quoteIntervention(s: GameState, side: 'buyUSD' | 'sellUSD', usdMinor: number, atMin: number) {
  const cb = s.centralBank;
  if (!['buyUSD', 'sellUSD'].includes(side) || !Number.isSafeInteger(usdMinor) || usdMinor <= 0) return { ok: false as const, message: 'Enter a positive, safe USD amount.' };
  const today = klDay(atMin);
  const used = cb.lastInterventionDay === today ? cb.dailyUsdUsed : 0;
  if (usdMinor / 100 + used > FX_DAILY_USD_LIMIT) return { ok: false as const, message: 'Daily intervention limit is $1,000,000,000 across both directions.' };
  const rate = s.external.myrPerUsd * (1 + (side === 'buyUSD' ? 1 : -1) * FX_INTERVENTION_SPREAD);
  const major = usdMinor / 100 * rate;
  if (!Number.isFinite(major) || major * 100 > Number.MAX_SAFE_INTEGER) return { ok: false as const, message: 'Intervention exceeds safe accounting limits.' };
  const myrMinor = side === 'buyUSD' ? Math.ceil(major * 100) : Math.floor(major * 100);
  if ((side === 'buyUSD' && myrMinor > cb.myrCash) || (side === 'sellUSD' && usdMinor > cb.usdReserves)) return { ok: false as const, message: 'Insufficient central-bank inventory; treasury and SWF balances are separate.' };
  const usdBalance = cb.usdReserves + (side === 'buyUSD' ? usdMinor : -usdMinor);
  const myrBalance = cb.myrCash + (side === 'buyUSD' ? -myrMinor : myrMinor);
  if (![usdBalance, myrBalance].every(Number.isSafeInteger)) return { ok: false as const, message: 'Intervention exceeds safe accounting limits.' };
  return { ok: true as const, message: 'Intervention ready.', rate, myrMinor, usdBalance, myrBalance, today, used };
}

export function interveneFx(s: GameState, side: 'buyUSD' | 'sellUSD', usdMinor: number, atMin: number) {
  const q = quoteIntervention(s, side, usdMinor, atMin);
  if (!q.ok) return q;
  const cb = s.centralBank;
  assertSafeMinor(q.usdBalance); assertSafeMinor(q.myrBalance);
  cb.usdReserves = q.usdBalance;
  cb.myrCash = q.myrBalance;
  cb.lastInterventionDay = q.today;
  cb.dailyUsdUsed = q.used + usdMinor / 100;
  cb.pressure = clamp(cb.pressure + (side === 'buyUSD' ? 1 : -1) * 0.003 * (usdMinor / 100 / 1e9), -0.08, 0.08);
  pushBounded(cb.tx, { atMin, side, usdMinor, myrMinor: q.myrMinor, rate: q.rate }, 800);
  pushBounded(s.policyLog, { atMin, effectiveMin: atMin, label: `Central bank ${side === 'buyUSD' ? 'bought' : 'sold'} $${(usdMinor / 100).toLocaleString('en-MY')}; FX pressure begins at next daily fixing` }, 2000);
  return { ok: true, message: 'Intervention settled. FX pressure enters the next daily fixing and fades over 30 days.' };
}
