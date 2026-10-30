import { useState } from 'react';
import { COMPANIES, COMPANY_BY_ID } from '../../data/companies';
import { PETRONAS } from '../../data/world';
import type { Command } from '../../engine/game';
import { isOpen } from '../../engine/market-calendar';
import { khazanahNav, petronasCapex, upstreamPriceIndex } from '../../engine/soe';
import { monthKeyLabel } from '../../engine/time';
import type { TickerId } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function SoePanel() {
  const g = useGameState();
  const p = g.soe.petronas;
  const k = g.soe.khazanah;
  const command = useGame.getState().command;
  const [dividend, setDividend] = useState(p.dividendAnnual / 1e9);
  const [capex, setCapex] = useState(p.capexAnnual / 1e9);
  const [special, setSpecial] = useState(5);
  const [payout, setPayout] = useState(k.payout * 100);
  const [ticker, setTicker] = useState<TickerId>('MY:6888');
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [fraction, setFraction] = useState(2);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  if (!p.enabled) {
    return <PanelShell title="State enterprises" subtitle="PETRONAS and Khazanah">
      <p className="text-[12px] text-amber-200">State enterprises are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  const last = p.history.at(-1);
  const bursaOpen = isOpen('MY', g.clock.hour * 60);
  return <PanelShell title="State enterprises" subtitle="Opening scale approximates public figures; every result is simulated" width={760}>
    <Section title="PETRONAS · wholly state-owned" right={<span className="text-[11.5px] text-slate-400">Realised price index {upstreamPriceIndex(g).toFixed(2)}</span>}>
      <div className="grid grid-cols-4 gap-3" data-testid="petronas-stats">
        <Stat label="Cash" value={money(p.cash)} sub={`floor ${money(PETRONAS.cashFloor)}`} tone={p.cash >= PETRONAS.cashFloor ? 'up' : 'down'} />
        <Stat label="Borrowings" value={money(p.debt)} />
        <Stat label="Production index" value={p.production.toFixed(3)} sub="1 = opening" tone={p.production >= 1 ? 'up' : 'down'} />
        <Stat label="Capex now" value={`${money(petronasCapex(p))}/yr`} sub={petronasCapex(p) < p.capexAnnual ? 'cut: cash below floor' : 'per policy'} />
      </div>
      {last && <p className="mt-2 text-[12px] text-slate-400">{monthKeyLabel(last.monthKey)}: upstream revenue {money(last.revenue)}, petroleum income tax {money(last.pita)}, profit after tax {money(last.profitAfterTax)}, dividend to government {money(last.dividend)}.</p>}
      <div className="mt-3 grid grid-cols-2 gap-4 text-[12px]">
        <label className="block">Annual dividend to government · RM{dividend.toFixed(0)}bn
          <input type="range" min={0} max={80} step={1} value={dividend} onChange={(e) => setDividend(Number(e.target.value))} aria-label="PETRONAS dividend" data-testid="petronas-dividend" />
        </label>
        <label className="block">Annual capital expenditure · RM{capex.toFixed(0)}bn
          <input type="range" min={10} max={100} step={1} value={capex} onChange={(e) => setCapex(Number(e.target.value))} aria-label="PETRONAS capex" data-testid="petronas-capex" />
        </label>
      </div>
      <p className="mt-1 text-[12px] text-slate-400">Dividends move cash from PETRONAS to the treasury: they shrink the deficit but not public wealth. Fields decline about 6% a year unless capex keeps up, so starving investment to pay dividends lowers future production, tax and dividends. About 40% of capex is spent in Malaysia. If cash falls below RM30bn, PETRONAS cuts capex by 30%.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" data-testid="review-petronas" onClick={() => setReview({ cmd: { type: 'petronasPolicy', dividendAnnual: dividend * 1e9, capexAnnual: capex * 1e9 }, title: 'PETRONAS directive', body: `Dividend RM${dividend.toFixed(0)}bn a year (now RM${(p.dividendAnnual / 1e9).toFixed(0)}bn), capex RM${capex.toFixed(0)}bn a year (now RM${(p.capexAnnual / 1e9).toFixed(0)}bn), effective immediately.` })}>Review directive</button>
        <label className="text-[12px]">Special dividend RM bn <input className="input num ml-1 !w-20" type="number" min={1} max={100} value={special} onChange={(e) => setSpecial(Number(e.target.value))} aria-label="Special dividend" /></label>
        <button className="btn" onClick={() => setReview({ cmd: { type: 'soeSpecialDividend', entity: 'petronas', amount: special * 1e9 }, title: 'PETRONAS special dividend', body: `Transfer RM${special}bn from PETRONAS cash to the treasury now. Public wealth is unchanged; PETRONAS has less cash for capex.` })}>Special dividend</button>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Listed subsidiaries held: {Object.entries(p.shares).map(([id, n]) => `${COMPANY_BY_ID[id as TickerId].displayName} ${pct((n as number) / g.companies[id as TickerId].shares, 0)}`).join(', ')}. Their dividends flow to PETRONAS.</p>
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
