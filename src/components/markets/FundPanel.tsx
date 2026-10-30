import { useMemo, useState } from 'react';
import { COMPANY_BY_ID, currencyOf } from '../../data/companies';
import { treasuryMYR } from '../../engine/government';
import { FX_SPREAD, navMYR, planRebalance, positionValueMYR } from '../../engine/sovereign-fund';
import { formatKL, klDayLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import type { Currency, Position, TickerId } from '../../types/game';
import { fx, money, num, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { ConfirmDialog } from '../panels/ConfirmDialog';
import { PanelShell } from '../panels/PanelShell';
import { Bar, Section, Stat, Tabs } from '../ui';

export function FundPanel() {
  const g = useGameState();
  const { command, select } = useGame.getState();
  const [tab, setTab] = useState<'holdings' | 'orders' | 'ledger'>('holdings');
  const fxr = g.external.myrPerUsd;
  const nav = navMYR(g);
  const f = g.fund;
  const positions = Object.entries(f.positions) as [TickerId, Position][];
  const myEq = positions.filter(([id]) => id.startsWith('MY:')).reduce((a, [id]) => a + positionValueMYR(g, id), 0);
  const usEq = positions.filter(([id]) => id.startsWith('US:')).reduce((a, [id]) => a + positionValueMYR(g, id), 0);
  const cash = f.myrCash / 100 + (f.usdCash / 100) * fxr;
  const totalReturn = nav - g.scheduler.startNav - (f.totalInjectedMYR - f.totalWithdrawnMYR);
  const navData = useMemo(() => f.navHistory.map((p) => ({ t: p.t, v: p.nav / 1e11 })), [f.navHistory.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PanelShell title="Sovereign wealth fund" subtitle="Government-owned, separate from the treasury. No leverage, shorting or margin." width={720}>
      <div className="grid grid-cols-5 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="NAV (MYR)" value={money(nav)} sub="FX-adjusted" />
        <Stat label="MYR cash" value={money(f.myrCash / 100)} />
        <Stat label="USD cash" value={money(f.usdCash / 100, 'USD')} sub={`≈ ${money((f.usdCash / 100) * fxr)}`} />
        <Stat label="Return since start" value={money(totalReturn)} tone={totalReturn >= 0 ? 'up' : 'down'} sub={`${pct(totalReturn / g.scheduler.startNav, 2, true)} · ex-transfers`} />
        <Stat label="Costs paid" value={money(f.feesPaidMYR)} sub="fees, spreads, FX" />
      </div>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3" data-testid="fund-totals">
        <Stat label="Realised (MYR stocks)" value={money(f.realized.MYR / 100)} tone={f.realized.MYR >= 0 ? 'up' : 'down'} hint="Cumulative, survives fully sold positions" />
        <Stat label="Realised (US stocks, USD)" value={money(f.realized.USD / 100, 'USD')} tone={f.realized.USD >= 0 ? 'up' : 'down'} />
        <Stat label="Realised, all in MYR" value={money(f.realizedMYR / 100)} sub="at sale FX vs purchase FX" tone={f.realizedMYR >= 0 ? 'up' : 'down'} />
        <Stat label="Dividends received (net)" value={money(f.dividends.MYR / 100)} sub={`+ ${money(f.dividends.USD / 100, 'USD')}`} />
      </div>
      <Section title="Allocation">
        {[['Malaysian equities', myEq, '#34d399'], ['US equities', usEq, '#60a5fa'], ['Cash (MYR + USD)', cash, '#94a3b8']].map(([k, v, c]) => (
          <div key={k as string} className="mb-1.5 flex items-center gap-2 text-[12px]">
            <span className="w-36 text-slate-300">{k as string}</span>
            <Bar value={(v as number) / nav} color={c as string} />
            <span className="num w-28 text-right">{money(v as number)} · {pct((v as number) / nav, 0)}</span>
          </div>
        ))}
      </Section>
      <TargetAllocation myPct={myEq / nav} usPct={usEq / nav} />
      <Section title="NAV history">
        <TimeChart data={navData} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'v', name: 'NAV', color: '#34d399' }]} yFormat={(v) => `${v.toFixed(2)}`} unit="RM billion · daily" height={120} area />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <FxBox />
        <TransfersBox treasury={treasuryMYR(g.government)} />
      </div>
      <Section title="Fund activity" right={<Tabs value={tab} onChange={setTab} options={[{ id: 'holdings', label: `Holdings (${positions.length})` }, { id: 'orders', label: 'Orders' }, { id: 'ledger', label: 'Ledger' }]} />}>
        {tab === 'holdings' && (positions.length ? (
          <table className="data num">
            <thead><tr><th>Security</th><th className="text-right">Units</th><th className="text-right">Value MYR</th><th className="text-right">% NAV</th><th className="text-right">Return (local)</th><th className="text-right">Return (MYR)</th><th className="text-right">Dividends</th></tr></thead>
            <tbody>
              {positions.map(([id, p]) => {
                const v = positionValueMYR(g, id);
                const loc = (p.units * g.market.quotes[id].price) / (p.costMinor / 100) - 1;
                const myr = v / (p.costMYR / 100) - 1;
                return (
                  <tr key={id} className="row" onClick={() => select({ kind: 'company', id })}>
                    <td>{COMPANY_BY_ID[id].displayName} <span className="font-mono text-[10.5px] text-slate-500">{id}</span></td>
                    <td className="text-right">{num(p.units)}</td>
                    <td className="text-right">{money(v)}</td>
                    <td className="text-right">{pct(v / nav)}</td>
                    <td className={`text-right ${loc >= 0 ? 'up' : 'down'}`}>{pct(loc, 1, true)}</td>
                    <td className={`text-right ${myr >= 0 ? 'up' : 'down'}`}>{pct(myr, 1, true)}</td>
                    <td className="text-right">{money(p.dividendsMinor / 100, currencyOf(id))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="text-[12.5px] text-slate-400">No holdings yet. Open <b>Stock markets</b>, pick a company and use the trade ticket. US stocks need USD cash — convert below.</div>)}
        {tab === 'orders' && (
          <table className="data num">
            <thead><tr><th>Placed</th><th>Order</th><th>Status</th><th className="text-right">Fill</th><th /></tr></thead>
            <tbody>
              {[...f.orders].reverse().slice(0, 40).map((o) => (
                <tr key={o.id}>
                  <td className="text-slate-400">{formatKL(o.createdMin).date.slice(0, 6)} {formatKL(o.createdMin).time}</td>
                  <td>{o.side.toUpperCase()} {num(o.units)} {COMPANY_BY_ID[o.ticker].displayName}</td>
                  <td className={o.status === 'filled' ? 'up' : o.status === 'rejected' || o.status === 'expired' ? 'down' : 'text-amber-300'} title={o.reason}>{o.status}{o.reason ? ` — ${o.reason.slice(0, 40)}` : ''}</td>
                  <td className="text-right">{o.fillPrice ? o.fillPrice.toFixed(3) : '—'}</td>
                  <td className="text-right">{o.status === 'queued' && <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => command({ type: 'cancelOrder', id: o.id })}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'ledger' && (
          <table className="data num">
            <thead><tr><th>Time</th><th>Type</th><th>Detail</th><th className="text-right">Cash</th></tr></thead>
            <tbody>
              {[...f.tx].reverse().slice(0, 60).map((t) => (
                <tr key={t.id}>
                  <td className="text-slate-400">{formatKL(t.atMin).date.slice(0, 6)}</td>
                  <td className="capitalize">{t.type}</td>
                  <td className="max-w-[300px] truncate text-slate-300">{t.ticker ? `${COMPANY_BY_ID[t.ticker].displayName}: ` : ''}{t.note}</td>
                  <td className={`text-right ${t.amountMinor >= 0 ? 'up' : 'down'}`}>{money(t.amountMinor / 100, t.currency, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <DividendPolicy />
    </PanelShell>
  );
}

function FxBox() {
  const g = useGameState();
  const command = useGame.getState().command;
  const [from, setFrom] = useState<Currency>('MYR');
  const [amt, setAmt] = useState(500);
  const fxr = g.external.myrPerUsd;
  const out = from === 'MYR' ? (amt * 1e6) / (fxr * (1 + FX_SPREAD)) : amt * 1e6 * fxr * (1 - FX_SPREAD);
  return (
    <Section title={`FX desk · MYR/USD ${fx(fxr)}`}>
      <div className="mb-2 flex items-center gap-2">
        <Tabs value={from} onChange={setFrom} options={[{ id: 'MYR', label: 'MYR → USD' }, { id: 'USD', label: 'USD → MYR' }]} />
      </div>
      <div className="mb-2 flex items-center gap-2 text-[12px]">
        <input className="input num" type="number" min={1} value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} aria-label="FX amount in millions" data-testid="fx-amount" />
        <span className="shrink-0 text-slate-400">m {from}</span>
      </div>
      <div className="num mb-2 text-[12px] text-slate-300">You receive ≈ <b>{money(out, from === 'MYR' ? 'USD' : 'MYR', 2)}</b> (spread {pct(FX_SPREAD, 2)})</div>
      <button className="btn w-full" disabled={!(amt > 0)} onClick={() => command({ type: 'fx', from, amountMinor: Math.round(amt * 1e6 * 100) })} data-testid="fx-convert">Convert</button>
    </Section>
  );
}

function TransfersBox({ treasury }: { treasury: number }) {
  const command = useGame.getState().command;
  const [amt, setAmt] = useState(1000);
  const [confirm, setConfirm] = useState<'in' | 'out' | null>(null);
  return (
    <Section title="Treasury ⇄ fund transfers">
      <div className="mb-2 flex items-center gap-2 text-[12px]">
        <input className="input num" type="number" min={1} value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} aria-label="Transfer amount in RM millions" />
        <span className="shrink-0 text-slate-400">RM m</span>
      </div>
      <div className="mb-2 text-[11.5px] text-slate-400">Treasury cash: {money(treasury)}. Transfers move wealth between public accounts — they are not revenue or spending.</div>
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={!(amt > 0)} onClick={() => setConfirm('in')}>Inject → SWF</button>
        <button className="btn flex-1" disabled={!(amt > 0)} onClick={() => setConfirm('out')}>Withdraw → treasury</button>
      </div>
      {confirm && (
        <ConfirmDialog title={confirm === 'in' ? `Inject RM ${amt}m into the SWF` : `Withdraw RM ${amt}m to the treasury`} confirmLabel="Confirm transfer" onCancel={() => setConfirm(null)} onConfirm={() => { command({ type: confirm === 'in' ? 'fundInject' : 'fundWithdraw', amount: amt * 1e6 }); setConfirm(null); }}>
          {confirm === 'in' ? 'Treasury cash falls and fund MYR cash rises by the same amount. Public net worth is unchanged.' : 'Fund MYR cash falls and the treasury rises by the same amount. This is a transfer, not new revenue.'}
        </ConfirmDialog>
      )}
    </Section>
  );
}

function DividendPolicy() {
  const g = useGameState();
  const command = useGame.getState().command;
  const [v, setV] = useState(g.fund.dividendTransferPct * 100);
  return (
    <Section title="Dividend transfer policy">
      <div className="flex items-center gap-3 text-[12.5px]">
        <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Dividend transfer percent" />
        <span className="num w-12 text-right">{v}%</span>
        <button className="btn" disabled={v === g.fund.dividendTransferPct * 100} onClick={() => command({ type: 'setDividendTransfer', pct: v / 100 })}>Apply</button>
      </div>
      <div className="mt-1 text-[11.5px] text-slate-400">Share of dividends received that is transferred to the treasury at each month end (from MYR cash). Current: {g.fund.dividendTransferPct * 100}%.</div>
    </Section>
  );
}

function TargetAllocation({ myPct, usPct }: { myPct: number; usPct: number }) {
  const g = useGameState();
  const command = useGame.getState().command;
  const [my, setMy] = useState(Math.round(myPct * 100));
  const [us, setUs] = useState(Math.round(usPct * 100));
  const [confirm, setConfirm] = useState(false);
  const cash = 100 - my - us;
  const plan = useMemo(() => (cash >= 0 ? planRebalance(g, my / 100, us / 100) : null), [g, g.reports.length, my, us, cash, confirm]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section title="Target allocation">
      <div className="grid grid-cols-2 gap-4 text-[12.5px]">
        <label>
          <div className="mb-1 flex justify-between"><span>Malaysian equities</span><b className="num">{my}%</b></div>
          <input type="range" min={0} max={100} value={my} onChange={(e) => setMy(Math.min(Number(e.target.value), 100 - us))} aria-label="Target Malaysian equities" />
        </label>
        <label>
          <div className="mb-1 flex justify-between"><span>US equities</span><b className="num">{us}%</b></div>
          <input type="range" min={0} max={100} value={us} onChange={(e) => setUs(Math.min(Number(e.target.value), 100 - my))} aria-label="Target US equities" />
        </label>
      </div>
      <div className="mt-1 text-[12px] text-slate-400">Cash target: <b className="text-slate-200">{cash}%</b> · now MY {pct(myPct, 0)} / US {pct(usPct, 0)}. Buys are cap-weighted across the exchange’s 20 names within the 20% and liquidity limits; sells are pro-rata. Liquidity caps each stock at 25% of its daily value per session, so large shifts take several sessions — rebalance again on later days.</div>
      {plan && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="num text-slate-300">{plan.legs.length} orders{plan.fxMinorMYR > 0 ? ` · convert ${money(plan.fxMinorMYR / 100)} to USD` : ''} · est. costs {money(plan.estCostsMYR)}</span>
          <button className="btn btn-primary" disabled={!plan.legs.length} onClick={() => setConfirm(true)} data-testid="rebalance">Rebalance</button>
        </div>
      )}
      {confirm && plan && (
        <ConfirmDialog title="Rebalance the sovereign fund" confirmLabel="Place orders" onCancel={() => setConfirm(false)} onConfirm={() => { command({ type: 'rebalance', targetMY: my / 100, targetUS: us / 100 }); setConfirm(false); }}>
          <div className="scroll-thin max-h-56 overflow-y-auto">
            {plan.legs.map((l) => (
              <div key={l.ticker} className="num flex justify-between text-[12px]"><span className={l.side === 'buy' ? 'up' : 'down'}>{l.side.toUpperCase()} {num(l.units)} {COMPANY_BY_ID[l.ticker].displayName}</span><span>{money(l.valueMYR)}</span></div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-slate-400">Sells execute first, then FX, then buys. Orders on closed exchanges queue for the next open at the then-current price. Estimated costs {money(plan.estCostsMYR)}.</p>
        </ConfirmDialog>
      )}
    </Section>
  );
}
