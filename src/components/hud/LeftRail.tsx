import { useGame, type PanelId } from '../../store/game-store';
import { HudIcon } from './HudIcon';

const GROUPS: { title: string; items: { id: PanelId; label: string; color: string }[] }[] = [
  { title: 'Presidency', items: [
    { id: 'overview', label: 'Briefing', color: '#76d7ef' },
    { id: 'population', label: 'Population', color: '#78c9ec' },
    { id: 'objectives', label: 'Objectives', color: '#edce79' },
  ] },
  { title: 'Government', items: [
    { id: 'policies', label: 'Taxes & budget', color: '#a6d582' },
    { id: 'projects', label: 'Projects', color: '#ecb77d' },
    { id: 'debt', label: 'Treasury & debt', color: '#aebdf1' },
    { id: 'controls', label: 'Economic controls', color: '#9dd9d4' },
    { id: 'trade', label: 'Trade & FX', color: '#e2c778' },
  ] },
  { title: 'Markets & analysis', items: [
    { id: 'markets', label: 'Stock markets', color: '#a7d782' },
    { id: 'fund', label: 'Sovereign fund', color: '#c0a8ed' },
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
          <span style={{ color: item.color }}><HudIcon name={item.id} /></span><span>{item.label}</span>
        </button>)}</div>
      </div>)}
    </nav>
  );
}
