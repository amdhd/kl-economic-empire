import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { PEERS, RIVALS } from '../src/data/countries';
import { peerBoard, peerWindow, standingBoard, standingComponents } from '../src/engine/standing';

describe('peer ladder and rival window (D-085)', () => {
  it('adds the 11th–60th economies without touching the top-ten board or the standing score', () => {
    const s = createGame(1);
    expect(PEERS).toHaveLength(49);
    expect(new Set([...RIVALS, ...PEERS].map((r) => r.id)).size).toBe(RIVALS.length + PEERS.length);
    expect(standingBoard(s)).toHaveLength(11);
    expect(peerBoard(s)).toHaveLength(60);
    expect(standingComponents(s).points).toBe(50);
    const smallest10 = Math.min(...RIVALS.map((r) => r.gdpUsd[0]));
    expect(Math.max(...PEERS.map((r) => r.gdpUsd[0]))).toBeLessThan(smallest10);
  });

  it('shows five rows: two above Malaysia, Malaysia, two below, ranked by GDP', () => {
    const s = createGame(1);
    const w = peerWindow(s);
    expect(w).toHaveLength(5);
    expect(w[2].isMalaysia).toBe(true);
    expect(w.map((r) => r.rank)).toEqual([w[0].rank, w[0].rank + 1, w[0].rank + 2, w[0].rank + 3, w[0].rank + 4]);
    expect(w[1].gdpUsd).toBeGreaterThanOrEqual(w[2].gdpUsd);
    expect(w[3].gdpUsd).toBeLessThanOrEqual(w[2].gdpUsd);
    expect(w[2].rank).toBeGreaterThan(11); // the opening rival a few places away, not Brazil
    expect(w[0].gdpUsd / w[2].gdpUsd).toBeLessThan(1.5);
  });

  it('keeps five rows when Malaysia is at either end of the ladder', () => {
    const s = createGame(1);
    s.indicators.nominalGdpAnnual = 1e18; // far above every rival
    const top = peerWindow(s);
    expect(top).toHaveLength(5);
    expect(top[0].isMalaysia).toBe(true);
    s.indicators.nominalGdpAnnual = 1e9; // far below
    const bottom = peerWindow(s);
    expect(bottom).toHaveLength(5);
    expect(bottom[4].isMalaysia).toBe(true);
  });
});
