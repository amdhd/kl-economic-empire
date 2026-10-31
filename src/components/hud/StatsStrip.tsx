import { debtMYR, treasuryMYR } from '../../engine/government';
import { computeScore } from '../../engine/indicators';
import { navMYR } from '../../engine/sovereign-fund';
import { useGameState, useGame } from '../../store/game-store';
import { fx, gdpUsd, money, pct } from '../../utils/format';

function Cell({ label, value, sub, tone, hint, onClick, testid }: { label: string; value: string; sub?: string; tone?: string; hint: string; onClick?: () => void; testid?: string }) {
  return (
    <button onClick={onClick} title={hint} className="min-w-0 flex-1 rounded-lg px-2.5 py-1 text-left transition hover:bg-slate-700/40" data-testid={testid}>
      <div className="label truncate">{label}</div>
      <div className="num truncate text-[14.5px] font-semibold text-white">{value}</div>
      {sub && <div className={`num truncate text-[10.5px] ${tone ?? 'text-slate-400'}`}>{sub}</div>}
    </button>
  );
}

export function StatsStrip() {
  const g = useGameState();
  const { setPanel, explain } = useGame.getState();
  const ind = g.indicators;
  const nav = navMYR(g);
  const last = g.reports.at(-1);
  const navChg = last ? nav / last.fundNav - 1 : nav / g.scheduler.startNav - 1;
  const tone = (x: number, good = true) => (x === 0 ? undefined : (x > 0) === good ? 'up' : 'down');
  return (
    <div className="stats-strip pointer-events-auto flex items-stretch gap-0.5" data-testid="stats">
      <Cell label="GDP (annualised)" value={gdpUsd(ind.nominalGdpAnnual, g.external.myrPerUsd)} sub={`real ${pct(ind.realGrowthYoY, 1, true)} ${g.reports.length >= 12 ? 'YoY' : 'vs start'}`} tone={tone(ind.realGrowthYoY)} hint="Nominal GDP in US dollars at today’s MYR/USD = sector value added + net product taxes, last closed month × 365 / calendar days. Growth is real (deflated)." onClick={() => explain('gdp')} testid="stat-gdp" />
      <Cell label="Treasury" value={money(treasuryMYR(g.government))} sub={g.government.unpaidObligations > 1e6 ? `arrears ${money(g.government.unpaidObligations)}` : `rating ${ratingOf(g.government.creditRating)}`} tone={g.government.unpaidObligations > 1e6 ? 'down' : undefined} hint="Government cash (separate from the SWF)" onClick={() => explain('treasury')} testid="stat-treasury" />
      <Cell label="SWF NAV" value={money(nav)} sub={`${pct(navChg, 2, true)} this month`} tone={tone(navChg)} hint="Sovereign fund net asset value in MYR (cash + holdings at last simulated prices, FX-adjusted)" onClick={() => setPanel('fund')} testid="stat-nav" />
      <Cell label="Public debt" value={money(debtMYR(g.government))} sub={`${pct(ind.debtToGdp)} of GDP`} hint="Government bonds outstanding" onClick={() => setPanel('debt')} />
      <Cell label="Unemployment" value={pct(ind.unemployment)} sub={`${(g.households.employed / 1e6).toFixed(2)}m employed`} hint="Unemployed share of the domestic workforce · click for explanation" onClick={() => explain('unemployment')} testid="stat-unemployment" />
      <Cell label="Inflation" value={pct(ind.inflationYoY)} sub={`CPI ${ind.cpi.toFixed(1)}`} tone={Math.abs(ind.inflationYoY - 0.025) > 0.015 ? 'down' : undefined} hint="CPI, year on year (annualised since start during year one)" onClick={() => explain('inflation')} testid="stat-inflation" />
      <Cell label="Approval" value={`${ind.approval.toFixed(0)}%`} sub={ind.approval >= 60 ? 'above victory bar' : 'below 60 bar'} tone={ind.approval >= 60 ? 'up' : 'down'} hint="Citizen approval, updated monthly from satisfaction · click for explanation" onClick={() => explain('approval')} testid="stat-approval" />
      <Cell label="MYR / USD" value={fx(g.external.myrPerUsd)} sub={`OPR ${pct(g.external.opr, 2)}`} hint="Fictional ringgit per US dollar; OPR set by the (fictional) central bank, not you" onClick={() => setPanel('economy')} />
      <Cell label="Score" value={`${computeScore(g).total.toFixed(0)}/100`} sub="preview" hint="Campaign score preview — see Objectives" onClick={() => setPanel('objectives')} testid="stat-score" />
    </div>
  );
}

export function ratingOf(r: number) {
  return ['D', 'CC', 'CCC', 'B', 'BB', 'BBB−', 'BBB', 'BBB+', 'A', 'AA', 'AAA'][Math.max(0, Math.min(10, Math.floor(r)))];
}
