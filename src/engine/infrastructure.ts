// Infrastructure capacity (D-084). Pure and deterministic: no randomness, only state in, state out.
// Load follows real GDP (and the workforce for housing); capacity grows only through player orders that take years to
// build. Overload throttles sector output capacity via `infraCapacityMult`, which the daily economy reads.
import { INFRA, NETWORKS, NETWORK_SPECS, type NetworkId } from '../data/infrastructure';
import { BOOM, boomOn } from '../data/boom';
import { SECTOR_IDS } from '../data/economic-baseline';
import type { GameState, InfraState, SectorId } from '../types/game';
import { news } from './util';

const ones = () => Object.fromEntries(SECTOR_IDS.map((j) => [j, 1])) as Record<SectorId, number>;

export function initialInfra(realGdpAnnual: number, laborForce: number): InfraState {
  const net = () => ({ capacity: INFRA.openingCapacity, load: 1, loadSlow: 1, congested: false });
  return { nextId: 1, openingGdpReal: realGdpAnnual, openingLabour: laborForce, gdpFast: realGdpAnnual, gdpSlow: realGdpAnnual,
    nets: { power: net(), transport: net(), housing: net() }, builds: [], mult: ones() };
}

/** Sector capacity multiplier from infrastructure overload; 1 in realistic campaigns. */
export const infraCapacityMult = (s: GameState, j: SectorId): number => s.infra?.mult[j] ?? 1;

export const utilisation = (st: InfraState, n: NetworkId) => st.nets[n].load / st.nets[n].capacity;

function loadOf(st: InfraState, n: NetworkId, gdp: number, labour: number): number {
  const g = gdp / st.openingGdpReal;
  if (n !== 'housing') return Math.pow(g, NETWORK_SPECS[n].loadElasticity);
  const workers = labour / st.openingLabour;
  return workers * Math.pow(g / workers, INFRA.housingIncomeElasticity);
}

/** Projected load index `days` ahead on the current trend (for planning; not a forecast the game guarantees). */
export function projectedLoad(st: InfraState, n: NetworkId, days = INFRA.horizonDays): number {
  const x = st.nets[n];
  const growthPerDay = Math.log(Math.max(1e-9, x.load) / Math.max(1e-9, x.loadSlow)) / INFRA.slowDays;
  return x.load * Math.exp(Math.max(0, growthPerDay) * days);
}

export const pendingSteps = (st: InfraState, n: NetworkId) => st.builds.filter((b) => b.network === n).reduce((a, b) => a + b.steps, 0);

/** End of each day: update the GDP signal, loads, congestion news and the sector multipliers used tomorrow. */
export function dailyInfra(s: GameState, gdpRealDaily: number): void {
  const st = s.infra;
  if (!st || !boomOn(s)) return;
  const gdp = gdpRealDaily * 365;
  st.gdpFast += (gdp - st.gdpFast) / INFRA.fastDays;
  st.gdpSlow += (gdp - st.gdpSlow) / INFRA.slowDays;
  const labour = s.households.laborForce;
  const over: Record<NetworkId, number> = { power: 0, transport: 0, housing: 0 };
  for (const n of NETWORKS) {
    const x = st.nets[n];
    x.load = loadOf(st, n, st.gdpFast, labour);
    x.loadSlow = loadOf(st, n, st.gdpSlow, labour);
    const u = x.load / x.capacity;
    over[n] = Math.max(0, u - 1);
    const spec = NETWORK_SPECS[n];
    if (!x.congested && u > 1) {
      x.congested = true;
      news(s, { kind: 'policy', tone: 'bad', title: `${spec.label} is over capacity`, body: 'Demand exceeds capacity, so affected sectors cannot produce what is asked. New capacity takes years to build, so order it before the limit.' });
    } else if (x.congested && u < 0.97) {
      x.congested = false;
      news(s, { kind: 'policy', tone: 'good', title: `${spec.label} is back within capacity`, body: 'The bottleneck has eased and sectors can use their full capacity again.' });
    }
  }
  for (const j of SECTOR_IDS) {
    const hit = NETWORKS.reduce((a, n) => a + NETWORK_SPECS[n].weights[j] * over[n], 0);
    st.mult[j] = Math.max(INFRA.floor, 1 / (1 + INFRA.penalty * hit));
  }
}

/** Cost of an order (MYR, fixed when ordered): the opening-economy price of the capacity, scaled by the price level and by
 * the economy's real size to the power `costScale`, since building in a richer, denser country costs more per unit. */
export function orderCost(s: GameState, n: NetworkId, steps: number): number {
  const st = s.infra;
  const size = st ? Math.max(1, st.gdpFast / st.openingGdpReal) : 1;
  return BOOM.infraCostFactor * NETWORK_SPECS[n].costGdpShare * steps * INFRA.step * s.baseline.nominalGdpAnnual * (s.indicators.cpi / 100) * Math.pow(size, INFRA.costScale);
}

export function orderInfra(s: GameState, n: NetworkId, steps: number, day: number): string | null {
  const st = s.infra;
  if (!st || !boomOn(s)) return 'Infrastructure limits apply in Boom mode only.';
  if (!NETWORKS.includes(n)) return 'Unknown network.';
  if (!(INFRA.orderSteps as readonly number[]).includes(steps)) return 'Order 1, 2 or 4 steps.';
  if (st.builds.filter((b) => b.network === n).length >= INFRA.maxBuildsPerNetwork) return `${NETWORK_SPECS[n].label}: too many builds in progress.`;
  const cost = orderCost(s, n, steps);
  st.builds.push({ id: st.nextId++, network: n, steps, cost, paid: 0, startDay: day, durationDays: NETWORK_SPECS[n].buildDays });
  news(s, { kind: 'policy', tone: 'neutral', title: `Commissioned: ${NETWORK_SPECS[n].label} +${(steps * INFRA.step).toFixed(2)}`, body: `RM${(cost / 1e9).toFixed(0)}bn over about ${Math.round(NETWORK_SPECS[n].buildDays / 30)} months. Capacity arrives only when it is built and paid for.` });
  return null;
}

export function cancelInfra(s: GameState, id: number): string | null {
  const st = s.infra;
  const i = st?.builds.findIndex((b) => b.id === id) ?? -1;
  if (!st || i < 0) return 'Build not found.';
  st.builds.splice(i, 1);
  return null;
}

/** Daily disbursement due for each build, spread evenly over its duration. */
export function infraDue(s: GameState): { id: number; amt: number }[] {
  return (s.infra?.builds ?? []).map((b) => ({ id: b.id, amt: Math.min(b.cost - b.paid, b.cost / b.durationDays) }));
}

/** Record a payment; completes the build (capacity arrives) once fully paid. */
export function payInfra(s: GameState, id: number, paid: number): void {
  const st = s.infra;
  const b = st?.builds.find((x) => x.id === id);
  if (!st || !b) return;
  b.paid += paid;
  if (b.paid >= b.cost - 1) {
    st.nets[b.network].capacity += b.steps * INFRA.step;
    st.builds.splice(st.builds.indexOf(b), 1);
    news(s, { kind: 'policy', tone: 'good', title: `Completed: ${NETWORK_SPECS[b.network].label} +${(b.steps * INFRA.step).toFixed(2)}`, body: 'New capacity is in service.' });
  }
}

export function validateInfra(st: InfraState | undefined): void {
  if (!st) return;
  const ok = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v > min;
  if (!ok(st.openingGdpReal) || !ok(st.openingLabour) || !ok(st.gdpFast) || !ok(st.gdpSlow) || !Array.isArray(st.builds)) throw new Error('Corrupt save: infrastructure');
  for (const n of NETWORKS) if (!st.nets?.[n] || !ok(st.nets[n].capacity) || !ok(st.nets[n].load) || !ok(st.nets[n].loadSlow)) throw new Error('Corrupt save: infrastructure network');
  for (const b of st.builds) if (!NETWORKS.includes(b.network) || !ok(b.cost) || !ok(b.durationDays) || !(b.paid >= 0) || !Number.isFinite(b.paid)) throw new Error('Corrupt save: infrastructure build');
  for (const j of SECTOR_IDS) if (!ok(st.mult?.[j])) throw new Error('Corrupt save: infrastructure multipliers');
}
