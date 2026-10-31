import { useState } from 'react';
import { baselineFor, SECTOR_IDS, SECTORS } from '../../data/economic-baseline';
import { formatKL, klDay } from '../../engine/time';
import { useGameState } from '../../store/game-store';
import type { GovMonthFlows } from '../../types/game';
import { gdpUsd, money, pct } from '../../utils/format';
import { PanelShell } from './PanelShell';
import { Section, Stat, Tabs } from '../ui';
import { EventCard } from '../EventCard';

const FLOW_LABELS: [keyof GovMonthFlows, string, boolean][] = [
  ['taxCorporate', 'Corporate tax', true], ['taxProperty', 'Property levy', true], ['taxConsumption', 'Consumption levy', true], ['taxHousehold', 'Household surcharge', true], ['federalGrant', 'Other public receipts', true], ['importTariff', 'Import tariffs', true],
  ['soeDividend', 'SOE dividends', true], ['petroleumTax', 'Petroleum income tax', true], ['commodityDuty', 'Commodity duties', true], ['exportSupport', 'Export services', false], ['subsidy', 'Fuel & food subsidies', false],
  ['dealEscrowIn', 'Deal escrow returned/settled', true], ['dealEscrowOut', 'Deal escrow reserved', false],
  ['borrowing', 'Bond proceeds', true], ['swfTransferIn', 'SWF transfers in', true],
  ['opex', 'Operating outlays', false], ['capex', 'Capital outlays', false], ['interest', 'Debt interest', false], ['principal', 'Principal repaid', false], ['emergency', 'Emergency', false], ['swfContribution', 'SWF injections', false],
];

export function ReportsPanel() {
  const g = useGameState();
  const [tab, setTab] = useState<'monthly' | 'events' | 'policy' | 'news'>('monthly');
  const [sel, setSel] = useState<number | null>(null);
  const r = sel !== null ? g.reports.find((x) => x.monthKey === sel) : g.reports.at(-1);
  return (
    <PanelShell title="Reports & logs" subtitle="Monthly accounts close automatically at 00:00 on the 1st." width={720}>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'monthly', label: 'Monthly reports' }, { id: 'events', label: 'Event log' }, { id: 'policy', label: 'Policy history' }, { id: 'news', label: 'All news' }]} />
      {tab === 'monthly' && (!r ? (
        <div className="text-[12.5px] text-slate-400">The first monthly report arrives at 00:00 on 1 Feb 2027. Keep the clock running.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {g.reports.map((x) => (
              <button key={x.monthKey} onClick={() => setSel(x.monthKey)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${x.monthKey === r.monthKey ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800/60 text-slate-400 hover:text-white'}`}>{x.label}</button>
            ))}
          </div>
          <Section title={`${r.label} — Economic report`}>
            <div className="mb-3 grid grid-cols-4 gap-3">
              <Stat label="Nominal GDP (month)" value={gdpUsd(r.nominalGdp, r.myrPerUsd)} />
              <Stat label="Real GDP (month)" value={gdpUsd(r.realGdp, baselineFor(g).myrPerUsd)} />
              <Stat label="CPI YoY" value={pct(r.inflationYoY)} />
              <Stat label="Unemployment" value={pct(r.unemployment)} />
              <Stat label="Approval" value={`${r.approval.toFixed(0)}%`} />
              <Stat label="SWF NAV" value={money(r.fundNav)} sub={`${pct(r.fundReturnMoM, 2, true)} return`} tone={r.fundReturnMoM >= 0 ? 'up' : 'down'} />
              <Stat label="Treasury" value={money(r.treasury)} />
              <Stat label="Debt" value={money(r.debt)} sub={`yield ${pct(r.bondYield, 2)}`} />
            </div>
            <div className="mb-3 space-y-1">
              {r.notes.map((n, i) => <p key={i} className="text-[12.5px] text-slate-300">• {n}</p>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">GDP by sector (value added)</div>
                {SECTOR_IDS.map((j) => (
                  <div key={j} className="num flex justify-between text-[12px]"><span className="text-slate-400">{SECTORS[j].short}</span><span>{gdpUsd(r.gdpBySector[j], r.myrPerUsd)}</span></div>
                ))}
                <div className="num flex justify-between border-t border-slate-700/50 pt-1 text-[12px]"><span className="text-slate-400">+ consumption levy</span><span>{money(r.gov.taxConsumption)}</span></div>
              </div>
              <div>
                <div className="label mb-1">Government cash flows</div>
                {FLOW_LABELS.map(([k, label, inflow]) => r.gov[k] > 0 && (
                  <div key={k} className="num flex justify-between text-[12px]"><span className="text-slate-400">{label}</span><span className={inflow ? 'up' : 'down'}>{inflow ? '+' : '−'}{money(r.gov[k])}</span></div>
                ))}
              </div>
            </div>
            {r.reconciliation && (
              <div className="num mt-3 rounded-lg bg-slate-950/40 p-2 text-[12px]" data-testid="reconciliation">
                <div className="label mb-1">Cash & debt reconciliation (integer sen)</div>
                <div className="flex justify-between"><span className="text-slate-400">Opening → closing treasury</span><span>{money(r.reconciliation.openingTreasuryMinor / 100, 'MYR', 2)} → {money(r.reconciliation.closingTreasuryMinor / 100, 'MYR', 2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Net cash postings</span><span>{money(r.reconciliation.netCashMinor / 100, 'MYR', 2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cash residual</span><b className={r.reconciliation.cashResidualMinor === 0 ? 'up' : 'down'} data-testid="cash-residual">RM {(r.reconciliation.cashResidualMinor / 100).toFixed(2)}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Debt residual</span><b className={r.reconciliation.debtResidualMinor === 0 ? 'up' : 'down'} data-testid="debt-residual">RM {(r.reconciliation.debtResidualMinor / 100).toFixed(2)}</b></div>
              </div>
            )}
            {(r.events.length > 0 || r.policies.length > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <div><div className="label mb-1">Events started</div>{r.events.map((e, i) => <div key={i} className="text-slate-300">{e}</div>)}</div>
                <div><div className="label mb-1">Your decisions</div>{r.policies.map((e, i) => <div key={i} className="text-slate-300">{e}</div>)}</div>
              </div>
            )}
          </Section>
        </>
      ))}
      {tab === 'events' && (
        <Section title="Economic events (fictional scenarios)">
          {[...g.events.log].reverse().map((event) => <EventCard key={event.id} event={event} today={klDay(g.clock.hour * 60)} />)}
          {!g.events.log.length && <div className="text-[12px] text-slate-400">No events yet.</div>}
        </Section>
      )}
      {tab === 'policy' && (
        <Section title="Your decisions">
          {[...g.policyLog].reverse().map((p, i) => (
            <div key={i} className="border-b border-slate-700/30 py-1 text-[12px]"><span className="text-slate-400">{formatKL(p.atMin).date}</span> · {p.label}{p.effectiveMin !== p.atMin ? <span className="text-slate-500"> (effective {formatKL(p.effectiveMin).date})</span> : null}</div>
          ))}
          {!g.policyLog.length && <div className="text-[12px] text-slate-400">No decisions yet.</div>}
        </Section>
      )}
      {tab === 'news' && (
        <Section title="News feed">
          {[...g.news].reverse().map((n) => (
            <div key={n.id} className="border-b border-slate-700/30 py-1.5 text-[12px]">
              <div className="flex justify-between"><b className={n.tone === 'good' ? 'up' : n.tone === 'bad' ? 'down' : 'text-slate-200'}>{n.title}</b><span className="shrink-0 pl-2 text-slate-500">{formatKL(n.atMin).date.slice(0, 6)} {formatKL(n.atMin).time}</span></div>
              {n.body && <div className="text-slate-400">{n.body}</div>}
            </div>
          ))}
        </Section>
      )}
    </PanelShell>
  );
}
