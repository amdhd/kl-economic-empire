// Year in review and next-year budget plan (D-095). Read-only: everything is derived from the closed monthly reports,
// so it works for any save and never touches the simulation or the rng.
import { budgetFor, BUDGET_LABELS } from '../data/economic-baseline';
import type { BudgetCategory, BudgetPolicy, GameState, MonthlyReport } from '../types/game';
import { gdpHistory } from './gdp-history';
import { debtMYR, gdpForRatios, outlaysOf, ratingLabel, ratingScore, revenueOf } from './government';
import { daysInMonth } from './time';

export const BUDGET_CATEGORIES = Object.keys(BUDGET_LABELS) as BudgetCategory[];

const yearOf = (r: MonthlyReport) => Math.floor(r.monthKey / 12);
const isDecember = (r: MonthlyReport) => r.monthKey % 12 === 11;
const annualFactor = (r: MonthlyReport) => 365 / daysInMonth(yearOf(r), (r.monthKey % 12) + 1);
const sum = (rs: MonthlyReport[], f: (r: MonthlyReport) => number) => rs.reduce((a, r) => a + f(r), 0);

/** The latest calendar year whose December close is in the reports, or null before the first year ends. */
export function latestClosedYear(s: GameState): number | null {
  for (let i = s.reports.length - 1; i >= 0; i--) if (isDecember(s.reports[i])) return yearOf(s.reports[i]);
  return null;
}

export interface YearReview {
  year: number;
  /** Months of this year in the reports (12 unless the campaign began part-way through the year). */
  months: number;
  gdp: { usdStart: number; usdEnd: number; usdChangePct: number; myrEnd: number; myrChangePct: number; realGrowth: number };
  inflationYoY: number;
  unemployment: { start: number; end: number };
  approval: { start: number; end: number };
  score: { start: number; end: number };
  fiscal: {
    revenue: number; operating: number; capital: number; interest: number; other: number; outlays: number;
    /** Deficit as a share of December's annualised GDP; negative is a surplus. */
    deficit: number; deficitPct: number;
    debtStart: number; debtEnd: number; debtToGdp: number; treasury: number; rating: string; ratingScore: number;
  };
  fundNav: { start: number; end: number };
  events: string[];
  /** Plain sentences, best news first. */
  headlines: string[];
}

export function yearReview(s: GameState, year: number): YearReview | null {
  const rs = s.reports.filter((r) => yearOf(r) === year);
  if (!rs.length) return null;
  const first = rs[0], last = rs[rs.length - 1];
  const prev = s.reports.find((r) => r.monthKey === first.monthKey - 1);
  const hist = gdpHistory(s);
  const at = (key: number) => hist.find((m) => m.monthKey === key);
  const open = at(first.monthKey - 1) ?? hist[0];
  const close = at(last.monthKey) ?? hist[hist.length - 1];
  const realStart = prev ? prev.realGdp * annualFactor(prev) : s.baseline.realGdpAnnual;
  const realEnd = last.realGdp * annualFactor(last);
  const gdpNow = last.nominalGdp * annualFactor(last);
  const revenue = sum(rs, (r) => revenueOf(r.gov));
  const outlays = sum(rs, (r) => outlaysOf(r.gov));
  const operating = sum(rs, (r) => r.gov.opex), capital = sum(rs, (r) => r.gov.capex), interest = sum(rs, (r) => r.gov.interest);
  const deficit = outlays - revenue;
  const debtStart = prev ? prev.debt : debtMYR(s.government) - sum(rs, (r) => r.gov.borrowing - r.gov.principal);
  const out: YearReview = {
    year, months: rs.length,
    gdp: {
      usdStart: open.usd, usdEnd: close.usd, usdChangePct: open.usd > 0 ? close.usd / open.usd - 1 : 0,
      myrEnd: close.myr, myrChangePct: open.myr > 0 ? close.myr / open.myr - 1 : 0,
      realGrowth: realStart > 0 ? realEnd / realStart - 1 : 0,
    },
    inflationYoY: last.inflationYoY,
    unemployment: { start: prev?.unemployment ?? first.unemployment, end: last.unemployment },
    approval: { start: prev?.approval ?? first.approval, end: last.approval },
    score: { start: prev?.score.total ?? first.score.total, end: last.score.total },
    fiscal: {
      revenue, operating, capital, interest, other: Math.max(0, outlays - operating - capital - interest), outlays,
      deficit, deficitPct: gdpNow > 0 ? deficit / gdpNow : 0,
      debtStart, debtEnd: last.debt, debtToGdp: gdpNow > 0 ? last.debt / gdpNow : 0, treasury: last.treasury,
      rating: ratingLabel(s.government.creditRating), ratingScore: s.government.creditRating,
    },
    fundNav: { start: prev?.fundNav ?? first.fundNav, end: last.fundNav },
    events: [...new Set(rs.flatMap((r) => r.events))].slice(0, 8),
    headlines: [],
  };
  out.headlines = headlinesFor(out);
  return out;
}

function headlinesFor(r: YearReview): string[] {
  const h: string[] = [];
  const bn = (v: number) => `RM${(Math.abs(v) / 1e9).toFixed(Math.abs(v) >= 1e11 ? 0 : 1)}bn`;
  const pc = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`;
  h.push(`The economy ${r.gdp.realGrowth >= 0 ? 'grew' : 'shrank'} ${pc(r.gdp.realGrowth)} in real terms; in US dollars GDP ${r.gdp.usdChangePct >= 0 ? 'rose' : 'fell'} ${pc(r.gdp.usdChangePct)}.`);
  h.push(`Prices rose ${(r.inflationYoY * 100).toFixed(1)}% over the year and unemployment ended at ${(r.unemployment.end * 100).toFixed(1)}% (${r.unemployment.end <= r.unemployment.start ? 'down' : 'up'} from ${(r.unemployment.start * 100).toFixed(1)}%).`);
  h.push(r.fiscal.deficit > 0
    ? `The government ran a deficit of ${bn(r.fiscal.deficit)} (${pc(r.fiscal.deficitPct)} of GDP); debt ended at ${pc(r.fiscal.debtToGdp)} of GDP, rated ${r.fiscal.rating}.`
    : `The government ran a surplus of ${bn(r.fiscal.deficit)} (${pc(r.fiscal.deficitPct)} of GDP); debt ended at ${pc(r.fiscal.debtToGdp)} of GDP, rated ${r.fiscal.rating}.`);
  const da = r.approval.end - r.approval.start;
  if (Math.abs(da) >= 0.5) h.push(`Approval ${da > 0 ? 'rose' : 'fell'} ${Math.abs(da).toFixed(1)} points to ${r.approval.end.toFixed(0)}.`);
  return h;
}

// --- Next year's budget plan -----------------------------------------------------------------------------------------

export interface BudgetLine {
  category: BudgetCategory;
  label: string;
  /** MYR per year: the appropriation in force or queued now, and the 2027 baseline for scale. */
  current: number;
  baseline: number;
  /** Service-quality target score (0–98) that this appropriation supports, for health, services and safety. */
  outcome?: { now: number; proposed: number };
}

export interface BudgetOutlook {
  revenue: number;
  outlays: number;
  deficit: number;
  deficitPct: number;
  debtToGdp: number;
  rating: string;
  ratingScore: number;
  /** Change in annual operating appropriations against the current run rate. */
  budgetChange: number;
}

/** Appropriations in force today, including the last one queued for tomorrow, in MYR per month. */
export function currentBudget(s: GameState): BudgetPolicy {
  const out = { ...s.government.policies.budget };
  for (const p of s.government.pending) if (p.kind === 'budget') Object.assign(out, p.patch);
  return out;
}

export function budgetLines(s: GameState, proposed: BudgetPolicy): BudgetLine[] {
  const now = currentBudget(s), base = budgetFor(s), cpi = s.indicators.cpi / 100;
  const target = (k: BudgetCategory, monthly: number) => 62 * Math.pow(Math.max(0, monthly / base[k] / cpi), 0.6);
  return BUDGET_CATEGORIES.map((k) => ({
    category: k, label: BUDGET_LABELS[k], current: now[k] * 12, baseline: base[k] * 12,
    outcome: k === 'health' || k === 'services' || k === 'safety' ? { now: Math.min(98, target(k, now[k])), proposed: Math.min(98, target(k, proposed[k])) } : undefined,
  }));
}

/** Annual escalation of a line's active ministry plan (the inherited path indexes monthly), or 0 when it has none. */
export function planGrowth(s: GameState, k: BudgetCategory): number {
  const plan = s.controls.plans.find((p) => p.category === k);
  return plan ? (plan.everyMonths === 1 ? Math.pow(1 + plan.growth, 12) - 1 : plan.growth) : 0;
}

/** The same budget with every line moved by `rate`, a simple way to hold real spending steady. */
export function indexedBudget(s: GameState, rate: number): BudgetPolicy {
  const now = currentBudget(s);
  return Object.fromEntries(BUDGET_CATEGORIES.map((k) => [k, Math.round((now[k] * (1 + rate)) / 1e6) * 1e6])) as BudgetPolicy;
}

/**
 * Rough next-year fiscal outlook for a proposed budget. A line left unchanged keeps its ministry plan's escalation. Revenue grows with last year's nominal GDP; capital, interest
 * and subsidies are carried at last year's level; operating spending is the proposed appropriations plus whatever
 * December's operating outlay exceeded the appropriations by (maintenance, supply contracts, arrears). The rating
 * uses the real rating formula on the projected deficit and debt. It is an estimate, not a forecast.
 */
export function budgetOutlook(s: GameState, proposed: BudgetPolicy): BudgetOutlook | null {
  const rs = s.reports.slice(-12);
  if (rs.length < 3) return null;
  const last = rs[rs.length - 1];
  const gdpNow = Math.max(gdpForRatios(s), 1);
  const gdpFirst = rs[0].nominalGdp * annualFactor(rs[0]);
  const g = Math.min(0.3, Math.max(0, gdpFirst > 0 ? Math.pow((last.nominalGdp * annualFactor(last)) / gdpFirst, 12 / (rs.length - 1)) - 1 : 0.05));
  const scale = 12 / rs.length;
  const revenue = sum(rs, (r) => revenueOf(r.gov)) * scale * (1 + g);
  const opex12 = sum(rs, (r) => r.gov.opex) * scale;
  const other = sum(rs, (r) => outlaysOf(r.gov)) * scale - opex12;
  const now = currentBudget(s);
  const approps = (b: BudgetPolicy) => BUDGET_CATEGORIES.reduce((a, k) => a + b[k] * 12, 0);
  // A line left at today's value keeps its ministry plan, which raises it through the year (average level ≈ half the rise).
  const planned = (b: BudgetPolicy) => BUDGET_CATEGORIES.reduce((a, k) => a + b[k] * 12 * (b[k] === now[k] ? 1 + planGrowth(s, k) / 2 : 1), 0);
  const residual = Math.max(0, last.gov.opex * annualFactor(last) - approps(now));
  const outlays = other + planned(proposed) + residual;
  const deficit = outlays - revenue;
  const gdpNext = gdpNow * (1 + g);
  const debtToGdp = (debtMYR(s.government) + deficit) / gdpNext;
  const score = ratingScore(s, Math.max(0, debtToGdp), deficit / gdpNext, 0);
  return { revenue, outlays, deficit, deficitPct: deficit / gdpNext, debtToGdp, rating: ratingLabel(score), ratingScore: score, budgetChange: planned(proposed) - approps(now) };
}
