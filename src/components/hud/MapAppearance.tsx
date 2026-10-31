import { useAppearance } from '../../map/appearance';
export function MapAppearance() {
  const { theme, landmarks, update } = useAppearance();
  return <details className="relative" data-testid="map-appearance">
    <summary className="btn cursor-pointer">◩ Map style</summary>
    <div className="glass absolute right-0 top-10 w-72 rounded-md p-4 text-xs space-y-3">
      <div className="label">Map appearance</div>
      <label className="block">Theme<select className="input mt-1" aria-label="Map theme" value={theme} onChange={e => update({ theme: e.target.value as typeof theme })}><option value="modern-glass">Modern Glass</option><option value="original">Original Kuala Lumpur</option></select></label>
      <p className="text-slate-300">London-inspired steel-blue towers, charcoal streets and soft overcast light. Glass is stylized shading, without true reflections.</p>
      <label className="flex gap-2"><input type="checkbox" checked={landmarks} onChange={e => update({ landmarks: e.target.checked })} />Show fictional glass landmark</label>
      <button className="btn" disabled={!landmarks} onClick={() => window.dispatchEvent(new Event('kl:landmark'))}>View glass tower</button>
      <p className="text-slate-400">Original architectural prototype, 168 m. Fictional addition to KL; no company affiliation or economic effect. Appearance is included in future saves.</p>
    </div>
  </details>;
}
