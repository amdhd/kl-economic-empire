import type { GameState } from '../types/game';
import type { Deal } from '../types/deals';
import { addDeal, dealLog, DEAL_ROUNDS } from './deals';
import { signEnterprise, markValue } from './private-enterprises';
import { rand } from './rng';
import { toMinor } from './util';
import { flavourScale, kindRound, takeoverTarget } from './deal-flavour';

export function takeoverOffers(s: GameState): void {
  if (!s.deals.enabled) return;
  // D-113: target and size come from the campaign seed (every balance-sheet figure scales together).
  const round = kindRound(s, 'takeover'), t = takeoverTarget(s, round), k = flavourScale(s, `takeover:${round}`, 0.25);
  const d = addDeal(s, 'takeover:nusa', 'takeover', `${t.name}: controlling acquisition`, 'strategic', 113.827e6 * k, 'ind');
  d.counterparty = `${t.name} shareholders (fictional)`;
  d.assetCostMinor = toMinor(140e6 * k);
  d.terms.stake = 0.7;
  d.terms.priceFactor = 1.15;
  d.terms.months = 6;
  d.rivalPriceFactor = 1.0 + rand(s.deals.rng) * 0.06; // looser sellers (D-086): was 1.08–1.25
  d.rivalBidMinor = Math.round((d.assetCostMinor ?? 0) * d.terms.stake * d.rivalPriceFactor);
  d.enterprise = {
    cashMinor: toMinor(20e6 * k),
    capitalMinor: toMinor(200e6 * k),
    debtMinor: toMinor(80e6 * k),
    payablesMinor: 0,
    publicShare: 0,
    privateShare: 1,
    publicLoanMinor: 0,
    revenueAnnualMinor: toMinor(480e6 * k),
    costAnnualMinor: toMinor(420e6 * k),
    pendingCapexMinor: 0,
    openedDay: -1,
    nextRoundDay: -1,
    roundDone: true,
    quality: 0.5 + rand(s.deals.rng),
    unpaidDays: 0,
    buyerCashMinor: toMinor(250e6 * k),
    sellerCashMinor: 0,
  };
  d.note =
    `${t.name} is ${t.what}. Fictional and simulated. ` +
    'A competing private bidder is interested. Buying shares transfers ownership, not cash into the company. Control premiums and integration can destroy value.';
}
export function offerTakeover(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || d.rounds >= DEAL_ROUNDS || s.scheduler.lastDay >= d.deadline)
    return 'Bidding is closed.';
  const t = { ...d.terms, ...terms };
  if (!(
    t.stake >= 0.51 &&
    t.stake <= 1 &&
    t.priceFactor >= 0.9 &&
    t.priceFactor <= 1.5 &&
    Number.isInteger(t.months) &&
    t.months >= 3 &&
    t.months <= 12
  ))
    return 'Control needs 51–100% ownership, a price of 0.90–1.50× market value and 3–12 integration months.';
  d.terms = t;
  d.rounds++;
  d.version++;
  // D-097: shareholders accept any bid in the allowed range, even below the rival's.
  dealLog(s, d, 'Shareholders accept this bid in principle. Closing funds and controlling ownership still need validation.');
  d.priceMinor = Math.round((d.assetCostMinor ?? 0) * d.terms.stake * d.terms.priceFactor * 1.01);
  d.rivalBidMinor = Math.round((d.assetCostMinor ?? 0) * d.terms.stake * (d.rivalPriceFactor ?? 1.1));
  return null;
}
export function signTakeover(s: GameState, d: Deal): string | null {
  if (d.enterprise!.publicShare > 0)
    return 'The public already owns this target; public-to-public acquisitions are not supported.';
  return signEnterprise(s, d);
}
export function closeTakeover(s: GameState, d: Deal, day: number): void {
  const e = d.enterprise!,
    cost = d.escrowMinor,
    price = Math.round(cost / 1.01);
  d.escrowMinor = 0;
  d.paidMinor = cost;
  d.investedMinor = cost;
  d.committedMinor = 0;
  e.sellerCashMinor += price;
  e.publicShare = d.terms.stake;
  e.privateShare = 1 - e.publicShare;
  e.openedDay = day;
  d.integrationEndDay = day + Math.round((d.terms.months * 365) / 12);
  d.status = 'active';
  markValue(d);
  dealLog(
    s,
    d,
    'Control transferred once. Sellers received cash; company cash is unchanged. Integration benefits are pending and the premium is an immediate valuation cost.',
  );
}
export function takeoverReview(s: GameState, d: Deal, day: number): void {
  if (d.kind !== 'takeover' || d.status !== 'active' || d.integrationDone) return;
  const e = d.enterprise!;
  d.progress = Math.min(1, (day - e.openedDay) / Math.max(1, (d.integrationEndDay ?? day + 1) - e.openedDay));
  if (day < (d.integrationEndDay ?? Infinity)) return;
  d.integrationDone = true;
  if (e.quality >= 0.75) {
    e.costAnnualMinor = Math.round(e.costAnnualMinor * 0.94);
    e.revenueAnnualMinor = Math.round(e.revenueAnnualMinor * 1.03);
    dealLog(
      s,
      d,
      'Integration delivered: company costs −6%, sales +3%. These are sampled enterprise cash flows, not economy-wide productivity boosts.',
    );
  } else {
    e.costAnnualMinor = Math.round(e.costAnnualMinor * 1.08);
    e.revenueAnnualMinor = Math.round(e.revenueAnnualMinor * 0.95);
    e.capitalMinor = Math.round(e.capitalMinor * 0.9);
    dealLog(
      s,
      d,
      'Integration failed: costs +8%, sales −5%, capital impaired 10%. Management changes did not guarantee synergies.',
    );
  }
  markValue(d);
}
