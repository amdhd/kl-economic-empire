import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data/events';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { buyerMaxPrice } from '../src/engine/export-contracts';
import { infraAutopilot, runUntil } from './helpers';

const act = (s: ReturnType<typeof createGame>, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, s.clock.hour * 60);

describe('Boom max-profit rules (D-090)', () => {
  it('starts no macro event of any tone, but realistic mode still does', () => {
    const boom = createGame(501, 'balanced', 'malaysia', { months: 36, boom: true }), real = createGame(501);
    runHeadless(boom, 24 * 365 * 2); runHeadless(real, 24 * 365 * 2);
    const macro = (s: typeof boom) => s.events.log.filter((e) => !EVENTS.find((x) => x.id === e.templateId)!.company).length;
    expect(macro(boom)).toBe(0); // a ringgit rally or tourism surge would end in a cliff (D-092)
    expect(macro(real)).toBeGreaterThan(0);
  });

  it('export buyers pay up to 30% over market in Boom and keep the contract', () => {
    const s = createGame(502, 'balanced', 'malaysia', { months: 36, boom: true }), d = s.deals.items.find((x) => x.template === 'export:chips')!;
    expect(buyerMaxPrice(60, 0, s)).toBe(1.3);
    expect(buyerMaxPrice(60, 0)).toBeLessThan(1.15);
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

  it('no month loses more than 3% of real GDP or 6% of US$ GDP in the first 18 months (no event cliffs, D-092)', () => {
    const DAYS: Record<string, number> = { Jan: 31, Feb: 28, Mar: 31, Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30, Dec: 31 };
    for (const seed of [20270101, 7, 99]) {
      const s = createGame(seed, 'balanced', 'malaysia', { months: 36, boom: true });
      runHeadless(s, 24 * 31 * 19, (g) => {
        infraAutopilot(g);
        if (g.clock.hour % 24 === 9) for (const p of g.fdi.pledges) if (p.status === 'offered') applyCommand(g, { type: 'decidePledge', id: p.id, approve: true, incentive: Math.min(0.3, p.ask) }, g.clock.hour * 60);
      });
      let real = 0, usd = 0;
      for (const r of s.reports.slice(0, 18)) {
        const days = DAYS[r.label.slice(0, 3)] + (r.label.startsWith('Feb 2028') ? 1 : 0);
        const nr = (r.realGdp * 365) / days, nu = (r.nominalGdp * 365) / days / r.myrPerUsd;
        if (real) { expect(nr / real - 1).toBeGreaterThan(-0.03); expect(nu / usd - 1).toBeGreaterThan(-0.06); }
        real = nr; usd = nu;
      }
    }
  }, 300_000);
});
