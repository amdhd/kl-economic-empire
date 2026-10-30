import { SECTOR_IDS, SECTORS } from '../../data/economic-baseline';
import { useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { PanelShell } from './PanelShell';

const count = (n: number) => Math.round(n).toLocaleString('en-MY');
export function PopulationPanel() {
  const g = useGameState();
  const h = g.households;
  const rows = [
    ['Population', count(h.population)], ['Labour force', count(h.laborForce)],
    ['Employed', count(h.employed)], ['Unemployed', count(Math.max(0, h.laborForce - h.employed))],
    ['Unemployment', pct(g.indicators.unemployment)], ['Citizen approval', pct(g.indicators.approval / 100, 0)],
  ];
  const jobs = SECTOR_IDS.reduce((sum, id) => sum + g.sectors[id].employment, 0);
  return <PanelShell title="Population" subtitle={g.baseline.profile === 'malaysia' ? 'Malaysia · aggregate population & households' : 'Kuala Lumpur · legacy campaign'} width={410}>
    <dl className="metric-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="inspector-section">
      <h3>EMPLOYMENT BY SECTOR</h3>
      <div className="distribution-bar" role="img" aria-label="Sector share of modeled employment">{SECTOR_IDS.map(id => <span key={id} style={{ width: `${jobs > 0 ? g.sectors[id].employment / jobs * 100 : 0}%`, background: SECTORS[id].color }} />)}</div>
      <dl className="metric-rows">{SECTOR_IDS.map(id => <div key={id}><dt><i style={{ background: SECTORS[id].color }} />{SECTORS[id].name}</dt><dd>{jobs > 0 ? pct(g.sectors[id].employment / jobs) : '—'}</dd></div>)}</dl>
    </section>
    <section className="inspector-section"><h3>HOUSEHOLD CONDITIONS</h3><dl className="metric-rows">
      <div><dt>Consumer confidence</dt><dd>{pct(h.confidence, 0)}</dd></div>
      <div><dt>Wage index</dt><dd>{h.wageIndex.toFixed(3)}</dd></div>
      <div><dt>Rent index</dt><dd>{h.rentIndex.toFixed(3)}</dd></div>
      <div><dt>Household savings</dt><dd>{money(h.savings)}</dd></div>
      <div><dt>Household loans</dt><dd>{money(h.loans)}</dd></div>
      <div><dt>Public service quality</dt><dd>{pct(g.government.serviceQuality, 0)}</dd></div>
    </dl></section>
    <p className="inspector-note">Fictional simulation. Sector shares describe modeled jobs, not population age. Births, deaths and age groups are not modeled.</p>
  </PanelShell>;
}
