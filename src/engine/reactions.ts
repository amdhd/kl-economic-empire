// Reactive news, public figures and group polls (D-146). Pure and deterministic, with no random draw: quote variants are
// chosen by hashing the day and topic, so adding this module leaves every economic result and the rng sequence unchanged.
// Display only: nothing here feeds back into the economy, approval or the score.
import { SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import { NETWORKS } from '../data/infrastructure';
import { POLL_GROUPS, REACTIONS, VOICES } from '../data/voices';
import type { GameState, LeverId, PollGroup, ReactionSnapshot, ReactionsState, VoiceQuote } from '../types/game';
import { ratingLabel } from './government';
import { leverTarget } from './policy';
import { clamp, news, pushBounded } from './util';

/** Most reaction stories published in one weekly or monthly pass, so the ticker does not flood. */
export const MAX_STORIES_PER_PASS = 3;
/** Days before the same condition story can run again. */
export const COOLDOWN_DAYS = { overheat: 42, housing: 60, monthly: 90 };
/** Thresholds for condition stories (ASSUMPTION: chosen so stories are notable, not weekly noise). */
export const THRESHOLDS = { overheatUtil: 1.15, housing3m: 0.06, inflationHigh: 0.04, inflationNegative: -0.005, jobsRise: 0.003, jobsTight: 0.025, fxMove: 0.03, marketMove: 0.08, approvalFall: 4, approvalLow: 40 };

const LEVERS_WATCHED: LeverId[] = ['minimumWage', 'workerLevy', 'workerFreeze', 'cashAid', 'subsidyTargeting', 'topBandSurcharge', 'wealthTax', 'capitalGainsTax', 'carbonTax', 'hqRegime', 'financialHub', 'goldenVisa', 'freeZones', 'buildProductivity', 'personalRelief', 'hotMoneyControls', 'exportConversion', 'transactionTax', 'aiAdoptionCredit'];

export function reactionSnapshot(s: GameState): ReactionSnapshot {
  const levers: Partial<Record<LeverId, number>> = {};
  for (const id of LEVERS_WATCHED) levers[id] = leverTarget(s, id);
  return {
    day: s.scheduler.lastDay,
    tax: { ...s.government.policies.tax },
    levers,
    budgetTotal: Object.values(s.government.policies.budget).reduce((a, x) => a + x, 0),
    opr: s.external.opr,
    fx: s.external.myrPerUsd,
    inflation: s.indicators.inflationYoY,
    unemployment: s.indicators.unemployment,
    approval: s.indicators.approval,
    housing: s.housing?.index ?? 100,
    indexMY: s.market.indices.MY.value,
    creditRating: Math.floor(s.government.creditRating),
    congested: s.infra ? NETWORKS.filter((n) => s.infra!.nets[n].congested) : [],
  };
}

export function initialReactions(s: GameState): ReactionsState {
  const snap = reactionSnapshot(s);
  return { opening: snap, last: { ...snap, tax: { ...snap.tax }, levers: { ...snap.levers }, congested: [...snap.congested] }, cooldown: {}, housingWeeks: [], quotes: [], polls: [] };
}

/** Small stable string hash (djb2), used to pick a quote variant without touching the rng. */
function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

type Vars = Partial<Record<'from' | 'to' | 'pct' | 'sector' | 'project' | 'network', string>>;
function fill(line: string, vars: Vars): string | null {
  let missing = false;
  const out = line.replace(/\{(\w+)\}/g, (_, k: keyof Vars) => {
    const v = vars[k];
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

const pctText = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const STANCE_WORD = { for: 'in favour', against: 'against', warn: 'cautious' } as const;

interface Story { topic: string; title: string; tone: 'good' | 'bad' | 'neutral'; context?: string; vars: Vars; kind: 'policy' | 'event' | 'market' }

/** Quotes for a story: one per voice listed for the topic, each line picked by hash and skipped if a value is missing. */
function quotesFor(s: GameState, st: Story): VoiceQuote[] {
  const day = s.scheduler.lastDay;
  const out: VoiceQuote[] = [];
  for (const entry of REACTIONS[st.topic] ?? []) {
    const usable = entry.lines.map((l) => fill(l, st.vars)).filter((l): l is string => l !== null);
    if (!usable.length) continue;
    const text = usable[hash(`${day}:${st.topic}:${entry.voice}`) % usable.length];
    out.push({ day, voice: entry.voice, topic: st.topic, stance: entry.stance, text });
  }
  return out.slice(0, 3);
}

function publish(s: GameState, stories: Story[]): void {
  const r = s.reactions;
  for (const st of stories.slice(0, MAX_STORIES_PER_PASS)) {
    const quotes = quotesFor(s, st);
    if (!quotes.length) continue;
    for (const q of quotes) pushBounded(r.quotes, q, 40);
    const said = quotes.map((q) => `${VOICES[q.voice].name}, ${VOICES[q.voice].role}: “${q.text}”`).join(' ');
    news(s, { kind: st.kind, tone: st.tone, voice: quotes[0].voice, title: st.title, body: `${st.context ? `${st.context} ` : ''}${said} (Fictional people and quotes.)` });
  }
}

const ready = (r: ReactionsState, key: string, day: number) => (r.cooldown[key] ?? -Infinity) <= day;
const hold = (r: ReactionsState, key: string, day: number, days: number) => { r.cooldown[key] = day + days; };

const TAX_TOPICS: { key: 'corporate' | 'consumption' | 'incomeTax' | 'property'; label: string; min: number; fmt: (x: number) => string }[] = [
  { key: 'corporate', label: 'Corporate tax', min: 0.0049, fmt: (x) => pctText(x, 0) },
  { key: 'consumption', label: 'Consumption levy', min: 0.0049, fmt: (x) => pctText(x, 0) },
  { key: 'incomeTax', label: 'Income tax', min: 0.049, fmt: (x) => `${x.toFixed(2)}× statutory bands` },
  { key: 'property', label: 'Property levy', min: 0.0049, fmt: (x) => pctText(x, 1) },
];

function summary(topic: string): string {
  return (REACTIONS[topic] ?? []).slice(0, 2).map((l) => `${VOICES[l.voice].short} ${STANCE_WORD[l.stance]}`).join(', ');
}

function policyStory(topic: string, label: string, from: string, to: string, up: boolean, vars: Vars = {}): Story {
  return { topic, kind: 'policy', tone: 'neutral', title: `${label} ${up ? 'up' : 'down'} to ${to}: ${summary(topic)}`, context: `${label} moved from ${from} to ${to}.`, vars: { from, to, ...vars } };
}

/** Reactions to decisions since last Monday: taxes in force, announced levers, the OPR and the budget. */
function policyStories(prev: ReactionSnapshot, now: ReactionSnapshot): Story[] {
  const out: Story[] = [];
  for (const t of TAX_TOPICS) {
    const a = prev.tax[t.key], b = now.tax[t.key];
    if (Math.abs(b - a) >= t.min) out.push(policyStory(`${t.key}:${b > a ? 'up' : 'down'}`, t.label, t.fmt(a), t.fmt(b), b > a));
  }
  const lv = (id: LeverId, x: ReactionSnapshot) => x.levers[id] ?? 0;
  const rm = (x: number) => Math.round(x).toLocaleString('en-MY');
  const mw0 = lv('minimumWage', prev), mw1 = lv('minimumWage', now);
  if (Math.abs(mw1 - mw0) >= 50) out.push(policyStory(`minimumWage:${mw1 > mw0 ? 'up' : 'down'}`, 'Minimum wage', `RM${rm(mw0)}`, `RM${rm(mw1)}`, mw1 > mw0, { from: rm(mw0), to: rm(mw1) }));
  const wl0 = lv('workerLevy', prev), wl1 = lv('workerLevy', now);
  if (Math.abs(wl1 - wl0) >= 50) out.push(policyStory(`workerLevy:${wl1 > wl0 ? 'up' : 'down'}`, 'Foreign-worker levy', `RM${rm(wl0)}`, `RM${rm(wl1)}`, wl1 > wl0));
  if (lv('workerFreeze', now) > 0 && lv('workerFreeze', prev) === 0) out.push({ topic: 'workerFreeze:on', kind: 'policy', tone: 'neutral', title: `Foreign-worker intake frozen: ${summary('workerFreeze:on')}`, vars: {} });
  const ca0 = lv('cashAid', prev), ca1 = lv('cashAid', now);
  if (ca1 - ca0 >= 0.5e9) out.push(policyStory('cashAid:up', 'Cash aid', `RM${(ca0 / 1e9).toFixed(1)}bn a year`, `RM${(ca1 / 1e9).toFixed(1)}bn a year`, true));
  if (lv('subsidyTargeting', now) - lv('subsidyTargeting', prev) >= 0.1) out.push(policyStory('subsidyTargeting:up', 'Subsidy targeting', pctText(lv('subsidyTargeting', prev), 0), pctText(lv('subsidyTargeting', now), 0), true));
  const top = (x: ReactionSnapshot) => lv('topBandSurcharge', x) * 10 + lv('wealthTax', x) * 50 + lv('capitalGainsTax', x) * 3;
  const tt0 = top(prev), tt1 = top(now);
  if (Math.abs(tt1 - tt0) >= 0.05) out.push({ topic: `topTaxes:${tt1 > tt0 ? 'up' : 'down'}`, kind: 'policy', tone: 'neutral', title: `Taxes on top earners and wealth ${tt1 > tt0 ? 'raised' : 'cut'}: ${summary(`topTaxes:${tt1 > tt0 ? 'up' : 'down'}`)}`, vars: {} });
  if (lv('carbonTax', now) - lv('carbonTax', prev) >= 5) out.push(policyStory('carbonTax:up', 'Carbon tax', `RM${rm(lv('carbonTax', prev))}/t`, `RM${rm(lv('carbonTax', now))}/t`, true));
  const hubOn = (['hqRegime', 'financialHub', 'goldenVisa', 'freeZones'] as LeverId[]).find((id) => lv(id, now) > 0 && lv(id, prev) === 0);
  if (hubOn) out.push({ topic: 'hub:on', kind: 'policy', tone: 'neutral', title: `New ${HUB_LABEL[hubOn]}: ${summary('hub:on')}`, vars: {} });
  if (lv('buildProductivity', now) - lv('buildProductivity', prev) >= 0.1) out.push(policyStory('buildProductivity:up', 'Construction productivity programme', pctText(lv('buildProductivity', prev), 0), pctText(lv('buildProductivity', now), 0), true));
  if (Math.abs(now.opr - prev.opr) >= 0.0024) out.push(policyStory(`opr:${now.opr > prev.opr ? 'up' : 'down'}`, 'The OPR', pctText(prev.opr, 2), pctText(now.opr, 2), now.opr > prev.opr));
  if (prev.budgetTotal > 0 && Math.abs(now.budgetTotal / prev.budgetTotal - 1) >= 0.03) {
    const up = now.budgetTotal > prev.budgetTotal;
    out.push({ topic: `budget:${up ? 'up' : 'down'}`, kind: 'policy', tone: 'neutral', title: `Operating budget ${up ? 'raised' : 'cut'} ${pctText(Math.abs(now.budgetTotal / prev.budgetTotal - 1), 0)}: ${summary(`budget:${up ? 'up' : 'down'}`)}`, vars: {} });
  }
  return out;
}
const HUB_LABEL: Partial<Record<LeverId, string>> = { hqRegime: 'regional HQ regime', financialHub: 'financial hub regime', goldenVisa: 'golden visa', freeZones: 'free zones' };

/** The largest FDI pledge still being built, for the construction story. */
function biggestBuild(s: GameState): string | undefined {
  const b = (s.fdi?.pledges ?? []).filter((p) => p.status === 'building').sort((a, z) => z.amount - a.amount)[0];
  return b ? b.title.replace(/ proposes.*$/, '') : undefined;
}

function weeklyConditionStories(s: GameState, prev: ReactionSnapshot, now: ReactionSnapshot, day: number): Story[] {
  const r = s.reactions;
  const out: Story[] = [];
  // Overheating: the worst sector above the threshold, once per cooldown.
  const hot = SECTOR_IDS.map((j) => ({ j, u: s.sectors[j].utilization })).filter((x) => x.u > THRESHOLDS.overheatUtil && ready(r, `overheat:${x.j}`, day)).sort((a, z) => z.u - a.u)[0];
  if (hot) {
    hold(r, `overheat:${hot.j}`, day, COOLDOWN_DAYS.overheat);
    const sec = s.sectors[hot.j];
    const unmet = 1 - 1 / hot.u;
    const priceUp = sec.price - 1;
    const vars: Vars = { sector: SECTORS[hot.j].name, project: biggestBuild(s), pct: priceUp >= 0.02 ? pctText(priceUp, 0) : undefined };
    const context = `Demand is ${pctText(hot.u, 0)} of what the sector can supply, so about ${pctText(unmet, 0)} of orders go unserved; its prices are ${priceUp >= 0 ? 'up' : 'down'} ${pctText(Math.abs(priceUp), 0)} on the opening (simulated).`;
    out.push(hot.j === 'prop'
      ? { topic: 'overheat:prop', kind: 'event', tone: 'bad', title: `Contractors fully booked: construction demand at ${pctText(hot.u, 0)} of capacity`, context, vars }
      : { topic: 'overheat:other', kind: 'event', tone: 'bad', title: `${SECTORS[hot.j].name} can’t keep up: demand at ${pctText(hot.u, 0)} of capacity`, context, vars });
  }
  // House prices over about three months (13 Mondays).
  const weeks = r.housingWeeks;
  if (weeks.length >= 13) {
    const ch = now.housing / weeks[0] - 1;
    if (Math.abs(ch) >= THRESHOLDS.housing3m && ready(r, 'housing', day)) {
      hold(r, 'housing', day, COOLDOWN_DAYS.housing);
      const up = ch > 0;
      out.push({ topic: up ? 'housing:up' : 'housing:down', kind: 'event', tone: up ? 'bad' : 'neutral', title: up ? `House prices up ${pctText(ch, 0)} in three months` : `House prices down ${pctText(-ch, 0)} in three months`, vars: { pct: pctText(Math.abs(ch), 0) } });
    }
  }
  // Newly congested networks (Boom). The infrastructure module already reports the bottleneck itself.
  for (const n of now.congested) if (!prev.congested.includes(n)) {
    const v = REACTIONS[`infra:${n}`]?.[0];
    if (v) out.push({ topic: `infra:${n}`, kind: 'event', tone: 'bad', title: `${VOICES[v.voice].short}: “${v.lines[0]}”`, vars: {} });
  }
  // Whole notches, as the rating news does; a rating hovering at a boundary reacts once per cooldown.
  if (now.creditRating !== prev.creditRating && ready(r, 'rating', day)) {
    hold(r, 'rating', day, COOLDOWN_DAYS.monthly);
    const up = now.creditRating > prev.creditRating;
    const topic = up ? 'rating:up' : 'rating:down';
    out.push({ topic, kind: 'market', tone: up ? 'good' : 'bad', title: `Reaction to the ${ratingLabel(now.creditRating)} rating: ${summary(topic)}`, vars: {} });
  }
  return out;
}

/** Monday pass: react to decisions and to conditions that crossed a threshold. Runs after the weekly economy step. */
export function weeklyReactions(s: GameState, day: number): void {
  if (!s.reactions) return;
  const r = s.reactions;
  const now = reactionSnapshot(s);
  const prev = r.last;
  pushBounded(r.housingWeeks, now.housing, 13);
  publish(s, [...policyStories(prev, now), ...weeklyConditionStories(s, prev, now, day)]);
  r.last = now;
}

/** Month close: react to the month's numbers and record the polls. Runs after the monthly report is stored. */
export function monthCloseReactions(s: GameState, monthKey: number): void {
  if (!s.reactions) return;
  const r = s.reactions;
  const day = s.scheduler.lastDay;
  const [p, c] = s.reports.slice(-2);
  const out: Story[] = [];
  if (c) {
    const gate = (key: string) => { if (!ready(r, key, day)) return false; hold(r, key, day, COOLDOWN_DAYS.monthly); return true; };
    if (c.inflationYoY > THRESHOLDS.inflationHigh && gate('inflation:high')) out.push({ topic: 'inflation:high', kind: 'event', tone: 'bad', title: `Cost of living: prices up ${pctText(c.inflationYoY)} on a year ago`, vars: { pct: pctText(c.inflationYoY) } });
    else if (c.inflationYoY < THRESHOLDS.inflationNegative && gate('inflation:negative')) out.push({ topic: 'inflation:negative', kind: 'event', tone: 'neutral', title: `Prices are falling: inflation at ${pctText(c.inflationYoY)}`, vars: {} });
    if (p && c.unemployment - p.unemployment >= THRESHOLDS.jobsRise && gate('jobs:worse')) out.push({ topic: 'jobs:worse', kind: 'event', tone: 'bad', title: `Unemployment rises to ${pctText(c.unemployment)}`, vars: { to: pctText(c.unemployment) } });
    else if (c.unemployment < THRESHOLDS.jobsTight && gate('jobs:tight')) out.push({ topic: 'jobs:tight', kind: 'event', tone: 'neutral', title: `Labour shortage: unemployment at just ${pctText(c.unemployment)}`, vars: { to: pctText(c.unemployment) } });
    if (p) {
      const fx = c.myrPerUsd / p.myrPerUsd - 1;
      if (fx >= THRESHOLDS.fxMove && gate('fx')) out.push({ topic: 'fx:weaker', kind: 'market', tone: 'bad', title: `Ringgit weakens ${pctText(fx)} in a month`, vars: { pct: pctText(fx) } });
      else if (fx <= -THRESHOLDS.fxMove && gate('fx')) out.push({ topic: 'fx:stronger', kind: 'market', tone: 'good', title: `Ringgit strengthens ${pctText(-fx)} in a month`, vars: { pct: pctText(-fx) } });
      const mk = c.indexMY / p.indexMY - 1;
      if (Math.abs(mk) >= THRESHOLDS.marketMove && gate('market')) out.push({ topic: mk > 0 ? 'market:up' : 'market:down', kind: 'market', tone: mk > 0 ? 'good' : 'bad', title: `Bursa ${mk > 0 ? 'rallies' : 'slides'} ${pctText(Math.abs(mk))} in a month`, vars: { pct: pctText(Math.abs(mk)) } });
      if (p.approval - c.approval >= THRESHOLDS.approvalFall && gate('approval:fall')) out.push({ topic: 'approval:fall', kind: 'event', tone: 'bad', title: `Approval drops to ${c.approval.toFixed(0)}%`, vars: { to: `${c.approval.toFixed(0)}%` } });
    }
    if (c.approval < THRESHOLDS.approvalLow && gate('approval:low')) out.push({ topic: 'approval:low', kind: 'event', tone: 'bad', title: `Protests in KL as approval sinks to ${c.approval.toFixed(0)}%`, vars: {} });
  }
  publish(s, out);
  const polls = groupPolls(s);
  const values = Object.fromEntries(POLL_GROUPS.map((g) => [g.id, Math.round(polls[g.id].value * 10) / 10])) as Record<PollGroup, number>;
  pushBounded(r.polls, { monthKey, values }, 36);
}

export interface PollResult { value: number; drivers: { label: string; points: number }[] }

/**
 * Group polls (0–100), display only. Each group weighs the six satisfaction components differently and adds points for
 * policies that affect it, measured against the opening settings. Weights and point sizes are ASSUMPTIONS for flavour,
 * documented in docs/economy-model.md (D-146); approval and the score are unchanged.
 */
export function groupPolls(s: GameState): Record<PollGroup, PollResult> {
  const sat = s.indicators.satisfaction;
  const o = s.reactions?.opening ?? reactionSnapshot(s);
  const lv = (id: LeverId) => leverTarget(s, id);
  const lv0 = (id: LeverId) => o.levers[id] ?? lv(id);
  const tax = s.government.policies.tax;
  const comp = { employment: 'Jobs', income: 'Real income', affordability: 'Housing costs', services: 'Public services', trust: 'Trust in government', stability: 'Stability' } as const;
  const make = (weights: Partial<Record<keyof typeof comp, number>>, extra: [string, number][]): PollResult => {
    const drivers: { label: string; points: number }[] = [];
    let base = 0;
    for (const [k, w] of Object.entries(weights) as [keyof typeof comp, number][]) {
      base += w * sat[k];
      drivers.push({ label: comp[k], points: w * (sat[k] - 60) });
    }
    let value = base;
    for (const [label, pts] of extra) if (Math.abs(pts) >= 0.05) { value += pts; drivers.push({ label, points: pts }); }
    drivers.sort((a, z) => Math.abs(z.points) - Math.abs(a.points));
    return { value: clamp(value, 0, 100), drivers: drivers.filter((d) => Math.abs(d.points) >= 0.5).slice(0, 4) };
  };
  const marketPts = (k: number, cap: number) => clamp(k * Math.log(s.market.indices.MY.value / o.indexMY), -cap, cap);
  const avgUtil = SECTOR_IDS.reduce((a, j) => a + s.sectors[j].utilization, 0) / SECTOR_IDS.length;
  const hubs = (['hqRegime', 'financialHub', 'goldenVisa'] as LeverId[]).reduce((a, id) => a + (lv(id) > 0 ? 3 : 0), 0) + 6 * lv('freeZones');
  return {
    b40: make({ employment: 0.3, income: 0.25, affordability: 0.25, services: 0.2 }, [
      ['Consumption levy', -250 * (tax.consumption - o.tax.consumption)],
      ['Cash aid', 8 * (lv('cashAid') - lv0('cashAid')) / 10e9],
      ['Targeted subsidies', 4 * (lv('subsidyTargeting') - lv0('subsidyTargeting'))],
      ['Minimum wage', 10 * (lv('minimumWage') - lv0('minimumWage')) / 1300],
    ]),
    m40: make({ income: 0.3, affordability: 0.3, employment: 0.2, trust: 0.1, stability: 0.1 }, [
      ['Income tax', -30 * (tax.incomeTax - o.tax.incomeTax)],
      ['Consumption levy', -150 * (tax.consumption - o.tax.consumption)],
      ['Fuel subsidy targeting', -4 * (lv('subsidyTargeting') - lv0('subsidyTargeting'))],
      ['Tax-free allowance', 6 * (lv('personalRelief') - lv0('personalRelief')) / 17000],
    ]),
    t20: make({ income: 0.3, stability: 0.3, trust: 0.25, services: 0.15 }, [
      ['Top-band surcharge', -150 * (lv('topBandSurcharge') - lv0('topBandSurcharge'))],
      ['Wealth tax', -1000 * (lv('wealthTax') - lv0('wealthTax'))],
      ['Capital-gains tax', -40 * (lv('capitalGainsTax') - lv0('capitalGainsTax'))],
      ['Income tax', -20 * (tax.incomeTax - o.tax.incomeTax)],
      ['Share prices', marketPts(20, 15)],
    ]),
    business: make({ stability: 0.4, trust: 0.3, employment: 0.3 }, [
      ['Corporate tax', -150 * (tax.corporate - o.tax.corporate)],
      ['Minimum wage', -12 * (lv('minimumWage') - lv0('minimumWage')) / 1300],
      ['Foreign-worker levy', -8 * (lv('workerLevy') - lv0('workerLevy')) / 2150],
      ['Worker intake freeze', lv('workerFreeze') > 0 ? -8 : 0],
      ['Carbon tax', -8 * (lv('carbonTax') - lv0('carbonTax')) / 150],
      ['Interest rate', -400 * (s.external.opr - o.opr)],
      ['Demand for their goods', 20 * (Math.min(avgUtil, 1) - 0.85) - 30 * Math.max(0, avgUtil - 1.1)],
      ['Productivity programme', 3 * lv('buildProductivity')],
    ]),
    investors: make({ trust: 0.4, stability: 0.6 }, [
      ['Credit rating', 3 * (Math.floor(s.government.creditRating) - o.creditRating)],
      ['Ringgit', clamp(30 * Math.log(o.fx / s.external.myrPerUsd), -10, 10)],
      ['Hub regimes', hubs],
      ['Capital controls', (lv('hotMoneyControls') > 0 ? -8 : 0) - 10 * lv('exportConversion') / 0.75],
      ['Transaction & gains taxes', -2000 * lv('transactionTax') - 20 * lv('capitalGainsTax')],
      ['Share prices', marketPts(15, 10)],
    ]),
  };
}

/** Polls a month ago, for the change shown beside each group (undefined before two month closes). */
export function previousPolls(s: GameState): Record<PollGroup, number> | undefined {
  const p = s.reactions?.polls;
  return p && p.length >= 2 ? p[p.length - 2].values : undefined;
}

export function validateReactions(r: ReactionsState | undefined): void {
  if (!r || typeof r !== 'object' || !r.opening || !r.last || !Array.isArray(r.quotes) || !Array.isArray(r.polls) || !Array.isArray(r.housingWeeks) || typeof r.cooldown !== 'object') throw new Error('Corrupt save: reactions');
}
