import { EVENT_BY_ID } from '../data/events';
import { eventIsActive } from '../engine/events';
import { klDayLabel } from '../engine/time';
import type { ActiveEvent } from '../types/game';

/** The same fictional event and causal explanation in the live view and retained history. */
export function EventCard({ event, today }: { event: ActiveEvent; today: number }) {
  const template = EVENT_BY_ID[event.templateId];
  const active = eventIsActive(event, today);
  const status = today < event.startDay ? 'Upcoming' : active ? 'Active' : 'Ended';
  return (
    <article className="mb-2 rounded-lg bg-slate-800/40 p-3 text-[12px]" data-testid={`event-${event.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className={template?.tone === 'good' ? 'up' : template?.tone === 'bad' ? 'down' : 'text-slate-200'}>{event.title}</b>
        <span className={active ? 'text-amber-200' : 'text-slate-400'}>{status} · strength {event.magnitude.toFixed(2)}×</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">Fictional scenario · {klDayLabel(event.startDay)} → {klDayLabel(event.endDay - 1)} (last active day)</div>
      {template && (
        <>
          <p className="mt-1 text-slate-300">{template.description}</p>
          <div className="mt-1 text-slate-400">Modelled effects: {template.effects.join(' · ')}</div>
        </>
      )}
      {!active && today >= event.endDay && <p className="mt-1 text-slate-500">Direct shock ended; prices, credit plans and company sentiment may still be adjusting.</p>}
    </article>
  );
}
