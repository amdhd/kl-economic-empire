import { MALAYSIA_IMF } from '../../data/countries';
import { gapToTopTen, standingBoard, standingComponents } from '../../engine/standing';
import { useGameState } from '../../store/game-store';
import { pct } from '../../utils/format';
import { Bar, Section, Stat } from '../ui';
import { PanelShell } from './PanelShell';

const usd = (bn: number) => (bn >= 1000 ? `US$${(bn / 1000).toFixed(2)}tn` : `US$${bn.toFixed(0)}bn`);

export function StandingPanel() {
  const g = useGameState();
  if (!g.fdi.enabled) return <PanelShell title="Global standing" subtitle="Top economies by GDP"><p className="text-[13px] text-slate-300">The global standing board is part of new Malaysia campaigns (model 3).</p></PanelShell>;
  const rows = standingBoard(g);
  const c = standingComponents(g);
  const gap = gapToTopTen(g);
  return (
    <PanelShell title="Global standing" subtitle="Malaysia against the ten largest economies (IMF 2026 US$ GDP). Rivals follow IMF projections around the simulated global cycle." width={760} referenceData>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="Standing score" value={`${c.points.toFixed(0)}/100`} sub="15% of the campaign score" tone={c.points >= 50 ? 'up' : 'down'} />
        <Stat label="US$ GDP vs rivals" value={pct(c.relativeGdpGrowth, 1, true)} sub="a year, relative growth" tone={c.relativeGdpGrowth >= 0 ? 'up' : 'down'} />
        <Stat label="Exports vs rivals" value={pct(c.relativeExportGrowth, 1, true)} sub="a year, US$" tone={c.relativeExportGrowth >= 0 ? 'up' : 'down'} />
        <Stat label="Ringgit vs US$" value={pct(c.ringgitChange, 1, true)} sub="since opening" tone={c.ringgitChange >= 0 ? 'up' : 'down'} />
      </div>
      <Section title="Leaderboard · GDP, current US$ (annual run rate)">
        <table className="w-full text-[12px]" data-testid="standing-table">
          <thead><tr className="text-left text-slate-400"><th>#</th><th>Economy</th><th className="text-right">GDP</th><th className="text-right">Per head</th><th className="text-right">Real growth</th><th className="text-right">Inflation</th><th className="text-right">Ext. balance</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className={r.isMalaysia ? 'bg-emerald-400/15 font-semibold text-white' : ''} data-testid={`standing-${r.id}`}>
              <td className="py-0.5">{r.rank}</td>
              <td>{r.flag} {r.name}</td>
              <td className="num text-right">{usd(r.gdpUsd)}</td>
              <td className="num text-right">US${(r.perCapita / 1000).toFixed(1)}k</td>
              <td className="num text-right">{r.growthPct.toFixed(1)}%</td>
              <td className="num text-right">{r.inflationPct.toFixed(1)}%</td>
              <td className="num text-right">{r.currentAccountPct.toFixed(1)}%</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-400">Rivals: IMF World Economic Outlook (Oct 2026) GDP for 2026–28, real growth and inflation for 2027, current account for 2026, moved by the simulated US/global cycle and events. Malaysia: simulated nominal GDP at the simulated ringgit; growth is year-on-year once a year has passed; its external balance is the model's reduced sector trade account. The campaign opens from 2025 official GDP, so Malaysia starts below the IMF's 2026 estimate of US${MALAYSIA_IMF.gdpUsd2026.toFixed(0)}bn.</p>
      </Section>
      <Section title="Closing the gap">
        <div className="mb-1 text-[12.5px]">Malaysia is {pct(gap.ratio, 0)} the size of the 10th economy ({usd(gap.tenth)}).</div>
        <Bar value={gap.ratio} />
        <p className="mt-2 text-[12px] text-slate-300">{Number.isFinite(gap.yearsToClose) ? `At today's relative growth, Malaysia would overtake it in about ${gap.yearsToClose.toFixed(0)} years.` : 'At today’s relative growth the gap is not closing.'} The standing score rewards faster US$ GDP growth than the rivals (50%), faster export growth (25%) and a stronger ringgit (25%).</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px]"><span>GDP {c.gdpPoints.toFixed(0)}/100</span><span>Trade {c.tradePoints.toFixed(0)}/100</span><span>Currency {c.currencyPoints.toFixed(0)}/100</span></div>
      </Section>
    </PanelShell>
  );
}
