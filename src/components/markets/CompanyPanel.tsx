import { useMemo, useState } from 'react';
import { COMPANY_BY_ID, currencyOf } from '../../data/companies';
import { SECTORS } from '../../data/economic-baseline';
import { ttmNetIncome } from '../../engine/companies';
import { displayMinutes } from '../../engine/clock';
import { isOpen, nextOpen, sessionPhase } from '../../engine/market-calendar';
import { LOT, MAX_POSITION_PCT, navMYR, positionValueMYR, quoteFill, validateOrder } from '../../engine/sovereign-fund';
import { marketCap } from '../../engine/stock-market';
import { formatKL, klDayLabel, monthKeyLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import type { TickerId } from '../../types/game';
import { money, num, pct, price } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { ConfirmDialog } from '../panels/ConfirmDialog';
import { Bar, Section, SimTag, Stat, Tabs } from '../ui';

type Res = 'hour' | 'day' | 'month';

export function CompanyPanel({ id }: { id: TickerId }) {
  const g = useGameState();
  const rev = useGame((s) => s.rev);
  const c = COMPANY_BY_ID[id];
  const st = g.companies[id];
  const q = g.market.quotes[id];
  const cur = currencyOf(id);
  const [res, setRes] = useState<Res>('day');
  const select = useGame.getState().select;
  const minute = Math.floor(displayMinutes(g.clock));
  const phase = sessionPhase(c.exchange, minute);
  const chg = q.price / q.prevClose - 1;
  const ttm = ttmNetIncome(st);
  const eps = ttm / st.shares;
  const rev12 = st.history.slice(-12).reduce((a, h) => a + h.revenue, 0);
  const yieldPct = (st.history.slice(-12).reduce((a, h) => a + h.dividends, 0) / st.shares) / q.price;
  const events = g.events.active.filter((e) => e.ticker === id);

  const data = useMemo(() => {
    if (res === 'hour') return q.hourly.slice(-48).map((b) => ({ t: b.t, v: b.c }));
    if (res === 'day') return q.daily.slice(-130).map((b) => ({ t: b.t, v: b.c }));
    const byMonth = new Map<string, { t: number; v: number }>();
    for (const b of q.daily) {
      const d = new Date(b.t * 86400000);
      byMonth.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, { t: b.t, v: b.c });
    }
    return [...byMonth.values()];
  }, [res, q.hourly, q.daily, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const xFormat = (v: number | string) => {
    const n = Number(v);
    if (res === 'hour') return formatKL(n * 60).time;
    const d = new Date(n * 86400000);
    return res === 'month' ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };

  return (
    <aside className="glass pointer-events-auto flex max-h-full w-[400px] flex-col overflow-hidden rounded-2xl" data-testid="company-panel">
      <div className="border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="chip bg-slate-700/70 font-mono text-slate-200">{id}</span>
              <span className={`chip ${phase === 'open' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>{phase === 'open' ? 'OPEN' : phase === 'break' ? 'LUNCH BREAK' : 'CLOSED'}</span>
            </div>
            <h2 className="mt-1 truncate text-[18px] font-bold text-white" data-testid="company-name">{c.displayName}</h2>
            <div className="truncate text-[11.5px] text-slate-400">{c.legalName} · {c.industry}</div>
          </div>
          <button onClick={() => select(null)} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-white" aria-label="Close">✕</button>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="num text-[26px] font-bold text-white" data-testid="company-price">{price(q.price, cur)}</div>
          <div className={`num pb-1 text-[14px] font-semibold ${chg >= 0 ? 'up' : 'down'}`}>{chg >= 0 ? '+' : '−'}{Math.abs(chg * 100).toFixed(2)}%</div>
          <SimTag className="mb-1.5 ml-auto" />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Section title={`Price · ${cur}`} right={<Tabs value={res} onChange={setRes} options={[{ id: 'hour', label: 'Hour' }, { id: 'day', label: 'Day' }, { id: 'month', label: 'Month' }]} />}>
          <TimeChart data={data} xKey="t" series={[{ key: 'v', name: 'Close', color: chg >= 0 ? '#34d399' : '#f87171' }]} yFormat={(v) => v.toFixed(v < 10 ? 3 : 2)} xFormat={xFormat} area unit={`${cur} per share · ${res === 'hour' ? 'hourly (trading hours)' : res === 'day' ? 'daily close' : 'month-end close'}`} />
          {res === 'day' && <div className="mt-1 text-[10.5px] text-slate-500">History before 1 Jan 2027 is a synthetic seeded backfill.</div>}
        </Section>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-900/40 p-3">
          <Stat label="Market cap" value={money(marketCap(g, id), cur)} />
          <Stat label="P/E (TTM)" value={eps > 0 ? (q.price / eps).toFixed(1) : 'n/m'} />
          <Stat label="Div. yield" value={pct(yieldPct)} />
          <Stat label="Revenue TTM" value={money(rev12, cur)} />
          <Stat label="Net income TTM" value={money(ttm, cur)} tone={ttm < 0 ? 'down' : undefined} />
          <Stat label="Net margin" value={pct(ttm / rev12)} />
          <Stat label="Debt" value={money(st.debt, cur)} />
          <Stat label="Cash" value={money(st.cash, cur)} />
          <Stat label="Model value" value={price(q.fundamental, cur)} hint="Fundamental value from earnings × sector P/E × rate and risk multipliers" />
        </div>
        <Section title="Revenue exposure">
          {(['kl', 'my', 'global'] as const).map((k) => (
            <div key={k} className="mb-1.5 flex items-center gap-2 text-[12px]">
              <span className="w-24 text-slate-400">{k === 'kl' ? 'Kuala Lumpur' : k === 'my' ? 'Rest of Malaysia' : c.exchange === 'US' ? 'US / global' : 'International'}</span>
              <Bar value={c.exposure[k]} color={k === 'kl' ? '#34d399' : k === 'my' ? '#22d3ee' : '#a78bfa'} />
              <span className="num w-10 text-right">{pct(c.exposure[k], 0)}</span>
            </div>
          ))}
          <div className="mt-1 text-[11px] text-slate-500">KL corporate tax applies only to the KL share of profit. Sector: {SECTORS[c.sector].name}; global driver: {c.driver}.</div>
        </Section>
        <Section title="Monthly results (fictional)">
          <table className="data num">
            <thead>
              <tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">EBITDA</th><th className="text-right">Net</th><th className="text-right">KL tax</th></tr>
            </thead>
            <tbody>
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
        <Section title="Location">
          {c.geo ? (
            <div className="text-[12.5px]">
              <div className="text-slate-200">{c.geo.label}</div>
              <div className="text-slate-400">Type: {c.geo.locationType.toUpperCase()} · Source: {c.geo.verificationSource}</div>
            </div>
          ) : (
            <div className="text-[12.5px] text-slate-400">No verified Kuala Lumpur location — tradable, but not placed on the map.</div>
          )}
        </Section>
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
