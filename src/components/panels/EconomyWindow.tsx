import { useState, type ReactNode } from 'react';
import { budgetFor, BUDGET_LABELS, SECTOR_IDS, SECTORS, TAX_LABELS } from '../../data/economic-baseline';
import { FUEL_SUBSIDY0, SUBSIDY_REFERENCE } from '../../data/world';
import { fuelSubsidyDaily, wheatSubsidyDaily } from '../../engine/world';
import { debtMYR, outlaysOf, ratingLabel, revenueOf, treasuryMYR } from '../../engine/government';
import { estimateTaxChange } from '../../engine/policy-preview';
import { useGame, useGameState, type PanelId } from '../../store/game-store';
import type { BudgetCategory, GameState, GovMonthFlows, SectorId, TaxPolicy } from '../../types/game';
import { daysInMonth, formatKL, monthKeyLabel } from '../../engine/time';
import { FICTIONAL_LABEL, fullMoneyMinor, gdpUsd, money, num as numFmt, pct } from '../../utils/format';
import { NON_TAX_REVENUE_2027 } from '../../data/non-tax-revenue';
import { householdDemand } from '../../engine/economy';
import { activeTaxKeys, effectiveIncomeTaxRate, employmentOf, INCOME_TAX_BANDS } from '../../engine/income-tax';
import { HudIcon } from '../hud/HudIcon';
import { StatsStrip } from '../hud/StatsStrip';
import { TimeChart } from '../charts/TimeChart';
import { housingStatus } from '../../engine/housing';

type Tab = 'summary' | 'loans' | 'production';
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'loans', label: 'Loans' },
  { id: 'production', label: 'Production' },
];
const CATS = Object.keys(BUDGET_LABELS) as BudgetCategory[];
const TAX_SHORT: Record<keyof TaxPolicy, string> = { corporate: 'Corporate tax', property: 'Property levy', consumption: 'Consumption levy', household: 'Income surcharge', incomeTax: 'Personal income tax' };

/** Per-line icon colours, so the list scans by colour like city-builder budget screens. */
const LINE_COLOR: Record<string, string> = {
  health: '#f07a6a', services: '#6fb3f2', safety: '#e9c46a', development: '#8fd3c7', admin: '#b6c2cf', transfers: '#7ed99a',
  devex: '#f0a95b', interest: '#a9b8f0', subsidy: '#f2b45a', corporate: '#9ad77d', property: '#e8b06a', consumption: '#7fd0f0',
  household: '#c9a3ef', incomeTax: '#c9a3ef', tariff: '#e2c778', petroleum: '#f59e0b', soe: '#9fb6e8', duty: '#84cc16', other: '#a2b7cc', debt: '#aebdf1',
};

const BUDGET_INFO: Record<BudgetCategory, { icon: string; text: string }> = {
  health: { icon: 'population', text: 'Hospitals and clinics. Real funding drives health coverage and service quality with a lag; cuts lower satisfaction and, if deep, trust.' },
  services: { icon: 'overview', text: 'Education and higher education. Raises service quality and the services outcome; most of it is wages that households spend.' },
  safety: { icon: 'debt', text: 'Defence and home affairs. Keeps the safety outcome up; spending buys from health/industry/tech sectors.' },
  development: { icon: 'projects', text: 'Works and transport operating allocations. Supports demand for technology, finance and construction services.' },
  admin: { icon: 'sources', text: 'Everything else in federal operations. Pure purchases: cutting it is the least visible saving, but it still lowers demand.' },
  transfers: { icon: 'population', text: 'Pensions and cash transfers. Go straight to household income; cutting them is unpopular and widens inequality.' },
};

function Row({ icon, label, amount, tone, active, onClick, testid, color }: { icon: string; label: string; amount: string; tone: 'in' | 'out' | 'neutral'; active?: boolean; onClick?: () => void; testid?: string; color?: string }) {
  return (
    <button className={`econ-row ${active ? 'is-active' : ''}`} onClick={onClick} data-testid={testid}>
      <span className="econ-row-icon" style={color && !active ? { color } : undefined}><HudIcon name={icon} size={18} /></span>
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

/** A year of fiscal flows: the last 12 closed months, or the closed months so far scaled up to a year. Before the first
 * close it scales up this month so far. `development` is the development-programme part of capex. */
function annualFlows(g: GameState) {
  const recent = g.reports.slice(-12);
  const parts = recent.length ? recent.map((r) => ({ f: r.gov, dev: r.developmentPaid ?? 0, days: daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1) }))
    : [{ f: g.government.mtd, dev: g.government.mtdDevelopmentPaid ?? 0, days: Math.max(1, g.scheduler.mtdDays) }];
  const days = parts.reduce((a, p) => a + p.days, 0);
  const k = recent.length === 12 ? 1 : 365 / days;
  const flows = Object.fromEntries((Object.keys(parts[0].f) as (keyof GovMonthFlows)[]).map((key) => [key, parts.reduce((a, p) => a + (p.f[key] ?? 0), 0) * k])) as unknown as GovMonthFlows;
  const development = parts.reduce((a, p) => a + p.dev, 0) * k;
  const label = recent.length === 12 ? 'last 12 months' : recent.length ? `${recent.length} month${recent.length > 1 ? 's' : ''} so far, scaled to a year` : 'this month so far, scaled to a year';
  return { flows, development, label };
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

/** Pinned list footer: the tab's yearly total, the other side of the budget, and the annual balance (the same measure
 * as the fiscal rule's deficit) above the last closed month. */
function AnnualBalance({ g, balance, label, total, other, bare }: { g: GameState; balance: number; label: string; total: ReactNode; other: 'revenue' | 'spending'; bare?: boolean }) {
  if (bare) return <div className="econ-annual">{total}</div>; // the Fiscal control tab shows the balance once, with the budget editor
  const year = annualFlows(g);
  const revenue = revenueOf(year.flows), spending = outlaysOf(year.flows), net = revenue - spending;
  return (
    <div className="econ-annual" data-testid="annual-balance-block">
      {total}
      {other === 'revenue' ? <Line label={`Revenue · per year (${year.label})`} value={money(revenue)} tone="in" /> : <Line label={`Spending · per year (${year.label})`} value={money(spending)} tone="out" />}
      <div className="econ-balance" title={`Revenue minus spending · ${year.label}`}>
        <span>ANNUAL BALANCE<small>{year.label} · {pct(Math.abs(net) / Math.max(1, g.indicators.nominalGdpAnnual), 2)} of GDP</small></span>
        <b className={`econ-amount ${net < 0 ? 'out' : 'in'}`} data-testid="annual-balance"><span>{net < 0 ? '−' : '+'}</span>{money(Math.abs(net))}</b>
      </div>
      <Balance balance={balance} label={label} />
    </div>
  );
}

const go = (id: PanelId) => () => useGame.getState().setPanel(id);

const HOUSING_TONE = { good: 'text-emerald-300', watch: 'text-amber-300', bad: 'text-rose-300' } as const;
/** House price index readout (D-118): one number, a plain label and a small trend. Information only. */
function HousingCard({ g }: { g: GameState }) {
  const st = housingStatus(g);
  const data = g.reports.filter((r) => r.housingIndex !== undefined).map((r) => ({ t: r.monthKey, hpi: r.housingIndex as number }));
  if (!data.length) data.push({ t: g.scheduler.lastMonthKey, hpi: g.housing.index });
  return (
    <Detail title="Housing">
      <div data-testid="housing-card">
        <div className="flex items-baseline gap-2"><span className="num text-[20px] font-semibold text-white" data-testid="housing-index">{g.housing.index.toFixed(1)}</span><span className="label">house price index, start = 100</span></div>
        <div className={`text-[12px] font-semibold ${HOUSING_TONE[st.tone]}`} data-testid="housing-status" data-tone={st.tone}>{st.label} · prices are {st.ratio.toFixed(2)}× incomes vs the start</div>
        <TimeChart data={data} xKey="t" xFormat={(v) => monthKeyLabel(Number(v))} series={[{ key: 'hpi', name: 'House price index', color: '#e8b06a' }]} yFormat={(v) => v.toFixed(0)} unit="index, start = 100 · monthly" dataLabel={FICTIONAL_LABEL} height={90} />
        <p className="econ-note">Rises with incomes, jobs, investment and scarce homes; falls with higher rates, a higher property levy and oversupply. Unaffordable homes shave a little off approval. Simulated, not real market data.</p>
      </div>
    </Detail>
  );
}

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
          <div data-testid="bottom-bnm-reserves"><Line label="BNM FX reserves (not spendable)" value={money(g.centralBank.usdReserves / 100, 'USD')} /></div>
          <p className="econ-note">Treasury cash is the government&apos;s working float, refilled by receipts and borrowing. It is separate from the sovereign fund and from BNM&apos;s foreign-currency reserves, which only back FX operations.</p>
        </Detail>
        <Detail title={`Fiscal flows · ${label}`}>
          <Line label="Revenue" value={money(revenueOf(flows))} tone="in" />
          <Line label="Outlays" value={money(outlaysOf(flows))} tone="out" />
          <Line label="Borrowing" value={money(flows.borrowing)} />
          <Balance balance={balance} label={label} />
        </Detail>
        <HousingCard g={g} />
        <Detail title="More views">
          <div className="econ-links">
            {([['fiscal', 'Fiscal rules'], ['debt', 'Treasury & debt'], ['fund', 'Sovereign fund'], ['commodities', 'Commodities'], ['economy', 'Economy analysis'], ['objectives', 'Objectives & score']] as [PanelId, string][]).map(([id, l]) => <button key={id} className="btn" onClick={go(id)}>{l}</button>)}
          </div>
        </Detail>
      </div>
    </div>
  );
}

export function BudgetEditor({ g }: { g: GameState }) {
  const { flows, label } = monthFlows(g);
  return <Budget g={g} balance={revenueOf(flows) - outlaysOf(flows)} label={label} />;
}
function Budget({ g, balance, label }: { g: GameState; balance: number; label: string }) {
  const command = useGame.getState().command;
  const base = budgetFor(g);
  const pol = g.government.policies.budget;
  const pending = (k: BudgetCategory) => g.government.pending.filter((p) => p.kind === 'budget' && k in p.patch).map((p) => (p.patch as Record<string, number>)[k]).at(-1);
  const [selRaw, setSel] = useState<BudgetCategory | 'subsidy'>('health');
  const isSub = selRaw === 'subsidy';
  const sel: BudgetCategory = isSub ? 'health' : selRaw;
  const current = pending(sel) ?? pol[sel];
  const opening = base[sel];
  const [draft, setDraft] = useState<Record<string, number>>({});
  const value = draft[sel] ?? current;
  const share = opening > 0 ? value / opening : 1;
  const year = annualFlows(g);
  const yf = year.flows;
  const builds = Math.max(0, yf.capex - year.development);
  const budgetTotal = CATS.reduce((a, k) => a + 12 * (pending(k) ?? pol[k]), 0) + (g.world.enabled ? g.fiscal.developmentAnnual : 0)
    + builds + yf.policyGrant + yf.exportSupport + yf.emergency + yf.interest + yf.subsidy;
  const outcome = sel === 'health' || sel === 'services' || sel === 'safety' ? g.controls.outcomes[sel] : null;
  const apply = () => {
    command({ type: 'queueBudget', patch: { [sel]: value } });
    setDraft({ ...draft, [sel]: undefined as unknown as number });
  };
  return (
    <div className="econ-columns">
      <div className="econ-list">
        {CATS.map((k) => <Row key={k} icon={BUDGET_INFO[k].icon} label={BUDGET_LABELS[k]} amount={money(12 * (pending(k) ?? pol[k]))} tone="out" active={selRaw === k} onClick={() => setSel(k)} testid={`econ-budget-${k}`} color={LINE_COLOR[k]} />)}
        <Row icon="projects" label="Projects & infrastructure builds" amount={money(builds)} tone="out" onClick={go(g.infra ? 'infra' : 'projects')} color={LINE_COLOR.devex} testid="econ-budget-builds" />
        <Row icon="fdi" label="FDI & policy grants" amount={money(yf.policyGrant)} tone="out" onClick={go('fdi')} color={LINE_COLOR.transfers} testid="econ-budget-grants" />
        {yf.exportSupport > 0 && <Row icon="trade" label="Export support" amount={money(yf.exportSupport)} tone="out" onClick={go('trade')} color={LINE_COLOR.tariff} />}
        {yf.emergency > 0 && <Row icon="debt" label="Emergency relief" amount={money(yf.emergency)} tone="out" onClick={() => undefined} color={LINE_COLOR.health} />}
        <Row icon="debt" label="Debt interest" amount={money(yf.interest)} tone="out" onClick={go('debt')} color={LINE_COLOR.interest} />
        {g.world.enabled && <Row icon="commodities" label="Subsidies (petrol & food)" amount={money(yf.subsidy)} tone="out" active={isSub} onClick={() => setSel('subsidy')} color={LINE_COLOR.subsidy} testid="econ-budget-subsidy" />}
        <AnnualBalance g={g} balance={balance} label={label} other="revenue"
          total={<div className="econ-total" data-testid="budget-total"><span>TOTAL SPENDING · PER YEAR<small>budget lines in force; other lines {year.label}</small></span><b className="econ-amount out"><span>−</span>{money(budgetTotal)}</b></div>} />
      </div>
      {isSub ? <SubsidyDetail g={g} paid={yf.subsidy} label={year.label} /> : <>
      <Detail title={BUDGET_LABELS[sel]} action={<button className="btn" onClick={() => setDraft({ ...draft, [sel]: opening })}>RESET</button>}>
        <label className="econ-slider">
          <span>Budget</span><span className="num">{Math.round(share * 100)} %</span>
          <input type="range" min={0} max={2.5} step={0.01} value={share} onChange={(e) => setDraft({ ...draft, [sel]: Math.round(Number(e.target.value) * opening / 1e6) * 1e6 })} aria-label="Budget share of opening" data-testid="econ-budget-slider" />
        </label>
        <div className="econ-section">
          <h4>ANNUAL AMOUNTS · PER YEAR</h4>
          <Line label="Proposed" value={money(value * 12)} tone="out" />
          <Line label="In force" value={money(pol[sel] * 12)} tone="out" />
          <Line label="Opening (Budget 2027)" value={money(opening * 12)} />
        </div>
        {g.controls.plans.some((p) => p.category === sel) && Math.abs(value - current) >= 1 && <p className="econ-note" data-testid={`plan-replaced-${sel}`}>This line follows a ministry plan that raises it over time. Queuing a new amount replaces that plan.</p>}
        <button className="btn btn-primary" disabled={Math.abs(value - current) < 1} onClick={apply} data-testid="econ-budget-apply">Queue from tomorrow</button>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon" style={{ color: LINE_COLOR[sel] }}><HudIcon name={BUDGET_INFO[sel].icon} size={34} /></span><h3>{BUDGET_LABELS[sel].toUpperCase()}</h3></div>
        <p>{BUDGET_INFO[sel].text}</p>
        <div className="econ-effects">
          {outcome !== null && <Line label="Outcome index" value={`${outcome.toFixed(0)}/100`} />}
          <Line label="Change vs in force" value={`${pct(value / Math.max(1, pol[sel]) - 1, 1, true)}`} />
          <Line label="Annual cost of change" value={money((value - current) * 12)} />
        </div>
        <QueuedPolicies g={g} />
      </div>
      </>}
    </div>
  );
}

/** Petrol and food subsidies as modelled, beside the official subsidy figures they should be read against. */
function SubsidyDetail({ g, paid, label }: { g: GameState; paid: number; label: string }) {
  const R = SUBSIDY_REFERENCE;
  const petrol = fuelSubsidyDaily(g) * 365, food = wheatSubsidyDaily(g) * 365;
  return <>
    <Detail title="Subsidies">
      <div className="econ-section" data-testid="subsidy-detail">
        <h4>MODELLED · PER YEAR</h4>
        <Line label="Petrol (RON95) at today's price" value={money(petrol)} tone="out" />
        <Line label="Food (wheat & rice) at today's price" value={money(food)} tone="out" />
        <Line label={`Paid · ${label}`} value={money(paid)} tone="out" />
        <Line label="Opening petrol bill (Budget 2027 basis)" value={money(FUEL_SUBSIDY0)} />
      </div>
      <div className="econ-links">
        <button className="btn" onClick={go('oil')}>Petrol ceiling & eligibility</button>
        <button className="btn" onClick={go('commodities')}>Food subsidy</button>
      </div>
    </Detail>
    <div className="econ-info">
      <div className="econ-info-head"><span className="econ-info-icon" style={{ color: LINE_COLOR.subsidy }}><HudIcon name="commodities" size={34} /></span><h3>SUBSIDIES · OFFICIAL FIGURES</h3></div>
      <div className="econ-section">
        <Line label="Subsidies & social assistance 2025 (actual)" value={money(R.subsidiesAndAid2025Actual * 1e9)} />
        <Line label="2026 Budget" value={money(R.subsidiesAndAid2026Budget * 1e9)} />
        <Line label="2027 estimate" value={money(R.subsidiesAndAid2027Estimate * 1e9)} />
        <Line label="Petrol & diesel, Budget 2026" value={money(R.fuelBudget2026 * 1e9)} />
        <Line label="Petrol & diesel, PM's 2026 outlook" value={`≈ ${money(R.fuelOutturn2026Pm * 1e9)}`} />
        <Line label="Blanket RON95 (2024 speech)" value={money(R.ron95Blanket2024 * 1e9)} />
        <Line label="LPG, 2025 audit" value={money(R.lpg2025 * 1e9)} />
        <Line label="Pensions & gratuities, Budget 2025" value={money(R.pensions2025Budget * 1e9)} />
      </div>
      <p className="econ-note">The game models the petrol and food subsidies, which swing with oil, the ringgit and your ceiling. Diesel, electricity, LPG, cooking oil and cash aid are inside Administration and Pensions & transfers, so their cost does not move with prices here. Pensions & transfers is the pension and cash-aid line.</p>
    </div>
  </>;
}

export function TaxEditor({ g }: { g: GameState }) {
  const { flows, label } = monthFlows(g);
  return <Taxation g={g} balance={revenueOf(flows) - outlaysOf(flows)} label={label} bare />;
}
function Taxation({ g, balance, label, bare }: { g: GameState; balance: number; label: string; bare?: boolean }) {
  const command = useGame.getState().command;
  const pol = g.government.policies.tax;
  const pending = (k: keyof TaxPolicy) => g.government.pending.filter((p) => p.kind === 'tax' && k in p.patch).map((p) => (p.patch as TaxPolicy)[k]).at(-1);
  const [sel, setSel] = useState<keyof TaxPolicy>('corporate');
  const [draft, setDraft] = useState<Partial<TaxPolicy>>({});
  const current = pending(sel) ?? pol[sel];
  const value = draft[sel] ?? current;
  const meta = TAX_LABELS[sel];
  const { flows } = monthFlows(g);
  const year = annualFlows(g), yf = year.flows;
  const receipts: Record<keyof TaxPolicy, number> = { corporate: flows.taxCorporate, property: flows.taxProperty, consumption: flows.taxConsumption, household: flows.taxHousehold, incomeTax: flows.taxIncome };
  const annual: Record<keyof TaxPolicy, number> = { corporate: yf.taxCorporate, property: yf.taxProperty, consumption: yf.taxConsumption, household: yf.taxHousehold, incomeTax: yf.taxIncome };
  const TAX_KEYS = activeTaxKeys(g);
  const effect = estimateTaxChange(g, { ...pol, [sel]: value })[sel];
  return (
    <div className="econ-columns">
      <div className="econ-list">
        {TAX_KEYS.map((k) => <Row key={k} icon="policies" label={`${TAX_SHORT[k]} · ${pct(pending(k) ?? pol[k], 1)}`} amount={money(annual[k])} tone="in" active={sel === k} onClick={() => setSel(k)} testid={`econ-tax-${k}`} color={LINE_COLOR[k]} />)}
        <Row icon="trade" label="Import tariffs" amount={money(yf.importTariff)} tone="in" onClick={go('trade')} color={LINE_COLOR.tariff} />
        {g.world.enabled && <Row icon="soe" label="Petroleum income tax" amount={money(yf.petroleumTax)} tone="in" onClick={go('soe')} color={LINE_COLOR.petroleum} />}
        {g.world.enabled && <Row icon="soe" label="SOE dividends" amount={money(yf.soeDividend)} tone="in" onClick={go('soe')} color={LINE_COLOR.soe} />}
        {g.world.enabled && <Row icon="commodities" label="Commodity duties" amount={money(yf.commodityDuty)} tone="in" onClick={go('commodities')} color={LINE_COLOR.duty} />}
        {g.policy?.enabled && <Row icon="policies" label="Policy levies & hub fees" amount={money(yf.policyLevy)} tone="in" onClick={go('decisions')} color={LINE_COLOR.duty} testid="econ-levies" />}
        {g.baseline.nonTax && <Row icon="sources" label="Fees, licences & fines" amount={money(yf.nonTaxRevenue)} tone="in" onClick={() => undefined} color={LINE_COLOR.other} testid="econ-nontax" />}
        <Row icon="sources" label="Other public receipts" amount={money(yf.federalGrant)} tone="in" color={LINE_COLOR.other} />
        <AnnualBalance g={g} balance={balance} label={label} other="spending" bare={bare}
          total={<div className="econ-total" data-testid="revenue-total"><span>TOTAL REVENUE · PER YEAR<small>{year.label}</small></span><b className="econ-amount in"><span>+</span>{money(revenueOf(yf))}</b></div>} />
      </div>
      <Detail title={meta.label} action={<button className="btn" onClick={() => setDraft({ ...draft, [sel]: pol[sel] })}>RESET</button>}>
        <label className="econ-slider reverse">
          <span>{sel === 'incomeTax' ? 'Band rates (× statutory)' : 'Rate'}</span><span className="num">{pct(value, 1)}</span>
          <input type="range" min={meta.min} max={meta.max} step={0.0025} value={value} onChange={(e) => setDraft({ ...draft, [sel]: Number(e.target.value) })} aria-label="Tax rate" data-testid="econ-tax-slider" />
        </label>
        <div className="econ-section">
          <h4>REVENUES</h4>
          <Line label={`Receipts · per year (${year.label})`} value={money(annual[sel])} tone="in" />
          <Line label={`Receipts · ${label}`} value={money(receipts[sel])} tone="in" />
          <Line label="Static estimate of change" value={money(Math.abs(effect))} tone={effect >= 0 ? 'in' : 'out'} />
        </div>
        <button className="btn btn-primary" disabled={Math.abs(value - current) < 1e-9} onClick={() => { command({ type: 'queueTax', patch: { [sel]: value } }); setDraft({}); }} data-testid="econ-tax-apply">Queue from tomorrow</button>
      </Detail>
      <div className="econ-info">
        <div className="econ-info-head"><span className="econ-info-icon" style={{ color: LINE_COLOR[sel] }}><HudIcon name="policies" size={34} /></span><h3>{meta.label.toUpperCase()}</h3></div>
        <p>{meta.hint}</p>
        {sel === 'incomeTax' && <IncomeTaxBands g={g} scale={value} />}
        {g.baseline.nonTax && (
          <div className="econ-section" data-testid="non-tax-breakdown">
            <h4>NON-TAX REVENUE · 2027 ESTIMATE · PER YEAR</h4>
            {NON_TAX_REVENUE_2027.map((r) => <Line key={r.id} label={r.label} value={money(r.annual)} />)}
            <p className="econ-note">Fees, licences, fines and rentals from the MOF revenue estimates grow with nominal GDP. Investment returns come through SOE dividends.</p>
          </div>
        )}
        <QueuedPolicies g={g} />
        <p>The estimate holds demand, prices and profits fixed. Real receipts also move as the economy responds, and every change takes effect tomorrow.</p>
      </div>
    </div>
  );
}

/** Tax, budget and development changes waiting for their start day, with Withdraw, and the latest policy log lines. */
function QueuedPolicies({ g }: { g: GameState }) {
  const command = useGame.getState().command;
  return (
    <div className="econ-section" data-testid="queued-policies">
      <h4>QUEUED CHANGES</h4>
      {g.government.pending.length === 0 && <p className="econ-note">Nothing queued.</p>}
      {g.government.pending.map((p) => (
        <div key={p.id} className="econ-line" data-testid={`queued-${p.id}`}>
          <span>{p.label} · from {formatKL(p.effectiveMin).date}</span>
          <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => command({ type: 'cancelPolicy', id: p.id })}>Withdraw</button>
        </div>
      ))}
      <h4>RECENT POLICY</h4>
      {[...g.policyLog].reverse().slice(0, 6).map((l, i) => <p key={i} className="econ-note">{formatKL(l.atMin).date} — {l.label}</p>)}
    </div>
  );
}

/** Statutory bands, scaled by the proposed schedule, and the average rate a typical worker pays. */
function IncomeTaxBands({ g, scale }: { g: GameState; scale: number }) {
  const jobs = employmentOf(g);
  const avg = jobs > 0 ? (householdDemand(g, 0).wages * 365) / jobs : 0;
  let lower = 0;
  return (
    <div className="econ-section" data-testid="income-tax-bands">
      <h4>CHARGEABLE INCOME · RM / YEAR</h4>
      {INCOME_TAX_BANDS.map((b) => {
        const row = <Line key={b.upTo} label={`${numFmt(lower)}–${b.upTo === Infinity ? 'above' : numFmt(b.upTo)}`} value={`${pct(b.rate, 0)} → ${pct(b.rate * scale, 1)}`} />;
        lower = b.upTo;
        return row;
      })}
      <p className="econ-note">Personal relief RM9,000 and EPF relief RM4,000 apply first. Average earner pays {pct(effectiveIncomeTaxRate(avg, scale), 1)} of earnings{avg > 0 ? ` (average pay RM${numFmt(avg)}/yr)` : ''}.</p>
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
        {SECTOR_IDS.map((j) => <Row key={j} icon="economy" label={SECTORS[j].name} amount={last ? gdpUsd(last.gdpBySector[j], last.myrPerUsd) : '—'} tone="neutral" active={sel === j} onClick={() => setSel(j)} testid={`econ-sector-${j}`} />)}
        {g.world.enabled && <Row icon="commodities" label="Oil, gas, palm & rubber" amount={last?.resourceGdp ? gdpUsd(last.resourceGdp, last.myrPerUsd) : '—'} tone="neutral" onClick={go('commodities')} />}
        <Balance balance={balance} label={label} />
      </div>
      <Detail title={SECTORS[sel].name}>
        <div className="econ-section">
          <h4>LAST CLOSED MONTH</h4>
          <Line label="Value added (US$)" value={last ? gdpUsd(last.gdpBySector[sel], last.myrPerUsd) : '—'} />
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
