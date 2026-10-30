// Phase 2: equity universe metadata, verified KL locations and fictional seed sanity.
import { describe, expect, it } from 'vitest';
import { COMPANIES, COMPANY_BY_ID, currencyOf } from '../src/data/companies';
import { MY_COMPANIES } from '../src/data/companies.my';
import { US_COMPANIES } from '../src/data/companies.us';
import { baselineMonth } from '../src/engine/companies';
import { companyLocations, inKlBounds } from '../src/map/company-markers';

// Companies with an OSM-verified KL point (docs/data-sources.md). Adding a marker must update this list
// AND the provenance table — this guards against inventing locations.
const VERIFIED_MARKERS = [
  'MY:1155', 'MY:1023', 'MY:1295', 'MY:5347', 'MY:4863', 'MY:6012', 'MY:6888', 'MY:5225', 'MY:3182', 'MY:4715',
  'MY:5296', 'MY:4677', 'MY:6742', 'MY:5183', 'MY:6033', 'US:GOOGL', 'US:TSLA', 'US:XOM',
].sort();

describe('equity universe', () => {
  it('has exactly 40 distinct securities: 20 MY + 20 US', () => {
    expect(COMPANIES).toHaveLength(40);
    expect(MY_COMPANIES).toHaveLength(20);
    expect(US_COMPANIES).toHaveLength(20);
    expect(new Set(COMPANIES.map((c) => c.id)).size).toBe(40);
    expect(new Set(COMPANIES.map((c) => c.legalName)).size).toBe(40);
    expect(Object.keys(COMPANY_BY_ID)).toHaveLength(40);
  });

  it('uses normalised exchange-prefixed IDs and the right listing currency', () => {
    for (const c of MY_COMPANIES) {
      expect(c.id).toMatch(/^MY:\d{4}$/);
      expect(c.id).toBe(`MY:${c.code}`);
      expect(c.exchange).toBe('MY');
      expect(currencyOf(c.id)).toBe('MYR');
    }
    for (const c of US_COMPANIES) {
      expect(c.id).toMatch(/^US:[A-Z]{1,5}(\.[A-Z])?$/);
      expect(c.id).toBe(`US:${c.code}`);
      expect(c.exchange).toBe('US');
      expect(currencyOf(c.id)).toBe('USD');
    }
  });

  it('matches the spec seed universe (verified 2026-10-31, see docs/data-sources.md)', () => {
    expect(MY_COMPANIES.map((c) => c.code).sort()).toEqual(
      ['1155', '1023', '1295', '5347', '4863', '6012', '6888', '5225', '5211', '3182', '4715', '5296', '4677', '6742', '8869', '5183', '6033', '4197', '6947', '5398'].sort(),
    );
    expect(US_COMPANIES.map((c) => c.code).sort()).toEqual(
      ['NVDA', 'META', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'AVGO', 'TSLA', 'JPM', 'V', 'MA', 'BRK.B', 'XOM', 'COST', 'WMT', 'PG', 'AMD', 'NFLX', 'UNH', 'PLTR'].sort(),
    );
  });

  it('has coherent fictional seed data: exposures sum to 1, positive earnings, plausible P/E', () => {
    for (const c of COMPANIES) {
      const e = c.exposure;
      expect(e.kl + e.my + e.global, c.id).toBeCloseTo(1, 9);
      for (const x of [e.kl, e.my, e.global]) expect(x).toBeGreaterThanOrEqual(0);
      for (const x of [c.revenue, c.shares, c.basePE, c.vol]) expect(Number.isFinite(x) && x > 0, c.id).toBe(true);
      expect(c.payout).toBeGreaterThanOrEqual(0);
      expect(c.payout).toBeLessThanOrEqual(1);
      const ni = baselineMonth(c, 0, 0.18).netIncome;
      expect(ni, `${c.id} baseline net income`).toBeGreaterThan(0);
      expect(c.basePE).toBeGreaterThan(5);
      expect(c.basePE).toBeLessThan(200);
    }
  });

  it('US issuers are overwhelmingly non-KL (KL policy cannot drive their global earnings)', () => {
    for (const c of US_COMPANIES) expect(c.exposure.kl + c.exposure.my).toBeLessThan(0.01);
  });
});

describe('KL map markers', () => {
  it('only verified companies have a location, each with provenance and in KL', () => {
    expect(COMPANIES.filter((c) => c.geo).map((c) => c.id).sort()).toEqual(VERIFIED_MARKERS);
    for (const c of COMPANIES) {
      if (!c.geo) continue;
      expect(c.geo.verificationSource, c.id).toMatch(/^OpenStreetMap (way|node|relation)\/\d+ \(Nominatim lookup, \d{4}-\d{2}-\d{2}\)$/);
      expect(c.geo.label.length).toBeGreaterThan(3);
      expect(['hq', 'office', 'branch', 'asset']).toContain(c.geo.locationType);
      expect(inKlBounds(c.geo.lng, c.geo.lat), c.id).toBe(true);
    }
  });

  it('groups companies sharing a building into one marker and omits unverified ones', () => {
    const locs = companyLocations();
    const ids = locs.flatMap((l) => l.companies);
    expect(ids.sort()).toEqual(VERIFIED_MARKERS);
    const twin = locs.find((l) => l.companies.includes('MY:5183'))!;
    expect(twin.companies.sort()).toEqual(['MY:5183', 'MY:6033']);
    expect(new Set(locs.map((l) => l.key)).size).toBe(locs.length);
    for (const id of ['MY:5211', 'MY:8869', 'MY:5398', 'US:NVDA']) expect(ids).not.toContain(id);
  });
});
