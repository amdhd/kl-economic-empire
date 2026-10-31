import type { GameState } from '../types/game';
import type { Deal } from '../types/deals';
import { addDeal, dealLog, releaseDeal, reserveDeal, spendDeal } from './deals';
import { toMinor } from './util';
const active = (s: GameState, d: Deal, day = s.scheduler.lastDay) =>
  d.kind === 'supply' &&
  ['agreed', 'active'].includes(d.status) &&
  day >= d.nextDay &&
  day < (d.operationEndDay ?? Infinity) &&
  (d.template === 'supply:fuel' ? 3 * s.external.oil : s.world.prices.steel) <=
    2.5 * (d.lockedPrice ?? Infinity);
export function supplyOffers(s: GameState): void {
  if (!s.deals.enabled) return;
  for (const industrial of [false, true]) {
    const d = addDeal(
      s,
      industrial ? 'supply:steel' : 'supply:fuel',
      'supply',
      industrial ? 'Participating manufacturers: steel supply' : 'Government fleet fuel contract',
      industrial ? 'strategic' : 'treasury',
      industrial ? 5e6 : 4.5e6,
      industrial ? 'ind' : 'util',
    );
    d.counterparty = industrial ? 'Baja Materials Cooperative (fictional)' : 'Selat Fuel Supply (fictional)';
    d.terms.months = 12;
    d.terms.priceFactor = 1.03;
    d.terms.protection = 0;
    d.volume = industrial ? 0.2 : 50_000;
    d.note = industrial
      ? 'Voluntary industry cohort covers 20% of industrial steel inputs. Khazanah posts collateral; firms pay their own purchases.'
      : 'Up to 50,000 litres/day within the existing fleet purchasing envelope. Collateral is refunded at expiry; it is not a second fuel payment.';
  }
}
export function offerSupply(s: GameState, d: Deal, terms: Partial<Deal['terms']>): string | null {
  if (d.status !== 'negotiating' || d.rounds >= 3 || s.scheduler.lastDay >= d.deadline)
    return 'Negotiation is closed.';
  const t = { ...d.terms, ...terms };
  if (!(
    Number.isInteger(t.months) &&
    t.months >= 3 &&
    t.months <= 24 &&
    t.priceFactor >= 0.95 &&
    t.priceFactor <= 1.2 &&
    t.protection >= 0 &&
    t.protection <= 1
  ))
    return 'Use 3–24 months, a 0.95–1.20 price multiplier and 0–100% indexation.';
  // A long fully fixed contract requires a larger commercial premium; the supplier counters visibly.
  const minimum = 1 + 0.002 * t.months * (1 - t.protection);
  d.terms = { ...t, priceFactor: Math.max(t.priceFactor, Math.ceil(minimum * 1000) / 1000) };
  d.version++;
  d.rounds++;
  dealLog(
    s,
    d,
    t.priceFactor < minimum
      ? 'Supplier countered with a duration premium; review the revised price.'
      : 'Supplier accepts these delivery and indexation terms.',
  );
  return null;
}
export function signSupply(s: GameState, d: Deal): string | null {
  if (
    s.deals.items.some(
      (x) => x.id !== d.id && x.template === d.template && ['agreed', 'active'].includes(x.status),
    )
  )
    return 'This procurement envelope already has an active contract.';
  const err = reserveDeal(s, d, d.priceMinor);
  if (err) return err;
  d.lockedPrice =
    d.template === 'supply:fuel'
      ? 3 * s.external.oil * d.terms.priceFactor
      : s.world.prices.steel * d.terms.priceFactor;
  d.nextDay = s.scheduler.lastDay + 1;
  d.operationEndDay = d.nextDay + Math.round((d.terms.months * 365) / 12);
  d.status = 'agreed';
  d.committedMinor =
    d.template === 'supply:fuel'
      ? toMinor((d.volume ?? 0) * (d.lockedPrice ?? 0) * (d.operationEndDay - d.nextDay))
      : 0;
  d.guaranteeMinor = Math.round(d.priceMinor * 0.2);
  d.privateCashMinor = d.priceMinor * 5;
  dealLog(
    s,
    d,
    'Signed: collateral segregated; delivered volumes replace spot purchases. Unfulfilled volumes revert to spot prices.',
  );
  return null;
}
export function supplyUnitPrice(s: GameState, d: Deal): number {
  const spot = d.template === 'supply:fuel' ? 3 * s.external.oil : s.world.prices.steel;
  return (d.lockedPrice ?? spot) * (1 - d.terms.protection) + spot * d.terms.priceFactor * d.terms.protection;
}
/** Treasury procurement stays within its existing nominal fleet envelope. Return only the replacement-cost delta. */
export function fleetVolume(s: GameState, d: Deal): number {
  const envelope = Math.max(0, Math.min(150_000, (s.government.policies.budget.admin * 12) / 365));
  return Math.min(d.volume ?? 0, envelope / (3 * s.external.oil));
}
export function fleetAdjustment(s: GameState, day: number): number {
  if (!s.deals?.enabled) return 0;
  return s.deals.items
    .filter((d) => d.template === 'supply:fuel' && active(s, d, day))
    .reduce((sum, d) => {
      const spot = 3 * s.external.oil,
        volume = fleetVolume(s, d);
      return sum + volume * (supplyUnitPrice(s, d) - spot);
    }, 0);
}
/** Participating firms buy 20% of steel on contract; the remaining inputs retain spot pricing. */
export function contractedSteel(s: GameState, spot: number): number {
  const d = s.deals?.items.find((d) => d.template === 'supply:steel' && active(s, d));
  if (!d) return spot;
  return spot * (1 - (d.volume ?? 0)) + supplyUnitPrice(s, d) * (d.volume ?? 0);
}
export function cancelSupply(s: GameState, d: Deal): void {
  const penalty = d.status === 'active' ? Math.min(d.escrowMinor, Math.round(d.priceMinor * 0.2)) : 0;
  spendDeal(s, d, penalty);
  releaseDeal(s, d);
  d.committedMinor = 0;
  d.guaranteeMinor = 0;
  d.status = 'completed';
  dealLog(
    s,
    d,
    'Contract exited; termination cost was capped at 20% of collateral. Future purchases revert to spot.',
  );
}
export function dailySupply(s: GameState, d: Deal, day: number, paidFraction = 1): void {
  if (d.kind !== 'supply' || !['agreed', 'active'].includes(d.status) || day < d.nextDay) return;
  if (day >= (d.operationEndDay ?? day)) {
    releaseDeal(s, d);
    d.status = 'completed';
    d.progress = 1;
    d.committedMinor = 0;
    d.guaranteeMinor = 0;
    dealLog(s, d, 'Supply term completed; remaining collateral returned.');
    return;
  }
  d.status = 'active';
  d.progress = (day - d.nextDay) / Math.max(1, (d.operationEndDay ?? day + 1) - d.nextDay);
  const spot = d.template === 'supply:fuel' ? 3 * s.external.oil : s.world.prices.steel;
  if (spot > 2.5 * (d.lockedPrice ?? spot)) {
    // A severe adverse price shock exhausts the fictional supplier; collateral is exposed, not magically safe.
    const loss = Math.round(d.escrowMinor * 0.2);
    spendDeal(s, d, loss);
    releaseDeal(s, d);
    d.status = 'failed';
    d.committedMinor = 0;
    d.guaranteeMinor = 0;
    dealLog(
      s,
      d,
      'Supplier defaulted in an extreme price squeeze. 20% collateral impairment; delivery shortfall reverts to spot.',
    );
    return;
  }
  if (d.template === 'supply:fuel') {
    const quantity = fleetVolume(s, d) * paidFraction,
      cost = toMinor(quantity * supplyUnitPrice(s, d));
    d.delivered = (d.delivered ?? 0) + quantity;
    d.privateCashMinor! += cost;
    d.paidMinor += cost;
    d.committedMinor = Math.max(0, d.committedMinor - cost);
  } else {
    d.delivered = (d.delivered ?? 0) + s.sectors.ind.output * (d.volume ?? 0); // activity-equivalent volume; no new purchases booked here
  }
  d.note = `${Math.round(d.delivered ?? 0).toLocaleString('en-MY')} ${d.template === 'supply:fuel' ? 'litres delivered' : 'industry activity units covered'}. Current contract price ${supplyUnitPrice(s, d).toFixed(3)} vs spot ${spot.toFixed(3)}; no additional subsidy saving is booked.`;
}
