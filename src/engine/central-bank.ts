// Central-bank policy powers (D-075): policy rate, reserve requirement, bond purchases, sterilisation bills and
// reserve income. User-directed override of the earlier "OPR is exogenous" rule; the automatic rule remains the default.
import type { GameState } from '../types/game';
import { post } from './government';
import { klDay } from './time';
import { assertSafeMinor, clamp, news, pushBounded, toMinor } from './util';

export const OPR_MIN = 0.0125;
export const OPR_MAX = 0.06;
export const OPR_MPC_STEP = 0.0025; // BNM moves in 25bp steps
export const OPR_MPC_MAX_MOVE = 0.005; // at most two steps at a meeting
export const SRR_MIN = 0.01;
export const SRR_MAX = 0.06;
export const SRR_NEUTRAL = 0.02;
export const QE_MAX_SHARE = 0.08; // BNM bond holdings, share of nominal GDP
export const QE_MAX_ORDER = 20e9; // MYR per order
export const BILLS_MAX_SHARE = 0.5; // share of banks' reserves that can be drained into bills
export const CREDIBILITY_START = 80;
const RESERVE_YIELD_SHARE = 0.5; // reserve portfolio earns half the 10y US Treasury yield (liquid, short-dated)

const qeShare = (s: GameState) => s.centralBank.qeHoldings / Math.max(1, s.indicators.nominalGdpAnnual);
const penalty = (s: GameState) => Math.max(0, CREDIBILITY_START - s.centralBank.credibility);

/** Effects of weak credibility and bond buying on inflation, the 10y yield and the ringgit (log points). */
export function monetaryEffects(s: GameState) {
  const pen = penalty(s), q = qeShare(s);
  return { inflation: 0.00025 * pen + 0.1 * q, yield: 0.0001 * pen - 0.06 * q, fx: 0.0003 * pen + 0.35 * q };
}

/** Player settings: mode, target OPR (moves only at MPC meetings), reserve requirement and the profit remittance. */
export function setMonetaryPolicy(s: GameState, cmd: { mode?: 'auto' | 'manual'; targetOpr?: number; srr?: number; remitShare?: number }, atMin: number): string | null {
  const cb = s.centralBank;
  if (cmd.mode !== undefined && cmd.mode !== 'auto' && cmd.mode !== 'manual') return 'Unknown policy mode.';
  if (cmd.targetOpr !== undefined && !(cmd.targetOpr >= OPR_MIN && cmd.targetOpr <= OPR_MAX)) return `Target OPR must be ${OPR_MIN * 100}%–${OPR_MAX * 100}%.`;
  if (cmd.srr !== undefined && !(cmd.srr >= SRR_MIN && cmd.srr <= SRR_MAX)) return `Reserve requirement must be ${SRR_MIN * 100}%–${SRR_MAX * 100}%.`;
  if (cmd.remitShare !== undefined && !(cmd.remitShare >= 0 && cmd.remitShare <= 1)) return 'Remittance share must be 0–100%.';
  const parts: string[] = [];
  if (cmd.mode !== undefined && cmd.mode !== cb.mode) { cb.mode = cmd.mode; parts.push(cmd.mode === 'manual' ? 'BNM now follows the president’s rate target at MPC meetings' : 'BNM returns to its automatic rule'); }
  if (cmd.targetOpr !== undefined) {
    const t = Math.round(cmd.targetOpr / OPR_MPC_STEP) * OPR_MPC_STEP;
    if (Math.abs(t - cb.targetOpr) > 1e-9) { cb.targetOpr = t; parts.push(`target OPR ${(t * 100).toFixed(2)}%`); }
  }
  if (cmd.srr !== undefined && Math.abs(cmd.srr - cb.srr) > 1e-9) { cb.srr = Math.round(cmd.srr * 1000) / 1000; parts.push(`reserve requirement ${(cb.srr * 100).toFixed(1)}%`); }
  if (cmd.remitShare !== undefined && Math.abs(cmd.remitShare - cb.remitShare) > 1e-9) { cb.remitShare = Math.round(cmd.remitShare * 100) / 100; parts.push(`profit remittance ${(cb.remitShare * 100).toFixed(0)}%`); }
  if (!parts.length) return 'No change to apply.';
  pushBounded(s.policyLog, { atMin, effectiveMin: atMin, label: `Central bank: ${parts.join('; ')}` }, 2000);
  return null;
}

/** Buy (+) or sell (−) government bonds. Lowers yields and weakens the ringgit but does not give the treasury cash. */
export function tradeBonds(s: GameState, amountMYR: number, atMin: number): string | null {
  const cb = s.centralBank;
  if (!Number.isFinite(amountMYR) || amountMYR === 0 || Math.abs(amountMYR) > QE_MAX_ORDER) return 'Enter an amount up to RM20bn per order.';
  const after = cb.qeHoldings + amountMYR;
  if (after < 0) return 'BNM holds fewer bonds than that.';
  if (after > QE_MAX_SHARE * s.indicators.nominalGdpAnnual) return `Holdings are capped at ${QE_MAX_SHARE * 100}% of GDP.`;
  cb.qeHoldings = after;
  pushBounded(s.policyLog, { atMin, effectiveMin: atMin, label: `Central bank ${amountMYR > 0 ? 'bought' : 'sold'} RM${(Math.abs(amountMYR) / 1e9).toFixed(1)}bn of government bonds` }, 2000);
  return null;
}

/** Issue (+) or redeem (−) sterilisation bills: drains bank liquidity into BNM's segregated MYR float. */
export function tradeBills(s: GameState, amountMYR: number, atMin: number): string | null {
  const cb = s.centralBank, b = s.bank;
  if (!Number.isFinite(amountMYR) || amountMYR === 0) return 'Enter an amount.';
  const minor = toMinor(Math.abs(amountMYR));
  if (amountMYR > 0) {
    if (cb.bills / 100 + amountMYR > BILLS_MAX_SHARE * b.reserves + cb.bills / 100) return `Banks can lend BNM at most ${BILLS_MAX_SHARE * 100}% of their reserves.`;
    b.reserves -= amountMYR; cb.bills += minor; cb.myrCash += minor;
  } else {
    if (minor > cb.bills) return 'Fewer bills are outstanding than that.';
    if (minor > cb.myrCash) return 'The MYR float cannot cover that redemption.';
    b.reserves += Math.abs(amountMYR); cb.bills -= minor; cb.myrCash -= minor;
  }
  assertSafeMinor(cb.bills); assertSafeMinor(cb.myrCash);
  pushBounded(s.policyLog, { atMin, effectiveMin: atMin, label: `Central bank ${amountMYR > 0 ? 'issued' : 'redeemed'} RM${(Math.abs(amountMYR) / 1e9).toFixed(1)}bn of BNM bills` }, 2000);
  return null;
}

/** MPC meeting (1st of alternate months): the rate follows the rule, or the player's target in manual mode. */
export function applyMpcDecision(s: GameState, ruleTarget: number): void {
  const e = s.external, cb = s.centralBank;
  const from = e.opr;
  let to = from;
  if (cb.mode === 'manual') {
    const diff = cb.targetOpr - from;
    if (Math.abs(diff) > OPR_MPC_STEP / 2) to = clamp(from + Math.sign(diff) * Math.min(OPR_MPC_MAX_MOVE, Math.round(Math.abs(diff) / OPR_MPC_STEP) * OPR_MPC_STEP), OPR_MIN, OPR_MAX);
    // Credibility: markets forgive modest deviations; large, persistent gaps from what inflation and demand call for erode it.
    const gap = Math.abs(to - ruleTarget);
    cb.credibility = clamp(cb.credibility + (gap <= 0.005 ? 2 : -(gap - 0.005) * 600), 0, 100);
  } else {
    if (Math.abs(ruleTarget - from) > 0.00125) to = clamp(from + Math.sign(ruleTarget - from) * OPR_MPC_STEP, OPR_MIN, OPR_MAX);
    cb.targetOpr = to;
    cb.credibility = Math.min(100, cb.credibility + (CREDIBILITY_START - cb.credibility) * 0.25);
  }
  e.opr = to;
  pushBounded(cb.mpc, { day: klDay(s.clock.hour * 60), from, to, rule: ruleTarget }, 40);
  if (to !== from) news(s, { kind: 'policy', tone: 'neutral', title: `MPC ${to > from ? 'raises' : 'cuts'} OPR to ${(to * 100).toFixed(2)}%`, body: cb.mode === 'manual' ? 'Following the president’s rate target.' : 'Following the automatic rule on inflation and demand.' });
}

/** Month close: reserve income, bill interest and the optional remittance to the treasury. */
export function monthCloseCentralBank(s: GameState): void {
  const cb = s.centralBank, b = s.bank, e = s.external;
  const usdIncome = (cb.usdReserves / 100) * (e.ust10 * RESERVE_YIELD_SHARE) / 12;
  const bondIncome = cb.qeHoldings * s.government.avgDebtRate / 12;
  const billInterest = Math.min(toMinor((cb.bills / 100) * e.opr / 12), Number.MAX_SAFE_INTEGER);
  const gross = toMinor(usdIncome * e.myrPerUsd + bondIncome);
  cb.myrCash += gross;
  const paid = Math.min(billInterest, cb.myrCash);
  cb.myrCash -= paid;
  // Banks receive the bill interest: deposits → capital, as with other interest income.
  b.deposits -= paid / 100; b.capital += paid / 100;
  const net = gross - paid;
  cb.lastIncome = net;
  const remit = Math.min(cb.myrCash, Math.floor(Math.max(0, net) * cb.remitShare));
  if (remit > 0) { cb.myrCash -= remit; post(s.government, 'soeDividend', remit / 100); }
  assertSafeMinor(cb.myrCash);
}
