import { useState } from 'react';
import { COMPANY_BY_ID, currencyOf } from '../../data/companies';
import { displayMinutes } from '../../engine/clock';
import { isOpen, nextOpen } from '../../engine/market-calendar';
import { LOT, MAX_POSITION_PCT, navMYR, positionValueMYR, quoteFill, validateOrder } from '../../engine/sovereign-fund';
import { formatKL, klDayLabel, monthKeyLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import type { TickerId } from '../../types/game';
import { money, num, pct, price } from '../../utils/format';
import { ConfirmDialog } from '../panels/ConfirmDialog';
import { Section, SimTag, Stat, Tabs } from '../ui';
import { SecurityDetail } from './SecurityDetail';

export function CompanyPanel({ id }: { id: TickerId }) {
  const g = useGameState();
  useGame((s) => s.rev);
  const st = g.companies[id];
  const cur = currencyOf(id);
  const select = useGame.getState().select;
  const events = g.events.active.filter((e) => e.ticker === id);

  return (
    <aside className="glass pointer-events-auto flex max-h-full w-[420px] flex-col overflow-hidden rounded-2xl" data-testid="company-panel">
      <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-2">
        <SimTag />
        <button onClick={() => select(null)} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-white" aria-label="Close">✕</button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <SecurityDetail game={g} id={id} nowMin={displayMinutes(g.clock)} />
        <Section title="Monthly results (fictional)">
          <table className="data num">
            <thead>
              <tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">EBITDA</th><th className="text-right">Net</th><th className="text-right">KL tax</th></tr>
            </thead>
            <tbody>
              <tr className="text-slate-400" title="Month-to-date accrual; closes at month end">
                <td>This month (accruing)</td>
                <td className="text-right">{money(st.mtd.revenue, cur)}</td>
                <td className="text-right">{money(st.mtd.revenue - st.mtd.laborCost - st.mtd.energyCost - st.mtd.otherCost, cur)}</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
              </tr>
              {st.history.slice(-6).reverse().map((h) => (
                <tr key={h.monthKey}>
                  <td>{monthKeyLabel(h.monthKey)}</td>
                  <td className="text-right">{money(h.revenue, cur)}</td>
                  <td className="text-right">{money(h.ebitda, cur)}</td>
                  <td className={`text-right ${h.netIncome < 0 ? 'down' : ''}`}>{money(h.netIncome, cur)}</td>
                  <td className="text-right">{money(h.taxKL, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        {events.length > 0 && (
          <Section title="Company events">
            {events.map((e) => (
              <div key={e.id} className={`text-[12.5px] ${e.templateId === 'company_beat' ? 'up' : 'down'}`}>{e.title} · until {klDayLabel(e.endDay)}</div>
            ))}
          </Section>
        )}
        <TradeTicket id={id} />
        <div className="pb-1 text-[10.5px] text-slate-500">Real company name and ticker used for context only. Prices, financials and events are fictional simulations — not market data or investment advice.</div>
      </div>
    </aside>
  );
}

function TradeTicket({ id }: { id: TickerId }) {
  const g = useGameState();
  const c = COMPANY_BY_ID[id];
  const cur = currencyOf(id);
  const command = useGame.getState().command;
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [units, setUnits] = useState(c.exchange === 'MY' ? 100_000 : 10_000);
  const [confirm, setConfirm] = useState(false);
  const pos = g.fund.positions[id];
  const lot = LOT[c.exchange];
  const minute = Math.floor(displayMinutes(g.clock));
  const open = isOpen(c.exchange, minute);
  const valid = units > 0 && units % lot === 0;
  const qf = valid ? quoteFill(g, id, side, units) : null;
  const err = valid ? validateOrder(g, id, side, units) : `Quantity must be a positive multiple of ${lot}`;
  const queuedErrOk = err?.startsWith('Insufficient') && !open; // cash may be converted before the open
  const fxr = g.external.myrPerUsd;
  const nav = navMYR(g);
  const posVal = positionValueMYR(g, id);
  const unreal = pos ? pos.units * g.market.quotes[id].price - pos.costMinor / 100 : 0;
  const unrealMYR = pos ? posVal - pos.costMYR / 100 : 0;
  const queued = g.fund.orders.filter((o) => o.ticker === id && o.status === 'queued');
  const byValue = (myr: number) => {
    const px = g.market.quotes[id].price * (c.exchange === 'US' ? fxr : 1);
    setUnits(Math.max(lot, Math.floor(myr / px / lot) * lot));
  };
  return (
    <Section title="Sovereign fund position & trade">
      {pos ? (
        <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
          <Stat label="Units held" value={num(pos.units)} sub={`${pct(posVal / nav)} of NAV`} />
          <Stat label="Value (MYR)" value={money(posVal)} sub={c.exchange === 'US' ? money(pos.units * g.market.quotes[id].price, 'USD') : undefined} />
          <Stat label={`Unrealised (${cur})`} value={money(unreal, cur)} tone={unreal >= 0 ? 'up' : 'down'} sub={pct(unreal / (pos.costMinor / 100), 1, true)} />
          {c.exchange === 'US' ? <Stat label="Unrealised (MYR, incl. FX)" value={money(unrealMYR)} tone={unrealMYR >= 0 ? 'up' : 'down'} sub={pct(unrealMYR / (pos.costMYR / 100), 1, true)} /> : <Stat label="Dividends received" value={money(pos.dividendsMinor / 100, cur)} />}
        </div>
      ) : (
        <div className="mb-3 text-[12px] text-slate-400">The SWF holds no {c.displayName} shares.</div>
      )}
      <div className="mb-2 flex items-center gap-2">
        <Tabs value={side} onChange={setSide} options={[{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' }]} />
        <input className="input num" type="number" min={lot} step={lot} value={units} onChange={(e) => setUnits(Math.max(0, Math.floor(Number(e.target.value))))} aria-label="Units" data-testid="trade-units" />
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {[25e6, 100e6, 250e6, 500e6].map((v) => (
          <button key={v} className="btn !px-2 !py-1 !text-[11px]" onClick={() => byValue(v)}>≈ RM {v / 1e6}m</button>
        ))}
        {pos && side === 'sell' && <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => setUnits(pos.units)}>All</button>}
      </div>
      {qf && (
        <div className="num mb-2 space-y-0.5 rounded-lg bg-slate-950/40 p-2 text-[12px]">
          <Row k="Est. execution price" v={`${price(qf.px, cur)} (mid ${price(qf.mid, cur)})`} />
          <Row k="Spread + impact" v={pct(Math.abs(qf.px / qf.mid - 1), 3)} />
          <Row k="Fees" v={money(qf.fees, cur, 2)} />
          <Row k={side === 'buy' ? 'Total cost' : 'Net proceeds'} v={`${money(qf.total, cur, 2)}${c.exchange === 'US' ? ` ≈ ${money(qf.totalMYR, 'MYR', 2)}` : ''}`} strong />
          <Row k={`Fund ${cur} cash`} v={money((c.exchange === 'US' ? g.fund.usdCash : g.fund.myrCash) / 100, cur)} />
        </div>
      )}
      {err && !queuedErrOk && <div className="mb-2 text-[12px] font-semibold text-rose-300" data-testid="trade-error">{err}</div>}
      {!open && (
        <div className="mb-2 text-[11.5px] text-amber-300">
          Market closed — the order will queue and fill at the next open session ({formatKL(nextOpen(c.exchange, minute)).weekday} {formatKL(nextOpen(c.exchange, minute)).time} MYT) at the then-current price. Expires after 7 days.
        </div>
      )}
      <button className={`btn w-full ${side === 'buy' ? 'btn-primary' : 'btn-danger'}`} disabled={!!err && !queuedErrOk} onClick={() => setConfirm(true)} data-testid="trade-review">
        Review {side} order
      </button>
      <div className="mt-1 text-[10.5px] text-slate-500">Limits: no leverage, no shorting, max {MAX_POSITION_PCT * 100}% of NAV per stock, ≤25% of daily liquidity per order, board lot {lot}.</div>
      {queued.length > 0 && (
        <div className="mt-2 space-y-1">
          {queued.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg bg-amber-400/10 px-2 py-1 text-[12px] text-amber-200">
              Queued {o.side} {num(o.units)}
              <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => command({ type: 'cancelOrder', id: o.id })}>Cancel</button>
            </div>
          ))}
        </div>
      )}
      {confirm && qf && (
        <ConfirmDialog
          title={`${side === 'buy' ? 'Buy' : 'Sell'} ${num(units)} ${c.displayName}`}
          confirmLabel={open ? `Confirm ${side}` : `Queue ${side} order`}
          danger={side === 'sell'}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            command({ type: 'placeOrder', ticker: id, side, units });
            setConfirm(false);
          }}
        >
          <div className="num space-y-1">
            <Row k="Execution" v={open ? 'Immediately at the current simulated price' : 'At the next open (price may differ)'} />
            <Row k="Est. price" v={price(qf.px, cur)} />
            <Row k="Fees + spread + impact" v={money(qf.fees + Math.abs(qf.px - qf.mid) * units, cur, 2)} />
            <Row k={side === 'buy' ? 'Total cost' : 'Net proceeds'} v={money(qf.total, cur, 2)} strong />
            {c.exchange === 'US' && <Row k="In MYR at today’s FX" v={money(qf.totalMYR, 'MYR', 2)} />}
            <p className="pt-2 text-[11.5px] text-slate-400">A share purchase converts fund cash into an equity asset: NAV changes only by costs. It does not create tax revenue.</p>
          </div>
        </ConfirmDialog>
      )}
    </Section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{k}</span>
      <span className={strong ? 'font-bold text-white' : 'text-slate-200'}>{v}</span>
    </div>
  );
}
