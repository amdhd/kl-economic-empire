import { displayMinutes } from '../../engine/clock';
import { EXCHANGES, nextOpen, sessionPhase } from '../../engine/market-calendar';
import { formatKL } from '../../engine/time';
import { useGame } from '../../store/game-store';
import type { Exchange, GameSpeed } from '../../types/game';
import { SaveMenu } from './SaveMenu';

function Clock() {
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

function SpeedControls() {
  const speed = useGame((s) => s.game.clock.speed);
  const paused = useGame((s) => s.game.clock.paused);
  const ended = useGame((s) => s.game.scheduler.campaignEnded);
  useGame((s) => s.rev);
  const { setSpeed, togglePause } = useGame.getState();
  const btn = (active: boolean) => `h-8 min-w-9 rounded-lg px-2 text-[13px] font-bold transition ${active ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_14px_rgba(52,211,153,0.45)]' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'}`;
  return (
    <div className="flex items-center gap-1 rounded-xl bg-slate-900/60 p-1 ring-1 ring-slate-600/30" role="group" aria-label="Game speed">
      <button className={btn(paused)} onClick={togglePause} disabled={ended} title="Pause / resume (Space)" data-testid="btn-pause" aria-pressed={paused}>
        {paused ? '▶' : '⏸'}
      </button>
      {([1, 2, 3] as GameSpeed[]).map((sp) => (
        <button key={sp} className={btn(!paused && speed === sp)} onClick={() => setSpeed(sp)} disabled={ended} title={`${sp}× — ${sp * 20} game minutes per real second (key ${sp})`} data-testid={`btn-speed-${sp}`}>
          {sp}×
        </button>
      ))}
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

export function TopBar() {
  const { setShowNewGame, setShowHelp } = useGame.getState();
  return (
    <header className="glass pointer-events-auto relative z-30 flex h-14 items-center gap-4 rounded-2xl px-4">
      <div className="flex items-center gap-2.5 pr-2">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#0f172a" />
          <path d="M8 26V12l4-3v17M14 26V6l4 2v18M20 26V14l4 2v10" stroke="#34d399" strokeWidth="2" fill="none" />
        </svg>
        <div className="leading-tight">
          <div className="text-[13px] font-extrabold tracking-[0.14em] text-white">KL ECONOMIC EMPIRE</div>
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300/80">Alternate-history simulation</div>
        </div>
      </div>
      <div className="h-8 w-px bg-slate-600/40" />
      <Clock />
      <SpeedControls />
      <div className="flex items-center gap-1.5">
        <MarketChip ex="MY" />
        <MarketChip ex="US" />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <SaveMenu />
        <button className="btn" onClick={() => setShowNewGame(true)} data-testid="btn-new-game">New</button>
        <button className="btn" onClick={() => setShowHelp(true)} title="Help & shortcuts (?)">?</button>
      </div>
    </header>
  );
}
