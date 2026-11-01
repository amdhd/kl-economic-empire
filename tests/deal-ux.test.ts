import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { DEAL_ROUNDS, offerDeal } from '../src/engine/deals';
import { takeoverOffers } from '../src/engine/takeovers';
import { exportOffers, buyerMaxPrice } from '../src/engine/export-contracts';
import { supplyOffers } from '../src/engine/supply-contracts';
import { dealOutlook } from '../src/engine/deal-outlook';
import { gdpHistory } from '../src/engine/gdp-history';
import { bnTick } from '../src/utils/format';
import { withoutEvents } from './helpers';
import { investorAsk } from '../src/engine/investment-deals';

describe('looser Deal Room negotiation and outlook (D-086)', () => {
  it('takeover sellers accept any bid from 0.9× market, even below the rival, and allow six rounds (D-097)', () => {
    const s = createGame(7);
    takeoverOffers(s);
    const d = s.deals.items.at(-1)!;
    d.status = 'negotiating';
    expect(DEAL_ROUNDS).toBe(6);
    expect(offerDeal(s, d.id, { priceFactor: 0.9 })).toBeNull();
    expect(d.terms.priceFactor).toBe(0.9); // accepted as offered: no counter at the rival's price
    for (let i = 1; i < DEAL_ROUNDS; i++) expect(offerDeal(s, d.id, { priceFactor: 1.1 })).toBeNull();
    expect(d.rounds).toBe(DEAL_ROUNDS);
    expect(offerDeal(s, d.id, { priceFactor: 1.1 })).toMatch(/closed/i);
  });

  it('export buyers pay more and supply premiums are smaller', () => {
    expect(buyerMaxPrice(24, 0)).toBeGreaterThan(1.1);
    expect(buyerMaxPrice(60, 0)).toBeGreaterThan(1.1);
    const s = createGame(7);
    supplyOffers(s);
    const d = s.deals.items.find((x) => x.kind === 'supply')!;
    d.status = 'negotiating';
    expect(offerDeal(s, d.id, { priceFactor: 0.9, months: 12, protection: 0 })).toBeNull();
    expect(d.terms.priceFactor).toBeLessThan(1.01);
    expect(offerDeal(s, d.id, { priceFactor: 0.8 })).toMatch(/0\.85/);
  });

  it('every kind of offer explains what you get and pay, and shows expected profit where one exists', () => {
    const s = createGame(7);
    takeoverOffers(s); exportOffers(s); supplyOffers(s);
    const kinds = new Set<string>();
    for (const d of s.deals.items) {
      const o = dealOutlook(s, d);
      kinds.add(d.kind);
      expect(o.pays.length).toBeGreaterThan(0);
      expect(o.gets.length + (o.profit ? 1 : 0)).toBeGreaterThan(0);
    }
    expect(kinds).toContain('takeover');
    const take = s.deals.items.find((d) => d.kind === 'takeover')!;
    const o = dealOutlook(s, take);
    expect(o.profit!.text).toMatch(/Expected profit about RM.*a year/);
    expect(o.profit!.tone).toBe('good');
    expect(o.risks.join(' ')).toMatch(/1 in 4/);
  });
});

describe('monthly GDP history (D-086)', () => {
  it('has an opening point and, for each closed month, three plain reasons that reconcile with the US$ change', () => withoutEvents(() => {
    const s = createGame(9);
    expect(gdpHistory(s)).toHaveLength(1);
    runHeadless(s, 24 * 95);
    const h = gdpHistory(s);
    expect(h).toHaveLength(s.reports.length + 1);
    expect(h.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < h.length; i++) {
      expect(h[i].reasons).toHaveLength(3);
      expect(h[i].reasons[0]).toMatch(/^US\$ GDP (rose|fell)/);
      expect(h[i].changeUsd).toBeCloseTo(h[i].usd - h[i - 1].usd, 9);
      expect(h[i].reasons[1]).toMatch(/ringgit/i);
    }
  }));
});

describe('axis labels in trillions', () => {
  it('never prints 1000 billions', () => {
    expect(bnTick(1400)).toBe('RM1.4tn');
    expect(bnTick(1600)).toBe('RM1.6tn');
    expect(bnTick(1000)).toBe('RM1tn');
    expect(bnTick(850)).toBe('RM850bn');
    expect(bnTick(12.5)).toBe('RM12.5bn');
    expect(bnTick(0.5)).toBe('RM500m');
    expect(bnTick(2400, 'US$')).toBe('US$2.4tn');
  });
});

describe('investors accept any grant (D-097)', () => {
  it('ask nothing in every mode', () => {
    for (const boom of [false, true]) {
      const s = createGame(7, 'balanced', 'malaysia', { boom });
      const d = s.deals.items.find((x) => x.kind === 'investment')!;
      expect(investorAsk(s, d)).toBe(0);
    }
  });
});
