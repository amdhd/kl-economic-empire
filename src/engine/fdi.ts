import { negotiatedBuild } from './investment-deals';
// Foreign direct investment (schema 9, model 3; D-059). Pledges arrive on their own seeded stream (`fdi.rng`), so the
// engine's main RNG sequence is unchanged. All pledges, amounts and investor decisions are FICTIONAL simulations that
// use real company names for context only.
import { COMPANY_BY_ID } from '../data/companies';
import { BASE_TAX, SECTOR_IDS } from '../data/economic-baseline';
import type { FdiKind, FdiPledge, FdiState, GameState, SectorId, TickerId } from '../types/game';
import { post } from './government';
import { fiscalClimate } from './fiscal-levers';
import { hubClimate, leverTarget, leverValue, LEVERS, MIN_WAGE0, WORKER_LEVY0 } from './policy';
import { rand, seedRng } from './rng';
import { clamp, news, pushBounded } from './util';
import { BOOM, boomOn } from '../data/boom';
import { dealTheme, flavourDraw, flavourPick, flavourShuffle } from './deal-flavour';

interface KindSpec {
  label: string;
  sector: SectorId;
  investors: TickerId[];
  amount: [number, number]; // MYR range
  weeklyHazard: number; // at neutral attractiveness (index 50)
  buildMonths: number;
  domesticShare: number; // of spending bought from Malaysian sectors (the rest is imported equipment)
  exportRatio: number; // annual exports once operating, × investment
  jobsPerBn: number; // direct jobs per RM1bn once operating (illustrative)
  askRange: [number, number]; // incentive asked, share of investment
}

export const FDI_KINDS: Record<FdiKind, KindSpec> = {
  datacentre: { label: 'AI data centre', sector: 'tech', investors: ['US:GOOGL', 'US:MSFT', 'US:AMZN', 'US:ORCL', 'US:META', 'US:NVDA'], amount: [3e9, 15e9], weeklyHazard: 0.03, buildMonths: 18, domesticShare: 0.35, exportRatio: 0.3, jobsPerBn: 70, askRange: [0.04, 0.15] },
  semiconductor: { label: 'Semiconductor plant', sector: 'tech', investors: ['US:INTC', 'US:MU', 'US:TXN', 'US:AMAT', 'US:LRCX', 'US:AMD', 'US:NVDA', 'US:ASML', 'US:QCOM', 'US:TSM'], amount: [4e9, 25e9], weeklyHazard: 0.02, buildMonths: 30, domesticShare: 0.3, exportRatio: 0.7, jobsPerBn: 450, askRange: [0.06, 0.2] },
  ev: { label: 'EV & battery plant', sector: 'ind', investors: ['US:TSLA'], amount: [2e9, 8e9], weeklyHazard: 0.008, buildMonths: 24, domesticShare: 0.45, exportRatio: 0.6, jobsPerBn: 700, askRange: [0.06, 0.18] },
  renewables: { label: 'Solar & storage park', sector: 'util', investors: ['US:AMZN', 'US:GOOGL', 'US:TSLA', 'US:MSFT'], amount: [1e9, 5e9], weeklyHazard: 0.01, buildMonths: 15, domesticShare: 0.5, exportRatio: 0, jobsPerBn: 120, askRange: [0.03, 0.12] },
  hq: { label: 'Regional hub', sector: 'fin', investors: ['US:JPM', 'US:V', 'US:MA', 'US:IBM', 'US:CRM', 'US:ADBE', 'US:CSCO', 'US:PLTR'], amount: [0.5e9, 2e9], weeklyHazard: 0.015, buildMonths: 9, domesticShare: 0.7, exportRatio: 0.4, jobsPerBn: 1200, askRange: [0.02, 0.1] },
};
export const FDI_KIND_IDS = Object.keys(FDI_KINDS) as FdiKind[];
const DECIDE_DAYS = 30;
const FX_PRESSURE_PER_USD_BN = 0.003; // inflows mirror the fund's outflow channel (D-058)

export function initialFdi(seed: number, enabled: boolean): FdiState {
  return { enabled, rng: seedRng((seed ^ 0x2f6b4a1d) >>> 0), nextId: 1, pledges: [], mtd: { pledged: 0, approved: 0, realised: 0, grants: 0 }, history: [], standing: [] };
}

/** Investment-climate index by kind (50 = opening climate). Announced policy counts at once: investors read signals. */
export function attractiveness(s: GameState, kind: FdiKind): number {
  if (!s.fdi?.enabled) return 50;
  const corp = s.government.policies.tax.corporate;
  const cred = s.fiscal?.credibility ?? 60;
  let x = 50
    + 150 * (BASE_TAX.corporate - corp)
    + 120 * (leverTarget(s, 'fdiIncentive') - LEVERS.fdiIncentive.initial)
    + 6 * leverTarget(s, 'fdiGreenLane')
    + 0.25 * (cred - 60)
    - 30 * leverTarget(s, 'exportConversion')
    - 8 * leverTarget(s, 'hotMoneyControls')
    - 15 * Math.max(0, leverTarget(s, 'minimumWage') / MIN_WAGE0 - 1) * (kind === 'ev' || kind === 'semiconductor' ? 1.5 : 0.5)
    - 4 * (leverTarget(s, 'workerLevy') / WORKER_LEVY0 - 1)
    + hubClimate(s, kind)
    + fiscalClimate(s)
    + 10 * Math.log(Math.max(0.2, s.world?.exportAccess ?? 1));
  if (kind === 'datacentre') x += 25 * Math.min(1, leverTarget(s, 'aiProgramme') / 5e9) + 6 * leverTarget(s, 'aiAdoptionCredit') - 40 * (s.sectors.util.price - 1);
  if (kind === 'semiconductor') x += 8 * Math.min(1, leverTarget(s, 'reskilling') / 2e9) + 6 * Math.min(1, leverTarget(s, 'aiProgramme') / 5e9);
  if (kind === 'renewables' || kind === 'ev') x += 20 * Math.min(1, leverTarget(s, 'greenIncentive') / 3e9) + 0.08 * leverTarget(s, 'carbonTax');
  if (boomOn(s)) x += BOOM.fdiAttractiveness;
  return clamp(x, 5, 100);
}
export const overallAttractiveness = (s: GameState) => FDI_KIND_IDS.reduce((a, k) => a + attractiveness(s, k) * FDI_KINDS[k].weeklyHazard, 0) / FDI_KIND_IDS.reduce((a, k) => a + FDI_KINDS[k].weeklyHazard, 0);

/** Investor name as used in pledges (the operating brand rather than a share-class label). */
const INVESTOR_NAME: Partial<Record<TickerId, string>> = { 'US:GOOGL': 'Google (Alphabet)', 'US:META': 'Meta', 'US:AMZN': 'Amazon (AWS)', 'US:TSM': 'TSMC' };
export const investorName = (id: TickerId) => INVESTOR_NAME[id] ?? COMPANY_BY_ID[id]?.displayName ?? id;

function offer(s: GameState, kind: FdiKind, investor: TickerId, amount: number, ask: number, today: number): FdiPledge {
  const k = FDI_KINDS[kind];
  const name = investorName(investor);
  const pledge: FdiPledge = {
    id: s.fdi.nextId++, investor, kind, sector: k.sector, title: `${name} proposes a RM${(amount / 1e9).toFixed(1)}bn ${k.label.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`,
    amount, ask, incentive: 0, jobs: Math.round((amount / 1e9) * k.jobsPerBn), buildMonths: boomOn(s) ? BOOM.fdiBuildMonths : k.buildMonths, offeredDay: today, decideByDay: today + DECIDE_DAYS,
    startDay: -1, spent: 0, status: 'offered',
  };
  s.fdi.pledges.push(pledge);
  prunePledges(s.fdi);
  s.fdi.mtd.pledged += amount;
  news(s, { kind: 'fund', tone: 'good', title: `Investment pledge: ${pledge.title}`, body: `Fictional simulated pledge. Asks for a ${(ask * 100).toFixed(0)}% co-investment incentive. Decide within ${DECIDE_DAYS} days in Investment & FDI; otherwise it goes elsewhere.` });
  return pledge;
}

/** Keep the pledge list bounded by dropping the oldest decided-against offers. Projects that are building or operating
 * are never dropped: they carry grants, exports and jobs (a plain size cap could silently delete them). */
export function prunePledges(f: FdiState, limit = 120): void {
  while (f.pledges.length > limit) {
    const i = f.pledges.findIndex((p) => p.status === 'declined' || p.status === 'withdrawn');
    if (i < 0) break;
    f.pledges.splice(i, 1);
  }
}

/** The investors this campaign's pledges draw from: a seeded shuffle of the kind's list, keeping about 60% of it (D-116). */
export function campaignInvestors(s: GameState, kind: FdiKind): TickerId[] {
  const all = FDI_KINDS[kind].investors;
  return all.length < 3 ? all : flavourShuffle(s, `investors:${kind}`, all).slice(0, Math.max(2, Math.ceil(all.length * 0.6)));
}
const OPENING_KINDS: FdiKind[] = ['datacentre', 'renewables', 'hq'];
/** New campaigns open with one headline pledge, so the mechanic is visible early. D-116: its kind, investor, size and ask come
 * from the campaign seed (hash draws, no RNG); the kinds on offer build within 18 months so the opening decision pays off. */
export function openingPledge(s: GameState, today: number): void {
  if (!s.fdi?.enabled) return;
  const theme = dealTheme(s), pool = theme.id === 'green' ? ['renewables', 'renewables', 'datacentre', 'hq'] : theme.id === 'digital' ? ['datacentre', 'datacentre', 'hq', 'renewables'] : OPENING_KINDS;
  const kind = flavourPick(s, 'opening:kind', pool as FdiKind[]), k = FDI_KINDS[kind];
  const investor = flavourPick(s, 'opening:investor', campaignInvestors(s, kind));
  const amount = Math.round((k.amount[0] + (0.25 + 0.5 * flavourDraw(s, 'opening:size')) * (k.amount[1] - k.amount[0])) / 1e9 * 10) * 1e8;
  const ask = Math.round((k.askRange[0] + (0.3 + 0.4 * flavourDraw(s, 'opening:ask')) * (k.askRange[1] - k.askRange[0])) * 100) / 100;
  offer(s, kind, investor, amount, ask, today);
}

/** Weekly arrivals from the FDI stream, and expiry of undecided offers. */
export function weeklyFdi(s: GameState, today: number): void {
  if (!s.fdi?.enabled) return;
  for (const p of s.fdi.pledges) if (p.status === 'offered' && today >= p.decideByDay) {
    p.status = 'withdrawn';
    news(s, { kind: 'fund', tone: 'bad', title: `Pledge lapsed: ${investorName(p.investor)}`, body: 'No decision within 30 days; the investor chose another location (simulated).' });
  }
  for (const kind of FDI_KIND_IDS) {
    const k = FDI_KINDS[kind];
    const draw = rand(s.fdi.rng), pick = rand(s.fdi.rng), size = rand(s.fdi.rng), askDraw = rand(s.fdi.rng); // fixed draw count per kind
    const boom = boomOn(s);
    const hazard = Math.min(0.9, k.weeklyHazard * Math.pow(attractiveness(s, kind) / 50, 2) * (boom ? BOOM.fdiHazard : 1));
    if (draw >= hazard) continue;
    const pool = campaignInvestors(s, kind), investor = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
    // Boom mode: mega-projects that grow with the campaign (D-079).
    const mega = boom ? BOOM.fdiSizeBase + BOOM.fdiSizePerYear * (s.external.daysElapsed / 365) : 1;
    const amount = Math.round((k.amount[0] + size * (k.amount[1] - k.amount[0])) * mega / 1e8) * 1e8;
    offer(s, kind, investor, amount, Math.round((k.askRange[0] + askDraw * (k.askRange[1] - k.askRange[0])) * 100) / 100, today);
  }
}

/** Player decision. Below the ask, the investor may walk away (drawn from the FDI stream). */
export function decidePledge(s: GameState, id: number, approve: boolean, incentive: number): string | null {
  if (!s.fdi?.enabled) return 'Investment pledges are modelled in new Malaysia campaigns.';
  const p = s.fdi.pledges.find(x => x.id === id);
  if (s.deals?.items.some(d=>d.pledgeId===id && ['negotiating','agreed','active'].includes(d.status))) return 'Finish the negotiated agreement in the Deal Room.';
  if (!p || p.status !== 'offered') return 'That pledge is no longer awaiting a decision.';
  if (!approve) { p.status = 'declined'; news(s, { kind: 'fund', tone: 'neutral', title: `Pledge declined: ${investorName(p.investor)}`, body: 'The government declined this simulated proposal.' }); return null; }
  if (!Number.isFinite(incentive) || incentive < 0 || incentive > 0.3) return 'Incentive must be 0–30% of the investment.';
  const accept = incentive + 1e-9 >= p.ask || rand(s.fdi.rng) < Math.exp(-8 * (p.ask - incentive));
  if (!accept) {
    p.status = 'withdrawn';
    news(s, { kind: 'fund', tone: 'bad', title: `Investor walked away: ${investorName(p.investor)}`, body: `The ${(incentive * 100).toFixed(0)}% offer was below the ${(p.ask * 100).toFixed(0)}% asked (simulated).` });
    return null;
  }
  p.status = 'building';
  p.incentive = Math.round(incentive * 1000) / 1000;
  p.startDay = s.scheduler.lastDay + 1;
  p.buildMonths = Math.max(1, Math.round(p.buildMonths * (leverValue(s, 'fdiGreenLane') ? 0.75 : 1)));
  s.fdi.mtd.approved += p.amount;
  news(s, { kind: 'fund', tone: 'good', title: `Investment approved: ${p.title.replace(' proposes', ' commits to')}`, body: `${(p.incentive * 100).toFixed(0)}% co-investment grant paid as it builds over ~${p.buildMonths} months; ~${p.jobs.toLocaleString('en-MY')} direct jobs once operating (simulated).` });
  return null;
}

/** Daily build-out: domestic purchases, imported equipment, grants and the capital inflow's FX pressure. */
export function dailyFdi(s: GameState, purchases: Record<SectorId, number>): { imports: number } {
  if (!s.fdi?.enabled) return { imports: 0 };
  let imports = 0;
  for (const p of s.fdi.pledges) {
    if (p.status !== 'building') continue;
    const negotiated=negotiatedBuild(s,p,purchases);
    if(negotiated!==null){imports+=negotiated;continue;}
    const k = FDI_KINDS[p.kind];
    const day = Math.min(p.amount - p.spent, p.amount / (p.buildMonths * 365 / 12));
    if (day <= 0) continue;
    p.spent += day;
    s.fdi.mtd.realised += day;
    const domestic = day * k.domesticShare;
    purchases.prop += domestic * 0.6;
    purchases.ind += domestic * 0.2;
    purchases.tech += domestic * 0.2;
    imports += day - domestic;
    // Only the ringgit spent locally is converted, a capital inflow that supports the currency.
    s.centralBank.pressure = clamp(s.centralBank.pressure - FX_PRESSURE_PER_USD_BN * domestic / s.external.myrPerUsd / 1e9, -0.08, 0.08);
    const grant = post(s.government, 'policyGrant', day * p.incentive);
    s.fdi.mtd.grants += grant;
    s.policy.mtd.fdiGrants += grant;
    if (p.spent >= p.amount - 1) {
      p.status = 'operating';
      // Boom mode (D-112): the finished plant is capacity as well as demand, so its sector does not run short of what it exports.
      if (boomOn(s)) s.sectors[p.sector].capacity += (p.amount * k.exportRatio) / 365 / BOOM.fdiCapacityUtil;
      news(s, { kind: 'fund', tone: 'good', title: `Now operating: ${investorName(p.investor)} ${k.label.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`, body: 'Exports and direct jobs start from the next settlement (simulated).' });
    }
  }
  return { imports };
}

/** Real export demand added by operating FDI, by sector (MYR/day at opening prices). */
export function fdiExports(s: GameState): Record<SectorId, number> {
  const out = Object.fromEntries(SECTOR_IDS.map(j => [j, 0])) as Record<SectorId, number>;
  if (!s.fdi?.enabled) return out;
  for (const p of s.fdi.pledges) if (p.status === 'operating') out[p.sector] += (p.amount * FDI_KINDS[p.kind].exportRatio) / 365;
  return out;
}
export const operatingStock = (s: GameState, kind?: FdiKind) => (s.fdi?.pledges ?? []).filter(p => p.status === 'operating' && (!kind || p.kind === kind)).reduce((a, p) => a + p.amount, 0);
export const directJobs = (s: GameState) => (s.fdi?.pledges ?? []).filter(p => p.status === 'operating').reduce((a, p) => a + p.jobs, 0);

export function monthCloseFdi(s: GameState, monthKey: number): void {
  if (!s.fdi?.enabled) return;
  const f = s.fdi;
  pushBounded(f.history, { monthKey, ...f.mtd, operatingStock: operatingStock(s), jobs: directJobs(s), attractiveness: overallAttractiveness(s) }, 60);
  f.mtd = { pledged: 0, approved: 0, realised: 0, grants: 0 };
}

/** Trailing-12-month realised FDI as a share of nominal GDP. */
export function fdiToGdp(s: GameState): number {
  const h = s.fdi?.history.slice(-12) ?? [];
  const realised = h.reduce((a, m) => a + m.realised, 0) * (h.length ? 12 / h.length : 0);
  return realised / Math.max(1, s.indicators.nominalGdpAnnual);
}

export function validateFdi(f: FdiState): void {
  if (!f || typeof f.enabled !== 'boolean' || !f.rng || !(['a', 'b', 'c', 'd'] as const).every(k => Number.isInteger(f.rng[k])) || !Number.isSafeInteger(f.nextId) || !Array.isArray(f.pledges) || !Array.isArray(f.history) || !Array.isArray(f.standing) || !f.mtd) throw new Error('Corrupt save: FDI state');
  for (const p of f.pledges) {
    if (!(p.kind in FDI_KINDS) || !(p.amount > 0) || !(p.spent >= 0 && p.spent <= p.amount + 1) || !(p.incentive >= 0 && p.incentive <= 0.3) || !(p.ask >= 0 && p.ask <= 0.3)
      || !['offered', 'building', 'operating', 'declined', 'withdrawn'].includes(p.status) || !(p.buildMonths >= 1)) throw new Error('Corrupt save: FDI pledge');
  }
}
