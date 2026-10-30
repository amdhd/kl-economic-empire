import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface MapAppearance { theme: 'modern-glass' | 'original'; landmarks: boolean }
export const DEFAULT_APPEARANCE: MapAppearance = { theme: 'modern-glass', landmarks: true };
export function validAppearance(value: unknown): value is MapAppearance {
  if (!value || typeof value !== 'object') return false;
  const v = value as MapAppearance;
  return (v.theme === 'modern-glass' || v.theme === 'original') && typeof v.landmarks === 'boolean';
}
export const useAppearance = create<MapAppearance & { update: (patch: Partial<MapAppearance>) => void }>()(persist(
  set => ({ ...DEFAULT_APPEARANCE, update: patch => set(patch) }),
  { name: 'kl-map-appearance', merge: (saved, current) => ({ ...current, ...(validAppearance(saved) ? saved : DEFAULT_APPEARANCE) }) },
));
export function appearanceSnapshot(): MapAppearance {
  const { theme, landmarks } = useAppearance.getState(); return { theme, landmarks };
}
