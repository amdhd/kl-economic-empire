import type { GameState, NewsItem } from '../types/game';

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Major units → integer minor units (sen/cents), round half away from zero. */
export function toMinor(major: number): number {
  const m = Math.sign(major) * Math.round(Math.abs(major) * 100);
  assertSafeMinor(m);
  return m;
}

export function assertSafeMinor(m: number): void {
  if (!Number.isSafeInteger(m)) throw new Error(`Unsafe minor-unit amount: ${m}`);
}

export function pushBounded<T>(arr: T[], item: T, max: number): void {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function news(s: GameState, item: Omit<NewsItem, 'id' | 'atMin'>): void {
  pushBounded(s.news, { ...item, id: s.nextNewsId++, atMin: s.clock.hour * 60 }, 250);
}

export const nowMin = (s: GameState) => s.clock.hour * 60;
