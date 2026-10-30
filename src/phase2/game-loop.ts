// Minimal real-time driver for the Phase 2 market harness. The Phase 1 shell owns the full HUD/store;
// this exists so the market UI can be run and verified on its own. The engine mutates `game` in
// place; `rev` bumps after hourly ticks, `minute` (visual clock) is throttled to ~8 updates/s.
import { useSyncExternalStore } from 'react';
import { displayMinutes } from '../engine/clock';
import { advance, createGame } from '../engine/game';
import type { GameSpeed } from '../types/game';

const game = createGame();
let snap = { rev: 0, minute: displayMinutes(game.clock), paused: game.clock.paused, speed: game.clock.speed };
const listeners = new Set<() => void>();

function publish(patch: Partial<typeof snap>) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}

let last = 0;
let lastUi = 0;
function frame(now: number) {
  const delta = last ? now - last : 0;
  last = now;
  const hours = advance(game, delta);
  if (hours > 0) publish({ rev: snap.rev + 1, minute: displayMinutes(game.clock) });
  else if (!game.clock.paused && now - lastUi > 120) publish({ minute: displayMinutes(game.clock) });
  if (now - lastUi > 120) lastUi = now;
  requestAnimationFrame(frame);
}

let started = false;
export function startLoop() {
  if (started) return;
  started = true;
  requestAnimationFrame(frame);
  // Auto-pause when hidden: no background progression and no catch-up on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
    last = 0;
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPaused(!game.clock.paused);
    } else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(Number(e.key) as GameSpeed);
  });
}

export function setPaused(p: boolean) {
  if (game.scheduler.campaignEnded) p = true;
  game.clock.paused = p;
  last = 0;
  publish({ paused: p });
}

export function setSpeed(sp: GameSpeed) {
  game.clock.speed = sp;
  game.clock.paused = false;
  last = 0;
  publish({ speed: sp, paused: false });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useGame() {
  const s = useSyncExternalStore(subscribe, () => snap);
  return { game, ...s };
}

// Exposed for browser tests / dev tooling only (read-only inspection).
(window as unknown as { __klGame?: typeof game }).__klGame = game;
