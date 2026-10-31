import { useState } from 'react';
import { investorName, attractiveness, directJobs, FDI_KIND_IDS, FDI_KINDS, fdiToGdp, operatingStock, overallAttractiveness } from '../../engine/fdi';
import { leverTarget } from '../../engine/policy';
import { klDayLabel } from '../../engine/time';
import type { FdiPledge } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, num, pct } from '../../utils/format';
import { CompanyLogo } from '../CompanyLogo';
import { Bar, Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function FdiPanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const [offers, setOffers] = useState<Record<number, number>>({});
  const [review, setReview] = useState<{ p: FdiPledge; approve: boolean } | null>(null);
  if (!g.fdi.enabled) return <PanelShell title="Investment & FDI" subtitle="Foreign direct investment"><p className="text-[13px] text-slate-300">FDI pledges are modelled in new Malaysia campaigns (model 3). This save keeps its original rules.</p></PanelShell>;
  const f = g.fdi;
  const h = f.history.slice(-12);
  const sum = (k: 'pledged' | 'approved' | 'realised' | 'grants') => h.reduce((a, m) => a + m[k], 0) + f.mtd[k];
  const open = f.pledges.filter(p => p.status === 'offered');
  const pipeline = f.pledges.filter(p => p.status === 'building' || p.status === 'operating');
  const past = f.pledges.filter(p => p.status === 'declined' || p.status === 'withdrawn').slice(-6).reverse();
  const today = g.scheduler.lastDay;
  const offer = (p: FdiPledge) => offers[p.id] ?? Math.max(p.ask, leverTarget(g, 'fdiIncentive'));
  return (
    <PanelShell title="Investment & FDI" subtitle="Fictional simulated pledges from real companies. Approve with a co-investment incentive, or decline." width={760}>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="Investment climate" value={`${overallAttractiveness(g).toFixed(0)}/100`} sub="50 = opening" tone={overallAttractiveness(g) >= 50 ? 'up' : 'down'} />
        <Stat label="FDI realised (12m)" value={money(sum('realised'))} sub={`${pct(fdiToGdp(g), 2)} of GDP`} />
        <Stat label="Pledged / approved (12m)" value={money(sum('pledged'))} sub={`approved ${money(sum('approved'))}`} />
        <Stat label="Operating stock · jobs" value={money(operatingStock(g))} sub={`${num(directJobs(g))} direct jobs`} />
      </div>
      <Section title={`Pledges awaiting a decision (${open.length})`}>
        {!open.length && <p className="text-[12px] text-slate-400">No open pledges. A better investment climate brings more of them.</p>}
        {open.map(p => (
          <div key={p.id} className="mb-2 rounded-lg bg-emerald-400/10 p-2 text-[12.5px]" data-testid={`pledge-${p.id}`}>
            <div className="flex items-center gap-2"><CompanyLogo id={p.investor} size={26} /><b className="flex-1 text-white">{p.title}</b><span className="text-slate-400">decide by {klDayLabel(p.decideByDay)} ({p.decideByDay - today}d)</span></div>
            <div className="mt-1 text-[11.5px] text-slate-300">{FDI_KINDS[p.kind].label} · builds ~{p.buildMonths} months · ~{num(p.jobs)} direct jobs · exports {pct(FDI_KINDS[p.kind].exportRatio, 0)} of the investment a year once operating · asks <b>{pct(p.ask, 0)}</b> incentive ({money(p.amount * p.ask)})</div>
            <div className="mt-1 flex items-center gap-2">
              <label className="text-[11.5px] text-slate-400">Offer</label>
              <input type="range" min={0} max={0.3} step={0.01} value={offer(p)} onChange={e => setOffers({ ...offers, [p.id]: Number(e.target.value) })} aria-label={`Incentive for pledge ${p.id}`} data-testid={`pledge-offer-${p.id}`} className="flex-1" />
              <span className="num w-28 text-right">{pct(offer(p), 0)} · {money(p.amount * offer(p))}</span>
              <button className="btn btn-primary" onClick={() => setReview({ p, approve: true })} data-testid={`pledge-approve-${p.id}`}>Approve</button>
              <button className="btn" onClick={() => setReview({ p, approve: false })}>Decline</button>
            </div>
          </div>
        ))}
      </Section>
      <Section title="Pipeline">
        {!pipeline.length && <p className="text-[12px] text-slate-400">No approved projects yet.</p>}
        {pipeline.map(p => (
          <div key={p.id} className="mb-1.5 flex items-center gap-2 text-[12px]">
            <CompanyLogo id={p.investor} /><span className="w-56 truncate">{investorName(p.investor)} · {FDI_KINDS[p.kind].label}</span>
            <div className="flex-1"><Bar value={p.spent / p.amount} color={p.status === 'operating' ? '#34d399' : '#fbbf24'} /></div>
            <span className="num w-44 text-right">{p.status === 'operating' ? 'Operating' : `Building ${pct(p.spent / p.amount, 0)}`} · {money(p.amount)}</span>
          </div>
        ))}
        {!!past.length && <p className="mt-2 text-[11px] text-slate-500">Recently lapsed or declined: {past.map(p => `${investorName(p.investor)} (${p.status})`).join(', ')}</p>}
      </Section>
      <Section title="Investment climate by project type">
        {FDI_KIND_IDS.map(k => <div key={k} className="mb-1 flex items-center gap-2 text-[12px]"><span className="w-40">{FDI_KINDS[k].label}</span><div className="flex-1"><Bar value={attractiveness(g, k) / 100} /></div><span className="num w-12 text-right">{attractiveness(g, k).toFixed(0)}</span></div>)}
        <p className="mt-2 text-[11px] text-slate-400">Raised by lower corporate tax, the standard incentive, the green lane, fiscal credibility and trade access; data centres also respond to the AI programme and power prices, green projects to the green programme and carbon price. Capital controls, minimum-wage and levy rises lower it. Pledge arrival odds scale with the square of the index. Approved spending buys local construction and equipment, the inflow supports the ringgit, grants are paid as it builds, and operating plants add exports.</p>
      </Section>
      {review && (
        <ConfirmDialog title={review.approve ? 'Approve investment' : 'Decline investment'} confirmLabel={review.approve ? 'Approve' : 'Decline'} danger={!review.approve} onCancel={() => setReview(null)} onConfirm={() => {
          command({ type: 'decidePledge', id: review.p.id, approve: review.approve, incentive: offer(review.p) });
          setReview(null);
        }}>
          {review.approve
            ? <p>{review.p.title}. Grant {pct(offer(review.p), 0)} = {money(review.p.amount * offer(review.p))}, paid from the treasury as it builds. {offer(review.p) < review.p.ask ? `Below the ${pct(review.p.ask, 0)} asked: the investor may walk away.` : 'Meets the ask.'}</p>
            : <p>Decline {review.p.title}? The investor will go elsewhere.</p>}
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
