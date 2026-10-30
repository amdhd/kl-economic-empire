// Lightweight verification map for company markers. The Phase 1 MapView is the real 3D map; this
// shows the same verified points (map/company-markers.ts) so Phase 2 can be checked on its own.
import { Map as MlMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 resolves its worker relative to its own module URL, which breaks once bundled by Vite;
// the worker build is self-contained, so point at it explicitly (same approach as the Phase 1 map).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { COMPANY_BY_ID } from '../data/companies';
import { companyLocations, LOCATION_TYPE_LABEL } from '../map/company-markers';
import type { TickerId } from '../types/game';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
setWorkerUrl(workerUrl);

export function MarkerMap({ onSelect }: { onSelect: (id: TickerId) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onSelect);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    cb.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!el.current) return;
    const map = new MlMap({ container: el.current, style: STYLE, center: [101.7, 3.145], zoom: 13, pitch: 45, bearing: -15, attributionControl: { compact: false } });
    map.addControl(new NavigationControl(), 'top-right');
    map.on('error', () => setTileError(true));
    const markers = companyLocations().map((loc) => {
      const root = document.createElement('div');
      root.className = 'flex flex-col items-center';
      root.dataset.testid = 'company-marker';
      root.dataset.companies = loc.companies.join(',');
      root.title = `${LOCATION_TYPE_LABEL[loc.locationType]} · ${loc.label}`;
      for (const id of loc.companies) {
        const b = document.createElement('button');
        b.className = 'mb-0.5 rounded-md border border-emerald-400/40 bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 shadow hover:bg-emerald-500/30';
        b.textContent = COMPANY_BY_ID[id].displayName;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          cb.current(id);
        });
        root.appendChild(b);
      }
      const pin = document.createElement('div');
      pin.className = 'h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400';
      root.appendChild(pin);
      return new Marker({ element: root, anchor: 'bottom' }).setLngLat([loc.lng, loc.lat]).addTo(map);
    });
    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
        Verified KL locations only ({companyLocations().length} buildings). Click a label to open the company.
      </div>
      {tileError && (
        <div className="absolute bottom-10 left-3 rounded-lg bg-amber-500/20 px-3 py-2 text-[11px] text-amber-200">Map tiles failed to load (network?). Markers remain clickable.</div>
      )}
    </div>
  );
}
