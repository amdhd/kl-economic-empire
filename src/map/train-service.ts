// Pure train-service rule for the living map (no MapLibre import, so it is unit-testable).
import type { RailLine } from '../data/rail';
import { klParts } from '../engine/time';
import type { GameState } from '../types/game';

/** Trains running per line now: service hours, peaks, the jobs market, tourism and completed rail projects. */
export function trainsOnLine(s: GameState, line: RailLine, lengthM: number): number {
  const hour = klParts(Math.floor(s.clock.hour) * 60).hour;
  if (hour < 6) return 0; // no service overnight
  const peak = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20) ? 1.35 : hour >= 22 ? 0.6 : 1;
  const jobs = s.households.employed / Math.max(1, s.baseline.employment);
  const visitors = Math.min(1.3, Math.max(0.7, s.external.tourism));
  const newRail = s.government.projects.some(p => p.templateId === 'lrt' && p.status === 'complete') && line.id !== 'MR' ? 1.25 : 1;
  const base = lengthM / 3500; // roughly one train every 3.5 km each way at opening
  return Math.max(1, Math.round(base * peak * Math.pow(jobs, 6) * (0.85 + 0.15 * visitors) * newRail));
}

