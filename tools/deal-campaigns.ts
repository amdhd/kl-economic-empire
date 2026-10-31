// Test/dev only. Not imported by the player application.
import { applyCommand, createGame, runHeadless, type Command } from '../src/engine/game';
import { validateDeals } from '../src/engine/deals';
import { findNonFinite } from '../src/persistence/save';
import { publicNetWorth } from '../src/engine/indicators';
import { dealExposure } from '../src/engine/deal-report';
export const DEAL_STRATEGIES = [
  'no_deals',
  'selective',
  'accept_all',
  'aggressive_incentives',
  'rescues',
  'takeovers',
] as const;
export type DealStrategy = (typeof DEAL_STRATEGIES)[number];
export function playDeals(seed: number, strategy: DealStrategy) {
  const s = createGame(seed);
  let lastDay = -1;
  const act = (cmd: Command) => applyCommand(s, cmd, s.clock.hour * 60);
  runHeadless(s, 30_000, () => {
    if (lastDay === s.scheduler.lastDay) return;
    lastDay = s.scheduler.lastDay;
    if (strategy === 'no_deals') return;
    for (const d of s.deals.items) {
      const select =
        strategy === 'accept_all' ||
        strategy === 'aggressive_incentives' ||
        (strategy === 'rescues' && d.kind === 'rescue') ||
        (strategy === 'takeovers' && d.kind === 'takeover') ||
        (strategy === 'selective' &&
          (d.kind === 'startup' ||
            d.template === 'rescue:clinics' ||
            (d.kind === 'investment' && d.terms.incentive <= 0.08)));
      if (d.status === 'opportunity' && select) act({ type: 'deal', id: d.id, action: 'review' });
      if (d.status === 'negotiating' && select) {
        if (d.kind === 'takeover' && d.rounds === 0)
          act({ type: 'dealOffer', id: d.id, terms: { priceFactor: 1.3 } });
        if (strategy === 'aggressive_incentives' && d.kind === 'investment' && d.rounds === 0)
          act({ type: 'dealOffer', id: d.id, terms: { incentive: 0.3, localShare: 0.7, jobsShare: 1.2 } });
        act({ type: 'deal', id: d.id, action: 'sign' });
      }
      if (
        d.kind === 'startup' &&
        d.status === 'active' &&
        d.enterprise &&
        !d.enterprise.roundDone &&
        s.scheduler.lastDay >= d.enterprise.nextRoundDay
      )
        act({ type: 'deal', id: d.id, action: d.enterprise.quality >= 0.8 ? 'followOn' : 'dilute' });
    }
  });
  validateDeals(s);
  const bad = findNonFinite(s);
  if (bad) throw new Error(`Non-finite campaign ${bad}`);
  if (
    s.reports.some(
      (r) => r.reconciliation?.cashResidualMinor !== 0 || r.reconciliation.debtResidualMinor !== 0,
    )
  )
    throw new Error('Fiscal reconciliation failed');
  return {
    state: s,
    row: {
      seed,
      strategy,
      score: s.indicators.score.total,
      wealth: publicNetWorth(s),
      output: s.reports.reduce((a, r) => a + r.realGdp, 0),
      income: s.reports.reduce((a, r) => a + r.realDisposablePerCapita, 0) / s.reports.length,
      ...dealExposure(s),
    },
  };
}
