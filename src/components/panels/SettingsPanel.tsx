import { alertDealTab, economicAlerts, treasuryRunway, type AlertPreferences, type AlertRule } from '../../engine/alerts';
import { formatKL } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { usePreferences } from '../../store/preferences';
import { PanelShell } from './PanelShell';
import { Section } from '../ui';

const RULES: { id: AlertRule; label: string; field: 'runwayDays' | 'unemploymentPct' | 'housingPressurePct' | 'projectOverrunPct'; min: number; max: number; unit: string; hint: string }[] = [
  { id: 'treasury', label: 'Treasury coverage below', field: 'runwayDays', min: 1, max: 90, unit: 'days', hint: 'Critical below half this threshold. Based on recent gross outlays, excluding future receipts and borrowing.' },
  { id: 'unemployment', label: 'Unemployment above', field: 'unemploymentPct', min: 1, max: 30, unit: '%', hint: 'Critical 2 percentage points above this threshold.' },
  { id: 'housing', label: 'Rent growth ahead of wages', field: 'housingPressurePct', min: 1, max: 100, unit: '%', hint: 'Rent index ÷ wage index versus opening; critical 15 points above this threshold.' },
  { id: 'projects', label: 'Estimated project cost above base', field: 'projectOverrunPct', min: 1, max: 100, unit: '%', hint: 'Remaining work priced at current costs; critical 20 points above this threshold.' },
];

export function SettingsPanel() {
  const game = useGameState();
  const prefs = usePreferences(s => s.alerts);
  const pauseOnDialogs = useGame(s => s.pauseOnDialogs);
  const memory = useGame(s => s.alertMemory);
  const history = useGame(s => s.alertHistory);
  const update = (patch: Partial<AlertPreferences>) => usePreferences.getState().update({ alerts: { ...prefs, ...patch } });
  const current = economicAlerts(game, prefs, memory);
  const runway = treasuryRunway(game);
  return <PanelShell title="Alerts & settings" subtitle="Preferences stay on this device. Alert history covers this play session." width={600}>
    <Section title="Pacing">
      <label className="flex gap-2 text-[13px]"><input type="checkbox" checked={pauseOnDialogs} onChange={e => useGame.getState().setPauseOnDialogs(e.target.checked)} />Pause while confirmation dialogs are open</label>
      <label className="mt-3 flex gap-2 text-[13px]"><input type="checkbox" checked={prefs.pauseOnCritical} onChange={e => update({ pauseOnCritical: e.target.checked })} data-testid="pause-on-critical" />Pause on a new critical economic alert</label>
      <p className="mt-2 text-[12px] text-slate-400">Warnings keep the clock running. Critical alerts leave it paused until you resume. Time remains limited to 1×, 2×, 3× and 5×; hidden tabs always pause.</p>
    </Section>
    <Section title="Risk thresholds">
      <div className="space-y-4">{RULES.map(rule => <div key={rule.id}>
        <div className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={prefs.enabled[rule.id]} aria-label={`Enable ${rule.id} alerts`} onChange={e => update({ enabled: { ...prefs.enabled, [rule.id]: e.target.checked } })} />
          <label className="flex flex-1 flex-wrap items-center justify-between gap-2" htmlFor={`threshold-${rule.id}`}>{rule.label}
            <span className="flex items-center gap-1"><input id={`threshold-${rule.id}`} className="input num !w-20" type="number" min={rule.min} max={rule.max} step={1} value={prefs[rule.field]} disabled={!prefs.enabled[rule.id]} onChange={e => { const n = Number(e.target.value); if (e.target.value && Number.isFinite(n) && n >= rule.min && n <= rule.max) update({ [rule.field]: n }); }} data-testid={`threshold-${rule.id}`} />{rule.unit}</span>
          </label>
        </div><p className="mt-1 ml-5 text-[11.5px] text-slate-400">{rule.hint}</p>
      </div>)}</div>
      <label className="mt-4 flex items-center justify-between gap-2 text-[13px]">Notification detail<select className="input !w-40" value={prefs.detail} onChange={e => update({ detail: e.target.value as AlertPreferences['detail'] })}><option value="brief">Brief</option><option value="detailed">Detailed</option></select></label>
      <p className="mt-3 text-[12px] text-slate-400">Checked at daily settlements. New risks and escalation notify once; a 10% recovery margin prevents repeated threshold chatter. Disabling a rule clears its tracking at the next check.</p>
    </Section>
    <Section title="Deal notifications"><label className="flex gap-2 text-[13px]"><input type="checkbox" checked={prefs.enabled.deals!==false} onChange={e=>update({enabled:{...prefs.enabled,deals:e.target.checked}})} />Enable deal alerts</label><p className="mt-2 text-[12px] text-slate-400">Decision deadlines, funding rounds, cash shortages, failures and unpaid contracts. Existing critical-alert pause settings apply.</p></Section>
    <Section title="Current risks">
      <p className="mb-2 text-[12px] text-slate-400">Treasury coverage: {runway === null ? 'available after the first daily settlement' : `${runway.toFixed(1)} days at recent outlays`}</p>
      {current.length === 0 && <p className="text-[13px] text-slate-300">No enabled thresholds are breached.</p>}
      {current.map(a => <div key={a.key} className="mb-2 rounded-lg bg-amber-400/10 p-3 text-[12px]"><strong className={a.severity === 'critical' ? 'text-rose-200' : 'text-amber-200'}>{a.severity.toUpperCase()} · {a.title}</strong><p className="mt-1 text-slate-300">{a.detail}</p><button className="btn mt-2" onClick={() => a.rule==='deals'?(useGame.setState({dealsTab:alertDealTab(game,a.key)}),useGame.getState().setPanel('deals')):a.rule === 'projects' ? useGame.getState().setPanel('projects') : useGame.getState().explain(a.rule === 'treasury' ? 'treasury' : a.rule === 'unemployment' ? 'unemployment' : 'inflation')}>Investigate</button></div>)}
    </Section>
    <Section title="Alert history · this session">
      <div data-testid="alert-history" className="space-y-2 text-[12px]">{history.length ? [...history].reverse().map((a, i) => <div key={`${a.key}-${a.atMin}-${i}`} className="border-b border-slate-700 pb-2"><span className="text-slate-400">{formatKL(a.atMin).date} · {a.severity}</span><p>{a.title}</p>{prefs.detail === 'detailed' && <p className="text-slate-400">{a.detail}</p>}</div>) : <p className="text-slate-400">No alerts recorded. Loading a save does not replay existing warnings.</p>}</div>
    </Section>
    <Section title="Campaign starts"><p className="text-[12.5px] text-slate-300">Choose Balanced, Recession, Export downturn or Energy squeeze from New. Each describes its starting shocks; the same seed and decisions reproduce the same simulated history.</p><button className="btn mt-2" onClick={() => useGame.getState().setShowNewGame(true)}>Choose a new campaign</button></Section>
  </PanelShell>;
}
