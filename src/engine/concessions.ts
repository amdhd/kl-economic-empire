import type { GameState, SectorId } from '../types/game';
import type { Deal } from '../types/deals';
import { PROJECT_BY_ID } from '../data/projects';
import { addDeal, dealLog, releaseDeal, reserveDeal, spendDeal, DEAL_ROUNDS } from './deals';
import { completeProject, post } from './government';
import { boomOn, projectBuildDays } from '../data/boom';
import { toMinor } from './util';

export function concessionOffers(s: GameState): void {
  if (!s.deals.enabled) return;
  for (const [i, template] of ['fibre', 'clinics'].entries()) {
    const t = PROJECT_BY_ID[template],
      d = addDeal(
        s,
        `concession:${template}`,
        'concession',
        `${t.name} concession`,
        'treasury',
        t.cost * 0.2,
        template === 'fibre' ? 'tech' : 'health',
      );
    d.counterparty = i ? 'Cahaya Care Consortium (fictional)' : 'Nusa Connect Consortium (fictional)';
    d.terms.incentive = 0.2;
    d.terms.months = 36;
    d.terms.protection = 0.1;
    d.assetCostMinor = toMinor(t.cost);
    d.note =
      'Compare with direct public funding in Projects. Private ownership; public support is an expense, not a public asset.';
  }
}
export function concessionQuote(d: Deal) {
  const cost = d.assetCostMinor ?? 0,
    years = d.terms.months / 12;
  const userAnnual = cost * 0.04 * d.terms.priceFactor;
  const serviceAnnual = Math.max(
    cost * 0.01,
    ((cost * (1 - d.terms.incentive)) / years + cost * 0.06 - userAnnual) *
      (1 + 0.1 * (0.1 - d.terms.protection)),
  );
  return {
    contribution: Math.round(cost * d.terms.incentive),
    serviceDaily: Math.round(serviceAnnual / 365),
    guarantee: Math.round(cost * d.terms.protection),
  };
}
export function offerConcession(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || s.scheduler.lastDay >= d.deadline || d.rounds >= DEAL_ROUNDS)
    return 'Negotiation is closed.';
  const t = { ...d.terms, ...terms };
  if (!(
    t.incentive >= 0.1 &&
    t.incentive <= 0.4 &&
    t.months >= 12 &&
    t.months <= 60 &&
    Number.isInteger(t.months) &&
    t.priceFactor >= 0.5 &&
    t.priceFactor <= 1.5 &&
    t.protection >= 0 &&
    t.protection <= 0.3
  ))
    return 'Choose valid contribution, duration, charge and guarantee terms.';
  d.terms = t;
  d.version++;
  d.rounds++;
  d.priceMinor = concessionQuote(d).contribution;
  dealLog(
    s,
    d,
    'Consortium repriced its service payment for these terms. Review the full remaining liability before signing.',
  );
  return null;
}
export function signConcession(s: GameState, d: Deal): string | null {
  const template = d.template.split(':')[1],
    t = PROJECT_BY_ID[template];
  if (s.government.projects.some((p) => p.templateId === template && p.status !== 'cancelled'))
    return 'This project already has a funding route.';
  const q = concessionQuote(d),
    err = reserveDeal(s, d, q.contribution);
  if (err) return err;
  const p = {
    id: s.government.nextId++,
    templateId: template,
    name: t.name,
    kind: t.kind,
    cost: t.cost,
    spent: 0,
    work: 0,
    startDay: s.scheduler.lastDay + 1,
    durationDays: projectBuildDays(s, t.durationDays),
    status: 'building' as const,
    concessionDealId: d.id,
  };
  s.government.projects.push(p);
  d.projectId = p.id;
  d.privateCashMinor = (d.assetCostMinor ?? 0) - q.contribution;
  d.status = 'agreed';
  d.nextDay = p.startDay;
  d.serviceDailyMinor = q.serviceDaily;
  d.guaranteeMinor = q.guarantee;
  d.committedMinor = q.contribution + q.serviceDaily * Math.round((d.terms.months * 365) / 12);
  dealLog(
    s,
    d,
    'Signed: private construction capital committed. Payments for operations start only after completion.',
  );
  return null;
}
export function cancelConcession(s: GameState, d: Deal): void {
  const p = s.government.projects.find((p) => p.id === d.projectId);
  if (p) p.status = 'cancelled';
  for (const [id, value] of Object.entries(d.effectInfra ?? {}))
    s.sectors[id as SectorId].infraBoost = Math.max(0, s.sectors[id as SectorId].infraBoost - (value ?? 0));
  s.government.serviceBoost -= d.effectService ?? 0;
  d.effectInfra = {};
  d.effectService = 0;
  if (d.status === 'active' && !boomOn(s)) d.arrearsMinor += Math.round((d.assetCostMinor ?? 0) * 0.1);
  releaseDeal(s, d);
  d.committedMinor = 0;
  d.guaranteeMinor = 0;
  d.status = 'failed';
  dealLog(
    s,
    d,
    'Contract terminated. Unspent public escrow returned; active-contract termination is capped at 10% of base capital cost. Unpaid claims remain liabilities.',
  );
}
export function dailyConcessions(
  s: GameState,
  d: Deal,
  day: number,
  purchases: Record<SectorId, number>,
): void {
  if (
    d.kind !== 'concession' ||
    !['agreed', 'active', 'failed', 'completed'].includes(d.status) ||
    day < d.nextDay
  )
    return;
  const p = s.government.projects.find((p) => p.id === d.projectId)!;
  if (d.status === 'failed' || d.status === 'completed') {
    const paid = toMinor(post(s.government, 'policyGrant', d.arrearsMinor / 100));
    d.arrearsMinor -= paid;
    d.privateCashMinor = (d.privateCashMinor ?? 0) + paid;
    return;
  }
  if (p.status === 'building') {
    d.status = 'active';
    const requested = toMinor(Math.min(p.cost - p.work, p.cost / p.durationDays) * s.sectors.prop.price);
    const publicDue = Math.min(d.escrowMinor, Math.round(requested * d.terms.incentive));
    const privateDue = Math.min(d.privateCashMinor ?? 0, requested - publicDue);
    const publicPaid = spendDeal(s, d, publicDue);
    d.privateCashMinor! -= privateDue;
    const paid = (publicPaid + privateDue) / 100;
    p.spent += paid;
    p.work += paid / s.sectors.prop.price;
    purchases.prop += paid * 0.7;
    purchases.ind += paid * 0.2;
    purchases.tech += paid * 0.1;
    d.progress = Math.min(1, p.work / p.cost);
    d.committedMinor = Math.max(0, d.committedMinor - publicPaid);
    if (p.work >= p.cost - 1) {
      const before = Object.fromEntries(Object.entries(s.sectors).map(([id, x]) => [id, x.infraBoost]));
      const service = s.government.serviceBoost;
      completeProject(s, p.id, day);
      d.effectInfra = Object.fromEntries(
        Object.entries(s.sectors).map(([id, x]) => [id, x.infraBoost - before[id]]),
      );
      d.effectService = s.government.serviceBoost - service;
      d.operationEndDay = day + Math.round((d.terms.months * 365) / 12);
      d.committedMinor -= d.escrowMinor;
      releaseDeal(s, d);
      dealLog(
        s,
        d,
        'Private asset delivered. Existing project benefits applied once; service and guarantee obligations now run.',
      );
    } else if (day > p.startDay + p.durationDays + 90) cancelConcession(s, d);
    return;
  }
  if (day >= (d.operationEndDay ?? day)) {
    d.status = 'completed';
    d.committedMinor = 0;
    d.guaranteeMinor = 0;
    dealLog(s, d, 'Concession term ended. Outstanding arrears remain payable.');
    return;
  }
  const service = d.serviceDailyMinor ?? 0;
  // User receipts are an allocated share of existing sector activity, not additional GDP or public cash.
  const userIncome = Math.round(
    (((d.assetCostMinor ?? 0) * 0.04) / 365) *
      d.terms.priceFactor *
      Math.min(1.5, s.sectors[d.sector].utilization / 0.85),
  );
  const call = Math.min(
    d.guaranteeMinor,
    Math.max(0, Math.round(((d.assetCostMinor ?? 0) * 0.04) / 365) - userIncome),
  );
  d.guaranteeMinor -= call;
  const due = service + call + d.arrearsMinor,
    paid = toMinor(post(s.government, 'policyGrant', due / 100));
  d.arrearsMinor = due - paid;
  d.paidMinor += paid;
  d.committedMinor = Math.max(0, d.committedMinor - service);
  d.privateCashMinor = (d.privateCashMinor ?? 0) + paid;
  purchases[d.sector] += Math.min(service, paid) / 100;
  d.unpaidDays = d.arrearsMinor > 0 ? (d.unpaidDays ?? 0) + 1 : 0;
  if (d.unpaidDays >= 30) cancelConcession(s, d);
}
