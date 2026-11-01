import { closeTakeover, takeoverReview } from './takeovers';
import { khazanahNav } from './soe';
import { closeRescue, rescuePayments, liquidateEnterprise } from './rescues';
import type { GameState, SectorId } from '../types/game';
import type { Deal } from '../types/deals';
import { addDeal, dealLog, reserveDeal, DEAL_ROUNDS } from './deals';
import { capacitySlot } from '../data/boom';
import { calibrationFor } from './calibration';
import { navMYR } from './sovereign-fund';
import { rand } from './rng';
import { flavourScale, kindRound, startupFlavour } from './deal-flavour';
import { assertSafeMinor, pushBounded, toMinor } from './util';

export function privateValue(s: GameState, payer: Deal['payer']): number {
  return (s.deals?.items ?? []).filter((d) => d.payer === payer).reduce((a, d) => a + d.valueMinor, 0);
}
export function enterpriseOffers(s: GameState): void {
  if (!s.deals.enabled) return;
  // D-116: the start-up, its archetype and its size come from the campaign seed; the stake, fee and caps are unchanged.
  const round = kindRound(s, 'startup'), f = startupFlavour(s, round), k = flavourScale(s, `startup:${round}`, 0.3);
  const d = addDeal(s, 'startup:awan', 'startup', `${f.name}: ${f.kind}`, 'fund', 80e6 * k * 0.2525, f.sector);
  d.counterparty = `${f.founders} (fictional)`;
  d.assetCostMinor = toMinor(80e6 * k);
  d.terms.stake = 0.2;
  d.enterprise = {
    cashMinor: toMinor(4e6 * k),
    capitalMinor: toMinor(76e6 * k),
    debtMinor: 0,
    payablesMinor: 0,
    publicShare: 0,
    privateShare: 1,
    publicLoanMinor: 0,
    revenueAnnualMinor: toMinor(12e6 * k),
    costAnnualMinor: toMinor(18e6 * k),
    pendingCapexMinor: 0,
    openedDay: -1,
    nextRoundDay: -1,
    roundDone: false,
    quality: 0.4 + rand(s.deals.rng) * 0.8,
    unpaidDays: 0,
    buyerCashMinor: toMinor(200e6),
    sellerCashMinor: 0,
  };
  d.note =
    `${f.note} Fictional and simulated. ` +
    'Minority primary equity; company receives investment cash. 1% entry fee. Follow-on round after six months; loss and dilution are possible. Private holdings are capped at 10% of SWF NAV.';
}
export function offerEnterprise(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || s.scheduler.lastDay >= d.deadline || d.rounds >= DEAL_ROUNDS)
    return 'Negotiation is closed.';
  const t = { ...d.terms, ...terms };
  if (!(t.stake >= 0.1 && t.stake <= 0.4)) return 'Startup ownership must be 10–40%.';
  d.terms = t;
  d.priceMinor = toMinor(((((d.assetCostMinor ?? 0) / 100) * t.stake) / (1 - t.stake)) * 1.01);
  d.rounds++;
  d.version++;
  dealLog(
    s,
    d,
    'Founders accept minority equity at the displayed pre-money book valuation; investment is primary cash, not a payment to founders.',
  );
  return null;
}
export function signEnterprise(s: GameState, d: Deal): string | null {
  const exposure = s.deals.items
    .filter((x) => x.payer === d.payer)
    .reduce((a, x) => a + x.valueMinor + x.escrowMinor, 0);
  if (d.payer === 'strategic' && exposure + d.priceMinor > (khazanahNav(s) * 100 + exposure) * 0.1)
    return 'Strategic mandate is limited to 10% of Khazanah capital, including deal assets.';
  if (d.payer === 'fund' && exposure + d.priceMinor > navMYR(s) * 100 * 0.1)
    return 'Private-investment budget is 10% of SWF NAV.';
  const err = reserveDeal(s, d, d.priceMinor);
  if (err) return err;
  d.status = 'agreed';
  d.nextDay = s.scheduler.lastDay + 1;
  d.committedMinor = d.priceMinor;
  dealLog(s, d, 'Signed; ownership transfers only on closing.');
  return null;
}
function fundRecord(s: GameState, minor: number, note: string): void {
  pushBounded(
    s.fund.tx,
    {
      id: s.fund.nextId++,
      atMin: s.clock.hour * 60,
      type: 'private',
      currency: 'MYR',
      amountMinor: minor,
      note,
    },
    400,
  );
}
export function markValue(d: Deal): void {
  const e = d.enterprise!;
  const equity = Math.max(
    0,
    e.cashMinor + e.capitalMinor - e.debtMinor - e.publicLoanMinor - e.payablesMinor,
  );
  d.valueMinor =
    Math.round(e.publicShare * equity) +
    Math.min(e.publicLoanMinor, e.cashMinor + Math.round(e.capitalMinor * 0.4));
}
export function closeEnterprise(s: GameState, d: Deal, day: number): void {
  const e = d.enterprise!,
    cost = d.escrowMinor,
    investment = Math.round(cost / 1.01),
    fee = cost - investment;
  d.escrowMinor = 0;
  d.paidMinor += cost;
  d.investedMinor = cost;
  d.committedMinor = 0;
  e.cashMinor += investment;
  e.pendingCapexMinor = Math.round(investment * 0.6);
  e.publicShare = d.terms.stake;
  e.privateShare = 1 - e.publicShare;
  e.openedDay = day;
  e.nextRoundDay = day + 183;
  d.status = 'active';
  d.progress = 0;
  if (d.payer === 'fund') {
    fundRecord(s, -cost, `${d.name}: primary equity and closing fee`);
    s.fund.feesPaidMYR += fee / 100;
  }
  markValue(d);
  dealLog(s, d, 'Closed. Equity ownership issued once; cash runway and milestones now determine outcomes.');
}
export function enterpriseAction(
  s: GameState,
  d: Deal,
  action: 'followOn' | 'dilute' | 'exit',
): string | null {
  const e = d.enterprise;
  if (!e || !['startup', 'takeover'].includes(d.kind) || d.status !== 'active')
    return 'No active private holding.';
  if (action === 'exit') {
    if (s.scheduler.lastDay < e.openedDay + 183)
      return 'No outside buyer before the six-month operating review.';
    const assets = Math.max(
      0,
      e.cashMinor + e.capitalMinor - e.debtMinor - e.payablesMinor - e.publicLoanMinor,
    );
    const price = Math.min(e.buyerCashMinor, Math.round(assets * e.publicShare * 1.02));
    if (price <= 0) return 'No positive equity bid; the enterprise needs restructuring.';
    e.buyerCashMinor -= price;
    if (d.payer === 'fund') {
      assertSafeMinor(s.fund.myrCash + price);
      s.fund.myrCash += price;
      const gain = price - (d.investedMinor ?? 0);
      s.fund.realized.MYR += gain;
      s.fund.realizedMYR += gain;
      fundRecord(s, price, `${d.name}: private exit`);
    } else s.soe.khazanah.cash += price / 100;
    e.publicShare = 0;
    e.privateShare = 1;
    d.valueMinor = 0;
    d.status = 'completed';
    dealLog(s, d, 'Outside buyer paid for the public stake. Proceeds are cash; the sale itself is not GDP.');
    return null;
  }
  if (e.roundDone || s.scheduler.lastDay < e.nextRoundDay) return 'No follow-on round is open.';
  const newMoney = toMinor(20e6),
    equity = Math.max(1, e.cashMinor + e.capitalMinor - e.debtMinor - e.payablesMinor);
  const preMoney = Math.round(equity * 0.7),
    publicCash = action === 'followOn' ? Math.round(newMoney * e.publicShare) : 0;
  if (publicCash > s.fund.myrCash) return 'Insufficient SWF cash for the follow-on allocation.';
  if (action === 'followOn' && privateValue(s, 'fund') + publicCash > navMYR(s) * 100 * 0.1)
    return 'Follow-on would exceed the 10% private-investment budget.';
  s.fund.myrCash -= publicCash;
  d.investedMinor = (d.investedMinor ?? 0) + publicCash;
  d.paidMinor += publicCash;
  e.publicShare = (e.publicShare * preMoney + publicCash) / (preMoney + newMoney);
  e.privateShare = 1 - e.publicShare;
  e.cashMinor += newMoney;
  e.pendingCapexMinor += Math.round(newMoney * 0.3);
  e.roundDone = true;
  if (publicCash) fundRecord(s, -publicCash, `${d.name}: follow-on round`);
  markValue(d);
  dealLog(
    s,
    d,
    publicCash
      ? 'Joined the down round; ownership maintained while new capital funds delivery.'
      : 'Outside investors funded the round; the public stake was diluted at a 30% discount.',
  );
  return null;
}
export function dailyEnterprise(
  s: GameState,
  d: Deal,
  day: number,
  purchases: Record<SectorId, number>,
): void {
  if (!['startup', 'rescue', 'takeover'].includes(d.kind) || !d.enterprise) return;
  if (d.status === 'agreed' && day >= d.nextDay) {
    if (d.kind === 'rescue') closeRescue(s, d, day);
    else if (d.kind === 'takeover') closeTakeover(s, d, day);
    else closeEnterprise(s, d, day);
  }
  if (d.status !== 'active') return;
  takeoverReview(s, d, day);
  const e = d.enterprise,
    cal = calibrationFor(s);
  if (!e.roundDone && day > e.nextRoundDay + 30) enterpriseAction(s, d, 'dilute');
  const capex = Math.min(e.pendingCapexMinor, e.cashMinor, Math.round(((d.investedMinor ?? 0) * 0.6) / 183));
  e.pendingCapexMinor -= capex;
  e.cashMinor -= capex;
  e.capitalMinor += Math.round(capex * 0.8);
  e.retainedMinor = (e.retainedMinor ?? 0) - (capex - Math.round(capex * 0.8));
  if (capex) {
    purchases.tech += (capex / 100) * 0.7;
    purchases.ind += (capex / 100) * 0.3;
    s.sectors[d.sector].capital += (capex / 100) * 0.8;
    s.sectors[d.sector].pipeline[capacitySlot(s)] += ((capex / 100) * 0.8) / cal.capitalPerCap[d.sector];
  }
  // This company is a sample within sector sales: operating sales/costs are not added to GDP again.
  const maturity = d.kind === 'startup' ? Math.min(2, 0.5 + (day - e.openedDay) / 365) : 1;
  const revenue = Math.round(
    ((e.revenueAnnualMinor / 365) * maturity * e.quality * s.sectors[d.sector].output) / cal.Y0[d.sector],
  );
  const cost = Math.round(
    (e.costAnnualMinor / 365) *
      (0.6 * s.households.wageIndex + 0.4 * s.sectors[d.sector].price) *
      (d.kind === 'takeover' && !d.integrationDone ? 1.05 : 1),
  );
  e.retainedMinor = (e.retainedMinor ?? 0) + revenue - cost;
  const available = e.cashMinor + revenue,
    paid = Math.min(cost + e.payablesMinor, available);
  e.cashMinor = available - paid;
  e.payablesMinor = e.payablesMinor + cost - paid;
  const depreciation = Math.round((e.capitalMinor * 0.04) / 365);
  e.capitalMinor = Math.max(0, e.capitalMinor - depreciation);
  e.retainedMinor = (e.retainedMinor ?? 0) - depreciation;
  e.unpaidDays = e.payablesMinor > 0 ? e.unpaidDays + 1 : 0;
  d.progress = Math.min(1, (day - e.openedDay) / 365);
  if (d.kind === 'rescue') rescuePayments(s, d, day);
  if (d.status !== 'active') return;
  if (e.unpaidDays >= 60 && d.kind !== 'startup') {
    liquidateEnterprise(s, d);
    return;
  }
  if (e.unpaidDays >= 60) {
    d.status = 'failed';
    d.valueMinor = 0;
    e.publicShare = 0;
    e.privateShare = 1;
    dealLog(
      s,
      d,
      'Runway exhausted. Equity written off; shareholders cannot withdraw fictional future profits.',
    );
    return;
  }
  markValue(d);
}
