// Safe, paused-only time skip (PROJECT_SPEC §26, D-083). It is not a second simulation path: it runs the same
// whole hourly ticks (`runHourTick`) as the real-time clock, so the resulting state equals a normal run over the same
// game hours. It never reads real time, never touches `clock.subHourMs`, and stops early on anything the player must see.
import type { GameState } from '../types/game';
import { runHourTick } from './scheduler';
import { klDay, klParts } from './time';

export type SkipKind = 'days15' | 'monthClose';
export type SkipStop = 'done' | 'termEnd' | 'criticalAlert' | 'dealOffer' | 'fdiPledge' | 'mpcMeeting';

export const SKIP_DAYS = 15;
export const SKIP_LABEL: Record<SkipKind, string> = { days15: 'Skip 15 days', monthClose: 'Skip to month close' };
/** Offers closing within this many days stop a skip (one stop per offer, then it may lapse like any other). */
export const DECISION_LOOKAHEAD_DAYS = 3;
/** A month close is at most 31 days (plus the closing day) away. */
const MONTH_CLOSE_MAX_HOURS = 32 * 24;

export interface SkipPlan {
  kind: SkipKind;
  /** First hour not to run (days15), or null for monthClose, which ends on the tick that closes a month. */
  endHour: number | null;
  /** Month key last closed when the skip began (monthClose ends when it changes). */
  startMonthKey: number;
  startHour: number;
}

export interface SkipStep {
  hours: number;
  /** Null while the skip should continue next frame. */
  stop: SkipStop | null;
  detail?: string;
}

/** Why a skip cannot start now, or null. Pause-only: a skip is an explicit action on a stopped clock. */
export function skipRefusal(s: GameState): string | null {
  if (s.scheduler.campaignEnded) return 'The term has ended.';
  if (!s.clock.paused) return 'Pause the game to skip time.';
  return null;
}

export function startSkip(s: GameState, kind: SkipKind): SkipPlan | string {
  const refusal = skipRefusal(s);
  if (refusal) return refusal;
  const startHour = s.clock.hour;
  return {
    kind,
    startHour,
    startMonthKey: s.scheduler.lastMonthKey,
    endHour: kind === 'days15' ? Math.min(startHour + SKIP_DAYS * 24, s.clock.endHour) : null,
  };
}

/** Decisions that would lapse within the lookahead, or a manual-rate MPC meeting on the next tick; skips already-seen ones. */
export function pendingStop(s: GameState, ack: ReadonlySet<string>): { stop: SkipStop; key: string; detail: string } | null {
  const today = s.scheduler.lastDay;
  if (s.fdi?.enabled) {
    for (const p of s.fdi.pledges) {
      if (p.status !== 'offered' || p.decideByDay <= today || p.decideByDay - today > DECISION_LOOKAHEAD_DAYS) continue;
      const key = `fdi:${p.id}`;
      if (!ack.has(key)) return { stop: 'fdiPledge', key, detail: `${p.title}: FDI pledge needs a decision soon. Decide, or skip again to let it lapse.` };
    }
  }
  if (s.deals?.enabled) {
    for (const d of s.deals.items) {
      if (d.pledgeId !== undefined) continue; // an FDI pledge's Deal Room mirror is covered by the pledge itself
      if (!['opportunity', 'negotiating'].includes(d.status) || d.deadline <= today || d.deadline - today > DECISION_LOOKAHEAD_DAYS) continue;
      const key = `deal:${d.id}`;
      if (!ack.has(key)) return { stop: 'dealOffer', key, detail: `${d.name}: Deal Room offer closes soon. Decide, or skip again to let it lapse.` };
    }
  }
  // The MPC meets on the 1st of odd months, processed on the first tick of that KL day.
  const next = klParts((s.clock.hour + 1) * 60);
  if (s.centralBank.mode === 'manual' && next.hour === 0 && next.day === 1 && next.month % 2 === 1) {
    const key = `mpc:${klDay((s.clock.hour + 1) * 60)}`;
    if (!ack.has(key)) return { stop: 'mpcMeeting', key, detail: 'The MPC meets tomorrow and follows your rate target. Review it, or skip again to keep it.' };
  }
  return null;
}

/**
 * Runs up to `maxHours` whole hourly ticks of the plan (one game day per UI frame by default). Stops before any tick
 * that would cross a pending decision (recording it in `ack` so the next skip passes it), at the plan's end, at term end,
 * and after any day on which `dailyCheck` (the UI's alert evaluation) reports a fresh critical alert.
 */
export function stepSkip(s: GameState, plan: SkipPlan, ack: Set<string>, maxHours = 24, dailyCheck?: (s: GameState) => boolean): SkipStep {
  let hours = 0;
  while (hours < maxHours) {
    if (s.scheduler.campaignEnded) return { hours, stop: 'termEnd' };
    const hit = pendingStop(s, ack);
    if (hit) {
      ack.add(hit.key);
      return { hours, stop: hit.stop, detail: hit.detail };
    }
    runHourTick(s);
    hours++;
    if (s.scheduler.campaignEnded) return { hours, stop: 'termEnd' };
    if (dailyCheck && klParts(s.clock.hour * 60).hour === 0 && dailyCheck(s)) return { hours, stop: 'criticalAlert', detail: 'A critical alert fired.' };
    if (plan.kind === 'days15' ? s.clock.hour >= (plan.endHour ?? 0) : s.scheduler.lastMonthKey !== plan.startMonthKey) return { hours, stop: 'done' };
    if (s.clock.hour - plan.startHour >= MONTH_CLOSE_MAX_HOURS && plan.kind === 'monthClose') return { hours, stop: 'done' };
  }
  return { hours, stop: null };
}

/** Test/dev helper: run a whole plan synchronously. The UI instead steps once per animation frame. */
export function runSkip(s: GameState, kind: SkipKind, ack: Set<string> = new Set(), dailyCheck?: (s: GameState) => boolean): { plan: SkipPlan; hours: number; stop: SkipStop } | string {
  const plan = startSkip(s, kind);
  if (typeof plan === 'string') return plan;
  let hours = 0;
  for (;;) {
    const r = stepSkip(s, plan, ack, 24, dailyCheck);
    hours += r.hours;
    if (r.stop) return { plan, hours, stop: r.stop };
  }
}
