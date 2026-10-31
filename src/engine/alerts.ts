import type { GameState } from '../types/game';
import { outlaysOf, treasuryMYR } from './government';
import { daysInMonth } from './time';

export type AlertRule = 'treasury' | 'unemployment' | 'housing' | 'projects' | 'deals';
export interface AlertPreferences {
  enabled: Record<Exclude<AlertRule,'deals'>, boolean> & {deals?:boolean};
  runwayDays: number;
  unemploymentPct: number;
  housingPressurePct: number;
  projectOverrunPct: number;
  pauseOnCritical: boolean;
  detail: 'brief' | 'detailed';
}
export const DEFAULT_ALERTS: AlertPreferences = {
  enabled: { treasury: true, unemployment: true, housing: true, projects: true, deals:true },
  runwayDays: 14, unemploymentPct: 6, housingPressurePct: 25, projectOverrunPct: 20,
  pauseOnCritical: false, detail: 'brief',
};
export interface EconomicAlert { key: string; rule: AlertRule; severity: 'warning' | 'critical'; title: string; detail: string; }
export type AlertMemory = Record<string, EconomicAlert['severity']>;

export function validAlertPreferences(value: unknown): value is AlertPreferences {
  if (!value || typeof value !== 'object') return false;
  const p = value as AlertPreferences;
  const range = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
  return !!p.enabled && (['treasury', 'unemployment', 'housing', 'projects'] as const).every(k => typeof p.enabled[k] === 'boolean')
    && (p.enabled.deals===undefined||typeof p.enabled.deals==='boolean')
    && range(p.runwayDays, 1, 90) && range(p.unemploymentPct, 1, 30) && range(p.housingPressurePct, 1, 100)
    && range(p.projectOverrunPct, 1, 100) && typeof p.pauseOnCritical === 'boolean' && ['brief', 'detailed'].includes(p.detail);
}

/** Static gross-outlay coverage, not a predicted insolvency date; no new revenue/borrowing assumed. */
export function treasuryRunway(s: GameState): number | null {
  const last = s.reports.at(-1);
  const days = last ? daysInMonth(Math.floor(last.monthKey / 12), last.monthKey % 12 + 1) : s.scheduler.mtdDays;
  const outlays = last ? outlaysOf(last.gov) : outlaysOf(s.government.mtd);
  return days > 0 && outlays > 0 ? treasuryMYR(s.government) / (outlays / days) : null;
}

/** Read-only daily signals. A 10% release margin prevents repeated alerts near a threshold. */
export function economicAlerts(s: GameState, p: AlertPreferences, previous: AlertMemory = {}): EconomicAlert[] {
  const alerts: EconomicAlert[] = [];
  const addHigh = (key: string, rule: AlertRule, value: number, threshold: number, critical: number, title: string, detail: string) => {
    if (p.enabled[rule] && value >= threshold * (previous[key] ? 0.9 : 1)) alerts.push({ key, rule,
      severity: value >= critical || (previous[key] === 'critical' && value >= critical * 0.9) ? 'critical' : 'warning', title, detail });
  };
  const runway = treasuryRunway(s);
  if (p.enabled.treasury && runway !== null && runway <= p.runwayDays * (previous.treasury ? 1.1 : 1)) alerts.push({ key: 'treasury', rule: 'treasury',
    severity: runway <= p.runwayDays / 2 || (previous.treasury === 'critical' && runway <= p.runwayDays * 0.55) ? 'critical' : 'warning',
    title: `Treasury covers ${runway.toFixed(1)} days of spending`, detail: 'Cash divided by recent paid daily outlays. This excludes future tax receipts and borrowing; it is not a forecast of insolvency. Review Treasury & debt.' });
  const u = 100 * (1 - s.households.employed / s.households.laborForce);
  addHigh('unemployment', 'unemployment', u, p.unemploymentPct, p.unemploymentPct + 2,
    `Unemployment is ${u.toFixed(1)}%`, 'Hiring responds to demand with a weekly lag. Review the unemployment explanation and credit conditions before changing policy.');
  const pressure = 100 * (s.households.rentIndex / s.households.wageIndex - 1);
  addHigh('housing', 'housing', pressure, p.housingPressurePct, p.housingPressurePct + 15,
    `Rents outpace wages by ${pressure.toFixed(1)}%`, 'Rent-index growth relative to wage-index growth since opening. This is an affordability proxy, not a measured rent-to-income share.');
  for (const project of s.government.projects.filter(x => x.status === 'building')) {
    const estimated = project.spent + Math.max(0, project.cost - project.work) * s.sectors.prop.price;
    const overrun = 100 * (estimated / project.cost - 1);
    addHigh(`project:${project.id}`, 'projects', overrun, p.projectOverrunPct, p.projectOverrunPct + 20,
      `${project.name}: estimated cost +${overrun.toFixed(0)}%`, 'Spent to date plus remaining work at today’s construction prices, compared with base cost. Future prices and funding can change this estimate.');
  }
  if(p.enabled.deals!==false && s.deals?.enabled)for(const d of s.deals.items){
    const push=(suffix:string,severity:EconomicAlert['severity'],title:string,detail:string)=>alerts.push({key:`deal:${d.id}:${suffix}`,rule:'deals',severity,title,detail});
    if(['opportunity','negotiating'].includes(d.status)&&d.deadline-s.scheduler.lastDay<=3&&d.deadline>s.scheduler.lastDay)push('expiry','warning',`${d.name}: decision deadline near`,'Review, decline or let the offer expire. The clock only advances while playing.');
    if(d.arrearsMinor>0)push('arrears','critical',`${d.name}: unpaid contractual claim`,'This liability remains recorded even after termination. Inspect funding and the downside in Deal Room.');
    if(d.status==='failed'&&d.paidMinor>0)push('failure','warning',`${d.name}: agreement failed`,'Review the recorded loss, recoverable claims and any unpaid obligations.');
    const e=d.enterprise;
    if(d.status==='active'&&e){
      if(e.cashMinor<e.costAnnualMinor/365*30)push('runway','critical',`${d.name}: less than 30 days gross-cost cash coverage`,'This is a static runway warning, excluding future receipts. Additional support is optional and uses real available public cash.');
      if(d.kind==='startup'&&!e.roundDone&&s.scheduler.lastDay>=e.nextRoundDay)push('round','warning',`${d.name}: financing round open`,'Join using SWF cash or accept dilution. The outside round proceeds after 30 days.');
    }
  }
  return alerts;
}

export function alertTransitions(previous: AlertMemory, current: EconomicAlert[]) {
  return {
    memory: Object.fromEntries(current.map(a => [a.key, a.severity])) as AlertMemory,
    fresh: current.filter(a => !previous[a.key] || (previous[a.key] === 'warning' && a.severity === 'critical')),
  };
}
