import { useGame } from '../../store/game-store';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`glass max-w-[min(600px,90vw)] rounded-xl px-4 py-2 text-[13px] font-semibold ${t.tone === 'good' ? 'text-emerald-200' : t.tone === 'bad' ? 'text-rose-200' : 'text-slate-200'}`} data-testid={t.source === 'alert' ? 'economic-alert-toast' : 'toast'}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
