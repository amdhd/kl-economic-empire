import { syncCloud } from '../persistence/cloud';
// Thin UI store. The engine mutates `game` in place; `rev` bumps whenever economic state changes
// (hourly tick or player command) so selectors re-run. The visual clock is published separately
// and throttled so the whole tree does not re-render every frame.
import { create } from 'zustand';
import { displayMinutes } from '../engine/clock';
import { advance, applyCommand, createGame, runHeadless, type Command, type CommandResult } from '../engine/game';
import { klDay } from '../engine/time';
import { deserialize, serialize } from '../persistence/save';
import { readSlot, writeSlot, type SlotId } from '../persistence/storage';
import type { GameSpeed, GameState, ScenarioId, TickerId } from '../types/game';

export type PanelId = 'population' | 'controls' | 'trade' | 'sources' | 'fiscal' | 'commodities' | 'partners' | 'soe' | 'overview' | 'policies' | 'projects' | 'debt' | 'markets' | 'fund' | 'economy' | 'reports' | 'objectives';
export type Selection = { kind: 'company'; id: TickerId } | { kind: 'district'; id: string } | null;
export interface Toast {
  id: number;
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}

interface Store {
  game: GameState;
  rev: number;
  uiMinute: number;
  panel: PanelId | null;
  selection: Selection;
  toasts: Toast[];
  showNewGame: boolean;
  showHelp: boolean;
  confirmOpen: number; // number of open deliberation dialogs
  pauseOnDialogs: boolean;
  lastSaved: string | null;
  setPanel: (p: PanelId | null) => void;
  select: (s: Selection) => void;
  setSpeed: (s: GameSpeed) => void;
  togglePause: () => void;
  pause: () => void;
  command: (c: Command) => CommandResult;
  toast: (tone: Toast['tone'], text: string) => void;
  newGame: (seed: number, scenario: ScenarioId) => void;
  save: (slot: SlotId, label?: string) => Promise<void>;
  load: (slot: SlotId) => Promise<boolean>;
  setShowNewGame: (v: boolean) => void;
  setShowHelp: (v: boolean) => void;
  dialog: (open: boolean) => void;
  setPauseOnDialogs: (v: boolean) => void;
  tick: (deltaRealMs: number) => void;
}

let toastId = 1;
let resumeAfterDialog = false;

export const useGame = create<Store>((set, get) => ({
  game: createGame(20270101, 'balanced'),
  rev: 0,
  uiMinute: 0,
  panel: null,
  selection: null,
  toasts: [],
  showNewGame: true,
  showHelp: false,
  confirmOpen: 0,
  pauseOnDialogs: true,
  lastSaved: null,
  setPanel: (panel) => set({ panel }),
  select: (selection) => set({ selection }),
  setSpeed: (speed) => {
    const g = get().game;
    g.clock.speed = speed;
    if (!g.scheduler.campaignEnded) g.clock.paused = false;
    set({ rev: get().rev + 1 });
  },
  togglePause: () => {
    const g = get().game;
    if (g.scheduler.campaignEnded) return;
    g.clock.paused = !g.clock.paused;
    if (g.clock.paused) void get().save('autosave', 'Autosave');
    set({ rev: get().rev + 1 });
  },
  pause: () => {
    const g = get().game;
    if (!g.clock.paused) {
      g.clock.paused = true;
      set({ rev: get().rev + 1 });
    }
  },
  command: (c) => {
    const g = get().game;
    const res = applyCommand(g, c, Math.floor(displayMinutes(g.clock)));
    get().toast(res.ok ? 'good' : 'bad', res.message);
    set({ rev: get().rev + 1 });
    return res;
  },
  toast: (tone, text) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, tone, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4200);
  },
  newGame: (seed, scenario) => {
    const game = createGame(seed, scenario);
    set({ game, rev: get().rev + 1, uiMinute: displayMinutes(game.clock), selection: null, panel: null, showNewGame: false });
    lastAutosaveDay = klDay(game.clock.hour * 60);
  },
  save: async (slot, label) => {
    // Dev tooling: automated test tabs set this so they never overwrite the player's saves.
    if (import.meta.env.DEV && sessionStorage.getItem('klDevNoSave')) return;
    const g = get().game;
    try {
      const snapshot = serialize(g, label ?? slot);
      await writeSlot(slot, snapshot);
      syncCloud(slot, snapshot);
      set({ lastSaved: new Date().toLocaleTimeString() });
      if (slot !== 'autosave') get().toast('good', `Saved to ${slot}.`);
    } catch (e) {
      get().toast('bad', `Save failed: ${(e as Error).message}`);
    }
  },
  load: async (slot) => {
    try {
      const json = await readSlot(slot);
      if (!json) {
        get().toast('bad', `No save in ${slot}.`);
        return false;
      }
      const game = deserialize(json);
      set({ game, rev: get().rev + 1, uiMinute: displayMinutes(game.clock), selection: null, showNewGame: false,
        panel: game.scheduler.campaignEnded ? 'objectives' : get().panel });
      lastAutosaveDay = klDay(game.clock.hour * 60);
      get().toast('good', `Loaded ${slot} — paused.`);
      return true;
    } catch (e) {
      get().toast('bad', `Load failed: ${(e as Error).message}`);
      return false;
    }
  },
  setShowNewGame: (showNewGame) => {
    if (showNewGame) get().pause();
    set({ showNewGame });
  },
  setShowHelp: (showHelp) => {
    if (showHelp === get().showHelp) return;
    get().dialog(showHelp);
    set({ showHelp });
  },
  dialog: (open) => {
    const st = get();
    const n = st.confirmOpen + (open ? 1 : -1);
    if (open && n === 1 && st.pauseOnDialogs && !st.game.clock.paused) {
      st.game.clock.paused = true;
      resumeAfterDialog = true;
    }
    if (!open && n === 0 && resumeAfterDialog) {
      resumeAfterDialog = false;
      if (!st.game.scheduler.campaignEnded) st.game.clock.paused = false;
    }
    set({ confirmOpen: Math.max(0, n), rev: st.rev + 1 });
  },
  setPauseOnDialogs: (pauseOnDialogs) => set({ pauseOnDialogs }),
  tick: (delta) => {
    const st = get();
    const g = st.game;
    if (g.clock.paused) return;
    const ticks = advance(g, delta);
    const minute = displayMinutes(g.clock);
    const patch: Partial<Store> = {};
    if (ticks > 0) patch.rev = st.rev + 1;
    if (Math.floor(minute) !== Math.floor(st.uiMinute)) patch.uiMinute = minute;
    if (ticks > 0 && g.scheduler.campaignEnded) {
      patch.panel = 'objectives';
      void st.save('autosave', 'Campaign end');
    }
    if (patch.rev !== undefined || patch.uiMinute !== undefined) set(patch);
    const day = klDay(g.clock.hour * 60);
    if (ticks > 0 && day !== lastAutosaveDay) {
      lastAutosaveDay = day;
      void st.save('autosave', 'Autosave');
    }
  },
}));

let lastAutosaveDay = 0;

/** rAF loop + visibility auto-pause + keyboard shortcuts. Call once at app start. */
export function startGameLoop(): () => void {
  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const delta = now - last;
    last = now;
    if (document.visibilityState === 'visible') useGame.getState().tick(delta);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      const st = useGame.getState();
      if (!st.game.clock.paused) {
        st.pause();
        st.toast('neutral', 'Auto-paused while the tab was hidden.');
      }
      void st.save('autosave', 'Autosave');
    }
    last = performance.now(); // never catch up
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const st = useGame.getState();
    if (st.showNewGame) return;
    if (st.showHelp || st.confirmOpen > 0) {
      if (e.key === 'Escape' && st.showHelp) st.setShowHelp(false);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      st.togglePause();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') st.setSpeed(Number(e.key) as GameSpeed);
    else if (e.key === 'Escape') {
      if (st.selection) st.select(null);
      else st.setPanel(null);
    } else if (e.key === '?') st.setShowHelp(!st.showHelp);
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('keydown', onKey);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('keydown', onKey);
  };
}

/** Subscribe a component to economic changes; returns the (mutable) game state. */
export function useGameState(): GameState {
  useGame((s) => s.rev);
  return useGame((s) => s.game);
}

// DEV TOOLING ONLY (stripped from production builds): lets automated browser tests and the
// developer fast-forward the deterministic engine. Never exposed as a player control.
if (import.meta.env.DEV) {
  (window as unknown as { __klDev: unknown }).__klDev = {
    runHours: (h: number) => {
      const st = useGame.getState();
      runHeadless(st.game, h);
      useGame.setState({ rev: st.rev + 1, uiMinute: displayMinutes(st.game.clock) });
    },
    state: () => useGame.getState().game,
  };
}
