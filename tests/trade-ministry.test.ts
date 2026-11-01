import { describe, expect, it } from 'vitest';
import { EXPORT_PRODUCTS, GOODS_EXPORTS_2025, GOODS_IMPORTS_2025, SERVICES_EXPORTS_2025 } from '../src/data/trade';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { BOOM } from '../src/data/boom';
import { dealGain, dealRounds, dealTalkDays, offerValue, requiredDepth, tradeRunRate } from '../src/engine/trade-book';
import { deserialize, serialize } from '../src/persistence/save';
import { clone, runUntil, withoutEvents } from './helpers';

type S = ReturnType<typeof createGame>;
const act = (s: S, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, s.clock.hour * 60);

describe('trade ministry ledger (D-077)', () => {
  it('opens at official 2025 levels and adds up', () => withoutEvents(() => {
    const s = createGame(301);
    expect(s.tradeBook.enabled).toBe(true);
    expect(Object.values(EXPORT_PRODUCTS).filter((p) => p.group === 'goods').reduce((a, p) => a + p.value2025, 0)).toBeCloseTo(GOODS_EXPORTS_2025, -3);
    expect(Object.values(EXPORT_PRODUCTS).filter((p) => p.group === 'services').reduce((a, p) => a + p.value2025, 0)).toBeCloseTo(SERVICES_EXPORTS_2025, -3);
    runUntil(s, 2027, 2, 1, 1);
    const r = tradeRunRate(s), jan = s.tradeBook.history[0];
    expect(r.goodsExports / (GOODS_EXPORTS_2025 * s.tradeBook.scale)).toBeGreaterThan(0.97);
    expect(r.goodsExports / (GOODS_EXPORTS_2025 * s.tradeBook.scale)).toBeLessThan(1.05);
    expect(r.goodsImports / (GOODS_IMPORTS_2025 * s.tradeBook.scale)).toBeGreaterThan(0.95);
    expect(r.goodsImports / (GOODS_IMPORTS_2025 * s.tradeBook.scale)).toBeLessThan(1.05);
    const goods = Object.entries(jan.exports).filter(([id]) => EXPORT_PRODUCTS[id as keyof typeof EXPORT_PRODUCTS].group === 'goods').reduce((a, [, v]) => a + v, 0);
    expect(jan.exports.ee / goods).toBeGreaterThan(0.4); // E&E is ~44% of goods exports
    expect(Object.values(jan.partners).reduce((a, v) => a + v, 0)).toBeCloseTo(goods, -3); // partner split covers all goods
  }));

  it('is a satellite account: without trade policy the core economy is identical', () => withoutEvents(() => {
    const on = createGame(302), off = clone(on);
    off.tradeBook.enabled = false;
    runUntil(on, 2027, 4, 1, 1); runUntil(off, 2027, 4, 1, 1);
    expect(on.reports.map((r) => r.realGdp)).toEqual(off.reports.map((r) => r.realGdp));
    expect(on.government.treasury).toBe(off.government.treasury);
  }));

  it('promotion programmes start tomorrow, cost treasury cash, build over months and lift exports and output', () => withoutEvents(() => {
    const base = createGame(303), pol = clone(base);
    expect(act(pol, { type: 'exportProgramme', programme: 'semiconductor', budgetAnnual: 3e9 }).ok).toBe(true);
    expect(act(pol, { type: 'exportProgramme', programme: 'semiconductor', budgetAnnual: 99e9 }).ok).toBe(false);
    expect(pol.tradeBook.programmes.semiconductor.budget).toBe(0); // queued for tomorrow
    runHeadless(pol, 24 * 3);
    expect(pol.tradeBook.programmes.semiconductor.budget).toBe(3e9);
    runUntil(base, 2027, 8, 1, 1); runUntil(pol, 2027, 8, 1, 1);
    const b = base.tradeBook.history.at(-1)!, p = pol.tradeBook.history.at(-1)!;
    expect(p.exports.ee / b.exports.ee - 1).toBeGreaterThan(0.01);
    expect(p.exports.ee / b.exports.ee - 1).toBeLessThan(0.05);
    expect(pol.reports.at(-1)!.gov.exportSupport).toBeGreaterThan(0.2e9);
    expect(pol.reports.at(-1)!.realGdp).toBeGreaterThan(base.reports.at(-1)!.realGdp);
    expect(pol.reports.every((r) => r.reconciliation!.cashResidualMinor === 0)).toBe(true);
  }));

  it('product deals: the partner names its price, talks take months, and concessions open home markets to imports', () => withoutEvents(() => {
    const s = createGame(304);
    expect(act(s, { type: 'tradeDeal', action: 'propose', partner: 'CN', product: 'lng', ask: 1 }).ok).toBe(false); // commodities excluded
    expect(act(s, { type: 'tradeDeal', action: 'propose', partner: 'CN', product: 'ee', ask: 2 }).ok).toBe(true);
    const d = s.tradeBook.deals[0];
    expect(d.wanted.concession).toBe('industrial');
    expect(act(s, { type: 'tradeDeal', action: 'offer', id: d.id, concession: 'consumer', give: 1 }).ok).toBe(true);
    act(s, { type: 'tradeDeal', action: 'offer', id: d.id, concession: d.wanted.concession, give: d.wanted.give });
    expect(act(s, { type: 'tradeDeal', action: 'sign', id: d.id }).ok).toBe(true);
    expect(d.status).toBe('talks');
    runUntil(s, 2027, 3, 1, 1);
    expect(d.status).toBe('inForce'); // talks take one month (D-097)
    runUntil(s, 2027, 11, 1, 1);
    expect(s.tradeBook.displacement.cons).toBeGreaterThan(0);
    expect(s.tradeBook.policyReal.tech).toBeGreaterThan(0);
    expect(act(s, { type: 'tradeDeal', action: 'withdraw', id: d.id }).ok).toBe(true);
    expect(s.world.partners.CN.relations).toBeLessThan(70);
  }));

  it('Boom mode loosens product deals (D-088): bigger gain, quick talks, six rounds, easier demands', () => withoutEvents(() => {
    const real = createGame(306), boom = createGame(306, 'balanced', 'malaysia', { months: 36, boom: true });
    expect(dealGain(real, 1)).toBe(0.1);
    expect(dealGain(boom, 1)).toBe(0.25);
    expect(dealGain(boom, 2)).toBe(0.5);
    expect(dealTalkDays(boom, 2)).toBe(30);
    expect(dealTalkDays(real, 2)).toBe(30); // D-097: one month in every mode
    expect(dealRounds(real)).toBe(3);
    expect(dealRounds(boom)).toBe(6);
    expect(requiredDepth(boom, 'US', 1)).toBe(0); // D-097: partners require nothing in any mode
    expect(requiredDepth(real, 'US', 1)).toBe(0);
    expect(offerValue('US', 'consumer', 1, boom)).toBe(0.9);
    expect(offerValue('US', 'consumer', 1, real)).toBe(0.6);
    expect(offerValue('US', 'consumer', 1)).toBe(0.6);
    act(boom, { type: 'tradeDeal', action: 'propose', partner: 'US', product: 'machinery', ask: 1 });
    const d = boom.tradeBook.deals[0];
    for (let i = 0; i < 6; i++) expect(act(boom, { type: 'tradeDeal', action: 'offer', id: d.id, concession: 'consumer', give: 1 }).ok).toBe(true);
    expect(act(boom, { type: 'tradeDeal', action: 'offer', id: d.id, concession: 'consumer', give: 1 }).ok).toBe(false);
    expect(act(boom, { type: 'tradeDeal', action: 'sign', id: d.id }).ok).toBe(true);
    expect(d.concludeDay! - boom.scheduler.lastDay).toBe(BOOM.tradeTalkDays[1]);
  }));

  it('talks always conclude, and a partner accepts an offer of nothing (D-097)', () => withoutEvents(() => {
    const s = createGame(305);
    act(s, { type: 'tradeDeal', action: 'propose', partner: 'US', product: 'machinery', ask: 1 });
    const d = s.tradeBook.deals[0];
    expect(act(s, { type: 'tradeDeal', action: 'offer', id: d.id, concession: 'consumer', give: 0 }).ok).toBe(true);
    expect(act(s, { type: 'tradeDeal', action: 'sign', id: d.id }).ok).toBe(true);
    expect(act(s, { type: 'partnerTariff', partner: 'US', tariff: 0.1 }).ok).toBe(true);
    runUntil(s, 2027, 3, 1, 1);
    expect(d.status).toBe('inForce');
    expect(d.give).toBe(0);
  }));

  it('buyer contracts hold a performance bond, add exports, and return the bond on completion', () => withoutEvents(() => {
    const s = createGame(306), d = s.deals.items.find((x) => x.template === 'export:chips')!;
    const cash = s.government.treasury;
    act(s, { type: 'deal', id: d.id, action: 'review' });
    expect(applyCommand(s, { type: 'dealOffer', id: d.id, terms: { months: 12, priceFactor: 1.15, protection: 0 } }, s.clock.hour * 60).ok).toBe(true);
    expect(d.terms.priceFactor).toBe(1.15); // D-097: the buyer accepts any price in range
    expect(act(s, { type: 'deal', id: d.id, action: 'sign' }).ok).toBe(true);
    expect(cash - s.government.treasury).toBe(d.priceMinor);
    runUntil(s, 2027, 3, 1, 1);
    expect(d.status).toBe('active');
    expect(d.delivered).toBeGreaterThan(0);
    expect(s.tradeBook.history.at(-1)!.policyExports).toBeGreaterThan(0);
    runUntil(s, 2028, 1, 15, 1);
    expect(d.status).toBe('completed');
    expect(d.escrowMinor).toBe(0);
  }));

  it('saves round-trip and older saves open the ledger from today', () => withoutEvents(() => {
    const s = createGame(307);
    act(s, { type: 'exportProgramme', programme: 'tourism', budgetAnnual: 1e9 });
    runHeadless(s, 24 * 40);
    const t = deserialize(serialize(s));
    expect(t.tradeBook).toEqual(s.tradeBook);
    const file = JSON.parse(serialize(s));
    delete file.state.tradeBook;
    file.state.schemaVersion = 12;
    const old = deserialize(JSON.stringify(file));
    expect(old.tradeBook.enabled).toBe(true);
    expect(old.tradeBook.history).toEqual([]);
    runHeadless(old, 24 * 40);
    expect(old.tradeBook.history.length).toBe(1);
  }));
});
