import { EXCHANGES } from '../../engine/market-calendar';
import { exchangeStatus, fxView } from '../../engine/market-view';
import { formatKL } from '../../engine/time';
import type { Exchange, GameState } from '../../types/game';
import { fx, pct } from '../../utils/format';

/** KL time + each exchange's local time and open/closed status, plus the fictional MYR/USD rate. */
export function ExchangeStatusChips({ game, nowMin }: { game: GameState; nowMin: number }) {
  const kl = formatKL(Math.floor(nowMin));
  const f = fxView(game);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-md bg-white/5 px-2 py-1 text-slate-300" data-testid="kl-time">
        KL {kl.weekday} {kl.time} MYT
      </span>
      {(['MY', 'US'] as Exchange[]).map((ex) => {
        const st = exchangeStatus(ex, Math.floor(nowMin));
        return (
          <span
            key={ex}
            data-testid={`status-${ex}`}
            data-open={st.open}
            title={`${EXCHANGES[ex].name} · ${EXCHANGES[ex].hours} · ${st.nextChangeLabel}`}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${st.open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-400'}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${st.open ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <b className="font-semibold">{ex === 'MY' ? 'Bursa' : 'US'}</b> {st.label}
            <span className="text-slate-500">
              {st.localTime} {st.tz}
            </span>
          </span>
        );
      })}
      <span className="rounded-md bg-white/5 px-2 py-1 text-slate-300" data-testid="fx-chip" title="Fictional simulated exchange rate">
        USD/MYR {fx(f.myrPerUsd)}{' '}
        <span className={f.change >= 0 ? 'text-amber-300' : 'text-sky-300'}>{pct(f.change, 2, true)}</span>
      </span>
    </div>
  );
}
