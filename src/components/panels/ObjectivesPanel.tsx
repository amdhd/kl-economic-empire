import { SCORE_WEIGHTS, VICTORY, outcomeLabel, publicNetWorth } from '../../engine/indicators';
import { navMYR } from '../../engine/sovereign-fund';
import { monthKeyLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { PanelShell } from './PanelShell';
import { Bar, Section } from '../ui';

const COMPONENTS = [
  { key: 'growth', label: 'Growth & productivity', why: 'Annualised REAL GDP growth vs a 3.5% benchmark, minus rising unemployment. Inflation does not count.' },
  { key: 'wealth', label: 'Public net wealth', why: 'Change in treasury + SWF NAV + public assets − debt − arrears, as a share of starting GDP.' },
  { key: 'satisfaction', label: 'Citizen satisfaction', why: 'Average approval over the last 6 months.' },
  { key: 'stability', label: 'Financial stability', why: 'Inflation near 2.5%, interest burden below 10% of revenue, low bank defaults, no arrears.' },
] as const;

export function ObjectivesPanel() {
  const g = useGameState();
  const setShowNewGame = useGame.getState().setShowNewGame;
  const sc = g.indicators.score;
  const sat = g.indicators.satisfaction;
  const ended = g.scheduler.campaignEnded;
  const o = outcomeLabel(g);
  const first = g.reports[0];
  const last = g.reports.at(-1);
  const trend = g.reports.map((r) => ({ t: r.monthKey, score: r.score.total, approval: r.approval }));
  return (
    <PanelShell title={ended ? 'Economic Presidency Report' : 'Campaign objectives'} subtitle={ended ? 'Your 24-month term is complete.' : `Month ${g.reports.length} of 24 · victory: score ≥ ${VICTORY.score}, approval ≥ ${VICTORY.approval}, no insolvency`} width={700}>
      <div className={`rounded-2xl p-4 ${o.won ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : 'bg-slate-900/50 ring-1 ring-slate-600/30'}`}>
        <div className="flex items-end justify-between">
          <div>
            <div className="label">{ended ? 'Final score' : 'Score preview'}</div>
            <div className="num text-[44px] font-black leading-none text-white" data-testid="score-total">{sc.total.toFixed(0)}<span className="text-[18px] text-slate-400">/100</span></div>
          </div>
          <div className="text-right">
            <div className={`text-[15px] font-bold ${o.won ? 'text-emerald-300' : 'text-slate-200'}`}>{o.text}</div>
            <div className="text-[12px] text-slate-400">Approval {g.indicators.approval.toFixed(0)}% (needs {VICTORY.approval}) · {g.government.insolvent ? 'INSOLVENT' : 'solvent'}</div>
          </div>
        </div>
        {sc.caps.map((c) => <div key={c} className="mt-2 text-[12px] font-semibold text-rose-300">⚠ {c}</div>)}
      </div>
      <Section title="Score components">
        {COMPONENTS.map((c) => (
          <div key={c.key} className="mb-3">
            <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{c.label} <span className="text-slate-500">· weight {SCORE_WEIGHTS[c.key] * 100}%</span></span><span className="num font-bold">{sc[c.key].toFixed(0)}</span></div>
            <Bar value={sc[c.key]} max={100} color={sc[c.key] >= 70 ? '#34d399' : sc[c.key] >= 45 ? '#fbbf24' : '#f87171'} />
            <div className="mt-0.5 text-[11px] text-slate-500">{c.why}</div>
          </div>
        ))}
      </Section>
      <Section title="What drives approval (monthly)">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          {Object.entries(sat).map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 flex justify-between text-[11.5px] capitalize"><span className="text-slate-400">{k}</span><span className="num">{v.toFixed(0)}</span></div>
              <Bar value={v} max={100} color={v >= 65 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171'} />
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-500">Weights: employment 25%, real income 25%, housing affordability 15%, services 15%, trust 10%, stability 10%. Tax rises, cuts to services/transfers, arrears and downgrades hit trust.</div>
      </Section>
      <Section title="Trend">
        <TimeChart data={trend} xKey="t" xFormat={(v) => monthKeyLabel(Number(v))} series={[{ key: 'score', name: 'Score', color: '#34d399' }, { key: 'approval', name: 'Approval', color: '#60a5fa' }]} yFormat={(v) => v.toFixed(0)} unit="points (0–100) · month" height={120} domain={[0, 100]} />
      </Section>
      {first && last && (
        <Section title={ended ? 'Opening vs closing' : 'Start vs latest month'}>
          <table className="data num">
            <thead><tr><th>Indicator</th><th className="text-right">{first.label}</th><th className="text-right">{last.label}</th></tr></thead>
            <tbody>
              <tr><td>Real GDP (month, annualised)</td><td className="text-right">{money(first.realGdp * 12)}</td><td className="text-right">{money(last.realGdp * 12)}</td></tr>
              <tr><td>Unemployment</td><td className="text-right">{pct(first.unemployment)}</td><td className="text-right">{pct(last.unemployment)}</td></tr>
              <tr><td>Inflation (YoY)</td><td className="text-right">{pct(first.inflationYoY)}</td><td className="text-right">{pct(last.inflationYoY)}</td></tr>
              <tr><td>Treasury</td><td className="text-right">{money(first.treasury)}</td><td className="text-right">{money(last.treasury)}</td></tr>
              <tr><td>Public debt</td><td className="text-right">{money(first.debt)}</td><td className="text-right">{money(last.debt)}</td></tr>
              <tr><td>SWF NAV</td><td className="text-right">{money(first.fundNav)}</td><td className="text-right">{money(last.fundNav)}</td></tr>
              <tr><td>Approval</td><td className="text-right">{first.approval.toFixed(0)}%</td><td className="text-right">{last.approval.toFixed(0)}%</td></tr>
              <tr><td>Public net worth (now vs start)</td><td className="text-right">{money(g.baseline.publicNetWorth)}</td><td className="text-right">{money(publicNetWorth(g))}</td></tr>
            </tbody>
          </table>
          <div className="mt-2 text-[11.5px] text-slate-400">SWF: NAV {money(navMYR(g))} incl. net transfers of {money(g.fund.totalInjectedMYR - g.fund.totalWithdrawnMYR)}; costs paid {money(g.fund.feesPaidMYR)}.</div>
        </Section>
      )}
      {ended && (
        <Section title="Key decisions & events">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div>{g.policyLog.slice(-12).map((p, i) => <div key={i} className="text-slate-300">• {p.label}</div>)}{!g.policyLog.length && <div className="text-slate-400">You made no policy decisions.</div>}</div>
            <div>{g.events.log.filter((e) => !e.ticker).slice(-12).map((e) => <div key={e.id} className="text-slate-300">• {e.title}</div>)}</div>
          </div>
          <button className="btn btn-primary mt-3" onClick={() => setShowNewGame(true)}>Start a new campaign</button>
        </Section>
      )}
    </PanelShell>
  );
}
