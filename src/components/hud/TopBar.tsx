import { MapAppearance } from './MapAppearance';
import { displayMinutes, SPEEDS } from '../../engine/clock';
import { EXCHANGES, nextOpen, sessionPhase } from '../../engine/market-calendar';
import { formatKL } from '../../engine/time';
import { useGame } from '../../store/game-store';
import type { Exchange } from '../../types/game';
import { SaveMenu } from './SaveMenu';
import { HudIcon } from './HudIcon';
import { Districts } from './Districts';

export function Clock() {
  const minute = useGame((s) => s.uiMinute || displayMinutes(s.game.clock));
  const paused = useGame((s) => s.game.clock.paused);
  useGame((s) => s.rev);
  const f = formatKL(minute);
  return (
    <div className="flex items-baseline gap-2" data-testid="clock">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{f.weekday}</span>
      <span className="num text-[15px] font-semibold text-slate-100" data-testid="clock-date">{f.date}</span>
      <span className={`num font-mono text-[22px] font-bold tracking-tight ${paused ? 'text-amber-300' : 'text-white'}`} data-testid="clock-time">{f.time}</span>
      <span className="text-[10.5px] font-semibold text-slate-400">MYT</span>
    </div>
  );
}

export function SpeedControls() {
  const speed = useGame((s) => s.game.clock.speed);
  const paused = useGame((s) => s.game.clock.paused);
  const ended = useGame((s) => s.game.scheduler.campaignEnded);
  useGame((s) => s.rev);
  const skipping = useGame((s) => s.skip !== null);
  const canUndo = useGame((s) => s.undoSnapshot !== null);
  const { setSpeed, togglePause, startSkip, undoSkip } = useGame.getState();
  const canSkip = paused && !ended && !skipping;
  const btn = (active: boolean) => `h-8 min-w-9 rounded-lg px-2 text-[13px] font-bold transition ${active ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_14px_rgba(52,211,153,0.45)]' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'}`;
  const skipBtn = 'h-8 rounded-lg bg-slate-800/80 px-2 text-[12px] font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-1 rounded-xl bg-slate-900/60 p-1 ring-1 ring-slate-600/30" role="group" aria-label="Game speed">
      <button className={btn(paused)} onClick={togglePause} disabled={ended} title="Pause / resume (Space)" data-testid="btn-pause" aria-pressed={paused}>
        {paused ? '▶' : '⏸'}
      </button>
      {SPEEDS.map((sp) => (
        <button key={sp} className={btn(!paused && speed === sp)} onClick={() => setSpeed(sp)} disabled={ended} title={`${sp}× — ${sp * 20} game minutes per real second (key ${sp})`} data-testid={`btn-speed-${sp}`}>
          {sp}×
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-slate-600/50" aria-hidden />
      <button className={skipBtn} onClick={() => startSkip('days15')} disabled={!canSkip} title={canSkip ? 'Run 15 game days, one day per frame. Stops early for critical alerts, decisions and the term end. Press Pause to cancel.' : 'Pause the game to skip time'} data-testid="btn-skip-15">Skip 15 days</button>
      <button className={skipBtn} onClick={() => startSkip('monthClose')} disabled={!canSkip} title={canSkip ? 'Run to the next month close. Stops early for critical alerts, decisions and the term end. Press Pause to cancel.' : 'Pause the game to skip time'} data-testid="btn-skip-month">Skip to month close</button>
      {skipping && <span className="px-1 text-[11.5px] font-semibold text-amber-300" role="status" data-testid="skip-running">Skipping… press ⏸ to cancel</span>}
      {canUndo && paused && !skipping && <button className={skipBtn} onClick={undoSkip} title="Restore the state from just before the last skip" data-testid="btn-skip-undo">Undo skip</button>}
    </div>
  );
}

function MarketChip({ ex }: { ex: Exchange }) {
  const minute = useGame((s) => Math.floor((s.uiMinute || displayMinutes(s.game.clock)) / 5) * 5);
  const phase = sessionPhase(ex, minute);
  const open = phase === 'open';
  const label = ex === 'MY' ? 'Bursa' : 'NYSE';
  const nxt = open ? null : formatKL(nextOpen(ex, minute));
  const tip = `${EXCHANGES[ex].name} · ${EXCHANGES[ex].hours}${nxt ? ` · next open ${nxt.weekday} ${nxt.time} MYT` : ''}`;
  return (
    <span className={`chip ${open ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-500/30'}`} title={tip} data-testid={`market-${ex}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'pulse bg-emerald-400' : phase === 'break' ? 'bg-amber-400' : 'bg-slate-500'}`} />
      {label} {open ? 'OPEN' : phase === 'break' ? 'LUNCH' : 'CLOSED'}
    </span>
  );
}

export function TopBar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const { setShowNewGame, setShowHelp } = useGame.getState();
  return (
    <header className="top-hud flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <button className={`info-toggle pointer-events-auto ${menuOpen ? 'is-active' : ''}`} aria-label="Info views" aria-expanded={menuOpen} aria-controls="info-categories" data-testid="info-views" onClick={onToggleMenu}><HudIcon name="info" size={28} /></button>
        <div className="city-title"><b>KL ECONOMIC EMPIRE</b><span>Malaysia economy · KL map · fictional simulation</span></div>
      </div>
      <div className="flex items-center gap-2 pointer-events-auto">
        <MapAppearance />
        <Districts />
        <div className="exchange-chips flex gap-1"><MarketChip ex="MY" /><MarketChip ex="US" /></div>
        <SaveMenu />
        <button className="btn" onClick={() => useGame.getState().setPanel('settings')} data-testid="btn-settings">Alerts & settings</button>
        <button className="btn" onClick={() => setShowNewGame(true)} data-testid="btn-new-game">New</button>
        <button className="btn" onClick={() => setShowHelp(true)} aria-label="Help & shortcuts" title="Help & shortcuts (?)">?</button>
      </div>
    </header>
  );
}
