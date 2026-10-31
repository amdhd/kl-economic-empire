import type { Map as MlMap, ExpressionSpecification } from 'maplibre-gl';
import type { MapAppearance } from './appearance';
export const LANDMARK_CENTER: [number, number] = [101.7182, 3.1560];
/** Original tiered elliptical tower, deliberately fictional; no economic or company identity. */
export function glassTower() {
  return { type: 'FeatureCollection' as const, features: Array.from({ length: 28 }, (_, floor) => {
    const radius = 0.00019 * (1 - floor / 40);
    const ring = Array.from({ length: 25 }, (_, i) => {
      const angle = i / 24 * Math.PI * 2;
      return [LANDMARK_CENTER[0] + Math.cos(angle) * radius, LANDMARK_CENTER[1] + Math.sin(angle) * radius * 0.7];
    });
    return { type: 'Feature' as const, properties: { base: floor * 6, height: floor * 6 + 5.6, color: floor % 4 === 0 ? '#344c5d' : floor % 2 === 0 ? '#78aebc' : '#568596' }, geometry: { type: 'Polygon' as const, coordinates: [ring] } };
  }) };
}
export function createThemePainter(map: MlMap) {
  const originals = new Map<string, { property: 'fill-color' | 'line-color'; value: unknown }>();
  for (const layer of map.getStyle().layers) {
    const property = layer.type === 'fill' ? 'fill-color' : layer.type === 'line' ? 'line-color' : null;
    if (property) originals.set(layer.id, { property, value: map.getPaintProperty(layer.id, property) });
  }
  return (appearance: MapAppearance) => {
    const modern = appearance.theme === 'modern-glass';
    for (const [id, { property, value }] of originals) {
      let color: string | undefined;
      if (/water/.test(id)) color = '#77959f';
      else if (/park|grass|wood|forest|landcover/.test(id)) color = '#a2ada0';
      else if (/building/.test(id)) color = '#b0bdc1';
      else if (/road|highway|street|bridge/.test(id) && !/label|shield|name/.test(id)) color = /casing|outline/.test(id) ? '#a3a9a9' : '#65717a';
      else if (/background|landuse/.test(id)) color = '#d0d2ce';
      if (color && map.getLayer(id)) map.setPaintProperty(id, property, modern ? color : value as string | ExpressionSpecification);
    }
    if (map.getLayer('building-3d')) {
      const colors = modern ? ['#c5cecf', '#aabcc2', '#8da7b3', '#648999', '#3c657e'] : ['#e7e2d9', '#d6d3cc', '#b9c4d3', '#8fa6c4', '#5f7fa8'];
      const expression = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, colors[0], 25, colors[1], 60, colors[2], 150, colors[3], 300, colors[4]] as ExpressionSpecification;
      map.setPaintProperty('building-3d', 'fill-extrusion-color', expression);
      map.setPaintProperty('building-3d', 'fill-extrusion-opacity', modern ? 0.97 : 0.92);
    }
    try {
      map.setSky(modern ? { 'sky-color': '#b3c4cc', 'horizon-color': '#e0e6e7', 'fog-color': '#cad4d8', 'sky-horizon-blend': 0.75, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 } : { 'sky-color': '#9ec5ea', 'horizon-color': '#f3e7d3', 'fog-color': '#e9eef4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 });
    } catch {
      /* older renderer without sky support: keep the default sky */
    }
    map.setLight({ anchor: 'map', position: [1.4, 210, 35], intensity: modern ? 0.48 : 0.35, color: modern ? '#e4f1fa' : '#fff6e8' });
    if (map.getLayer('fictional-glass-tower')) map.setLayoutProperty('fictional-glass-tower', 'visibility', appearance.landmarks ? 'visible' : 'none');
  };
}
