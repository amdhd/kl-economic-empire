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

export function ControlsPanel() {
  const g = useGameState(), c = g.controls;
  const [sector,setSector] = useState<SectorId>('tech'), [cut,setCut] = useState(5), [months,setMonths] = useState(12);
  const [category,setCategory] = useState<BudgetCategory>('health'), [budget,setBudget] = useState(g.government.policies.budget.health/1e6), [growth,setGrowth] = useState(3), [years,setYears] = useState(3);
  const [term,setTerm] = useState(c.debt.newTermMonths), [refinance,setRefinance] = useState(c.debt.refinance*100);
  const [lower,setLower] = useState(c.fxBand.lower), [upper,setUpper] = useState(c.fxBand.upper), [daily,setDaily] = useState(c.fxBand.dailyUSD/1e6), [floor,setFloor] = useState(c.fxBand.reserveFloorUSD/1e9);
  const [review,setReview] = useState<{cmd:Command;description:string}|null>(null);
  const incentiveCost = Math.max(0,g.sectors[sector].lastMonthProfit)*Math.min(cut/100,g.government.policies.tax.corporate);
  const sectorTaken = c.incentives.some(i=>i.sector===sector&&i.endMin>g.clock.hour*60);
  const input = 'input num !w-24';
  return <PanelShell title="Economic controls" subtitle="Fictional policy instruments · costs, limits and implementation lags" width={740}>
    <Section title="Sector-specific corporate tax incentives">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> cuts the corporate tax one sector pays, for a set number of months. <b>How it can lift GDP:</b> firms keep more profit, so they invest more a little later (with a lag). <b>Cost:</b> less tax income for the government while it runs. Each sector can have one incentive at a time.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs"><select className="input" value={sector} onChange={e=>setSector(e.target.value as SectorId)} aria-label="Incentive sector">{SECTOR_IDS.map(j=><option key={j} value={j}>{SECTORS[j].short}</option>)}</select><label>Relief pp <input className={input} type="number" min="0" max="15" value={cut} onChange={e=>setCut(+e.target.value)} /></label><label>Months <input className={input} type="number" min="1" max="60" value={months} onChange={e=>setMonths(+e.target.value)} /></label></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">Current sector rate {pct(sectorTax(g,sector,g.clock.hour*60))}. Estimated receipts forgone {money(incentiveCost)}/month using the last profit base. Last closed month actual relief across sectors: {money(c.lastTaxReliefMYR)}. This is a static estimate; losses receive no refund. Relief starts next month, expires automatically and improves after-tax returns and investment with a lag.</p></details>
      <button className="btn" data-testid="review-incentive" disabled={sectorTaken} onClick={()=>setReview({cmd:{type:'sectorIncentive',sector,cut:cut/100,months},description:`${SECTORS[sector].name}: ${cut}pp relief for ${months} months. Estimated fiscal cost ${money(incentiveCost)}/month; no guaranteed growth.`})}>Review incentive</button>
      {sectorTaken && <p className="mt-2 text-xs text-amber-300">{SECTORS[sector].short} already has an incentive running or scheduled (listed below). Pick another sector, or wait for it to expire.</p>}
      {c.incentives.length>0 && <p className="mt-3 text-xs font-semibold text-slate-300">Your incentives</p>}
      {c.incentives.map((i,n)=><p className="mt-2 text-xs text-amber-200" key={n}>{SECTORS[i.sector].name}: {pct(i.cut)} relief · scheduled expiry {formatKL(i.endMin).date}</p>)}
    </Section>
    <Section title="Multi-year ministry appropriations">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> schedules a ministry's budget to step up each year automatically, so you don't re-set it. <b>GDP effect:</b> small. It mainly lifts the health, education and safety scores, and the extra spending needs cash or borrowing. Use the main Budget panel if you want to move spending now.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs"><select className="input" value={category} onChange={e=>{const k=e.target.value as BudgetCategory;setCategory(k);setBudget(g.government.policies.budget[k]/1e6);}} aria-label="Ministry category">{Object.entries(BUDGET_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><label>RM m/month <input className={input} type="number" value={budget} onChange={e=>setBudget(+e.target.value)} /></label><label>Annual % <input className={input} type="number" value={growth} onChange={e=>setGrowth(+e.target.value)} /></label><label>Years <input className={input} type="number" value={years} onChange={e=>setYears(+e.target.value)} /></label></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">First appropriation next month; escalation each anniversary. Nominal budgets still require cash or financing. Service indices respond gradually to real spending and arrears. Indices are fictional coverage/readiness proxies, not hospital beds or measured attainment.</p></details>
      <button className="btn" onClick={()=>setReview({cmd:{type:'ministryPlan',category,monthly:budget*1e6,growth:growth/100,years},description:`${years} years at ${money(budget*1e6)}/month initially, escalating ${growth}% annually. Current-year nominal commitment ${money(budget*1e6*12)}. No funds are reserved upfront.`})}>Review ministry plan</button>
      <div className="mt-2 text-xs">Health coverage {c.outcomes.health.toFixed(1)}/100 · Education readiness {c.outcomes.services.toFixed(1)}/100 · Safety capacity {c.outcomes.safety.toFixed(1)}/100</div>
      {c.plans.map(p=><div className="mt-2 flex justify-between text-xs" key={p.category}><span>{BUDGET_LABELS[p.category]} · {p.everyMonths === 1 ? `indexed ${((Math.pow(1 + p.growth, 12) - 1) * 100).toFixed(1)}%/yr in monthly steps · ${p.remaining} months left` : `${p.remaining} future appropriations`} · next {money(p.monthly)}/month</span><button className="btn" onClick={()=>setReview({cmd:{type:'cancelMinistryPlan',category:p.category},description:'Cancel future scheduled appropriations; retain the currently effective budget.'})}>Cancel plan</button></div>)}
    </Section>
    <Section title="Debt maturity & refinancing">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> chooses how long new government bonds last and how much of the repaid debt you refinance. <b>GDP effect:</b> none directly. It changes interest cost and how much you borrow, so it protects the budget rather than boosting growth.</p>
      <div className="flex gap-3 text-xs"><select className="input" value={term} onChange={e=>setTerm(+e.target.value)} aria-label="New debt term"><option value={36}>3 years · lower coupon</option><option value={120}>10 years · base coupon</option><option value={240}>20 years · higher coupon</option></select><label>Refinance % <input className={input} type="number" min="0" max="100" value={refinance} onChange={e=>setRefinance(+e.target.value)} /></label></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">New issuance only: 3-year coupon −0.20pp; 20-year +0.50pp. Existing debt retains its coupon. This is an amortising pool, not bullet bonds: monthly principal = debt ÷ weighted term ({(c.debt.averageMonths/12).toFixed(1)} years now). Refinancing below 100% lowers the rebuilt cash buffer by the unfunded share of principal paid; essential bridge financing remains available within the debt cap.</p></details>
      <button className="btn" onClick={()=>setReview({cmd:{type:'debtStrategy',termMonths:term,refinance:refinance/100},description:`Future issuance uses ${term/12}-year amortisation. Refinance ${refinance}% of principal paid; a lower setting uses treasury liquidity. Debt caps and market access still apply.`})}>Review debt strategy</button>
    </Section>
    <Section title="Automatic FX intervention band">
      <p className="mb-2 text-[13px] text-slate-200"><b>What it does:</b> automatically buys or sells dollars when the ringgit moves outside your range. <b>GDP effect:</b> none directly. It steadies the exchange rate, but it uses up your dollar reserves.</p>
      <div className="flex flex-wrap gap-2 text-xs"><label>Lower MYR/USD <input className={input} type="number" step="0.01" value={lower} onChange={e=>setLower(+e.target.value)} /></label><label>Upper <input className={input} type="number" step="0.01" value={upper} onChange={e=>setUpper(+e.target.value)} /></label><label>$ m/day <input className={input} type="number" value={daily} onChange={e=>setDaily(+e.target.value)} /></label><label>Reserve floor $ bn <input className={input} type="number" value={floor} onChange={e=>setFloor(+e.target.value)} /></label></div>
      <details className="my-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Technical details</summary><p className="mt-1">One operation per daily fixing outside the band. Uses the same inventory, 0.2% spread and $1bn shared daily turnover limit as manual intervention. The reserve floor limits USD sales; USD purchases require MYR inventory. This is not a guaranteed peg.</p></details>
      <button className="btn" onClick={()=>setReview({cmd:{type:'fxBand',enabled:!c.fxBand.enabled,lower,upper,dailyUSD:daily*1e6,reserveFloorUSD:floor*1e9},description:`${c.fxBand.enabled?'Disable':'Enable'} automatic intervention at ${lower}–${upper} MYR/USD, up to $${daily}m/day, maintaining $${floor}bn reserves.`})}>{c.fxBand.enabled?'Disable band':'Review & enable band'}</button><p className="mt-2 text-xs text-amber-200">{c.fxBand.status}</p>
    </Section>
    {review && <ConfirmDialog title="Approve economic control" confirmLabel="Apply control" onCancel={()=>setReview(null)} onConfirm={()=>{useGame.getState().command(review.cmd);setReview(null);}}>{review.description}</ConfirmDialog>}
  </PanelShell>;
}
