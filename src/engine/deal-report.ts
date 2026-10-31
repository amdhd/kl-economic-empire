import { fleetVolume } from './supply-contracts';
import { concessionQuote } from './concessions';
import type { GameState } from '../types/game';
export function guaranteeReserve(s: GameState): number {
  return (s.deals?.items ?? [])
    .filter((d) => d.kind === 'concession' && ['agreed', 'active'].includes(d.status))
    .reduce((sum, d) => {
      const minimum = ((d.assetCostMinor ?? 0) * 0.04) / 365;
      const receipts = minimum * d.terms.priceFactor * Math.min(1.5, s.sectors[d.sector].utilization / 0.85);
      const days =
        d.operationEndDay === undefined
          ? Math.round((d.terms.months * 365) / 12)
          : Math.max(0, d.operationEndDay - s.scheduler.lastDay);
      return sum + Math.min(d.guaranteeMinor, Math.max(0, Math.round((minimum - receipts) * days)));
    }, 0);
}
export function dealExposure(s: GameState) {
  const items = s.deals?.items ?? [];
  const sum = (key: 'escrowMinor' | 'committedMinor' | 'guaranteeMinor' | 'arrearsMinor' | 'valueMinor') =>
    items.reduce((a, d) => a + d[key], 0) / 100;
  return {
    escrow: sum('escrowMinor'),
    commitments: sum('committedMinor'),
    guarantees: sum('guaranteeMinor'),
    arrears: sum('arrearsMinor'),
    holdings: sum('valueMinor'),
    guaranteeReserve: guaranteeReserve(s) / 100,
    unfinished: items
      .filter((d) => ['agreed', 'active'].includes(d.status))
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        payer: d.payer,
        remaining: d.committedMinor / 100,
        escrow: d.escrowMinor / 100,
        guarantee: d.guaranteeMinor / 100,
        arrears: d.arrearsMinor / 100,
      })),
  };
}

/** Public cash schedule at the current offer, before signature; estimates never count as liabilities paid. */
export function quoteDealCommitment(s: GameState, d: GameState['deals']['items'][number]): number {
  if (d.kind === 'concession') {
    const q = concessionQuote(d);
    return q.contribution + q.serviceDaily * Math.round((d.terms.months * 365) / 12);
  }
  if (d.template === 'supply:fuel')
    return Math.round(
      fleetVolume(s, d) *
        3 *
        s.external.oil *
        d.terms.priceFactor *
        Math.round((d.terms.months * 365) / 12) *
        100,
    );
  if (d.kind === 'supply') return 0;
  return d.priceMinor;
}
