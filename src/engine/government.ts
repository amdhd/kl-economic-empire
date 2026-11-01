import { NON_TAX_ANNUAL_2027 } from '../data/non-tax-revenue';
import { fleetAdjustment } from './supply-contracts';
import { sectorTax, ministryOutcomes } from './policy-controls';
import { baselineFor, budgetFor, nationalV2, trendFor } from '../data/economic-baseline';
import { DEVELOPMENT_PURCHASES, KL_ECONOMY_SHARE, PUBLIC_CAPITAL_DEPRECIATION } from '../data/world';
import { credibilityPremium } from './fiscal-rules';
import { DEBT_LIMIT_MYR, TREASURY_LIMIT_MYR } from '../data/boom';
import { injectFund } from './sovereign-fund';
import { FOREIGN_WORKERS0, WORKER_LEVY0 } from './policy';
import { modelledResourceRevenue0 } from './soe';
import { fuelSubsidyDaily, wheatSubsidyDaily, scheduleRetaliation } from './world';
// Government treasury, debt, budgets, projects and tax settlement.
// Every treasury movement goes through post(), which rounds to whole sen and records the exact
// same amount in the month-to-date flow ledger — so the budget identity is testable exactly.
import { BASE_TAX, BUDGET_LABELS, BUDGET_PURCHASES, SECTOR_IDS } from '../data/economic-baseline';
import { PROJECT_BY_ID } from '../data/projects';
import { infraDue, payInfra } from './infrastructure';
import type { BudgetCategory, GameState, GovMonthFlows, GovernmentState, SectorId } from '../types/game';
import { calibrationFor, PROPERTY_LEVY_BASE, type Vec } from './calibration';
import { assertSafeMinor, clamp, news, nowMin, pushBounded, toMinor } from './util';

/** Share of capital spending booked as a public asset (the rest is leakage, design, land, overruns). */
export const ASSET_CAPITALISATION = 0.6;
/** Annual upkeep of completed projects, as a share of their base cost. */
export const MAINTENANCE_RATE = 0.03;
/** Successive productivity gains in the same sector saturate: gain × exp(−existing boost / this). */
export const BOOST_SATURATION = 0.04;

export const emptyFlows = (): GovMonthFlows => ({
  dealEscrowOut: 0, dealEscrowIn: 0,
  taxCorporate: 0, taxProperty: 0, taxConsumption: 0, taxHousehold: 0, taxIncome: 0, nonTaxRevenue: 0, federalGrant: 0, importTariff: 0, exportSupport: 0,
  soeDividend: 0, petroleumTax: 0, commodityDuty: 0, subsidy: 0, opex: 0, capex: 0,
  interest: 0, borrowing: 0, principal: 0, swfContribution: 0, swfTransferIn: 0, emergency: 0, policyLevy: 0, policyGrant: 0,
});

const INFLOWS: (keyof GovMonthFlows)[] = ['dealEscrowIn', 'taxCorporate', 'taxProperty', 'taxConsumption', 'taxHousehold', 'taxIncome', 'nonTaxRevenue', 'federalGrant', 'importTariff', 'soeDividend', 'petroleumTax', 'commodityDuty', 'borrowing', 'swfTransferIn', 'policyLevy'];
export const isInflow = (k: keyof GovMonthFlows) => INFLOWS.includes(k);

/** Government revenue lines (borrowing and fund transfers are financing, not revenue). */
export const REVENUE_KINDS: (keyof GovMonthFlows)[] = ['taxCorporate', 'taxProperty', 'taxConsumption', 'taxHousehold', 'taxIncome', 'nonTaxRevenue', 'federalGrant', 'importTariff', 'soeDividend', 'petroleumTax', 'commodityDuty', 'policyLevy'];
/** Government expenditure lines (principal repayment and fund contributions are financing). */
export const OUTLAY_KINDS: (keyof GovMonthFlows)[] = ['opex', 'capex', 'interest', 'emergency', 'exportSupport', 'subsidy', 'policyGrant'];
const sumOf = (f: GovMonthFlows, kinds: (keyof GovMonthFlows)[]) => kinds.reduce((a, k) => a + (f[k] ?? 0), 0);
export const revenueOf = (f: GovMonthFlows) => sumOf(f, REVENUE_KINDS);
export const outlaysOf = (f: GovMonthFlows) => sumOf(f, OUTLAY_KINDS);
export const interestOf = (f: GovMonthFlows) => f.interest ?? 0;
export const capitalOf = (f: GovMonthFlows) => f.capex ?? 0;

/** Moves cash in/out of the treasury. Returns the rounded MYR amount actually posted. */
export function post(gov: GovernmentState, kind: keyof GovMonthFlows, amountMYR: number): number {
  if (!Number.isFinite(amountMYR)) throw new Error('Invalid treasury amount');
  if (!(amountMYR > 0)) return 0;
  const minor = isInflow(kind) ? toMinor(amountMYR) : Math.min(toMinor(amountMYR), gov.treasury);
  const signed = isInflow(kind) ? minor : -minor;
  const balance = gov.treasury + signed;
  assertSafeMinor(balance);
  if (balance < 0) throw new Error('Treasury payment requires financing');
  gov.treasury = balance;
  pushBounded(gov.ledger, { kind, amountMinor: signed, balanceMinor: balance }, 800);
  gov.mtd[kind] += minor / 100;
  return minor / 100;
}

export const treasuryMYR = (gov: GovernmentState) => gov.treasury / 100;
export const debtMYR = (gov: GovernmentState) => gov.debt / 100;

const zeroVec = (): Vec => Object.fromEntries(SECTOR_IDS.map((s) => [s, 0])) as Vec;

export function gdpForRatios(s: GameState): number {
  return Math.max(s.indicators.nominalGdpAnnual, 1e9);
}

export const newIssueCoupon = (s: GameState) => s.government.bondYield + (s.controls.debt.newTermMonths === 240 ? .005 : s.controls.debt.newTermMonths === 36 ? -.002 : 0);

/** Issue bonds. Respects market access and the player's debt/GDP cap. Returns MYR issued. */
export function issueDebt(s: GameState, amountMYR: number, reason: string, quiet = false): number {
  const gov = s.government;
  if (!Number.isFinite(amountMYR) || !gov.marketAccess || amountMYR <= 0) return 0;
  // The integer-sen ledger tops out near RM90tn, so new debt also stops at DEBT_LIMIT_MYR (reachable only in Boom mode).
  const cap = Math.min(gov.policies.borrowing.maxDebtToGdp * gdpForRatios(s), DEBT_LIMIT_MYR);
  // Borrowed cash lands in the treasury, so issuance also stops at the treasury ceiling (D-101).
  const room = Math.max(0, Math.min(cap - debtMYR(gov), TREASURY_LIMIT_MYR - treasuryMYR(gov)));
  const amt = Math.min(amountMYR, room);
  if (amt < 1e6) return 0;
  assertSafeMinor(gov.debt + toMinor(amt));
  const posted = post(gov, 'borrowing', amt);
  const before = debtMYR(gov);
  s.controls.debt.averageMonths = (before*s.controls.debt.averageMonths + posted*s.controls.debt.newTermMonths)/(before+posted);
  gov.debt += toMinor(posted);
  const coupon = newIssueCoupon(s);
  gov.avgDebtRate = (before * gov.avgDebtRate + posted * coupon) / (before + posted);
  if (!quiet) news(s, { kind: 'policy', tone: 'neutral', title: `KL bonds issued: RM ${(posted / 1e6).toFixed(0)}m`, body: `${reason}. Coupon ≈ ${(coupon * 100).toFixed(2)}%.` });
  return posted;
}

export function repayDebt(s: GameState, amountMYR: number): number {
  const gov = s.government;
  if (!Number.isFinite(amountMYR)) return 0;
  const amt = Math.min(amountMYR, treasuryMYR(gov), debtMYR(gov));
  if (amt <= 0) return 0;
  const posted = post(gov, 'principal', amt);
  gov.debt -= toMinor(posted);
  return posted;
}

/** Cash above TREASURY_LIMIT_MYR (D-101) buys back debt first, then goes to the sovereign fund, so the sen ledger never
 * overflows. Only reachable late in a long Boom campaign. Returns the MYR moved. */
export function sweepExcessCash(s: GameState): number {
  const excess = treasuryMYR(s.government) - TREASURY_LIMIT_MYR;
  if (!(excess > 0)) return 0;
  const repaid = repayDebt(s, excess);
  const rest = excess - repaid;
  const toFund = rest >= 1 && !injectFund(s, rest) ? rest : 0;
  news(s, { kind: 'policy', tone: 'neutral', title: 'Surplus cash put to work', body: `Treasury cash above RM${(TREASURY_LIMIT_MYR / 1e12).toFixed(0)}tn${repaid > 0 ? `: RM${(repaid / 1e9).toFixed(0)}bn of bonds bought back` : ''}${toFund > 0 ? `${repaid > 0 ? ',' : ':'} RM${(toFund / 1e9).toFixed(0)}bn moved to the sovereign fund` : ''}.` });
  return repaid + toFund;
}

export interface GovDay {
  purchases: Vec; // MYR, by sector
  transfersPaid: number;
  paidFraction: number;
}

/** The reduced tax model omits federal tax categories. Calibrate their residual so opening total receipts
 * equal the official 2027 estimate; never recalculate it from player policy. Model 3 indexes it to the last
 * closed month's nominal GDP run rate (unit buoyancy, D-055); earlier models keep it fixed in ringgit. */
export function otherPublicReceiptsMonthly(s: GameState): number {
  // Schema 9 posts the foreign-worker levy on its own line, so its opening yield leaves the residual (D-059).
  const levy0 = s.policy?.enabled ? (WORKER_LEVY0 * FOREIGN_WORKERS0 * 1e6) / 12 : 0;
  return (otherPublicReceiptsBase(s) - levy0) * (trendFor(s).buoyantReceipts ? s.indicators.nominalGdpAnnual / s.baseline.nominalGdpAnnual : 1);
}

/** Fees, licences, fines and rentals (D-073): opening 2027 estimate, indexed like other receipts to nominal GDP. */
export function nonTaxRevenueMonthly(s: GameState): number {
  if (!s.baseline.nonTax) return 0;
  return (NON_TAX_ANNUAL_2027 / 12) * (trendFor(s).buoyantReceipts ? s.indicators.nominalGdpAnnual / s.baseline.nominalGdpAnnual : 1);
}

function otherPublicReceiptsBase(s: GameState): number {
  const base = baselineFor(s);
  if (s.baseline.profile === 'legacy-kl') return base.federalGrantMonthly;
  const c = calibrationFor(s);
  const modeledTaxes = SECTOR_IDS.reduce((a, j) => a + Math.max(0, c.profit0[j]), 0) * BASE_TAX.corporate
    + BASE_TAX.property * PROPERTY_LEVY_BASE * c.Y0.prop + c.levyBase + c.hh.tax;
  // Model 2 also models petroleum tax, palm tax and duty, and SOE dividends explicitly.
  const resources = nationalV2(s) ? modelledResourceRevenue0() : 0;
  const fees = s.baseline.nonTax ? NON_TAX_ANNUAL_2027 : 0;
  return Math.max(0, (380_816_996_000 - modeledTaxes * 365 - resources - fees) / 12);
}

/** Companies pay corporate tax in monthly instalments (D-072): each day they remit a share of the last closed
 * month's bill (the opening modelled bill in month one), and month close settles only the difference. This
 * smooths the treasury; total tax collected is unchanged. */
const INSTALMENT_SHARE = 0.8;
function corporateInstalmentDaily(s: GameState): number {
  const last = s.reports.at(-1);
  if (last) return (INSTALMENT_SHARE * last.gov.taxCorporate) / 30;
  const c = calibrationFor(s);
  return INSTALMENT_SHARE * SECTOR_IDS.reduce((a, j) => a + Math.max(0, c.profit0[j]), 0) * BASE_TAX.corporate;
}

/** Daily: grant receipts, interest accrual, opex/transfers/capex/emergency outlays with financing. */
export function dailyGovernment(s: GameState, today: number): GovDay {
  const PER_DAY = 12 / 365;
  const gov = s.government;
  const pol = gov.policies;
  post(gov, 'federalGrant', otherPublicReceiptsMonthly(s) * PER_DAY);
  post(gov, 'nonTaxRevenue', nonTaxRevenueMonthly(s) * PER_DAY);
  post(gov, 'taxCorporate', corporateInstalmentDaily(s));
  gov.accruedInterest += (debtMYR(gov) * gov.avgDebtRate) / 365;

  const cats = Object.keys(BUDGET_PURCHASES) as Exclude<BudgetCategory, 'transfers'>[];
  const fleetDelta=fleetAdjustment(s,today);
  const opexDue = fleetDelta + cats.reduce((a, c) => a + pol.budget[c] * PER_DAY, 0);
  const transfersDue = pol.budget.transfers * PER_DAY;
  // Construction is priced at today's property & construction price index: if it rises, projects
  // cost more in ringgit (escalation) for the same real work.
  const pCons = s.sectors.prop.price;
  const capexDueBy: { id: number; amt: number }[] = [];
  let maintenance = 0;
  for (const p of gov.projects) {
    if (p.concessionDealId !== undefined) continue;
    if (p.status === 'complete') maintenance += (p.cost * MAINTENANCE_RATE * pCons) / 365;
    if (p.status !== 'building') continue;
    capexDueBy.push({ id: p.id, amt: Math.min(p.cost - p.work, p.cost / p.durationDays) * pCons });
  }
  const infraDueBy = infraDue(s).map((d) => ({ id: d.id, amt: d.amt }));
  const capexDue = capexDueBy.reduce((a, c) => a + c.amt, 0) + infraDueBy.reduce((a, c) => a + c.amt, 0);
  const emergencyDue = gov.pendingEmergency > 0 ? Math.min(gov.pendingEmergency, gov.pendingEmergency * 0.3 + 5e6) : 0;
  const arrearsDue = gov.unpaidObligations;
  // Federal development programme (model 2) and price subsidies are obligations like any other.
  const developmentDue = nationalV2(s) ? s.fiscal.developmentAnnual / 365 : 0;
  const fuelDue = fuelSubsidyDaily(s);
  const wheatDue = wheatSubsidyDaily(s);
  const totalDue = opexDue + maintenance + transfersDue + capexDue + emergencyDue + arrearsDue + developmentDue + fuelDue + wheatDue;

  if (treasuryMYR(gov) < totalDue) {
    issueDebt(s, totalDue - treasuryMYR(gov) + pol.borrowing.cashBufferMonths * 0.25 * totalDue * 30, 'Bridge financing to meet daily obligations');
  }
  const paidFraction = totalDue > 0 ? clamp(treasuryMYR(gov) / totalDue, 0, 1) : 1;

  const purchases = zeroVec();
  let opexPaid = 0;
  for (const c of cats) {
    const amt = (pol.budget[c] * PER_DAY + (c==='admin'?fleetDelta:0)) * paidFraction;
    opexPaid += amt;
    for (const [sec, sh] of Object.entries(BUDGET_PURCHASES[c])) purchases[sec as SectorId] += amt * (sh as number);
  }
  // arrears are opex/transfers that were not paid earlier; settle them as opex now
  const maintPaid = maintenance * paidFraction;
  purchases.prop += maintPaid * 0.6;
  purchases.ind += maintPaid * 0.4;
  const operatingPaid = post(gov, 'opex', opexPaid + maintPaid + arrearsDue * paidFraction);
  const transfersPaid = post(gov, 'opex', transfersDue * paidFraction);
  for (const { id, amt } of capexDueBy) {
    const p = gov.projects.find((x) => x.id === id)!;
    const paid = post(gov, 'capex', amt * paidFraction);
    p.spent += paid;
    p.work += paid / pCons;
    gov.publicAssets += paid * ASSET_CAPITALISATION;
    purchases.prop += paid * 0.7;
    purchases.ind += paid * 0.2;
    purchases.tech += paid * 0.1;
    if (p.work >= p.cost - 1) completeProject(s, p.id, today);
  }
  for (const { id, amt } of infraDueBy) {
    const paid = post(gov, 'capex', amt * paidFraction);
    gov.publicAssets += paid * ASSET_CAPITALISATION;
    purchases.prop += paid * 0.5;
    purchases.ind += paid * 0.3;
    purchases.tech += paid * 0.2;
    payInfra(s, id, paid);
  }
  if (emergencyDue > 0) {
    const paid = post(gov, 'emergency', emergencyDue * paidFraction);
    gov.pendingEmergency -= paid;
    purchases.prop += paid * 0.5;
    purchases.health += paid * 0.3;
    purchases.ind += paid * 0.2;
  }
  if (developmentDue > 0) {
    const paid = post(gov, 'capex', developmentDue * paidFraction);
    gov.publicAssets += paid * ASSET_CAPITALISATION;
    for (const [sec, sh] of Object.entries(DEVELOPMENT_PURCHASES)) purchases[sec as SectorId] += paid * sh;
    s.fiscal.publicCapital += paid / pCons;
  }
  if (nationalV2(s)) s.fiscal.publicCapital *= 1 - PUBLIC_CAPITAL_DEPRECIATION / 365;
  // Unpaid subsidies are not carried as arrears: retailers are reimbursed only from available cash.
  if (fuelDue > 0) s.world.mtd.fuelSubsidy += post(gov, 'subsidy', fuelDue * paidFraction);
  if (wheatDue > 0) s.world.mtd.wheatSubsidy += post(gov, 'subsidy', wheatDue * paidFraction);
  // Projects retain unbuilt work and emergencies retain pendingEmergency. Carrying those same
  // shortfalls as opex arrears would pay them twice when cash becomes available.
  gov.unpaidObligations = Math.max(0, opexDue + maintenance + transfersDue + arrearsDue - operatingPaid - transfersPaid);
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
  // KL projects on the KL map: in model-2 national campaigns their economy-wide effects are scaled by
  // KL's share of national output, so a city rail line cannot lift every Malaysian sector (D-035).
  const k = nationalV2(s) && !t.national ? KL_ECONOMY_SHARE : 1;
  const gains: string[] = [];
  for (const [sec, boost] of Object.entries(t.productivity)) {
    const st = s.sectors[sec as SectorId];
    const eff = (boost as number) * k * Math.exp(-st.infraBoost / BOOST_SATURATION);
    st.infraBoost += eff;
    gains.push(`${sec} productivity +${(eff * 100).toFixed(2)}%`);
  }
  gov.housingFactor *= 1 + t.rentEffect * k;
  gov.serviceBoost += t.serviceEffect * k;
  gov.resilience = 1 - (1 - gov.resilience) * (1 - t.resilience);
  gov.tourismBoost += t.tourism * k;
  news(s, { kind: 'policy', tone: 'good', title: `Completed: ${p.name}`, body: `Benefits now active: ${gains.join(', ')}${t.rentEffect ? `, housing costs ${(t.rentEffect * k * 100).toFixed(2)}%` : ''}${t.resilience ? `, flood damage −${t.resilience * 100}%` : ''}.` });
}

export interface GovMonthClose {
  flows: GovMonthFlows;
  corporateTax: number;
  propertyLevy: number;
}

/** Returns an over-collected receipt: the treasury pays it back and the revenue line falls by the same amount, so
 * reconciliation still holds. Bridge-financed if the cash has been spent. Returns the MYR refunded. */
export function refundReceipt(s: GameState, kind: keyof GovMonthFlows, amountMYR: number): number {
  const gov = s.government;
  if (!isInflow(kind) || !(amountMYR > 0)) return 0;
  if (treasuryMYR(gov) < amountMYR) issueDebt(s, amountMYR - treasuryMYR(gov), 'Financing tax refunds', true);
  const minor = Math.min(toMinor(amountMYR), gov.treasury);
  gov.treasury -= minor;
  pushBounded(gov.ledger, { kind, amountMinor: -minor, balanceMinor: gov.treasury }, 800);
  gov.mtd[kind] -= minor / 100;
  return minor / 100;
}

/** Month close: settle corporate tax & property levy, pay interest & principal, refinance, rate risk.
 * `otherCorporateTax` is corporate tax already posted this month outside the sector instalments (palm plantations);
 * it is not a payment towards the sector bill. */
export function monthCloseGovernment(s: GameState, otherCorporateTax = 0): GovMonthClose {
  const BASE_BUDGET = budgetFor(s);
  const gov = s.government;
  const pol = gov.policies;
  const corporateDue = SECTOR_IDS.reduce((sum,j) => sum + Math.max(0,s.sectors[j].mtd.taxableProfit)*sectorTax(s,j),0);
  // Instalments count towards the bill; the difference is settled either way, so firms pay exactly the bill in law.
  // Firms' after-tax profits already use the bill, so keeping an overpayment would create revenue nobody paid.
  const instalments = gov.mtd.taxCorporate - otherCorporateTax;
  if (corporateDue >= instalments) post(gov, 'taxCorporate', corporateDue - instalments);
  else refundReceipt(s, 'taxCorporate', instalments - corporateDue);
  const corporateTax = gov.mtd.taxCorporate;
  s.controls.lastTaxReliefMYR = Math.max(0,(toMinor(SECTOR_IDS.reduce((sum,j)=>sum+Math.max(0,s.sectors[j].mtd.taxableProfit)*pol.tax.corporate,0))-toMinor(corporateDue))/100);
  const propertyLevy = post(gov, 'taxProperty', pol.tax.property * PROPERTY_LEVY_BASE * s.sectors.prop.mtd.nominalOutput);

  // Interest: pay the accrued amount; refinance if short.
  const interest = gov.accruedInterest;
  if (treasuryMYR(gov) < interest) issueDebt(s, interest - treasuryMYR(gov), 'Financing interest payments', true);
  gov.accruedInterest = interest - post(gov, 'interest', Math.min(interest, treasuryMYR(gov)));
  gov.unpaidObligations += gov.accruedInterest;
  gov.accruedInterest = 0;

  // Scheduled amortisation (~10y average maturity), refinanced by new issuance at today's yield.
  const principalDue = debtMYR(gov) / s.controls.debt.averageMonths;
  const repaid = repayDebt(s, principalDue);
  const outlays = outlaysOf(gov.mtd);
  const target = Math.max(0,pol.borrowing.cashBufferMonths * outlays - repaid * (1-s.controls.debt.refinance));
  if (treasuryMYR(gov) < target) issueDebt(s, target - treasuryMYR(gov), repaid > 0 ? 'Refinancing maturing bonds and rebuilding the cash buffer' : 'Rebuilding the cash buffer');
  sweepExcessCash(s);

  // Fiscal risk premium and rating
  const gdp = gdpForRatios(s);
  const debtToGdp = debtMYR(gov) / gdp;
  const recent = s.reports.slice(-11);
  const revenue12 = recent.reduce((a, r) => a + revenueOf(r.gov), 0) + revenueOf(gov.mtd);
  const spend12 = recent.reduce((a, r) => a + outlaysOf(r.gov), 0) + outlays;
  const months = recent.length + 1;
  const deficit = ((spend12 - revenue12) * (12 / months)) / gdp;
  const arrears = gov.mtdArrearsDays > 0 ? 1 : 0;
  // Model 2 carries the real development budget, so its deficit starts near 4% of GDP: the deficit premium
  // applies above that level, and fiscal-rule credibility adds or removes up to ~50bp.
  const deficitFree = nationalV2(s) ? 0.045 : 0.03;
  const premium = Math.max(0.0005, 0.004 + 0.08 * Math.max(0, debtToGdp - (s.baseline.profile === 'malaysia' ? 0.65 : 0.35)) + 0.25 * Math.max(0, deficit - deficitFree) + 0.02 * arrears
    + (nationalV2(s) ? credibilityPremium(s) : 0));
  const prevRating = gov.creditRating;
  gov.bondYield = s.external.mgs10 + premium;
  const ratingFree = nationalV2(s) ? 0.045 : 0.025;
  const credibilityNotches = nationalV2(s) ? (s.fiscal.credibility - 60) / 40 : 0;
  gov.creditRating = clamp(9 - 15 * Math.max(0, debtToGdp - (s.baseline.profile === 'malaysia' ? 0.6 : 0.3)) - 40 * Math.max(0, deficit - ratingFree) - 3 * arrears + credibilityNotches, 0, 10);
  if (Math.floor(gov.creditRating) < Math.floor(prevRating)) {
    news(s, { kind: 'policy', tone: 'bad', title: `Credit rating downgraded to ${ratingLabel(gov.creditRating)}`, body: `Debt/GDP ${(debtToGdp * 100).toFixed(1)}%, deficit ${(deficit * 100).toFixed(1)}% of GDP. Borrowing costs rise.` });
    s.policyChurn += 4;
  }
  gov.marketAccess = gov.creditRating >= 2 && !gov.insolvent;

  // Service quality: driven by real spending on health, services & safety vs baseline, with lag.
  const cpiF = s.indicators.cpi / 100;
  const base = BASE_BUDGET.health + BASE_BUDGET.services + BASE_BUDGET.safety;
  const real = ((pol.budget.health + pol.budget.services + pol.budget.safety) / cpiF / base) * (1 - (gov.mtdArrearsDays / 30) * 0.5);
  const targetSq = clamp(0.62 * Math.pow(Math.max(real, 0.1), 0.6) + gov.serviceBoost - 0.004 * (s.households.population / baselineFor(s).population * 2.1 - 2.1) * 10, 0.05, 0.98);
  ministryOutcomes(s);
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
    else if (p.kind === 'trade') Object.assign(s.trade.policy, p.patch);
    else if (p.kind === 'commodity') Object.assign(s.world.policy, p.patch);
    else if (p.kind === 'development') s.fiscal.developmentAnnual = (p.patch as { annual: number }).annual;
    else if (p.kind === 'partner') {
      const { partner, tariff } = p.patch as { partner: import('../types/game').PartnerId; tariff: number };
      s.world.partners[partner].ourTariff = tariff;
      scheduleRetaliation(s, partner, s.scheduler.lastDay);
    }
    else Object.assign(gov.policies.borrowing, p.patch);
    news(s, { kind: 'policy', tone: 'neutral', title: `Now in force: ${p.label}` });
  }
}

export const budgetLabel = (c: BudgetCategory) => BUDGET_LABELS[c];
