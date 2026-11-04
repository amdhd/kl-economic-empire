import { POLL_GROUPS, VOICES } from '../../data/voices';
import { groupPolls, previousPolls } from '../../engine/reactions';
import { formatKL, klDayStartMin } from '../../engine/time';
import { useGameState } from '../../store/game-store';
import { Bar } from '../ui';
import { PanelShell } from './PanelShell';

const STANCE = { for: { text: 'In favour', cls: 'text-emerald-300' }, against: { text: 'Against', cls: 'text-rose-300' }, warn: { text: 'Cautious', cls: 'text-amber-200' } } as const;
const tone = (v: number) => (v >= 65 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171');

/** Public mood (D-146): group polls and what the fictional public figures are saying. Display only. */
export function PeoplePanel() {
  const g = useGameState();
  const polls = groupPolls(g);
  const prev = previousPolls(g);
  const quotes = [...(g.reactions?.quotes ?? [])].reverse().slice(0, 12);
  return <PanelShell title="Public mood" subtitle="Group polls and public reactions · fictional people, simulated opinion" width={470}>
    <section className="inspector-section" data-testid="group-polls">
      <h3>POLLS BY GROUP</h3>
      <p className="mb-2 text-[11.5px] text-slate-400">Each group weighs jobs, income, housing costs, services, trust and stability differently, and reacts to the policies that touch it. Your overall approval ({g.indicators.approval.toFixed(0)}%) is still the national figure.</p>
      {POLL_GROUPS.map(({ id, label, who }) => {
        const p = polls[id];
        const change = prev ? p.value - prev[id] : undefined;
        return <div key={id} className="mb-3" data-testid={`poll-${id}`}>
          <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
            <span><b>{label}</b> <span className="text-slate-500">· {who}</span></span>
            <span className="num font-bold">{p.value.toFixed(0)}%{change !== undefined && Math.abs(change) >= 0.5 && <span className={`ml-1 text-[11px] ${change > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{change > 0 ? '▲' : '▼'}{Math.abs(change).toFixed(0)}</span>}</span>
          </div>
          <Bar value={p.value} max={100} color={tone(p.value)} />
          {p.drivers.length > 0 && <div className="mt-0.5 text-[11px] text-slate-400">{p.drivers.map((d, i) => <span key={d.label}>{i > 0 && ' · '}<span className={d.points >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}>{d.label} {d.points >= 0 ? '+' : '−'}{Math.abs(d.points).toFixed(0)}</span></span>)}</div>}
        </div>;
      })}
      <p className="text-[11px] text-slate-500">Points are against a neutral 60 for conditions and against the opening settings for policies.</p>
    </section>
    <section className="inspector-section" data-testid="voice-quotes">
      <h3>WHAT PEOPLE ARE SAYING</h3>
      {quotes.length === 0
        ? <p className="text-[12px] text-slate-400">No reactions yet. Public figures respond on Mondays to decisions you make and to big moves in prices, jobs, housing and markets.</p>
        : <ul className="space-y-2.5">{quotes.map((q, i) => {
          const v = VOICES[q.voice];
          return <li key={`${q.day}-${q.topic}-${q.voice}-${i}`} className="text-[12.5px]">
            <div className="text-slate-100">“{q.text}”</div>
            <div className="mt-0.5 text-[11px] text-slate-400"><b className="text-slate-300">{v.name}</b>, {v.role} · <span className={STANCE[q.stance].cls}>{STANCE[q.stance].text}</span> · {formatKL(klDayStartMin(q.day)).date}</div>
          </li>;
        })}</ul>}
      <p className="mt-2 text-[11px] text-slate-500">Every person and organisation quoted is fictional, and no quote is a real statement.</p>
    </section>
  </PanelShell>;
}
