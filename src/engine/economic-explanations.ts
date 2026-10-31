// Read-only accounting decompositions and current mechanisms. These are not counterfactual forecasts.
import { BASE_TAX, baselineFor, CPI_WEIGHTS, nationalV2, SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import { FUEL_CPI_WEIGHT } from '../data/world';
import type { GameState, MonthlyReport } from '../types/game';
import { calibrationFor } from './calibration';
import { householdDemand } from './economy';
import { outlaysOf, revenueOf, treasuryMYR } from './government';
import { daysInMonth, formatKL, klDayLabel } from './time';
import { fuelPriceIndex } from './world';

export type ExplainMetric = 'gdp' | 'unemployment' | 'inflation' | 'approval' | 'treasury';
export const EXPLAIN_LABELS: Record<ExplainMetric, string> = { gdp: 'GDP', unemployment: 'Unemployment', inflation: 'Inflation', approval: 'Approval', treasury: 'Treasury' };
export interface ExplanationPart { label: string; value: number; unit: 'pp' | 'CPI points' | 'MYR/year' | 'USD/year' | 'MYR'; }
const annual = (r: MonthlyReport) => 365 / daysInMonth(Math.floor(r.monthKey / 12), r.monthKey % 12 + 1);

export function explainEconomy(s: GameState, metric: ExplainMetric) {
  const last = s.reports.at(-1), previous = s.reports.at(-2);
  const parts: ExplanationPart[] = [];
  let summary: string, period: string, caveat: string;
  const mechanisms: string[] = [];
  const hh = s.households;
  if (metric === 'unemployment') {
    const prevU = last?.unemployment ?? baselineFor(s).unemployment;
    const prevE = last?.employment ?? s.baseline.employment;
    const prevL = last && prevU < 1 ? prevE / (1 - prevU) : baselineFor(s).laborForce;
    const currentU = 1 - hh.employed / hh.laborForce;
    summary = `${(currentU * 100).toFixed(2)}% unemployed; ${((currentU - prevU) * 100).toFixed(2)} percentage-point change.`;
    period = last ? `Now versus ${last.label} close` : 'Now versus campaign opening';
    parts.push({ label: 'Change in employed workers', value: -100 * (hh.employed - prevE) / prevL, unit: 'pp' },
      { label: 'Change in labour-force size', value: 100 * hh.employed * (1 / prevL - 1 / hh.laborForce), unit: 'pp' });
    mechanisms.push('Hiring adjusts weekly toward the workers needed for demand that existing capital can serve. New private capacity takes six months to mature.',
      `${(s.bank.firmCreditRatio * 100).toFixed(0)}% of firm credit demand is met. Credit rationing can slow investment; this is a current condition, not a measured share of job losses.`);
    caveat = 'The two contributions reconcile the unemployment-rate change. They do not attribute jobs to individual policies.';
  } else if (metric === 'inflation') {
    const weight = nationalV2(s) ? 1 - FUEL_CPI_WEIGHT : 1;
    const levy = (1 + s.government.policies.tax.consumption) / (1 + BASE_TAX.consumption);
    for (const id of SECTOR_IDS) {
      const price = id === 'prop' ? hh.rentIndex : s.sectors[id].price * (id === 'cons' ? levy : 1);
      parts.push({ label: SECTORS[id].name, value: 100 * weight * CPI_WEIGHTS[id] * (price - 1), unit: 'CPI points' });
    }
    if (nationalV2(s)) parts.push({ label: 'Household pump prices', value: 100 * FUEL_CPI_WEIGHT * (fuelPriceIndex(s) - 1), unit: 'CPI points' });
    // Policies activate after the daily price settlement at a month boundary. Reconcile the
    // still-published CPI explicitly instead of pretending its basket already uses the new rate.
    const timing = s.indicators.cpi - 100 - parts.reduce((total, p) => total + p.value, 0);
    if (Math.abs(timing) > 1e-8) parts.push({ label: 'Awaiting daily price settlement', value: timing, unit: 'CPI points' });
    summary = `CPI ${s.indicators.cpi.toFixed(2)}; latest reported inflation ${(s.indicators.inflationYoY * 100).toFixed(2)}%.`;
    period = 'Current price-level contributions versus opening CPI 100';
    mechanisms.push(`Oil is ${s.external.oil.toFixed(2)}× its reference; MYR/USD is ${s.external.myrPerUsd.toFixed(3)}. These feed imported costs.`,
      `Wages are ${hh.wageIndex.toFixed(3)}× opening. Sector prices respond gradually to wages, inputs and capacity pressure.`);
    caveat = 'These add to the change in the CPI level, not the latest year-on-year inflation rate. Newly effective policies can await the next daily price settlement. Year one inflation is annualised since opening.';
  } else if (metric === 'approval') {
    summary = `Approval ${s.indicators.approval.toFixed(1)} / 100.`;
    period = last ? `${last.label}: contributions to the monthly approval change` : 'Opening approval; no monthly update yet';
    if (last) {
      const prior = previous?.approval ?? baselineFor(s).approval;
      const weights = { employment: 0.25, income: 0.25, affordability: 0.15, services: 0.15, trust: 0.1, stability: 0.1 };
      for (const key of Object.keys(weights) as (keyof typeof weights)[]) parts.push({ label: key[0].toUpperCase() + key.slice(1), value: 0.35 * weights[key] * (s.indicators.satisfaction[key] - prior), unit: 'pp' });
    }
    mechanisms.push('Approval moves 35% toward the weighted satisfaction target each month; results are not instant.',
      'Income still compares real living standards with campaign opening. Stabilising at a lower income can restore confidence without erasing dissatisfaction.');
    caveat = 'Contributions are from the approval formula, not a claim that a recent policy alone caused the change.';
  } else if (metric === 'gdp') {
    period = last ? `${last.label} versus ${previous?.label ?? 'opening'}; nominal annual run rates` : 'Opening position; wait for the first monthly close';
    summary = `Nominal GDP US$${(s.indicators.nominalGdpAnnual / s.external.myrPerUsd / 1e9).toFixed(1)}bn/year; real growth ${(s.indicators.realGrowthYoY * 100).toFixed(2)}% ${s.reports.length >= 12 ? 'year on year' : 'versus opening'}.`;
    if (last) {
      const cal = calibrationFor(s);
      const fxNow = s.external.myrPerUsd; // GDP contributions are shown in US dollars at today's rate
      for (const id of SECTOR_IDS) parts.push({ label: SECTORS[id].name, value: (last.gdpBySector[id] * annual(last) - (previous ? previous.gdpBySector[id] * annual(previous) : cal.Y0[id] * cal.v[id] * 365)) / fxNow, unit: 'USD/year' });
      const total = (last.nominalGdp * annual(last) - (previous ? previous.nominalGdp * annual(previous) : s.baseline.nominalGdpAnnual)) / fxNow;
      parts.push({ label: 'Resources and net product taxes', value: total - parts.reduce((a, p) => a + p.value, 0), unit: 'USD/year' });
    }
    const demand = householdDemand(s, s.government.policies.budget.transfers * 12 / 365);
    mechanisms.push(`Households currently plan RM${(demand.spending / 1e9).toFixed(2)}bn/day of funded spending before separately granted credit. This assumes the configured transfers are paid.`,
      `Spending propensity is ${(hh.mpc * 100).toFixed(1)}%; confidence is ${(hh.confidence * 100).toFixed(0)}/100. Precautionary saving is bounded; actual income still matters.`,
      'Output depends on household purchases, public spending, private investment and exports, constrained by capital and workers. Share trades never create GDP.');
    caveat = 'Contributions reconcile nominal value-added changes, normalised for month length. They are not contributions to real growth or policy-effect forecasts.';
  } else {
    const f = s.government.mtd;
    const opening = last?.treasury ?? s.baseline.openingTreasury; // MYR, not sen
    summary = `Treasury RM${(treasuryMYR(s.government) / 1e9).toFixed(3)}bn; change RM${((treasuryMYR(s.government) - opening) / 1e9).toFixed(3)}bn.`;
    period = 'This month so far: cash movements';
    parts.push({ label: 'Public receipts', value: revenueOf(f), unit: 'MYR' }, { label: 'Paid outlays', value: -outlaysOf(f), unit: 'MYR' },
      { label: 'New borrowing', value: f.borrowing, unit: 'MYR' }, { label: 'Principal repayments', value: -f.principal, unit: 'MYR' },
      { label: 'Net fund and deal-escrow transfers', value: f.swfTransferIn - f.swfContribution + f.dealEscrowIn - f.dealEscrowOut, unit: 'MYR' });
    mechanisms.push('Corporate and property taxes settle at month-end; daily spending can reduce cash before those receipts arrive.',
      'Borrowing provides cash and an equal liability. Fund transfers move existing public money; they are not new wealth.');
    caveat = 'Cash movements include financing. The budget deficit excludes borrowing, principal repayments and sovereign-fund transfers.';
  }
  parts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { title: EXPLAIN_LABELS[metric], summary, period, parts, mechanisms, caveat,
    pending: [...s.government.pending.map(p => `${p.label} · effective ${formatKL(p.effectiveMin).date}`),
      ...s.government.projects.filter(p => p.status === 'building').map(p => `${p.name}: ${(p.work / p.cost * 100).toFixed(0)}% built; planned completion ${klDayLabel(p.startDay + p.durationDays)}. Benefits require completion; funding and costs can delay it.`)],
    policies: s.policyLog.slice(-4).reverse().map(p => `${p.label} · effective ${formatKL(p.effectiveMin).date}`),
    events: s.events.active.map(e => `${e.title} · direct effects end ${klDayLabel(e.endDay)}; recovery can lag.`),
  };
}
