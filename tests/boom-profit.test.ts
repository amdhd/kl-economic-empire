import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data/events';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { buyerMaxPrice } from '../src/engine/export-contracts';
import { aggregateMods } from '../src/engine/external';
import { infraAutopilot, runUntil } from './helpers';

const act = (s: ReturnType<typeof createGame>, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, s.clock.hour * 60);

describe('Boom max-profit rules (D-090)', () => {
  it('starts only upside macro events in Boom (no hikes, slowdowns or slumps); realistic mode still starts bad ones', () => {
    const boom = createGame(501, 'balanced', 'malaysia', { months: 36, boom: true }), real = createGame(501);
    runHeadless(boom, 24 * 365 * 3); runHeadless(real, 24 * 365 * 3);
    const tmpl = (id: string) => EVENTS.find((x) => x.id === id)!;
    const macro = (s: typeof boom) => s.events.log.filter((e) => !tmpl(e.templateId).company).map((e) => e.templateId);
    const m = macro(boom);
    expect(m.length).toBeGreaterThan(0); // surges still happen
    expect(m.every((id) => tmpl(id).tone === 'good' || id === 'myr_strong')).toBe(true);
    expect(macro(real).some((id) => tmpl(id).tone === 'bad')).toBe(true);
  }, 120_000);

  it('events fade out over 45 days in Boom instead of ending in a cliff, and surge in at full speed', () => {
    const boom = createGame(502, 'balanced', 'malaysia', { months: 36, boom: true }), real = createGame(502);
    for (const s of [boom, real]) s.events.active.push({ id: 1, templateId: 'tourism_boom', title: 't', startDay: 100, endDay: 200, magnitude: 1 });
    const at = (s: typeof boom, day: number) => aggregateMods(s, day).tourism;
    expect(at(boom, 107)).toBeCloseTo(at(real, 107), 9); // fully in after 7 days
    expect(at(real, 199)).toBeCloseTo(1.2, 6); // realistic: full strength until the last day, then gone
    expect(at(boom, 199)).toBeLessThan(1.01);
    expect(at(boom, 199)).toBeGreaterThan(1);
    expect(at(boom, 160)).toBeGreaterThan(at(boom, 180));
  });

  it('export buyers pay up to 30% over market in Boom and keep the contract', () => {
    const s = createGame(502, 'balanced', 'malaysia', { months: 36, boom: true }), d = s.deals.items.find((x) => x.template === 'export:chips')!;
    expect(buyerMaxPrice(60, 0, s)).toBe(1.3);
    expect(buyerMaxPrice(60, 0)).toBe(1.3); // D-097: the same in every mode
    act(s, { type: 'deal', id: d.id, action: 'review' });
    expect(act(s, { type: 'dealOffer', id: d.id, terms: { months: 60, priceFactor: 1.3, protection: 0 } }).ok).toBe(true);
    expect(d.terms.priceFactor).toBe(1.3);
    expect(act(s, { type: 'deal', id: d.id, action: 'sign' }).ok).toBe(true);
    runUntil(s, 2027, 8, 1, 1);
    expect(d.status).toBe('active');
    expect(d.penaltyMinor ?? 0).toBe(0);
  });

  it('suppliers sell down to 15% under market in Boom', () => {
    const s = createGame(503, 'balanced', 'malaysia', { months: 36, boom: true }), d = s.deals.items.find((x) => x.template === 'supply:fuel')!;
    expect(d).toBeDefined();
    act(s, { type: 'deal', id: d.id, action: 'review' });
    expect(act(s, { type: 'dealOffer', id: d.id, terms: { months: 12, priceFactor: 0.85, protection: 0 } }).ok).toBe(true);
    expect(d.terms.priceFactor).toBe(0.85);
  });

  it('no month loses more than 1% of real, ringgit or US$ GDP over 36 months on three seeds (surges fade instead of cliffing, D-094; ringgit weakening cap, D-093)', () => {
    const DAYS: Record<string, number> = { Jan: 31, Feb: 28, Mar: 31, Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30, Dec: 31 };
    for (const seed of [20270101, 99, 1234]) {
      const s = createGame(seed, 'balanced', 'malaysia', { months: 36, boom: true });
      runHeadless(s, 24 * 31 * 37, (g) => {
        infraAutopilot(g);
        if (g.clock.hour % 24 === 9) for (const p of g.fdi.pledges) if (p.status === 'offered') applyCommand(g, { type: 'decidePledge', id: p.id, approve: true, incentive: Math.min(0.3, p.ask) }, g.clock.hour * 60);
      });
      let real = 0, usd = 0, myr = 0;
      for (const r of s.reports) {
        const days = DAYS[r.label.slice(0, 3)] + (r.label.startsWith('Feb 2028') ? 1 : 0);
        const nr = (r.realGdp * 365) / days, nm = (r.nominalGdp * 365) / days, nu = nm / r.myrPerUsd;
        if (real) { expect(nr / real - 1).toBeGreaterThan(-0.01); expect(nm / myr - 1).toBeGreaterThan(-0.01); expect(nu / usd - 1).toBeGreaterThan(-0.011); }
        real = nr; usd = nu; myr = nm;
      }
    }
  }, 300_000);
});
