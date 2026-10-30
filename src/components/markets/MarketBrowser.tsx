import { useMemo, useState } from 'react';
import { SECTOR_IDS, SECTORS } from '../../data/economic-baseline';
import { filterRows, fxView, indexSeries, indexView, securityRows, type SortKey } from '../../engine/market-view';
import { FX_SPREAD } from '../../engine/sovereign-fund';
import type { Exchange, GameState, SectorId, TickerId } from '../../types/game';
import { fx, money, num, pct, sharePrice } from '../../utils/format';
import { PriceChart, Sparkline } from './PriceChart';

export type MarketTab = 'MY' | 'US' | 'FX';

const TABS: { id: MarketTab; label: string }[] = [
  { id: 'MY', label: 'Malaysia 20' },
  { id: 'US', label: 'US 20' },
  { id: 'FX', label: 'FX' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'default', label: 'Default order' },
  { id: 'gainers', label: 'Top gainers (day)' },
  { id: 'losers', label: 'Top losers (day)' },
  { id: 'month', label: 'Best 1M' },
  { id: 'cap', label: 'Market cap' },
  { id: 'name', label: 'Name A–Z' },
];

const changeCls = (x: number) => (x > 0 ? 'text-emerald-300' : x < 0 ? 'text-rose-300' : 'text-slate-400');

function IndexCard({ game, ex }: { game: GameState; ex: Exchange }) {
  const v = indexView(game, ex);
  const series = indexSeries(game, ex).slice(-60).map((p) => p.v);
  return (
    <div className="market-index min-w-0 flex-1" data-testid={`index-${ex}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] uppercase tracking-wider text-slate-400">{v.name}</span>
        <span className="text-[10px] text-slate-500">fictional</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-white">{num(v.value, 2)}</span>
        <span className={`text-xs tabular-nums ${changeCls(v.change)}`}>{pct(v.change, 2, true)}</span>
      </div>
      <div className="market-index-chart"><Sparkline values={series} height={28} /></div>
    </div>
  );
}

function FxPane({ game }: { game: GameState }) {
  const f = fxView(game);
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="fx-pane">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">USD / MYR</div>
          <div className="text-xl font-semibold tabular-nums text-white">{fx(f.myrPerUsd)}</div>
          <div className={`text-xs ${changeCls(f.change)}`}>{pct(f.change, 2, true)} vs last daily fix</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">MYR / USD</div>
          <div className="text-xl font-semibold tabular-nums text-white">{fx(f.usdPerMyr)}</div>
          <div className="text-xs text-slate-500">US$ per RM 1</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Conversion spread</div>
          <div className="text-xl font-semibold tabular-nums text-white">{pct(FX_SPREAD, 2)}</div>
          <div className="text-xs text-slate-500">charged on SWF conversions</div>
        </div>
      </div>
      {f.history.length >= 2 ? (
        <PriceChart points={f.history.map((p) => ({ t: p.t, label: p.label, o: p.v, h: p.v, l: p.v, c: p.v, v: 0 }))} currency="MYR" resolution="day" height={200} title="USD/MYR · daily fix · simulated" unit="RM per US$" decimals={4} />
      ) : (
        <div className="rounded-lg border border-white/10 p-6 text-center text-xs text-slate-400">The daily FX fix is recorded at each KL midnight. History appears after the first game day.</div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500">
        The ringgit rate is a fictional simulation driven by rate differentials, oil and global risk appetite. It moves US holdings’ MYR value but never changes US share quantities.
      </p>
    </div>
  );
}

/** Market browser: Malaysia / US tables with search, sector filter and sorting, plus an FX tab. */
export function MarketBrowser({
  game,
  rev,
  tab,
  onTab,
  selected,
  onSelect,
}: {
  game: GameState;
  rev: number;
  tab: MarketTab;
  onTab: (t: MarketTab) => void;
  selected: TickerId | null;
  onSelect: (id: TickerId) => void;
}) {
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState<SectorId | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('default');
  // `rev` changes on every economic tick; the engine mutates `game` in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => securityRows(game), [game, rev]);
  // A non-empty search spans both markets so a ticker can be found from either tab.
  const searching = query.trim().length > 0;
  const rows = tab === 'FX' ? [] : filterRows(all, { query, sector, sort, exchange: searching ? 'ALL' : tab });

  return (
    <div className="market-browser">
      <div className="market-indices flex gap-2">
        <IndexCard game={game} ex="MY" />
        <IndexCard game={game} ex="US" />
      </div>
      <div className="market-toolbar flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Market">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${tab === t.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'FX' && (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or company…"
              aria-label="Search ticker"
              className="min-w-40 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50"
            />
            <select aria-label="Sector filter" value={sector} onChange={(e) => setSector(e.target.value as SectorId | 'ALL')} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200">
              <option value="ALL">All sectors</option>
              {SECTOR_IDS.map((sid) => (
                <option key={sid} value={sid}>
                  {SECTORS[sid].short}
                </option>
              ))}
            </select>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200">
              {SORTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {tab === 'FX' ? (
        <div className="market-fx-scroll scroll-thin"><FxPane game={game} /></div>
      ) : (
        <div className="market-table-scroll scroll-thin" role="region" aria-label="Company list" tabIndex={0} data-testid="company-list-scroll">
          {searching && <div className="px-2 pb-1 text-[11px] text-slate-500">Searching both markets</div>}
          <table className="w-full whitespace-nowrap text-xs" data-testid="security-table">
            <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Ticker</th>
                <th className="px-2 py-1.5 text-left font-medium">Company</th>
                <th className="px-2 py-1.5 text-right font-medium">Price</th>
                <th className="px-2 py-1.5 text-right font-medium">Day</th>
                <th className="px-2 py-1.5 text-right font-medium">1M</th>
                <th className="px-2 py-1.5 text-right font-medium">P/E</th>
                <th className="px-2 py-1.5 text-right font-medium">Yield</th>
                <th className="px-2 py-1.5 text-right font-medium">Mkt cap</th>
                <th className="px-2 py-1.5 text-right font-medium">Market</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-testid="security-row"
                  data-ticker={r.id}
                  onClick={() => onSelect(r.id)}
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${selected === r.id ? 'bg-emerald-500/10' : ''}`}
                >
                  <td className="px-2 py-1.5 font-mono text-[11px] text-slate-400">{r.id}</td>
                  <td className="max-w-40 truncate px-2 py-1.5 text-slate-100" title={r.legalName}>
                    {r.name}
                    {r.hasKlLocation && <span className="ml-1 text-emerald-400/70" title="Has a verified KL map location">◆</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-100" data-testid="row-price">
                    {sharePrice(r.price, r.currency)}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${changeCls(r.dayChange)}`}>{pct(r.dayChange, 2, true)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${changeCls(r.monthChange)}`}>{pct(r.monthChange, 1, true)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{Number.isFinite(r.pe) ? num(r.pe, 1) : 'n/m'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{pct(r.dividendYield, 1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{money(r.marketCap, r.currency)}</td>
                  <td className={`px-2 py-1.5 text-right text-[10px] font-semibold ${r.open ? 'text-emerald-300' : 'text-slate-500'}`}>{r.open ? 'OPEN' : 'CLOSED'}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-center text-slate-500">
                    No securities match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="market-disclaimer border-t border-white/5 px-3 py-1.5 text-[10px] text-slate-500">
        Real company names and tickers for context only. All prices, financials and indices are fictional simulations — not market data or investment advice.
      </div>
    </div>
  );
}
