import { Map as MlMap, Marker, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
// MapLibre v6 locates its worker relative to its own module URL, which breaks once bundled.
// The worker build is self-contained, so point at it explicitly (works in dev and production).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { COMPANIES } from '../data/companies';
import { SECTORS } from '../data/economic-baseline';
import { COMPANY_BY_ID } from '../data/companies';
import { DISTRICTS } from '../data/geo';
import { companyLocations, LOCATION_TYPE_LABEL } from './company-markers';
import { useGame } from '../store/game-store';
import type { CompanySeed, TickerId } from '../types/game';

// OpenFreeMap "liberty" style: OSM-derived vector tiles; source-layer `building` with
// `render_height`/`render_min_height` (verified by inspecting the style JSON — docs/decisions.md D-003).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
setWorkerUrl(workerUrl);
export const KLCC: [number, number] = [101.7123, 3.1578];
const HOME = { center: [101.7105, 3.1525] as [number, number], zoom: 15.2, pitch: 60, bearing: -28 };

const monogram = (c: CompanySeed) => (c.exchange === 'US' ? c.code.replace('.B', '') : c.displayName.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase());

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerEls = useRef(new Map<TickerId, HTMLElement>());
  const [error, setError] = useState<string | null>(null);
  const [buildingInfo, setBuildingInfo] = useState<{ x: number; y: number; h: number; min: number } | null>(null);

  useEffect(() => {
    if (!el.current) return;
    let map: MlMap;
    try {
      map = new MlMap({
        container: el.current,
        style: STYLE_URL,
        center: HOME.center,
        zoom: HOME.zoom,
        pitch: HOME.pitch,
        bearing: HOME.bearing,
        maxPitch: 75,
        minZoom: 10,
        maxBounds: [[101.45, 2.9], [101.95, 3.4]],
        attributionControl: { compact: false, customAttribution: 'Company markers: verified OSM locations · All prices & financials fictional' },
        canvasContextAttributes: { antialias: true },
      });
    } catch (e) {
      setError(`Map could not start (${(e as Error).message}). WebGL may be unavailable; the economy still runs.`);
      return;
    }
    mapRef.current = map;
    const els = markerEls.current;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

    let loaded = false;
    const timeout = setTimeout(() => {
      if (!loaded) setError('Map tiles are taking too long to load — check your internet connection. The simulation keeps running offline.');
    }, 15000);
    map.on('error', (e) => {
      if (!loaded) setError(`Map tiles unavailable (${e.error?.message ?? 'network error'}). OpenFreeMap needs an internet connection; the simulation still runs.`);
    });
    map.on('load', () => {
      loaded = true;
      clearTimeout(timeout);
      setError(null);
      if (map.getLayer('building-3d')) {
        map.setPaintProperty('building-3d', 'fill-extrusion-color', [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
          0, '#e7e2d9', 25, '#d6d3cc', 60, '#b9c4d3', 150, '#8fa6c4', 300, '#5f7fa8',
        ]);
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.92);
        map.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true);
      }
      try {
        map.setSky({ 'sky-color': '#9ec5ea', 'horizon-color': '#f3e7d3', 'fog-color': '#e9eef4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 });
      } catch {
        /* older renderer */
      }
      map.setLight({ anchor: 'map', position: [1.4, 210, 35], intensity: 0.35, color: '#fff6e8' });
    });
    map.on('click', 'building-3d', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as Record<string, number>;
      setBuildingInfo({ x: e.point.x, y: e.point.y, h: Number(props.render_height ?? 0), min: Number(props.render_min_height ?? 0) });
    });
    map.on('movestart', () => setBuildingInfo(null));
    map.on('mouseenter', 'building-3d', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'building-3d', () => (map.getCanvas().style.cursor = ''));

    // Company markers (HTML), one per verified building; co-located companies share a pill.
    const markers: Marker[] = [];
    // Companies sharing a verified building (same OSM coordinates) share one stacked marker.
    for (const g of companyLocations()) {
      const root = document.createElement('div');
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
      root.style.gap = '4px';
      root.style.alignItems = 'center';
      for (const c of g.companies.map((cid) => COMPANY_BY_ID[cid])) {
        const pill = document.createElement('div');
        pill.className = 'co-marker';
        pill.title = `${c.legalName}\n${c.geo!.label} (${LOCATION_TYPE_LABEL[g.locationType]}) — ${g.verificationSource}`;
        pill.dataset.testid = `marker-${c.id}`;
        pill.innerHTML = `<span class="co-badge" style="background:${c.exchange === 'US' ? '#1e3a8a' : SECTORS[c.sector].color}">${monogram(c)}</span><span>${c.displayName}</span><span class="co-chg">—</span>`;
        pill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          useGame.getState().select({ kind: 'company', id: c.id });
        });
        root.appendChild(pill);
        els.set(c.id, pill);
      }
      const stem = document.createElement('div');
      stem.style.cssText = 'width:2px;height:14px;background:linear-gradient(#0f172a99,#0f172a00);margin-top:-2px';
      root.appendChild(stem);
      markers.push(new Marker({ element: root, anchor: 'bottom' }).setLngLat([g.lng, g.lat]).addTo(map));
    }

    // Live price chips: update DOM directly on economic changes (no React re-render of the map).
    const paint = () => {
      const st = useGame.getState();
      for (const [id, pill] of els) {
        const q = st.game.market.quotes[id];
        if (!q) continue;
        const chg = q.price / q.prevClose - 1;
        const chip = pill.querySelector('.co-chg') as HTMLElement;
        chip.textContent = `${chg >= 0 ? '+' : '−'}${Math.abs(chg * 100).toFixed(1)}%`;
        chip.style.color = chg >= 0 ? '#059669' : '#dc2626';
        pill.classList.toggle('sel', st.selection?.kind === 'company' && st.selection.id === id);
      }
    };
    paint();
    const unsub = useGame.subscribe((s, prev) => {
      if (s.rev !== prev.rev || s.selection !== prev.selection) paint();
    });
    // Fly to company when selected from elsewhere
    const unsubSel = useGame.subscribe((s, prev) => {
      if (s.selection !== prev.selection && s.selection?.kind === 'company') {
        const c = COMPANIES.find((x) => x.id === (s.selection as { id: TickerId }).id);
        if (c?.geo) map.easeTo({ center: [c.geo.lng, c.geo.lat], zoom: Math.max(map.getZoom(), 15.6), duration: 900 });
      }
    });
    const flyHandler = (e: Event) => {
      const d = DISTRICTS.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (d) map.flyTo({ center: d.center, zoom: d.zoom, bearing: d.bearing, pitch: 60, duration: 2200, essential: true });
      else map.flyTo({ ...HOME, duration: 1800 });
    };
    window.addEventListener('kl:fly', flyHandler);

    return () => {
      clearTimeout(timeout);
      unsub();
      unsubSel();
      window.removeEventListener('kl:fly', flyHandler);
      markers.forEach((m) => m.remove());
      els.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="absolute inset-0" data-testid="map">
      <div ref={el} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/90 p-8">
          <div className="glass max-w-md rounded-2xl p-6 text-center">
            <div className="mb-2 text-lg font-semibold">Map unavailable</div>
            <p className="text-sm text-slate-300">{error}</p>
          </div>
        </div>
      )}
      {buildingInfo && (
        <div className="glass pointer-events-auto absolute z-10 w-64 rounded-xl p-3 text-xs" style={{ left: buildingInfo.x + 12, top: buildingInfo.y - 10 }}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-slate-100">OSM building</span>
            <button className="text-slate-400 hover:text-white" onClick={() => setBuildingInfo(null)} aria-label="Close">✕</button>
          </div>
          <div className="text-slate-300">Rendered height ≈ {buildingInfo.h.toFixed(0)} m{buildingInfo.min > 0 ? ` (base ${buildingInfo.min.toFixed(0)} m)` : ''}</div>
          <div className="mt-1 text-slate-400">Heights come from OpenStreetMap and may be estimated. No company is assigned to unverified buildings.</div>
        </div>
      )}
    </div>
  );
}

export function flyTo(districtId: string | 'home') {
  window.dispatchEvent(new CustomEvent('kl:fly', { detail: districtId }));
}
