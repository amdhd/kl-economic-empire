import { DISTRICTS } from '../../data/geo';
import { flyTo } from '../../map/MapView';

export function Districts() {
  return (
    <div className="glass pointer-events-auto w-[168px] rounded-2xl p-2">
      <div className="label px-2 pb-1">Districts</div>
      {DISTRICTS.map((d) => (
        <button key={d.id} onClick={() => flyTo(d.id)} title={d.blurb} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-slate-300 transition hover:bg-slate-700/50 hover:text-white" data-testid={`district-${d.id}`}>
          {d.name}
          <span className="text-slate-500">›</span>
        </button>
      ))}
      <button onClick={() => flyTo('home')} className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-emerald-300 hover:bg-slate-700/50">⌂ Reset camera</button>
    </div>
  );
}
