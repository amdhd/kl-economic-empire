import type { GameState, FdiPledge, SectorId } from '../types/game';
import type { Deal } from '../types/deals';
import { FDI_KINDS, investorName } from './fdi';
import { addDeal, dealLog, releaseDeal, reserveDeal, spendDeal, DEAL_ROUNDS } from './deals';
import { BOOM, boomOn } from '../data/boom';
import { assertSafeMinor, clamp, toMinor } from './util';

export function syncInvestmentDeals(s: GameState): void {
  if (!s.deals.enabled || !s.fdi.enabled) return;
  for (const p of s.fdi.pledges) {
    let d = s.deals.items.find((d) => d.pledgeId === p.id);
    if (
      !d &&
      p.status === 'offered' &&
      ['hq', 'renewables', 'datacentre'].includes(p.kind) &&
      s.deals.items.length < 180
    ) {
      d = addDeal(s, `fdi:${p.id}`, 'investment', p.title, 'treasury', p.amount * p.ask, p.sector);
      d.pledgeId = p.id;
      d.counterparty = `${investorName(p.investor)} · fictional proposal`;
      d.deadline = p.decideByDay;
      d.terms.incentive = p.ask;
      d.terms.localShare = FDI_KINDS[p.kind].domesticShare;
      d.terms.months = p.buildMonths;
    }
    if (d && ['opportunity', 'negotiating'].includes(d.status) && p.status !== 'offered') {
      d.status = p.status === 'building' || p.status === 'operating' ? 'completed' : 'expired';
      dealLog(
        s,
        d,
        'Resolved through the existing standard FDI route; its original funding and delivery rules apply.',
      );
    }
  }
}
export function investorAsk(s: GameState, d: Deal): number {
  const p = s.fdi.pledges.find((p) => p.id === d.pledgeId)!;
  // Looser investors (D-086): in the Deal Room they settle for 15% less grant than they first ask; in Boom mode (D-095) for far less.
  return clamp(
    (boomOn(s) ? BOOM.investorAskScale : 0.85) *
      (p.ask +
        0.2 * (d.terms.localShare - FDI_KINDS[p.kind].domesticShare) +
        0.03 * (d.terms.jobsShare - 1) +
        0.02 * (p.buildMonths / d.terms.months - 1)),
    0,
    0.3,
  );
}
export function offerInvestment(s: GameState, id: number, terms: Partial<Deal['terms']>): string | null {
  const d = s.deals.items.find((d) => d.id === id);
  if (!d || d.kind !== 'investment' || d.status !== 'negotiating' || s.scheduler.lastDay >= d.deadline)
    return 'This investment is not open for negotiation.';
  const next = { ...d.terms, ...terms };
  if (!(
    next.incentive >= 0 &&
    next.incentive <= 0.3 &&
    next.localShare >= 0.2 &&
    next.localShare <= 0.8 &&
    next.jobsShare >= 0.8 &&
    next.jobsShare <= 1.2 &&
    Number.isInteger(next.months) &&
    next.months >= (boomOn(s) ? 1 : 6) &&
    next.months <= 36
  ))
    return 'Choose valid incentive, sourcing, training and delivery terms.';
  if (d.rounds >= DEAL_ROUNDS) return 'All negotiation rounds have been used. Accept the counteroffer or decline.';
  d.terms = next;
  d.rounds++;
  d.version++;
  const ask = investorAsk(s, d),
    p = s.fdi.pledges.find((p) => p.id === d.pledgeId)!;
  if (next.incentive + 1e-9 < ask) {
    d.terms.incentive = Math.ceil(ask * 1000) / 1000;
    dealLog(
      s,
      d,
      `Counteroffer: ${(d.terms.incentive * 100).toFixed(1)}% grant for these obligations. The fictional alternative location offers simpler terms. Accept this version or use another round.`,
    );
  } else
    dealLog(s, d, 'Investor accepts these terms in principle. Funding and signature are still required.');
  d.priceMinor = toMinor(p.amount * d.terms.incentive);
  return null;
}
export function signInvestment(s: GameState, d: Deal): string | null {
  const p = s.fdi.pledges.find((p) => p.id === d.pledgeId);
  if (!p || p.status !== 'offered') return 'The investor is no longer available.';
  if (d.terms.incentive + 1e-9 < investorAsk(s, d))
    return 'The investor prefers its alternative location. Negotiate a counteroffer.';
  const err = reserveDeal(s, d, d.priceMinor);
  if (err) return err;
  p.status = 'building';
  p.incentive = d.terms.incentive;
  p.startDay = s.scheduler.lastDay + 1;
  p.buildMonths = d.terms.months;
  d.status = 'agreed';
  d.nextDay = p.startDay;
  d.committedMinor = d.priceMinor;
  d.privateCashMinor = toMinor(p.amount); // external investor prefunds the project; grants reimburse milestones
  s.fdi.mtd.approved += p.amount;
  dealLog(
    s,
    d,
    'Signed. Grant released at 25/50/75/100% verified build milestones; no grant is paid twice. Deadline includes a 90-day delivery buffer.',
  );
  return null;
}
export function negotiatedBuild(
  s: GameState,
  p: FdiPledge,
  purchases: Record<SectorId, number>,
): number | null {
  const d = s.deals?.items.find(
    (d) =>
      d.kind === 'investment' && d.pledgeId === p.id && ['agreed', 'active', 'failed'].includes(d.status),
  );
  if (!d) return null;
  const day = s.scheduler.lastDay; // scheduler still points to the day being settled
  if (d.status === 'failed' || day < d.nextDay || (d.fdiDay ?? -1) >= day) return 0;
  d.fdiDay = day;
  d.status = 'active';
  const duration = Math.ceil((d.terms.months * 365) / 12);
  if (day > p.startDay + duration + 90 && p.spent < p.amount - 1) {
    d.status = 'failed';
    p.status = 'withdrawn';
    d.claimMinor = Math.round(d.paidMinor * 0.25);
    releaseDeal(s, d);
    d.committedMinor = 0;
    dealLog(
      s,
      d,
      'Delivery deadline missed. Unpaid grant cancelled; 25% of paid support is a clawback claim, valued at zero until recovered.',
    );
    return 0;
  }
  const readiness = clamp(1 - 0.25 * Math.max(0, s.sectors.util.price - 1), 0.4, 1);
  const amount = Math.min(
    p.amount - p.spent,
    (p.amount / duration) * readiness,
    (d.privateCashMinor ?? 0) / 100,
  );
  if (amount <= 0) return 0;
  p.spent += amount;
  d.privateCashMinor! -= toMinor(amount);
  s.fdi.mtd.realised += amount;
  const domestic = amount * d.terms.localShare;
  const training = (domestic * 0.02 * (d.terms.jobsShare - 0.8)) / 0.4;
  purchases.health += training;
  purchases.prop += (domestic - training) * 0.6;
  purchases.ind += (domestic - training) * 0.2;
  purchases.tech += (domestic - training) * 0.2;
  d.progress = p.spent / p.amount;
  const stage = p.spent >= p.amount - 1 ? 4 : Math.floor(d.progress * 4);
  const due = Math.max(0, Math.round((d.priceMinor * stage) / 4) - d.paidMinor);
  const grant = spendDeal(s, d, due);
  d.privateCashMinor! += grant;
  d.committedMinor = d.priceMinor - d.paidMinor;
  s.fdi.mtd.grants += grant / 100;
  s.policy.mtd.fdiGrants += grant / 100;
  s.centralBank.pressure = clamp(
    s.centralBank.pressure - (0.003 * domestic) / s.external.myrPerUsd / 1e9,
    -0.08,
    0.08,
  );
  if (stage === 4) {
    p.status = 'operating';
    d.status = 'completed';
    d.committedMinor = 0;
    dealLog(
      s,
      d,
      'Build milestones delivered. Operating export demand enters through the existing sector model; jobs remain capacity-dependent, not free added employment.',
    );
  }
  return amount - domestic;
}
export function collectInvestmentClaim(s: GameState, d: Deal): string | null {
  const paid = Math.min(d.claimMinor ?? 0, d.privateCashMinor ?? 0);
  if (!paid) return 'No collectible counterparty cash is available.';
  d.privateCashMinor! -= paid;
  d.claimMinor! -= paid;
  // Recovery offsets the original grant expenditure, including a negative current-period expense when necessary.
  assertSafeMinor(s.government.treasury + paid);
  s.government.treasury += paid;
  s.government.mtd.policyGrant -= paid / 100;
  s.government.ledger.push({ kind: 'policyGrant', amountMinor: paid, balanceMinor: s.government.treasury });
  dealLog(
    s,
    d,
    'Clawback collected from the fictional investor’s remaining cash. Uncollected claims remain outside public wealth.',
  );
  return null;
}
