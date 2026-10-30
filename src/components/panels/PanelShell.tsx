import type { ReactNode } from 'react';
import { useGame } from '../../store/game-store';
import { SimTag } from '../ui';

export function PanelShell({ title, subtitle, children, width = 640, right, referenceData = false, bodyLayout = 'scroll' }: { title: string; subtitle?: string; children: ReactNode; width?: number; right?: ReactNode; referenceData?: boolean; bodyLayout?: 'scroll' | 'fill' }) {
  const setPanel = useGame.getState().setPanel;
  return (
    <div className="glass data-panel pointer-events-auto flex max-h-full flex-col overflow-hidden" style={{ width }} role="region" aria-label={title} data-testid="panel">
      <div className="panel-heading panel-heading-compact">
        <h2 className="panel-title">{title}</h2>
        <div className="panel-heading-actions flex items-center gap-2">
          {referenceData ? <span className="chip whitespace-nowrap bg-cyan-400/10 text-[9.5px] text-cyan-200">Official starting references</span> : <SimTag />}
          <button onClick={() => setPanel(null)} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-white" aria-label="Close panel">✕</button>
        </div>
        {subtitle && <p className="panel-subtitle text-slate-400">{subtitle}</p>}
        {right && <div className="panel-heading-extra">{right}</div>}
      </div>
      <div className={bodyLayout === 'fill' ? 'panel-body panel-body-fill min-h-0 flex-1' : 'panel-body scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4'}>{children}</div>
    </div>
  );
}
