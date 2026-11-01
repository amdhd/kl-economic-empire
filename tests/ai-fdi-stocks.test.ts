import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/game';
import { aiFdiPipeline, dailyCompanies } from '../src/engine/companies';
import { clone, withoutEvents } from './helpers';
import type { FdiPledge, GameState } from '../src/types/game';

const pledge = (s: GameState, kind: FdiPledge['kind'], status: FdiPledge['status'], amount: number): void => {
  s.fdi.pledges.push({ id: 900 + s.fdi.pledges.length, investor: 'US:MSFT', kind, sector: 'tech', title: 't', amount, ask: 0, incentive: 0, jobs: 0, buildMonths: 12, offeredDay: 0, decideByDay: 0, startDay: 0, spent: 0, status });
};
const mtdRevenue = (s: GameState, id: 'MY:0166' | 'MY:1295') => { dailyCompanies(s); return s.companies[id].mtd.revenue; };

describe('local AI stocks follow AI FDI (D-121)', () => {
  it('counts operating AI and chip FDI in full, building at half, and ignores other kinds', () => {
    const s = createGame(31);
    const base = aiFdiPipeline(s);
    pledge(s, 'datacentre', 'operating', 10e9);
    pledge(s, 'semiconductor', 'building', 10e9);
    pledge(s, 'ev', 'operating', 50e9);
    pledge(s, 'datacentre', 'offered', 50e9);
    expect(aiFdiPipeline(s) - base).toBe(15e9);
  });
  it('lifts Inari revenue but not a bank, and the lift is capped', () => withoutEvents(() => {
    const a = createGame(32);
    const b = clone(a), c = clone(a);
    pledge(b, 'datacentre', 'operating', 20e9);
    const inari0 = mtdRevenue(a, 'MY:0166'), inari1 = mtdRevenue(b, 'MY:0166');
    expect(inari1 / inari0).toBeCloseTo(1 + 0.3 * 0.5, 6);
    expect(mtdRevenue(b, 'MY:1295')).toBeCloseTo(mtdRevenue(a, 'MY:1295'), 6);
    pledge(c, 'datacentre', 'operating', 500e9);
    expect(mtdRevenue(c, 'MY:0166') / inari0).toBeCloseTo(1 + 0.3 * 1.5, 6);
  }));
});
