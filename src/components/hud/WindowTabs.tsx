import { useGame, type PanelId } from '../../store/game-store';
import { windowOf } from './windows';

/** Tab strip above a window with more than one panel (for example Money & debt: Treasury, Fiscal rules, Central bank). */
export function WindowTabs({ panel }: { panel: PanelId }) {
  const w = windowOf(panel);
  if (!w || w.tabs.length < 2) return null;
  return (
    <div className="pointer-events-auto flex flex-wrap gap-1" role="tablist" aria-label={`${w.label} views`} data-testid="window-tabs">
      {w.tabs.map((t) => <button key={t.id} role="tab" aria-selected={panel === t.id} data-testid={`tab-${t.id}`} onClick={() => useGame.getState().setPanel(t.id)}
        className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${panel === t.id ? 'bg-sky-500/30 text-white ring-1 ring-sky-300/50' : 'bg-slate-800/80 text-slate-300 hover:text-white'}`}>{t.label}</button>)}
    </div>
  );
}
