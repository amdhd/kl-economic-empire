import { baselineFor, trendFor } from '../data/economic-baseline';
// Aggregate KL banking system, reduced form. Balance-sheet identity (tested):
//   reserves + loansH + loansF = deposits + capital
// New loans create deposits, repayments destroy them, interest received moves deposits → capital,
// interest/opex/dividends paid move capital → deposits, defaults reduce loans and capital.
import type { GameState } from '../types/game';
import type { AggregatedMods } from './external';
import { clamp } from './util';

export const BASE_NPL = 0.0012; // monthly default rate at baseline
const DEPOSIT_SPREAD = 0.01;
const OPEX_RATE = 0.008;

export function bankIdentityGap(s: GameState): number {
  const b = s.bank;
  return b.reserves + s.centralBank.bills / 100 + b.loansH + b.loansF - b.deposits - b.capital;
}

export function monthCloseBank(s: GameState, mods: AggregatedMods, unemployment: number): void {
  const BASE_LEND_RATE = baselineFor(s).opr + 0.02;
  const b = s.bank;
  const loans = b.loansH + b.loansF;
  const interestF = (b.loansF * b.lendingRate) / 12;
  const interestH = b.mtdInterestH;
  b.mtdInterestH = 0;
  const depCost = (b.deposits * b.depositRate) / 12;
  const opex = (loans * OPEX_RATE) / 12;

  b.nplRate = clamp(BASE_NPL + 0.015 * (unemployment - trendFor(s).naturalUnemployment) + 0.012 * (b.lendingRate - BASE_LEND_RATE) + 0.002 * (1 - mods.creditWillingness), 0.0004, 0.02);
  const defaults = b.nplRate * loans;
  const dH = defaults * (b.loansH / loans);

  b.deposits += -(interestF + interestH) + depCost + opex;
  b.capital += interestF + interestH - depCost - opex;
  b.loansH -= dH;
  b.loansF -= defaults - dH;
  b.capital -= defaults;
  const profit = interestF + interestH - depCost - opex - defaults;
  const dividend = Math.max(0, profit) * 0.5;
  b.capital -= dividend;
  b.deposits += dividend;
  b.lastProfit = profit;
  b.mtdDefaults = defaults;
  s.households.loans = b.loansH;

  const capitalRatio = b.capital / Math.max(b.loansH + b.loansF, 1);
  b.depositRate = Math.max(0.0025, s.external.opr - DEPOSIT_SPREAD);
  // Tighter liquidity (higher reserve requirement, bills issued to drain reserves) raises loan rates and cuts willingness (D-075).
  const billsShare = s.centralBank.bills / 100 / Math.max(1, loans);
  const liquidity = 3 * (s.centralBank.srr - 0.02) + 2 * billsShare;
  b.lendingRate = clamp(s.external.opr + 0.02 + liquidity + mods.creditSpread + 1.5 * (b.nplRate - BASE_NPL) + 2 * Math.max(0, 0.12 - capitalRatio), 0.02, 0.15);
  b.willingness = clamp(0.9 * mods.creditWillingness - 25 * Math.max(0, b.nplRate - BASE_NPL) - 3 * Math.max(0, 0.115 - capitalRatio), 0.1, 1);
}
