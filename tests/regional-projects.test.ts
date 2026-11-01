import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { PROJECTS, REGIONAL_PROJECTS } from '../src/data/projects';
import { KL_ECONOMY_SHARE } from '../src/data/world';

describe('regional projects (D-096)', () => {
  it('are listed with unique ids and are national', () => {
    expect(REGIONAL_PROJECTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PROJECTS.map((p) => p.id)).size).toBe(PROJECTS.length);
    expect(REGIONAL_PROJECTS.every((p) => p.national)).toBe(true);
  });

  it('are refused in the legacy KL profile', () => {
    const s = createGame(7, 'balanced', 'legacy-kl');
    expect(applyCommand(s, { type: 'startProject', templateId: 'jb_zone' }, s.clock.hour * 60).ok).toBe(false);
  });

  it('are never cancelled or failed by chance: with cash, every one completes', () => {
    for (const seed of [3, 11]) {
      const s = createGame(seed);
      s.government.treasury += 200e9 * 100; // enough cash that funding never stalls
      for (const t of REGIONAL_PROJECTS) expect(applyCommand(s, { type: 'startProject', templateId: t.id }, s.clock.hour * 60).ok).toBe(true);
      runHeadless(s, 24 * 30 * 26);
      for (const t of REGIONAL_PROJECTS) {
        const p = s.government.projects.find((x) => x.templateId === t.id)!;
        expect(p.status).toBe('complete');
      }
      expect(s.government.projects.some((p) => p.status === 'cancelled')).toBe(false);
    }
  });

  it('reach the national economy at full strength, not at the KL share', () => {
    const s = createGame(5);
    s.government.treasury += 20e9 * 100;
    applyCommand(s, { type: 'startProject', templateId: 'penang_port' }, s.clock.hour * 60);
    const before = s.sectors.ind.infraBoost;
    runHeadless(s, 24 * 30 * 19);
    const gain = s.sectors.ind.infraBoost - before;
    const t = REGIONAL_PROJECTS.find((p) => p.id === 'penang_port')!;
    expect(gain).toBeGreaterThan(t.productivity.ind! * KL_ECONOMY_SHARE * 3);
    expect(gain).toBeLessThanOrEqual(t.productivity.ind! + 1e-9);
  });
});
