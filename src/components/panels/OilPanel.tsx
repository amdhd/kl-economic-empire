import { useMemo, useState } from 'react';
import { FUEL_CEILING0, PETRONAS } from '../../data/world';
import { fuelMarketPrice, fuelSubsidyDaily } from '../../engine/world';
import { petronasCapex, petronasOutlook, upstreamPriceIndex } from '../../engine/soe';
import type { Command } from '../../engine/game';
import { formatKL, monthKeyLabel } from '../../engine/time';
import type { CommodityPolicy } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { bnTick, money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { Section, Stat, Tabs } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

const bn = (v: number) => `${v < 0 ? '−' : ''}RM${Math.abs(v / 1e9).toFixed(1)}bn`;
const signed = (v: number) => `${v >= 0 ? '+' : '−'}RM${Math.abs(v / 1e9).toFixed(1)}bn`;

export function OilPanel() {
  const g = useGameState();
  const [tab, setTab] = useState<'petronas' | 'fuel'>('petronas');
  if (!g.world.enabled || !g.soe.petronas.enabled) {
    return <PanelShell title="Oil" subtitle="PETRONAS and the fuel subsidy">
      <p className="text-[12px] text-amber-200">Oil, PETRONAS and fuel subsidies are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  return <PanelShell title="Oil" subtitle="PETRONAS profit and capex, and the petrol subsidy · fictional simulation" width={780}>
    <Tabs value={tab} onChange={setTab} options={[{ id: 'petronas', label: 'PETRONAS' }, { id: 'fuel', label: 'Petrol subsidy' }]} />
    {tab === 'petronas' ? <Petronas /> : <Fuel />}
  </PanelShell>;
}

function Petronas() {
  const g = useGameState();
  const p = g.soe.petronas;
  const command = useGame.getState().command;
  const [dividend, setDividend] = useState(p.dividendAnnual / 1e9);
  const [capex, setCapex] = useState(p.capexAnnual / 1e9);
  const [special, setSpecial] = useState(5);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  const day = g.scheduler.lastDay;
  const now = useMemo(() => petronasOutlook(g, p.dividendAnnual, p.capexAnnual), [day, p.dividendAnnual, p.capexAnnual]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => petronasOutlook(g, dividend * 1e9, capex * 1e9), [day, dividend, capex]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = p.history.at(-1);
  const changed = Math.abs(dividend * 1e9 - p.dividendAnnual) > 1e8 || Math.abs(capex * 1e9 - p.capexAnnual) > 1e8;
  const chart = p.history.slice(-12).map((h) => ({ t: monthKeyLabel(h.monthKey), profit: h.profitAfterTax / 1e9, dividend: h.dividend / 1e9, capex: h.capex / 1e9 }));
  const rows: { label: string; a: number; b: number; fmt?: (v: number) => string; goodUp?: boolean }[] = [
    { label: 'Oil & gas revenue', a: now.revenue, b: next.revenue, goodUp: true },
    { label: 'Profit after tax', a: now.profitAfterTax, b: next.profitAfterTax, goodUp: true },
    { label: 'Capex (investment in new fields)', a: now.capex, b: next.capex },
    { label: 'Dividend to government', a: now.dividend, b: next.dividend },
    { label: 'Change in PETRONAS cash', a: now.cashChange, b: next.cashChange, goodUp: true },
    { label: 'Cash after 12 months', a: now.endCash, b: next.endCash, goodUp: true },
    { label: 'Oil & gas output after 12 months', a: now.endProduction, b: next.endProduction, fmt: (v) => v.toFixed(3), goodUp: true },
  ];
  return <>
    <Section title="PETRONAS · wholly state-owned" right={<span className="text-[11.5px] text-slate-400">Oil & gas price index {upstreamPriceIndex(g).toFixed(2)}</span>}>
      {last ? <>
        <p className="mb-2 text-[13px] text-slate-200" data-testid="petronas-headline">
          In {monthKeyLabel(last.monthKey)} PETRONAS <b className={last.profitAfterTax >= 0 ? 'up' : 'down'}>{last.profitAfterTax >= 0 ? 'made' : 'lost'} {bn(Math.abs(last.profitAfterTax))}</b> after tax, paid you {bn(last.dividend)} and spent {bn(last.capex)} on new fields.
          {' '}It kept {signed(last.profitAfterTax - last.dividend)} of profit after the dividend.
        </p>
        <div className="grid grid-cols-4 gap-3" data-testid="petronas-stats">
          <Stat label="Revenue (month)" value={money(last.revenue)} sub={`tax paid ${money(last.pita)}`} />
          <Stat label="Profit after tax" value={money(last.profitAfterTax)} tone={last.profitAfterTax >= 0 ? 'up' : 'down'} />
          <Stat label="Cash" value={money(p.cash)} sub={`floor ${money(PETRONAS.cashFloor)} · debt ${money(p.debt)}`} tone={p.cash >= PETRONAS.cashFloor ? 'up' : 'down'} />
          <Stat label="Capex now" value={`${money(petronasCapex(p, g))}/yr`} sub={p.cash < PETRONAS.cashFloor ? 'cut 30%: cash below floor' : 'per policy'} />
        </div>
      </> : <p className="text-[12px] text-slate-400">Results appear after the first month closes.</p>}
      {chart.length > 0 && <div className="mt-3"><TimeChart data={chart} xKey="t" unit="RM bn / month" yFormat={(v) => bnTick(v)} series={[{ key: 'profit', name: 'Profit after tax', color: '#34d399' }, { key: 'dividend', name: 'Dividend to government', color: '#60a5fa' }, { key: 'capex', name: 'Capex', color: '#f2b45e' }]} height={140} /></div>}
    </Section>
    <Section title="Set the dividend and capex · see the next 12 months before you commit">
      <div className="grid grid-cols-2 gap-4 text-[12px]">
        <label className="block">Dividend to government · <b>RM{dividend.toFixed(0)}bn</b> a year
          <input type="range" min={0} max={80} step={1} value={dividend} onChange={(e) => setDividend(Number(e.target.value))} aria-label="PETRONAS dividend" data-testid="petronas-dividend" />
          <span className="text-slate-400">Cash to your treasury. Opening level RM{(PETRONAS.dividend0 / 1e9).toFixed(0)}bn.</span>
        </label>
        <label className="block">Capex · <b>RM{capex.toFixed(0)}bn</b> a year
          <input type="range" min={10} max={100} step={1} value={capex} onChange={(e) => setCapex(Number(e.target.value))} aria-label="PETRONAS capex" data-testid="petronas-capex" />
          <span className="text-slate-400">Keeps fields producing. Opening level RM{(PETRONAS.capex0 / 1e9).toFixed(0)}bn.</span>
        </label>
      </div>
      <table className="mt-3 w-full text-[12px]" data-testid="petronas-outlook">
        <thead><tr className="text-left text-slate-400"><th>Next 12 months (estimate)</th><th className="text-right">Current policy</th><th className="text-right">With your sliders</th><th className="text-right">Difference</th></tr></thead>
        <tbody>{rows.map((r) => {
          const f = r.fmt ?? bn, d = r.b - r.a, tiny = Math.abs(d) < (r.fmt ? 0.0005 : 5e7);
          return <tr key={r.label}><td className="py-0.5">{r.label}</td><td className="num text-right">{f(r.a)}</td><td className="num text-right">{f(r.b)}</td>
            <td className={`num text-right ${tiny ? 'text-slate-500' : r.goodUp === undefined ? 'text-slate-300' : (d > 0) === r.goodUp ? 'up' : 'down'}`}>{tiny ? '—' : r.fmt ? `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(3)}` : signed(d)}</td></tr>;
        })}</tbody>
      </table>
      {next.daysToFloor !== null
        ? <p className="mt-2 text-[12px] text-amber-300" data-testid="petronas-floor-warning">At these settings PETRONAS cash drops below its RM{(PETRONAS.cashFloor / 1e9).toFixed(0)}bn floor in about {Math.max(1, Math.round(next.daysToFloor / 30))} month(s) and it cuts capex by 30%, which lowers future output and tax.</p>
        : <p className="mt-2 text-[12px] text-emerald-300">Cash stays above the floor for the whole year at these settings.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!changed} data-testid="review-petronas" onClick={() => setReview({ cmd: { type: 'petronasPolicy', dividendAnnual: dividend * 1e9, capexAnnual: capex * 1e9 }, title: 'PETRONAS directive', body: `Dividend RM${dividend.toFixed(0)}bn a year (now RM${(p.dividendAnnual / 1e9).toFixed(0)}bn), capex RM${capex.toFixed(0)}bn a year (now RM${(p.capexAnnual / 1e9).toFixed(0)}bn). Estimated cash after 12 months: ${bn(next.endCash)}.` })}>Review directive</button>
        <label className="text-[12px]">Special dividend RM bn <input className="input num ml-1 !w-20" type="number" min={1} max={100} value={special} onChange={(e) => setSpecial(Number(e.target.value))} aria-label="Special dividend" /></label>
        <button className="btn" onClick={() => setReview({ cmd: { type: 'soeSpecialDividend', entity: 'petronas', amount: special * 1e9 }, title: 'PETRONAS special dividend', body: `Transfer RM${special}bn from PETRONAS cash to the treasury now. Public wealth is unchanged; PETRONAS has less cash for capex.` })}>Special dividend</button>
      </div>
      <details className="mt-3 text-[12px] text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary>
        <p className="mt-1">Dividends move cash from PETRONAS to the treasury: they shrink the deficit but not public wealth. Fields decline about {pct(PETRONAS.declineRate, 0)} a year unless the trailing 12-month capex keeps up with the opening programme, so starving investment to pay dividends lowers future production, tax and dividends. About {pct(PETRONAS.domesticCapexShare, 0)} of capex is spent in Malaysia. If cash falls below RM{(PETRONAS.cashFloor / 1e9).toFixed(0)}bn, PETRONAS cuts capex by 30%. The table replays the daily upstream model at today's oil and gas price and exchange rate with petroleum income tax approximated daily; real months will differ as prices move.</p>
        <p className="mt-1">Listed subsidiaries held: {Object.keys(p.shares).map((id) => `${g.companies[id as keyof typeof g.companies] ? id.replace(/^MY:/, '') : id}`).join(', ')}. Their dividends flow to PETRONAS and are included in profit.</p>
      </details>
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </>;
}

function Fuel() {
  const g = useGameState();
  const w = g.world;
  const command = useGame.getState().command;
  const pending = g.government.pending.filter((p) => p.kind === 'commodity');
  const proposed = { ...w.policy, ...Object.assign({}, ...pending.map((p) => p.patch)) } as CommodityPolicy;
  const [ceiling, setCeiling] = useState(proposed.fuelCeiling);
  const [eligible, setEligible] = useState(proposed.fuelEligible);
  const [confirm, setConfirm] = useState(false);
  const market = fuelMarketPrice(g);
  const perYear = fuelSubsidyDaily(g) * 365;
  const changed = Math.abs(ceiling - proposed.fuelCeiling) > 1e-9 || Math.abs(eligible - proposed.fuelEligible) > 1e-9;
  const patch = { fuelCeiling: ceiling, fuelEligible: eligible };
  return <>
    <Section title="Petrol subsidy (RON95)">
      <p className="mb-2 text-[13px] text-slate-200">The government pays the gap between the real petrol price and the pump ceiling. A lower ceiling is popular but costs the treasury; raising it saves money but lifts prices for everyone.</p>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Pump ceiling" value={`RM${w.policy.fuelCeiling.toFixed(2)}/L`} sub={`opening RM${FUEL_CEILING0.toFixed(2)}`} />
        <Stat label="Real price (no subsidy)" value={`RM${market.toFixed(2)}/L`} tone={market > w.policy.fuelCeiling ? 'down' : 'up'} />
        <Stat label="Subsidy paid this month" value={money(w.mtd.fuelSubsidy)} />
        <Stat label="Subsidy per year (today's price)" value={money(perYear)} tone={perYear > 0 ? 'down' : 'neutral'} />
      </div>
    </Section>
    <Section title="Change the policy · effective tomorrow">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
        <label className="block">Pump ceiling · <b>RM{ceiling.toFixed(2)}</b>/L <span className="text-slate-400">(unsubsidised ≈ RM{market.toFixed(2)})</span>
          <input type="range" min={1.5} max={3.5} step={0.05} value={ceiling} onChange={(e) => setCeiling(Number(e.target.value))} aria-label="Fuel ceiling" data-testid="fuel-ceiling" />
        </label>
        <label className="block">Who gets it · <b>{pct(eligible, 0)}</b> of volume
          <input type="range" min={0} max={1} step={0.05} value={eligible} onChange={(e) => setEligible(Number(e.target.value))} aria-label="Fuel eligibility" data-testid="fuel-eligible" />
          <span className="text-slate-400">100% = everyone (leaks to non-residents and smuggling); 85% ≈ citizens only; lower = income-targeted</span>
        </label>
      </div>
      <details className="mt-2 text-[12px] text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary>
        <p className="mt-1">Raising the fuel ceiling above RM{FUEL_CEILING0.toFixed(2)} or narrowing eligibility saves money but raises prices and is unpopular. Extra household fuel spending comes out of other consumption. Food, steel and palm duties are on the Commodities panel.</p>
      </details>
      <button className="btn btn-primary mt-2" disabled={!changed} onClick={() => setConfirm(true)} data-testid="review-commodity">Review changes</button>
      {pending.map((p) => <div key={p.id} className="mt-2 flex items-center justify-between gap-2 text-[12px] text-amber-200"><span>{p.label} · from {formatKL(p.effectiveMin).date}</span><button className="btn" onClick={() => command({ type: 'cancelPolicy', id: p.id })}>Withdraw</button></div>)}
    </Section>
    {confirm && <ConfirmDialog title="Queue fuel policy" confirmLabel="Queue policy" onCancel={() => setConfirm(false)} onConfirm={() => { command({ type: 'queueCommodity', patch: Object.fromEntries(Object.entries(patch).filter(([k, v]) => Math.abs(v - proposed[k as keyof CommodityPolicy]) > 1e-9)) }); setConfirm(false); }}>
      <ul className="list-disc space-y-1 pl-4">
        {Math.abs(ceiling - proposed.fuelCeiling) > 1e-9 && <li>fuelCeiling: RM{proposed.fuelCeiling.toFixed(2)} → RM{ceiling.toFixed(2)}</li>}
        {Math.abs(eligible - proposed.fuelEligible) > 1e-9 && <li>fuelEligible: {pct(proposed.fuelEligible, 1)} → {pct(eligible, 1)}</li>}
        <li>Effective from tomorrow.</li>
      </ul>
    </ConfirmDialog>}
  </>;
}
