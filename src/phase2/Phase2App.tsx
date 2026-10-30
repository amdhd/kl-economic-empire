import { useCallback, useEffect, useState } from 'react';
import { ExchangeStatusChips } from '../components/markets/ExchangeStatusChips';
import { MarketBrowser, type MarketTab } from '../components/markets/MarketBrowser';
import { SecurityDetail } from '../components/markets/SecurityDetail';
import { COMPANY_BY_ID } from '../data/companies';
import { formatKL } from '../engine/time';
import type { GameSpeed, TickerId } from '../types/game';
import { setPaused, setSpeed, startLoop, useGame } from './game-loop';
import { MarkerMap } from './MarkerMap';

/** Phase 2 harness: clock controls + market browser + security detail + marker map. */
export function Phase2App() {
  const { game, rev, minute, paused, speed } = useGame();
  const [tab, setTab] = useState<MarketTab>('MY');
  const [view, setView] = useState<'markets' | 'map'>('markets');
  const [selected, setSelected] = useState<TickerId | null>('MY:1155');
  useEffect(() => startLoop(), []);
  const t = formatKL(Math.floor(minute));
  const openCompany = useCallback((id: TickerId) => {
    setSelected(id);
    setTab(COMPANY_BY_ID[id].exchange);
    setView('markets');
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-2">
        <span className="text-sm font-bold tracking-wide text-white">KL ECONOMIC EMPIRE</span>
        <span className="text-[10px] uppercase tracking-wider text-amber-300/80">Markets · simulated</span>
        <span className="font-mono text-sm tabular-nums text-slate-100" data-testid="game-clock">
          {t.weekday} {t.date} {t.time} MYT
        </span>
        <div className="flex gap-1" aria-label="Game speed">
          <button onClick={() => setPaused(!paused)} aria-pressed={paused} className={`rounded-md px-2 py-1 text-xs ${paused ? 'bg-amber-500/25 text-amber-200' : 'bg-white/5'}`} title="Pause / resume (Space)">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          {([1, 2, 3] as GameSpeed[]).map((sp) => (
            <button key={sp} onClick={() => setSpeed(sp)} aria-pressed={!paused && speed === sp} className={`rounded-md px-2 py-1 text-xs ${!paused && speed === sp ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5'}`} title={`Speed ${sp}× (key ${sp})`}>
              {sp}×
            </button>
          ))}
        </div>
        <ExchangeStatusChips game={game} nowMin={minute} />
        <div className="ml-auto flex rounded-lg bg-white/5 p-0.5">
          {(['markets', 'map'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-md px-3 py-1 text-xs capitalize ${view === v ? 'bg-white/15 text-white' : 'text-slate-400'}`}>
              {v === 'map' ? 'KL map' : 'Markets'}
            </button>
          ))}
        </div>
      </header>
      <main className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-[3] border-r border-white/10">
          {view === 'markets' ? <MarketBrowser game={game} rev={rev} tab={tab} onTab={setTab} selected={selected} onSelect={setSelected} /> : <MarkerMap onSelect={openCompany} />}
        </div>
        <aside className="min-w-0 flex-[2] overflow-auto p-4">
          {selected ? <SecurityDetail key={selected} game={game} id={selected} nowMin={minute} /> : <p className="text-sm text-slate-400">Select a security.</p>}
        </aside>
      </main>
    </div>
  );
}
