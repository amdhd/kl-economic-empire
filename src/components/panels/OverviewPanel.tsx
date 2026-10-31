import { debtMYR, treasuryMYR } from '../../engine/government';
import { formatKL, klDayLabel } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { PanelShell } from './PanelShell';
import { Section } from '../ui';

export function OverviewPanel() {
  const g = useGameState();
  const setPanel = useGame.getState().setPanel;
  const d = g.daily.slice(-200).map((x) => ({ t: x.t, nav: x.nav / 1e9, tre: x.treasury / 1e9, debt: x.debt / 1e9, gdp: x.gdpRunRate / 1e9 }));
  return (
    <PanelShell title="President’s briefing" subtitle="A fictional Malaysian presidency on the KL map. Set fiscal and trade policy, manage the sovereign fund and use central-bank reserves to influence FX. Global shocks remain external." width={640}>
      {g.reports.length === 0 && (
        <Section title="Getting started">
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-slate-300">
            <li>Press <b>Space</b> (or ▶) to start the clock. 1× = 20 game minutes per second; 3× = 1 game hour per second.</li>
            <li>Click company pills on the map or open <b>Stock markets</b> to inspect fictional financials. Bursa trades 09:00–17:00 MYT; US stocks trade overnight in KL time.</li>
            <li>Invest the <b>sovereign fund</b> — US shares need USD, converted on the FX desk.</li>
            <li>Adjust <b>taxes & budget</b> (effective tomorrow) and commission <b>projects</b> (benefits on completion).</li>
            <li>Watch monthly reports. After 24 months your presidency is scored on growth, public wealth, satisfaction and stability.</li>
          </ol>
          <button className="btn mt-2" onClick={() => setPanel('objectives')}>See the objectives</button>
        </Section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Section title="GDP run-rate">
          <TimeChart data={d} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'gdp', name: 'GDP', color: '#60a5fa' }]} yFormat={(v) => v.toFixed(0)} unit="RM bn/yr from daily value added" height={110} area />
        </Section>
        <Section title="Public balance sheet">
          <TimeChart data={d} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'tre', name: 'Treasury', color: '#34d399' }, { key: 'nav', name: 'SWF NAV', color: '#a78bfa' }]} yFormat={(v) => v.toFixed(1)} unit="RM bn · daily" height={110} />
        </Section>
      </div>
      <div className="grid grid-cols-3 gap-3 text-[12.5px]">
        <Section title="Fiscal"><div className="num">Treasury {money(treasuryMYR(g.government))}<br />Debt {money(debtMYR(g.government))}<br />Deficit {pct(g.indicators.deficitToGdp)} of GDP</div></Section>
        <Section title="People"><div className="num">Approval {g.indicators.approval.toFixed(0)}%<br />Jobless {pct(g.indicators.unemployment)}<br />Services {pct(g.government.serviceQuality, 0)}</div></Section>
        <Section title="Active events"><div>{g.events.active.filter((e) => !e.ticker).map((e) => <div key={e.id}>{e.title}</div>)}{!g.events.active.some((e) => !e.ticker) && <span className="text-slate-400">None</span>}</div></Section>
      </div>
      <Section title="Latest news" right={<button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => setPanel('reports')}>All</button>}>
        {[...g.news].reverse().slice(0, 8).map((n) => (
          <div key={n.id} className="border-b border-slate-700/30 py-1.5 text-[12px]">
            <div className="flex justify-between gap-2"><b className={n.tone === 'good' ? 'up' : n.tone === 'bad' ? 'down' : 'text-slate-200'}>{n.title}</b><span className="shrink-0 text-slate-500">{formatKL(n.atMin).date.slice(0, 6)} {formatKL(n.atMin).time}</span></div>
            {n.body && <div className="text-slate-400">{n.body}</div>}
          </div>
        ))}
      </Section>
    </PanelShell>
  );
}
