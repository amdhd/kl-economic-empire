import { EXPLAIN_LABELS, explainEconomy, type ExplainMetric } from '../../engine/economic-explanations';
import { useGame, useGameState } from '../../store/game-store';
import { money } from '../../utils/format';
import { Section } from '../ui';
import { PanelShell } from './PanelShell';

export function ExplanationPanel() {
  const s = useGameState();
  const metric = useGame(x => x.explainMetric);
  const view = explainEconomy(s, metric);
  const showList = (items: string[], empty: string) => items.length ? <ul className="list-disc space-y-2 pl-4">{items.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p className="text-slate-400">{empty}</p>;
  return <PanelShell title={`Why did ${view.title.toLowerCase()} change?`} subtitle="Fictional simulation · measured contributions and current conditions" width={600}>
    <div className="flex flex-wrap gap-1" role="group" aria-label="Explain a metric">
      {(Object.keys(EXPLAIN_LABELS) as ExplainMetric[]).map(id => <button className={`btn ${metric === id ? 'btn-primary' : ''}`} key={id} aria-pressed={metric === id} onClick={() => useGame.getState().explain(id)} data-testid={`explain-${id}`}>{EXPLAIN_LABELS[id]}</button>)}
    </div>
    <p className="text-[14px] font-semibold text-white">{view.summary}</p>
    <Section title="Measured contributions">
      <p className="mb-2 text-[12px] text-cyan-200">{view.period}</p>
      <dl className="metric-rows" data-testid="explanation-contributions">{view.parts.map(p => <div key={p.label}><dt>{p.label}</dt><dd className="num">{p.value >= 0 ? '+' : '−'}{p.unit.startsWith('MYR') ? `${money(Math.abs(p.value))}${p.unit.endsWith('/year') ? '/yr' : ''}` : `${Math.abs(p.value).toFixed(3)} ${p.unit}`}</dd></div>)}</dl>
      <p className="mt-2 text-[12px] text-slate-400">{view.caveat}</p>
    </Section>
    <Section title="How the model responds"><div className="text-[12.5px] text-slate-300">{showList(view.mechanisms, 'No additional mechanisms.')}</div></Section>
    <Section title="Policy timing & uncertainty">
      <div className="text-[12.5px] text-slate-300">{showList(view.pending, 'No policy changes or projects awaiting delivery.')}</div>
      <p className="mt-2 text-[12px] text-amber-200">Static policy previews hold demand, prices and profits fixed. Actual results depend on funding, capacity, external events and response lags; no calibrated probability range is available.</p>
    </Section>
    <Section title="Recent decisions · context, not causal attribution"><div className="text-[12px] text-slate-300">{showList(view.policies, 'No policy decisions yet.')}</div></Section>
    <Section title="Active shocks"><div className="text-[12px] text-slate-300">{showList(view.events, 'No active event shocks.')}</div></Section>
    <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => useGame.getState().setPanel('economy')}>Economy charts</button><button className="btn" onClick={() => useGame.getState().setPanel('policies')}>Taxes & budget</button><button className="btn" onClick={() => useGame.getState().setPanel('settings')}>Configure alerts</button></div>
  </PanelShell>;
}
