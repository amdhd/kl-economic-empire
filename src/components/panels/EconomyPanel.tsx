import { SECTOR_IDS, SECTORS } from '../../data/economic-baseline';
import { CAL } from '../../engine/calibration';
import { daysInMonth, klDay, klDayLabel, monthKeyLabel } from '../../engine/time';
import { useGameState } from '../../store/game-store';
import { fx, money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { EventCard } from '../EventCard';
import { PanelShell } from './PanelShell';
import { Section, Stat } from '../ui';

export function EconomyPanel() {
  const g = useGameState();
  const R = g.reports;
  const ann = (k: number) => 365 / daysInMonth(Math.floor(k / 12), (k % 12) + 1) / 1e9;
  const monthly = R.map((r) => ({ t: r.monthKey, gdp: r.realGdp * ann(r.monthKey), nom: r.nominalGdp * ann(r.monthKey), infl: r.inflationYoY * 100, u: r.unemployment * 100, inv: r.investment / 1e9 }));
  const daily = g.daily.slice(-400).map((d) => ({ t: d.t, fx: d.fx, cpi: d.cpi }));
  const hh = g.households;
  const b = g.bank;
  const e = g.external;
  return (
    <PanelShell title="KL economy" subtitle="Aggregate households, 7 input–output sectors, banks and the external economy. Fictional calibration." width={760}>
      <div className="grid grid-cols-2 gap-3">
        <Section title="GDP, annualised">
          <TimeChart data={monthly} xKey="t" xFormat={(v) => monthKeyLabel(Number(v))} series={[{ key: 'gdp', name: 'Real GDP', color: '#34d399' }, { key: 'nom', name: 'Nominal GDP', color: '#60a5fa' }]} yFormat={(v) => v.toFixed(0)} unit="RM bn per year (month × 365/days) · month" height={130} />
        </Section>
        <Section title="Inflation & unemployment">
          <TimeChart data={monthly} xKey="t" xFormat={(v) => monthKeyLabel(Number(v))} series={[{ key: 'infl', name: 'CPI YoY %', color: '#fbbf24' }, { key: 'u', name: 'Unemployment %', color: '#f87171' }]} yFormat={(v) => `${v.toFixed(1)}`} unit="% · month" height={130} />
        </Section>
        <Section title="MYR per USD">
          <TimeChart data={daily} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'fx', name: 'MYR/USD', color: '#a78bfa' }]} yFormat={(v) => v.toFixed(2)} unit="ringgit per dollar · daily" height={110} />
        </Section>
        <Section title="Consumer price index">
          <TimeChart data={daily} xKey="t" xFormat={(v) => klDayLabel(Number(v))} series={[{ key: 'cpi', name: 'CPI', color: '#fbbf24' }]} yFormat={(v) => v.toFixed(1)} unit="index, start = 100 · daily" height={110} />
        </Section>
      </div>
      <Section title="Sectors">
        <table className="data num">
          <thead><tr><th>Sector</th><th className="text-right">Output vs base</th><th className="text-right">Utilisation</th><th className="text-right">Jobs</th><th className="text-right">Price idx</th><th className="text-right">Infra boost</th><th className="text-right">Investment/mo</th></tr></thead>
          <tbody>
            {SECTOR_IDS.map((j) => {
              const s = g.sectors[j];
              return (
                <tr key={j}>
                  <td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SECTORS[j].color }} />{SECTORS[j].name}</td>
                  <td className={`text-right ${s.output >= CAL.Y0[j] ? 'up' : 'down'}`}>{pct(s.output / CAL.Y0[j] - 1, 1, true)}</td>
                  <td className={`text-right ${s.avgUtil > 0.95 ? 'text-amber-300' : ''}`}>{pct(s.avgUtil, 0)}</td>
                  <td className="text-right">{(s.employment / 1e3).toFixed(0)}k</td>
                  <td className="text-right">{s.price.toFixed(3)}</td>
                  <td className="text-right">{s.infraBoost ? pct(s.infraBoost, 1, true) : '—'}</td>
                  <td className="text-right">{money(s.investmentMonthly)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <div className="grid grid-cols-3 gap-3">
        <Section title="Households">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Wage index" value={hh.wageIndex.toFixed(3)} />
            <Stat label="Rent index" value={hh.rentIndex.toFixed(3)} />
            <Stat label="MPC" value={pct(hh.mpc, 1)} />
            <Stat label="Confidence" value={pct(hh.confidence, 0)} />
            <Stat label="Exp. inflation" value={pct(hh.expectedInflation, 1)} />
            <Stat label="Population" value={`${(hh.population / 1e6).toFixed(2)}m`} />
            <Stat label="Real disp. inc./cap" value={R.at(-1) ? money(R.at(-1)!.realDisposablePerCapita) : '—'} sub="per year" />
            <Stat label="Gini (proxy)" value={g.indicators.gini.toFixed(3)} />
          </div>
        </Section>
        <Section title="Banking (reduced form)">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Lending rate" value={pct(b.lendingRate, 2)} />
            <Stat label="Deposit rate" value={pct(b.depositRate, 2)} />
            <Stat label="Loans" value={money(b.loansH + b.loansF)} sub={`hh ${money(b.loansH)}`} />
            <Stat label="Capital ratio" value={pct(b.capital / (b.loansH + b.loansF), 1)} />
            <Stat label="Default rate" value={pct(b.nplRate * 12, 2)} sub="annualised" />
            <Stat label="Credit met" value={pct(b.firmCreditRatio, 0)} sub="of firm demand" />
            <Stat label="New loans/mo" value={money(b.mtdNewLoans)} />
            <Stat label="Willingness" value={pct(b.willingness, 0)} />
          </div>
        </Section>
        <Section title="External (not under your control)">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Malaysia demand" value={e.myDemand.toFixed(3)} />
            <Stat label="Global demand" value={e.globalDemand.toFixed(3)} />
            <Stat label="US demand" value={e.usDemand.toFixed(3)} />
            <Stat label="Tech cycle" value={e.techCycle.toFixed(3)} />
            <Stat label="Oil (idx)" value={e.oil.toFixed(2)} sub={`≈ US$${(75 * e.oil).toFixed(0)}/bbl`} />
            <Stat label="Tourism" value={e.tourism.toFixed(3)} />
            <Stat label="Risk appetite" value={pct(e.riskAppetite, 0)} />
            <Stat label="Fed / UST10" value={`${pct(e.fedRate, 2)}`} sub={pct(e.ust10, 2)} />
            <Stat label="OPR / MGS10" value={pct(e.opr, 2)} sub={pct(e.mgs10, 2)} />
            <Stat label="MYR/USD" value={fx(e.myrPerUsd)} />
          </div>
        </Section>
      </div>
      <Section title="Active economic events">
        {g.events.active.length === 0 && <div className="text-[12px] text-slate-400">Calm conditions.</div>}
        {g.events.active.map((event) => <EventCard key={event.id} event={event} today={klDay(g.clock.hour * 60)} />)}
      </Section>
    </PanelShell>
  );
}
