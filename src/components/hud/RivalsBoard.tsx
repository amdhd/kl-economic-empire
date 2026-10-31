import { peerWindow } from '../../engine/standing';
import { useGame } from '../../store/game-store';

const usd = (bn: number) => (bn >= 1000 ? `$${(bn / 1000).toFixed(2)}tn` : `$${bn.toFixed(0)}bn`);
const gap = (bn: number) => `${bn > 0 ? '+' : '−'}${usd(Math.abs(bn))}`;

/** Always-visible mini leaderboard (D-085): the two economies above Malaysia, Malaysia, the two below. */
export function RivalsBoard() {
  useGame((s) => s.rev);
  const g = useGame.getState().game;
  if (!g.fdi?.enabled) return null;
  const rows = peerWindow(g);
  const me = rows.find((r) => r.isMalaysia)!;
  return (
    <button className="glass pointer-events-auto w-[272px] rounded-xl p-2 text-left" onClick={() => useGame.getState().setPanel('standing')} title="Open Global standing" data-testid="rivals-board" aria-label="Nearest rival economies by GDP in dollars">
      <div className="mb-1 flex items-center justify-between px-1"><span className="label">GDP rank · nearest rivals</span><span className="num text-[11px] text-slate-400">#{me.rank}</span></div>
      <table className="w-full text-[12px]">
        <thead><tr className="text-left text-[10.5px] text-slate-500"><th className="w-6 font-normal">#</th><th className="font-normal">Economy</th><th className="text-right font-normal">GDP</th><th className="text-right font-normal">vs you</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className={r.isMalaysia ? 'rounded bg-emerald-400/15 font-semibold text-white' : 'text-slate-300'} data-testid={`rival-${r.id}`}>
            <td className="num py-0.5 pl-1">{r.rank}</td>
            <td className="truncate">{r.flag} {r.isMalaysia ? 'Malaysia' : r.name}</td>
            <td className="num text-right">{usd(r.gdpUsd)}</td>
            <td className={`num pr-1 text-right ${r.isMalaysia ? '' : r.gdpUsd > me.gdpUsd ? 'text-amber-300' : 'text-emerald-300'}`}>{r.isMalaysia ? '—' : gap(r.gdpUsd - me.gdpUsd)}</td>
          </tr>
        ))}</tbody>
      </table>
    </button>
  );
}
