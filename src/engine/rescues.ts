import type { GameState } from '../types/game';
import type { Deal, PrivateEnterprise } from '../types/deals';
import { addDeal, dealLog, releaseDeal } from './deals';
import { signEnterprise, markValue } from './private-enterprises';
import { toMinor, assertSafeMinor } from './util';
import { klDay, klDayStartMin, klParts, klToEpochMin, daysInMonth } from './time';

export function nextMonthDay(day: number): number {
  const p = klParts(klDayStartMin(day));
  const month = p.month === 12 ? 1 : p.month + 1,
    year = p.year + (p.month === 12 ? 1 : 0);
  return klDay(klToEpochMin(year, month, Math.min(p.day, daysInMonth(year, month))));
}
export function rescueOffers(s: GameState): void {
  if (!s.deals.enabled) return;
  for (const insolvent of [false, true]) {
    const d = addDeal(
      s,
      insolvent ? 'rescue:textiles' : 'rescue:clinics',
      'rescue',
      insolvent ? 'Lestari Textiles: restructuring' : 'Cahaya Clinics: working-capital rescue',
      'strategic',
      insolvent ? 80.8e6 : 20.2e6,
      insolvent ? 'ind' : 'health',
    );
    d.counterparty = insolvent
      ? 'Lestari Textiles creditors (fictional)'
      : 'Cahaya Clinics creditors (fictional)';
    d.terms.protection = insolvent ? 0 : 1;
    d.terms.stake = 0.8;
    d.terms.incentive = insolvent ? 0.5 : 0;
    d.terms.months = 12;
    d.enterprise = {
      cashMinor: toMinor(0.5e6),
      capitalMinor: toMinor(insolvent ? 50e6 : 150e6),
      debtMinor: toMinor(100e6),
      payablesMinor: 0,
      publicShare: 0,
      privateShare: 1,
      publicLoanMinor: 0,
      revenueAnnualMinor: toMinor(insolvent ? 180e6 : 240e6),
      costAnnualMinor: toMinor(insolvent ? 175e6 : 200e6),
      pendingCapexMinor: 0,
      openedDay: -1,
      nextRoundDay: -1,
      roundDone: true,
      quality: 1,
      unpaidDays: 0,
      buyerCashMinor: toMinor(200e6),
      sellerCashMinor: 0,
    };
    d.note = insolvent
      ? 'Negative net assets. Needs creditor consent and recapitalisation; a loan alone is rejected. Recap carries an immediate public loss.'
      : 'Positive net assets but little cash. A senior secured loan can bridge operations; half is held until a 90-day review.';
  }
}
export function offerRescue(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || d.rounds >= 3 || s.scheduler.lastDay >= d.deadline)
    return 'Negotiation is closed.';
  const t = { ...d.terms, ...terms };
  if (!(
    [0, 1].includes(t.protection) &&
    t.incentive >= 0 &&
    t.incentive <= 0.5 &&
    Number.isInteger(t.months) &&
    t.months >= 6 &&
    t.months <= 36 &&
    t.stake >= 0.1 &&
    t.stake <= 1
  ))
    return 'Choose loan (1) or equity (0), a 0–50% haircut, 6–36 months and a 10–100% equity stake.';
  d.terms = t;
  d.rounds++;
  d.version++;
  dealLog(
    s,
    d,
    'Rescue terms revised. Creditor liquidation recovery and enterprise solvency are checked at signature.',
  );
  return null;
}
export function signRescue(s: GameState, d: Deal): string | null {
  const e = d.enterprise!,
    assets = e.cashMinor + e.capitalMinor,
    net = assets - e.debtMinor - e.payablesMinor;
  if (d.terms.protection === 1 && (net <= 0 || e.capitalMinor * 0.4 < d.priceMinor / 1.01))
    return 'A loan cannot cure insolvency or exceed the secured liquidation value.';
  const retained = e.debtMinor * (1 - d.terms.incentive),
    liquidation = Math.min(e.debtMinor, assets * 0.4);
  if (retained < liquidation) return 'Creditors reject this haircut: liquidation would pay them more.';
  if (d.terms.protection === 0 && assets - retained + (d.priceMinor / 1.01) * 0.5 <= 0)
    return 'The first tranche would leave the enterprise insolvent.';
  if (
    d.terms.protection === 0 &&
    d.terms.stake >
      d.priceMinor / 1.01 / (Math.max(0, assets - retained - e.payablesMinor) + d.priceMinor / 1.01)
  )
    return 'Shareholders reject dilution below their post-restructuring book interest. Lower the public stake.';
  return signEnterprise(s, d);
}
function applyTranche(s: GameState, d: Deal, minor: number): void {
  const e = d.enterprise!;
  d.escrowMinor -= minor;
  d.paidMinor += minor;
  d.committedMinor = Math.max(0, d.committedMinor - minor);
  e.cashMinor += minor;
  e.pendingCapexMinor += Math.round(minor * 0.2);
  if (d.terms.protection === 1) e.publicLoanMinor += minor;
  else {
    e.publicShare =
      (d.terms.stake * (d.paidMinor - (d.closingFeeMinor ?? 0))) /
      Math.max(1, (d.investedMinor ?? 0) - (d.closingFeeMinor ?? 0));
    e.privateShare = 1 - e.publicShare;
  }
  markValue(d);
  dealLog(
    s,
    d,
    `Rescue tranche released: RM${(minor / 100 / 1e6).toFixed(1)}m; matching enterprise cash and public claim recorded.`,
  );
}
export function closeRescue(s: GameState, d: Deal, day: number): void {
  const e = d.enterprise!,
    principal = Math.round(d.priceMinor / 1.01),
    fee = d.priceMinor - principal;
  d.closingFeeMinor = fee;
  d.escrowMinor -= fee;
  d.paidMinor += fee;
  d.investedMinor = d.priceMinor;
  e.debtMinor = Math.round(e.debtMinor * (1 - d.terms.incentive));
  e.openedDay = day;
  e.nextPaymentDay = nextMonthDay(day);
  e.interestMinor = 0;
  d.trancheDay = day + 90;
  d.status = 'active';
  applyTranche(s, d, Math.round(principal / 2));
}
export function liquidateEnterprise(s: GameState, d: Deal): string | null {
  const e = d.enterprise;
  if (!e || !['active', 'failed'].includes(d.status)) return 'No enterprise can be liquidated.';
  const sale = Math.min(e.buyerCashMinor, Math.round(e.capitalMinor * 0.4));
  e.buyerCashMinor -= sale;
  const cash = e.cashMinor + sale;
  const loanRecovery = Math.min(e.publicLoanMinor, cash),
    remaining = cash - loanRecovery;
  const privateDebtPaid = Math.min(e.debtMinor + e.payablesMinor, remaining),
    equity = Math.max(0, remaining - privateDebtPaid);
  const recovery = loanRecovery + Math.round(equity * e.publicShare);
  assertSafeMinor(recovery);
  s.soe.khazanah.cash += recovery / 100;
  d.receivedMinor = (d.receivedMinor ?? 0) + recovery;
  releaseDeal(s, d);
  d.valueMinor = 0;
  d.committedMinor = 0;
  d.status = 'failed';
  e.cashMinor = 0;
  e.capitalMinor = 0;
  e.publicLoanMinor = 0;
  e.publicShare = 0;
  e.privateShare = 1;
  e.debtMinor = Math.max(0, e.debtMinor + e.payablesMinor - privateDebtPaid);
  e.payablesMinor = 0;
  dealLog(
    s,
    d,
    'Liquidated at 40% capital recovery, bounded by buyer cash. Senior public loan paid before residual shareholders; unrecovered public claims written off.',
  );
  return null;
}
export function rescuePayments(s: GameState, d: Deal, day: number): void {
  const e = d.enterprise!;
  if (d.escrowMinor > 0 && day >= (d.trancheDay ?? Infinity)) {
    if (e.payablesMinor === 0 && e.cashMinor > 0) applyTranche(s, d, d.escrowMinor);
    else {
      releaseDeal(s, d);
      d.committedMinor = 0;
      dealLog(s, d, 'Second tranche withheld after failed liquidity review. Remaining escrow returned.');
    }
  }
  if (e.publicLoanMinor > 0) {
    e.interestMinor = (e.interestMinor ?? 0) + Math.round((e.publicLoanMinor * 0.08) / 365);
    if (day >= (e.nextPaymentDay ?? Infinity)) {
      const interest = Math.min(e.cashMinor, e.interestMinor ?? 0);
      e.cashMinor -= interest;
      e.interestMinor! -= interest;
      e.retainedMinor = (e.retainedMinor ?? 0) - interest;
      const due = Math.min(e.publicLoanMinor, Math.round((d.investedMinor ?? 0) / 1.01 / d.terms.months)),
        principal = Math.min(e.cashMinor, due);
      e.cashMinor -= principal;
      e.publicLoanMinor -= principal;
      s.soe.khazanah.cash += (interest + principal) / 100;
      d.receivedMinor = (d.receivedMinor ?? 0) + interest + principal;
      e.missedPayments = principal < due || e.interestMinor > 0 ? (e.missedPayments ?? 0) + 1 : 0;
      e.nextPaymentDay = nextMonthDay(day);
      if (e.missedPayments >= 2) {
        liquidateEnterprise(s, d);
        return;
      }
    }
  }
  markValue(d);
  if (d.terms.protection === 1 && !e.publicLoanMinor && !d.escrowMinor) {
    d.status = 'completed';
    d.valueMinor = 0;
    dealLog(
      s,
      d,
      'Secured rescue loan repaid. Interest is realised cash income; principal repayment is an asset exchange.',
    );
  }
}
export function equityPayout(s: GameState, d: Deal): string | null {
  const e: PrivateEnterprise | undefined = d.enterprise;
  if (!e || d.payer !== 'strategic' || d.status !== 'active' || e.publicShare <= 0)
    return 'No operating public equity holding.';
  const distributable = Math.min(e.cashMinor, Math.max(0, e.retainedMinor ?? 0));
  if (distributable <= 0) return 'No earned cash profit is available for distribution.';
  const cash = Math.round(distributable * 0.5),
    publicCash = Math.round(cash * e.publicShare);
  e.cashMinor -= cash;
  e.retainedMinor = (e.retainedMinor ?? 0) - cash;
  s.soe.khazanah.cash += publicCash / 100;
  d.receivedMinor = (d.receivedMinor ?? 0) + publicCash;
  markValue(d);
  dealLog(
    s,
    d,
    'Distributed half of earned cash profits to shareholders. Public cash and enterprise equity are revalued together.',
  );
  return null;
}
