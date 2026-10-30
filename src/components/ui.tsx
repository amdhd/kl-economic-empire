import type { ReactNode } from 'react';
import { FICTIONAL_LABEL } from '../utils/format';

export function Section({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'neutral'; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="label truncate">{label}</div>
      <div className="num truncate text-[15px] font-semibold text-slate-50">{value}</div>
      {sub !== undefined && <div className={`num truncate text-[11px] ${tone === 'up' ? 'up' : tone === 'down' ? 'down' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  );
}

export function SimTag({ className = '' }: { className?: string }) {
  return <span className={`chip whitespace-nowrap bg-amber-400/10 text-[9.5px] text-amber-300 ring-1 ring-amber-300/25 ${className}`}>{FICTIONAL_LABEL}</span>;
}

export function Bar({ value, max = 1, color = '#34d399' }: { value: number; max?: number; color?: string }) {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-800/70 p-0.5 ring-1 ring-slate-600/30">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${value === o.id ? 'bg-slate-600/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const signTone = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : 'neutral');
