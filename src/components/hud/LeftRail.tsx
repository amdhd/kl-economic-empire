import { useGame, type PanelId } from '../../store/game-store';

const ITEMS: { id: PanelId; label: string; icon: string; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◎', group: 'Presidency' },
  { id: 'objectives', label: 'Objectives', icon: '🏆', group: 'Presidency' },
  { id: 'policies', label: 'Taxes & budget', icon: '⚖', group: 'Government' },
  { id: 'projects', label: 'Projects', icon: '🏗', group: 'Government' },
  { id: 'debt', label: 'Treasury & debt', icon: '🏦', group: 'Government' },
  { id: 'trade', label: 'Trade & central bank', icon: '⇄', group: 'Government' },
  { id: 'markets', label: 'Stock markets', icon: '📈', group: 'Markets' },
  { id: 'fund', label: 'Sovereign fund', icon: '💼', group: 'Markets' },
  { id: 'economy', label: 'Economy', icon: '🏙', group: 'Analysis' },
  { id: 'sources', label: 'Baseline & sources', icon: '◈', group: 'Analysis' },
  { id: 'reports', label: 'Reports & log', icon: '📰', group: 'Analysis' },
];

export function LeftRail() {
  const panel = useGame((s) => s.panel);
  const setPanel = useGame.getState().setPanel;
  let lastGroup = '';
  return (
    <nav className="glass pointer-events-auto flex w-[168px] shrink-0 flex-col gap-0.5 rounded-2xl p-2" aria-label="Main">
      {ITEMS.map((it) => {
        const header = it.group !== lastGroup ? it.group : null;
        lastGroup = it.group;
        return (
          <div key={it.id}>
            {header && <div className="label px-2 pb-1 pt-2">{header}</div>}
            <button
              onClick={() => setPanel(panel === it.id ? null : it.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition ${panel === it.id ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
              data-testid={`nav-${it.id}`}
            >
              <span className="w-5 text-center text-[14px]">{it.icon}</span>
              {it.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
