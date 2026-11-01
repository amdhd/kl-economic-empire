import { useState } from 'react';
import { DEVELOPMENT_ANNUAL0 } from '../../data/world';
import type { Command } from '../../engine/game';
import { newIssueCoupon, ratingBreakdown, ratingLabel, treasuryMYR } from '../../engine/government';
import { formatKL } from '../../engine/time';
import { useGame, useGameState, type PanelId } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { BudgetEditor, TaxEditor } from './EconomyWindow';
import { FiscalRuleSections } from './FiscalPanel';
import { PolicyRateSections } from './CentralBankPanel';
import { Fuel, Petronas } from './OilPanel';
import { CommodityPolicySection } from './CommoditiesPanel';
import { TradePolicySection } from './TradePanel';
import { SectorReliefAndPlans } from './ControlsPanel';

const notch = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;

/** Every control that moves the credit rating, the deficit or the cost of debt, with the readout pinned on top (D-115). */
export function FiscalControlHub() {
  const g = useGameState();
  const gov = g.government, f = g.fiscal, command = useGame.getState().command;
  const last = f.history.at(-1);
  const pendingDev = gov.pending.filter(p => p.kind === 'development').at(-1);
  const [dev, setDev] = useState(((pendingDev?.patch as { annual: number } | undefined)?.annual ?? f.developmentAnnual) / 1e9);
  const [buf, setBuf] = useState(gov.policies.borrowing.cashBufferMonths);
  const [cap, setCap] = useState(gov.policies.borrowing.maxDebtToGdp);
  const [term, setTerm] = useState(g.controls.debt.newTermMonths);
  const [refi, setRefi] = useState(g.controls.debt.refinance * 100);
  const [amt, setAmt] = useState(1000);
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  const deficit = last?.deficit ?? g.indicators.deficitToGdp;
  const rb = ratingBreakdown(g, g.indicators.debtToGdp, deficit, gov.mtdArrearsDays > 0 ? 1 : 0);
  const go = (id: PanelId) => () => useGame.getState().setPanel(id);
  return <div className="space-y-3" data-testid="fiscal-hub">
    <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-b border-slate-700/60 bg-slate-950/90 px-4 py-2 backdrop-blur" data-testid="hub-readout">
      <div className="grid grid-cols-5 gap-3">
        <Stat label="Credit rating" value={ratingLabel(gov.creditRating)} sub={gov.marketAccess ? `score ${gov.creditRating.toFixed(2)}` : 'NO market access'} tone={gov.marketAccess ? undefined : 'down'} />
        <Stat label="Debt / GDP" value={pct(g.indicators.debtToGdp, 1)} sub={`rating-free to ${pct(rb.debtFree, 0)}`} />
        <Stat label="Deficit · 12 mo" value={pct(deficit, 2)} sub={`rating-free to ${pct(rb.deficitFree, 1)}`} />
        <Stat label="New-issue yield" value={pct(newIssueCoupon(g), 2)} sub={`avg cost ${pct(gov.avgDebtRate, 2)}`} />
        <Stat label="Credibility" value={`${f.credibility.toFixed(0)}/100`} sub="fiscal rules" />
      </div>
    </div>
    <Section title="What moves the rating">
      <p className="text-[12px] leading-snug text-slate-300" data-testid="rating-breakdown">
        Score starts at 9 (AA). Debt above {pct(rb.debtFree, 0)} of GDP: <b>{notch(rb.debt)}</b> · deficit above {pct(rb.deficitFree, 1)}: <b>{notch(rb.deficit)}</b> · fiscal-rule credibility: <b>{notch(rb.credibility)}</b> · unpaid bills: <b>{notch(rb.arrears)}</b>. Each whole notch changes the label; a score below 2 closes the bond market. The bond yield adds a premium for debt above {g.baseline.profile === 'malaysia' ? '65%' : '35%'} of GDP and for deficits above {pct(nationalDeficitFree(g), 1)}.
        Everything below changes one of these: spending and development lower or raise the deficit, taxes and the new levers move revenue, borrowing terms move debt cost and the cash buffer.
      </p>
    </Section>
    <Section title="Development expenditure · effective tomorrow">
      <label className="block text-[12px]">Federal development programme · RM{dev.toFixed(0)}bn a year <span className="text-slate-400">(in force RM{(f.developmentAnnual / 1e9).toFixed(1)}bn; Budget 2027 estimate RM{(DEVELOPMENT_ANNUAL0 / 1e9).toFixed(1)}bn)</span>
        <input type="range" min={0} max={160} step={1} value={dev} onChange={e => setDev(Number(e.target.value))} aria-label="Development expenditure" data-testid="dev-budget" />
      </label>
      <p className="mt-1 text-[11.5px] text-slate-400">Cutting it is the quickest way to shrink the deficit and the costliest for later growth: public capital raises productivity slowly.</p>
      <button className="btn btn-primary mt-2" data-testid="review-dev" disabled={dev * 1e9 === (pendingDev?.patch as { annual: number } | undefined)?.annual || (!pendingDev && Math.abs(dev * 1e9 - f.developmentAnnual) < 1e6)}
        onClick={() => setReview({ cmd: { type: 'setDevelopment', annual: dev * 1e9 }, title: 'Change development expenditure', body: `Set development spending to RM${dev.toFixed(0)}bn a year from tomorrow (now RM${(f.developmentAnnual / 1e9).toFixed(1)}bn). The deficit changes by roughly ${pct((dev * 1e9 - f.developmentAnnual) / g.indicators.nominalGdpAnnual, 2, true)} of GDP before second-round effects.` })}>Review development budget</button>
      {pendingDev && <p className="mt-2 text-[12px] text-amber-200">{pendingDev.label} · from {formatKL(pendingDev.effectiveMin).date}</p>}
    </Section>
    <Section title="Borrowing rule (applies immediately)">
      <div className="grid grid-cols-2 gap-4 text-[12.5px]">
        <label><div className="mb-1 flex justify-between"><span>Cash buffer</span><b className="num">{buf.toFixed(2)} months of outlays</b></div>
          <input type="range" min={0.25} max={4} step={0.25} value={buf} onChange={e => setBuf(Number(e.target.value))} aria-label="Cash buffer" /></label>
        <label><div className="mb-1 flex justify-between"><span>Debt cap</span><b className="num">{pct(cap, 0)} of GDP</b></div>
          <input type="range" min={0.1} max={0.8} step={0.05} value={cap} onChange={e => setCap(Number(e.target.value))} aria-label="Debt cap" /></label>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-400">A bigger buffer means more borrowing now and a safer cash position; a lower cap stops bond issues sooner and can leave bills unpaid, which costs 3 rating notches.</p>
      <button className="btn mt-2" data-testid="hub-apply-borrowing" disabled={buf === gov.policies.borrowing.cashBufferMonths && cap === gov.policies.borrowing.maxDebtToGdp} onClick={() => command({ type: 'setBorrowing', patch: { cashBufferMonths: buf, maxDebtToGdp: cap } })}>Apply rule</button>
    </Section>
    <Section title="Debt maturity & refinancing">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <select className="input" value={term} onChange={e => setTerm(+e.target.value)} aria-label="New debt term"><option value={36}>3 years · coupon −0.20pp</option><option value={120}>10 years · base coupon</option><option value={240}>20 years · coupon +0.50pp</option></select>
        <label>Refinance % of principal paid <input className="input num ml-1 !w-20" type="number" min={0} max={100} step={5} value={refi} onChange={e => setRefi(+e.target.value)} aria-label="Refinance share" /></label>
        <button className="btn" data-testid="review-debt" disabled={term === g.controls.debt.newTermMonths && refi / 100 === g.controls.debt.refinance}
          onClick={() => setReview({ cmd: { type: 'debtStrategy', termMonths: term, refinance: refi / 100 }, title: 'Change debt strategy', body: `Future issuance uses ${term / 12}-year amortisation. Refinance ${refi}% of principal paid; a lower setting uses treasury cash. Existing debt keeps its coupon.` })}>Review debt strategy</button>
      </div>
    </Section>
    <Section title="Issue bonds or repay debt (discretionary)">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <input className="input num !w-32" type="number" min={1} value={amt} onChange={e => setAmt(Math.max(0, Number(e.target.value)))} aria-label="Amount RM millions" />
        <span className="text-slate-400">RM m</span>
        <button className="btn" disabled={!(amt > 0) || !gov.marketAccess} onClick={() => setReview({ cmd: { type: 'issueBonds', amount: amt * 1e6 }, title: `Issue RM ${amt}m of bonds`, body: `Treasury +RM ${amt}m and debt +RM ${amt}m at ≈${pct(newIssueCoupon(g), 2)}. Borrowing is not income; net worth is unchanged until the money is spent.` })}>Issue bonds</button>
        <button className="btn" disabled={!(amt > 0) || amt * 1e6 > treasuryMYR(gov)} onClick={() => setReview({ cmd: { type: 'repayDebt', amount: amt * 1e6 }, title: `Repay RM ${amt}m of debt`, body: `Treasury and debt both fall by RM ${amt}m, saving ≈${money(amt * 1e6 * gov.avgDebtRate)} interest a year.` })}>Repay debt</button>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-400">These are government bonds: borrowing raises debt and cash together; repaying needs treasury cash. Monthly refinancing follows the term and refinance settings above. They are not BNM bills or reserves, which are in the Central bank tab.</p>
    </Section>
    <Section title="Ministry budgets (queued from tomorrow)">
      <div className="econ-embed" data-testid="hub-budget"><BudgetEditor g={g} /></div>
    </Section>
    <Section title="Tax rates (queued from tomorrow)">
      <div className="econ-embed" data-testid="hub-taxes"><TaxEditor g={g} /></div>
    </Section>
    <FiscalRuleSections />
    <PolicyRateSections />
    <Fuel />
    <CommodityPolicySection />
    <Petronas />
    <TradePolicySection />
    <SectorReliefAndPlans />
    <Section title="Other levers">
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        {([
          ['central', 'Central bank: bond buying, bills and FX reserves', 'BNM balance sheet and the ringgit, not government debt'],
          ['ministry', 'Trade ministry', 'export programmes, trade deals and talks'],
          ['soe', 'State enterprises', 'Khazanah payout and special dividends'],
        ] as [PanelId, string, string][]).map(([id, label, sub]) => <button key={id} className="btn !h-auto !items-start !text-left" data-testid={`hub-go-${id}`} onClick={go(id)}><span className="block font-semibold">{label}</span><span className="block text-[11px] font-normal text-slate-400">{sub}</span></button>)}
      </div>
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </div>;
}

const nationalDeficitFree = (g: ReturnType<typeof useGameState>) => (g.world.enabled ? 0.045 : 0.03);
