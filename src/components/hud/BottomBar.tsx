import { useMemo } from 'react';
import { daysInMonth, formatKL, klParts } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';

export function BottomBar() {
  const g = useGameState();
  const setPanel = useGame.getState().setPanel;
  const items = useMemo(() => g.news.slice(-14).reverse(), [g.news.length, g.news]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = klParts(g.clock.hour * 60);
  const daysLeft = daysInMonth(p.year, p.month) - p.day + 1;
  const monthsDone = g.reports.length;
  const text = items.map((n) => ({ ...n, when: formatKL(n.atMin) }));
  return (
    <footer className="glass pointer-events-auto flex h-11 items-center gap-3 overflow-hidden rounded-2xl pl-3 pr-2">
      <span className="chip shrink-0 bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">NEWS</span>
      <div className="relative min-w-0 flex-1 overflow-hidden" onClick={() => setPanel('reports')} role="button" title="Open reports & event log">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap text-[12.5px]">
          {[...text, ...text].map((n, i) => (
            <span key={`${n.id}-${i}`} className="text-slate-300">
              <span className="num mr-2 text-slate-500">{n.when.date.slice(0, 6)} {n.when.time}</span>
              <span className={n.tone === 'good' ? 'text-emerald-300' : n.tone === 'bad' ? 'text-rose-300' : 'text-slate-200'}>{n.title}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-l border-slate-600/40 pl-3 text-[11.5px] text-slate-400">
        <span title="Monthly accounts close automatically at midnight on the 1st">Month closes in <b className="num text-slate-200">{daysLeft}</b> day{daysLeft === 1 ? '' : 's'}</span>
        <span>Campaign <b className="num text-slate-200">{monthsDone}</b>/24 months</span>
      </div>
    </footer>
  );
}
