import { useState } from 'react';
import { BUDGET_LABELS, SECTOR_IDS, SECTORS } from '../../data/economic-baseline';
import { formatKL } from '../../engine/time';
import { sectorTax } from '../../engine/policy-controls';
import type { Command } from '../../engine/game';
import type { BudgetCategory, SectorId } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { Section } from '../ui';
import { PanelShell } from './PanelShell';
import { ConfirmDialog } from './ConfirmDialog';

function Slide({label,value,min,max,step,unit,onChange}:{label:string;value:number;min:number;max:number;step:number;unit:string;onChange:(v:number)=>void}) {
  return <label className="flex min-w-[200px] flex-1 flex-col gap-1"><span className="flex justify-between"><span>{label}</span><b className="text-slate-100">{value.toLocaleString('en-MY')}{unit}</b></span><input type="range" min={min} max={max} step={step} value={Math.min(max,Math.max(min,value))} onChange={e=>onChange(+e.target.value)} aria-label={label} /></label>;
}
export function ControlsPanel() {
  const g = useGameState(), c = g.controls;
  const [lower,setLower] = useState(c.fxBand.lower), [upper,setUpper] = useState(c.fxBand.upper), [daily,setDaily] = useState(c.fxBand.dailyUSD/1e6), [floor,setFloor] = useState(c.fxBand.reserveFloorUSD/1e9);
  const input = 'input num !w-24';
  const [review,setReview] = useState<{cmd:Command;description:string}|null>(null);
  return <PanelShell title="Economic controls" subtitle="Fictional policy instruments · costs, limits and implementation lags" width={740}>
    <p className="text-[12px] text-slate-400">Sector tax relief and multi-year ministry plans are set in Money & debt, Fiscal control.</p>
    <Section title="Automatic FX intervention band">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> automatically buys or sells dollars when the ringgit moves outside your range. <b>GDP effect:</b> none directly. It steadies the exchange rate, but it uses up your dollar reserves.</p>
      <div className="flex flex-wrap gap-2 text-xs"><label>Lower MYR/USD <input className={input} type="number" step="0.01" value={lower} onChange={e=>setLower(+e.target.value)} /></label><label>Upper <input className={input} type="number" step="0.01" value={upper} onChange={e=>setUpper(+e.target.value)} /></label><label>$ m/day <input className={input} type="number" value={daily} onChange={e=>setDaily(+e.target.value)} /></label><label>Reserve floor $ bn <input className={input} type="number" value={floor} onChange={e=>setFloor(+e.target.value)} /></label></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">One operation per daily fixing outside the band. Uses the same inventory, 0.2% spread and $1bn shared daily turnover limit as manual intervention. The reserve floor limits USD sales; USD purchases require MYR inventory. This is not a guaranteed peg.</p></details>
      <button className="btn" onClick={()=>setReview({cmd:{type:'fxBand',enabled:!c.fxBand.enabled,lower,upper,dailyUSD:daily*1e6,reserveFloorUSD:floor*1e9},description:`${c.fxBand.enabled?'Disable':'Enable'} automatic intervention at ${lower}–${upper} MYR/USD, up to $${daily}m/day, maintaining $${floor}bn reserves.`})}>{c.fxBand.enabled?'Disable band':'Review & enable band'}</button><p className="mt-2 text-xs text-amber-200">{c.fxBand.status}</p>
    </Section>
    {review && <ConfirmDialog title="Approve economic control" confirmLabel="Apply control" onCancel={()=>setReview(null)} onConfirm={()=>{useGame.getState().command(review.cmd);setReview(null);}}>{review.description}</ConfirmDialog>}
  </PanelShell>;
}

/** Sector tax relief and multi-year ministry plans. Shown in the Fiscal control tab (D-115). */
export function SectorReliefAndPlans() {
  const g = useGameState(), c = g.controls;
  const [sector,setSector] = useState<SectorId>('tech'), [cut,setCut] = useState(5), [months,setMonths] = useState(12);
  const [category,setCategory] = useState<BudgetCategory>('health'), [budget,setBudget] = useState(Math.round(g.government.policies.budget.health/1e6)), [growth,setGrowth] = useState(3), [years,setYears] = useState(3);
  const [review,setReview] = useState<{cmd:Command;description:string}|null>(null);
  const incentiveCost = Math.max(0,g.sectors[sector].lastMonthProfit)*Math.min(cut/100,g.government.policies.tax.corporate);
  const sectorTaken = c.incentives.some(i=>i.sector===sector&&i.endMin>g.clock.hour*60);
  return <>
    <Section title="Sector-specific corporate tax incentives">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> cuts the corporate tax one sector pays, for a set number of months. <b>How it can lift GDP:</b> the sector keeps more of each ringgit of profit, which raises its after-tax return, so firms there spend more on new capacity a few months later. More capacity means more output, hiring and sales to other sectors. It is not instant and not guaranteed: if demand is weak or the sector has no profit, relief does little. <b>Cost:</b> less corporate tax income for the government while it runs, so it can widen the deficit. Each sector can have one incentive at a time.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs"><select className="input" value={sector} onChange={e=>setSector(e.target.value as SectorId)} aria-label="Incentive sector">{SECTOR_IDS.map(j=><option key={j} value={j}>{SECTORS[j].name}</option>)}</select><Slide label="Tax relief" value={cut} min={0} max={15} step={1} unit=" pp" onChange={setCut} /><Slide label="Lasts" value={months} min={1} max={60} step={1} unit=" months" onChange={setMonths} /></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">Current sector rate {pct(sectorTax(g,sector,g.clock.hour*60))}. Estimated receipts forgone {money(incentiveCost)}/month using the last profit base. Last closed month actual relief across sectors: {money(c.lastTaxReliefMYR)}. This is a static estimate; losses receive no refund. Relief starts next month, expires automatically and improves after-tax returns and investment with a lag.</p></details>
      <button className="btn" data-testid="review-incentive" disabled={sectorTaken} onClick={()=>setReview({cmd:{type:'sectorIncentive',sector,cut:cut/100,months},description:`${SECTORS[sector].name}: ${cut}pp relief for ${months} months. Estimated fiscal cost ${money(incentiveCost)}/month; no guaranteed growth.`})}>Review incentive</button>
      {sectorTaken && <p className="mt-2 text-xs text-amber-300">{SECTORS[sector].name} already has an incentive running or scheduled (listed below). Pick another sector, or wait for it to expire.</p>}
      {c.incentives.length>0 && <p className="mt-3 text-xs font-semibold text-slate-300">Your incentives</p>}
      {c.incentives.map((i,n)=><p className="mt-2 text-xs text-amber-200" key={n}>{SECTORS[i.sector].name}: {pct(i.cut)} relief · scheduled expiry {formatKL(i.endMin).date}</p>)}
    </Section>
    <Section title="Multi-year ministry appropriations">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> schedules a ministry's budget to step up each year automatically, so you don't re-set it. <b>GDP effect:</b> small. The extra ringgit is spent on wages and purchases (a short-term demand boost), and it mainly lifts the health, education and safety scores that make people happier and more productive over time. It needs cash or borrowing, so it raises debt. A negative yearly change cuts the budget the same way. Use the main Budget panel if you want to move spending now.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs"><select className="input" value={category} onChange={e=>{const k=e.target.value as BudgetCategory;setCategory(k);setBudget(Math.round(g.government.policies.budget[k]/1e6));}} aria-label="Ministry category">{Object.entries(BUDGET_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><Slide label="Starting budget" value={budget} min={0} max={Math.max(1000,Math.ceil(g.government.policies.budget[category]/1e6*2/100)*100)} step={50} unit=" RMm/month" onChange={setBudget} /><Slide label="Yearly change" value={growth} min={-10} max={15} step={1} unit="%" onChange={setGrowth} /><Slide label="Plan length" value={years} min={1} max={5} step={1} unit=" years" onChange={setYears} /></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">First appropriation next month; escalation each anniversary. Nominal budgets still require cash or financing. Service indices respond gradually to real spending and arrears. Indices are fictional coverage/readiness proxies, not hospital beds or measured attainment.</p></details>
      <button className="btn" onClick={()=>setReview({cmd:{type:'ministryPlan',category,monthly:budget*1e6,growth:growth/100,years},description:`${years} years at ${money(budget*1e6)}/month initially, escalating ${growth}% annually. Current-year nominal commitment ${money(budget*1e6*12)}. No funds are reserved upfront.`})}>Review ministry plan</button>
      <div className="mt-2 text-xs">Health coverage {c.outcomes.health.toFixed(1)}/100 · Education readiness {c.outcomes.services.toFixed(1)}/100 · Safety capacity {c.outcomes.safety.toFixed(1)}/100</div>
      {c.plans.map(p=><div className="mt-2 flex justify-between text-xs" key={p.category}><span>{BUDGET_LABELS[p.category]} · {p.everyMonths === 1 ? `indexed ${((Math.pow(1 + p.growth, 12) - 1) * 100).toFixed(1)}%/yr in monthly steps · ${p.remaining} months left` : `${p.remaining} future appropriations`} · next {money(p.monthly)}/month</span><button className="btn" onClick={()=>setReview({cmd:{type:'cancelMinistryPlan',category:p.category},description:'Cancel future scheduled appropriations; retain the currently effective budget.'})}>Cancel plan</button></div>)}
    </Section>
    
    {review && <ConfirmDialog title="Approve economic control" confirmLabel="Apply control" onCancel={()=>setReview(null)} onConfirm={()=>{useGame.getState().command(review.cmd);setReview(null);}}>{review.description}</ConfirmDialog>}
  </>;
}
