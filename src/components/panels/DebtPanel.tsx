import { useState } from 'react';
import { debtMYR, isInflow, newIssueCoupon, ratingLabel, treasuryMYR } from '../../engine/government';
import type { GovMonthFlows } from '../../types/game';
import { klDayLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { OFFICIAL_FEDERAL_DEBT } from '../../data/official-history';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';
import { Section, Stat } from '../ui';

const FLOW_LABEL: Record<keyof GovMonthFlows, string> = {
  dealEscrowOut: 'Deal escrow reserved', dealEscrowIn: 'Deal escrow returned/settled',
  taxCorporate: 'Corporate tax', taxProperty: 'Property levy', taxConsumption: 'Consumption levy', taxHousehold: 'Household surcharge', taxIncome: 'Personal income tax', nonTaxRevenue: 'Fees, licences & fines',
  federalGrant: 'Other public receipts', importTariff: 'Import tariffs', exportSupport: 'Export support',
  soeDividend: 'SOE dividends', petroleumTax: 'Petroleum income tax', commodityDuty: 'Commodity duties', subsidy: 'Fuel & food subsidies', borrowing: 'Bond proceeds', swfTransferIn: 'SWF distribution in', opex: 'Operating outlays',
  capex: 'Capital outlays', interest: 'Debt interest', principal: 'Principal repaid', emergency: 'Emergency', swfContribution: 'SWF contribution',
  policyLevy: 'Carbon tax & worker levy', policyGrant: 'Policy programmes & FDI grants',
};

export function DebtPanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const gov = g.government;
  const [buf, setBuf] = useState(gov.policies.borrowing.cashBufferMonths);
  const [cap, setCap] = useState(gov.policies.borrowing.maxDebtToGdp);
  const [amt, setAmt] = useState(1000);
  const [confirm, setConfirm] = useState<'issue' | 'repay' | null>(null);
  const last = g.reports.at(-1);
  const data = g.daily.slice(-400).map((d) => ({ t: d.t, treasury: d.treasury / 1e9, debt: d.debt / 1e9 }));
  return (
    <PanelShell title="Treasury & public debt" subtitle="Bonds bring cash AND debt. Yields = MGS benchmark + a fiscal risk premium." width={660}>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="Treasury" value={money(treasuryMYR(gov))} />
        <Stat label="Debt" value={money(debtMYR(gov))} sub={`${pct(g.indicators.debtToGdp)} of GDP`} />
        <Stat label="New-issue yield" value={pct(newIssueCoupon(g), 2)} sub={`avg cost ${pct(gov.avgDebtRate, 2)}`} />
        <Stat label="Credit rating" value={ratingLabel(gov.creditRating)} sub={gov.marketAccess ? 'market access' : 'NO market access'} tone={gov.marketAccess ? undefined : 'down'} />
        <Stat label="Interest (last mo.)" value={last ? money(last.gov.interest) : '—'} />
        <Stat label="Public assets" value={money(gov.publicAssets)} sub="depreciated infrastructure" />
        <Stat label="Unpaid obligations" value={money(gov.unpaidObligations)} tone={gov.unpaidObligations > 1e6 ? 'down' : undefined} sub={gov.daysInArrears ? `${gov.daysInArrears} days in arrears` : 'none'} />
        <Stat label="MGS 10y (exogenous)" value={pct(g.external.mgs10, 2)} sub={`OPR ${pct(g.external.opr, 2)}`} />
      </div>
      {g.baseline.profile === 'malaysia' && <Section title="Federal debt · past 10 years · official reference">
        <TimeChart data={OFFICIAL_FEDERAL_DEBT} xKey="date" series={[{ key: 'debt', name: 'Federal Government debt', color: '#f87171' }]} yFormat={(v) => `RM${v.toFixed(0)}bn`} unit="RM billion · year-end" dataLabel="MOF / Auditor General" height={130} />
        <p className="mt-1 text-[11.5px] text-slate-400">Reported direct debt of the federal government, not public-sector debt or guarantees. Treasury cash is not published as a comparable annual series, so only debt is shown. Your campaign starts from the June 2026 point.</p>
      </Section>}
      <Section title="Treasury and debt">
        <TimeChart data={data} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'treasury', name: 'Treasury', color: '#34d399' }, { key: 'debt', name: 'Debt', color: '#f87171' }]} yFormat={(v) => v.toFixed(1)} unit="RM billion · daily" height={130} />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Section title="Month-to-date cash flows · MYR">
          <div className="num space-y-0.5 text-[12px]" data-testid="mtd-flows">
            {(Object.entries(gov.mtd) as [keyof GovMonthFlows, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-slate-400">{FLOW_LABEL[k]}</span><span className={isInflow(k) ? 'up' : 'down'}>{isInflow(k) ? '+' : '−'}{money(v)}</span></div>
            ))}
          </div>
        </Section>
        <Section title="Treasury journal · latest postings">
          <div className="num scroll-thin max-h-44 space-y-0.5 overflow-y-auto text-[11.5px]" data-testid="treasury-journal">
            {[...gov.ledger].reverse().slice(0, 30).map((l, i) => (
              <div key={i} className="flex justify-between gap-2"><span className="text-slate-400">{FLOW_LABEL[l.kind]}</span><span className={l.amountMinor >= 0 ? 'up' : 'down'}>{money(l.amountMinor / 100, 'MYR', 2)}</span><span className="text-slate-500">bal {money(l.balanceMinor / 100)}</span></div>
            ))}
            {!gov.ledger.length && <div className="text-slate-500">No postings yet — start the clock.</div>}
          </div>
        </Section>
      </div>
      <Section title="Borrowing rule (applies immediately)">
        <div className="grid grid-cols-2 gap-4 text-[12.5px]">
          <label>
            <div className="mb-1 flex justify-between"><span>Cash buffer</span><b className="num">{buf.toFixed(2)} months of outlays</b></div>
            <input type="range" min={0.25} max={4} step={0.25} value={buf} onChange={(e) => setBuf(Number(e.target.value))} />
          </label>
          <label>
            <div className="mb-1 flex justify-between"><span>Debt cap</span><b className="num">{pct(cap, 0)} of GDP</b></div>
            <input type="range" min={0.1} max={0.8} step={0.05} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
          </label>
        </div>
        <p className="mt-1 text-[11.5px] text-slate-400">Monthly principal is debt divided by the weighted amortisation term ({g.controls.debt.averageMonths.toFixed(1)} months). The refinancing strategy adjusts cash-buffer rebuilding; essential bridge financing still obeys the debt cap and market access. Debt above {g.baseline.profile === 'malaysia' ? '65%' : '35%'} of GDP or deficits above 3% raise the risk premium. Set terms and refinancing in Economic controls.</p>
        <button className="btn mt-2" disabled={buf === gov.policies.borrowing.cashBufferMonths && cap === gov.policies.borrowing.maxDebtToGdp} onClick={() => command({ type: 'setBorrowing', patch: { cashBufferMonths: buf, maxDebtToGdp: cap } })}>Apply rule</button>
      </Section>
      <Section title="Discretionary operations">
        <div className="flex items-center gap-2 text-[12.5px]">
          <input className="input num !w-32" type="number" min={1} value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} aria-label="Amount RM millions" />
          <span className="text-slate-400">RM m</span>
          <button className="btn" disabled={!(amt > 0) || !gov.marketAccess} onClick={() => setConfirm('issue')}>Issue bonds</button>
          <button className="btn" disabled={!(amt > 0) || amt * 1e6 > treasuryMYR(gov)} onClick={() => setConfirm('repay')}>Repay debt</button>
        </div>
      </Section>
      {confirm && (
        <ConfirmDialog title={confirm === 'issue' ? `Issue RM ${amt}m of bonds` : `Repay RM ${amt}m of debt`} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { command({ type: confirm === 'issue' ? 'issueBonds' : 'repayDebt', amount: amt * 1e6 }); setConfirm(null); }}>
          {confirm === 'issue' ? `Treasury +RM ${amt}m and debt +RM ${amt}m at ≈${pct(newIssueCoupon(g), 2)}. Borrowing is not income; net worth is unchanged until the money is spent.` : `Treasury and debt both fall by RM ${amt}m, saving ≈${money(amt * 1e6 * gov.avgDebtRate)} interest a year.`}
        </ConfirmDialog>
      )}
    </PanelShell>
  );
}
