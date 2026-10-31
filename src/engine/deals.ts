import { periodicDealOffers } from './deal-opportunities';
import { cancelExport, dailyExportContract, offerExport, signExport } from './export-contracts';
import { offerTakeover, signTakeover } from './takeovers';
import { offerRescue, signRescue, liquidateEnterprise, equityPayout } from './rescues';
import { dailyEnterprise, enterpriseAction, signEnterprise, offerEnterprise } from './private-enterprises';
import { offerSupply, signSupply, dailySupply, cancelSupply } from './supply-contracts';
import { dailyConcessions, signConcession, cancelConcession, offerConcession } from './concessions';
import {
  syncInvestmentDeals,
  signInvestment,
  offerInvestment,
  collectInvestmentClaim,
} from './investment-deals';
// Public money is reserved in segregated deal escrow. No promise is booked as income or GDP.
import type { Deal, DealsState } from '../types/deals';
import type { GameState, SectorId } from '../types/game';
import { seedRng } from './rng';
import { post } from './government';
import { assertSafeMinor, pushBounded, toMinor } from './util';

export function initialDeals(seed: number, enabled: boolean, day: number): DealsState {
  return {
    enabled,
    startDay: day,
    lastOfferDay: day,
    rng: seedRng(seed ^ 0x6a31e9),
    nextId: 1,
    items: [],
    journal: [],
  };
}
export function addDeal(
  s: GameState,
  template: string,
  kind: Deal['kind'],
  name: string,
  payer: Deal['payer'],
  cost: number,
  sector: SectorId = 'fin',
): Deal {
  const d: Deal = {
    id: s.deals.nextId++,
    template,
    kind,
    name,
    counterparty: 'Merdeka Advisory (fictional)',
    sector,
    payer,
    status: 'opportunity',
    offeredDay: s.scheduler.lastDay,
    deadline: s.scheduler.lastDay + 30,
    nextDay: -1,
    version: 1,
    rounds: 0,
    priceMinor: toMinor(cost),
    escrowMinor: 0,
    paidMinor: 0,
    committedMinor: 0,
    guaranteeMinor: 0,
    arrearsMinor: 0,
    valueMinor: 0,
    progress: 0,
    lastDay: -1,
    terms: {
      incentive: 0.08,
      localShare: 0.35,
      jobsShare: 1,
      months: 12,
      priceFactor: 1,
      stake: 0.2,
      protection: 0,
    },
    note: 'Review terms and funding before signing.',
    history: [],
  };
  s.deals.items.push(d);
  return d;
}
export function dealLog(s: GameState, d: Deal, text: string): void {
  d.note = text;
  pushBounded(d.history, { day: s.scheduler.lastDay, text }, 50);
}
export function escrowValue(s: GameState, payer?: Deal['payer']): number {
  return (s.deals?.items ?? [])
    .filter((d) => !payer || d.payer === payer)
    .reduce((a, d) => a + d.escrowMinor, 0);
}
export function reserveDeal(s: GameState, d: Deal, minor: number): string | null {
  if (!Number.isSafeInteger(minor) || minor < 0) return 'Unsafe funding amount.';
  const cash =
    d.payer === 'treasury'
      ? s.government.treasury
      : d.payer === 'fund'
        ? s.fund.myrCash
        : toMinor(s.soe.khazanah.cash);
  if (minor > Math.floor(cash)) return 'Insufficient cash. This agreement cannot borrow automatically.';
  assertSafeMinor(d.escrowMinor + minor);
  if (d.payer === 'treasury') post(s.government, 'dealEscrowOut', minor / 100);
  else if (d.payer === 'fund') s.fund.myrCash -= minor;
  else s.soe.khazanah.cash = (toMinor(s.soe.khazanah.cash) - minor) / 100;
  d.escrowMinor += minor;
  pushBounded(s.deals.journal, { dealId: d.id, day: s.scheduler.lastDay, kind: 'reserve', minor }, 500);
  return null;
}
export function releaseDeal(s: GameState, d: Deal): void {
  const minor = d.escrowMinor;
  if (d.payer === 'treasury') post(s.government, 'dealEscrowIn', minor / 100);
  else if (d.payer === 'fund') {
    assertSafeMinor(s.fund.myrCash + minor);
    s.fund.myrCash += minor;
  } else {
    assertSafeMinor(toMinor(s.soe.khazanah.cash) + minor);
    s.soe.khazanah.cash = (toMinor(s.soe.khazanah.cash) + minor) / 100;
  }
  d.escrowMinor = 0;
}
/** Expense paid from treasury escrow; return through the financing line before posting the expense. */
export function spendDeal(s: GameState, d: Deal, minor: number): number {
  const paid = Math.min(d.escrowMinor, minor);
  if (paid <= 0) return 0;
  assertSafeMinor(paid);
  d.escrowMinor -= paid;
  d.paidMinor += paid;
  if (d.payer === 'treasury') {
    post(s.government, 'dealEscrowIn', paid / 100);
    post(s.government, 'policyGrant', paid / 100);
  }
  pushBounded(s.deals.journal, { dealId: d.id, day: s.scheduler.lastDay, kind: 'payment', minor: paid }, 500);
  return paid;
}
export function dealCommand(
  s: GameState,
  id: number,
  action:
    | 'review'
    | 'sign'
    | 'reject'
    | 'cancel'
    | 'collect'
    | 'followOn'
    | 'dilute'
    | 'exit'
    | 'liquidate'
    | 'dividend',
): string | null {
  const d = s.deals.items.find((x) => x.id === id);
  if (!s.deals.enabled || !d) return 'Deal not available.';
  const today = s.scheduler.lastDay;
  if (['opportunity', 'negotiating'].includes(d.status) && today >= d.deadline) return 'Offer expired.';
  if (action === 'liquidate') return liquidateEnterprise(s, d);
  if (action === 'dividend') return equityPayout(s, d);
  if (action === 'followOn' || action === 'dilute' || action === 'exit')
    return enterpriseAction(s, d, action);
  if (action === 'collect' && d.kind === 'investment' && d.status === 'failed')
    return collectInvestmentClaim(s, d);
  if (action === 'review' && d.status === 'opportunity') {
    d.status = 'negotiating';
    dealLog(s, d, 'Due diligence complete. Review the cash cost and counterparty terms.');
    return null;
  }
  if (action === 'reject' && ['opportunity', 'negotiating'].includes(d.status)) {
    d.status = 'rejected';
    if (d.kind === 'investment') {
      const p = s.fdi.pledges.find((p) => p.id === d.pledgeId);
      if (p?.status === 'offered') p.status = 'declined';
    }
    return null;
  }
  if (action === 'cancel' && d.kind === 'supply' && ['agreed', 'active'].includes(d.status)) {
    cancelSupply(s, d);
    return null;
  }
  if (action === 'cancel' && d.kind === 'export' && ['agreed', 'active'].includes(d.status)) {
    cancelExport(s, d);
    return null;
  }
  if (action === 'cancel' && d.kind === 'concession' && ['agreed', 'active'].includes(d.status)) {
    cancelConcession(s, d);
    return null;
  }
  if (action === 'cancel' && d.status === 'agreed') {
    releaseDeal(s, d);
    if (d.kind === 'investment') {
      const p = s.fdi.pledges.find((p) => p.id === d.pledgeId);
      if (p) {
        p.status = 'declined';
        s.fdi.mtd.approved -= p.amount;
      }
    }
    d.committedMinor = 0;
    d.status = 'rejected';
    dealLog(s, d, 'Cancelled before settlement; escrow returned.');
    return null;
  }
  if (action === 'sign' && d.status === 'negotiating') {
    if (d.kind === 'takeover') return signTakeover(s, d);
    if (d.kind === 'rescue') return signRescue(s, d);
    if (d.kind === 'startup') return signEnterprise(s, d);
    if (d.kind === 'supply') return signSupply(s, d);
    if (d.kind === 'concession') return signConcession(s, d);
    if (d.kind === 'investment') return signInvestment(s, d);
    if (d.kind === 'export') return signExport(s, d);
    const err = reserveDeal(s, d, d.priceMinor);
    if (err) return err;
    d.status = 'agreed';
    d.nextDay = today + 1;
    d.committedMinor = d.priceMinor;
    dealLog(s, d, 'Signed. Funds are held in escrow until settlement.');
    return null;
  }
  return 'That action is no longer available.';
}
export function dailyDeals(
  s: GameState,
  day: number,
  purchases: Record<SectorId, number>,
  paidFraction = 1,
): void {
  if (!s.deals.enabled) return;
  syncInvestmentDeals(s);
  periodicDealOffers(s, day);
  for (const d of s.deals.items) {
    if (d.lastDay >= day) continue;
    d.lastDay = day;
    if (['opportunity', 'negotiating'].includes(d.status) && day >= d.deadline) {
      d.status = 'expired';
      dealLog(s, d, 'Offer expired without signature.');
    }
    dailyConcessions(s, d, day, purchases);
    dailySupply(s, d, day, paidFraction);
    dailyExportContract(s, d, day);
    dailyEnterprise(s, d, day, purchases);
    if (d.kind === 'diligence' && d.status === 'agreed' && day >= d.nextDay) {
      const paid = spendDeal(s, d, d.priceMinor);
      purchases.fin += paid / 100;
      d.status = 'completed';
      d.progress = 1;
      d.committedMinor = 0;
      dealLog(s, d, 'Advisory report delivered; fee paid once.');
    }
  }
}
export function offerDeal(s: GameState, id: number, terms: Partial<Deal['terms']>): string | null {
  if (
    !s.deals.enabled ||
    !terms ||
    typeof terms !== 'object' ||
    Object.entries(terms).some(
      ([key, value]) =>
        !['incentive', 'localShare', 'jobsShare', 'months', 'priceFactor', 'stake', 'protection'].includes(
          key,
        ) || !Number.isFinite(value),
    )
  )
    return 'Invalid negotiation terms.';
  const d = s.deals.items.find((d) => d.id === id);
  if (d?.kind === 'takeover') return offerTakeover(s, d, terms);
  if (d?.kind === 'rescue') return offerRescue(s, d, terms);
  if (d?.kind === 'startup') return offerEnterprise(s, d, terms);
  if (d?.kind === 'supply') return offerSupply(s, d, terms);
  if (d?.kind === 'export') return offerExport(s, d, terms);
  return d?.kind === 'concession' ? offerConcession(s, d, terms) : offerInvestment(s, id, terms);
}
export function validateDeals(s: GameState): void {
  const v = s.deals;
  if (
    !v ||
    typeof v.enabled !== 'boolean' ||
    !Array.isArray(v.items) ||
    v.items.length > 200 ||
    !Array.isArray(v.journal) ||
    v.journal.length > 500 ||
    !Number.isSafeInteger(v.nextId) ||
    !Number.isSafeInteger(v.startDay) ||
    !v.rng ||
    !['a', 'b', 'c', 'd'].every((k) => Number.isInteger(v.rng[k as keyof typeof v.rng]))
  )
    throw new Error('Corrupt save: deals');
  assertSafeMinor(escrowValue(s));
  assertSafeMinor(v.items.reduce((a, d) => a + d.valueMinor, 0));
  const ids = new Set<number>();
  for (const d of v.items) {
    if (
      ids.has(d.id) ||
      !Number.isSafeInteger(d.id) ||
      d.id < 1 ||
      d.id >= v.nextId ||
      !['diligence', 'investment', 'concession', 'supply', 'startup', 'rescue', 'takeover', 'export'].includes(
        d.kind,
      ) ||
      ![
        'opportunity',
        'negotiating',
        'agreed',
        'active',
        'completed',
        'rejected',
        'expired',
        'failed',
      ].includes(d.status) ||
      !['treasury', 'fund', 'strategic'].includes(d.payer) ||
      !Number.isSafeInteger(d.deadline) ||
      !Number.isSafeInteger(d.lastDay) ||
      !(d.progress >= 0 && d.progress <= 1) ||
      !d.terms ||
      !Array.isArray(d.history)
    )
      throw new Error('Corrupt save: deal');
    if (
      !s.sectors[d.sector] ||
      !Number.isInteger(d.terms.months) ||
      !(d.terms.months >= 1 && d.terms.months <= 60) ||
      !(d.terms.incentive >= 0 && d.terms.incentive <= 0.5) ||
      !(d.terms.localShare >= 0 && d.terms.localShare <= 1) ||
      !(d.terms.jobsShare >= 0.8 && d.terms.jobsShare <= 1.2) ||
      !(d.terms.priceFactor >= 0.5 && d.terms.priceFactor <= 1.5) ||
      !(d.terms.protection >= 0 && d.terms.protection <= 1) ||
      !(d.terms.stake > 0 && d.terms.stake <= 1)
    )
      throw new Error('Corrupt save: deal terms');
    if (['startup', 'rescue', 'takeover'].includes(d.kind) && !d.enterprise)
      throw new Error('Corrupt save: missing enterprise');
    if (
      d.projectId !== undefined &&
      !s.government.projects.some((p) => p.id === d.projectId && p.concessionDealId === d.id)
    )
      throw new Error('Corrupt save: concession project');
    if (d.enterprise) {
      const e = d.enterprise;
      if (
        !(e.quality >= 0 && e.quality <= 2) ||
        !Number.isSafeInteger(e.openedDay) ||
        !Number.isSafeInteger(e.nextRoundDay)
      )
        throw new Error('Corrupt save: enterprise assumptions');
      if (!(
        e.publicShare >= 0 &&
        e.publicShare <= 1 &&
        e.privateShare >= 0 &&
        e.privateShare <= 1 &&
        Math.abs(e.publicShare + e.privateShare - 1) < 1e-9
      ))
        throw new Error('Corrupt save: enterprise ownership');
      for (const n of [
        e.cashMinor,
        e.capitalMinor,
        e.debtMinor,
        e.payablesMinor,
        e.publicLoanMinor,
        e.revenueAnnualMinor,
        e.costAnnualMinor,
        e.pendingCapexMinor,
        e.buyerCashMinor,
        e.sellerCashMinor,
        e.interestMinor ?? 0,
      ]) {
        assertSafeMinor(n);
        if (n < 0) throw new Error('Corrupt save: enterprise balance');
      }
    }
    ids.add(d.id);
    for (const n of [
      d.priceMinor,
      d.escrowMinor,
      d.paidMinor,
      d.committedMinor,
      d.guaranteeMinor,
      d.arrearsMinor,
      d.valueMinor,
      d.privateCashMinor ?? 0,
      d.claimMinor ?? 0,
      d.assetCostMinor ?? 0,
      d.serviceDailyMinor ?? 0,
      d.investedMinor ?? 0,
      d.penaltyMinor ?? 0,
    ]) {
      assertSafeMinor(n);
      if (n < 0) throw new Error('Corrupt save: deal balance');
    }
  }
}
