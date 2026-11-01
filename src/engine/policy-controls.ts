import { money } from '../utils/format';
import { BUDGET_LABELS, budgetFor, SECTOR_IDS } from '../data/economic-baseline';
import type { GameState, SectorId } from '../types/game';
import type { Command } from './game';
import { klDay, klParts, klToEpochMin, monthKey } from './time';
import { clamp, pushBounded } from './util';
import { interveneFx } from './trade-fx';
import { zoneTaxRelief } from './policy';

export const initialControls = (): GameState['controls'] => ({ lastTaxReliefMYR: 0, incentives: [], plans: [], outcomes: { health: 62, services: 62, safety: 62 }, debt: { newTermMonths: 120, averageMonths: 120, refinance: 1 }, fxBand: { enabled: false, lower: 3.8, upper: 4.5, dailyUSD: 100e6, reserveFloorUSD: 80e9, status: 'Disabled' } });
export function validateControls(c: GameState['controls']) {
  if (!c || !(c.lastTaxReliefMYR >= 0) || !Array.isArray(c.incentives) || !Array.isArray(c.plans) || !c.outcomes || !c.debt || !c.fxBand
    || ![36,120,240].includes(c.debt.newTermMonths) || !(c.debt.averageMonths >= 1 && c.debt.averageMonths <= 240)
    || !(c.debt.refinance >= 0 && c.debt.refinance <= 1)
    || !(c.fxBand.lower >= 3.2 && c.fxBand.upper <= 6.5 && c.fxBand.upper > c.fxBand.lower)
    || !(c.fxBand.dailyUSD > 0 && c.fxBand.dailyUSD <= 1e9) || !(c.fxBand.reserveFloorUSD >= 0 && c.fxBand.reserveFloorUSD <= 200e9)
    || typeof c.fxBand.enabled !== 'boolean' || Object.values(c.outcomes).some(v => !(v >= 0 && v <= 100))
    || c.incentives.some(i => !SECTOR_IDS.includes(i.sector) || !(i.cut >= 0 && i.cut <= .15) || !Number.isSafeInteger(i.startMin) || !Number.isSafeInteger(i.endMin) || i.endMin <= i.startMin)
    || c.plans.some(p => !(p.category in BUDGET_LABELS) || !(p.monthly >= 0 && p.monthly <= 50e9) || !(p.growth >= -.1 && p.growth <= .15) || ![undefined, 1, 12].includes(p.everyMonths) || !Number.isInteger(p.remaining) || p.remaining < 1 || p.remaining > (p.everyMonths === 1 ? 60 : 5) || !Number.isSafeInteger(p.nextMonth))) throw new Error('Invalid policy controls');
}
export function sectorTax(s: GameState, sector: SectorId, atMin = s.clock.hour * 60 - 1, statutoryRate = s.government.policies.tax.corporate): number {
  const incentive = s.controls.incentives.find(i => i.sector === sector && i.startMin <= atMin && atMin < i.endMin);
  // Free-zone firms (D-103) are excused most corporate tax on the zone share of the sector.
  return Math.max(0, statutoryRate - (incentive?.cut ?? 0)) * (1 - zoneTaxRelief(s, sector));
}
export function controlCommand(s: GameState, cmd: Command, atMin: number) {
  const c = structuredClone(s.controls), p = klParts(atMin);
  const next = p.month === 12 ? klToEpochMin(p.year+1,1,1) : klToEpochMin(p.year,p.month+1,1);
  let label: string;
  if (cmd.type === 'sectorIncentive') {
    if (!SECTOR_IDS.includes(cmd.sector) || !Number.isFinite(cmd.cut) || cmd.cut < 0 || cmd.cut > .15 || !Number.isInteger(cmd.months) || cmd.months < 1 || cmd.months > 60) return { ok:false, message:'Choose a sector, 0–15 percentage points and 1–60 months.' };
    if (c.incentives.some(i => i.sector === cmd.sector && i.endMin > atMin)) return { ok:false, message:'This sector already has an active or scheduled incentive. Let it expire before replacing it.' };
    const start = klParts(next), endMonth = start.year*12+start.month-1+cmd.months;
    c.incentives = c.incentives.filter(i => i.endMin > atMin);
    c.incentives.push({ sector:cmd.sector, cut:cmd.cut, startMin:next, endMin:klToEpochMin(Math.floor(endMonth/12),endMonth%12+1,1) });
    label = `Sector ${cmd.sector}: ${(cmd.cut*100).toFixed(1)}pp corporate tax relief for ${cmd.months} months, from next month; receipts forgone on eligible profits`;
  } else if (cmd.type === 'ministryPlan') {
    if (!(cmd.category in BUDGET_LABELS) || !Number.isFinite(cmd.monthly) || cmd.monthly < 0 || cmd.monthly > 50e9 || !Number.isFinite(cmd.growth) || cmd.growth < -.1 || cmd.growth > .15 || !Number.isInteger(cmd.years) || cmd.years < 1 || cmd.years > 5 || cmd.monthly*Math.pow(1+Math.max(0,cmd.growth),cmd.years-1)>50e9) return { ok:false,message:'Plan: RM0–50bn/month, annual growth −10% to15%, duration1–5 years; every year must fit the budget limit.' };
    c.plans = c.plans.filter(p => p.category !== cmd.category);
    c.plans.push({category:cmd.category, monthly:cmd.monthly, growth:cmd.growth, remaining:cmd.years, nextMonth:monthKey(klParts(next).year,klParts(next).month)});
    label = `${BUDGET_LABELS[cmd.category]}: ${cmd.years}-year plan, ${money(cmd.monthly)}/month, ${(cmd.growth*100).toFixed(1)}% annual escalation, from next month`;
  } else if (cmd.type === 'cancelMinistryPlan') { c.plans = c.plans.filter(p => p.category !== cmd.category); label = 'Cancelled future budget escalations; current appropriation retained';
  } else if (cmd.type === 'debtStrategy') { c.debt.newTermMonths = cmd.termMonths; c.debt.refinance = cmd.refinance; label = `New debt amortises over ${cmd.termMonths/12} years; refinance ${(cmd.refinance*100).toFixed(0)}% of principal paid`;
  } else if (cmd.type === 'fxBand') { c.fxBand = {enabled:cmd.enabled,lower:cmd.lower,upper:cmd.upper,dailyUSD:cmd.dailyUSD,reserveFloorUSD:cmd.reserveFloorUSD,status:cmd.enabled?'Armed for next daily fixing':'Disabled'}; label = `Automatic FX band ${cmd.enabled?'enabled':'disabled'}: ${cmd.lower}–${cmd.upper} MYR/USD`;
  } else return {ok:false,message:'Unknown control'};
  try { validateControls(c); } catch { return {ok:false,message:'Invalid control settings'}; }
  s.controls = c;
  pushBounded(s.policyLog,{atMin,effectiveMin:cmd.type === 'sectorIncentive' || cmd.type === 'ministryPlan' ? next : atMin,label},2000);
  return {ok:true,message:label};
}
export function applyPlans(s: GameState) {
  const p = klParts(s.clock.hour*60), key = monthKey(p.year,p.month);
  for (const plan of s.controls.plans) if (plan.nextMonth <= key) {
    s.government.policies.budget[plan.category] = plan.monthly;
    plan.monthly *= 1+plan.growth; plan.nextMonth += plan.everyMonths ?? 12; plan.remaining--;
    // Monthly indexation steps are disclosed once at campaign creation rather than logged every month.
    if (plan.everyMonths !== 1) pushBounded(s.policyLog,{atMin:s.clock.hour*60,effectiveMin:s.clock.hour*60,label:`Budget plan applied: ${BUDGET_LABELS[plan.category]}`},2000);
  }
  s.controls.plans = s.controls.plans.filter(p => p.remaining>0);
}
export function ministryOutcomes(s: GameState) {
  const base = budgetFor(s), gov = s.government;
  for (const k of ['health','services','safety'] as const) {
    const real = gov.policies.budget[k]/base[k]/(s.indicators.cpi/100)*clamp(1-gov.mtdArrearsDays/30,0,1);
    const target = clamp(62*Math.pow(Math.max(0,real),.6)+gov.serviceBoost*100,0,98);
    s.controls.outcomes[k] += .25*(target-s.controls.outcomes[k]);
  }
}
export function automaticFx(s: GameState) {
  const b = s.controls.fxBand;
  if (!b.enabled) return;
  const f = s.external.myrPerUsd;
  if (f >= b.lower && f <= b.upper) {b.status='Inside band; no intervention'; return;}
  const side = f>b.upper?'sellUSD':'buyUSD';
  const used = s.centralBank.lastInterventionDay === klDay(s.clock.hour*60) ? s.centralBank.dailyUsdUsed : 0;
  const available = side === 'sellUSD' ? Math.max(0,s.centralBank.usdReserves/100-b.reserveFloorUSD) : s.centralBank.myrCash/100/(f*1.002);
  const amount = Math.floor(Math.min(b.dailyUSD,Math.max(0,1e9-used),available)*100);
  if (amount<=0) { b.status='Inventory floor or daily limit prevents intervention'; return; }
  const res = interveneFx(s,side,amount,s.clock.hour*60);
  b.status=res.ok?`${side}: $${(amount/100).toFixed(0)} settled; pressure enters next fixing`:res.message;
}
