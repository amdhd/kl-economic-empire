import { useEffect, type ReactNode } from 'react';
import { useGame } from '../../store/game-store';

/** Modal for deliberate decisions; pauses the clock while open (user preference). */
export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onCancel }: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useGame.getState().dialog;
  const pausing = useGame((s) => s.pauseOnDialogs);
  useEffect(() => {
    dialog(true);
    return () => dialog(false);
  }, [dialog]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="glass w-[440px] rounded-2xl p-5">
        <div className="mb-1 text-[16px] font-bold text-white">{title}</div>
        {pausing && <div className="mb-3 text-[11px] font-semibold text-amber-300">⏸ Clock paused while you decide</div>}
        <div className="mb-4 text-[13px] text-slate-300">{children}</div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} data-testid="confirm-btn" autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
