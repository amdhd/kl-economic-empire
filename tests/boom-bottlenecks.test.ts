import { describe, expect, it } from 'vitest';
import { SECTOR_IDS } from '../src/data/economic-baseline';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { infraAutopilot, withoutEvents } from './helpers';

/** A player who builds infrastructure ahead of load and approves every investment pledge. */
const play = (g: ReturnType<typeof createGame>) => {
  infraAutopilot(g);
  if (g.clock.hour % 24 === 9) for (const p of g.fdi.pledges) if (p.status === 'offered') applyCommand(g, { type: 'decidePledge', id: p.id, approve: true, incentive: Math.min(0.3, p.ask) }, g.clock.hour * 60);
};
const maxUtil = (g: ReturnType<typeof createGame>) => Math.max(...SECTOR_IDS.map((j) => g.sectors[j].utilization));

describe('Boom bottlenecks (D-112)', () => {
  it('no sector stays far above 100% utilisation: plants add capacity and migrants fill jobs', () => withoutEvents(() => {
    for (const seed of [20270101, 99]) {
      const s = createGame(seed, 'balanced', 'malaysia', { months: 36, boom: true });
      const laborForce0 = s.households.laborForce;
      runHeadless(s, 24 * 31 * 23, play);
      expect(maxUtil(s)).toBeLessThan(1.3); // was 1.5–2.0 before: tech alone ran at 160–200%
      expect(s.households.laborForce).toBeGreaterThan(laborForce0 * 1.2);
      expect(s.households.employed / s.households.laborForce).toBeLessThanOrEqual(0.985 + 1e-9);
    }
  }), 120_000);

  it('a finished FDI plant raises its sector capacity in Boom mode only', () => withoutEvents(() => {
    const finish = (boom: boolean) => {
      const s = createGame(7, 'balanced', 'malaysia', { months: 36, boom });
      s.fdi.pledges = [];
      runHeadless(s, 24 * 3);
      s.fdi.rng = { ...s.fdi.rng };
      const p = { id: 999, investor: 'X', kind: 'datacentre', sector: 'tech', title: 'Test plant', amount: 20e9, ask: 0, incentive: 0, jobs: 1000, buildMonths: 1, offeredDay: 0, decideByDay: 0, status: 'building', spent: 20e9 - 1, startDay: 0 } as unknown as (typeof s.fdi.pledges)[number];
      s.fdi.pledges.push(p);
      const before = s.sectors.tech.capacity;
      runHeadless(s, 24 * 2); // two days, so no month close adds anything else
      expect(p.status).toBe('operating');
      return s.sectors.tech.capacity / before - 1;
    };
    expect(finish(false)).toBeCloseTo(0, 9);
    expect(finish(true)).toBeGreaterThan(0.001);
  }));
});
