import { useEffect, useRef, useState } from 'react';
import { readSlot, SLOTS, type SlotId } from '../../persistence/storage';
import { useGame } from '../../store/game-store';

export function SaveMenu() {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  const lastSaved = useGame((s) => s.lastSaved);
  const pauseOnDialogs = useGame((s) => s.pauseOnDialogs);
  const { save, load, setPauseOnDialogs } = useGame.getState();

  useEffect(() => {
    if (!open) return;
    (async () => {
      const m: Record<string, string> = {};
      for (const s of SLOTS) {
        const j = await readSlot(s);
        if (j) {
          try {
            const f = JSON.parse(j);
            const h = f.state.clock.hour * 60 + 480;
            const d = new Date(h * 60000);
            m[s] = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:00 · saved ${new Date(f.savedAtReal).toLocaleString()}`;
          } catch {
            m[s] = 'unreadable';
          }
        }
      }
      setMeta(m);
    })();
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} data-testid="btn-save-menu" title={lastSaved ? `Last saved ${lastSaved}` : 'Save / load'}>
        Save / Load
      </button>
      {open && (
        <div className="glass absolute right-0 top-11 z-50 w-96 rounded-xl p-3">
          <div className="label mb-2">Save slots · saving never changes the economy</div>
          {SLOTS.map((s) => (
            <div key={s} className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-800/50 p-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold capitalize">{s === 'autosave' ? 'Autosave (daily & on pause)' : s.replace('slot', 'Slot ')}</div>
                <div className="truncate text-[11px] text-slate-400">{meta[s] ?? 'empty'}</div>
              </div>
              {s !== 'autosave' && (
                <button className="btn" onClick={async () => { await save(s as SlotId, s); setOpen(false); }} data-testid={`save-${s}`}>Save</button>
              )}
              <button className="btn" disabled={!meta[s]} onClick={async () => { if (await load(s as SlotId)) setOpen(false); }} data-testid={`load-${s}`}>Load</button>
            </div>
          ))}
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
            <input type="checkbox" checked={pauseOnDialogs} onChange={(e) => setPauseOnDialogs(e.target.checked)} />
            Pause the clock while a confirmation dialog is open
          </label>
        </div>
      )}
    </div>
  );
}
