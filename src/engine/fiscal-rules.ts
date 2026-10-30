// Fiscal rules modelled on Malaysia's Public Finance and Fiscal Responsibility Act 2023: a deficit
// ceiling, a debt ceiling and a golden rule (borrow only for development). The rules are not
// self-enforcing; compliance builds credibility, which lowers the sovereign risk premium, and an
// escape clause allows a justified, temporary breach. See docs/economy-model.md "Fiscal rules".
import { FISCAL_RULE0, PUBLIC_CAPITAL_DEPRECIATION, REVENUE_SEMI_ELASTICITY } from '../data/world';
import type { FiscalMonth, FiscalRule, FiscalState, GameState, GovMonthFlows, MonthlyReport } from '../types/game';
import { EVENT_BY_ID } from '../data/events';
import { eventIsActive } from './events';
import { capitalOf, interestOf, outlaysOf, revenueOf } from './government';
import { clamp, news, pushBounded } from './util';

export const ESCAPE_MAX_MONTHS = 18;
const GLIDE_MONTHS = 24;

export function initialFiscal(developmentAnnual: number, openingDeficit: number): FiscalState {
  return {
    developmentAnnual,
    publicCapital: developmentAnnual / PUBLIC_CAPITAL_DEPRECIATION,
    publicCapital0: Math.max(1, developmentAnnual / PUBLIC_CAPITAL_DEPRECIATION),
    rule: { ...FISCAL_RULE0 },
    credibility: 60,
    escape: null,
    openingDeficit,
    history: [],
  };
}

/** Deficit target for a month: a straight glide from the opening deficit to the ceiling over two years. */
export function deficitTarget(f: FiscalState, monthsElapsed: number): number {
  const start = Math.max(f.openingDeficit, f.rule.deficitCap);
  return start + (f.rule.deficitCap - start) * clamp(monthsElapsed / GLIDE_MONTHS, 0, 1);
}

function windowFlows(reports: MonthlyReport[]): { flows: GovMonthFlows[]; days: number } {
  const recent = reports.slice(-12);
  const days = recent.reduce((d, r) => d + daysOf(r.monthKey), 0);
  return { flows: recent.map((r) => r.gov), days };
}
const daysOf = (key: number) => new Date(Date.UTC(Math.floor(key / 12), (key % 12) + 1, 0)).getUTCDate();

/** Whether an escape is justified now: a recession-sized output gap or an active adverse macro shock. */
export function escapeJustified(s: GameState, outputGap: number): boolean {
  if (outputGap < -0.02) return true;
  const today = s.scheduler.lastDay;
  return s.events.active.some((ev) => {
    const t = EVENT_BY_ID[ev.templateId];
    return t && !t.company && t.tone === 'bad' && eventIsActive(ev, today);
  });
}

/** Month close: measure the fiscal position on a trailing 12-month window and update credibility. */
export function updateFiscal(s: GameState, monthKey: number, outputGap: number): FiscalMonth {
  const f = s.fiscal;
  const gdp = Math.max(s.indicators.nominalGdpAnnual, 1e9);
  const { flows, days } = windowFlows(s.reports);
  const annual = 365 / Math.max(days, 1);
  const revenue = flows.reduce((a, g) => a + revenueOf(g), 0) * annual;
  const outlays = flows.reduce((a, g) => a + outlaysOf(g), 0) * annual;
  const interest = flows.reduce((a, g) => a + interestOf(g), 0) * annual;
  const capital = flows.reduce((a, g) => a + capitalOf(g), 0) * annual;
  const deficit = (outlays - revenue) / gdp;
  const currentBalance = (revenue - (outlays - capital)) / gdp;
  // Cyclically adjusted: a negative output gap depresses revenue, so the structural deficit is smaller.
  const structuralDeficit = deficit + REVENUE_SEMI_ELASTICITY * outputGap;
  const debt = s.indicators.debtToGdp;
  const prevDebt = f.history.length >= 12 ? f.history[f.history.length - 12].debt : f.history[0]?.debt ?? debt;
  const elapsed = s.reports.length;
  const target = deficitTarget(f, elapsed);
  const compliant = {
    deficit: deficit <= target + 1e-4,
    debt: debt <= f.rule.debtCap + 1e-4 || debt < prevDebt - 1e-4,
    golden: !f.rule.goldenRule || currentBalance >= -1e-4,
  };
  // Credibility moves 15% a month toward a target set by compliance; a justified escape protects it.
  let goal = 35 + (compliant.deficit ? 30 : -20 * Math.min(1, (deficit - target) / 0.02)) + (compliant.debt ? 20 : 0) + (compliant.golden ? 15 : 0);
  if (f.escape?.active) {
    goal = f.escape.justified ? Math.max(goal, 60) : Math.min(goal, 40);
    if (elapsed - f.escape.sinceMonth >= ESCAPE_MAX_MONTHS) {
      f.escape = null;
      news(s, { kind: 'policy', tone: 'neutral', title: 'Fiscal escape clause expired', body: `After ${ESCAPE_MAX_MONTHS} months the rules apply again.` });
    }
  }
  f.credibility = clamp(f.credibility + 0.15 * (clamp(goal, 0, 100) - f.credibility), 0, 100);
  const month: FiscalMonth = { monthKey, revenue, outlays, deficit, primaryDeficit: deficit - interest / gdp, currentBalance, structuralDeficit, debt, target, compliant, credibility: f.credibility };
  const prev = f.history.at(-1);
  pushBounded(f.history, month, 60);
  if (prev && prev.compliant.deficit && !compliant.deficit && !f.escape?.active) news(s, { kind: 'policy', tone: 'bad', title: 'Fiscal rule breached', body: `Deficit ${(deficit * 100).toFixed(1)}% of GDP against a ${(target * 100).toFixed(1)}% target. Credibility falls while the breach lasts.` });
  return month;
}

/** Sovereign risk premium from credibility: ±50bp around neutral credibility of 60. */
export function credibilityPremium(s: GameState): number {
  const c = s.fiscal.credibility;
  return c < 60 ? 0.005 * (60 - c) / 60 : -0.002 * (c - 60) / 40;
}

export function setFiscalRule(s: GameState, rule: Partial<FiscalRule>): { ok: boolean; message: string } {
  const f = s.fiscal;
  const next = { ...f.rule, ...rule };
  if (!(next.deficitCap >= 0 && next.deficitCap <= 0.1) || !(next.debtCap >= 0.3 && next.debtCap <= 1.2) || typeof next.goldenRule !== 'boolean') return { ok: false, message: 'Deficit ceiling 0–10% of GDP, debt ceiling 30–120% of GDP.' };
  // Loosening a rule outside an escape is read by markets as abandoning it.
  const loosen = Math.max(0, next.deficitCap - f.rule.deficitCap) * 1000 + Math.max(0, next.debtCap - f.rule.debtCap) * 200 + (f.rule.goldenRule && !next.goldenRule ? 10 : 0);
  if (loosen > 0) f.credibility = clamp(f.credibility - 5 - loosen, 0, 100);
  f.rule = next;
  return { ok: true, message: loosen > 0 ? `Fiscal rule loosened. Credibility fell to ${f.credibility.toFixed(0)}.` : 'Fiscal rule updated.' };
}

export function invokeEscape(s: GameState, outputGap: number): { ok: boolean; message: string } {
  const f = s.fiscal;
  if (f.escape?.active) return { ok: false, message: 'The escape clause is already active.' };
  const justified = escapeJustified(s, outputGap);
  f.escape = { active: true, sinceMonth: s.reports.length, justified };
  f.credibility = clamp(f.credibility - (justified ? 2 : 20), 0, 100);
  return { ok: true, message: justified ? 'Escape clause invoked during a downturn. Markets accept a temporary breach.' : 'Escape clause invoked without a downturn. Markets treat it as abandoning the rules; credibility fell sharply.' };
}

export function exitEscape(s: GameState): { ok: boolean; message: string } {
  if (!s.fiscal.escape?.active) return { ok: false, message: 'No escape clause is active.' };
  s.fiscal.escape = null;
  s.fiscal.credibility = clamp(s.fiscal.credibility + 3, 0, 100);
  return { ok: true, message: 'Escape clause ended; the fiscal rules apply again.' };
}

/** Public capital productivity factor: (K/K0)^elasticity, 1 at opening. */
export const publicCapitalFactor = (s: GameState, elasticity: number) =>
  s.fiscal.publicCapital0 > 1 ? Math.pow(Math.max(s.fiscal.publicCapital, 1) / s.fiscal.publicCapital0, elasticity) : 1;

export function validateFiscal(f: FiscalState): void {
  if (!f || !(f.developmentAnnual >= 0 && f.developmentAnnual <= 300e9) || !(f.publicCapital >= 0) || !(f.publicCapital0 >= 1) || !(f.credibility >= 0 && f.credibility <= 100)
    || !f.rule || !(f.rule.deficitCap >= 0 && f.rule.deficitCap <= 0.1) || !(f.rule.debtCap >= 0.3 && f.rule.debtCap <= 1.2) || typeof f.rule.goldenRule !== 'boolean'
    || !Array.isArray(f.history) || !Number.isFinite(f.openingDeficit)) throw new Error('Corrupt save: invalid fiscal state');
}
