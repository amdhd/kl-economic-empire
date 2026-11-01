import { latestClosedYear } from '../../engine/year-review';
import { useGame } from '../../store/game-store';
import { windowOf, WINDOW_GROUPS } from './windows';
import { HudIcon } from './HudIcon';

export function LeftRail() {
  const panel = useGame(s => s.panel);
  const current = windowOf(panel);
  const lastYear = useGame(s => latestClosedYear(s.game));
  return (
    <nav className="glass category-menu pointer-events-auto" aria-label="Info view categories" id="info-categories">
      <div className="category-heading">INFO VIEWS <span>{WINDOW_GROUPS.reduce((n, g) => n + g.items.length, 0)}</span></div>
      {WINDOW_GROUPS.map(group => <div className="category-group" key={group.title}>
        <div className="label">{group.title}</div>
        <div className="category-grid">{group.items.map(item => <button key={item.id} title={item.tabs.length > 1 ? `${item.label}: ${item.tabs.map(x => x.label).join(', ')}` : item.label} aria-pressed={current?.id === item.id} onClick={() => useGame.getState().setPanel(current?.id === item.id ? null : item.id)} className={`category-button ${current?.id === item.id ? 'is-active' : ''}`} data-testid={`nav-${item.id}`}>
          <span style={{ color: item.color }}><HudIcon name={item.id} size={19} /></span><span>{item.label}</span>
        </button>)}</div>
      </div>)}
      <div className="category-group">
        <div className="label">Year end</div>
        <div className="category-grid"><button title="Summary of the last closed year and next year's budget plan" disabled={lastYear === null} onClick={() => useGame.getState().openYearReview()} className="category-button" data-testid="nav-yearreview">
          <span style={{ color: '#8fe3a0' }}><HudIcon name="reports" size={19} /></span><span>{lastYear === null ? 'Year in review' : `${lastYear} in review`}</span>
        </button></div>
      </div>
    </nav>
  );
}
