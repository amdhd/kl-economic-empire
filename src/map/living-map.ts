// Display-only map life: trains on KL's rail lines and construction sites for projects and FDI. Reads game state;
// never changes it. Train counts follow the simulated economy; motion is in real time scaled by game speed.
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { COMPANY_BY_ID } from '../data/companies';
import { PROJECT_BY_ID } from '../data/projects';
import { RAIL_LINES, type RailLine } from '../data/rail';
import { trainsOnLine } from './train-service';
import { createSiteModelLayer, type ModelKind } from './site-models';
import { FDI_KINDS, investorName } from '../engine/fdi';
import { useGame } from '../store/game-store';
import type { FdiKind, GameState } from '../types/game';

type LngLat = [number, number];
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((3.15 * Math.PI) / 180);
const segLen = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * M_PER_DEG_LNG, (b[1] - a[1]) * M_PER_DEG_LAT);

interface PreparedLine { line: RailLine; cum: number[]; length: number }
const LINES: PreparedLine[] = RAIL_LINES.map(line => {
  const cum = [0];
  for (let i = 1; i < line.path.length; i++) cum.push(cum[i - 1] + segLen(line.path[i - 1], line.path[i]));
  return { line, cum, length: cum.at(-1) ?? 0 };
});

function pointAt(p: PreparedLine, d: number): LngLat {
  const { cum, line } = p;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const span = cum[hi] - cum[lo] || 1, k = (d - cum[lo]) / span;
  const a = line.path[lo], b = line.path[hi];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

// Illustrative, FICTIONAL sites for projects and investment (the game has no real addresses for them).
const PROJECT_SITE: Record<string, LngLat> = {
  lrt: [101.6918, 3.1063], brt: [101.6955, 3.1797], fibre: [101.6869, 3.1338], housing: [101.7400, 3.0920],
  flood: [101.7090, 3.1480], clinics: [101.6600, 3.1650], heritage: [101.6960, 3.1450],
};
const FDI_SITE: Record<FdiKind, LngLat> = {
  datacentre: [101.6559, 2.9213], semiconductor: [101.7700, 2.9600], ev: [101.5870, 3.0900], renewables: [101.6800, 2.9550], hq: [101.7190, 3.1420],
};

const PROJECT_MODEL: Record<string, ModelKind> = { lrt: 'station', brt: 'station', housing: 'housing', clinics: 'clinic' };
interface Site { key: string; at: LngLat; name: string; kind: ModelKind; progress: number; done: boolean }

function sites(s: GameState): Site[] {
  const out: Site[] = [];
  for (const p of s.government.projects) {
    if (p.status === 'cancelled' || !PROJECT_SITE[p.templateId]) continue;
    const n = out.filter(x => x.key.startsWith(`p:${p.templateId}`)).length;
    const [lng, lat] = PROJECT_SITE[p.templateId];
    out.push({ key: `p:${p.templateId}:${p.id}`, at: [lng + n * 0.0025, lat], name: PROJECT_BY_ID[p.templateId]?.name ?? p.name, kind: PROJECT_MODEL[p.templateId] ?? 'generic', progress: Math.min(1, p.work / p.cost), done: p.status === 'complete' });
  }
  for (const p of s.fdi?.pledges ?? []) {
    if (p.status !== 'building' && p.status !== 'operating') continue;
    const n = out.filter(x => x.key.startsWith(`f:${p.kind}`)).length;
    const [lng, lat] = FDI_SITE[p.kind];
    const angle = n * 2.4, r = 0.004 * Math.sqrt(n);
    out.push({ key: `f:${p.kind}:${p.id}`, at: [lng + r * Math.cos(angle), lat + r * Math.sin(angle)], name: `${investorName(p.investor)} · ${FDI_KINDS[p.kind].label}`, kind: p.kind, progress: p.spent / p.amount, done: p.status === 'operating' });
  }
  return out;
}

/** Adds the rail, train and site layers. Returns a cleanup function. */
export function attachLivingMap(map: MlMap): () => void {
  map.addSource('kl-rail', { type: 'geojson', data: { type: 'FeatureCollection', features: LINES.map(p => ({ type: 'Feature', properties: { colour: p.line.colour, name: p.line.name }, geometry: { type: 'LineString', coordinates: p.line.path } })) } });
  map.addLayer({ id: 'kl-rail', type: 'line', source: 'kl-rail', paint: { 'line-color': ['get', 'colour'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4], 'line-opacity': 0.7 } });
  map.addSource('kl-trains', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'kl-trains-glow', type: 'circle', source: 'kl-trains', paint: { 'circle-color': ['get', 'colour'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 18], 'circle-blur': 0.8, 'circle-opacity': 0.6 } });
  map.addLayer({ id: 'kl-trains', type: 'circle', source: 'kl-trains', paint: { 'circle-color': '#ffffff', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 7], 'circle-stroke-color': ['get', 'colour'], 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 3.5] } });
  const models = createSiteModelLayer(map);
  map.addLayer(models.layer);

  // ---- trains: real-time motion, scaled by game speed; stopped while paused
  const offset = new Map<string, number>(); // metres travelled per line
  let last = performance.now(), lastPaint = 0, raf = 0;
  const frameMs = navigator.webdriver ? 500 : 50; // lighter in automated browser tests
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - lastPaint < frameMs || document.hidden) return;
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now; lastPaint = now;
    const g = useGame.getState().game;
    const speed = g.clock.paused ? 0 : 0.5 + 0.5 * g.clock.speed; // 1×, 1.5×, 2× visual pace
    const features: { type: 'Feature'; properties: { colour: string }; geometry: { type: 'Point'; coordinates: LngLat } }[] = [];
    for (const p of LINES) {
      const travelled = (offset.get(p.line.id) ?? 0) + 220 * speed * dt; // stylised ~220 m/s
      offset.set(p.line.id, travelled);
      const n = trainsOnLine(g, p.line, p.length);
      for (let i = 0; i < n; i++) {
        // Half the trains run each way; positions ping-pong along the line.
        const d = (travelled + (i / n) * 2 * p.length) % (2 * p.length);
        const along = d <= p.length ? d : 2 * p.length - d;
        features.push({ type: 'Feature', properties: { colour: p.line.colour }, geometry: { type: 'Point', coordinates: pointAt(p, along) } });
      }
    }
    (map.getSource('kl-trains') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  };
  raf = requestAnimationFrame(tick);

  // ---- construction sites: 3D models (site-models.ts) rise with progress; markers show a crane, then an operating badge
  const markers = new Map<string, { marker: Marker; el: HTMLElement }>();
  const paintSites = () => {
    const list = sites(useGame.getState().game);
    models.set(list);
    const keep = new Set(list.map(x => x.key));
    for (const [k, m] of markers) if (!keep.has(k)) { m.marker.remove(); markers.delete(k); }
    for (const x of list) {
      let m = markers.get(x.key);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'site-marker';
        el.dataset.testid = `site-${x.key}`;
        m = { el, marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat(x.at).addTo(map) };
        markers.set(x.key, m);
      }
      m.el.classList.toggle('is-done', x.done);
      m.el.title = `${x.name} — illustrative fictional site`;
      m.el.innerHTML = x.done
        ? `<span class="site-icon">✓</span><span>${x.name}</span>`
        : `<span class="site-icon crane">🏗️</span><span>${x.name} · ${Math.round(x.progress * 100)}%</span>`;
    }
  };
  paintSites();
  const unsub = useGame.subscribe((s, prev) => { if (s.rev !== prev.rev || s.game !== prev.game) paintSites(); });

  return () => {
    cancelAnimationFrame(raf);
    unsub();
    for (const m of markers.values()) m.marker.remove();
    markers.clear();
  };
}

/** Company marker cues: big hourly price moves flash; new company events show a bubble for a few seconds. */
export function companyMarkerCues(els: Map<string, HTMLElement>) {
  const lastPrice = new Map<string, number>();
  const seenEvents = new Set<number>();
  let primed = false;
  return (g: GameState) => {
    for (const [id, pill] of els) {
      const px = g.market.quotes[id as keyof typeof g.market.quotes]?.price;
      if (px === undefined) continue;
      const before = lastPrice.get(id);
      lastPrice.set(id, px);
      if (before === undefined || !primed) continue;
      const move = px / before - 1;
      if (Math.abs(move) >= 0.01) {
        pill.classList.remove('co-flash-up', 'co-flash-down');
        void pill.offsetWidth; // restart the animation
        pill.classList.add(move > 0 ? 'co-flash-up' : 'co-flash-down');
      }
    }
    for (const ev of g.events.active) {
      if (seenEvents.has(ev.id)) continue;
      seenEvents.add(ev.id);
      if (!primed || !ev.ticker) continue;
      const pill = els.get(ev.ticker);
      if (!pill) continue;
      const bubble = document.createElement('div');
      bubble.className = 'co-bubble';
      bubble.textContent = ev.title.replace(`${COMPANY_BY_ID[ev.ticker]?.displayName ?? ''}: `, '');
      pill.appendChild(bubble);
      setTimeout(() => bubble.remove(), 8000);
    }
    primed = true;
  };
}
