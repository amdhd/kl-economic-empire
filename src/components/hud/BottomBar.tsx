import { Clock, SpeedControls } from './TopBar';
import { fullMoneyMinor } from '../../utils/format';
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
    <footer className="bottom-bar pointer-events-auto">
      <div className="time-controls"><SpeedControls /><Clock /></div>
      <span className="news-label">CITY WIRE</span>
      <button className="news-ticker relative min-w-0 overflow-hidden text-left" onClick={() => setPanel('reports')} title="Open reports & event log">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap text-[12.5px]">
          {[...text, ...text].map((n, i) => (
            <span key={`${n.id}-${i}`} className="text-slate-300">
              <span className="num mr-2 text-slate-500">{n.when.date.slice(0, 6)} {n.when.time}</span>
              <span className={n.tone === 'good' ? 'text-emerald-300' : n.tone === 'bad' ? 'text-rose-300' : 'text-slate-200'}>{n.title}</span>
            </span>
          ))}
        </div>
      </button>
      <div className="cash-status flex max-w-full flex-wrap items-center gap-4 text-[11.5px] text-slate-400">
        <button className="text-left" onClick={() => setPanel('debt')} title="Spendable government cash · open Treasury & debt" data-testid="bottom-treasury">
          <span className="block text-[10px] uppercase tracking-wider">Treasury balance</span>
          <b className="num whitespace-nowrap text-[13px] text-emerald-200">{fullMoneyMinor(g.government.treasury)}</b>
        </button>
        <button className="text-left" onClick={() => setPanel('fund')} title="Fund cash is separate from treasury · holdings excluded" data-testid="bottom-fund-cash">
          <span className="block text-[10px] uppercase tracking-wider">SWF cash · MYR / USD</span>
          <b className="num whitespace-nowrap text-slate-200">{fullMoneyMinor(g.fund.myrCash)} · {fullMoneyMinor(g.fund.usdCash, 'USD')}</b>
        </button>
        <span title="Monthly accounts close automatically at midnight on the 1st">Month closes in <b className="num text-slate-200">{daysLeft}</b> day{daysLeft === 1 ? '' : 's'}</span>
        <span>Campaign <b className="num text-slate-200">{monthsDone}</b>/24 months</span>
      </div>
    </footer>
  );
}
