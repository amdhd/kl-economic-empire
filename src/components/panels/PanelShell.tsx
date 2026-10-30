import type { ReactNode } from 'react';
import { useGame } from '../../store/game-store';
import { SimTag } from '../ui';

export function PanelShell({ title, subtitle, children, width = 640, right }: { title: string; subtitle?: string; children: ReactNode; width?: number; right?: ReactNode }) {
  const setPanel = useGame.getState().setPanel;
  return (
    <div className="glass pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-2xl" style={{ width }} data-testid="panel">
      <div className="flex items-start justify-between gap-3 border-b border-slate-700/50 px-4 py-3">
        <div>
          <h2 className="text-[16px] font-bold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          <SimTag />
          <button onClick={() => setPanel(null)} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-white" aria-label="Close panel">✕</button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
