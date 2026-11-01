import { describe, it, expect } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { publicNetWorth } from '../src/engine/indicators';
import { dailyDeals, addDeal } from '../src/engine/deals';
import { serialize, deserialize } from '../src/persistence/save';
import { clone } from './helpers';
const act = (s: ReturnType<typeof createGame>, id: number, action: 'review' | 'sign' | 'cancel' | 'reject') =>
  applyCommand(s, { type: 'deal', id, action }, s.clock.hour * 60);
describe('deal foundations', () => {
  it('reserves cash without creating wealth, releases on cancellation and cannot overspend', () => {
    const s = createGame(1701),
      d = s.deals.items[0],
      cash = s.government.treasury,
      wealth = publicNetWorth(s);
    expect(act(s, d.id, 'review').ok).toBe(true);
    expect(act(s, d.id, 'sign').ok).toBe(true);
    expect(s.government.treasury).toBe(cash - d.priceMinor);
    expect(publicNetWorth(s)).toBeCloseTo(wealth, 0);
    expect(act(s, d.id, 'sign').ok).toBe(false);
    expect(act(s, d.id, 'cancel').ok).toBe(true);
    expect(s.government.treasury).toBe(cash);
    const huge = addDeal(s, 'huge', 'diligence', 'Unaffordable', 'treasury', 1e13);
    act(s, huge.id, 'review');
    expect(act(s, huge.id, 'sign').ok).toBe(false);
    expect(huge.escrowMinor).toBe(0);
  });
  it('prevents competing signatures from double reserving the same cash and expires offers', () => {
    const s = createGame(1704);
    s.government.treasury = 100_00;
    const a = addDeal(s, 'a', 'diligence', 'First', 'treasury', 60),
      b = addDeal(s, 'b', 'diligence', 'Second', 'treasury', 60);
    act(s, a.id, 'review');
    act(s, b.id, 'review');
    expect(act(s, a.id, 'sign').ok).toBe(true);
    expect(act(s, b.id, 'sign').ok).toBe(false);
    s.scheduler.lastDay = b.deadline;
    expect(act(s, b.id, 'sign').ok).toBe(false);
  });
  it('settles once and resumes identically from a signed save', () => {
    const s = createGame(1702),
      d = s.deals.items[0];
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    const t = deserialize(serialize(s));
    runHeadless(s, 24 * 3);
    runHeadless(t, 24 * 3);
    expect(t).toEqual(s);
    const paid = d.paidMinor,
      cash = s.government.treasury;
    const purchases = Object.fromEntries(Object.keys(s.sectors).map((k) => [k, 0])) as Record<
      keyof typeof s.sectors,
      number
    >;
    dailyDeals(s, d.lastDay, purchases);
    expect(d.paidMinor).toBe(paid);
    expect(s.government.treasury).toBe(cash);
    expect(d.status).toBe('completed');
  });
  it('migrates old saves with empty disabled deals and preserves clocks, RNG and cash', () => {
    const s = createGame(1703);
    runHeadless(s, 24 * 4);
    const file = JSON.parse(serialize(s));
    file.state.schemaVersion = 9;
    delete file.state.deals;
    const t = deserialize(JSON.stringify(file));
    expect(t.deals.enabled).toBe(false);
    expect(t.deals.items).toEqual([]);
    expect(t.rng).toEqual(s.rng);
    expect(t.government.treasury).toBe(s.government.treasury);
    const bad = clone(t);
    bad.deals.items.push({ ...s.deals.items[0], escrowMinor: -1 });
    expect(() => deserialize(serialize(bad))).toThrow();
  });
});

describe('negotiated FDI', () => {
  it('counteroffers are persisted and signing funds only one linked FDI project', () => {
    const s = createGame(1710),
      d = s.deals.items.find((d) => d.kind === 'investment')!;
    act(s, d.id, 'review');
    const ask = d.terms.incentive;
    expect(
      applyCommand(
        s,
        { type: 'dealOffer', id: d.id, terms: { incentive: 0, localShare: 0.6 } },
        s.clock.hour * 60,
      ).ok,
    ).toBe(true);
    expect(d.terms.incentive).toBeGreaterThan(ask);
    expect(d.rounds).toBe(1);
    const t = deserialize(serialize(s));
    expect(t.deals.items.find((x) => x.id === d.id)?.terms).toEqual(d.terms);
    expect(act(s, d.id, 'sign').ok).toBe(true);
    expect(s.fdi.pledges.filter((p) => p.id === d.pledgeId)).toHaveLength(1);
    expect(act(s, d.id, 'sign').ok).toBe(false);
    runHeadless(s, 24 * 10);
    expect(d.paidMinor).toBe(0);
    expect(d.escrowMinor).toBe(d.priceMinor);
    expect(s.fdi.pledges[0].spent).toBeGreaterThan(0);
  });
  it('releases grants only at verified milestones and records collectible deadline claims', () => {
    const s = createGame(1711),
      d = s.deals.items.find((d) => d.kind === 'investment')!;
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    const p = s.fdi.pledges[0];
    p.spent = p.amount * 0.26;
    runHeadless(s, 24 * 3);
    expect(d.paidMinor).toBe(Math.round(d.priceMinor / 4));
    const total = d.paidMinor + d.escrowMinor;
    expect(total).toBe(d.priceMinor);
    p.startDay = s.scheduler.lastDay - 1000;
    runHeadless(s, 24 * 2);
    expect(d.status).toBe('failed');
    expect(d.escrowMinor).toBe(0);
    expect(d.claimMinor).toBeGreaterThan(0);
  });
});

describe('private concessions', () => {
  it('excludes public duplicate funding, builds from real private/public capital and calls capped guarantees', () => {
    const s = createGame(1720),
      d = s.deals.items.find((d) => d.kind === 'concession')!;
    act(s, d.id, 'review');
    expect(act(s, d.id, 'sign').ok).toBe(true);
    expect(applyCommand(s, { type: 'startProject', templateId: 'fibre' }, s.clock.hour * 60).ok).toBe(false);
    const assets = s.government.publicAssets,
      p = s.government.projects.find((p) => p.id === d.projectId)!;
    runHeadless(s, 24 * 10);
    expect(p.work).toBeGreaterThan(0);
    expect(d.privateCashMinor).toBeLessThan((d.assetCostMinor ?? 0) * 0.8);
    expect(s.government.publicAssets).toBeGreaterThan(0);
    expect(s.government.publicAssets).toBeLessThan(assets + 1e10); // no full private-asset booking
    expect(s.government.projects.filter((p) => p.templateId === 'fibre')).toHaveLength(1);
  });
  it('higher user charges reduce quoted public service payments and termination retains unpaid claims', () => {
    const s = createGame(1721),
      d = s.deals.items.find((d) => d.kind === 'concession')!;
    act(s, d.id, 'review');
    applyCommand(s, { type: 'dealOffer', id: d.id, terms: { priceFactor: 1.5 } }, s.clock.hour * 60);
    expect(d.rounds).toBe(1);
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 3);
    const before = d.arrearsMinor;
    expect(act(s, d.id, 'cancel').ok).toBe(true);
    expect(d.arrearsMinor).toBeGreaterThan(before);
    expect(d.status).toBe('failed');
    expect(d.escrowMinor).toBe(0);
  });
});

describe('supply contracts', () => {
  it('locks a price, replaces fleet purchasing costs and returns collateral after expiry', () => {
    const s = createGame(1730),
      d = s.deals.items.find((d) => d.template === 'supply:fuel')!;
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 4);
    expect(d.status).toBe('active');
    expect(d.delivered).toBeGreaterThan(0);
    expect(d.escrowMinor).toBe(d.priceMinor);
    const t = deserialize(serialize(s));
    expect(t.deals).toEqual(s.deals);
    d.operationEndDay = s.scheduler.lastDay;
    runHeadless(s, 24 * 2);
    expect(d.status).toBe('completed');
    expect(d.escrowMinor).toBe(0);
  });
  it('prices indexation and charges a bounded exit fee without short-selling or leverage', () => {
    const s = createGame(1731),
      d = s.deals.items.find((d) => d.template === 'supply:steel')!;
    act(s, d.id, 'review');
    expect(
      applyCommand(
        s,
        { type: 'dealOffer', id: d.id, terms: { months: 24, priceFactor: 0.95, protection: 0 } },
        s.clock.hour * 60,
      ).ok,
    ).toBe(true);
    expect(d.terms.priceFactor).toBeGreaterThan(1);
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 3);
    const escrow = d.escrowMinor;
    expect(act(s, d.id, 'cancel').ok).toBe(true);
    expect(d.paidMinor).toBeLessThanOrEqual(escrow * 0.2);
    expect(d.escrowMinor).toBe(0);
  });
});

describe('startup rounds', () => {
  it('exchanges cash for ownership, accounts for fees and includes holdings in fund NAV', () => {
    const s = createGame(1740),
      d = s.deals.items.find((d) => d.kind === 'startup')!,
      wealth = publicNetWorth(s);
    act(s, d.id, 'review');
    expect(act(s, d.id, 'sign').ok).toBe(true);
    expect(publicNetWorth(s)).toBeCloseTo(wealth, 0);
    runHeadless(s, 24 * 3);
    expect(d.enterprise!.publicShare + d.enterprise!.privateShare).toBe(1);
    expect(d.valueMinor).toBeGreaterThan(0);
    expect(d.valueMinor).toBeLessThan(d.paidMinor);
    expect(d.escrowMinor).toBe(0);
    expect(s.fund.tx.some((t) => t.type === 'private')).toBe(true);
  });
  it('supports follow-on funding or dilution and cannot pay exits from imaginary buyer money', () => {
    const s = createGame(1741),
      d = s.deals.items.find((d) => d.kind === 'startup')!;
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 3);
    const t = clone(s),
      other = t.deals.items.find((x) => x.id === d.id)!;
    d.enterprise!.nextRoundDay = s.scheduler.lastDay;
    other.enterprise!.nextRoundDay = t.scheduler.lastDay;
    const own = d.enterprise!.publicShare;
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'followOn' }, s.clock.hour * 60).ok).toBe(true);
    expect(d.enterprise!.publicShare).toBeCloseTo(own, 12);
    expect(applyCommand(t, { type: 'deal', id: d.id, action: 'dilute' }, t.clock.hour * 60).ok).toBe(true);
    expect(other.enterprise!.publicShare).toBeLessThan(own);
    expect(applyCommand(t, { type: 'deal', id: d.id, action: 'dilute' }, t.clock.hour * 60).ok).toBe(false);
    d.enterprise!.openedDay = s.scheduler.lastDay - 200;
    d.enterprise!.buyerCashMinor = 0;
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'exit' }, s.clock.hour * 60).ok).toBe(false);
  });
});

describe('conditional rescues', () => {
  it('matches a funded loan with enterprise debt, releases stages and collects actual repayments', () => {
    const s = createGame(1750),
      d = s.deals.items.find((d) => d.template === 'rescue:clinics')!;
    act(s, d.id, 'review');
    expect(act(s, d.id, 'sign').ok).toBe(true);
    runHeadless(s, 24 * 4);
    expect(d.enterprise!.publicLoanMinor).toBeGreaterThan(0);
    expect(d.escrowMinor).toBeGreaterThan(0);
    expect(d.enterprise!.publicShare).toBe(0);
    runHeadless(s, 24 * 65);
    expect(d.receivedMinor).toBeGreaterThan(0);
    expect(d.enterprise!.publicLoanMinor).toBeLessThan(d.priceMinor / 1.01 / 2);
  });
  it('rejects loans to insolvent firms and bounds liquidation by actual estate assets', () => {
    const s = createGame(1751),
      d = s.deals.items.find((d) => d.template === 'rescue:textiles')!;
    d.enterprise!.revenueAnnualMinor = 225e6 * 100;
    act(s, d.id, 'review');
    applyCommand(s, { type: 'dealOffer', id: d.id, terms: { protection: 1 } }, s.clock.hour * 60);
    expect(act(s, d.id, 'sign').ok).toBe(false);
    applyCommand(s, { type: 'dealOffer', id: d.id, terms: { protection: 0 } }, s.clock.hour * 60);
    expect(act(s, d.id, 'sign').ok).toBe(true);
    runHeadless(s, 24 * 3);
    const estate = d.enterprise!.cashMinor + d.enterprise!.capitalMinor;
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'liquidate' }, s.clock.hour * 60).ok).toBe(true);
    expect(d.receivedMinor ?? 0).toBeLessThanOrEqual(estate);
    expect(d.valueMinor).toBe(0);
  });
});

describe('startup liquidation', () => {
  it('returns proceeds to the SWF that owns the stake, not Khazanah, and realises the loss once', () => {
    const s = createGame(1753),
      d = s.deals.items.find((d) => d.kind === 'startup')!;
    expect(d.payer).toBe('fund');
    expect(act(s, d.id, 'review').ok).toBe(true);
    expect(act(s, d.id, 'sign').ok).toBe(true);
    runHeadless(s, 24 * 30);
    const cash = s.fund.myrCash, khazanah = s.soe.khazanah.cash, realized = s.fund.realizedMYR, invested = d.investedMinor!;
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'liquidate' }, s.clock.hour * 60).ok).toBe(true);
    expect(d.receivedMinor).toBeGreaterThan(0);
    expect(s.fund.myrCash - cash).toBe(d.receivedMinor);
    expect(s.soe.khazanah.cash).toBe(khazanah);
    expect(s.fund.realizedMYR - realized).toBe(d.receivedMinor! - invested);
    applyCommand(s, { type: 'deal', id: d.id, action: 'liquidate' }, s.clock.hour * 60);
    expect(s.fund.realizedMYR - realized).toBe(d.receivedMinor! - invested);
  });
});

describe('public ownership accounting', () => {
  it('does not create public wealth by distributing already-earned equity profits', () => {
    const s = createGame(1752),
      d = s.deals.items.find((d) => d.template === 'rescue:textiles')!;
    d.enterprise!.revenueAnnualMinor = 225e6 * 100;
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 200);
    expect(d.status).toBe('active');
    const before = publicNetWorth(s);
    expect(applyCommand(s, { type: 'deal', id: d.id, action: 'dividend' }, s.clock.hour * 60).ok).toBe(true);
    expect(publicNetWorth(s)).toBeCloseTo(before, 1);
  });
});

describe('controlling takeovers', () => {
  it('pays sellers rather than injecting company cash, respects rival bids and applies integration once', () => {
    const s = createGame(1760),
      d = s.deals.items.find((d) => d.kind === 'takeover')!;
    act(s, d.id, 'review');
    expect(
      applyCommand(
        s,
        { type: 'dealOffer', id: d.id, terms: { priceFactor: 1.5, months: 3 } },
        s.clock.hour * 60,
      ).ok,
    ).toBe(true);
    const companyCash = d.enterprise!.cashMinor;
    expect(act(s, d.id, 'sign').ok).toBe(true);
    runHeadless(s, 24 * 3);
    expect(d.enterprise!.sellerCashMinor).toBeGreaterThan(0);
    expect(d.enterprise!.publicShare).toBe(0.7);
    expect(d.enterprise!.cashMinor).toBeLessThan(companyCash + 5e6 * 100);
    expect(d.integrationDone).not.toBe(true);
    runHeadless(s, 24 * 100);
    expect(d.integrationDone).toBe(true);
    const revenues = d.enterprise!.revenueAnnualMinor;
    runHeadless(s, 24 * 3);
    expect(d.enterprise!.revenueAnnualMinor).toBe(revenues);
  });
  it('persists competing valuations and never resets a completed ownership transfer', () => {
    const s = createGame(1761),
      d = s.deals.items.find((d) => d.kind === 'takeover')!;
    act(s, d.id, 'review');
    applyCommand(s, { type: 'dealOffer', id: d.id, terms: { priceFactor: 1.05 } }, s.clock.hour * 60);
    expect(d.terms.priceFactor).toBeGreaterThan(d.rivalPriceFactor!);
    const t = deserialize(serialize(s));
    expect(t.deals.items.find((x) => x.id === d.id)?.rivalBidMinor).toBe(d.rivalBidMinor);
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 3);
    expect(act(s, d.id, 'sign').ok).toBe(false);
    expect(d.enterprise!.publicShare + d.enterprise!.privateShare).toBe(1);
  });
});

describe('integrated deal safeguards', () => {
  it('rejects non-finite terms before mutation and corrupt ownership or money in saves', () => {
    const s = createGame(1770),
      d = s.deals.items.find((d) => d.kind === 'startup')!;
    act(s, d.id, 'review');
    const before = clone(d);
    expect(
      applyCommand(s, { type: 'dealOffer', id: d.id, terms: { stake: NaN } }, s.clock.hour * 60).ok,
    ).toBe(false);
    expect(d).toEqual(before);
    const f = JSON.parse(serialize(s));
    f.state.deals.items.find((x: { id: number }) => x.id === d.id).enterprise.privateShare = 0.9;
    expect(() => deserialize(JSON.stringify(f))).toThrow(/ownership/);
  });
  it('keeps a disabled migrated campaign economically identical and permits prospective opt-in', () => {
    const s = createGame(1771);
    s.deals.enabled = false;
    const file = JSON.parse(serialize(s));
    file.state.schemaVersion = 9;
    delete file.state.deals;
    const t = deserialize(JSON.stringify(file));
    runHeadless(s, 24 * 60);
    runHeadless(t, 24 * 60);
    expect(t.reports).toEqual(s.reports);
    expect(t.rng).toEqual(s.rng);
    expect(t.world.rng).toEqual(s.world.rng);
    expect(applyCommand(t, { type: 'enableDeals' }, t.clock.hour * 60).ok).toBe(true);
    expect(t.deals.startDay).toBe(t.scheduler.lastDay);
    expect(t.fdi.pledges.filter((p) => p.status === 'building')).toHaveLength(0);
  });
  it('routes old project cancellation through the concession contract and retains liability', () => {
    const s = createGame(1772),
      d = s.deals.items.find((d) => d.kind === 'concession')!;
    act(s, d.id, 'review');
    act(s, d.id, 'sign');
    runHeadless(s, 24 * 4);
    expect(applyCommand(s, { type: 'cancelProject', id: d.projectId! }, s.clock.hour * 60).ok).toBe(true);
    expect(d.status).toBe('failed');
    expect(d.escrowMinor).toBe(0);
    expect(d.arrearsMinor).toBeGreaterThan(0);
  });
  it('deduplicates deal warnings and includes unfinished obligations in term reporting', async () => {
    const { economicAlerts, DEFAULT_ALERTS, alertTransitions } = await import('../src/engine/alerts');
    const { campaignReport } = await import('../src/engine/campaign-report');
    const s = createGame(1773),
      d = s.deals.items[0];
    s.scheduler.lastDay = d.deadline - 1;
    const warnings = economicAlerts(s, DEFAULT_ALERTS);
    expect(warnings.some((a) => a.rule === 'deals')).toBe(true);
    const memory = alertTransitions({}, warnings).memory;
    expect(alertTransitions(memory, economicAlerts(s, DEFAULT_ALERTS, memory)).fresh).toHaveLength(0);
    const concession = s.deals.items.find((d) => d.kind === 'concession')!;
    concession.deadline = s.scheduler.lastDay + 30;
    act(s, concession.id, 'review');
    act(s, concession.id, 'sign');
    expect(campaignReport(s).deals.unfinished.some((x) => x.id === concession.id)).toBe(true);
    expect(campaignReport(s).deals.commitments).toBeGreaterThan(concession.priceMinor / 100);
  });
});

describe('deal alerts open the tab that shows the deal', () => {
  it('failed deals go to Outcomes, deadlines to their list, never an empty view', async () => {
    const { alertDealTab } = await import('../src/engine/alerts');
    const s = createGame(1775), d = s.deals.items[0];
    expect(alertDealTab(s, `deal:${d.id}:expiry`)).toBe('opportunities');
    d.status = 'failed';
    expect(alertDealTab(s, `deal:${d.id}:failure`)).toBe('outcomes');
    expect(alertDealTab(s, `deal:${d.id}:arrears`)).toBe('outcomes'); // terminated but the claim is still recorded
    d.status = 'active';
    expect(alertDealTab(s, `deal:${d.id}:arrears`)).toBe('exposure');
    expect(alertDealTab(s, `deal:${d.id}:runway`)).toBe('active');
    expect(alertDealTab(s, 'deal:999999:failure')).toBe('outcomes');
  });
});

describe('later campaign opportunities', () => {
  it('offers distinct fictional cohorts after the opening offers lapse without consuming main RNG', () => {
    const s = createGame(1774),
      base = clone(s);
    base.deals.enabled = false;
    runHeadless(s, 24 * 100);
    runHeadless(base, 24 * 100);
    const fresh = s.deals.items.filter((d) => d.offeredDay > s.deals.startDay && d.kind === 'startup');
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh[0].template).not.toBe('startup:awan');
    expect(s.rng).toEqual(base.rng);
    expect(s.reports).toEqual(base.reports);
  });
});

it('pays overdue suppliers when rescue cash arrives and rejects underpriced solvent equity grabs', () => {
  const s = createGame(1775),
    d = s.deals.items.find((d) => d.template === 'rescue:clinics')!;
  d.enterprise!.payablesMinor = 1e6 * 100;
  act(s, d.id, 'review');
  applyCommand(s, { type: 'dealOffer', id: d.id, terms: { protection: 0, stake: 1 } }, s.clock.hour * 60);
  expect(act(s, d.id, 'sign').ok).toBe(false);
  applyCommand(s, { type: 'dealOffer', id: d.id, terms: { protection: 1 } }, s.clock.hour * 60);
  expect(act(s, d.id, 'sign').ok).toBe(true);
  runHeadless(s, 24 * 4);
  expect(d.enterprise!.payablesMinor).toBe(0);
  expect(d.enterprise!.pendingCapexMinor).toBeGreaterThan(0);
});

it('supports two funded term choices for every requested deal category', () => {
  for (const kind of ['investment', 'concession', 'supply', 'startup', 'rescue', 'takeover'] as const) {
    for (const second of [false, true]) {
      const s = createGame(1776),
        d = s.deals.items.find((d) => d.kind === kind)!;
      act(s, d.id, 'review');
      const terms =
        kind === 'investment'
          ? { incentive: second ? 0.2 : 0.1 }
          : kind === 'concession'
            ? { priceFactor: second ? 1.4 : 0.8 }
            : kind === 'supply'
              ? { protection: second ? 1 : 0 }
              : kind === 'startup'
                ? { stake: second ? 0.3 : 0.1 }
                : kind === 'rescue'
                  ? { months: second ? 24 : 6 }
                  : { priceFactor: 1.4, stake: second ? 0.9 : 0.6 };
      expect(applyCommand(s, { type: 'dealOffer', id: d.id, terms }, s.clock.hour * 60).ok).toBe(true);
      expect(act(s, d.id, 'sign').ok).toBe(true);
    }
  }
});

it('never creates negative fleet expenditure after an administration budget cut', async () => {
  const { fleetAdjustment } = await import('../src/engine/supply-contracts');
  const s = createGame(1777),
    d = s.deals.items.find((d) => d.template === 'supply:fuel')!;
  act(s, d.id, 'review');
  act(s, d.id, 'sign');
  runHeadless(s, 24 * 3);
  s.external.oil = 2;
  s.government.policies.budget.admin = 0;
  expect(fleetAdjustment(s, s.scheduler.lastDay)).toBe(0);
  const old = d.delivered;
  runHeadless(s, 24 * 2);
  expect(d.delivered).toBe(old);
  expect(s.government.mtd.opex).toBeGreaterThanOrEqual(0);
});
