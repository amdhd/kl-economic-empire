import { useState, type ReactNode } from 'react';
import { budgetFor, BUDGET_LABELS, SECTOR_IDS, SECTORS, TAX_LABELS } from '../../data/economic-baseline';
import { DEVELOPMENT_ANNUAL0 } from '../../data/world';
import { debtMYR, outlaysOf, ratingLabel, revenueOf, treasuryMYR } from '../../engine/government';
import { estimateTaxChange } from '../../engine/policy-preview';
import { useGame, useGameState, type PanelId } from '../../store/game-store';
import type { BudgetCategory, GameState, SectorId, TaxPolicy } from '../../types/game';
import { fullMoneyMinor, money, pct } from '../../utils/format';
import { HudIcon } from '../hud/HudIcon';
import { StatsStrip } from '../hud/StatsStrip';

type Tab = 'summary' | 'budget' | 'taxation' | 'loans' | 'production';
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'budget', label: 'Budget' },
  { id: 'taxation', label: 'Taxation' },
  { id: 'loans', label: 'Loans' },
  { id: 'production', label: 'Production' },
];
const CATS = Object.keys(BUDGET_LABELS) as BudgetCategory[];
const TAX_KEYS = Object.keys(TAX_LABELS) as (keyof TaxPolicy)[];
const TAX_SHORT: Record<keyof TaxPolicy, string> = { corporate: 'Corporate tax', property: 'Property levy', consumption: 'Consumption levy', household: 'Income surcharge' };

const BUDGET_INFO: Record<BudgetCategory | 'devex', { icon: string; text: string }> = {
  health: { icon: 'population', text: 'Hospitals and clinics. Real funding drives health coverage and service quality with a lag; cuts lower satisfaction and, if deep, trust.' },
  services: { icon: 'overview', text: 'Education and higher education. Raises service quality and the services outcome; most of it is wages that households spend.' },
  safety: { icon: 'debt', text: 'Defence and home affairs. Keeps the safety outcome up; spending buys from health/industry/tech sectors.' },
  development: { icon: 'projects', text: 'Works and transport operating allocations. Supports demand for technology, finance and construction services.' },
  admin: { icon: 'sources', text: 'Everything else in federal operations. Pure purchases: cutting it is the least visible saving, but it still lowers demand.' },
  transfers: { icon: 'population', text: 'Pensions and cash transfers. Go straight to household income; cutting them is unpopular and widens inequality.' },
  devex: { icon: 'projects', text: 'Federal development programme (capital). Builds public capital that raises productivity in every sector slowly. Allowed under the golden rule even when borrowing.' },
};

function Row({ icon, label, amount, tone, active, onClick, testid }: { icon: string; label: string; amount: string; tone: 'in' | 'out' | 'neutral'; active?: boolean; onClick?: () => void; testid?: string }) {
  return (
    <button className={`econ-row ${active ? 'is-active' : ''}`} onClick={onClick} data-testid={testid}>
      <span className="econ-row-icon"><HudIcon name={icon} size={18} /></span>
      <span className="econ-row-label">{label}</span>
      <span className={`econ-amount ${tone}`}><span>{tone === 'in' ? '+' : tone === 'out' ? '−' : ''}</span>{amount}</span>
    </button>
  );
}

function Detail({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="econ-detail">
      <div className="econ-detail-head"><h3>{title}</h3>{action}</div>
      {children}
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
  return <div className="econ-line"><span>{label}</span><span className={`econ-amount ${tone ?? 'neutral'}`}>{tone === 'in' ? '+ ' : tone === 'out' ? '− ' : ''}{value}</span></div>;
}

/** Last closed month's flows, or this month so far before the first close. */
function monthFlows(g: GameState) {
  const last = g.reports.at(-1);
  return { flows: last?.gov ?? g.government.mtd, label: last ? `${last.label} (closed)` : 'This month so far' };
}

export function EconomyWindow() {
  const g = useGameState();
  const setPanel = useGame.getState().setPanel;
  const [tab, setTab] = useState<Tab>('summary');
  const { flows, label } = monthFlows(g);
  const balance = revenueOf(flows) - outlaysOf(flows);
  return (
    <div className="econ-backdrop pointer-events-auto" role="dialog" aria-label="Economy" data-testid="economy-window">
      <div className="econ-window">
        <div className="econ-title">ECONOMY<button className="econ-close" onClick={() => setPanel(null)} aria-label="Close economy window">✕</button></div>
        <div className="econ-tabs" role="tablist">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)} data-testid={`econ-tab-${t.id}`}>{t.label.toUpperCase()}</button>)}
        </div>
        <div className="econ-body">
          {tab === 'summary' && <Summary g={g} balance={balance} label={label} />}
          {tab === 'budget' && <Budget g={g} balance={balance} label={label} />}
          {tab === 'taxation' && <Taxation g={g} balance={balance} label={label} />}
          {tab === 'loans' && <Loans g={g} balance={balance} label={label} />}
          {tab === 'production' && <Production g={g} balance={balance} label={label} />}
        </div>
        <div className="econ-foot">Simulated · fictional outcomes after the official 2027 opening position</div>
      </div>
    </div>
  );
}

function Balance({ balance, label }: { balance: number; label: string }) {
  return (
    <div className="econ-balance" title={`Revenue minus outlays · ${label}`}>
      <span>MONTHLY BALANCE<small>{label}</small></span>
      <b className={`econ-amount ${balance < 0 ? 'out' : 'in'}`} data-testid="monthly-balance"><span>{balance < 0 ? '−' : '+'}</span>{money(Math.abs(balance))}</b>
    </div>
  );
}

const go = (id: PanelId) => () => useGame.getState().setPanel(id);

function Summary({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const { flows } = monthFlows(g);
  return (
    <div className="econ-summary">
      <StatsStrip />
      <div className="econ-summary-grid">
        <Detail title="Cash positions">
          <Line label="Treasury balance" value={fullMoneyMinor(g.government.treasury)} />
          <div data-testid="bottom-fund-cash"><Line label="Sovereign fund cash" value={`${fullMoneyMinor(g.fund.myrCash)} · ${fullMoneyMinor(g.fund.usdCash, 'USD')}`} /></div>
          <Line label="Public debt" value={money(debtMYR(g.government))} />
          <p className="econ-note">Treasury cash is separate from the sovereign fund and central-bank reserves.</p>
        </Detail>
        <Detail title={`Fiscal flows · ${label}`}>
          <Line label="Revenue" value={money(revenueOf(flows))} tone="in" />
          <Line label="Outlays" value={money(outlaysOf(flows))} tone="out" />
          <Line label="Borrowing" value={money(flows.borrowing)} />
          <Balance balance={balance} label={label} />
        </Detail>
        <Detail title="More views">
          <div className="econ-links">
            {([['policies', 'Taxes & budget (full)'], ['fiscal', 'Fiscal rules'], ['debt', 'Treasury & debt'], ['fund', 'Sovereign fund'], ['commodities', 'Commodities'], ['economy', 'Economy analysis'], ['objectives', 'Objectives & score']] as [PanelId, string][]).map(([id, l]) => <button key={id} className="btn" onClick={go(id)}>{l}</button>)}
          </div>
        </Detail>
      </div>
    </div>
  );
}

function Budget({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const command = useGame.getState().command;
  const base = budgetFor(g);
  const pol = g.government.policies.budget;
  const pending = (k: BudgetCategory) => g.government.pending.filter((p) => p.kind === 'budget' && k in p.patch).map((p) => (p.patch as Record<string, number>)[k]).at(-1);
  const devPending = (g.government.pending.filter((p) => p.kind === 'development').at(-1)?.patch as { annual: number } | undefined)?.annual;
  const [sel, setSel] = useState<BudgetCategory | 'devex'>('health');
  const isDev = sel === 'devex';
  const current = isDev ? (devPending ?? g.fiscal.developmentAnnual) / 12 : pending(sel) ?? pol[sel];
  const opening = isDev ? DEVELOPMENT_ANNUAL0 / 12 : base[sel];
  const [draft, setDraft] = useState<Record<string, number>>({});
  const value = draft[sel] ?? current;
  const share = opening > 0 ? value / opening : 1;
  const { flows } = monthFlows(g);
  const outcome = sel === 'health' || sel === 'services' || sel === 'safety' ? g.controls.outcomes[sel] : null;
  const apply = () => {
    if (isDev) command({ type: 'setDevelopment', annual: value * 12 });
    else command({ type: 'queueBudget', patch: { [sel]: value } });
    setDraft({ ...draft, [sel]: undefined as unknown as number });
  };
  return (
    <div className="econ-columns">
      <div className="econ-list">
        {CATS.map((k) => <Row key={k} icon={BUDGET_INFO[k].icon} label={BUDGET_LABELS[k]} amount={money(pending(k) ?? pol[k])} tone="out" active={sel === k} onClick={() => setSel(k)} testid={`econ-budget-${k}`} />)}
        {g.world.enabled && <Row icon="projects" label="Development (capital)" amount={money((devPending ?? g.fiscal.developmentAnnual) / 12)} tone="out" active={isDev} onClick={() => setSel('devex')} testid="econ-budget-devex" />}
        <Row icon="debt" label="Debt interest" amount={money(flows.interest)} tone="out" onClick={() => undefined} />
        {g.world.enabled && <Row icon="commodities" label="Fuel & food subsidies" amount={money(flows.subsidy)} tone="out" onClick={go('commodities')} />}
        <Balance balance={balance} label={label} />
      </div>
      <Detail title={isDev ? 'Development (capital)' : BUDGET_LABELS[sel]} action={<button className="btn" onClick={() => setDraft({ ...draft, [sel]: opening })}>RESET</button>}>
        <label className="econ-slider">
          <span>Budget</span><span className="num">{Math.round(share * 100)} %</span>
          <input type="range" min={0} max={2.5} step={0.01} value={share} onChange={(e) => setDraft({ ...draft, [sel]: Math.round(Number(e.target.value) * opening / 1e6) * 1e6 })} aria-label="Budget share of opening" data-testid="econ-budget-slider" />
        </label>
        <div className="econ-section">
          <h4>MONTHLY AMOUNTS</h4>
          <Line label="Proposed" value={money(value)} tone="out" />
          <Line label="In force" value={money(isDev ? g.fiscal.developmentAnnual / 12 : pol[sel])} tone="out" />
          <Line label="Opening (Budget 2027)" value={money(opening)} />
        </div>
        <button className="btn btn-primary" disabled={Math.abs(value - current) < 1} onClick={apply} data-testid="econ-budget-apply">{isDev ? 'Queue from next month' : 'Queue from tomorrow'}</button>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon"><HudIcon name={BUDGET_INFO[sel].icon} size={34} /></span><h3>{isDev ? 'DEVELOPMENT' : BUDGET_LABELS[sel].toUpperCase()}</h3></div>
        <p>{BUDGET_INFO[sel].text}</p>
        <div className="econ-effects">
          {outcome !== null && <Line label="Outcome index" value={`${outcome.toFixed(0)}/100`} />}
          {isDev && <Line label="Public capital index" value={(g.fiscal.publicCapital / g.fiscal.publicCapital0).toFixed(3)} />}
          <Line label="Change vs in force" value={`${pct(value / Math.max(1, isDev ? g.fiscal.developmentAnnual / 12 : pol[sel]) - 1, 1, true)}`} />
          <Line label="Annual cost of change" value={money((value - current) * 12)} />
        </div>
      </div>
    </div>
  );
}

function Taxation({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const command = useGame.getState().command;
  const pol = g.government.policies.tax;
  const pending = (k: keyof TaxPolicy) => g.government.pending.filter((p) => p.kind === 'tax' && k in p.patch).map((p) => (p.patch as TaxPolicy)[k]).at(-1);
  const [sel, setSel] = useState<keyof TaxPolicy>('corporate');
  const [draft, setDraft] = useState<Partial<TaxPolicy>>({});
  const current = pending(sel) ?? pol[sel];
  const value = draft[sel] ?? current;
  const meta = TAX_LABELS[sel];
  const { flows } = monthFlows(g);
  const receipts: Record<keyof TaxPolicy, number> = { corporate: flows.taxCorporate, property: flows.taxProperty, consumption: flows.taxConsumption, household: flows.taxHousehold };
  const effect = estimateTaxChange(g, { ...pol, [sel]: value })[sel];
  return (
    <div className="econ-columns">
      <div className="econ-list">
        {TAX_KEYS.map((k) => <Row key={k} icon="policies" label={`${TAX_SHORT[k]} · ${pct(pending(k) ?? pol[k], 1)}`} amount={money(receipts[k])} tone="in" active={sel === k} onClick={() => setSel(k)} testid={`econ-tax-${k}`} />)}
        <Row icon="trade" label="Import tariffs" amount={money(flows.importTariff)} tone="in" onClick={go('trade')} />
        {g.world.enabled && <Row icon="soe" label="Petroleum income tax" amount={money(flows.petroleumTax)} tone="in" onClick={go('soe')} />}
        {g.world.enabled && <Row icon="soe" label="SOE dividends" amount={money(flows.soeDividend)} tone="in" onClick={go('soe')} />}
        {g.world.enabled && <Row icon="commodities" label="Commodity duties" amount={money(flows.commodityDuty)} tone="in" onClick={go('commodities')} />}
        <Row icon="sources" label="Other public receipts" amount={money(flows.federalGrant)} tone="in" />
        <Balance balance={balance} label={label} />
      </div>
      <Detail title={meta.label} action={<button className="btn" onClick={() => setDraft({ ...draft, [sel]: pol[sel] })}>RESET</button>}>
        <label className="econ-slider">
          <span>Rate</span><span className="num">{pct(value, 1)}</span>
          <input type="range" min={meta.min} max={meta.max} step={0.0025} value={value} onChange={(e) => setDraft({ ...draft, [sel]: Number(e.target.value) })} aria-label="Tax rate" data-testid="econ-tax-slider" />
        </label>
        <div className="econ-section">
          <h4>REVENUES</h4>
          <Line label={`Receipts · ${label}`} value={money(receipts[sel])} tone="in" />
          <Line label="Static estimate of change" value={money(Math.abs(effect))} tone={effect >= 0 ? 'in' : 'out'} />
        </div>
        <button className="btn btn-primary" disabled={Math.abs(value - current) < 1e-9} onClick={() => { command({ type: 'queueTax', patch: { [sel]: value } }); setDraft({}); }} data-testid="econ-tax-apply">Queue from next month</button>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon"><HudIcon name="policies" size={34} /></span><h3>{meta.label.toUpperCase()}</h3></div>
        <p>{meta.hint}</p>
        <p>The estimate holds demand, prices and profits fixed. Real receipts also move as the economy responds, and every change takes effect on the 1st of next month.</p>
      </div>
    </div>
  );
}

function Loans({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const command = useGame.getState().command;
  const gov = g.government;
  const [amount, setAmount] = useState(5);
  const { flows } = monthFlows(g);
  return (
    <div className="econ-columns">
      <div className="econ-list">
        <Row icon="debt" label="Bonds outstanding" amount={money(debtMYR(gov))} tone="neutral" active />
        <Row icon="debt" label={`Interest · ${label}`} amount={money(flows.interest)} tone="out" />
        <Row icon="debt" label="Principal repaid" amount={money(flows.principal)} tone="out" />
        <Row icon="debt" label="New borrowing" amount={money(flows.borrowing)} tone="in" />
        <Row icon="fiscal" label="Fiscal rules" amount={`credibility ${g.fiscal.credibility.toFixed(0)}`} tone="neutral" onClick={go('fiscal')} />
        <Balance balance={balance} label={label} />
      </div>
      <Detail title="Borrow or repay">
        <label className="econ-slider">
          <span>Amount</span><span className="num">RM{amount.toFixed(0)}bn</span>
          <input type="range" min={1} max={50} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Bond amount" data-testid="econ-loan-amount" />
        </label>
        <div className="econ-section">
          <h4>TERMS</h4>
          <Line label="New-issue yield" value={pct(gov.bondYield, 2)} />
          <Line label="Average cost of debt" value={pct(gov.avgDebtRate, 2)} />
          <Line label="Credit rating" value={ratingLabel(gov.creditRating)} />
          <Line label="Debt / GDP" value={pct(g.indicators.debtToGdp, 1)} />
          <Line label="Treasury cash" value={money(treasuryMYR(gov))} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => command({ type: 'issueBonds', amount: amount * 1e9 })} data-testid="econ-issue">Issue bonds</button>
          <button className="btn" onClick={() => command({ type: 'repayDebt', amount: amount * 1e9 })} data-testid="econ-repay">Repay debt</button>
        </div>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon"><HudIcon name="debt" size={34} /></span><h3>GOVERNMENT BONDS</h3></div>
        <p>Bonds bring cash and an equal debt. Yields are the MGS benchmark plus a premium that rises with debt, deficits, arrears and falling fiscal credibility. Borrowing to pay operating costs breaks the golden rule.</p>
        <p>Repaying needs treasury cash. Borrowing stops at your debt cap or if markets close to you.</p>
      </div>
    </div>
  );
}

function Production({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const last = g.reports.at(-1);
  const [sel, setSel] = useState<SectorId>('fin');
  const s = g.sectors[sel];
  return (
    <div className="econ-columns">
      <div className="econ-list">
        {SECTOR_IDS.map((j) => <Row key={j} icon="economy" label={SECTORS[j].name} amount={last ? money(last.gdpBySector[j]) : '—'} tone="neutral" active={sel === j} onClick={() => setSel(j)} testid={`econ-sector-${j}`} />)}
        {g.world.enabled && <Row icon="commodities" label="Oil, gas, palm & rubber" amount={last?.resourceGdp ? money(last.resourceGdp) : '—'} tone="neutral" onClick={go('commodities')} />}
        <Balance balance={balance} label={label} />
      </div>
      <Detail title={SECTORS[sel].name}>
        <div className="econ-section">
          <h4>LAST CLOSED MONTH</h4>
          <Line label="Value added" value={last ? money(last.gdpBySector[sel]) : '—'} />
          <Line label="Pre-tax profit" value={money(s.lastMonthProfit)} tone={s.lastMonthProfit >= 0 ? 'in' : 'out'} />
          <Line label="Investment / month" value={money(s.investmentMonthly)} />
        </div>
        <div className="econ-section">
          <h4>NOW</h4>
          <Line label="Capacity utilisation" value={pct(s.utilization, 0)} />
          <Line label="Employment" value={`${(s.employment / 1e6).toFixed(2)}m`} />
          <Line label="Price index" value={s.price.toFixed(3)} />
        </div>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon"><HudIcon name="economy" size={34} /></span><h3>{SECTORS[sel].short.toUpperCase()}</h3></div>
        <p>Output is what households, government, investment and exports demand, limited by capital and workers. Utilisation above ~85% pushes prices up and attracts investment; below it, firms cut back.</p>
        <p>GDP counts value added only. Share trading never adds to GDP.</p>
      </div>
    </div>
  );
}
