import { useState } from 'react';
import { formatLever, LEVER_IDS, LEVERS, leverPhase, leverValue, type LeverGroup, MIN_WAGE0, abatement, aiMismatch } from '../../engine/policy';
import { overallAttractiveness } from '../../engine/fdi';
import type { LeverId } from '../../types/game';
import { useGame, useGameState, type PanelId } from '../../store/game-store';
import { money, num, pct } from '../../utils/format';
import { Bar, Section } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

const GROUPS: { id: LeverGroup; title: string }[] = [
  { id: 'ai', title: 'AI investment & productivity' },
  { id: 'fdi', title: 'Foreign direct investment' },
  { id: 'labour', title: 'Labour market' },
  { id: 'capital', title: 'Capital & currency' },
  { id: 'green', title: 'Industry & green transition' },
];
const OTHER: { id: PanelId; label: string }[] = [
  { id: 'policies', label: 'Taxes & budget' }, { id: 'controls', label: 'Sector relief, ministry plans, FX band' },
  { id: 'commodities', label: 'Fuel & food subsidies' }, { id: 'trade', label: 'Tariffs & export support' },
  { id: 'partners', label: 'Trade agreements' }, { id: 'debt', label: 'Borrowing' }, { id: 'fdi', label: 'Investment pledges' },
];
const PHASE_LABEL = { opening: 'Opening setting', announced: 'Announced', phasing: 'Phasing in', full: 'Full effect' } as const;

const display = (id: LeverId, v: number) => (LEVERS[id].unit === 'RMbnYr' ? `RM${(v / 1e9).toFixed(2)}bn` : LEVERS[id].unit === 'share' ? pct(v, 0) : LEVERS[id].unit === 'toggle' ? (v ? 'On' : 'Off') : num(v));

export function DecisionsPanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const [draft, setDraft] = useState<Partial<Record<LeverId, number>>>({});
  const [confirm, setConfirm] = useState(false);
  if (!g.policy.enabled) return <PanelShell title="Policy decisions" subtitle="Toggle and slider policies"><p className="text-[13px] text-slate-300">These policies are modelled in new Malaysia campaigns (model 3). This save keeps its original rules.</p></PanelShell>;
  const decided = (id: LeverId) => g.policy.levers[id].value;
  const shown = (id: LeverId) => draft[id] ?? decided(id);
  const changes = LEVER_IDS.filter(id => draft[id] !== undefined && Math.abs((draft[id] as number) - decided(id)) > 1e-9);
  // Drafts snap to the slider step so the review shows exactly what the engine will apply.
  const set = (id: LeverId, v: number) => setDraft({ ...draft, [id]: LEVERS[id].kind === 'toggle' ? v : Math.round(v / LEVERS[id].step) * LEVERS[id].step });
  const p = g.policy;
  const effects: Record<LeverGroup, string> = {
    ai: `AI adoption ${pct(p.aiAdoption)} (in productivity: ${pct(p.aiEffective)}). Mismatch unemployment +${(aiMismatch(g) * 100).toFixed(2)}pp. Programmes last month ${money(p.lastMonth.aiProgramme + p.lastMonth.reskilling)}.`,
    fdi: `Investment climate ${overallAttractiveness(g).toFixed(0)}/100 (50 = opening). FDI grants last month ${money(p.lastMonth.fdiGrants)}.`,
    labour: `Minimum wage ${pct(leverValue(g, 'minimumWage') / MIN_WAGE0 - 1, 1, true)} vs opening. Foreign workers ${p.foreignWorkers.toFixed(2)}m. Levy receipts last month ${money(p.lastMonth.workerLevy)}.`,
    capital: `Ringgit support ${pct(-leverValue(g, 'exportConversion') * 0.04, 1)} from conversion; swings damped ${pct(leverValue(g, 'hotMoneyControls') * 0.4, 0)}.`,
    green: `Emissions ${(p.emissionsIndex * 100).toFixed(1)} (opening output mix = 100), abatement ${pct(abatement(g))}. Carbon tax last month ${money(p.lastMonth.carbonTax)}; green grants ${money(p.lastMonth.greenGrants)}.`,
  };
  return (
    <PanelShell title="Policy decisions" subtitle="Tick to activate, slide to set the level, then decide. Each policy runs a cycle: announced → effective → phasing in → full effect, with second-round effects after." width={760}>
      {GROUPS.map(group => (
        <Section key={group.id} title={group.title}>
          {LEVER_IDS.filter(id => LEVERS[id].group === group.id).map(id => {
            const spec = LEVERS[id], v = shown(id), on = spec.kind === 'toggle' ? v === 1 : Math.abs(v - spec.initial) > 1e-9;
            const ph = leverPhase(g, id);
            return (
              <div key={id} className="mb-3 rounded-lg bg-slate-900/40 p-2" data-testid={`lever-${id}`}>
                <div className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={on} aria-label={`Activate ${spec.label}`} data-testid={`lever-toggle-${id}`}
                    onChange={e => set(id, e.target.checked ? (spec.kind === 'toggle' ? 1 : (draft[id] !== undefined && draft[id] !== spec.initial ? draft[id]! : Math.min(spec.max, spec.initial + (spec.max - spec.min) / 4))) : (spec.kind === 'toggle' ? 0 : spec.initial))} />
                  <span className="flex-1 font-semibold text-slate-200">{spec.label}</span>
                  <span className="num text-slate-300">{display(id, v)}{draft[id] !== undefined && draft[id] !== decided(id) && <span className="text-amber-300"> (draft)</span>}</span>
                </div>
                {spec.kind === 'slider' && <input type="range" className="mt-1 w-full" min={spec.min} max={spec.max} step={spec.step} value={v} aria-label={spec.label} data-testid={`lever-slider-${id}`} onChange={e => set(id, Number(e.target.value))} />}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-28 shrink-0">{PHASE_LABEL[ph.phase]}{ph.phase === 'announced' ? ` · in ${ph.daysToEffect}d` : ph.phase === 'phasing' ? ` · ${pct(ph.progress, 0)}` : ''}</span>
                  <div className="flex-1"><Bar value={ph.phase === 'announced' ? 0 : ph.progress} /></div>
                  <span className="w-40 shrink-0 text-right">now {display(id, leverValue(g, id))}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">{spec.cycle}</p>
              </div>
            );
          })}
          <p className="text-[11.5px] text-cyan-100/90" data-testid={`effects-${group.id}`}>{effects[group.id]}</p>
        </Section>
      ))}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 bg-slate-950/80 p-2 backdrop-blur">
        <span className="flex-1 text-[12px] text-slate-300">{changes.length ? `${changes.length} change(s) drafted` : 'No drafted changes'}</span>
        <button className="btn" disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>Reset draft</button>
        <button className="btn btn-primary" disabled={!changes.length} onClick={() => setConfirm(true)} data-testid="decide-policies">Review & decide</button>
      </div>
      <Section title="Other policy controls">
        <div className="flex flex-wrap gap-2">{OTHER.map(o => <button key={o.id} className="btn !text-[11.5px]" onClick={() => useGame.getState().setPanel(o.id)}>{o.label}</button>)}</div>
      </Section>
      {confirm && (
        <ConfirmDialog title="Decide policies" confirmLabel="Decide" onCancel={() => setConfirm(false)} onConfirm={() => {
          for (const id of changes) command({ type: 'setLever', lever: id, value: draft[id] as number });
          setDraft({});
          setConfirm(false);
        }}>
          <ul className="list-disc space-y-1 pl-4">
            {changes.map(id => <li key={id}><b>{LEVERS[id].label}</b>: {formatLever(id, decided(id))} → {formatLever(id, draft[id] as number)}. Effective tomorrow, full effect after ~{LEVERS[id].rampDays} days.</li>)}
          </ul>
          <p className="mt-2 text-[12px] text-slate-400">Investors react to the announcement at once; economic effects follow the phase-in. Fictional simulated policy.</p>
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
