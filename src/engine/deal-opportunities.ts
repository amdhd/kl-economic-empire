import type { GameState } from '../types/game';
import { enterpriseOffers } from './private-enterprises';
import { rescueOffers } from './rescues';
import { takeoverOffers } from './takeovers';
import { supplyOffers } from './supply-contracts';

/** Small successive fictional cohorts keep decisions available beyond the opening month. */
export function periodicDealOffers(s: GameState, day: number): void {
  if (
    !s.deals.enabled ||
    day - (s.deals.lastOfferDay ?? s.deals.startDay) < 90 ||
    s.deals.items.length >= 150
  )
    return;
  s.deals.lastOfferDay = day;
  const episode = Math.floor((day - s.deals.startDay) / 90);
  if (episode < 1 || episode > 7) return;
  const first = s.deals.items.length;
  if (episode % 3 === 1) enterpriseOffers(s);
  else if (episode % 3 === 2) {
    if (episode === 5) {
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
      return;
    }
    rescueOffers(s);
  } else takeoverOffers(s);
  const names = [
    'Rimba Systems',
    'Suria Ventures',
    'Meranti Services',
    'Langit Industries',
    'Pesisir Partners',
    'Bayu Operations',
    'Cendana Group',
  ];
  for (const [index, d] of s.deals.items.slice(first).entries()) {
    d.template = `${d.kind}:cohort-${episode}-${index}`;
    d.name = `${names[episode - 1]} ${index + 1}: ${d.kind} opportunity`;
    d.counterparty = `${names[episode - 1]} ${index + 1} stakeholders (fictional)`;
  }
}
