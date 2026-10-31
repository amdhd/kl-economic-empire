import { useState } from 'react';
import { quoteIntervention } from '../../engine/trade-fx';
import { formatKL, klDay } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { fullMoneyMinor, fx, money, pct } from '../../utils/format';
import { Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function TradePanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const pending = g.government.pending.filter(p => p.kind === 'trade');
  const proposal = pending.at(-1)?.patch as Partial<typeof g.trade.policy> | undefined;
  const [tariff, setTariff] = useState((proposal?.tariff ?? g.trade.policy.tariff) * 100);
  const [support, setSupport] = useState((proposal?.exportBudgetMonthly ?? g.trade.policy.exportBudgetMonthly) / 1e6);
  const [side, setSide] = useState<'sellUSD' | 'buyUSD'>('sellUSD');
  const [usdMillions, setUsdMillions] = useState(100);
  const [confirm, setConfirm] = useState<'trade' | 'fx' | null>(null);
  const usdMinor = Math.round(usdMillions * 1e8);
  const q = quoteIntervention(g, side, usdMinor, g.clock.hour * 60);
  const used = g.centralBank.lastInterventionDay === klDay(g.clock.hour * 60) ? g.centralBank.dailyUsdUsed : 0;
  const validTrade = Number.isFinite(tariff) && tariff >= 0 && tariff <= 20 && Number.isFinite(support) && support >= 0 && support <= 2000;
  return <PanelShell title="Trade & central bank" subtitle="Fictional import/export policy and reserve-backed FX intervention" width={720}>
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-900/40 p-3">
      <Stat label="Exports · month to date" value={money(g.trade.mtdExports)} />
      <Stat label="Imported inputs · MTD" value={money(g.trade.mtdImports)} />
      <Stat label="Modeled trade balance" value={money(g.trade.mtdExports - g.trade.mtdImports)} />
    </div>
    <p className="text-[12px] text-slate-400">Flows come from delivered sector exports and imported production inputs. This reduced model excludes household final imports and re-exports; it is not official merchandise trade or a complete balance of payments. Share trading never enters GDP.</p>
    {g.trade.trackingStartDay > klDay(g.clock.startHour * 60) && <p className="text-[12px] text-amber-200">Trade recording began when this legacy save was upgraded. Its first recorded month is partial.</p>}
    <Section title="Import and export policy · effective next calendar month">
      <label className="block text-[12px]">Import tariff · {pct(tariff / 100)} <span className="text-slate-400">(in force {pct(g.trade.policy.tariff)})</span>
        <input type="range" min="0" max="20" step="0.5" value={tariff} onChange={e => setTariff(Number(e.target.value))} aria-label="Import tariff" data-testid="trade-tariff" />
      </label>
      <label className="mt-3 flex items-center justify-between gap-2 text-[12px]">Export support · RM million/month
        <input className="input num !w-32" type="number" min="0" max="2000" step="10" value={support} onChange={e => setSupport(Number(e.target.value))} aria-label="Export support budget" data-testid="export-support" />
      </label>
      <p className="mt-2 text-[12px] text-slate-400">Tariffs collect treasury receipts and raise input costs, feeding prices and profits. Paid export services build demand access over roughly 90 days, capped at 12%. Support is discretionary: only available treasury cash is paid; no payment means no new boost. The proposed maximum is {money(support * 1e6)}/month.</p>
      <button className="btn btn-primary mt-2" disabled={!validTrade} onClick={() => setConfirm('trade')} data-testid="queue-trade">Review trade policy</button>
      {pending.map(p => <div key={p.id} className="mt-2 flex items-center justify-between gap-2 text-[12px] text-amber-200"><span>{p.label} · from {formatKL(p.effectiveMin).date}</span><button className="btn" onClick={() => command({ type: 'cancelPolicy', id: p.id })}>Withdraw</button></div>)}
    </Section>
    <Section title="Central bank · sterilised FX desk">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Simulated MYR per $1" value={fx(g.external.myrPerUsd)} />
        <Stat label="Automatic OPR" value={pct(g.external.opr, 2)} />
        <Stat label="Usable foreign-currency inventory" value={fullMoneyMinor(g.centralBank.usdReserves, 'USD')} />
        <Stat label="Segregated MYR inventory" value={fullMoneyMinor(g.centralBank.myrCash)} />
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Sell USD to support the ringgit; buy USD to weaken it. Settlement uses today’s FX plus a 0.2% cost. Pressure begins at the next daily fixing and fades over 30 days; global shocks can outweigh it. Daily turnover remaining: {money(Math.max(0, 1e9 - used), 'USD')}. Accounts cannot be transferred to treasury/SWF. Portfolio gains and losses enter public wealth.</p>
      {g.baseline.profile === 'legacy-kl' && <p className="mt-2 text-[12px] text-amber-200">Legacy saves receive no invented reserves. Start a new Malaysia campaign for the central-bank desk.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[12px]">Action<select className="input mt-1 block" value={side} onChange={e => setSide(e.target.value as typeof side)} aria-label="FX intervention direction"><option value="sellUSD">Sell USD · support MYR</option><option value="buyUSD">Buy USD · weaken MYR</option></select></label>
        <label className="text-[12px]">$ million<input className="input num mt-1 block !w-32" type="number" min="1" max="1000" step="10" value={usdMillions} onChange={e => setUsdMillions(Number(e.target.value))} aria-label="FX intervention USD millions" data-testid="intervention-amount" /></label>
        <button className="btn btn-primary" disabled={!q.ok} onClick={() => setConfirm('fx')} data-testid="review-intervention">Review intervention</button>
      </div>
      <p className="mt-2 text-[12px] text-slate-400" data-testid="intervention-quote">{q.ok ? `${side === 'buyUSD' ? 'Pay' : 'Receive'} ${fullMoneyMinor(q.myrMinor)} at ${fx(q.rate)} MYR/USD, including spread.` : q.message}</p>
      <div className="mt-3 space-y-1 text-[11.5px] text-slate-400" data-testid="intervention-history">{g.centralBank.tx.slice(-5).reverse().map((t, i) => <div key={i}>{formatKL(t.atMin).date} · {t.side === 'buyUSD' ? 'Bought' : 'Sold'} {fullMoneyMinor(t.usdMinor, 'USD')} · MYR leg {fullMoneyMinor(t.myrMinor)}</div>)}</div>
    </Section>
    <Section title="Monthly trade settlement · simulated MYR">
      {g.trade.history.length === 0 ? <p className="text-[12px] text-slate-400">The first month closes automatically on 1 February.</p> : <table className="w-full text-right text-[12px]"><thead><tr className="text-slate-400"><th>Month</th><th>Exports</th><th>Inputs imported</th><th>Tariffs</th><th>Support paid</th></tr></thead><tbody>{g.trade.history.slice(-12).reverse().map(r => <tr key={r.monthKey}><td className="py-1">{g.reports.find(m => m.monthKey === r.monthKey)?.label}</td><td>{money(r.exports)}</td><td>{money(r.imports)}</td><td>{money(r.tariff)}</td><td>{money(r.support)}</td></tr>)}</tbody></table>}
    </Section>
    {confirm && <ConfirmDialog title={confirm === 'trade' ? 'Approve trade policy' : 'Approve FX intervention'} confirmLabel={confirm === 'trade' ? 'Queue trade policy' : 'Execute intervention'} onCancel={() => setConfirm(null)} onConfirm={() => {
      if (confirm === 'trade') command({ type: 'queueTrade', tariff: tariff / 100, exportBudgetMonthly: support * 1e6 });
      else command({ type: 'interveneFx', side, usdMinor });
      setConfirm(null);
    }}>
      {confirm === 'trade' ? <p>Queue a {pct(tariff / 100)} input tariff and up to {money(support * 1e6)} export services per average month, effective on the 1st of next month. Input costs rise; export gains build with a lag and depend on actual funding.</p> : <p>{side === 'buyUSD' ? 'Buy' : 'Sell'} {fullMoneyMinor(usdMinor, 'USD')}. {q.ok ? `${side === 'buyUSD' ? 'Pay' : 'Receive'} ${fullMoneyMinor(q.myrMinor)} from the central-bank inventory, including spread.` : q.message} FX impact is temporary and not guaranteed.</p>}
    </ConfirmDialog>}
  </PanelShell>;
}
