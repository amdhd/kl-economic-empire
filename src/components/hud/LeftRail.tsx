import { useGame, type PanelId } from '../../store/game-store';
import { HudIcon } from './HudIcon';

const GROUPS: { title: string; items: { id: PanelId; label: string; color: string }[] }[] = [
  { title: 'Presidency', items: [
    { id: 'overview', label: 'Briefing', color: '#76d7ef' },
    { id: 'finance', label: 'Finances', color: '#8fe3a0' },
    { id: 'population', label: 'Population', color: '#78c9ec' },
    { id: 'objectives', label: 'Objectives', color: '#edce79' },
    { id: 'standing', label: 'Global standing', color: '#f5d98b' },
  ] },
  { title: 'Government', items: [
    { id: 'policies', label: 'Taxes & budget', color: '#a6d582' },
    { id: 'projects', label: 'Projects', color: '#ecb77d' },
    { id: 'infra', label: 'Infrastructure', color: '#e9c46a' },
    { id: 'debt', label: 'Treasury & debt', color: '#aebdf1' },
    { id: 'fiscal', label: 'Fiscal rules', color: '#f0a3a3' },
    { id: 'controls', label: 'Economic controls', color: '#9dd9d4' },
    { id: 'decisions', label: 'Policy decisions', color: '#b9e48f' },
  ] },
  { title: 'Trade & resources', items: [
    { id: 'ministry', label: 'Trade ministry', color: '#7cc4f2' },
    { id: 'trade', label: 'Trade & FX', color: '#e2c778' },
    { id: 'central', label: 'Central bank', color: '#f0c36d' },
    { id: 'partners', label: 'Trading partners', color: '#8fd3c7' },
    { id: 'oil', label: 'Oil & PETRONAS', color: '#f2b45e' },
    { id: 'commodities', label: 'Commodities', color: '#e8a86a' },
    { id: 'deals', label: 'Deal Room', color: '#b6a2ee' },
    { id: 'fdi', label: 'Investment & FDI', color: '#7fd6b0' },
  ] },
  { title: 'Markets & analysis', items: [
    { id: 'markets', label: 'Stock markets', color: '#a7d782' },
    { id: 'fund', label: 'Sovereign fund', color: '#c0a8ed' },
    { id: 'soe', label: 'State enterprises', color: '#9fb6e8' },
    { id: 'economy', label: 'Economy', color: '#75c9e6' },
    { id: 'reports', label: 'Reports & log', color: '#d6b594' },
    { id: 'sources', label: 'Baseline & sources', color: '#a2b7cc' },
  ] },
];
export function LeftRail() {
  const panel = useGame(s => s.panel);
  return (
    <nav className="glass category-menu pointer-events-auto" aria-label="Info view categories" id="info-categories">
      <div className="category-heading">INFO VIEWS <span>{GROUPS.reduce((n, g) => n + g.items.length, 0)}</span></div>
      {GROUPS.map(group => <div className="category-group" key={group.title}>
        <div className="label">{group.title}</div>
        <div className="category-grid">{group.items.map(item => <button key={item.id} title={item.label} aria-pressed={panel === item.id} onClick={() => useGame.getState().setPanel(panel === item.id ? null : item.id)} className={`category-button ${panel === item.id ? 'is-active' : ''}`} data-testid={`nav-${item.id}`}>
          <span style={{ color: item.color }}><HudIcon name={item.id} size={19} /></span><span>{item.label}</span>
        </button>)}</div>
      </div>)}
    </nav>
  );
}
