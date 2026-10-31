import { useState } from 'react';
import { baselineFor } from '../../data/economic-baseline';
import { campaignReport } from '../../engine/campaign-report';
import { annualRealOutput, computeScore, SCORE_WEIGHTS, SCORE_WEIGHTS_V3, VICTORY, outcomeLabel } from '../../engine/indicators';
import { formatKL, monthKeyLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { gdpUsd, money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { PanelShell } from './PanelShell';
import { Bar, Section, Stat, Tabs } from '../ui';
import { EventCard } from '../EventCard';

const COMPONENTS = [
  { key: 'growth', label: 'Growth & productivity', why: 'Calendar-adjusted real GDP growth versus the external-condition benchmark, minus rising unemployment. Inflation does not count.' },
  { key: 'wealth', label: 'Public net wealth', why: 'Treasury + SWF NAV + modeled public assets − debt − arrears, plus the central-bank portfolio gain/loss. For Malaysia, assets are CPI-adjusted and nominal debt is retained to prevent inflation-only score gains. Extra credit depends on sustaining real income, output and services.' },
  { key: 'satisfaction', label: 'Citizen satisfaction', why: 'Average approval over the last 6 months.' },
  { key: 'stability', label: 'Financial stability', why: 'Inflation near 2.5%, interest burden below 10% of revenue, low bank defaults, no arrears.' },
  { key: 'standing', label: 'Global standing', why: 'GDP growth in $ versus the ten largest economies (50%), export growth in $ versus them (25%) and the ringgit against the dollar (25%). See Global standing.' },
] as const;

export function ObjectivesPanel() {
  const g = useGameState();
  const setShowNewGame = useGame.getState().setShowNewGame;
  const setPanel = useGame.getState().setPanel;
  const [view, setView] = useState<'score' | 'output' | 'finances' | 'fund'>('score');
  const sc = computeScore(g);
  const weights: Record<string, number> = sc.standing === undefined ? { ...SCORE_WEIGHTS, standing: 0 } : SCORE_WEIGHTS_V3;
  const parts = COMPONENTS.filter((c) => weights[c.key] > 0);
  const val = (k: (typeof COMPONENTS)[number]['key']) => sc[k] ?? 0;
  const sat = g.indicators.satisfaction;
  const ended = g.scheduler.campaignEnded;
  const o = outcomeLabel(g);
  const report = campaignReport(g);
  const { opening, closing, drivers } = report;
  const trend = g.reports.map((r) => ({ t: r.monthKey, score: r.score.total, approval: r.approval,
    output: annualRealOutput([r]) / baselineFor(g).myrPerUsd / 1e9, treasury: r.treasury / 1e9, debt: r.debt / 1e9, fund: r.fundNav / 1e9 }));
  const charts = {
    score: { unit: 'points (0–100) · month', series: [{ key: 'score', name: 'Score', color: '#34d399' }, { key: 'approval', name: 'Approval', color: '#60a5fa' }] },
    output: { unit: 'real US$ bn per year at the opening MYR/USD · month', series: [{ key: 'output', name: 'Real GDP run rate', color: '#34d399' }] },
    finances: { unit: 'RM bn · month-end', series: [{ key: 'treasury', name: 'Treasury', color: '#34d399' }, { key: 'debt', name: 'Debt', color: '#f87171' }] },
    fund: { unit: 'RM bn · month-end · includes treasury transfers', series: [{ key: 'fund', name: 'SWF NAV', color: '#a78bfa' }] },
  };
  const rows = [
    ['Real GDP run rate / year', gdpUsd(opening.realGdp, baselineFor(g).myrPerUsd), gdpUsd(closing.realGdp, baselineFor(g).myrPerUsd)],
    ['Unemployment', pct(opening.unemployment), pct(closing.unemployment)],
    ['Inflation (YoY)', pct(opening.inflation), pct(closing.inflation)],
    ['Treasury', money(opening.treasury), money(closing.treasury)],
    ['Public debt', money(opening.debt), money(closing.debt)],
    ['SWF NAV', money(opening.fundNav), money(closing.fundNav)],
    ['Approval', `${opening.approval.toFixed(0)}%`, `${closing.approval.toFixed(0)}%`],
    ['Public net worth', money(opening.netWorth), money(closing.netWorth)],
  ];
  return (
    <PanelShell title={ended ? 'Economic Presidency Report' : 'Campaign objectives'} subtitle={`${g.mode?.boom ? 'Boom sandbox · ' : ''}${ended ? `Your ${g.mode?.months ?? 24}-month term is complete.` : `Month ${g.reports.length} of ${g.mode?.months ?? 24} · victory: score ≥ ${VICTORY.score}, approval ≥ ${VICTORY.approval}, no insolvency`}`} width={700}>
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
        {parts.map((c) => (
          <div key={c.key} className="mb-3">
            <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{c.label} <span className="text-slate-500">· weight {Math.round(weights[c.key] * 100)}%</span></span><span className="num font-bold">{val(c.key).toFixed(0)}</span></div>
            <Bar value={val(c.key)} max={100} color={val(c.key) >= 70 ? '#34d399' : val(c.key) >= 45 ? '#fbbf24' : '#f87171'} />
            <div className="mt-0.5 text-[11px] text-slate-500">{c.why}</div>
          </div>
        ))}
      </Section>
      <Section title="Why this score" >
        <div className="space-y-1 text-[12px] text-slate-300" data-testid="score-explanation">
          <p>Real GDP growth: {pct(drivers.realGrowth, 2, true)} annualised against a {pct(drivers.growthTarget, 2)} benchmark. Recorded external conditions adjust the potential-growth target by {(drivers.externalAdjustment * 100).toFixed(2)} percentage points, capped at ±1 point.</p>
          <p>Real public wealth change: {money(drivers.realWealthChange)}. Sustainability preserves {pct(drivers.wealthCreditFactor, 0)} of extra wealth credit: the weakest of real income, real output and service quality versus their opening levels. Losses keep their full penalty.</p>
          <p>Weighted points: {parts.map((c) => `${c.label} ${(val(c.key) * weights[c.key]).toFixed(1)}`).join(' + ')}{sc.caps.length ? ' (then failure caps apply)' : ''}.</p>
          <p className="text-slate-500">External adjustment is an estimate from elapsed recorded shocks, not a counterfactual forecast. Current previews use the latest calibration; imported historical scores retain their earlier calibration.</p>
        </div>
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
        <Tabs value={view} onChange={setView} options={[{ id: 'score', label: 'Score & approval' }, { id: 'output', label: 'Real output' }, { id: 'finances', label: 'Treasury & debt' }, { id: 'fund', label: 'Fund value' }]} />
        <TimeChart data={trend} xKey="t" xFormat={(v) => monthKeyLabel(Number(v))} series={charts[view].series} yFormat={(v) => v.toFixed(1)} unit={charts[view].unit} height={140} domain={view === 'score' ? [0, 100] : undefined} />
      </Section>
      {g.reports.length > 0 && (
        <Section title={ended ? 'Opening vs closing' : 'Start vs latest month'}>
          <table className="data num" data-testid="campaign-comparison">
            <thead><tr><th>Indicator</th><th className="text-right">Opening · {formatKL(g.clock.startHour * 60).date}</th><th className="text-right">{ended ? 'Closing' : 'Latest'}</th></tr></thead>
            <tbody>
              {rows.map(([label, start, end]) => <tr key={label}><td>{label}</td><td className="text-right">{start}</td><td className="text-right">{end}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-2 text-[11.5px] text-slate-400">SWF gain excluding net treasury transfers: {money(report.fundGain)} ({pct(report.fundReturn, 2, true)} of opening NAV). Net transfers {money(report.fundNetTransfers)}; costs paid {money(g.fund.feesPaidMYR)}. This simple cumulative measure includes dividends and FX.</div>
        </Section>
      )}
      {g.deals.enabled && <Section title="Public agreements beyond the term"><div className="grid grid-cols-3 gap-2"><Stat label="Escrow" value={money(report.deals.escrow)} /><Stat label="Remaining commitments" value={money(report.deals.commitments)} /><Stat label="Maximum guarantees" value={money(report.deals.guarantees)} /><Stat label="Unpaid claims" value={money(report.deals.arrears)} /><Stat label="Private holdings" value={money(report.deals.holdings)} /><Stat label="Guarantee provision" value={money(report.deals.guaranteeReserve)} /></div><p className="mt-2 text-[12px] text-slate-400">Future services remain obligations after the term. Indexed supply costs can change. Guarantee provision projects current utilisation without predicting a future recovery.</p>{report.deals.unfinished.map(d=><p key={d.id} className="mt-1 text-[12px]">{d.name}: {d.status} · {money(d.remaining)} remaining</p>)}<button className="btn mt-2" onClick={()=>setPanel('deals')}>Inspect public exposure</button></Section>}
      {ended && (
        <Section title="Term fiscal accounts">
          <div className="grid grid-cols-3 gap-3" data-testid="term-fiscal">
            <Stat label="Public receipts" value={money(report.revenue)} />
            <Stat label="Operating outlays" value={money(report.fiscal.opex)} />
            <Stat label="Capital outlays" value={money(report.fiscal.capex)} />
            <Stat label="Debt interest" value={money(report.fiscal.interest)} />
            <Stat label="Import tariffs" value={money(report.fiscal.importTariff)} />
            <Stat label="Export support" value={money(report.fiscal.exportSupport)} />
            <Stat label="Emergency outlays" value={money(report.fiscal.emergency)} />
            <Stat label="Fiscal balance" value={money(report.fiscalBalance)} />
            <Stat label="Bond proceeds" value={money(report.fiscal.borrowing)} />
            <Stat label="Principal repaid" value={money(report.fiscal.principal)} />
            <Stat label="Net SWF contributions" value={money(report.fiscal.swfContribution - report.fiscal.swfTransferIn)} />
          </div>
          <button className="btn mt-3" onClick={() => setPanel('reports')}>Inspect monthly accounts</button>
        </Section>
      )}
      {ended && (
        <Section title="Key decisions & events">
          <details className="text-[12px]"><summary className="cursor-pointer text-slate-200">Policy history ({g.policyLog.length})</summary>
            {g.policyLog.map((p, i) => <div key={i} className="mt-1 text-slate-300">{formatKL(p.atMin).date} · {p.label}</div>)}
            {!g.policyLog.length && <div className="text-slate-400">You made no policy decisions.</div>}
          </details>
          <details className="mt-3 text-[12px]"><summary className="cursor-pointer text-slate-200">Event history ({g.events.log.length})</summary>
            {g.events.log.map((event) => <EventCard key={event.id} event={event} today={g.scheduler.lastDay} />)}
          </details>
          <p className="mt-3 text-[11px] text-slate-500">Victory requires score ≥{VICTORY.score}, approval ≥{VICTORY.approval} and solvency. The bar has automated replay calibration; human playtesting is still pending.</p>
          <button className="btn btn-primary mt-3" onClick={() => setShowNewGame(true)}>Start a new campaign</button>
        </Section>
      )}
    </PanelShell>
  );
}
