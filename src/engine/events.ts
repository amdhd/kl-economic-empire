// Seeded event spawning (weekly) and expiry (daily). Effects are read by aggregateMods() and by
// the company model for company-specific events.
import { COMPANIES } from '../data/companies';
import { BOOM, boomOn } from '../data/boom';
import { EVENTS, EVENT_BY_ID } from '../data/events';
import type { ActiveEvent, GameState, TickerId } from '../types/game';
import { rand, randInt } from './rng';
import { clamp, news, pushBounded } from './util';

/** Event intervals use KL days: inclusive start, exclusive end. */
export function eventIsActive(ev: ActiveEvent, day: number): boolean {
  return ev.startDay <= day && day < ev.endDay;
}

/** Shared registration for scripted opening conditions and seeded weekly events. No RNG draws. */
export function startEvent(s: GameState, templateId: string, today: number, days: number, magnitude: number, ticker?: TickerId): void {
  const t = EVENT_BY_ID[templateId];
  const company = ticker ? COMPANIES.find((c) => c.id === ticker) : undefined;
  const ev: ActiveEvent = { id: s.events.nextId++, templateId, title: company ? `${company.displayName}: ${t.title}` : t.title, startDay: today, endDay: today + days, ticker, magnitude };
  s.events.active.push(ev);
  pushBounded(s.events.log, ev, 200);
  news(s, { kind: 'event', tone: t.tone, title: ev.title, body: `${t.description} Expected to last ~${days} days. ${t.effects.join(' · ')}` });
  if (t.mods.floodDamage) {
    const damage = t.mods.floodDamage * magnitude * (1 - clamp(s.government.resilience, 0, 0.95));
    s.government.pendingEmergency += damage;
  }
}

export function scenarioHazardMultiplier(s: GameState, templateId: string): number {
  if (s.scenario !== 'recession') return 1;
  return ['global_slowdown', 'credit_crunch', 'ai_correction', 'tourism_slump', 'prop_glut'].includes(templateId) ? 3 : 0.6;
}

export function weeklyEvents(s: GameState, today: number): void {
  for (const t of EVENTS) {
    if (!t.company && s.events.active.some((e) => e.templateId === t.id && eventIsActive(e, today))) continue;
    const r = rand(s.rng);
    if (r >= t.weeklyHazard * scenarioHazardMultiplier(s, t.id)) continue;
    if (BOOM.noBadEvents && boomOn(s) && t.tone === 'bad') continue; // D-090: Boom mode has no adverse random events
    const days = randInt(s.rng, t.minDays, t.maxDays);
    const magnitude = 0.75 + 0.5 * rand(s.rng);
    const ticker = t.company ? COMPANIES[randInt(s.rng, 0, COMPANIES.length - 1)].id : undefined;
    startEvent(s, t.id, today, days, magnitude, ticker);
  }
}

export function expireEvents(s: GameState, today: number): void {
  const keep = [];
  for (const ev of s.events.active) {
    if (ev.endDay <= today) {
      const t = EVENT_BY_ID[ev.templateId];
      news(s, { kind: 'event', tone: 'neutral', title: `Fading: ${ev.title}`, body: t ? `The ${t.title.toLowerCase()} episode has ended. Direct modifiers have stopped; prices, credit plans and company sentiment may take time to recover.` : undefined });
    } else keep.push(ev);
  }
  s.events.active = keep;
}

/** Company-specific revenue/sentiment targets from active company events. */
export function companyEventTargets(s: GameState, day = s.scheduler.lastDay): Map<string, { revenue: number; sentiment: number }> {
  const out = new Map<string, { revenue: number; sentiment: number }>();
  for (const ev of s.events.active) {
    if (!ev.ticker || !eventIsActive(ev, day)) continue;
    const cur = out.get(ev.ticker) ?? { revenue: 1, sentiment: 0 };
    const sign = ev.templateId === 'company_beat' ? 1 : -1;
    cur.revenue *= 1 + sign * 0.08 * ev.magnitude;
    cur.sentiment += sign * 0.06 * ev.magnitude;
    out.set(ev.ticker, cur);
  }
  return out;
}
