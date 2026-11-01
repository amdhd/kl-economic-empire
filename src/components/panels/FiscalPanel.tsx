import { useState } from 'react';
import { OFFICIAL_DEFICIT, OFFICIAL_FISCAL_OUTLOOK } from '../../data/national-baseline';
import type { Command } from '../../engine/game';
import { credibilityPremium, deficitTarget, escapeJustified, ESCAPE_MAX_MONTHS } from '../../engine/fiscal-rules';
import { outputGap } from '../../engine/scheduler';
import { monthKeyLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { Bar, Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

const ok = (b: boolean) => <span className={`chip ${b ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'}`}>{b ? 'Met' : 'Breached'}</span>;

export function FiscalPanel() {
  const g = useGameState();
  const f = g.fiscal;
  const command = useGame.getState().command;
  const last = f.history.at(-1);
  const [deficitCap, setDeficitCap] = useState(f.rule.deficitCap * 100);
  const [debtCap, setDebtCap] = useState(f.rule.debtCap * 100);
  const [golden, setGolden] = useState(f.rule.goldenRule);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  if (!g.world.enabled) {
    return <PanelShell title="Fiscal rules & deficit" subtitle="Deficit, debt and the golden rule">
      <p className="text-[12px] text-amber-200">Fiscal rules, the development budget and state enterprises are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  const gap = outputGap(g);
  const target = deficitTarget(f, g.reports.length);
  const headroom = last ? (target - last.deficit) * g.indicators.nominalGdpAnnual : 0;
  const loosening = deficitCap / 100 > f.rule.deficitCap || debtCap / 100 > f.rule.debtCap || (f.rule.goldenRule && !golden);
  // Official annual deficits for 2021–2025 (outturns) and 2026 (revised), then simulated monthly 12-month windows.
  const official = OFFICIAL_DEFICIT.filter((d) => d.kind !== 'estimate').map((d) => ({ t: `${d.year}${d.kind === 'revised' ? ' (rev.)' : ''}`, official: d.deficit * 100 } as Record<string, number | string>));
  const chart = [...official, ...f.history.map((h) => ({ t: monthKeyLabel(h.monthKey), deficit: h.deficit * 100, target: h.target * 100, structural: h.structuralDeficit * 100 }))];
  const budget2027 = OFFICIAL_DEFICIT.find((d) => d.year === 2027)!;
  return <PanelShell title="Fiscal rules & deficit" subtitle="Modelled on the Public Finance and Fiscal Responsibility Act 2023 · simulated outcomes" width={740}>
    <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3" data-testid="fiscal-summary">
      <Stat label="Deficit · 12 months" value={last ? pct(last.deficit, 2) : '—'} sub={`target ${pct(target, 2)} of GDP`} tone={last && last.deficit <= target ? 'up' : 'down'} hint="Revenue minus all outlays, trailing 12 months, share of nominal GDP" />
      <Stat label="Primary deficit" value={last ? pct(last.primaryDeficit, 2) : '—'} sub="excludes interest" />
      <Stat label="Structural deficit" value={last ? pct(last.structuralDeficit, 2) : '—'} sub={`output gap ${pct(gap, 1, true)}`} hint="Cyclically adjusted with a revenue semi-elasticity of 0.2" />
      <Stat label="Debt" value={pct(g.indicators.debtToGdp, 1)} sub={`ceiling ${pct(f.rule.debtCap, 0)}`} tone={g.indicators.debtToGdp <= f.rule.debtCap ? 'up' : 'down'} />
    </div>
    {!last && <p className="text-[12px] text-slate-400">The first fiscal measurement is taken at the 1 February month close.</p>}
    <Section title="Compliance and credibility" right={<span className="num text-[12px] text-slate-300" data-testid="credibility">Credibility {f.credibility.toFixed(0)}/100</span>}>
      <Bar value={f.credibility} max={100} color={f.credibility >= 60 ? '#34d399' : f.credibility >= 40 ? '#f59e0b' : '#f43f5e'} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2 py-1.5">Deficit ≤ glide path {last ? ok(last.compliant.deficit) : '—'}</div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2 py-1.5">Debt ≤ ceiling or falling {last ? ok(last.compliant.debt) : '—'}</div>
        <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2 py-1.5">Golden rule {last ? (f.rule.goldenRule ? ok(last.compliant.golden) : <span className="chip">Off</span>) : '—'}</div>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">
        Headroom against this month's target: <b className={headroom >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{money(headroom)}</b> a year. Current balance (revenue less operating spending and interest): {last ? pct(last.currentBalance, 2, true) : '—'} of GDP; the golden rule needs it at or above zero, so borrowing only funds development.
        Credibility moves the sovereign risk premium by {pct(credibilityPremium(g), 2, true)} today (±50bp range) and the rating by up to ±1 notch. Rules are not self-enforcing: you decide whether to comply.
      </p>
    </Section>
    <Section title="Deficit path · % of GDP" right={<a className="text-[10.5px] text-cyan-300 underline" href={OFFICIAL_FISCAL_OUTLOOK} target="_blank" rel="noreferrer">MOF Fiscal Outlook 2027 ↗</a>}>
      <TimeChart data={chart} xKey="t" unit="% of GDP" dataLabel="Official 2021–26 · then simulated" yFormat={(v) => `${v.toFixed(1)}%`} series={[{ key: 'official', name: 'Official (annual)', color: '#e2e8f0' }, { key: 'deficit', name: 'Simulated (12-month)', color: '#f43f5e' }, { key: 'target', name: 'Glide-path target', color: '#94a3b8' }, { key: 'structural', name: 'Structural', color: '#60a5fa' }]} />
      <p className="mt-1 text-[11.5px] text-slate-400">Official: 2021–2025 outturns, 2026 revised estimate; Budget 2027 targets {pct(budget2027.deficit, 1)} of 2027 GDP. The simulation measures its deficit against opening (2025) GDP, so the same ringgit deficit reads higher here.</p>
    </Section>
    <p className="text-[11.5px] text-slate-400">The development budget, borrowing rule and debt terms are set in the Fiscal control tab.</p>
    <Section title="Rule settings">
      <div className="flex flex-wrap items-center gap-4 text-[12px]">
        <label>Deficit ceiling % <input className="input num ml-1 !w-20" type="number" min="0" max="10" step="0.5" value={deficitCap} onChange={(e) => setDeficitCap(Number(e.target.value))} aria-label="Deficit ceiling" /></label>
        <label>Debt ceiling % <input className="input num ml-1 !w-20" type="number" min="30" max="120" step="5" value={debtCap} onChange={(e) => setDebtCap(Number(e.target.value))} aria-label="Debt ceiling" /></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={golden} onChange={(e) => setGolden(e.target.checked)} aria-label="Golden rule" /> Golden rule</label>
        <button className="btn" data-testid="review-rule" onClick={() => setReview({ cmd: { type: 'setFiscalRule', patch: { deficitCap: deficitCap / 100, debtCap: debtCap / 100, goldenRule: golden } }, title: 'Change the fiscal rule', body: loosening ? 'Loosening a rule outside an escape is read by markets as abandoning it: credibility falls immediately.' : 'Tightening a rule costs nothing now; credibility follows actual compliance.' })}>Review rule</button>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Defaults follow the Act's targets: deficit 3% of GDP, debt 60%, borrowing for development only. The deficit target glides from the opening deficit ({pct(f.openingDeficit, 2)}) to the ceiling over two years.</p>
    </Section>
    <Section title="Escape clause">
      {f.escape?.active
        ? <p className="text-[12px] text-amber-200">Active since month {f.escape.sinceMonth}; {f.escape.justified ? 'invoked during a downturn, so markets accept it' : 'invoked without a downturn, so credibility is capped'}. It lapses after {ESCAPE_MAX_MONTHS} months.</p>
        : <p className="text-[12px] text-slate-400">Invoke to breach the rules temporarily. Justified now: <b>{escapeJustified(g, gap) ? 'yes' : 'no'}</b> (output gap below −2% or an adverse macro shock under way). An unjustified escape costs 20 credibility points.</p>}
      <button className="btn mt-2" data-testid="escape-btn" onClick={() => setReview({ cmd: { type: 'fiscalEscape', invoke: !f.escape?.active }, title: f.escape?.active ? 'End the escape clause' : 'Invoke the escape clause', body: f.escape?.active ? 'The rules apply again from the next month close.' : escapeJustified(g, gap) ? 'Conditions justify an escape: credibility falls by 2 points.' : 'No downturn is under way: credibility falls by 20 points and stays capped while the escape lasts.' })}>{f.escape?.active ? 'End escape' : 'Invoke escape'}</button>
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </PanelShell>;
}
