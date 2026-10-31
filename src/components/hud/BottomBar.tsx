import { Clock, SpeedControls } from './TopBar';
import { fullMoneyMinor, money } from '../../utils/format';
import { useMemo } from 'react';
import { daysInMonth, formatKL, klParts } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';

/** City-builder style bottom toolbar: time, news, approval and one money readout that opens the Economy window. */
export function BottomBar() {
  const g = useGameState();
  const setPanel = useGame.getState().setPanel;
  const panel = useGame((s) => s.panel);
  const items = useMemo(() => g.news.slice(-14).reverse(), [g.news.length, g.news]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = klParts(g.clock.hour * 60);
  const daysLeft = daysInMonth(p.year, p.month) - p.day + 1;
  const text = items.map((n) => ({ ...n, when: formatKL(n.atMin) }));
  // Treasury change over the last settled day (the money chip's "per day" trend).
  const d = g.daily;
  const perDay = d.length >= 2 ? d[d.length - 1].treasury - d[d.length - 2].treasury : 0;
  const approval = g.indicators.approval;
  const mood = approval >= 70 ? '😄' : approval >= 60 ? '🙂' : approval >= 45 ? '😐' : '☹️';
  return (
    <footer className="cs-bar pointer-events-auto" data-testid="stats">
      <div className="cs-time"><SpeedControls /><Clock /></div>
      <div className="cs-month" title="Monthly accounts close automatically at midnight on the 1st">
        <span>Month <b className="num">{Math.min(24, g.reports.length + 1)}</b>/24</span>
        <span>closes in <b className="num">{daysLeft}</b>d</span>
      </div>
      <button className="cs-ticker" onClick={() => setPanel('reports')} title="Open reports & event log">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap">
          {[...text, ...text].map((n, i) => (
            <span key={`${n.id}-${i}`}>
              <span className="num mr-2 text-slate-500">{n.when.date.slice(0, 6)} {n.when.time}</span>
              <span className={n.tone === 'good' ? 'text-emerald-300' : n.tone === 'bad' ? 'text-rose-300' : 'text-slate-200'}>{n.title}</span>
            </span>
          ))}
        </div>
      </button>
      <button className="cs-chip" onClick={() => useGame.getState().explain('approval')} title={`Approval ${approval.toFixed(0)}% · victory needs 60%`} data-testid="bottom-approval">
        <span aria-hidden>{mood}</span><b className="num">{approval.toFixed(0)}%</b>
      </button>
      <button className={`cs-money ${panel === 'finance' ? 'is-active' : ''}`} onClick={() => setPanel(panel === 'finance' ? null : 'finance')} aria-pressed={panel === 'finance'}
        title="Treasury balance (spendable government cash). Click for the full Economy window." data-testid="bottom-treasury">
        <span className="cs-coin" aria-hidden>RM</span>
        <b className="num">{fullMoneyMinor(g.government.treasury)}</b>
        <span className={`num cs-trend ${perDay < 0 ? 'down' : perDay > 0 ? 'up' : ''}`}>{perDay >= 0 ? '+' : '−'}{money(Math.abs(perDay))}/day</span>
      </button>
    </footer>
  );
}
