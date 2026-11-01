// Deal Room variety (D-113). Every counterparty, backstory and headline figure in the Deal Room is drawn from the campaign
// seed, so one seed always shows the same history while different seeds show visibly different offers. The draws are pure
// hashes of (state.seed, salt): they consume no random numbers, so the main, deals and FDI rng streams are untouched and
// saves round-trip with no new state. Every name is fictional; the mechanics keyed on `Deal.template` are unchanged.
import type { GameState, SectorId } from '../types/game';

/** FNV-1a over `${seed}|${salt}`, finished with a murmur-style mix. Uniform in [0,1). */
export function flavourDraw(s: Pick<GameState, 'seed'>, salt: string): number {
  let h = 2166136261 ^ (s.seed >>> 0);
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const flavourInt = (s: Pick<GameState, 'seed'>, salt: string, n: number) => Math.min(n - 1, Math.floor(flavourDraw(s, salt) * n));
export const flavourPick = <T,>(s: Pick<GameState, 'seed'>, salt: string, xs: readonly T[]): T => xs[flavourInt(s, salt, xs.length)];
/** A multiplier in [1-spread, 1+spread], rounded to 2 decimals so figures stay tidy. */
export const flavourScale = (s: Pick<GameState, 'seed'>, salt: string, spread: number) => Math.round((1 + (flavourDraw(s, salt) * 2 - 1) * spread) * 100) / 100;
/** Deterministic Fisher–Yates shuffle (seeded by the salt). */
export function flavourShuffle<T>(s: Pick<GameState, 'seed'>, salt: string, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = flavourInt(s, `${salt}#${i}`, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Each campaign leans towards one theme: it decides which sectors and partners the early offers favour. */
export const DEAL_THEMES = [
  { id: 'digital', label: 'Digital corridor', sectors: ['tech', 'fin'], blurb: 'cloud, data and software partners are circling' },
  { id: 'green', label: 'Green transition', sectors: ['util', 'ind'], blurb: 'clean-power and battery developers are circling' },
  { id: 'gateway', label: 'Maritime gateway', sectors: ['ind', 'cons'], blurb: 'ports, shipping and logistics groups are circling' },
  { id: 'heartland', label: 'Agri-food heartland', sectors: ['cons', 'ind'], blurb: 'food, plantation and cold-chain groups are circling' },
  { id: 'care', label: 'Care economy', sectors: ['health', 'cons'], blurb: 'hospital, training and ageing-care operators are circling' },
  { id: 'heavy', label: 'Heavy industry', sectors: ['ind', 'prop'], blurb: 'steel, chemicals and machinery groups are circling' },
] as const;
export type DealTheme = (typeof DEAL_THEMES)[number];
export const dealTheme = (s: Pick<GameState, 'seed'>): DealTheme => flavourPick(s, 'theme', DEAL_THEMES);

export interface StartupFlavour { name: string; founders: string; sector: SectorId; kind: string; note: string }
const STARTUPS: StartupFlavour[] = [
  { name: 'Awan Grid', founders: 'Awan Grid founders', sector: 'tech', kind: 'seed investment', note: 'A smart-grid analytics start-up selling to utilities.' },
  { name: 'Kilat Cloud', founders: 'Kilat Cloud founders', sector: 'tech', kind: 'cloud joint venture', note: 'A sovereign-cloud joint venture hosting government and bank workloads.' },
  { name: 'Mahir Skills', founders: 'Mahir Skills founders', sector: 'cons', kind: 'training partnership', note: 'A technical-training partnership that places graduates with plant operators.' },
  { name: 'Suria Voltan', founders: 'Suria Voltan developers', sector: 'util', kind: 'solar PPA developer', note: 'A solar developer with a 15-year power-purchase agreement in hand.' },
  { name: 'Selat Hub', founders: 'Selat Hub sponsors', sector: 'ind', kind: 'port logistics concession', note: 'A feeder-port and bonded-warehouse concession serving the strait.' },
  { name: 'Padi Prima', founders: 'Padi Prima founders', sector: 'cons', kind: 'precision-farming spin-out', note: 'A precision-farming spin-out serving paddy cooperatives.' },
  { name: 'Teras Fab', founders: 'Teras Fab engineers', sector: 'ind', kind: 'tech-transfer workshop', note: 'A tech-transfer workshop licensing advanced machining know-how.' },
  { name: 'Dian Health', founders: 'Dian Health founders', sector: 'health', kind: 'diagnostics start-up', note: 'A low-cost diagnostics start-up rolling out to district clinics.' },
  { name: 'Lautan Cold', founders: 'Lautan Cold founders', sector: 'cons', kind: 'cold-chain venture', note: 'A cold-chain venture cutting post-harvest losses for exporters.' },
  { name: 'Rimbun Carbon', founders: 'Rimbun Carbon founders', sector: 'util', kind: 'offtake agreement', note: 'A biomass and carbon-credit developer with an offtake agreement for its output.' },
  { name: 'Tiara Pay', founders: 'Tiara Pay founders', sector: 'fin', kind: 'payments start-up', note: 'A payments start-up for small merchants across the east coast.' },
  { name: 'Gunung Mineral', founders: 'Gunung Mineral geologists', sector: 'ind', kind: 'sovereign co-investment', note: 'A rare-earth processor open to a sovereign-fund co-investment.' },
  { name: 'Pulau Robotik', founders: 'Pulau Robotik founders', sector: 'ind', kind: 'automation venture', note: 'A factory-automation venture retrofitting mid-size plants.' },
  { name: 'Bayu Wind', founders: 'Bayu Wind sponsors', sector: 'util', kind: 'green PPA developer', note: 'A small wind-and-storage developer with a utility PPA under negotiation.' },
];
export const STARTUP_POOL = STARTUPS;
/** Start-up flavour for the n-th seed-investment offer: the campaign theme's sectors come first, then the rest, shuffled by seed. */
export function startupFlavour(s: GameState, n: number): StartupFlavour {
  const theme = dealTheme(s);
  const ranked = flavourShuffle(s, 'startup-order', STARTUPS).sort((a, b) => Number((theme.sectors as readonly string[]).includes(b.sector)) - Number((theme.sectors as readonly string[]).includes(a.sector)));
  return ranked[n % ranked.length];
}

const ANGLES = [
  'lead investor wanted', 'talks open after a rival withdrew', 'seeks a patient public partner', 'a regional champion in the making',
  'backed by a family office', 'turnaround under a new management team', 'pre-agreed customers, needs capital', 'asks for a fast decision',
];
export const cohortAngle = (s: GameState, episode: number, index: number) => flavourPick(s, `angle:${episode}:${index}`, ANGLES);

export interface BuyerFlavour { counterparty: string; descriptor: string; backstory: string }
/** Buyer pools by export template; the country of each buyer matches the contract's trading partner. */
const BUYERS: Record<string, BuyerFlavour[]> = {
  'export:lng': [
    { counterparty: 'Higashi Power', descriptor: 'Japanese utility', backstory: 'replacing ageing coal units' },
    { counterparty: 'Sakura Gas & Light', descriptor: 'Japanese gas distributor', backstory: 'diversifying away from a single supplier' },
    { counterparty: 'Kita-Nippon Energy', descriptor: 'Japanese power group', backstory: 'covering a winter demand peak' },
    { counterparty: 'Mizuho Gridworks', descriptor: 'Japanese grid operator', backstory: 'topping up reserve margins' },
  ],
  'export:chips': [
    { counterparty: 'Northbay Devices', descriptor: 'US device maker', backstory: 'qualifying a second back-end site' },
    { counterparty: 'Cobalt Peak Semiconductor', descriptor: 'US chip designer', backstory: 'adding test capacity outside East Asia' },
    { counterparty: 'Redwood Silicon', descriptor: 'US fabless firm', backstory: 'shortening its supply chain' },
    { counterparty: 'Lakeshore Micro', descriptor: 'US sensor maker', backstory: 'ramping a new product line' },
  ],
  'export:steel': [
    { counterparty: 'Al Noor Build', descriptor: 'Gulf construction group', backstory: 'delivering a giga-project' },
    { counterparty: 'Sahra Infrastructure', descriptor: 'Gulf rail contractor', backstory: 'building a new freight line' },
    { counterparty: 'Qasr Steelworks Trading', descriptor: 'Gulf steel trader', backstory: 'supplying shipyard orders' },
    { counterparty: 'Wadi Towers', descriptor: 'Gulf developer', backstory: 'topping out a tower cluster' },
  ],
  'export:halal': [
    { counterparty: 'Nusantara Mart', descriptor: 'regional supermarket chain', backstory: 'expanding private-label ranges' },
    { counterparty: 'Cakra Fresh', descriptor: 'ASEAN hotel and catering group', backstory: 'standardising its halal kitchens' },
    { counterparty: 'Lembayung Foods', descriptor: 'ASEAN convenience-store network', backstory: 'launching ready meals' },
    { counterparty: 'Selaras Airline Catering', descriptor: 'regional airline caterer', backstory: 'rebuilding its menu base' },
  ],
  'export:palm': [
    { counterparty: 'Ganga Edible Oils', descriptor: 'Indian refiner', backstory: 'securing feedstock for a new refinery' },
    { counterparty: 'Kaveri Agro Foods', descriptor: 'Indian packaged-food maker', backstory: 'hedging against monsoon shocks' },
    { counterparty: 'Narmada Oleochem', descriptor: 'Indian oleochemical maker', backstory: 'adding a soap and detergent line' },
    { counterparty: 'Deccan Staples', descriptor: 'Indian state buying agency', backstory: 'a government-to-government tender' },
  ],
};
export function exportBuyer(s: GameState, template: string, round: number): BuyerFlavour | undefined {
  const pool = BUYERS[template];
  return pool && flavourShuffle(s, `buyer:${template}`, pool)[round % pool.length];
}

export interface SupplierFlavour { counterparty: string; label: string; backstory: string }
const FUEL_SUPPLIERS: SupplierFlavour[] = [
  { counterparty: 'Selat Fuel Supply', label: 'Government fleet fuel contract', backstory: 'a coastal depot network' },
  { counterparty: 'Kuala Petrol Cooperative', label: 'Public-fleet diesel framework', backstory: 'a cooperative of independent station owners' },
  { counterparty: 'Borneo Bunkering', label: 'Ministry vehicle fuel agreement', backstory: 'a shipping-linked fuel merchant' },
  { counterparty: 'Tenggara Energy Trading', label: 'Emergency-services fuel contract', backstory: 'a trader with a bonded terminal' },
];
const STEEL_SUPPLIERS: SupplierFlavour[] = [
  { counterparty: 'Baja Materials Cooperative', label: 'Participating manufacturers: steel supply', backstory: 'a voluntary cohort of mills' },
  { counterparty: 'Kemaman Steel Alliance', label: 'Mills alliance: coil and bar supply', backstory: 'an east-coast mill alliance' },
  { counterparty: 'Perak Fabricators Guild', label: 'Fabricators guild: structural steel supply', backstory: 'a guild of fabricators and rolling mills' },
  { counterparty: 'Johor Metals Consortium', label: 'Metals consortium: industrial steel supply', backstory: 'a southern consortium serving the strait' },
];
export function supplier(s: GameState, industrial: boolean, round: number): SupplierFlavour {
  const pool = industrial ? STEEL_SUPPLIERS : FUEL_SUPPLIERS;
  return flavourShuffle(s, `supplier:${industrial}`, pool)[round % pool.length];
}

const DISTRESSED = [
  { name: 'Lestari Textiles', what: 'a textile maker' },
  { name: 'Bunga Plastics', what: 'a packaging and plastics maker' },
  { name: 'Kenangan Furniture', what: 'a furniture exporter' },
  { name: 'Sri Kapal Marine', what: 'a coastal shipping line' },
  { name: 'Hijau Agrotech', what: 'a greenhouse grower' },
  { name: 'Aman Print & Pack', what: 'a printing and packaging group' },
] as const;
const CLINICS = [
  { name: 'Cahaya Clinics', what: 'a district clinic chain' },
  { name: 'Harapan Dialysis', what: 'a dialysis-centre operator' },
  { name: 'Sihat Dental Group', what: 'a dental-clinic chain' },
  { name: 'Kasih Ageing Care', what: 'an elderly-care provider' },
] as const;
const ACQUISITIONS = [
  { name: 'Nusa Logistics', what: 'a freight and warehousing group' },
  { name: 'Tanjung Cold Chain', what: 'a cold-chain operator' },
  { name: 'Wira Auto Components', what: 'an auto-parts maker' },
  { name: 'Delima Packaging', what: 'a food-packaging maker' },
  { name: 'Pelita Chemicals', what: 'a specialty-chemicals maker' },
] as const;
export type Distressed = { name: string; what: string };
const CLINIC_LIST: readonly Distressed[] = CLINICS, DISTRESSED_LIST: readonly Distressed[] = DISTRESSED;
export const rescueTarget = (s: GameState, insolvent: boolean, round: number): Distressed => flavourShuffle(s, `rescue:${insolvent}`, insolvent ? DISTRESSED_LIST : CLINIC_LIST)[round % (insolvent ? DISTRESSED_LIST : CLINIC_LIST).length];
export const takeoverTarget = (s: GameState, round: number): Distressed => flavourShuffle(s, 'takeover', ACQUISITIONS)[round % ACQUISITIONS.length];

/** How many offers of a kind already exist: each new offer of that kind takes the next name in the campaign's order. */
export const kindRound = (s: GameState, kind: string) => s.deals.items.filter((d) => d.kind === kind).length;
