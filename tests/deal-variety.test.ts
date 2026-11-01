import { describe, it, expect } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { serialize, deserialize } from '../src/persistence/save';
import { dealTheme, flavourDraw } from '../src/engine/deal-flavour';
import { FDI_KINDS } from '../src/engine/fdi';

const room = (seed: number, boom = false, days = 0) => {
  const s = createGame(seed, 'balanced', 'malaysia', boom ? { months: 36, boom: true } : {});
  if (days) runHeadless(s, days * 24);
  return s;
};
const view = (s: ReturnType<typeof room>) => ({
  deals: s.deals.items.map((d) => [d.kind, d.name, d.counterparty, d.note, d.priceMinor]),
  pledges: s.fdi.pledges.map((p) => [p.investor, p.kind, p.amount, p.ask]),
});

describe('Deal Room variety (D-116)', () => {
  it('is identical for one seed and survives a save round trip', () => {
    expect(view(room(4242))).toEqual(view(room(4242)));
    const a = room(4242, false, 200), b = deserialize(serialize(a));
    runHeadless(a, 24 * 100);
    runHeadless(b, 24 * 100);
    expect(view(b)).toEqual(view(a));
  });
  it('differs visibly between seeds, in realistic and Boom mode', () => {
    for (const boom of [false, true]) {
      const names = new Set<string>(), cps = new Set<string>(), openers = new Set<string>();
      for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
        const s = room(seed, boom, 380);
        for (const d of s.deals.items) { names.add(d.name); cps.add(d.counterparty); }
        openers.add(`${s.fdi.pledges[0].kind}:${s.fdi.pledges[0].investor}`);
      }
      expect(cps.size).toBeGreaterThan(40);
      expect(names.size).toBeGreaterThan(40);
      expect(openers.size).toBeGreaterThan(2);
    }
  });
  it('shows different opening offers for different seeds', () => {
    const rooms = [21, 22, 23, 24, 25, 26].map((seed) => JSON.stringify(view(room(seed))));
    expect(new Set(rooms).size).toBe(rooms.length);
    expect(new Set([21, 22, 23, 24, 25, 26, 27, 28, 29].map((x) => dealTheme({ seed: x }).id)).size).toBeGreaterThan(2);
  });
  it('keeps figures inside the existing limits', () => {
    for (const seed of [31, 32, 33, 34]) {
      const s = room(seed, true, 380);
      const p = s.fdi.pledges[0], k = FDI_KINDS[p.kind];
      expect(p.amount).toBeGreaterThanOrEqual(k.amount[0]);
      expect(p.amount).toBeLessThanOrEqual(k.amount[1]);
      expect(p.ask).toBeGreaterThanOrEqual(k.askRange[0]);
      expect(p.ask).toBeLessThanOrEqual(k.askRange[1]);
      for (const d of s.deals.items) {
        expect(Number.isSafeInteger(d.priceMinor)).toBe(true);
        expect(d.priceMinor).toBeGreaterThan(0);
        expect(d.counterparty).toMatch(/fictional|\(|Merdeka/);
        if (d.kind === 'startup') expect(d.terms.stake).toBeCloseTo(0.2);
        if (d.kind === 'export') expect(d.volume!).toBeGreaterThanOrEqual(1e9 * 0.7 * 0.9);
        if (d.template.startsWith('supply:fuel')) expect(d.terms.priceFactor).toBeGreaterThanOrEqual(0.85);
        if (d.template.startsWith('supply:')) expect(d.terms.priceFactor).toBeLessThanOrEqual(1.2);
      }
    }
  });
  it('does not consume random numbers', () => {
    const a = createGame(77), b = createGame(77);
    expect(flavourDraw(a, 'x')).toBe(flavourDraw(a, 'x'));
    expect(a.rng).toEqual(b.rng);
    expect(a.deals.rng).toEqual(b.deals.rng);
  });
  it('mirrors every offered FDI pledge in the Deal Room so each can be negotiated', () => {
    for (const seed of [41, 42, 43]) {
      const s = room(seed, true, 300);
      for (const p of s.fdi.pledges.filter((x) => x.status === 'offered'))
        expect(s.deals.items.some((d) => d.pledgeId === p.id)).toBe(true);
      expect(new Set(s.fdi.pledges.map((p) => p.kind)).size).toBeGreaterThan(1);
    }
  });
});

describe('start-up stakes are billion-ringgit deals (D-123)', () => {
  it('a 20% start-up stake costs billions and fits inside the private-holding cap', async () => {
    const { createGame } = await import('../src/engine/game');
    const { enterpriseOffers } = await import('../src/engine/private-enterprises');
    const s = createGame(5);
    enterpriseOffers(s);
    const d = s.deals.items.filter((x) => x.kind === 'startup').at(-1)!;
    expect(d.priceMinor / 100).toBeGreaterThan(1e9);
    expect(d.priceMinor / 100).toBeLessThan(4e9);
  });
});
