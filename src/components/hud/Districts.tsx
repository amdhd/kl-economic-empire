import { DISTRICTS } from '../../data/geo';
import { flyTo } from '../../map/MapView';
export function Districts() {
  return <details className="district-picker relative">
    <summary className="btn">⌖ <span>Kuala Lumpur</span> <span className="text-cyan-300">⌄</span></summary>
    <div className="glass absolute right-0 top-10 w-48 rounded-md p-2">
      <div className="label px-2 pb-1">Camera locations</div>
      {DISTRICTS.map(d => <button key={d.id} onClick={e => { flyTo(d.id); e.currentTarget.closest('details')?.removeAttribute('open'); }} className="district-option" title={d.blurb} data-testid={`district-${d.id}`}>{d.name}<span>›</span></button>)}
      <button className="district-option text-cyan-200" onClick={e => { flyTo('home'); e.currentTarget.closest('details')?.removeAttribute('open'); }}>Reset camera <span>⌂</span></button>
    </div>
  </details>;
}
