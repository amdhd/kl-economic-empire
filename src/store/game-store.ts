import { useAppearance, validAppearance } from '../map/appearance';
import { alertTransitions, economicAlerts, type AlertMemory, type EconomicAlert } from '../engine/alerts';
import type { ExplainMetric } from '../engine/economic-explanations';
import { usePreferences } from './preferences';
import { flushCloud, syncCloud } from '../persistence/cloud';
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

export type PanelId = 'deals' | 'decisions' | 'fdi' | 'standing' | 'explain' | 'settings' | 'finance' | 'population' | 'controls' | 'trade' | 'central' | 'sources' | 'fiscal' | 'commodities' | 'partners' | 'soe' | 'overview' | 'policies' | 'projects' | 'debt' | 'markets' | 'fund' | 'economy' | 'reports' | 'objectives';
export type Selection = { kind: 'company'; id: TickerId } | { kind: 'district'; id: string } | null;
export interface Toast {
  id: number;
  tone: 'good' | 'bad' | 'neutral';
  text: string;
  source?: 'alert';
}

interface Store {
  explainMetric: ExplainMetric;
  explain: (metric: ExplainMetric) => void;
  alertMemory: AlertMemory;
  alertHistory: (EconomicAlert & { atMin: number })[];
  lastAlertDay: number;
  checkAlerts: () => void;
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
  toast: (tone: Toast['tone'], text: string, source?: 'alert') => void;
  newGame: (seed: number, scenario: ScenarioId) => void;
  /** `cloud: 'throttle'` coalesces routine autosaves into at most one upload per few minutes. */
  save: (slot: SlotId, label?: string, cloud?: 'now' | 'throttle') => Promise<void>;
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
  explainMetric: 'gdp',
  explain: explainMetric => set({ explainMetric, panel: 'explain' }),
  alertMemory: {},
  alertHistory: [],
  lastAlertDay: -1,
  checkAlerts: () => {
    const st = get(), g = st.game;
    const day = klDay(g.clock.hour * 60);
    if (day === st.lastAlertDay) return;
    const prefs = usePreferences.getState().alerts;
    const { fresh, memory } = alertTransitions(st.alertMemory, economicAlerts(g, prefs, st.alertMemory));
    const stop = prefs.pauseOnCritical && fresh.some(a => a.severity === 'critical');
    if (stop) {
      g.clock.paused = true;
      resumeAfterDialog = false;
    }
    set({ alertMemory: memory, lastAlertDay: day,
      alertHistory: [...st.alertHistory, ...fresh.map(a => ({ ...a, atMin: g.clock.hour * 60 }))].slice(-40),
      rev: stop ? st.rev + 1 : st.rev });
    if (fresh.length) {
      const first = fresh.find(a => a.severity === 'critical') ?? fresh[0];
      st.toast('bad', `${stop ? 'Paused · ' : ''}${first.title}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''}${prefs.detail === 'detailed' ? `. ${first.detail}` : ''}`, 'alert');
    }
  },
  game: createGame(20270101, 'balanced'),
  rev: 0,
  uiMinute: 0,
  panel: null,
  selection: null,
  toasts: [],
  showNewGame: true,
  showHelp: false,
  confirmOpen: 0,
  pauseOnDialogs: usePreferences.getState().pauseOnDialogs,
  lastSaved: null,
  setPanel: (panel) => set({ panel }),
  select: (selection) => set({ selection }),
  setSpeed: (speed) => {
    if (get().confirmOpen > 0 && get().pauseOnDialogs) return;
    const g = get().game;
    g.clock.speed = speed;
    if (!g.scheduler.campaignEnded) g.clock.paused = false;
    set({ rev: get().rev + 1 });
  },
  togglePause: () => {
    if (get().confirmOpen > 0 && get().pauseOnDialogs) return;
    const g = get().game;
    if (g.scheduler.campaignEnded) return;
    g.clock.paused = !g.clock.paused;
    if (g.clock.paused) void get().save('autosave', 'Autosave');
    set({ rev: get().rev + 1 });
  },
  pause: () => {
    resumeAfterDialog = false;
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
  toast: (tone, text, source) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, tone, text, source }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4200);
  },
  newGame: (seed, scenario) => {
    const game = createGame(seed, scenario);
    resumeAfterDialog = false;
    set({ game, rev: get().rev + 1, uiMinute: displayMinutes(game.clock), selection: null, panel: null, showNewGame: false,
      alertMemory: {}, alertHistory: [], lastAlertDay: klDay(game.clock.hour * 60) });
    lastAutosaveDay = klDay(game.clock.hour * 60);
  },
  save: async (slot, label, cloud = 'now') => {
    // Dev tooling: automated test tabs set this so they never overwrite the player's saves.
    if (import.meta.env.DEV && sessionStorage.getItem('klDevNoSave')) return;
    const g = get().game;
    try {
      const snapshot = serialize(g, label ?? slot);
      await writeSlot(slot, snapshot);
      void syncCloud(slot, snapshot, cloud === 'now');
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
      const appearance: unknown = JSON.parse(json).appearance;
      if (validAppearance(appearance)) useAppearance.getState().update(appearance);
      resumeAfterDialog = false;
      set({ game, rev: get().rev + 1, uiMinute: displayMinutes(game.clock), selection: null, showNewGame: false,
        alertMemory: alertTransitions({}, economicAlerts(game, usePreferences.getState().alerts)).memory,
        alertHistory: [], lastAlertDay: klDay(game.clock.hour * 60),
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
  setPauseOnDialogs: (pauseOnDialogs) => {
    usePreferences.getState().update({ pauseOnDialogs });
    set({ pauseOnDialogs });
  },
  tick: (delta) => {
    const st = get();
    const g = st.game;
    if (g.clock.paused) return;
    const ticks = advance(g, delta);
    if (ticks > 0) st.checkAlerts();
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
      void st.save('autosave', 'Autosave', 'throttle');
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
    // Schedule first: an exception in one tick must not stop the clock loop for the rest of the session.
    raf = requestAnimationFrame(frame);
    if (document.visibilityState !== 'visible') return;
    try {
      useGame.getState().tick(delta);
    } catch (e) {
      console.error('Simulation tick failed', e);
      const st = useGame.getState();
      st.pause();
      st.toast('bad', `Paused: simulation error (${(e as Error).message}). Your last autosave is intact.`);
    }
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      const st = useGame.getState();
      if (!st.game.clock.paused) {
        st.pause();
        st.toast('neutral', 'Auto-paused while the tab was hidden.');
      }
      // Leaving the tab is the moment to get any throttled cloud progress off this device.
      void st.save('autosave', 'Autosave').then(flushCloud);
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

/** Synchronous tab-local checkpoint: async IndexedDB writes may be lost during a reload. */
function checkpointSession() {
  const st = useGame.getState();
  if (st.showNewGame && st.game.scheduler.ticks === 0 && st.game.actions.length === 0) return;
  try {
    if (import.meta.env.DEV && sessionStorage.getItem('klDevNoSave')) return;
    sessionStorage.setItem('kl-session-recovery', serialize(st.game, 'Session recovery'));
  } catch {
    // A full/unavailable session store must not interrupt play. Daily/manual saves remain available.
    void st.save('autosave', 'Autosave', 'throttle');
  }
}
window.addEventListener('beforeunload', checkpointSession);
window.addEventListener('pagehide', checkpointSession);
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', checkpointSession);
  import.meta.hot.dispose(() => {
    checkpointSession();
    window.removeEventListener('beforeunload', checkpointSession);
    window.removeEventListener('pagehide', checkpointSession);
  });
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
      st.checkAlerts();
      useGame.setState({ rev: st.rev + 1, uiMinute: displayMinutes(st.game.clock) });
    },
    state: () => useGame.getState().game,
  };
}
