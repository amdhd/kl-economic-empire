import { useState } from 'react';
import { PARTNER_IDS, PARTNERS } from '../../data/world';
import type { Command } from '../../engine/game';
import { formatKL } from '../../engine/time';
import type { PartnerId } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { Bar, Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function PartnersPanel() {
  const g = useGameState();
  const w = g.world;
  const command = useGame.getState().command;
  const [partner, setPartner] = useState<PartnerId>('CN');
  const [tariff, setTariff] = useState(w.partners.CN.ourTariff * 100);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  if (!w.enabled) {
    return <PanelShell title="Trading partners" subtitle="Bilateral tariffs and trade agreements">
      <p className="text-[12px] text-amber-200">Trading partners are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  const p = w.partners[partner];
  const m = PARTNERS[partner];
  const today = g.scheduler.lastDay;
  return <PanelShell title="Trading partners" subtitle="Approximate trade shares · simulated partner cycles and responses" width={780}>
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-900/40 p-3">
      <Stat label="Export access index" value={w.exportAccess.toFixed(3)} sub="1 = opening conditions" tone={w.exportAccess >= 1 ? 'up' : 'down'} hint="Partner demand cycles × their tariffs on Malaysia × agreements, weighted by export share" />
      <Stat label="Imported-goods price index" value={w.importPriceIndex.toFixed(3)} sub="after diversion between partners" tone={w.importPriceIndex <= 1 ? 'up' : 'down'} />
      <Stat label="Bilateral duty this month" value={`${money(w.mtd.bilateralDuty)}`} />
    </div>
    <Section title="Partners">
      <table className="w-full text-[12px]" data-testid="partner-table">
        <thead><tr className="text-left text-slate-400"><th>Partner</th><th className="text-right">Exports</th><th className="text-right">Imports</th><th className="text-right">Our surcharge</th><th className="pr-3 text-right">Theirs</th><th className="w-28 px-2">Relations</th><th className="pl-2">Agreement</th></tr></thead>
        <tbody>{PARTNER_IDS.map((id) => {
          const q = w.partners[id];
          return <tr key={id} className={`cursor-pointer ${id === partner ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`} onClick={() => { setPartner(id); setTariff(q.ourTariff * 100); }} data-testid={`partner-${id}`}>
            <td className="py-1 font-semibold">{PARTNERS[id].name}</td>
            <td className="num text-right">{pct(PARTNERS[id].exportShare, 1)}</td>
            <td className="num text-right">{pct(PARTNERS[id].importShare, 1)}</td>
            <td className={`num text-right ${q.ourTariff > 0 ? 'text-amber-200' : ''}`}>{pct(q.ourTariff, 1)}</td>
            <td className={`num pr-3 text-right ${q.theirTariff > 0 ? "text-rose-300" : ""}`}>{pct(q.theirTariff, 1)}{q.retaliationDay !== null && <span className="text-slate-400"> → {pct(q.retaliationTarget, 1)}</span>}</td>
            <td className="px-2"><Bar value={q.relations} max={100} color={q.relations >= 50 ? '#34d399' : '#f43f5e'} /></td>
            <td className="pl-2">{q.negotiationDoneDay !== null ? `talks · ${q.negotiationDoneDay - today}d` : q.agreement ? `tier ${q.agreement}` : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="mt-2 text-[11.5px] text-slate-400">Shares are rounded approximations of recent goods trade, not official statistics. Surcharges are relative to existing trade conditions, which are already built into the opening economy.</p>
    </Section>
    <Section title={`${m.name} · bilateral policy`}>
      <label className="block text-[12px]">Surcharge on imports from {m.name} · {tariff.toFixed(1)}%
        <input type="range" min={0} max={50} step={2.5} value={tariff} onChange={(e) => setTariff(Number(e.target.value))} aria-label="Bilateral tariff" data-testid="partner-tariff" />
      </label>
      <p className="mt-1 text-[12px] text-slate-400">Importers switch to other suppliers (substitution elasticity 4), so costs rise by less than the tariff. {m.name} mirrors {pct(m.retaliation, 0)} of a surcharge on Malaysian exports after about 60 days, and lifts it about 30 days after you do. Relations fall while disputes last.</p>
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary" data-testid="review-partner-tariff" onClick={() => setReview({ cmd: { type: 'partnerTariff', partner, tariff: tariff / 100 }, title: `Surcharge on ${m.name}`, body: `Set a ${tariff.toFixed(1)}% surcharge on imports from ${m.name} from tomorrow. Expect retaliation of about ${(tariff * m.retaliation).toFixed(1)}% on Malaysian exports roughly 60 days later.` })}>Review surcharge</button>
        <button className="btn" data-testid="negotiate" disabled={p.agreement >= 2 || p.negotiationDoneDay !== null} onClick={() => setReview({ cmd: { type: 'negotiateAgreement', partner }, title: `Open trade talks with ${m.name}`, body: 'Talks need relations of at least 50 and no tariff dispute. They conclude in about six months: exporters gain about 5% access to this market and imports from it get about 2% cheaper. A new surcharge during talks collapses them.' })}>Negotiate agreement</button>
      </div>
      {g.government.pending.filter((x) => x.kind === 'partner').map((x) => <div key={x.id} className="mt-2 flex items-center justify-between gap-2 text-[12px] text-amber-200"><span>{x.label} · from {formatKL(x.effectiveMin).date}</span><button className="btn" onClick={() => command({ type: 'cancelPolicy', id: x.id })}>Withdraw</button></div>)}
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </PanelShell>;
}
