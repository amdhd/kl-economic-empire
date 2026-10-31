import { dealExposure, quoteDealCommitment } from '../../engine/deal-report';
import { supplyUnitPrice } from '../../engine/supply-contracts';
import { buyerMaxPrice, deliveryShare, exportSpot, exportUnitPrice } from '../../engine/export-contracts';
import { concessionQuote } from '../../engine/concessions';
import { useState } from 'react';
import { useGame, useGameState } from '../../store/game-store';
import type { Deal } from '../../types/deals';
import { money } from '../../utils/format';
import { klDayLabel } from '../../engine/time';
import { PanelShell } from './PanelShell';
import { ConfirmDialog } from './ConfirmDialog';
import { Section } from '../ui';
/** Plain-English tag and one-line explanation shown at the top of each deal. */
const DEAL_TAGS: Record<string, { tag: string; plain: string }> = {
  investment: { tag: 'Foreign investment', plain: 'A company builds a plant here. We can sweeten it with a grant.' },
  concession: { tag: 'Private build', plain: 'A company builds and runs it. We pay part now and the rest as yearly fees.' },
  supply: { tag: 'Long-term supply', plain: 'A supplier delivers goods at an agreed price for months. We lock in the price.' },
  startup: { tag: 'Startup stake', plain: 'We invest in a young company and own part of it. High risk, high reward.' },
  rescue: { tag: 'Bailout', plain: 'A struggling company needs help. We lend or buy shares to save it.' },
  diligence: { tag: 'Background check', plain: 'We study a company before deciding whether to deal with it.' },
  takeover: { tag: 'Buy a company', plain: 'We buy a controlling share of a private company.' },
  export: { tag: 'Export sale', plain: 'A foreign buyer agrees to buy our goods every year at a set price. We post a bond and must deliver.' },
};

export function DealsPanel() {
  const g = useGameState();
  const [tab, setTab] = useState('opportunities');
  const [drafts, setDrafts] = useState<Record<number, Partial<Deal['terms']>>>({});
  const [reviewAction, setReviewAction] = useState<
    'sign' | 'cancel' | 'followOn' | 'dilute' | 'exit' | 'liquidate' | 'dividend'
  >('sign');
  const [review, setReview] = useState<Deal | null>(null);
  const exposure = dealExposure(g);
  const command = useGame.getState().command;
  const askAction = (d: Deal, action: typeof reviewAction) => {
    setReviewAction(action);
    setReview(d);
  };
  const items = g.deals.items.filter((d) =>
    tab === 'outcomes'
      ? ['completed', 'failed', 'rejected', 'expired'].includes(d.status)
      : tab === 'active'
        ? ['agreed', 'active'].includes(d.status)
        : tab === 'negotiations'
          ? d.status === 'negotiating'
          : tab === 'exposure' || d.status === 'opportunity',
  );
  return (
    <PanelShell
      title="Deal Room"
      subtitle="Fictional agreements · public money, delivery and downside"
      width={760}
    >
      {!g.deals.enabled && (
        <div>
          <p>
            This save keeps its original rules. New deals can start prospectively without changing signed
            contracts.
          </p>
          <button
            className="btn mt-2"
            disabled={!g.fdi.enabled}
            onClick={() => command({ type: 'enableDeals' })}
          >
            Enable new agreements from today
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Deal Room views">
        {['opportunities', 'negotiations', 'active', 'exposure', 'outcomes'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`btn ${tab === t ? 'btn-primary' : ''}`}
            onClick={() => setTab(t)}
            data-testid={`deals-tab-${t}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'exposure' && (
        <Section title="Public exposure">
          <p className="text-[13px]">
            Escrow {money(g.deals.items.reduce((a, d) => a + d.escrowMinor, 0) / 100)} · remaining commitments{' '}
            {money(g.deals.items.reduce((a, d) => a + d.committedMinor, 0) / 100)} · capped guarantees{' '}
            {money(g.deals.items.reduce((a, d) => a + d.guaranteeMinor, 0) / 100)} · arrears{' '}
            {money(g.deals.items.reduce((a, d) => a + d.arrearsMinor, 0) / 100)}
          </p>
          <p className="mt-2 text-[12px] text-slate-400">
            Escrow is reserved cash, not an expense. Commitments include funded tranches but exclude
            refundable collateral; indexed procurement is estimated at signing prices. Guarantees are
            additional capped exposure.
          </p>
        </Section>
      )}
      {tab === 'exposure' && (
        <p className="text-[12px] text-amber-200">
          Current-utilisation guarantee provision {money(exposure.guaranteeReserve)} is deducted from public
          wealth. Remaining commitments do not assume projects finish before the term ends.
        </p>
      )}
      {!items.length && (
        <p className="text-[13px] text-slate-400">
          No agreements in this view. New FDI opportunities appear through the existing investment pipeline.
        </p>
      )}
      {items.map((d) => (
        <Section key={d.id} title={d.name}>
          <div data-testid={`deal-${d.id}`} className="space-y-2 text-[12.5px]">
            <p className="flex flex-wrap items-center gap-2" data-testid={`deal-tag-${d.id}`}>
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-cyan-200">{DEAL_TAGS[d.kind]?.tag ?? d.kind}</span>
              <span className="text-slate-300">{DEAL_TAGS[d.kind]?.plain}</span>
            </p>
            <p>
              {d.counterparty} · {d.kind} · <b>{d.status}</b> · version {d.version}
            </p>
            <p>
              Funding: {d.payer === 'strategic' ? 'Khazanah strategic mandate' : d.payer} · cash needed{' '}
              {money(d.priceMinor / 100)} · escrow {money(d.escrowMinor / 100)}
            </p>
            {d.kind === 'concession' && (
              <p>
                Private asset. Estimated service payments{' '}
                {money((concessionQuote(d).serviceDaily * 365) / 100)}/year after delivery; guarantee cap{' '}
                {money(concessionQuote(d).guarantee / 100)}; active termination fee up to{' '}
                {money(((d.assetCostMinor ?? 0) * 0.1) / 100)}.
              </p>
            )}
            {d.kind === 'investment' && (
              <p>
                Negotiated grants release at 25/50/75/100% build milestones. Missing delivery by more than 90
                days cancels unpaid support and creates a 25% paid-grant clawback claim, recoverable only from
                counterparty cash.
              </p>
            )}
            {d.kind === 'rescue' && (
              <p>
                Senior loans charge 8% annually with monthly principal payments. Half closes first; the rest
                needs a 90-day liquidity review. Equity may lose value immediately. Creditor and shareholder
                consent are required.
              </p>
            )}
            {d.kind === 'supply' && (
              <p>
                {d.status === 'opportunity' || d.status === 'negotiating'
                  ? 'Indicative signing price'
                  : 'Current contract price'}{' '}
                {(d.status === 'opportunity' || d.status === 'negotiating'
                  ? (d.template === 'supply:fuel' ? 3 * g.external.oil : g.world.prices.steel) *
                    d.terms.priceFactor
                  : supplyUnitPrice(g, d)
                ).toFixed(3)}{' '}
                {d.template === 'supply:fuel' ? 'MYR/litre' : 'steel price index'}. Collateral returns at
                expiry; active exit costs up to 20% of collateral. Extreme supplier distress can cause the
                same loss and restore spot purchasing.
              </p>
            )}
            {d.kind === 'export' && d.product && (
              <p data-testid={`export-terms-${d.id}`}>
                {money(d.volume ?? 0)} a year · {d.status === 'opportunity' || d.status === 'negotiating'
                  ? `price ${(exportSpot(g, d.product) * d.terms.priceFactor).toFixed(3)} (spot ${exportSpot(g, d.product).toFixed(3)}); the buyer pays at most ${buyerMaxPrice(d.terms.months, d.terms.protection).toFixed(3)}× spot for these terms`
                  : `contract price ${exportUnitPrice(g, d).toFixed(3)} vs spot ${exportSpot(g, d.product).toFixed(3)} · delivering ${Math.round(deliveryShare(g, d) * 100)}% · penalties paid ${money((d.penaltyMinor ?? 0) / 100)}`}.
                {' '}Bond {money(d.priceMinor / 100)} returns at the end; leaving early forfeits half of it.
              </p>
            )}
            {d.enterprise && (
              <p>
                Reference annual sales {money(d.enterprise.revenueAnnualMinor / 100)} · costs{' '}
                {money(d.enterprise.costAnnualMinor / 100)}. Realised results scale with sector conditions,
                wages and business maturity.
              </p>
            )}
            <p className="text-slate-400">
              Decision deadline {klDayLabel(d.deadline)} · {d.note}
            </p>
            {['investment', 'concession', 'supply', 'startup', 'rescue', 'takeover', 'export'].includes(d.kind) &&
              d.status === 'negotiating' && (
                <div className="grid grid-cols-2 gap-2">
                  {(d.kind === 'investment'
                    ? ([
                        ['incentive', 'Government grant', 0, 0.3, 0.01, 'Share of their project cost we pay. More grant keeps the investor happy but costs us cash.', '%'],
                        ['localShare', 'Local suppliers', 0.2, 0.8, 0.05, 'Share of spending that goes to Malaysian suppliers. Higher means more local business, but the investor may push back.', '%'],
                        ['jobsShare', 'Worker training', 0.8, 1.2, 0.1, '1.0 is normal. Higher means more local staff get trained, which costs the investor.', ''],
                        ['months', 'Months to build', 6, 36, 1, 'Longer is easier for them, but we wait longer for jobs and output.', ''],
                      ] as const)
                    : d.kind === 'takeover'
                      ? ([
                          ['stake', 'Share of company we buy', 0.51, 1, 0.01, 'Above 51% means we control it.', '%'],
                          ['priceFactor', 'Price vs market value', 1.05, 1.5, 0.01, '1.10 means we pay 10% above market. A higher price makes sellers agree more easily.', ''],
                          ['months', 'Months to take over', 3, 12, 1, 'Time to merge it into our portfolio.', ''],
                        ] as const)
                      : d.kind === 'rescue'
                        ? ([
                            ['protection', 'Type of rescue', 0, 1, 1, 'A loan gets repaid with interest; buying shares gives us ownership but we can lose the money.', ''],
                            ['incentive', 'Debt lenders must forgive', 0, 0.5, 0.1, 'Share of its debt that lenders write off. Saves us money, but lenders may refuse.', '%'],
                            ['stake', 'Share of company we get', 0.1, 1, 0.1, 'Ownership we take in return for the rescue.', '%'],
                            ['months', 'Months to repay', 6, 36, 1, 'Longer repayment is easier on the company.', ''],
                          ] as const)
                        : d.kind === 'startup'
                          ? ([['stake', 'Share of startup we own', 0.1, 0.4, 0.05, 'Bigger share means more profit and control, but founders may refuse.', '%']] as const)
                          : d.kind === 'export'
                            ? ([
                                ['months', 'Contract length (months)', 12, 60, 1, 'How long the buyer keeps buying. Longer fixed contracts make the buyer ask for a discount.', ''],
                                ['priceFactor', 'Price vs today', 0.9, 1.15, 0.01, '1.00 is today\'s market price. Higher earns more, but the buyer may counter.', ''],
                                ['protection', 'Price moves with market', 0, 1, 0.1, '0 means a fixed price. 1 means the price follows the market, up or down.', '%'],
                              ] as const)
                          : d.kind === 'supply'
                            ? ([
                                ['months', 'Contract length (months)', 3, 24, 1, 'How long the supplier must keep delivering.', ''],
                                ['priceFactor', 'Price vs today', 0.95, 1.2, 0.01, '1.00 is today\'s price. Lower is cheaper for us; the supplier may refuse.', ''],
                                ['protection', 'Price moves with market', 0, 1, 0.1, '0 means a fixed price. 1 means the price follows the market, up or down.', '%'],
                              ] as const)
                            : ([
                                ['incentive', 'Our upfront payment', 0.1, 0.4, 0.05, 'Share of the project cost we pay now. Higher means smaller yearly bills later.', '%'],
                                ['months', 'Contract length (months)', 12, 60, 1, 'How long the company runs it and we pay yearly fees. Longer means smaller yearly bills.', ''],
                                ['priceFactor', 'What users pay', 0.5, 1.5, 0.1, '1.0 is the normal price. Higher charges make users pay more, so our yearly bills fall.', ''],
                                ['protection', 'Safety net we give them', 0, 0.3, 0.05, 'Share of project cost we promise to cover if things go wrong. More safety net makes the company agree, but we carry the risk.', '%'],
                              ] as const)
                  ).map(([key, label, min, max, step, hint, unit]) => (
                    <label key={key}>
                      {label}{unit === '%' && !(d.kind === 'rescue' && key === 'protection') ? ` (${Math.round((drafts[d.id]?.[key] ?? d.terms[key]) * 100)}%)` : ''}
                      {d.kind === 'rescue' && key === 'protection' ? (
                        <select
                          className="input"
                          value={drafts[d.id]?.protection ?? d.terms.protection}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [d.id]: { ...drafts[d.id], protection: Number(e.target.value) },
                            })
                          }
                          aria-label={`Financing structure for deal ${d.id}`}
                        >
                          <option value={1}>Senior secured loan</option>
                          <option value={0}>Equity recapitalisation</option>
                        </select>
                      ) : (
                        <input
                          className="input"
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={drafts[d.id]?.[key] ?? d.terms[key]}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [d.id]: { ...drafts[d.id], [key]: Number(e.target.value) },
                            })
                          }
                          aria-label={`${label} for deal ${d.id}`}
                        />
                      )}
                      <span className="block text-[11px] font-normal text-slate-400">{hint}</span>
                    </label>
                  ))}
                  <button
                    className="btn"
                    disabled={d.rounds >= 3}
                    onClick={() => {
                      command({ type: 'dealOffer', id: d.id, terms: drafts[d.id] ?? d.terms });
                      setDrafts({ ...drafts, [d.id]: {} });
                    }}
                  >
                    Send terms ({d.rounds}/3 rounds)
                  </button>
                </div>
              )}
            {d.kind === 'takeover' && (
              <p>
                Rival offer: {money((d.rivalBidMinor ?? 0) / 100)} before fees for comparable ownership. No
                listed-security or public-to-public takeover.
              </p>
            )}
            {d.enterprise && (
              <p>
                Public ownership {(d.enterprise.publicShare * 100).toFixed(1)}% · company cash{' '}
                {money(d.enterprise.cashMinor / 100)} · capital {money(d.enterprise.capitalMinor / 100)} ·
                debt{' '}
                {money(
                  (d.enterprise.debtMinor + d.enterprise.publicLoanMinor + d.enterprise.payablesMinor) / 100,
                )}{' '}
                · carrying value {money(d.valueMinor / 100)}. Conservative book value, not a live market
                quote.
              </p>
            )}
            {d.kind === 'startup' && d.status === 'active' && (
              <div className="flex gap-2">
                <button
                  className="btn"
                  disabled={d.enterprise!.roundDone || g.scheduler.lastDay < d.enterprise!.nextRoundDay}
                  onClick={() => askAction(d, 'followOn')}
                >
                  Join follow-on round
                </button>
                <button
                  className="btn"
                  disabled={d.enterprise!.roundDone || g.scheduler.lastDay < d.enterprise!.nextRoundDay}
                  onClick={() => askAction(d, 'dilute')}
                >
                  Accept dilution
                </button>
                <button className="btn" onClick={() => askAction(d, 'exit')}>
                  Seek exit bid
                </button>
              </div>
            )}
            {['rescue', 'takeover'].includes(d.kind) && d.status === 'active' && (
              <div className="flex gap-2">
                <button className="btn" onClick={() => askAction(d, 'dividend')}>
                  Distribute earned profits
                </button>
                <button className="btn" onClick={() => askAction(d, 'liquidate')}>
                  Liquidate at recovery value
                </button>
              </div>
            )}
            {d.kind === 'takeover' && d.status === 'active' && (
              <button className="btn" onClick={() => askAction(d, 'exit')}>
                Seek strategic exit bid
              </button>
            )}
            {!!d.claimMinor && (
              <button className="btn" onClick={() => command({ type: 'deal', id: d.id, action: 'collect' })}>
                Pursue clawback
              </button>
            )}
            <div className="flex gap-2">
              {d.status === 'opportunity' && (
                <button className="btn" onClick={() => command({ type: 'deal', id: d.id, action: 'review' })}>
                  Review offer
                </button>
              )}
              {d.status === 'negotiating' && (
                <button className="btn btn-primary" onClick={() => askAction(d, 'sign')}>
                  Review signature
                </button>
              )}
              {['opportunity', 'negotiating'].includes(d.status) && (
                <button className="btn" onClick={() => command({ type: 'deal', id: d.id, action: 'reject' })}>
                  Decline
                </button>
              )}
              {(d.status === 'agreed' ||
                (['concession', 'supply', 'export'].includes(d.kind) && d.status === 'active')) && (
                <button className="btn" onClick={() => askAction(d, 'cancel')}>
                  {d.status === 'active' ? 'Terminate contract' : 'Cancel before closing'}
                </button>
              )}
            </div>
            {!!d.history.length && (
              <details>
                <summary>Agreement history</summary>
                {d.history.map((h, i) => (
                  <p key={i}>
                    {klDayLabel(h.day)} · {h.text}
                  </p>
                ))}
              </details>
            )}
          </div>
        </Section>
      ))}
      <button className="btn" onClick={() => useGame.getState().setPanel('fdi')}>
        Investment & FDI
      </button>
      {review && (
        <ConfirmDialog
          title={
            {
              sign: 'Sign agreement',
              cancel: 'Review contract cancellation',
              followOn: 'Review follow-on investment',
              dilute: 'Accept financing dilution',
              exit: 'Review exit offer',
              liquidate: 'Review liquidation',
              dividend: 'Review profit distribution',
            }[reviewAction]
          }
          confirmLabel={reviewAction === 'sign' ? 'Sign agreement' : 'Confirm decision'}
          onCancel={() => setReview(null)}
          onConfirm={() => {
            command({ type: 'deal', id: review.id, action: reviewAction });
            setReview(null);
          }}
        >
          <p>
            {review.name}.{' '}
            {reviewAction === 'sign'
              ? `Reserve ${money(review.priceMinor / 100)} from ${review.payer === 'strategic' ? 'Khazanah cash' : review.payer === 'fund' ? 'sovereign fund cash' : 'treasury cash'}.`
              : reviewAction === 'followOn'
                ? `Follow-on cash needed ${money(20e6 * (review.enterprise?.publicShare ?? 0))}.`
                : reviewAction === 'cancel'
                  ? `Cancellation can charge ${money(review.kind === 'concession' && review.status === 'active' ? ((review.assetCostMinor ?? 0) * 0.1) / 100 : review.kind === 'supply' && review.status === 'active' ? (review.escrowMinor * 0.2) / 100 : review.kind === 'export' && review.status === 'active' ? Math.min(review.escrowMinor, review.priceMinor * 0.5) / 100 : 0)}. Existing arrears remain payable.`
                  : reviewAction === 'liquidate'
                    ? 'Capital sells at 40% recovery, limited by buyer cash. Senior public loans are paid before other creditors and shareholders. Unrecovered claims are written off.'
                    : reviewAction === 'dividend'
                      ? 'Distribute half of available earned cash profit to all shareholders. Public cash and the equity claim change together.'
                      : reviewAction === 'dilute'
                        ? 'Outside investors finance the down round at 70% of book pre-money value. Your percentage ownership falls.'
                        : 'The outside buyer pays a cash-backed bid based on current net assets. The six-month holding review must be satisfied.'}{' '}
            Cash is unavailable to other purchases until settlement or cancellation. Remaining commitments{' '}
            {money((reviewAction === 'sign' ? quoteDealCommitment(g, review) : review.committedMinor) / 100)};
            guarantee cap{' '}
            {money(
              (review.kind === 'concession' ? concessionQuote(review).guarantee : review.guaranteeMinor) /
                100,
            )}
            . Concession service payments continue beyond construction; collateral contracts also need
            operating cash. No automatic borrowing.
          </p>
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
