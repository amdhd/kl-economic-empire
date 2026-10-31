import { useState } from 'react';
import { budgetFor, BUDGET_LABELS, TAX_LABELS } from '../../data/economic-baseline';
import { treasuryMYR } from '../../engine/government';
import { estimateTaxChange } from '../../engine/policy-preview';
import { formatKL } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import type { BudgetCategory, BudgetPolicy, TaxPolicy } from '../../types/game';
import { money, pct } from '../../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';
import { Section, Stat } from '../ui';

const TAX_KEYS = Object.keys(TAX_LABELS) as (keyof TaxPolicy)[];
const CATS = Object.keys(BUDGET_LABELS) as BudgetCategory[];

export function PolicyPanel() {
  const g = useGameState();
  const BASE_BUDGET = budgetFor(g);
  const command = useGame.getState().command;
  const pol = g.government.policies;
  const pendingTax = (k: keyof TaxPolicy) => g.government.pending.filter((p) => p.kind === 'tax' && k in p.patch).map((p) => (p.patch as TaxPolicy)[k]).at(-1);
  const pendingBudget = (k: BudgetCategory) => g.government.pending.filter((p) => p.kind === 'budget' && k in p.patch).map((p) => (p.patch as BudgetPolicy)[k]).at(-1);
  const [tax, setTax] = useState<TaxPolicy>(() => ({ ...pol.tax, ...Object.fromEntries(TAX_KEYS.map((k) => [k, pendingTax(k) ?? pol.tax[k]])) }));
  // Only categories the player moved are drafts; the rest track live budgets, which inherited plans index monthly.
  const [edits, setEdits] = useState<Partial<BudgetPolicy>>({});
  const budget = Object.fromEntries(CATS.map((k) => [k, edits[k] ?? pendingBudget(k) ?? pol.budget[k]])) as BudgetPolicy;
  const [confirm, setConfirm] = useState<'tax' | 'budget' | null>(null);

  const last = g.reports.at(-1);
  const effect = estimateTaxChange(g, tax);
  const taxDelta = Object.values(effect).reduce((a, b) => a + b, 0);
  const budgetDelta = CATS.reduce((a, k) => a + budget[k] - pol.budget[k], 0);
  const taxChanged = TAX_KEYS.some((k) => Math.abs(tax[k] - (pendingTax(k) ?? pol.tax[k])) > 1e-9);
  const budgetChanged = CATS.some((k) => budget[k] !== (pendingBudget(k) ?? pol.budget[k]));
  const outlays = last ? last.gov.opex + last.gov.capex + last.gov.interest : CATS.reduce((a, k) => a + pol.budget[k], 0);

  return (
    <PanelShell title="Taxes & budget" subtitle="Fictional fiscal powers. Malaysia baseline for new campaigns. Tax and budget changes take effect the next day." width={680}>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="Treasury cash" value={money(treasuryMYR(g.government))} />
        <Stat label="Tax receipts (last mo.)" value={last ? money(last.gov.taxCorporate + last.gov.taxProperty + last.gov.taxConsumption + last.gov.taxHousehold) : '—'} />
        <Stat label="Outlays (last mo.)" value={money(outlays)} />
        <Stat label="Deficit / GDP" value={pct(g.indicators.deficitToGdp)} tone={g.indicators.deficitToGdp > 0.03 ? 'down' : undefined} />
      </div>

      <Section title={`Tax rates · effective tomorrow`}>
        {TAX_KEYS.map((k) => {
          const meta = TAX_LABELS[k];
          const cur = pol.tax[k];
          return (
            <div key={k} className="mb-3">
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-slate-200">{meta.label}</span>
                <span className="num">
                  <span className="text-slate-400">{pct(cur, 1)}</span>
                  {Math.abs(tax[k] - cur) > 1e-9 && <span className={tax[k] > cur ? 'text-amber-300' : 'text-cyan-300'}> → {pct(tax[k], 1)}</span>}
                </span>
              </div>
              <input type="range" min={meta.min} max={meta.max} step={0.005} value={tax[k]} onChange={(e) => setTax({ ...tax, [k]: Number(e.target.value) })} aria-label={meta.label} data-testid={`tax-${k}`} />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{meta.hint}</span>
                {Math.abs(effect[k]) > 1e5 && <span className={`num ${effect[k] > 0 ? 'up' : 'down'}`}>≈ {effect[k] > 0 ? '+' : ''}{money(effect[k])}/mo</span>}
              </div>
            </div>
          );
        })}
        <div className="mt-2 rounded-lg bg-slate-950/40 p-2 text-[12px] text-slate-300" data-testid="tax-estimate">
          <b>Static estimate:</b> {taxDelta >= 0 ? '+' : ''}{money(taxDelta)} per month in receipts, all else equal. Uncertain: higher corporate tax lowers after-tax returns and investment with a lag; levies cut real spending and tourism; the surcharge reduces disposable income. Tax rises dent trust immediately.
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary" disabled={!taxChanged} onClick={() => setConfirm('tax')} data-testid="queue-tax">Queue tax changes</button>
          <button className="btn" disabled={!taxChanged} onClick={() => setTax({ ...pol.tax, ...Object.fromEntries(TAX_KEYS.map((k) => [k, pendingTax(k) ?? pol.tax[k]])) })}>Revert proposal</button>
        </div>
      </Section>

      {g.baseline.profile === 'malaysia' && <div className="rounded-lg bg-cyan-500/10 p-3 text-[12px] text-cyan-100">
        2027 MOF operating estimates ÷ 12. Public services = education + higher education; safety = defence + home affairs; development = works + transport operations; transfers = pensions; administration = all remaining operations. Debt service is paid separately. <button className="underline" onClick={() => useGame.getState().setPanel('sources')}>View annual figures & sources</button>
      </div>}
      <Section title="Operating budget · per month · effective tomorrow">
        <div className="grid grid-cols-2 gap-x-5 gap-y-2">
          {CATS.map((k) => (
            <div key={k}>
              <div className="mb-0.5 flex items-center justify-between text-[12px]">
                <span className="text-slate-300">{BUDGET_LABELS[k]}</span>
                <span className="num">
                  {budget[k] !== pol.budget[k] && <span className="text-slate-500 line-through">{money(pol.budget[k], 'MYR', 2)}</span>} <b>{money(budget[k], 'MYR', 2)}</b>
                </span>
              </div>
              <input type="range" min={0} max={BASE_BUDGET[k] * 2.5} step={10e6} value={budget[k]} onChange={(e) => setEdits({ ...edits, [k]: Number(e.target.value) })} aria-label={BUDGET_LABELS[k]} data-testid={`budget-${k}`} />
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-lg bg-slate-950/40 p-2 text-[12px] text-slate-300">
          Change: <b className={budgetDelta > 0 ? 'text-amber-300' : 'text-cyan-300'}>{budgetDelta >= 0 ? '+' : ''}{money(budgetDelta)}/month</b>. Health, services and safety raise service quality over ~3–6 months; transfers lift household income; spending buys domestic sector output (with import leakage). Cuts to services and transfers cost trust.
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary" disabled={!budgetChanged} onClick={() => setConfirm('budget')} data-testid="queue-budget">Queue budget</button>
          <button className="btn" disabled={!budgetChanged} onClick={() => setEdits({})}>Revert</button>
        </div>
      </Section>

      <Section title="Pending & recent policy">
        {g.government.pending.length === 0 && <div className="text-[12px] text-slate-400">Nothing queued.</div>}
        {g.government.pending.map((p) => (
          <div key={p.id} className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-amber-400/10 px-2 py-1.5 text-[12px] text-amber-100">
            <span>{p.label} · from {formatKL(p.effectiveMin).date}</span>
            <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => command({ type: 'cancelPolicy', id: p.id })}>Withdraw</button>
          </div>
        ))}
        <div className="mt-2 space-y-0.5">
          {[...g.policyLog].reverse().slice(0, 6).map((l, i) => (
            <div key={i} className="text-[11.5px] text-slate-400">{formatKL(l.atMin).date} — {l.label}</div>
          ))}
        </div>
      </Section>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'tax' ? 'Queue tax changes' : 'Queue budget changes'}
          confirmLabel="Queue policy"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'tax') command({ type: 'queueTax', patch: Object.fromEntries(TAX_KEYS.filter((k) => Math.abs(tax[k] - (pendingTax(k) ?? pol.tax[k])) > 1e-9).map((k) => [k, tax[k]])) });
            else {
              command({ type: 'queueBudget', patch: Object.fromEntries(CATS.filter((k) => budget[k] !== (pendingBudget(k) ?? pol.budget[k])).map((k) => [k, budget[k]])) });
              setEdits({});
            }
            setConfirm(null);
          }}
        >
          {confirm === 'tax' ? (
            <ul className="list-disc space-y-1 pl-4">
              {TAX_KEYS.filter((k) => Math.abs(tax[k] - pol.tax[k]) > 1e-9).map((k) => <li key={k}>{TAX_LABELS[k].label}: {pct(pol.tax[k], 1)} → {pct(tax[k], 1)}</li>)}
              <li>Effective from tomorrow 00:00. Static receipts estimate {taxDelta >= 0 ? '+' : ''}{money(taxDelta)}/month.</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {CATS.filter((k) => budget[k] !== pol.budget[k]).map((k) => <li key={k}>{BUDGET_LABELS[k]}: {money(pol.budget[k], 'MYR', 2)} → {money(budget[k], 'MYR', 2)} / month</li>)}
              <li>Effective from tomorrow 00:00.</li>
              {g.controls.plans.filter((p) => budget[p.category] !== (pendingBudget(p.category) ?? pol.budget[p.category])).map((p) => (
                <li key={p.category} className="text-amber-300" data-testid={`plan-replaced-${p.category}`}>Replaces the {BUDGET_LABELS[p.category]} ministry plan; its future scheduled appropriations are cancelled.</li>
              ))}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
