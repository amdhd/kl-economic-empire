import { useGame, type PanelId } from '../../store/game-store';
import { windowOf } from './windows';

/** Tab strip above a window with more than one panel (for example Money & debt: Treasury, Fiscal rules, Central bank). */
export function WindowTabs({ panel }: { panel: PanelId }) {
  const w = windowOf(panel);
  if (!w || w.tabs.length < 2) return null;
  return (
    <div className="pointer-events-auto flex flex-wrap gap-1" role="tablist" aria-label={`${w.label} views`} data-testid="window-tabs">
      {w.tabs.map((t) => <button key={t.id} role="tab" aria-selected={panel === t.id} data-testid={`tab-${t.id}`} onClick={() => useGame.getState().setPanel(t.id)}
        className={`rounded-md px-3 py-1.5 text-[13px] font-bold shadow-lg ${panel === t.id ? 'bg-cyan-400 text-slate-950 ring-2 ring-white/80' : 'bg-slate-700 text-white ring-1 ring-slate-400/50 hover:bg-slate-600'}`}>{t.label}</button>)}
    </div>
  );
}
