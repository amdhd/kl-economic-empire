import { useState } from 'react';
import { COMPANIES, COMPANY_BY_ID } from '../../data/companies';
import type { Command } from '../../engine/game';
import { isOpen } from '../../engine/market-calendar';
import { khazanahNav } from '../../engine/soe';
import type { TickerId } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { Section } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function SoePanel() {
  const g = useGameState();
  const p = g.soe.petronas;
  const k = g.soe.khazanah;
  const command = useGame.getState().command;
  const [payout, setPayout] = useState(k.payout * 100);
  const [ticker, setTicker] = useState<TickerId>('MY:6888');
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [fraction, setFraction] = useState(2);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  if (!p.enabled) {
    return <PanelShell title="State enterprises" subtitle="PETRONAS and Khazanah">
      {!!g.deals?.items.some(d=>d.payer==='strategic'&&(d.valueMinor>0||d.escrowMinor>0)) && <Section title="Khazanah strategic mandate · 10% capital limit">{g.deals.items.filter(d=>d.payer==='strategic'&&(d.valueMinor>0||d.escrowMinor>0)).map(d=><p key={d.id} className="text-[12px]">{d.name}: {money(d.valueMinor/100)} claim · {money(d.escrowMinor/100)} escrow</p>)}<button className="btn mt-2" onClick={()=>useGame.getState().setPanel('deals')}>Inspect strategic agreements</button></Section>}

      <p className="text-[12px] text-amber-200">State enterprises are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  const bursaOpen = isOpen('MY', g.clock.hour * 60);
  return <PanelShell title="State enterprises" subtitle="Khazanah · opening scale approximates public figures; every result is simulated" width={760}>
    <Section title="PETRONAS">
      <p className="text-[12px] text-slate-400">PETRONAS profit, dividend and capex now live in the <button className="underline" onClick={() => useGame.getState().setPanel('oil')} data-testid="soe-open-oil">Oil window</button>.</p>
    </Section>
    <Section title="Khazanah Nasional · government investment holding" right={<span className="num text-[12px] text-slate-300">NAV {money(khazanahNav(g))}</span>}>
      <table className="w-full text-[12px]" data-testid="khazanah-table">
        <thead><tr className="text-left text-slate-400"><th>Holding</th><th className="text-right">Stake</th><th className="text-right">Value</th><th className="text-right">Last DPS</th></tr></thead>
        <tbody>{Object.entries(k.shares).map(([id, n]) => {
          const t = id as TickerId;
          return <tr key={id}><td className="py-1">{COMPANY_BY_ID[t].displayName}</td><td className="num text-right">{pct((n as number) / g.companies[t].shares, 1)}</td><td className="num text-right">{money((n as number) * g.market.quotes[t].price)}</td><td className="num text-right">{g.companies[t].lastDps.toFixed(3)}</td></tr>;
        })}</tbody>
      </table>
      <p className="mt-2 text-[12px] text-slate-400">Cash {money(k.cash)}. Stakes are approximate public figures. Khazanah pays the government {pct(k.payout, 0)} of the dividends it receives each month.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
        <label>Payout % <input className="input num ml-1 !w-16" type="number" min={0} max={100} value={payout} onChange={(e) => setPayout(Number(e.target.value))} aria-label="Khazanah payout" /></label>
        <button className="btn" onClick={() => setReview({ cmd: { type: 'khazanahPayout', payout: payout / 100 }, title: 'Khazanah payout', body: `Khazanah will pay ${payout}% of its dividend income to the government each month; the rest builds its cash.` })}>Set payout</button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-[12px]">
        <label>Block trade<select className="input mt-1 block" value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell')} aria-label="Block side"><option value="sell">Sell (divest)</option><option value="buy">Buy (raise stake)</option></select></label>
        <label>Company<select className="input mt-1 block" value={ticker} onChange={(e) => setTicker(e.target.value as TickerId)} aria-label="Block company">{COMPANIES.filter((c) => c.exchange === 'MY').map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>
        <label>% of company<input className="input num mt-1 block !w-20" type="number" min={0.1} max={10} step={0.1} value={fraction} onChange={(e) => setFraction(Number(e.target.value))} aria-label="Block size" /></label>
        <button className="btn btn-primary" disabled={!bursaOpen} data-testid="review-block" onClick={() => setReview({ cmd: { type: 'khazanahTrade', ticker, side, fraction: fraction / 100 }, title: `Khazanah ${side === 'sell' ? 'divestment' : 'purchase'}`, body: `${side === 'sell' ? 'Sell' : 'Buy'} ${fraction}% of ${COMPANY_BY_ID[ticker].displayName} at a 3% block ${side === 'sell' ? 'discount' : 'premium'} to ${g.market.quotes[ticker].price.toFixed(2)}. A large state block moves sentiment: selling weighs on the price, buying supports it. Proceeds stay in Khazanah until paid out.` })}>Review block</button>
        {!bursaOpen && <span className="text-slate-400">Blocks settle during Bursa trading hours.</span>}
      </div>
    </Section>
    <Section title="Why PNB is not here">
      <p className="text-[12px] text-slate-400">PNB (Permodalan Nasional Berhad) manages unit trusts such as ASB for Bumiputera unit holders. Its income goes to those unit holders, not to the federal government, so it is not modelled as a dividend source. Khazanah is the government's own investment holding.</p>
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </PanelShell>;
}
