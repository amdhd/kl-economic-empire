// Dev/test-only macro validation harness (Task "demand multiplier"): paired same-seed runs with random events and
// commodity episodes switched off, one controlled shock from 1 Feb 2027, compared month by month with the baseline.
// Never imported by the player app; it consumes randomness only through the engine's own streams.
import { EVENTS, EVENT_BY_ID } from '../src/data/events';
import { COMMODITY_EPISODES } from '../src/data/world';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { daysInMonth, klToEpochMin } from '../src/engine/time';
import type { BudgetCategory, GameState } from '../src/types/game';

export type ShockId = 'baseline' | 'spending' | 'opr25' | 'opr100' | 'oil10' | 'oil50' | 'levy1' | 'subsidy';

/** Published-range benchmarks the model is checked against (see docs/economy-model.md, "Macro validation"). */
export const BENCHMARKS = {
  spendingMultiplier4q: [0.3, 0.8],
  spendingMultiplier8q: [0.3, 0.9],
  opr25GdpPct8q: [-0.25, -0.02],
  oil10GdpPct4q: [-0.3, 0.3],
  levyMultiplier4q: [0.1, 0.6],
  okun: [0.1, 0.45],
  sacrificeRatio: [0.5, 4],
} as const;

const PURCHASES: BudgetCategory[] = ['health', 'services', 'safety', 'development', 'admin'];
const HARNESS_OIL = 'harness_oil';
const HARNESS_OIL50 = 'harness_oil50';
const HOURS = Math.round(24 * 365.25 * 2) + 24;

interface Monthly { realPerDay: number; real: number; cpiF: number; u: number; opex: number; levy: number; inflation: number }

function quiet<T>(fn: () => T): T {
  const ev = EVENTS.map(e => e.weeklyHazard), ep = COMMODITY_EPISODES.map(e => e.hazard);
  for (const e of EVENTS) e.weeklyHazard = 0;
  for (const e of COMMODITY_EPISODES) e.hazard = 0;
  // Oil-only template outside EVENTS, so the weekly scheduler's draws stay aligned with the baseline run.
  EVENT_BY_ID[HARNESS_OIL] ??= { ...EVENT_BY_ID.oil_spike, id: HARNESS_OIL, title: 'Controlled oil shock', weeklyHazard: 0, mods: { oil: 1.1 } };
  EVENT_BY_ID[HARNESS_OIL50] ??= { ...EVENT_BY_ID.oil_spike, id: HARNESS_OIL50, title: 'Controlled oil shock', weeklyHazard: 0, mods: { oil: 1.5 } };
  try { return fn(); } finally {
    EVENTS.forEach((e, i) => (e.weeklyHazard = ev[i]));
    COMMODITY_EPISODES.forEach((e, i) => (e.hazard = ep[i]));
  }
}

function monthly(s: GameState): Monthly[] {
  return s.reports.map(r => {
    const days = daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1);
    return { realPerDay: r.realGdp / days, real: r.realGdp, cpiF: r.cpi / 100, u: r.unemployment, opex: r.gov.opex, levy: r.gov.taxConsumption, inflation: r.inflationYoY };
  });
}

/** Run one campaign with an optional shock. `oprPath` (KL day → baseline OPR) holds the policy rate a fixed spread above it. */
export function runShock(seed: number, shock: ShockId, oprPath?: Map<number, number>, setup?: (s: GameState) => void) {
  const s = createGame(seed);
  setup?.(s);
  const start = klToEpochMin(2027, 2, 1, 1) / 60;
  runHeadless(s, start - s.clock.hour);
  if (shock === 'spending') {
    // +1% of opening GDP a year in government purchases (transfers excluded), scaled into each category and its plan.
    const total = PURCHASES.reduce((a, c) => a + s.government.policies.budget[c], 0) * 12;
    const x = (0.01 * s.baseline.nominalGdpAnnual) / total;
    for (const c of PURCHASES) {
      s.government.policies.budget[c] *= 1 + x;
      for (const p of s.controls.plans) if (p.category === c) p.monthly *= 1 + x;
    }
  }
  if (shock === 'oil10' || shock === 'oil50') s.events.active.push({ id: s.events.nextId++, templateId: shock === 'oil10' ? HARNESS_OIL : HARNESS_OIL50, title: 'Controlled oil shock', startDay: s.scheduler.lastDay, endDay: s.scheduler.lastDay + 800, magnitude: 1 });
  if (shock === 'subsidy') {
    // Remove RON95 subsidy eligibility from the next month boundary (the earlier household-balance experiment).
    const r = applyCommand(s, { type: 'queueCommodity', patch: { fuelEligible: 0 } }, s.clock.hour * 60);
    if (!r.ok) throw new Error(r.message);
  }
  if (shock === 'levy1') {
    const r = applyCommand(s, { type: 'queueTax', patch: { consumption: s.government.policies.tax.consumption + 0.01 } }, s.clock.hour * 60);
    if (!r.ok) throw new Error(r.message);
  }
  const spread = shock === 'opr25' ? 0.0025 : shock === 'opr100' ? 0.01 : 0;
  const path = new Map<number, number>();
  runHeadless(s, HOURS, st => {
    if (spread && oprPath) st.external.opr = (oprPath.get(st.scheduler.lastDay) ?? st.external.opr) + spread;
    path.set(st.scheduler.lastDay, st.external.opr);
  });
  return { state: s, months: monthly(s), oprPath: path };
}

const pct = (a: number, b: number) => 100 * (a / b - 1);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Paired responses for one seed. Month 0 is January 2027 (pre-shock); month 1 is February. */
export function measureShocks(seed: number, setup?: (s: GameState) => void) {
  return quiet(() => {
    const base = runShock(seed, 'baseline', undefined, setup);
    const b = base.months;
    const gap = (m: Monthly[], i: number) => pct(m[i].realPerDay, b[i].realPerDay);
    const window = (m: Monthly[], lo: number, hi: number) => avg(Array.from({ length: hi - lo + 1 }, (_, k) => gap(m, lo + k)));
    const n = Math.min(b.length, 24) - 1;

    const g = runShock(seed, 'spending', undefined, setup).months;
    const realDiff = (m: Monthly[], i: number) => m[i].real - b[i].real;
    const dG = (i: number) => g[i].opex / g[i].cpiF - b[i].opex / b[i].cpiF;
    const cum = (f: (i: number) => number, lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, k) => f(lo + k)).reduce((a, x) => a + x, 0);
    const spendingMultiplier4q = cum(i => realDiff(g, i), 1, 12) / cum(dG, 1, 12);
    const spendingMultiplier8q = cum(i => realDiff(g, i), 1, n) / cum(dG, 1, n);
    const okun = avg([10, 11, 12].map(i => 100 * (b[i].u - g[i].u))) / window(g, 10, 12);

    const o25 = runShock(seed, 'opr25', base.oprPath, setup).months;
    const o100 = runShock(seed, 'opr100', base.oprPath, setup).months;
    const lostOutputPctYears = -cum(i => gap(o100, i), 1, n) / 12;
    const disinflation = 100 * (b[n].inflation - o100[n].inflation);

    const oil = runShock(seed, 'oil10', undefined, setup).months;
    const oil50 = runShock(seed, 'oil50', undefined, setup).months;
    const subsidy = runShock(seed, 'subsidy', undefined, setup).months;
    const levy = runShock(seed, 'levy1', undefined, setup).months;
    const dLevy = (i: number) => levy[i].levy / levy[i].cpiF - b[i].levy / b[i].cpiF;
    const levyMultiplier4q = -cum(i => realDiff(levy, i), 2, 13) / cum(dLevy, 2, 13);

    return {
      seed,
      spendingMultiplier4q, spendingMultiplier8q, okun,
      spendingGdpPct4q: window(g, 10, 12),
      opr25GdpPct4q: window(o25, 10, 12), opr25GdpPct8q: window(o25, n - 2, n),
      opr100GdpPct8q: window(o100, n - 2, n), sacrificeRatio: lostOutputPctYears / disinflation, disinflationPp: disinflation,
      oil10GdpPct4q: window(oil, 10, 12), oil10GdpPct8q: window(oil, n - 2, n),
      levyMultiplier4q, levyGdpPct4q: window(levy, 10, 12),
      // ~200 days after the shock (months 7–8), the horizon of the earlier RON95/oil comparisons.
      oil50GdpPct200d: window(oil50, 7, 8), subsidyGdpPct200d: window(subsidy, 8, 9),
    };
  });
}
export type ShockSummary = ReturnType<typeof measureShocks>;
