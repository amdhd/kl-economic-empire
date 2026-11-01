import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data/events';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { buyerMaxPrice } from '../src/engine/export-contracts';
import { runUntil } from './helpers';

const act = (s: ReturnType<typeof createGame>, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, s.clock.hour * 60);

describe('Boom max-profit rules (D-090)', () => {
  it('never starts an adverse event, but realistic mode still does', () => {
    const boom = createGame(501, 'balanced', 'malaysia', { months: 36, boom: true }), real = createGame(501);
    const bad = new Set(EVENTS.filter((e) => e.tone === 'bad').map((e) => e.id));
    runHeadless(boom, 24 * 365 * 2); runHeadless(real, 24 * 365 * 2);
    const started = (s: typeof boom) => s.events.log.filter((e) => bad.has(e.templateId)).length;
    expect(started(boom)).toBe(0);
    expect(started(real)).toBeGreaterThan(0);
    expect(boom.events.log.some((e) => !bad.has(e.templateId))).toBe(true); // good and neutral events still happen
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
});
