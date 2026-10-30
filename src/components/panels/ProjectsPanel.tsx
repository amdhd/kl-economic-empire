import { useState } from 'react';
import { PROJECTS, type ProjectTemplate } from '../../data/projects';
import { treasuryMYR } from '../../engine/government';
import { klDayLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';
import { Bar, Section } from '../ui';

export function ProjectsPanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const [pick, setPick] = useState<ProjectTemplate | null>(null);
  const [cancel, setCancel] = useState<number | null>(null);
  const gov = g.government;
  const building = gov.projects.filter((p) => p.status === 'building');
  const monthlyCapex = building.reduce((a, p) => a + (p.cost / p.durationDays) * 30.4, 0);
  return (
    <PanelShell title="Infrastructure projects" subtitle="Money is disbursed over the build; benefits start only on completion." width={680}>
      <div className="rounded-xl bg-slate-900/40 p-3 text-[12.5px] text-slate-300">
        Under construction: <b>{building.length}</b> · capex ≈ <b>{money(monthlyCapex)}</b>/month · treasury {money(treasuryMYR(gov))} · borrowing cap {pct(gov.policies.borrowing.maxDebtToGdp, 0)} of GDP.
      </div>
      {gov.projects.length > 0 && (
        <Section title="Your projects">
          {gov.projects.map((p) => {
            const prog = p.work / p.cost;
            return (
              <div key={p.id} className="mb-2 rounded-lg bg-slate-800/40 p-2">
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">{p.name}</span>
                  <span className={p.status === 'complete' ? 'up' : p.status === 'cancelled' ? 'down' : 'text-amber-300'}>
                    {p.status === 'complete' ? `Complete ${klDayLabel(p.completedDay!)}` : p.status === 'cancelled' ? 'Cancelled' : `ETA ${klDayLabel(p.startDay + p.durationDays)}`}
                  </span>
                </div>
                <Bar value={prog} color={p.status === 'complete' ? '#34d399' : '#fbbf24'} />
                <div className="mt-1 flex justify-between text-[11.5px] text-slate-400">
                  <span className="num">{pct(prog, 0)} built · {money(p.spent)} spent of {money(p.cost)} budget{p.spent > p.work * 1.005 ? ' (construction-cost escalation)' : ''}</span>
                  {p.status === 'building' && <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => setCancel(p.id)}>Cancel</button>}
                </div>
              </div>
            );
          })}
        </Section>
      )}
      <Section title="Available projects">
        <div className="grid grid-cols-2 gap-2">
          {PROJECTS.map((t) => {
            const taken = gov.projects.some((p) => p.templateId === t.id && p.status !== 'cancelled');
            return (
              <div key={t.id} className="flex flex-col rounded-xl bg-slate-800/40 p-3 ring-1 ring-slate-600/20">
                <div className="text-[13px] font-bold text-white">{t.name}</div>
                <div className="num my-1 text-[11.5px] text-amber-200">{money(t.cost)} · {Math.round(t.durationDays / 30)} months</div>
                <p className="mb-2 flex-1 text-[11.5px] text-slate-400">{t.description}</p>
                <div className="mb-2 text-[11px] text-slate-300">
                  {Object.entries(t.productivity).map(([k, v]) => `${k} +${((v as number) * 100).toFixed(1)}%`).join(' · ')}
                  {t.rentEffect ? ` · rents ${(t.rentEffect * 100).toFixed(1)}%` : ''}
                  {t.resilience ? ` · flood damage −${t.resilience * 100}%` : ''}
                  {t.tourism ? ` · tourism +${t.tourism * 100}%` : ''}
                  {t.serviceEffect ? ` · services +${(t.serviceEffect * 100).toFixed(0)}pt` : ''}
                </div>
                <button className="btn btn-primary" disabled={taken} onClick={() => setPick(t)} data-testid={`project-${t.id}`}>{taken ? 'Commissioned' : 'Commission'}</button>
              </div>
            );
          })}
        </div>
      </Section>
      {pick && (
        <ConfirmDialog title={`Commission ${pick.name}?`} confirmLabel="Commission" onCancel={() => setPick(null)} onConfirm={() => { command({ type: 'startProject', templateId: pick.id }); setPick(null); }}>
          Commits {money(pick.cost)} at today’s construction prices over ~{Math.round(pick.durationDays / 30)} months (≈ {money((pick.cost / pick.durationDays) * 30.4)}/month) — more if construction prices rise. Once complete it costs ≈ {money(pick.cost * 0.03)}/year to maintain, and only ~60% of the spend counts as a public asset. Repeated gains in the same sector have diminishing returns. Spending flows to construction (≈70%), industry and tech now; productivity and service benefits arrive at completion. If the treasury runs short, bonds are issued within your borrowing cap.
        </ConfirmDialog>
      )}
      {cancel !== null && (
        <ConfirmDialog title="Cancel project?" confirmLabel="Cancel project" danger onCancel={() => setCancel(null)} onConfirm={() => { command({ type: 'cancelProject', id: cancel }); setCancel(null); }}>
          Money already spent is sunk and no benefits will be delivered. Cancellation dents public trust.
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
