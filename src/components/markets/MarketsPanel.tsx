import { useMemo, useState } from 'react';
import { COMPANIES, currencyOf } from '../../data/companies';
import { SECTORS } from '../../data/economic-baseline';
import { ttmNetIncome } from '../../engine/companies';
import { displayMinutes } from '../../engine/clock';
import { EXCHANGES, sessionPhase } from '../../engine/market-calendar';
import { marketCap } from '../../engine/stock-market';
import { klDayLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import type { Exchange } from '../../types/game';
import { money, pct, price } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { PanelShell } from '../panels/PanelShell';
import { Section, Tabs } from '../ui';

type Sort = 'cap' | 'day' | 'month' | 'pe' | 'yield';

export function MarketsPanel() {
  const g = useGameState();
  const rev = useGame((s) => s.rev);
  const selection = useGame((s) => s.selection);
  const select = useGame.getState().select;
  const [ex, setEx] = useState<Exchange>('MY');
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('all');
  const [sort, setSort] = useState<Sort>('cap');
  const [onlyHeld, setOnlyHeld] = useState(false);
  const minute = Math.floor(displayMinutes(g.clock));

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return COMPANIES.filter((c) => c.exchange === ex)
      .filter((c) => !term || c.displayName.toLowerCase().includes(term) || c.id.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term))
      .filter((c) => sector === 'all' || c.sector === sector)
      .filter((c) => !onlyHeld || g.fund.positions[c.id])
      .map((c) => {
        const qt = g.market.quotes[c.id];
        const st = g.companies[c.id];
        const m = qt.daily.at(-21)?.c ?? qt.daily[0]?.c ?? qt.price;
        const eps = ttmNetIncome(st) / st.shares;
        const dps = st.history.slice(-12).reduce((a, h) => a + h.dividends, 0) / st.shares;
        return { c, price: qt.price, day: qt.price / qt.prevClose - 1, month: qt.price / m - 1, pe: eps > 0 ? qt.price / eps : Infinity, yield: dps / qt.price, cap: marketCap(g, c.id) };
      })
      .sort((a, b) => (sort === 'pe' ? a.pe - b.pe : (b[sort] as number) - (a[sort] as number)));
  }, [g, rev, ex, q, sector, sort, onlyHeld]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = g.market.indices[ex];
  const phase = sessionPhase(ex, minute);
  const idxChg = idx.value / idx.prevClose - 1;
  return (
    <PanelShell title="Stock markets" subtitle={`${EXCHANGES[ex].name} · ${EXCHANGES[ex].hours} · ${phase === 'open' ? 'OPEN' : phase === 'break' ? 'lunch break' : 'closed — last close shown'}`} width={700}>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={ex} onChange={(v) => { setEx(v); setSector('all'); }} options={[{ id: 'MY', label: 'Malaysia 20 (MYR)' }, { id: 'US', label: 'US 20 (USD)' }]} />
        <input className="input !w-44" placeholder="Search ticker or name…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="market-search" />
        <select className="input !w-40" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector filter">
          <option value="all">All sectors</option>
          {Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
        </select>
        <select className="input !w-36" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="cap">Largest</option>
          <option value="day">Day winners</option>
          <option value="month">1M winners</option>
          <option value="pe">Cheapest P/E</option>
          <option value="yield">Highest yield</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-300"><input type="checkbox" checked={onlyHeld} onChange={(e) => setOnlyHeld(e.target.checked)} /> SWF holdings</label>
      </div>
      <Section title={ex === 'MY' ? 'KL Economic Stock Index (fictional, cap-weighted)' : 'US Game Index (fictional, cap-weighted)'} right={<span className={`num text-[13px] font-semibold ${idxChg >= 0 ? 'up' : 'down'}`}>{idx.value.toFixed(1)} ({pct(idxChg, 2, true)})</span>}>
        <TimeChart data={idx.daily.slice(-160).map((d) => ({ t: d.t, v: d.v }))} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'v', name: 'Index', color: ex === 'MY' ? '#34d399' : '#60a5fa' }]} yFormat={(v) => v.toFixed(0)} unit="Index points · daily close (base 1000 at game start)" height={120} area />
        <div className="mt-1 text-[10.5px] text-slate-500">Not the FTSE Bursa Malaysia KLCI or S&amp;P 500 — game indices of the 20 featured names only.</div>
      </Section>
      <div className="max-h-[420px] overflow-auto rounded-xl ring-1 ring-slate-700/40 scroll-thin">
        <table className="data num" data-testid="market-table">
          <thead>
            <tr><th>Ticker</th><th>Company</th><th className="text-right">Price</th><th className="text-right">Day</th><th className="text-right">1M</th><th className="text-right">P/E</th><th className="text-right">Yield</th><th className="text-right">Mkt cap</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.c.id} className={`row ${selection?.kind === 'company' && selection.id === r.c.id ? 'sel' : ''}`} onClick={() => select({ kind: 'company', id: r.c.id })} data-testid={`row-${r.c.id}`}>
                <td className="font-mono text-[11.5px] text-slate-300">{r.c.id}{g.fund.positions[r.c.id] ? ' •' : ''}</td>
                <td className="max-w-[170px] truncate">{r.c.displayName}{r.c.geo ? ' 📍' : ''}</td>
                <td className="text-right">{price(r.price, currencyOf(r.c.id))}</td>
                <td className={`text-right ${r.day >= 0 ? 'up' : 'down'}`}>{pct(r.day, 2, true)}</td>
                <td className={`text-right ${r.month >= 0 ? 'up' : 'down'}`}>{pct(r.month, 1, true)}</td>
                <td className="text-right">{Number.isFinite(r.pe) ? r.pe.toFixed(1) : 'n/m'}</td>
                <td className="text-right">{pct(r.yield)}</td>
                <td className="text-right">{money(r.cap, currencyOf(r.c.id), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500">📍 = verified KL location on the map · • = held by the SWF. Click a row for the price chart, fictional financials and the trade ticket.</div>
    </PanelShell>
  );
}
