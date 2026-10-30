// Government treasury, debt, budgets, projects and tax settlement.
// Every treasury movement goes through post(), which rounds to whole sen and records the exact
// same amount in the month-to-date flow ledger — so the budget identity is testable exactly.
import { BASE_BUDGET, BASELINE, BUDGET_LABELS, BUDGET_PURCHASES, SECTOR_IDS } from '../data/economic-baseline';
import { PROJECT_BY_ID } from '../data/projects';
import type { BudgetCategory, GameState, GovMonthFlows, GovernmentState, SectorId } from '../types/game';
import { PROPERTY_LEVY_BASE, type Vec } from './calibration';
import { clamp, news, nowMin, toMinor } from './util';

export const emptyFlows = (): GovMonthFlows => ({
  taxCorporate: 0, taxProperty: 0, taxConsumption: 0, taxHousehold: 0, federalGrant: 0, opex: 0, capex: 0,
  interest: 0, borrowing: 0, principal: 0, swfContribution: 0, swfTransferIn: 0, emergency: 0,
});

const INFLOWS: (keyof GovMonthFlows)[] = ['taxCorporate', 'taxProperty', 'taxConsumption', 'taxHousehold', 'federalGrant', 'borrowing', 'swfTransferIn'];
export const isInflow = (k: keyof GovMonthFlows) => INFLOWS.includes(k);

/** Moves cash in/out of the treasury. Returns the rounded MYR amount actually posted. */
export function post(gov: GovernmentState, kind: keyof GovMonthFlows, amountMYR: number): number {
  if (!(amountMYR > 0)) return 0;
  const minor = toMinor(amountMYR);
  gov.treasury += isInflow(kind) ? minor : -minor;
  gov.mtd[kind] += minor / 100;
  return minor / 100;
}

export const treasuryMYR = (gov: GovernmentState) => gov.treasury / 100;
export const debtMYR = (gov: GovernmentState) => gov.debt / 100;

const zeroVec = (): Vec => Object.fromEntries(SECTOR_IDS.map((s) => [s, 0])) as Vec;

export function gdpForRatios(s: GameState): number {
  return Math.max(s.indicators.nominalGdpAnnual, 1e9);
}

/** Issue bonds. Respects market access and the player's debt/GDP cap. Returns MYR issued. */
export function issueDebt(s: GameState, amountMYR: number, reason: string, quiet = false): number {
  const gov = s.government;
  if (!gov.marketAccess || amountMYR <= 0) return 0;
  const cap = gov.policies.borrowing.maxDebtToGdp * gdpForRatios(s);
  const room = Math.max(0, cap - debtMYR(gov));
  const amt = Math.min(amountMYR, room);
  if (amt < 1e6) return 0;
  const posted = post(gov, 'borrowing', amt);
  const before = debtMYR(gov);
  gov.debt += toMinor(posted);
  gov.avgDebtRate = (before * gov.avgDebtRate + posted * gov.bondYield) / (before + posted);
  if (!quiet) news(s, { kind: 'policy', tone: 'neutral', title: `KL bonds issued: RM ${(posted / 1e6).toFixed(0)}m`, body: `${reason}. Coupon ≈ ${(gov.bondYield * 100).toFixed(2)}%.` });
  return posted;
}

export function repayDebt(s: GameState, amountMYR: number): number {
  const gov = s.government;
  const amt = Math.min(amountMYR, treasuryMYR(gov), debtMYR(gov));
  if (amt <= 0) return 0;
  const posted = post(gov, 'principal', amt);
  gov.debt -= toMinor(posted);
  return posted;
}

export interface GovDay {
  purchases: Vec; // MYR, by sector
  transfersPaid: number;
  paidFraction: number;
}

/** Daily: grant receipts, interest accrual, opex/transfers/capex/emergency outlays with financing. */
export function dailyGovernment(s: GameState, today: number): GovDay {
  const PER_DAY = 12 / 365;
  const gov = s.government;
  const pol = gov.policies;
  post(gov, 'federalGrant', BASELINE.federalGrantMonthly * PER_DAY);
  gov.accruedInterest += (debtMYR(gov) * gov.avgDebtRate) / 365;

  const cats = Object.keys(BUDGET_PURCHASES) as Exclude<BudgetCategory, 'transfers'>[];
  const opexDue = cats.reduce((a, c) => a + pol.budget[c] * PER_DAY, 0);
  const transfersDue = pol.budget.transfers * PER_DAY;
  const capexDueBy: { id: number; amt: number }[] = [];
  for (const p of gov.projects) {
    if (p.status !== 'building') continue;
    capexDueBy.push({ id: p.id, amt: Math.min(p.cost - p.spent, p.cost / p.durationDays) });
  }
  const capexDue = capexDueBy.reduce((a, c) => a + c.amt, 0);
  const emergencyDue = gov.pendingEmergency > 0 ? Math.min(gov.pendingEmergency, gov.pendingEmergency * 0.3 + 5e6) : 0;
  const arrearsDue = gov.unpaidObligations;
  const totalDue = opexDue + transfersDue + capexDue + emergencyDue + arrearsDue;

  if (treasuryMYR(gov) < totalDue) {
    issueDebt(s, totalDue - treasuryMYR(gov) + pol.borrowing.cashBufferMonths * 0.25 * totalDue * 30, 'Bridge financing to meet daily obligations');
  }
  const paidFraction = totalDue > 0 ? clamp(treasuryMYR(gov) / totalDue, 0, 1) : 1;

  const purchases = zeroVec();
  let opexPaid = 0;
  for (const c of cats) {
    const amt = pol.budget[c] * PER_DAY * paidFraction;
    opexPaid += amt;
    for (const [sec, sh] of Object.entries(BUDGET_PURCHASES[c])) purchases[sec as SectorId] += amt * (sh as number);
  }
  // arrears are opex/transfers that were not paid earlier; settle them as opex now
  post(gov, 'opex', opexPaid + arrearsDue * paidFraction);
  const transfersPaid = post(gov, 'opex', transfersDue * paidFraction);
  for (const { id, amt } of capexDueBy) {
    const p = gov.projects.find((x) => x.id === id)!;
    const paid = post(gov, 'capex', amt * paidFraction);
    p.spent += paid;
    gov.publicAssets += paid;
    purchases.prop += paid * 0.7;
    purchases.ind += paid * 0.2;
    purchases.tech += paid * 0.1;
    if (p.spent >= p.cost - 1) completeProject(s, p.id, today);
  }
  if (emergencyDue > 0) {
    const paid = post(gov, 'emergency', emergencyDue * paidFraction);
    gov.pendingEmergency -= paid;
    purchases.prop += paid * 0.5;
    purchases.health += paid * 0.3;
    purchases.ind += paid * 0.2;
  }
  gov.unpaidObligations = totalDue * (1 - paidFraction);
  if (gov.unpaidObligations > 1e6) {
    gov.daysInArrears += 1;
    gov.mtdArrearsDays += 1;
    if (gov.daysInArrears === 1) news(s, { kind: 'policy', tone: 'bad', title: 'Treasury in arrears', body: 'The city could not pay all obligations today. Suppliers and transfer recipients are unpaid; service quality and trust will suffer.' });
  } else gov.daysInArrears = 0;
  return { purchases, transfersPaid, paidFraction };
}

export function completeProject(s: GameState, id: number, today: number): void {
  const gov = s.government;
  const p = gov.projects.find((x) => x.id === id);
  if (!p || p.status !== 'building') return;
  const t = PROJECT_BY_ID[p.templateId];
  p.status = 'complete';
  p.completedDay = today;
  for (const [sec, boost] of Object.entries(t.productivity)) s.sectors[sec as SectorId].infraBoost += boost as number;
  gov.housingFactor *= 1 + t.rentEffect;
  gov.serviceBoost += t.serviceEffect;
  gov.resilience = 1 - (1 - gov.resilience) * (1 - t.resilience);
  gov.tourismBoost += t.tourism;
  news(s, { kind: 'policy', tone: 'good', title: `Completed: ${p.name}`, body: `Benefits now active: ${Object.entries(t.productivity).map(([k, v]) => `${k} productivity +${((v as number) * 100).toFixed(1)}%`).join(', ')}${t.rentEffect ? `, housing costs ${(t.rentEffect * 100).toFixed(1)}%` : ''}${t.resilience ? `, flood damage −${t.resilience * 100}%` : ''}.` });
}

export interface GovMonthClose {
  flows: GovMonthFlows;
  corporateTax: number;
  propertyLevy: number;
}

/** Month close: settle corporate tax & property levy, pay interest & principal, refinance, rate risk. */
export function monthCloseGovernment(s: GameState): GovMonthClose {
  const gov = s.government;
  const pol = gov.policies;
  let taxable = 0;
  for (const j of SECTOR_IDS) taxable += Math.max(0, s.sectors[j].mtd.taxableProfit);
  const corporateTax = post(gov, 'taxCorporate', taxable * pol.tax.corporate);
  const propertyLevy = post(gov, 'taxProperty', pol.tax.property * PROPERTY_LEVY_BASE * s.sectors.prop.mtd.nominalOutput);

  // Interest: pay the accrued amount; refinance if short.
  const interest = gov.accruedInterest;
  if (treasuryMYR(gov) < interest) issueDebt(s, interest - treasuryMYR(gov), 'Financing interest payments', true);
  gov.accruedInterest = interest - post(gov, 'interest', Math.min(interest, treasuryMYR(gov)));
  gov.unpaidObligations += gov.accruedInterest;
  gov.accruedInterest = 0;

  // Scheduled amortisation (~10y average maturity), refinanced by new issuance at today's yield.
  const principalDue = debtMYR(gov) / 120;
  const repaid = repayDebt(s, principalDue);
  const outlays = gov.mtd.opex + gov.mtd.capex + gov.mtd.interest + gov.mtd.emergency;
  const target = pol.borrowing.cashBufferMonths * outlays;
  if (treasuryMYR(gov) < target) issueDebt(s, target - treasuryMYR(gov), repaid > 0 ? 'Refinancing maturing bonds and rebuilding the cash buffer' : 'Rebuilding the cash buffer');

  // Fiscal risk premium and rating
  const gdp = gdpForRatios(s);
  const debtToGdp = debtMYR(gov) / gdp;
  const recent = s.reports.slice(-11);
  const revenue12 = recent.reduce((a, r) => a + r.gov.taxCorporate + r.gov.taxProperty + r.gov.taxConsumption + r.gov.taxHousehold + r.gov.federalGrant, 0) + gov.mtd.taxCorporate + gov.mtd.taxProperty + gov.mtd.taxConsumption + gov.mtd.taxHousehold + gov.mtd.federalGrant;
  const spend12 = recent.reduce((a, r) => a + r.gov.opex + r.gov.capex + r.gov.interest + r.gov.emergency, 0) + outlays;
  const months = recent.length + 1;
  const deficit = ((spend12 - revenue12) * (12 / months)) / gdp;
  const arrears = gov.mtdArrearsDays > 0 ? 1 : 0;
  const premium = 0.004 + 0.08 * Math.max(0, debtToGdp - 0.35) + 0.25 * Math.max(0, deficit - 0.03) + 0.02 * arrears;
  const prevRating = gov.creditRating;
  gov.bondYield = s.external.mgs10 + premium;
  gov.creditRating = clamp(9 - 15 * Math.max(0, debtToGdp - 0.3) - 40 * Math.max(0, deficit - 0.025) - 3 * arrears, 0, 10);
  if (Math.floor(gov.creditRating) < Math.floor(prevRating)) {
    news(s, { kind: 'policy', tone: 'bad', title: `Credit rating downgraded to ${ratingLabel(gov.creditRating)}`, body: `Debt/GDP ${(debtToGdp * 100).toFixed(1)}%, deficit ${(deficit * 100).toFixed(1)}% of GDP. Borrowing costs rise.` });
    s.policyChurn += 4;
  }
  gov.marketAccess = gov.creditRating >= 2 && !gov.insolvent;

  // Service quality: driven by real spending on health, services & safety vs baseline, with lag.
  const cpiF = s.indicators.cpi / 100;
  const base = BASE_BUDGET.health + BASE_BUDGET.services + BASE_BUDGET.safety;
  const real = ((pol.budget.health + pol.budget.services + pol.budget.safety) / cpiF / base) * (1 - (gov.mtdArrearsDays / 30) * 0.5);
  const targetSq = clamp(0.62 * Math.pow(Math.max(real, 0.1), 0.6) + gov.serviceBoost - 0.004 * (s.households.population / 1e6 - 2.1) * 10, 0.05, 0.98);
  gov.serviceQuality += (targetSq - gov.serviceQuality) * 0.25;

  gov.publicAssets *= 1 - 0.03 / 12;
  if (gov.daysInArrears >= 30 && !gov.marketAccess && !gov.insolvent) {
    gov.insolvent = true;
    news(s, { kind: 'policy', tone: 'bad', title: 'KL government insolvent', body: 'The city has been in arrears for 30+ days without market access. Campaign score is capped.' });
  }
  const flows = { ...gov.mtd };
  gov.mtd = emptyFlows();
  gov.mtdArrearsDays = 0;
  return { flows, corporateTax, propertyLevy };
}

export function ratingLabel(r: number): string {
  const labels = ['D', 'CC', 'CCC', 'B', 'BB', 'BBB−', 'BBB', 'BBB+', 'A', 'AA', 'AAA'];
  return labels[clamp(Math.floor(r), 0, 10)];
}

export function applyDuePolicies(s: GameState): void {
  const gov = s.government;
  const now = nowMin(s);
  const due = gov.pending.filter((p) => p.effectiveMin <= now);
  if (!due.length) return;
  gov.pending = gov.pending.filter((p) => p.effectiveMin > now);
  for (const p of due) {
    if (p.kind === 'tax') Object.assign(gov.policies.tax, p.patch);
    else if (p.kind === 'budget') Object.assign(gov.policies.budget, p.patch);
    else Object.assign(gov.policies.borrowing, p.patch);
    news(s, { kind: 'policy', tone: 'neutral', title: `Now in force: ${p.label}` });
  }
}

export const budgetLabel = (c: BudgetCategory) => BUDGET_LABELS[c];
