// Map marker data for featured companies. Only companies with a VERIFIED KL point (data/geo.ts,
// docs/data-sources.md) get a marker; several companies may share one building (e.g. PETRONAS
// Twin Towers), so markers are grouped by location. Securities without a point stay tradable.
import { COMPANIES } from '../data/companies';
import type { GeoPoint, TickerId } from '../types/game';

export interface CompanyLocation {
  key: string;
  lng: number;
  lat: number;
  label: string;
  locationType: GeoPoint['locationType'];
  verificationSource: string;
  companies: TickerId[];
}

/** Generous Kuala Lumpur / Klang Valley core bounds used to reject obviously wrong coordinates. */
export const KL_BOUNDS = { west: 101.55, east: 101.8, south: 3.0, north: 3.3 };

export const LOCATION_TYPE_LABEL: Record<GeoPoint['locationType'], string> = {
  hq: 'Headquarters',
  office: 'Office',
  branch: 'Branch / outlet',
  asset: 'Major asset',
};

export function companyLocations(): CompanyLocation[] {
  const byKey = new Map<string, CompanyLocation>();
  for (const c of COMPANIES) {
    if (!c.geo) continue;
    const key = `${c.geo.lng.toFixed(6)},${c.geo.lat.toFixed(6)}`;
    const loc = byKey.get(key) ?? { key, lng: c.geo.lng, lat: c.geo.lat, label: c.geo.label, locationType: c.geo.locationType, verificationSource: c.geo.verificationSource, companies: [] };
    loc.companies.push(c.id);
    byKey.set(key, loc);
  }
  return [...byKey.values()];
}

export const inKlBounds = (lng: number, lat: number) =>
  lng >= KL_BOUNDS.west && lng <= KL_BOUNDS.east && lat >= KL_BOUNDS.south && lat <= KL_BOUNDS.north;
