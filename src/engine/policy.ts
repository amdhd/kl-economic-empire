// Toggle-and-slider policy levers (schema 9, model 3; D-059). Pure and deterministic: no RNG.
// Each lever has a phase cycle — announced (decision day) → effective (tomorrow or the 1st of next month) → phasing in
// over `rampDays` → full effect. Announcements move expectations (FDI attractiveness) at once; economic effects follow
// the ramp; second-round effects (prices, hiring, wages, investment) then play out through the existing lags.
import { SECTOR_IDS } from '../data/economic-baseline';
import type { GameState, LeverId, PolicyLever, PolicyState, SectorId } from '../types/game';
import { boomOn, leverRampDays } from '../data/boom';
import { post } from './government';
import { fiscalFx, householdTaxDaily } from './fiscal-levers';
import { clamp, news, pushBounded } from './util';
import { daysInMonth, klDayStartMin, klParts } from './time';

export type LeverGroup = 'ai' | 'fdi' | 'labour' | 'capital' | 'green' | 'hub' | 'pension' | 'subsidy' | 'tax';
export interface LeverSpec {
  group: LeverGroup;
  label: string;
  kind: 'slider' | 'toggle';
  min: number;
  max: number;
  step: number;
  initial: number;
  unit: 'RMbnYr' | 'share' | 'RMmonth' | 'RMyear' | 'RMt' | 'toggle' | 'years' | 'rate' | 'RMrelief';
  timing: 'tomorrow' | 'nextMonth';
  rampDays: number;
  /** Plain-language cycle: what happens first, what follows, and what it costs. */
  cycle: string;
}

export const MIN_WAGE0 = 1700; // RM/month, national minimum wage in force at the 2027 opening
export const WORKER_LEVY0 = 1850; // RM/yr, average foreign-worker levy (ASSUMPTION: blended sector rates)
export const FOREIGN_WORKERS0 = 2.3; // millions of documented foreign workers (APPROX)
export const AI_ADOPTION0 = 0.12; // share of tasks using AI tools at opening (ASSUMPTION)

export const LEVERS: Record<LeverId, LeverSpec> = {
  aiProgramme: { group: 'ai', label: 'National AI programme (compute, data, public pilots)', kind: 'slider', min: 0, max: 10e9, step: 0.5e9, initial: 0, unit: 'RMbnYr', timing: 'tomorrow', rampDays: 120,
    cycle: 'Spending buys compute, construction and power at once. Adoption rises over 1–2 years; productivity follows with a further lag. Faster productivity can displace workers before demand catches up.' },
  aiAdoptionCredit: { group: 'ai', label: 'AI adoption tax credit for firms (≈ RM1bn/yr)', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 90,
    cycle: 'Firms buy AI tools sooner. Adoption and productivity rise over months; routine jobs shrink unless retraining keeps pace.' },
  reskilling: { group: 'ai', label: 'Reskilling & job-matching fund', kind: 'slider', min: 0, max: 3e9, step: 0.25e9, initial: 0, unit: 'RMbnYr', timing: 'tomorrow', rampDays: 90,
    cycle: 'Training places open within a quarter. Displaced workers are rehired faster and AI-related mismatch unemployment shrinks.' },
  fdiIncentive: { group: 'fdi', label: 'Standard FDI co-investment incentive', kind: 'slider', min: 0, max: 0.3, step: 0.01, initial: 0.05, unit: 'share', timing: 'tomorrow', rampDays: 1,
    cycle: 'Announced incentives attract pledges immediately. Approved grants are paid as projects build, 1–3 years before exports and jobs arrive.' },
  fdiGreenLane: { group: 'fdi', label: 'Investment green lane (fast approvals)', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 1,
    cycle: 'New pledges build about 25% faster and the investment climate improves. No direct fiscal cost.' },
  minimumWage: { group: 'labour', label: 'National minimum wage', kind: 'slider', min: 1500, max: 3000, step: 50, initial: MIN_WAGE0, unit: 'RMmonth', timing: 'tomorrow', rampDays: 90,
    cycle: 'Low-wage pay rises from tomorrow and phases in over a quarter. Consumer prices follow in 1–3 months; low-wage hiring slows over 6–12 months; household spending rises.' },
  workerLevy: { group: 'labour', label: 'Foreign-worker levy', kind: 'slider', min: 0, max: 4000, step: 50, initial: WORKER_LEVY0, unit: 'RMyear', timing: 'tomorrow', rampDays: 60,
    cycle: 'Levy receipts start tomorrow. Employers slowly cut foreign hires, raising local hiring and wages, and costs in construction, retail and industry.' },
  workerFreeze: { group: 'labour', label: 'Freeze new foreign-worker intake', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 365,
    cycle: 'The foreign workforce shrinks gradually as permits expire. Labour shortages lift wages and local hiring, then cap output in labour-intensive sectors.' },
  exportConversion: { group: 'capital', label: 'Export-proceeds conversion requirement', kind: 'slider', min: 0, max: 0.75, step: 0.05, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 60,
    cycle: 'Exporters must convert this share of receipts to ringgit, supporting the currency over two months. Investors read it as a capital control: FDI interest falls at once.' },
  hotMoneyControls: { group: 'capital', label: 'Short-term capital-flow controls', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 30,
    cycle: 'Dampens ringgit swings within a month. Bond investors demand a small premium and FDI interest falls.' },
  carbonTax: { group: 'green', label: 'Carbon tax', kind: 'slider', min: 0, max: 150, step: 5, initial: 0, unit: 'RMt', timing: 'tomorrow', rampDays: 180,
    cycle: 'Phased in over six months. Power and industrial prices rise first; firms then abate, cutting emissions. Revenue accrues to the treasury.' },
  greenIncentive: { group: 'green', label: 'Renewables & EV incentive programme', kind: 'slider', min: 0, max: 5e9, step: 0.25e9, initial: 0, unit: 'RMbnYr', timing: 'tomorrow', rampDays: 90,
    cycle: 'Grants buy solar, grid and EV investment straight away. Green capital builds over years, lowering emissions and power-sector fuel imports and drawing green FDI.' },
  buildProductivity: { group: 'green', label: 'Construction & industry productivity programme (Boom mode)', kind: 'slider', min: 0, max: 1, step: 0.1, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 60,
    cycle: 'Fast-track permits, prefab building and automation credits. Costs up to RM30bn a year, paid to firms (not spent in the sector). Output per worker rises over a month or two, most in property & construction (up to +60%) and industry (up to +50%), so over-stretched sectors can supply more without new buildings. Start around 50%: at 100% a sector that is not overheated is left with spare capacity and prices fall.' },
  // Hub and free-zone policies (D-098): Singapore- and Dubai-style playbooks. Fictional game-balance settings, not estimates of any real regime.
  hqRegime: { group: 'hub', label: 'Regional headquarters regime (Singapore style): tax breaks, fast visas, office grants', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 120,
    cycle: 'Announced at once: multinationals read it as a pro-business signal, so FDI interest rises, headquarters most of all. Costs about 0.4% of GDP a year in office and relocation grants, which pay local finance, property and retail.' },
  financialHub: { group: 'hub', label: 'Financial hub regime (wealth management, funds, offshore licences)', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 180,
    cycle: 'Funds and wealth managers move money in over about six months: the ringgit strengthens, and licence fees of about 0.25% of GDP a year reach the treasury against a regulator budget of 0.15%.' },
  freeZones: { group: 'hub', label: 'Free zones (Dubai style): 100% foreign ownership, light tax, duty-free', kind: 'slider', min: 0, max: 1, step: 0.1, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 180,
    cycle: 'Share of the zone plan that is open. Investment interest rises at once; zone licence and land fees (up to 0.2% of GDP a year) flow to the treasury as zones fill, over about six months.' },
  goldenVisa: { group: 'hub', label: 'Golden residency visa for investors, talent and remote workers', kind: 'toggle', min: 0, max: 1, step: 1, initial: 0, unit: 'toggle', timing: 'tomorrow', rampDays: 120,
    cycle: 'Wealthy residents arrive over about four months: visa fees of about 0.3% of GDP a year, more tourism and spending, and a small lift to investment interest.' },
  tourismDrive: { group: 'hub', label: 'Tourism & mega-events promotion budget', kind: 'slider', min: 0, max: 3e9, step: 0.25e9, initial: 0, unit: 'RMbnYr', timing: 'tomorrow', rampDays: 90,
    cycle: 'Marketing and event spending buy local services at once. Visitor numbers rise over a quarter, lifting tourism exports and consumer-sector sales.' },
  ringgitPush: { group: 'hub', label: 'Strong-ringgit programme (managed appreciation, reserve-currency push)', kind: 'slider', min: 0, max: 1, step: 0.1, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 90,
    cycle: 'Policy signals and reserve diversification pull the ringgit up by as much as 8% over a quarter. Imports and foreign debt cost less; exporters and tourism lose price competitiveness.' },
  // Fiscal reforms (D-114). Fictional game-balance settings modelled on the pension, subsidy and tax debates in Europe and the US.
  retirementAge: { group: 'pension', label: 'Statutory retirement age', kind: 'slider', min: 60, max: 67, step: 1, initial: 60, unit: 'years', timing: 'tomorrow', rampDays: 1095,
    cycle: 'New retirees draw pensions later, so the pension bill falls by about 3% for every year added, phased in over three years. Older workers stay in the labour force (about +0.2pp unemployment a year), inequality edges up and approval falls.' },
  pensionIndexation: { group: 'pension', label: 'Pension indexation (share of inflation passed to pensions)', kind: 'slider', min: 0, max: 1, step: 0.1, initial: 1, unit: 'share', timing: 'tomorrow', rampDays: 730,
    cycle: 'Pensions lose real value each year prices rise, so the bill shrinks gradually over two years. Retirees spend less, poverty among the old rises and approval falls.' },
  pensionMeansTest: { group: 'pension', label: 'Means-test pensions for high-income retirees', kind: 'slider', min: 0, max: 0.5, step: 0.05, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 365,
    cycle: 'Share of top-income pensions withdrawn. It saves money and lowers inequality, but retirees who lose out vote against you and approval falls.' },
  subsidyTargeting: { group: 'subsidy', label: 'Target fuel and food subsidies to lower-income households', kind: 'slider', min: 0, max: 1, step: 0.1, initial: 0, unit: 'share', timing: 'tomorrow', rampDays: 180,
    cycle: 'Higher-income households lose the subsidy: up to 35% of the bill is saved. They pay it as higher pump and food prices, so inflation rises a little and spending on other goods falls. Approval drops unless cash aid compensates.' },
  cashAid: { group: 'subsidy', label: 'Targeted cash aid for lower-income households', kind: 'slider', min: 0, max: 10e9, step: 0.5e9, initial: 0, unit: 'RMbnYr', timing: 'tomorrow', rampDays: 60,
    cycle: 'Paid to households from tomorrow and mostly spent, which lifts demand and lowers inequality. It costs the treasury the full amount and softens the approval loss from subsidy targeting.' },
  topBandSurcharge: { group: 'tax', label: 'Top income-tax bands: surcharge on income above RM100,000', kind: 'slider', min: 0, max: 0.1, step: 0.01, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 90,
    cycle: 'Adds percentage points to the rate on income above RM100,000 (new Malaysia campaigns with the progressive income tax). High earners avoid part of it, talent and investors weigh it, and inequality falls. Popular with most voters.' },
  personalRelief: { group: 'tax', label: 'Tax-free allowance (personal and EPF relief)', kind: 'slider', min: 8000, max: 30000, step: 1000, initial: 13000, unit: 'RMrelief', timing: 'tomorrow', rampDays: 90,
    cycle: 'A higher allowance takes lower earners out of tax, raising spending and cutting inequality, but costs revenue; a lower one does the opposite. Needs the progressive income tax.' },
  capitalGainsTax: { group: 'tax', label: 'Capital-gains tax on shares', kind: 'slider', min: 0, max: 0.3, step: 0.025, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 60,
    cycle: 'Taxes realised equity gains, paid out of household savings. Holders delay selling, so receipts rise with the market and fall with the rate. Foreign investors hold back and the ringgit softens.' },
  wealthTax: { group: 'tax', label: 'Net-wealth tax on the richest 1%', kind: 'slider', min: 0, max: 0.02, step: 0.0025, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 180,
    cycle: 'A yearly levy on very large fortunes. Evasion and relocation grow quickly with the rate, so receipts flatten; the ringgit weakens as money moves abroad and the investment climate worsens. Lowers inequality.' },
  digitalLevy: { group: 'tax', label: 'Digital-services levy (platforms, streaming, advertising)', kind: 'slider', min: 0, max: 0.08, step: 0.01, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 90,
    cycle: 'Charged on domestic digital sales. Platforms pass half into prices, the rest cuts tech and consumer-sector profit (and corporate tax). Offshore sellers escape about 30%, and investors in the tech sector take notice.' },
  propertyGainsTax: { group: 'tax', label: 'Property-gains tax on quick resales', kind: 'slider', min: 0, max: 0.3, step: 0.025, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 60,
    cycle: 'Taxes profits on property resold quickly. Fewer sales happen, and sellers pass part into prices and rents. Cools speculation at the cost of a little more housing inflation.' },
  transactionTax: { group: 'tax', label: 'Financial-transaction tax on equity, bond and FX trades', kind: 'slider', min: 0, max: 0.005, step: 0.0005, initial: 0, unit: 'rate', timing: 'tomorrow', rampDays: 60,
    cycle: 'A small charge on each trade. Trading volume migrates abroad as the rate rises, financial firms pass half into fees and prices, and the ringgit and investment climate weaken.' },
};
export const LEVER_IDS = Object.keys(LEVERS) as LeverId[];

/** CO2 per ringgit of real gross output at opening prices, t/RM (APPROX; power ≈ 0.58 kg/kWh at ≈ RM0.5/kWh). */
export const EMISSION_INTENSITY: Record<SectorId, number> = { fin: 0.00002, prop: 0.00012, util: 0.0012, tech: 0.00004, cons: 0.00005, health: 0.00006, ind: 0.00045 };
/** Productivity gain per unit of effective AI adoption above opening (ASSUMPTION). */
const AI_ELASTICITY: Record<SectorId, number> = { fin: 0.5, prop: 0.1, util: 0.15, tech: 0.7, cons: 0.25, health: 0.3, ind: 0.35 };
/** Share of a sector's wage bill at or near the minimum wage (bite), and of its workers who are foreign. */
const MIN_WAGE_BITE: Record<SectorId, number> = { fin: 0.02, prop: 0.4, util: 0.05, tech: 0.05, cons: 0.5, health: 0.2, ind: 0.35 };
const FOREIGN_SHARE: Record<SectorId, number> = { fin: 0, prop: 0.3, util: 0.02, tech: 0.03, cons: 0.12, health: 0.03, ind: 0.2 };

const EMPTY_MTD: PolicyState['mtd'] = { carbonTax: 0, workerLevy: 0, fdiGrants: 0, aiProgramme: 0, reskilling: 0, greenGrants: 0, hubFees: 0, hubSpend: 0, reformTax: 0, pensionSaved: 0, subsidySaved: 0, cashAid: 0 };

export function initialPolicy(enabled: boolean): PolicyState {
  const levers = Object.fromEntries(LEVER_IDS.map(id => [id, { value: LEVERS[id].initial, from: LEVERS[id].initial, announcedDay: -1, effectiveDay: -1, rampDays: LEVERS[id].rampDays }])) as Record<LeverId, PolicyLever>;
  const mtd = { ...EMPTY_MTD };
  return { enabled, levers, aiAdoption: AI_ADOPTION0, aiEffective: AI_ADOPTION0, greenCapital: 0, emissionsIndex: 1, foreignWorkers: FOREIGN_WORKERS0, mtd, lastMonth: { ...mtd } } as PolicyState;
}

const today = (s: GameState) => s.scheduler.lastDay;

/** Effective setting today: the old value before the effective day, then a linear ramp to the new one. */
export function leverValue(s: GameState, id: LeverId, day = today(s)): number {
  const p = s.policy;
  if (!p?.enabled) return LEVERS[id].initial;
  const l = p.levers[id];
  if (l.effectiveDay < 0 || day < l.effectiveDay) return l.effectiveDay < 0 ? l.value : l.from;
  const k = clamp((day - l.effectiveDay + 1) / Math.max(1, l.rampDays), 0, 1);
  return l.from + (l.value - l.from) * k;
}
/** Announced (decided) setting, which expectations respond to immediately. */
export const leverTarget = (s: GameState, id: LeverId) => (s.policy?.enabled ? s.policy.levers[id].value : LEVERS[id].initial);

export type LeverPhase = { phase: 'opening' | 'announced' | 'phasing' | 'full'; progress: number; daysToEffect: number };
export function leverPhase(s: GameState, id: LeverId): LeverPhase {
  const l = s.policy.levers[id];
  if (l.effectiveDay < 0) return { phase: 'opening', progress: 1, daysToEffect: 0 };
  const d = today(s);
  if (d < l.effectiveDay) return { phase: 'announced', progress: 0, daysToEffect: l.effectiveDay - d };
  const progress = clamp((d - l.effectiveDay + 1) / Math.max(1, l.rampDays), 0, 1);
  return { phase: progress < 1 ? 'phasing' : 'full', progress, daysToEffect: 0 };
}

/** Player command: decide a new setting. Returns an error message or null. */
export function setLever(s: GameState, id: LeverId, value: number, atMin: number): string | null {
  if (!s.policy?.enabled) return 'These policy levers are modelled in new Malaysia campaigns.';
  const spec = LEVERS[id];
  if (!spec) return 'Unknown policy lever.';
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return `${spec.label}: choose a value between ${spec.min} and ${spec.max}.`;
  if (spec.kind === 'toggle' && value !== 0 && value !== 1) return `${spec.label} is on or off.`;
  const v = spec.kind === 'toggle' ? value : Math.round(value / spec.step) * spec.step;
  const l = s.policy.levers[id];
  if (Math.abs(v - l.value) < 1e-9) return 'That setting is already decided.';
  const p = klParts(atMin);
  const d = today(s) + 1; // the next settled day
  const effectiveDay = spec.timing === 'tomorrow' ? d
    : d + (daysInMonth(p.year, p.month) - p.day); // the 1st of next month, as a settled KL day (no lever uses it since D-072)
  // A new decision ramps from wherever the previous change had reached.
  s.policy.levers[id] = { value: v, from: leverValue(s, id, Math.max(d, effectiveDay)), announcedDay: today(s), effectiveDay, rampDays: leverRampDays(s, spec.rampDays) };
  const label = `${spec.label}: ${formatLever(id, v)} (effective ${spec.timing === 'tomorrow' ? 'tomorrow' : 'on the 1st of next month'}, full effect after ~${leverRampDays(s, spec.rampDays)} days)`;
  pushBounded(s.policyLog, { atMin, effectiveMin: klDayStartMin(effectiveDay), label }, 2000);
  news(s, { kind: 'policy', tone: 'neutral', title: `Policy decided: ${spec.label}`, body: `${formatLever(id, v)}. ${spec.cycle}` });
  return null;
}

export function formatLever(id: LeverId, v: number): string {
  const u = LEVERS[id].unit;
  if (u === 'toggle') return v ? 'On' : 'Off';
  if (u === 'RMbnYr') return `RM${(v / 1e9).toFixed(2)}bn a year`;
  if (u === 'share') return `${(v * 100).toFixed(0)}%`;
  if (u === 'RMmonth') return `RM${v.toFixed(0)} a month`;
  if (u === 'RMyear') return `RM${v.toFixed(0)} a year per worker`;
  if (u === 'years') return `${v.toFixed(0)} years`;
  if (u === 'rate') return `${(v * 100).toFixed(2)}%`;
  if (u === 'RMrelief') return `RM${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} a year`;
  return `RM${v.toFixed(0)} per tonne CO₂`;
}

// ---------------------------------------------------------------- effects used by the economy (all 1 when off)

/** Household wage multiplier from the minimum wage (bites only above the opening floor). */
export function wageMultiplier(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 1;
  return 1 + MIN_WAGE_BITE[j] * 0.35 * (leverValue(s, 'minimumWage') / MIN_WAGE0 - 1);
}
/** Employer labour-cost multiplier: wages plus the foreign-worker levy above its opening rate. */
export function labourCostMultiplier(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 1;
  // Levy change × foreign workers in the sector ÷ sector wage bill (≈ RM40k per worker per year at opening).
  const levy = (leverValue(s, 'workerLevy') - WORKER_LEVY0) * FOREIGN_SHARE[j] / 40_000;
  return wageMultiplier(s, j) + levy;
}
/** Effective AI adoption raises productivity by sector (lags adoption itself). */
export function aiProductivity(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 1;
  return 1 + AI_ELASTICITY[j] * (s.policy.aiEffective - AI_ADOPTION0);
}
/** Boom mode only (D-126): output-per-worker multiplier from the construction & industry productivity programme. */
const BUILD_PRODUCTIVITY: Record<SectorId, number> = { fin: 0.1, prop: 0.6, util: 0.3, tech: 0.4, cons: 0.2, health: 0.1, ind: 0.5 };
export const BUILD_PROGRAMME_COST = 30e9; // RM a year at full setting
export function buildProductivity(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled || !boomOn(s)) return 1;
  return 1 + BUILD_PRODUCTIVITY[j] * leverValue(s, 'buildProductivity');
}
/** Price-driven and capital-driven abatement share of emissions. */
export function abatement(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  const tau = leverValue(s, 'carbonTax');
  return Math.min(0.5, 0.25 * (1 - Math.exp(-tau / 120)) + 0.3 * (1 - Math.exp(-s.policy.greenCapital / 40e9)));
}
/** Carbon cost per unit of real output, RM (added to price targets and subtracted from profits). */
export function carbonCost(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 0;
  return leverValue(s, 'carbonTax') * EMISSION_INTENSITY[j] * (1 - abatement(s));
}
/** Renewables displace part of the power sector's imported fuel. */
export const greenFuelSaving = (s: GameState) => (s.policy?.enabled ? 0.5 * 0.3 * (1 - Math.exp(-s.policy.greenCapital / 40e9)) : 0);
/** Reskilling speeds hiring when firms are adding staff. */
export const hiringBoost = (s: GameState) => (s.policy?.enabled ? 1 + 1.5 * Math.min(1, leverValue(s, 'reskilling') / 2e9) : 1);
/** Extra structural unemployment from AI task displacement, net of reskilling. */
export function aiMismatch(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  return 0.1 * Math.max(0, s.policy.aiEffective - AI_ADOPTION0) * (1 - Math.min(1, leverValue(s, 'reskilling') / 2e9));
}
/** Investment-climate points from the hub policies (announced setting, so expectations move at once). */
export function hubClimate(s: GameState, kind: string): number {
  if (!s.policy?.enabled) return 0;
  return 10 * leverTarget(s, 'hqRegime') + (kind === 'hq' ? 12 * leverTarget(s, 'hqRegime') : 0) + 6 * leverTarget(s, 'financialHub')
    + 14 * leverTarget(s, 'freeZones') + 3 * leverTarget(s, 'goldenVisa');
}
/** Extra tourism demand (share of opening) from the golden visa and the promotion budget. */
export function tourismLift(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  return 0.05 * leverValue(s, 'goldenVisa') + 0.1 * Math.pow(Math.min(1, leverValue(s, 'tourismDrive') / 2e9), 0.7);
}
/** Free zones (D-103): share of each zone sector's activity inside the zones once the whole plan is open. Zone firms pay
 * licence and land fees (0.2% of GDP a year in all) and are excused most corporate tax, so the lever trades tax for FDI. */
const ZONE_SHARE: Partial<Record<SectorId, number>> = { ind: 0.3, tech: 0.3, fin: 0.15 };
const ZONE_SHARE_TOTAL = 0.75;
const ZONE_TAX_RELIEF = 0.8; // share of the corporate rate waived inside a zone
/** Zone licence and land fees paid by sector j today (MYR); a business cost like the carbon tax. */
export function zoneFeeDaily(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 0;
  return leverValue(s, 'freeZones') * 0.002 * s.indicators.nominalGdpAnnual / 365 * (ZONE_SHARE[j] ?? 0) / ZONE_SHARE_TOTAL;
}
/** Share of sector j's corporate tax rate waived by the free zones. */
export function zoneTaxRelief(s: GameState, j: SectorId): number {
  if (!s.policy?.enabled) return 0;
  return leverValue(s, 'freeZones') * (ZONE_SHARE[j] ?? 0) * ZONE_TAX_RELIEF;
}
/** Golden-visa residents bid up housing (D-103): rents rise by up to 2% with the visa fully in force. */
export function visaRentPressure(s: GameState): number {
  if (!s.policy?.enabled) return 0;
  return 0.02 * leverValue(s, 'goldenVisa');
}
/** Log FX effect (negative strengthens the ringgit) and volatility damping from capital controls. */
export function capitalControls(s: GameState) {
  if (!s.policy?.enabled) return { fxLevel: 0, fxDamping: 0, yieldPremium: 0 };
  const hot = leverValue(s, 'hotMoneyControls');
  // Hub policies (D-098) pull the ringgit up as foreign money and reserve demand arrive.
  const hubFx = -0.03 * leverValue(s, 'financialHub') - 0.08 * leverValue(s, 'ringgitPush');
  return { fxLevel: -0.04 * leverValue(s, 'exportConversion') + hubFx + fiscalFx(s), fxDamping: 0.4 * hot, yieldPremium: 0.0015 * hot };
}

// ---------------------------------------------------------------- settlement

const PER_YEAR = 1 / 365;
function spend(s: GameState, purchases: Record<SectorId, number>, annual: number, split: Partial<Record<SectorId, number>>): number {
  if (!(annual > 0)) return 0;
  const paid = post(s.government, 'policyGrant', annual * PER_YEAR);
  for (const [j, sh] of Object.entries(split) as [SectorId, number][]) purchases[j] += paid * sh;
  return paid;
}

/** Daily programmes and levies (after government outlays, before households/sectors). Carbon tax is settled in the
 * economy step because it depends on output. */
export function dailyPolicy(s: GameState, purchases: Record<SectorId, number>): void {
  if (!s.policy?.enabled) return;
  const p = s.policy;
  p.mtd.aiProgramme += spend(s, purchases, leverValue(s, 'aiProgramme'), { tech: 0.6, prop: 0.25, util: 0.15 });
  p.mtd.aiProgramme += spend(s, purchases, leverValue(s, 'aiAdoptionCredit') * 1e9, { tech: 1 });
  p.mtd.reskilling += spend(s, purchases, leverValue(s, 'reskilling'), { health: 0.7, tech: 0.3 });
  const green = spend(s, purchases, leverValue(s, 'greenIncentive'), { ind: 0.4, prop: 0.4, tech: 0.2 });
  p.mtd.greenGrants += green;
  if (boomOn(s)) p.mtd.greenGrants += spend(s, purchases, leverValue(s, 'buildProductivity') * BUILD_PROGRAMME_COST, {}); // a credit to firms: no purchases
  const pInv = (s.sectors.ind.price + s.sectors.prop.price + s.sectors.tech.price) / 3;
  p.greenCapital = p.greenCapital * (1 - 0.04 * PER_YEAR) + green / pInv;
  p.mtd.workerLevy += post(s.government, 'policyLevy', leverValue(s, 'workerLevy') * p.foreignWorkers * 1e6 * PER_YEAR);
  // Hub policies (D-098): grants and promotion buy local services. Offshore licence and visa fees are paid by non-residents,
  // a transfer from abroad; free-zone fees are charged to zone firms in the daily production step instead (D-103).
  const gdp = s.indicators.nominalGdpAnnual;
  p.mtd.hubSpend += spend(s, purchases, leverValue(s, 'hqRegime') * 0.004 * gdp, { fin: 0.5, prop: 0.3, cons: 0.2 });
  p.mtd.hubSpend += spend(s, purchases, leverValue(s, 'financialHub') * 0.0015 * gdp, { fin: 1 });
  p.mtd.hubSpend += spend(s, purchases, leverValue(s, 'tourismDrive'), { cons: 0.7, tech: 0.2, fin: 0.1 });
  const fees = (leverValue(s, 'financialHub') * 0.0025 + leverValue(s, 'goldenVisa') * 0.003) * gdp;
  if (fees > 0) p.mtd.hubFees += post(s.government, 'policyLevy', fees * PER_YEAR);
  // Capital-gains and wealth tax (D-114) are paid by households out of savings; business-side levies are settled in the economy step.
  const hhTax = post(s.government, 'policyLevy', householdTaxDaily(s));
  if (hhTax > 0) {
    p.mtd.reformTax += hhTax;
    s.households.savings = Math.max(0, s.households.savings - hhTax);
  }
}

/** Monthly: AI adoption, the foreign workforce and emissions. `operatingDataCentres` is MYR of operating FDI. */
export function monthClosePolicy(s: GameState, operatingDataCentres: number): void {
  if (!s.policy?.enabled) return;
  const p = s.policy;
  const programme = Math.pow(Math.min(1, leverValue(s, 'aiProgramme') / 5e9), 0.7);
  // Adoption beyond the opening level comes from policy and operating data centres (the opening trend is already in
  // NATIONAL_TREND productivity). Firms close 1/24 of the gap a month; productivity lags adoption by ~9 months.
  const target = AI_ADOPTION0 + 0.10 * programme + 0.05 * leverValue(s, 'aiAdoptionCredit') + 0.04 * Math.min(1, operatingDataCentres / 40e9);
  p.aiAdoption += (target - p.aiAdoption) / 24;
  p.aiEffective += (p.aiAdoption - p.aiEffective) / 9;
  // Foreign workers follow the levy (elasticity ≈ −0.15) and shrink 8%/yr under a freeze; employment moves with them.
  const fwTarget = FOREIGN_WORKERS0 * Math.max(0.3, 1 - 0.15 * (leverValue(s, 'workerLevy') / WORKER_LEVY0 - 1)) * (1 - 0.3 * leverValue(s, 'workerFreeze'));
  const before = p.foreignWorkers;
  p.foreignWorkers += (fwTarget - p.foreignWorkers) / 18;
  const delta = (p.foreignWorkers - before) * 1e6;
  if (delta !== 0) {
    const hh = s.households;
    const emp = SECTOR_IDS.reduce((a, j) => a + s.sectors[j].employment * FOREIGN_SHARE[j], 0);
    for (const j of SECTOR_IDS) if (emp > 0) s.sectors[j].employment = Math.max(0, s.sectors[j].employment + delta * s.sectors[j].employment * FOREIGN_SHARE[j] / emp);
    hh.laborForce = Math.max(1, hh.laborForce + delta);
    hh.employed = Math.min(SECTOR_IDS.reduce((a, j) => a + s.sectors[j].employment, 0), hh.laborForce * 0.985);
  }
  p.lastMonth = { ...p.mtd };
  p.mtd = { ...EMPTY_MTD };
}

export function validatePolicy(p: PolicyState): void {
  if (!p || typeof p.enabled !== 'boolean' || !p.levers || !p.mtd || !p.lastMonth) throw new Error('Corrupt save: policy state');
  for (const id of LEVER_IDS) {
    const l = p.levers[id], spec = LEVERS[id];
    if (!l || !(l.value >= spec.min && l.value <= spec.max) || !(l.from >= spec.min && l.from <= spec.max) || !Number.isSafeInteger(l.effectiveDay) || !Number.isSafeInteger(l.announcedDay) || !(l.rampDays >= 1)) throw new Error(`Corrupt save: policy lever ${id}`);
  }
  if (!(p.aiAdoption >= 0 && p.aiAdoption <= 1) || !(p.aiEffective >= 0 && p.aiEffective <= 1) || !(p.greenCapital >= 0) || !(p.emissionsIndex >= 0) || !(p.foreignWorkers > 0)) throw new Error('Corrupt save: policy indices');
}
