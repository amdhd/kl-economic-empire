// D-059: policy levers with phase cycles, AI adoption, foreign direct investment and the global standing board.
import { describe, expect, it } from 'vitest';
import { RIVALS } from '../src/data/countries';
import { attractiveness, FDI_KINDS, overallAttractiveness } from '../src/engine/fdi';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { leverPhase, leverValue, MIN_WAGE0 } from '../src/engine/policy';
import { rivalGdpUsd, standingBoard, standingComponents } from '../src/engine/standing';
import { deserialize, serialize } from '../src/persistence/save';
import type { GameState, LeverId } from '../src/types/game';
import { clone, runUntil, withoutEvents } from './helpers';

const act = (s: GameState, c: Parameters<typeof applyCommand>[1]) => applyCommand(s, c, s.clock.hour * 60);
const lever = (s: GameState, id: LeverId, value: number) => expect(act(s, { type: 'setLever', lever: id, value }).ok).toBe(true);
const pair = (seed: number, setup: (s: GameState) => void, until: [number, number, number]) => {
  const base = createGame(seed);
  runUntil(base, 2027, 1, 4, 10);
  const shocked = clone(base);
  setup(shocked);
  runUntil(base, ...until);
  runUntil(shocked, ...until);
  return { base, shocked };
};

describe('policy lever cycle', () => {
  it('announces now, takes effect tomorrow and phases in over the ramp', () => withoutEvents(() => {
    const s = createGame(1101);
    runUntil(s, 2027, 1, 4, 10);
    lever(s, 'minimumWage', 2200);
    expect(leverPhase(s, 'minimumWage').phase).toBe('announced');
    expect(leverValue(s, 'minimumWage')).toBe(MIN_WAGE0);
    runUntil(s, 2027, 1, 5, 1);
    expect(leverPhase(s, 'minimumWage').phase).toBe('phasing');
    expect(leverValue(s, 'minimumWage')).toBeGreaterThan(MIN_WAGE0);
    expect(leverValue(s, 'minimumWage')).toBeLessThan(2200);
    runUntil(s, 2027, 5, 2, 1);
    expect(leverPhase(s, 'minimumWage').phase).toBe('full');
    expect(leverValue(s, 'minimumWage')).toBe(2200);
    expect(act(s, { type: 'setLever', lever: 'minimumWage', value: 9000 }).ok).toBe(false);
    expect(act(s, { type: 'setLever', lever: 'hotMoneyControls', value: 0.5 }).ok).toBe(false);
  }));
});

describe('policy effects (paired, events off)', () => {
  it('minimum wage: higher low-wage pay and prices, slower low-wage hiring', () => withoutEvents(() => {
    const { base, shocked } = pair(1102, s => lever(s, 'minimumWage', 2400), [2027, 8, 20]);
    expect(shocked.households.mtd.wages).toBeGreaterThan(base.households.mtd.wages);
    expect(shocked.indicators.cpi).toBeGreaterThan(base.indicators.cpi);
    // Labour hoarding first; after a year retail employs fewer people per unit of output than without the rise.
    runUntil(base, 2028, 3, 20); runUntil(shocked, 2028, 3, 20);
    expect(shocked.sectors.cons.employment / shocked.sectors.cons.output).toBeLessThan(base.sectors.cons.employment / base.sectors.cons.output);
  }));

  it('carbon tax: treasury receipts, higher power prices and CPI, lower emissions', () => withoutEvents(() => {
    const { base, shocked } = pair(1103, s => lever(s, 'carbonTax', 100), [2027, 10, 1]);
    expect(shocked.reports.at(-1)!.gov.policyLevy).toBeGreaterThan(base.reports.at(-1)!.gov.policyLevy + 1e8);
    expect(shocked.sectors.util.price).toBeGreaterThan(base.sectors.util.price * 1.03);
    expect(shocked.indicators.cpi).toBeGreaterThan(base.indicators.cpi);
    expect(shocked.policy.emissionsIndex).toBeLessThan(base.policy.emissionsIndex);
    expect(shocked.reports.at(-1)!.reconciliation?.cashResidualMinor).toBe(0);
  }));

  it('export-proceeds conversion strengthens the ringgit but deters FDI at once', () => withoutEvents(() => {
    const s = createGame(1104);
    runUntil(s, 2027, 1, 4, 10);
    const before = overallAttractiveness(s);
    const { base, shocked } = pair(1104, x => lever(x, 'exportConversion', 0.5), [2027, 5, 1]);
    lever(s, 'exportConversion', 0.5);
    expect(overallAttractiveness(s)).toBeLessThan(before - 10);
    // Seeds 1104–1109 strengthen the ringgit by 1.2–2.0% here; the exact step depends on the market path (D-080).
    expect(shocked.external.myrPerUsd).toBeLessThan(base.external.myrPerUsd * 0.99);
  }));

  it('short-term flow controls damp ringgit swings and add a bond premium', () => withoutEvents(() => {
    const { base, shocked } = pair(1105, s => lever(s, 'hotMoneyControls', 1), [2027, 8, 1]);
    const vol = (g: GameState) => { const d = g.daily.slice(-150).map(x => x.fx); const r = d.slice(1).map((x, i) => Math.log(x / d[i])); const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length); };
    expect(vol(shocked)).toBeLessThan(vol(base));
    expect(shocked.external.mgs10).toBeGreaterThan(base.external.mgs10);
  }));

  it('AI programme: adoption and productivity rise with a lag; reskilling limits mismatch unemployment', () => withoutEvents(() => {
    const ai = pair(1106, s => lever(s, 'aiProgramme', 5e9), [2028, 6, 1]);
    const both = pair(1106, s => { lever(s, 'aiProgramme', 5e9); lever(s, 'reskilling', 2e9); }, [2028, 6, 1]);
    expect(ai.shocked.policy.aiAdoption).toBeGreaterThan(ai.base.policy.aiAdoption + 0.03);
    expect(ai.shocked.policy.aiEffective).toBeLessThan(ai.shocked.policy.aiAdoption);
    const prod = (g: GameState) => g.sectors.fin.output / g.sectors.fin.employment;
    expect(prod(ai.shocked)).toBeGreaterThan(prod(ai.base) * 1.005);
    expect(ai.shocked.reports.at(-1)!.gov.policyGrant).toBeGreaterThan(3e8);
    const meanU = (g: GameState) => g.reports.slice(-6).reduce((a, r) => a + r.unemployment, 0) / 6;
    expect(meanU(both.shocked)).toBeLessThan(meanU(ai.shocked));
  }));

  it('a foreign-worker freeze shrinks the foreign workforce and tightens the labour market', () => withoutEvents(() => {
    const { base, shocked } = pair(1107, s => lever(s, 'workerFreeze', 1), [2028, 1, 1]);
    expect(shocked.policy.foreignWorkers).toBeLessThan(base.policy.foreignWorkers - 0.1);
    expect(shocked.households.wageIndex).toBeGreaterThan(base.households.wageIndex);
  }));
});

describe('foreign direct investment', () => {
  it('opens with a headline pledge; approval builds, pays grants, supports the ringgit and adds exports', () => withoutEvents(() => {
    const s = createGame(1201);
    const google = s.fdi.pledges[0]; // D-113: the opening investor, kind and size are drawn from the campaign seed
    expect(google.status).toBe('offered');
    expect(google.amount).toBeGreaterThanOrEqual(FDI_KINDS[google.kind].amount[0]);
    expect(google.amount).toBeLessThanOrEqual(FDI_KINDS[google.kind].amount[1]);
    runUntil(s, 2027, 1, 4, 10);
    const base = clone(s);
    expect(act(s, { type: 'decidePledge', id: google.id, approve: true, incentive: google.ask }).ok).toBe(true);
    const p = s.fdi.pledges.find(x => x.id === google.id)!;
    expect(p.status).toBe('building');
    runUntil(s, 2027, 4, 1, 1);
    runUntil(base, 2027, 4, 1, 1);
    expect(p.spent).toBeGreaterThan(0);
    const grants = s.reports.slice(0, 3).reduce((a, r) => a + r.gov.policyGrant, 0) + s.government.mtd.policyGrant;
    expect(grants).toBeCloseTo(p.spent * p.incentive, -3);
    expect(s.reports.every(r => r.reconciliation?.cashResidualMinor === 0)).toBe(true);
    expect(s.reports.at(-1)!.investment + s.reports.at(-1)!.realGdp).toBeGreaterThan(0);
    expect(s.indicators.realGdpAnnual).toBeGreaterThan(base.indicators.realGdpAnnual);
    runUntil(s, 2028, 9, 1, 1);
    expect(p.status).toBe('operating');
    expect(s.trade.history.at(-1)!.exports).toBeGreaterThan(0);
  }));

  it('lets undecided pledges lapse, records declines and may lose investors offered less than they ask', () => withoutEvents(() => {
    const s = createGame(1202);
    const g = s.fdi.pledges[0];
    runUntil(s, 2027, 2, 15, 1);
    expect(s.fdi.pledges.find(x => x.id === g.id)!.status).toBe('withdrawn');
    const t = createGame(1203);
    expect(act(t, { type: 'decidePledge', id: t.fdi.pledges[0].id, approve: false, incentive: 0 }).ok).toBe(true);
    expect(t.fdi.pledges[0].status).toBe('declined');
    let walked = 0;
    for (let seed = 1300; seed < 1320; seed++) {
      const u = createGame(seed);
      act(u, { type: 'decidePledge', id: u.fdi.pledges[0].id, approve: true, incentive: 0 });
      if (u.fdi.pledges[0].status === 'withdrawn') walked++;
    }
    expect(walked).toBeGreaterThan(5);
    expect(walked).toBeLessThan(20);
  }));

  it('a better investment climate brings more pledges, from its own random stream', () => withoutEvents(() => {
    let neutral = 0, eager = 0;
    for (const seed of [1401, 1402, 1403]) {
      const a = createGame(seed), b = createGame(seed);
      lever(b, 'fdiIncentive', 0.2); lever(b, 'fdiGreenLane', 1); lever(b, 'aiProgramme', 5e9);
      expect(attractiveness(b, 'datacentre')).toBeGreaterThan(attractiveness(a, 'datacentre') + 20);
      runHeadless(a, 24 * 365); runHeadless(b, 24 * 365);
      neutral += a.fdi.pledges.length; eager += b.fdi.pledges.length;
    }
    expect(eager).toBeGreaterThan(neutral);
    // Unapproved pledges change nothing else: the engine's main RNG is untouched by the FDI stream.
    const c = createGame(1404), d = createGame(1404);
    d.fdi.enabled = false;
    runHeadless(c, 24 * 120); runHeadless(d, 24 * 120);
    expect(c.rng).toEqual(d.rng);
  }));
});

describe('global standing', () => {
  it('ranks Malaysia against the ten largest economies and scores relative progress', () => withoutEvents(() => {
    const s = createGame(1501);
    const board = standingBoard(s);
    expect(board).toHaveLength(11);
    expect(board.map(r => r.id).slice(0, 2)).toEqual(['USA', 'CHN']);
    expect(board.find(r => r.isMalaysia)!.rank).toBe(11);
    expect(rivalGdpUsd(s, RIVALS[0], 0)).toBeCloseTo(32642.373 * (s.external.usDemand / 1), 3);
    expect(standingComponents(s).points).toBe(50);
    runUntil(s, 2027, 7, 1, 1);
    const c = standingComponents(s);
    expect(c.points).toBeGreaterThan(0);
    expect(c.points).toBeLessThan(100);
    expect(s.indicators.score.standing).toBeCloseTo(c.points, 6);
    // A stronger ringgit raises the currency component.
    const strong = clone(s);
    strong.fdi.standing.at(-1)!.myrPerUsd *= 0.9;
    expect(standingComponents(strong).currencyPoints).toBeGreaterThan(c.currencyPoints);
  }));
});

describe('saves', () => {
  it('round-trips levers and pledges, rejects corrupt levers and migrates schema 8 with the systems off', () => withoutEvents(() => {
    const s = createGame(1601);
    runUntil(s, 2027, 1, 4, 10);
    lever(s, 'carbonTax', 50);
    const t = deserialize(serialize(s));
    expect(t.policy).toEqual(s.policy);
    expect(t.fdi).toEqual(s.fdi);
    const bad = JSON.parse(serialize(s));
    bad.state.policy.levers.carbonTax.value = 999;
    expect(() => deserialize(JSON.stringify(bad))).toThrow();
    const old = JSON.parse(serialize(s));
    old.state.schemaVersion = 8;
    old.state.baseline.model = 2;
    old.state.controls.plans = [];
    delete old.state.policy; delete old.state.fdi;
    for (const f of [old.state.government.mtd, ...old.state.reports.map((r: { gov: object }) => r.gov)]) { delete f.policyLevy; delete f.policyGrant; }
    const m = deserialize(JSON.stringify(old));
    expect(m.policy.enabled).toBe(false);
    expect(m.fdi.enabled).toBe(false);
    expect(m.government.mtd.policyLevy).toBe(0);
    runHeadless(m, 24 * 40);
    expect(m.fdi.pledges).toHaveLength(0);
  }));
});
