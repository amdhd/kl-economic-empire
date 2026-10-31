import { BASE_BUDGET, BUDGET_LABELS } from '../../data/economic-baseline';
import { OFFICIAL_BASELINES, OFFICIAL_SOURCES } from '../../data/national-baseline';
import { useGameState } from '../../store/game-store';
import { fullMoneyMinor, money } from '../../utils/format';
import { Section } from '../ui';
import { PanelShell } from './PanelShell';

export function SourcesPanel() {
  const g = useGameState();
  return <PanelShell referenceData title="Baseline & sources" subtitle="Malaysia economy · Kuala Lumpur map · official observations pinned 31 Oct 2026" width={740}>
    <div className="rounded-xl bg-cyan-500/10 p-3 text-[12px] leading-relaxed text-cyan-100" data-testid="baseline-profile">
      {g.baseline.profile === 'malaysia' ? 'This campaign started from the Malaysia baseline.' : 'This is a legacy fictional KL campaign. Its cash, debt, history and original calibration are preserved. Start a new campaign to use Malaysia figures.'}
      {' '}These are starting observations from different dates, not a single consolidated balance sheet or a 2027 forecast. Every subsequent economic result, market price and event is simulated.
    </div>
    <Section title="Official reference observations · annual MYR unless stated">
      <div className="space-y-3">
        {OFFICIAL_BASELINES.map(r => <div key={r.label} className="border-b border-slate-700/50 pb-2 text-[12px]">
          <div className="flex justify-between gap-3"><b className="text-slate-200">{r.label}</b><span className="num whitespace-nowrap text-emerald-200">{fullMoneyMinor(Math.round(r.value * 100))}</span></div>
          <div className="mt-1 text-slate-400">{r.period} · <a className="text-cyan-300 underline" href={r.source} target="_blank" rel="noreferrer">Official source ↗</a></div>
        </div>)}
      </div>
    </Section>
    <Section title="Opening controllable operating budget · derived from MOF 2027 estimates">
      <table className="w-full text-[12px]"><thead><tr className="text-left text-slate-400"><th>Game group</th><th className="text-right">Annual</th><th className="text-right">Monthly ÷ 12</th></tr></thead>
        <tbody>{Object.entries(BASE_BUDGET).map(([k, v]) => <tr key={k}><td className="py-1">{BUDGET_LABELS[k as keyof typeof BASE_BUDGET]}</td><td className="num text-right">{money(v * 12, 'MYR', 3)}</td><td className="num text-right">{money(v, 'MYR', 3)}</td></tr>)}</tbody>
      </table>
      <p className="mt-2 text-[12px] text-slate-400">Public services groups education and higher education; safety groups defence and home affairs; development groups works and transport operating allocations; transfers uses pensions. Administration is the residual of total federal operations after these groups and debt service. Development capital allocations are excluded; game infrastructure remains commissioned separately.</p>
    </Section>
    <Section title="Cash, reserves and model assumptions">
      <p className="text-[12px] leading-relaxed text-slate-300">Treasury starts with federal deposits held at BNM, a narrow cash proxy that excludes deposits elsewhere. It is not a claim about all government cash. Central-bank usable reserves start with the $116.4bn foreign-currency component of the 15 Oct 2026 statement; the $132.1bn gross total also includes gold, SDRs and other assets. Neither reserve account is spendable treasury or SWF money. <a className="text-cyan-300 underline" href={OFFICIAL_SOURCES.bnm} target="_blank" rel="noreferrer">BNM statement ↗</a></p>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-400">Population starts at the rounded 2025 DOSM estimate of 34.2m, with workforce 17.49m and unemployment 3.0% from Q3 2025. Opening FX is the statement’s MYR reserve valuation divided by its USD equivalent (about RM4.0784/USD), not an observed spot quote. The central bank has a fictional RM5bn sterilisation float. OPR starts at the reported 2.75% and subsequently follows a fictional automatic rule. Seven-sector weights, tax rates, loans, SWF assets, public assets, trade flows and policy elasticities remain model assumptions. Real GDP is rebased to opening prices; it is not the DOSM 2015-price series. Public wealth covers modeled assets/liabilities only; reserve portfolio gains/losses are included after subtracting opening reserve equity.</p>
    </Section>
  </PanelShell>;
}
