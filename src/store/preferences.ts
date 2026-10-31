import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ALERTS, validAlertPreferences, type AlertPreferences } from '../engine/alerts';
interface Preferences { alerts: AlertPreferences; pauseOnDialogs: boolean; }
export const usePreferences = create<Preferences & { update: (patch: Partial<Preferences>) => void }>()(persist(
  set => ({ alerts: structuredClone(DEFAULT_ALERTS), pauseOnDialogs: true, update: patch => set(patch) }),
  { name: 'kl-play-preferences', merge: (saved, current) => {
    const p = saved as Partial<Preferences> | null;
    return { ...current, alerts: validAlertPreferences(p?.alerts) ? p.alerts : current.alerts,
      pauseOnDialogs: typeof p?.pauseOnDialogs === 'boolean' ? p.pauseOnDialogs : current.pauseOnDialogs };
  } },
));
