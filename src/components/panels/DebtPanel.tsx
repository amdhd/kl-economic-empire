import { debtMYR, isInflow, newIssueCoupon, ratingLabel, treasuryMYR } from '../../engine/government';
import type { GovMonthFlows } from '../../types/game';
import { klDayLabel } from '../../engine/time';
import { useGameState } from '../../store/game-store';
import { bnTick, money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { OFFICIAL_FEDERAL_DEBT } from '../../data/official-history';
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
  const gov = g.government;
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
        <TimeChart data={OFFICIAL_FEDERAL_DEBT} xKey="date" series={[{ key: 'debt', name: 'Federal Government debt', color: '#f87171' }]} yFormat={bnTick} unit="RM billion · year-end" dataLabel="MOF / Auditor General" height={130} />
        <p className="mt-1 text-[11.5px] text-slate-400">Reported direct debt of the federal government, not public-sector debt or guarantees. Treasury cash is not published as a comparable annual series, so only debt is shown. Your campaign starts from the June 2026 point.</p>
      </Section>}
      <Section title="Treasury and debt">
        <TimeChart data={data} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'treasury', name: 'Treasury', color: '#34d399' }, { key: 'debt', name: 'Debt', color: '#f87171' }]} yFormat={bnTick} unit="RM · daily" height={130} />
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
      <p className="text-[11.5px] text-slate-400">The cash buffer, debt cap, development budget and debt terms are set in the Fiscal control tab. Debt above {g.baseline.profile === 'malaysia' ? '65%' : '35%'} of GDP or deficits above 3% raise the risk premium.</p>
      <p className="text-[11.5px] text-slate-400">Issuing bonds and repaying debt are in the Fiscal control tab, next to the borrowing rule and debt terms.</p>
    </PanelShell>
  );
}
