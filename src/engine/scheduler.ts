import { dailyDeals } from './deals';
import { applyPlans, automaticFx } from './policy-controls';
import { recentIncomeTrend } from './household-behavior';
import { baselineFor, budgetFor, nationalV2, trendFor } from '../data/economic-baseline';
import { updateFiscal } from './fiscal-rules';
import { dailyResources, monthCloseSoe } from './soe';
import { dailyPolicy, monthClosePolicy } from './policy';
import { dailyFdi, monthCloseFdi, operatingStock, weeklyFdi } from './fdi';
import { monthCloseStanding } from './standing';
import { coreCpiOf, updateWorld, weeklyWorld } from './world';
// Deterministic hourly tick. Ordering within a tick (see docs/decisions.md D-004):
//   1. advance clock one hour
//   2. if a KL day boundary was crossed: settle the day that just ENDED (external → government →
//      households/sectors → companies), then weekly (Mon) and monthly (1st) closes for the period
//      that just ended. Cursors make each boundary idempotent.
//   3. apply player policies whose effective time has arrived (after the close, so a tax rise
//      effective 1 Feb never taxes January)
//   4. exchange sessions, price discovery, queued order execution
//   5. campaign-end check (exactly once)
import { SECTOR_IDS } from '../data/economic-baseline';
import type { GameState, MonthlyReport, SectorId } from '../types/game';
import { monthCloseBank } from './banks';
import { dailyCompanies, monthCloseCompanies } from './companies';
import { daily, monthClose as economyMonthClose, resetMonthToDate, weekly } from './economy';
import { expireEvents, weeklyEvents } from './events';
import { aggregateMods, updateExternal, type AggregatedMods } from './external';
import { applyDuePolicies, dailyGovernment, debtMYR, monthCloseGovernment, outlaysOf, revenueOf, treasuryMYR } from './government';
import { computeScore, outcomeLabel, publicNetWorth, unemploymentRate, updateSatisfaction } from './indicators';
import { isOpen } from './market-calendar';
import { expireOrders, monthCloseFund, navMYR, processQueuedOrders, receiveDividends } from './sovereign-fund';
import { hourlyMarket } from './stock-market';
import { reconcileMonth } from './reconciliation';
import { daysInMonth, klDay, klDayStartMin, klParts, monthKey, monthKeyLabel } from './time';
import { surchargeEquivalent } from './income-tax';
import { clamp, news, pushBounded } from './util';

export function runHourTick(s: GameState): void {
  if (s.scheduler.campaignEnded) return;
  s.clock.hour += 1;
  s.scheduler.ticks += 1;
  const t = s.clock.hour * 60;
  const p = klParts(t);
  const today = klDay(t);

  if (p.hour === 0 && today > s.scheduler.lastDay) {
    const settledMods = settleDay(s, today - 1);
    s.scheduler.lastDay = today;
    if (p.weekday === 1 && today > s.scheduler.lastWeekDay) {
      weekly(s);
      weeklyEvents(s, today);
      weeklyWorld(s, today);
      weeklyFdi(s, today);
      s.scheduler.lastWeekDay = today;
    }
    const mk = monthKey(p.year, p.month);
    if (p.day === 1 && mk > s.scheduler.lastMonthKey) {
      closeMonth(s, mk - 1, settledMods);
      s.scheduler.lastMonthKey = mk;
    }
  }

  applyPlans(s);
  applyDuePolicies(s);
  hourlyMarket(s, t);
  for (const ex of ['MY', 'US'] as const) if (isOpen(ex, t)) processQueuedOrders(s, ex, t);
  expireOrders(s, t);

  if (s.clock.hour >= s.clock.endHour) endCampaign(s);
}

/** Output gap vs the potential path from the baseline (last closed month): 3.5%/yr, or the model-3 trend. */
export function outputGap(s: GameState): number {
  const r = s.reports[s.reports.length - 1];
  if (!r) return 0;
  const days = daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1);
  const potential = (s.baseline.realGdpAnnual / 365) * Math.pow(1 + trendFor(s).potentialGrowth, s.reports.length / 12);
  return r.realGdp / days / potential - 1;
}

function settleDay(s: GameState, day: number): AggregatedMods {
  const p = klParts(klDayStartMin(day + 1));
  const mods = aggregateMods(s, day);
  updateExternal(s, mods, s.indicators.inflationYoY, p.day, p.month, outputGap(s));
  automaticFx(s);
  updateWorld(s, day);
  const gov = dailyGovernment(s, day);
  const res = dailyResources(s, gov.purchases);
  // Schema 9: policy programmes and FDI build-out buy domestic output; imported FDI equipment is recorded as imports.
  dailyPolicy(s, gov.purchases);
  s.trade.mtdImports += dailyFdi(s, gov.purchases).imports;
  dailyDeals(s, day, gov.purchases, gov.paidFraction);
  const e = daily(s, mods, gov);
  e.gdpNominal += res.gdpNominal;
  s.world.mtd.resourceVa += res.gdpNominal;
  e.gdpReal += res.gdpReal;
  // Households track listed-equity prices with a lag of a few weeks (wealth effect input).
  if (nationalV2(s)) s.households.equityIndex += 0.05 * (s.market.indices.MY.value / 1000 - s.households.equityIndex);
  dailyCompanies(s, day);
  // Every agent receives the last valid day's shock before expiry.
  expireEvents(s, day + 1);
  s.scheduler.mtdGdpNominal += e.gdpNominal;
  s.scheduler.mtdGdpReal += e.gdpReal;
  s.scheduler.mtdDays += 1;
  s.indicators.unemployment = unemploymentRate(s);
  const nav = navMYR(s);
  pushBounded(s.fund.navHistory, { t: day, nav: Math.round(nav * 100) }, 800);
  pushBounded(s.daily, {
    t: day,
    treasury: treasuryMYR(s.government),
    nav,
    debt: debtMYR(s.government),
    cpi: s.indicators.cpi,
    unemployment: s.indicators.unemployment,
    approval: s.indicators.approval,
    fx: s.external.myrPerUsd,
    gdpRunRate: e.gdpNominal * 365,
  }, 800);
  return mods;
}

function closeMonth(s: GameState, key: number, mods: AggregatedMods): void {
  const BASELINE = baselineFor(s);
  const y = Math.floor(key / 12);
  const m = (key % 12) + 1;
  const dim = daysInMonth(y, m);
  const today = s.scheduler.lastDay;
  const prev = s.reports[s.reports.length - 1];
  const navBefore = prev ? prev.fundNav : s.scheduler.startNav;
  const flowsBefore = prev ? prev.fundNetFlows : 0;

  const divs = monthCloseCompanies(s, key);
  // dividends are paid to holders at the close of the declaring month
  receiveDividends(s, divs);
  monthCloseFund(s);
  monthCloseSoe(s, key, divs, Math.max(1, s.scheduler.mtdDays));
  const govClose = monthCloseGovernment(s);

  const ind = s.indicators;
  const days = Math.max(1, s.scheduler.mtdDays);
  const nominal = s.scheduler.mtdGdpNominal;
  const real = s.scheduler.mtdGdpReal;
  ind.nominalGdpAnnual = (nominal * 365) / days;
  ind.realGdpAnnual = (real * 365) / days;
  const yearAgo = s.reports.length >= 12 ? s.reports[s.reports.length - 12] : undefined;
  const months = s.reports.length + 1;
  if (yearAgo) {
    ind.inflationYoY = ind.cpi / yearAgo.cpi - 1;
    ind.realGrowthYoY = ind.realGdpAnnual / ((yearAgo.realGdp * 365) / daysInMonth(Math.floor(yearAgo.monthKey / 12), (yearAgo.monthKey % 12) + 1)) - 1;
  } else {
    ind.inflationYoY = Math.pow(ind.cpi / 100, 12 / months) - 1;
    // First year: growth vs the starting level (annualising a few months exaggerates noise).
    ind.realGrowthYoY = ind.realGdpAnnual / s.baseline.realGdpAnnual - 1;
  }
  ind.inflationMoM = prev ? ind.cpi / prev.cpi - 1 : ind.cpi / 100 - 1;
  const u = unemploymentRate(s);
  ind.unemployment = u;
  // Core inflation excludes administered pump prices, whose direct real-income effect households already
  // feel through the fuel bill (model 2); behavioural spending responses key off core inflation.
  const coreCpi = nationalV2(s) ? coreCpiOf(s) : ind.cpi;
  const coreYearAgo = yearAgo?.coreCpi;
  const coreInflation = !nationalV2(s) ? ind.inflationYoY : coreYearAgo ? coreCpi / coreYearAgo - 1 : yearAgo ? ind.inflationYoY : Math.pow(coreCpi / 100, 12 / months) - 1;

  const hh = s.households;
  const cpiF = ind.cpi / 100;
  const realDispPerCap = ((hh.mtd.disposable / cpiF) * (365 / days)) / hh.population;
  const rentBurden = hh.mtd.rent / Math.max(hh.mtd.disposable, 1);
  const incomeTrend = recentIncomeTrend(s, realDispPerCap);

  monthCloseBank(s, mods, u);
  economyMonthClose(s, ind.inflationYoY, u, incomeTrend, days, coreInflation);
  updateSatisfaction(s, realDispPerCap, rentBurden, ind.inflationYoY);

  ind.debtToGdp = debtMYR(s.government) / ind.nominalGdpAnnual;
  const g = govClose.flows;
  const revenue = revenueOf(g);
  const spend = outlaysOf(g);
  ind.deficitToGdp = ((spend - revenue) * (365 / days)) / ind.nominalGdpAnnual;
  ind.publicNetWorth = publicNetWorth(s);
  const tax = s.government.policies.tax;
  ind.gini = clamp(0.4 + 0.6 * (tax.consumption - 0.04) - 1.0 * (surchargeEquivalent(s) - 0.02) - 0.03 * (s.government.policies.budget.transfers / budgetFor(s).transfers - 1) + 0.5 * (u - BASELINE.unemployment), 0.25, 0.6);

  const gdpBySector = {} as Record<SectorId, number>;
  let investment = 0;
  for (const j of SECTOR_IDS) {
    gdpBySector[j] = s.sectors[j].mtd.va;
    investment += s.sectors[j].investmentMonthly;
  }
  const nav = navMYR(s);
  const label = monthKeyLabel(key);
  const report: MonthlyReport = {
    monthKey: key,
    label,
    nominalGdp: nominal,
    realGdp: real,
    gdpBySector,
    resourceGdp: s.world.mtd.resourceVa,
    cpi: ind.cpi,
    coreCpi,
    inflationYoY: ind.inflationYoY,
    unemployment: u,
    employment: hh.employed,
    wageIndex: hh.wageIndex,
    realDisposablePerCapita: realDispPerCap,
    gov: g,
    reconciliation: reconcileMonth(prev, g, s.government.treasury, s.government.debt, { treasury: s.baseline.openingTreasury, debt: s.baseline.openingDebt }),
    treasury: treasuryMYR(s.government),
    debt: debtMYR(s.government),
    bondYield: s.government.bondYield,
    fundNav: nav,
    fundNetFlows: s.fund.totalInjectedMYR - s.fund.totalWithdrawnMYR,
    fundReturnMoM: navBefore > 0 ? (nav - (s.fund.totalInjectedMYR - s.fund.totalWithdrawnMYR - flowsBefore)) / navBefore - 1 : 0,
    approval: ind.approval,
    investment,
    newLoans: s.bank.mtdNewLoans,
    npl: s.bank.nplRate,
    myrPerUsd: s.external.myrPerUsd,
    indexMY: s.market.indices.MY.value,
    indexUS: s.market.indices.US.value,
    events: s.events.log.filter((e) => e.startDay >= today - dim && e.startDay < today).map((e) => e.title),
    policies: s.policyLog.filter((p) => p.atMin >= klDayStartMin(today - dim) && p.atMin < klDayStartMin(today)).map((p) => p.label),
    notes: [],
    score: ind.score,
  };
  report.notes = explainMonth(s, report, prev, govClose.corporateTax);
  pushBounded(s.reports, report, 60);
  if (nationalV2(s)) updateFiscal(s, key, outputGap(s));
  monthCloseStanding(s, key, s.trade.mtdExports, days);
  ind.score = computeScore(s);
  report.score = ind.score;
  news(s, {
    kind: 'report',
    tone: ind.realGrowthYoY >= 0.03 && ind.approval >= 55 ? 'good' : ind.realGrowthYoY < 0.01 || ind.approval < 45 ? 'bad' : 'neutral',
    title: `${label} report: GDP ${(ind.realGrowthYoY * 100).toFixed(1)}% real, CPI ${(ind.inflationYoY * 100).toFixed(1)}%, jobless ${(u * 100).toFixed(1)}%`,
    body: report.notes.slice(0, 3).join(' '),
  });

  s.trade.history.push({ monthKey: key, exports: s.trade.mtdExports, imports: s.trade.mtdImports, tariff: g.importTariff, support: g.exportSupport });
  monthClosePolicy(s, operatingStock(s, 'datacentre'));
  monthCloseFdi(s, key);
  s.trade.history = s.trade.history.slice(-60);
  s.trade.mtdExports = 0;
  s.trade.mtdImports = 0;
  s.world.mtd = { fuelSubsidy: 0, wheatSubsidy: 0, palmDuty: 0, steelDuty: 0, bilateralDuty: 0, resourceVa: 0 };
  resetMonthToDate(s);
  s.scheduler.mtdGdpNominal = 0;
  s.scheduler.mtdGdpReal = 0;
  s.scheduler.mtdDays = 0;
}

/** Plain-language causal notes for the monthly report. */
function explainMonth(s: GameState, r: MonthlyReport, prev: MonthlyReport | undefined, corporateTax: number): string[] {
  const BASELINE = baselineFor(s);
  const notes: string[] = [];
  const e = s.external;
  if (prev) {
    const dGdp = r.realGdp / prev.realGdp - 1;
    let best: SectorId = 'fin';
    let bestD = 0;
    for (const j of SECTOR_IDS) {
      const d = r.gdpBySector[j] - prev.gdpBySector[j];
      if (Math.abs(d) > Math.abs(bestD)) {
        bestD = d;
        best = j;
      }
    }
    notes.push(`Real output ${dGdp >= 0 ? 'rose' : 'fell'} ${(Math.abs(dGdp) * 100).toFixed(1)}% on the month (partly calendar length); the biggest mover was ${best} (${bestD >= 0 ? '+' : '−'}RM ${(Math.abs(bestD) / 1e6).toFixed(0)}m value added).`);
    if (Math.abs(r.gov.taxCorporate - prev.gov.taxCorporate) > 0.08 * prev.gov.taxCorporate) notes.push(`Corporate tax receipts ${r.gov.taxCorporate > prev.gov.taxCorporate ? 'rose' : 'fell'} to RM ${(corporateTax / 1e6).toFixed(0)}m at a ${(s.government.policies.tax.corporate * 100).toFixed(0)}% rate.`);
    if (r.investment < prev.investment * 0.97) notes.push(`Private investment plans were cut ${(100 - (r.investment / prev.investment) * 100).toFixed(1)}% — after-tax returns, credit (${(s.bank.firmCreditRatio * 100).toFixed(0)}% of demand met) or lending rates (${(s.bank.lendingRate * 100).toFixed(2)}%) weighed.`);
    if (r.investment > prev.investment * 1.03) notes.push(`Private investment plans rose ${((r.investment / prev.investment - 1) * 100).toFixed(1)}% on stronger returns and capacity pressure.`);
  }
  if (e.oil > 1.15) notes.push(`Oil is ${((e.oil - 1) * 100).toFixed(0)}% above normal, pushing utility and transport costs into CPI.`);
  if (e.myrPerUsd > BASELINE.myrPerUsd * 1.04) notes.push(`A weaker ringgit (${e.myrPerUsd.toFixed(2)}/USD) raises import prices but lifts the MYR value of US holdings.`);
  if (s.government.daysInArrears > 0) notes.push('The treasury is in arrears: unpaid obligations are eroding services and trust.');
  if (r.gov.borrowing > 0) notes.push(`RM ${(r.gov.borrowing / 1e6).toFixed(0)}m of bonds were issued at ~${(s.government.bondYield * 100).toFixed(2)}%.`);
  if (r.fundReturnMoM !== 0) notes.push(`SWF return ${r.fundReturnMoM >= 0 ? '+' : ''}${(r.fundReturnMoM * 100).toFixed(2)}% for the month (market moves, FX, dividends and fees; treasury transfers excluded).`);
  return notes;
}

function endCampaign(s: GameState): void {
  if (s.scheduler.campaignEnded) return;
  s.scheduler.campaignEnded = true;
  s.clock.paused = true;
  s.clock.subHourMs = 0;
  s.indicators.publicNetWorth = publicNetWorth(s);
  s.indicators.score = computeScore(s);
  const o = outcomeLabel(s);
  news(s, { kind: 'system', tone: o.won ? 'good' : 'neutral', title: `Campaign complete — score ${s.indicators.score.total.toFixed(0)}/100`, body: o.text });
}
