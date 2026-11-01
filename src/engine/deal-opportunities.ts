import type { GameState } from '../types/game';
import { enterpriseOffers } from './private-enterprises';
import { rescueOffers } from './rescues';
import { takeoverOffers } from './takeovers';
import { supplyOffers } from './supply-contracts';
import { exportOffers } from './export-contracts';
import { boomOn } from '../data/boom';
import { cohortAngle, dealTheme } from './deal-flavour';

/** Small successive fictional cohorts keep decisions available beyond the opening month. */
/** Drop the oldest offers that were never signed once the room grows large; signed agreements are always kept. */
/** New supply offers, minus any template that already has an agreed or running contract (from index `first` on). */
function freshSupplyOffers(s: GameState, first: number): void {
  supplyOffers(s);
  const active = new Set(
    s.deals.items
      .slice(0, first)
      .filter((d) => ['agreed', 'active'].includes(d.status))
      .map((d) => d.template),
  );
  s.deals.items.splice(
    first,
    s.deals.items.length - first,
    ...s.deals.items.slice(first).filter((d) => !active.has(d.template)),
  );
}

export function pruneClosedDeals(s: GameState, limit = 120): void {
  while (s.deals.items.length > limit) {
    const i = s.deals.items.findIndex((d) => (d.status === 'rejected' || d.status === 'expired') && d.escrowMinor === 0 && d.arrearsMinor === 0);
    if (i < 0) break;
    s.deals.items.splice(i, 1);
  }
}

export function periodicDealOffers(s: GameState, day: number): void {
  pruneClosedDeals(s);
  if (
    !s.deals.enabled ||
    day - (s.deals.lastOfferDay ?? s.deals.startDay) < 90 ||
    s.deals.items.length >= 150
  )
    return;
  s.deals.lastOfferDay = day;
  const episode = Math.floor((day - s.deals.startDay) / 90);
  // Realistic campaigns run seven quarterly cohorts; Boom mode (D-079) keeps new cohorts coming for the whole campaign.
  if (episode < 1 || (episode > 7 && !boomOn(s))) return;
  // Export buyers return every quarter with fresh offers for any contract that is not running (D-077).
  exportOffers(s);
  // Boom mode (D-108): fuel and steel supply offers come back every quarter, not once in year two.
  if (boomOn(s) && episode !== 5) freshSupplyOffers(s, s.deals.items.length);
  const first = s.deals.items.length;
  if (episode % 3 === 1) enterpriseOffers(s);
  else if (episode % 3 === 2) {
    if (episode === 5) {
      freshSupplyOffers(s, first);
      return;
    }
    rescueOffers(s);
  } else takeoverOffers(s);
  for (const [index, d] of s.deals.items.slice(first).entries()) {
    // D-116: counterparties are already drawn from the campaign seed; mark the cohort and add its campaign angle.
    d.template = `${d.kind}:cohort-${episode}-${index}`;
    d.note = `${dealTheme(s).label} campaign: ${cohortAngle(s, episode, index)}. ${d.note}`;
  }
}
