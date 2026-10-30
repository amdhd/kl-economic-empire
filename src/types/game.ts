// Core game-state contract. Everything here is plain JSON-serialisable data.
// Monetary *ledger balances* are integer minor units (sen / US cents) held in JS numbers
// (safe up to ±9e15 minor units = RM 90 trillion); macro *flows* are MYR floats.

export type Currency = 'MYR' | 'USD';
export type Exchange = 'MY' | 'US';
export type GameSpeed = 1 | 2 | 3;
export type TickerId = `${Exchange}:${string}`;

export type SectorId = 'fin' | 'prop' | 'util' | 'tech' | 'cons' | 'health' | 'ind';
export type GlobalDriver = 'semis' | 'software' | 'ads' | 'consumer' | 'energy' | 'finance' | 'health' | 'industrial' | 'auto';

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

// ---------------------------------------------------------------- clock / scheduler
export interface ClockState {
  /** Epoch hours (UTC hours since 1970) of the last fully processed hour boundary. */
  hour: number;
  /** Game milliseconds accumulated inside the current hour, [0, 3_600_000). Visual only. */
  subHourMs: number;
  speed: GameSpeed;
  paused: boolean;
  startHour: number;
  endHour: number;
}

export interface SchedulerState {
  /** KL day number (days since 1970 in KL time) of the last processed daily boundary. */
  lastDay: number;
  /** Year*12+month0 of the last closed month. */
  lastMonthKey: number;
  lastWeekDay: number;
  campaignEnded: boolean;
  ticks: number;
  mtdGdpNominal: number;
  mtdGdpReal: number;
  mtdDays: number;
  startNav: number;
}

// ---------------------------------------------------------------- companies & market
export interface CompanySeed {
  id: TickerId;
  code: string; // exchange code / ticker
  displayName: string;
  legalName: string;
  exchange: Exchange;
  sector: SectorId; // KL sector used for KL/Malaysia exposure
  driver: GlobalDriver; // global demand driver
  industry: string;
  exposure: { kl: number; my: number; global: number };
  /** Fictional annual revenue at start, major units of listing currency. */
  revenue: number;
  ebitdaMargin: number;
  laborShare: number; // of operating costs
  energyShare: number; // of operating costs
  depreciationPct: number; // of revenue
  debt: number; // major units
  cash: number;
  shares: number;
  basePE: number;
  payout: number;
  vol: number; // annualised idiosyncratic volatility
  rateSensitivity: number; // valuation duration multiplier
  geo?: GeoPoint;
}

export interface GeoPoint {
  lng: number;
  lat: number;
  label: string;
  locationType: 'hq' | 'office' | 'branch' | 'asset';
  verificationSource: string;
}

export interface MonthlyFinancials {
  monthKey: number;
  revenue: number;
  ebitda: number;
  ebit: number;
  interest: number;
  pbt: number;
  taxKL: number;
  taxOther: number;
  netIncome: number;
  dividends: number;
}

export interface CompanyState {
  id: TickerId;
  // accrual for the current (open) month
  mtd: { revenue: number; laborCost: number; energyCost: number; otherCost: number; depreciation: number; interest: number };
  /** Last 12 closed months, oldest first. */
  history: MonthlyFinancials[];
  cash: number;
  debt: number;
  retained: number;
  shares: number;
  revenueShock: number; // multiplicative, event-driven, decays to 1
  sentiment: number; // log-premium on valuation, event-driven, decays to 0
  lastDps: number;
}

export interface Bar {
  t: number; // KL day number (daily) or epoch hour (hourly)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // traded value, major units
}

export interface QuoteState {
  price: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  dayVolume: number;
  /** SWF traded value in this session (major units): impact and liquidity limits are cumulative. */
  fundDayValue: number;
  fundamental: number;
  daily: Bar[]; // bounded
  hourly: Bar[]; // bounded
}

export interface IndexState {
  value: number;
  prevClose: number;
  divisor: number;
  daily: { t: number; v: number }[];
}

export interface MarketState {
  quotes: Record<TickerId, QuoteState>;
  indices: { MY: IndexState; US: IndexState };
  sessionOpen: { MY: boolean; US: boolean };
  /** Local date key (YYYYMMDD) of the current/last session and of the last finalised daily bar. */
  sessionDay: { MY: number; US: number };
  closedDay: { MY: number; US: number };
  sectorShock: Record<string, number>;
}

// ---------------------------------------------------------------- fund
export interface Position {
  units: number;
  /** Total cost in listing-currency minor units, incl. fees. */
  costMinor: number;
  /** Total cost converted at trade-date FX, MYR sen. */
  costMYR: number;
  realizedMinor: number;
  dividendsMinor: number;
}

export type OrderStatus = 'queued' | 'filled' | 'rejected' | 'cancelled' | 'expired';
export interface Order {
  id: number;
  ticker: TickerId;
  side: 'buy' | 'sell';
  units: number;
  status: OrderStatus;
  createdMin: number;
  expiresMin: number;
  filledMin?: number;
  fillPrice?: number;
  feesMinor?: number;
  reason?: string;
}

export type FundTxType = 'buy' | 'sell' | 'dividend' | 'fx' | 'injection' | 'withdrawal' | 'fee';
export interface FundTx {
  id: number;
  atMin: number;
  type: FundTxType;
  ticker?: TickerId;
  units?: number;
  price?: number;
  currency: Currency;
  amountMinor: number; // signed cash effect in `currency`
  note: string;
  fx?: number;
  counterCurrency?: Currency;
  counterAmountMinor?: number;
  realizedMinor?: number;
  realizedMYR?: number;
}

export interface FundState {
  myrCash: number; // sen
  usdCash: number; // cents
  positions: Partial<Record<TickerId, Position>>;
  orders: Order[];
  tx: FundTx[];
  nextId: number;
  dividendTransferPct: number; // share of dividends sent to treasury monthly
  pendingDividendTransfer: number; // sen accrued for transfer at month end
  totalInjectedMYR: number;
  totalWithdrawnMYR: number;
  realized: Record<Currency, number>; // cumulative minor units, survives liquidation
  realizedMYR: number; // sen at sale-date FX less acquisition basis
  dividends: Record<Currency, number>; // cumulative net minor units
  feesPaidMYR: number;
  navHistory: { t: number; nav: number }[]; // KL day, sen
}

// ---------------------------------------------------------------- government
export interface TaxPolicy {
  corporate: number; // on taxable profits within the campaign jurisdiction
  property: number; // commercial assessment on rental value
  consumption: number; // levy on consumer & visitor spending
  household: number; // income surcharge (progressive)
}

export type BudgetCategory = 'health' | 'services' | 'safety' | 'development' | 'admin' | 'transfers';
export type BudgetPolicy = Record<BudgetCategory, number>; // MYR per month

export interface BorrowingPolicy {
  cashBufferMonths: number;
  maxDebtToGdp: number;
}

export interface Policies {
  tax: TaxPolicy;
  budget: BudgetPolicy;
  borrowing: BorrowingPolicy;
}

export interface PendingPolicy {
  id: number;
  createdMin: number;
  effectiveMin: number;
  kind: 'tax' | 'budget' | 'borrowing' | 'trade';
  patch: Partial<TaxPolicy> | Partial<BudgetPolicy> | Partial<BorrowingPolicy> | Partial<TradePolicy>;
  label: string;
}

export type ProjectKind = 'transport' | 'connectivity' | 'housing' | 'resilience' | 'health';
export interface ProjectState {
  id: number;
  templateId: string;
  name: string;
  kind: ProjectKind;
  cost: number; // MYR
  spent: number; // MYR, nominal (includes cost escalation)
  work: number; // MYR at base construction prices; complete when work >= cost
  startDay: number;
  durationDays: number;
  status: 'building' | 'complete' | 'cancelled';
  completedDay?: number;
}

export type LedgerKind =
  | 'tax_corporate'
  | 'tax_property'
  | 'tax_consumption'
  | 'tax_household'
  | 'federal_grant'
  | 'opex'
  | 'capex'
  | 'interest'
  | 'borrowing'
  | 'principal'
  | 'swf_contribution'
  | 'swf_transfer_in'
  | 'emergency';

export interface GovMonthFlows {
  taxCorporate: number;
  taxProperty: number;
  taxConsumption: number;
  taxHousehold: number;
  federalGrant: number;
  importTariff: number;
  exportSupport: number;
  opex: number;
  capex: number;
  interest: number;
  borrowing: number;
  principal: number;
  swfContribution: number;
  swfTransferIn: number;
  emergency: number;
}

export interface GovernmentState {
  ledger: { kind: keyof GovMonthFlows; amountMinor: number; balanceMinor: number }[];
  treasury: number; // sen
  debt: number; // sen
  avgDebtRate: number;
  accruedInterest: number; // MYR
  unpaidObligations: number; // MYR
  daysInArrears: number;
  policies: Policies;
  pending: PendingPolicy[];
  projects: ProjectState[];
  nextId: number;
  /** Month-to-date flows, MYR. Reset at month close. */
  mtd: GovMonthFlows;
  /** Corporate tax accrued but not yet collected (collected at month close). */
  accruedCorporateTax: number;
  publicAssets: number; // MYR, depreciated capitalised projects
  bondYield: number;
  creditRating: number; // 0..10 (10 = AAA)
  marketAccess: boolean;
  serviceQuality: number; // 0..1
  insolvent: boolean;
  /** Cumulative effects of completed projects. */
  resilience: number;
  tourismBoost: number;
  housingFactor: number;
  serviceBoost: number;
  mtdArrearsDays: number;
  pendingEmergency: number; // MYR of event damage to be paid as emergency outlays
}

// ---------------------------------------------------------------- economy
export interface SectorState {
  id: SectorId;
  capacity: number; // real gross output capacity, MYR/day at base prices
  output: number; // real gross output, MYR/day (last day)
  price: number; // index, 1 = base
  employment: number;
  productivity: number; // multiplier, 1 = base
  capital: number; // MYR nominal
  pipeline: number[]; // capacity additions maturing over coming months (real MYR/day)
  investmentMonthly: number; // MYR, current monthly plan
  infraBoost: number; // cumulative productivity uplift from completed public projects
  retained: number; // MYR, last month's retained after-tax profit (internal funds)
  avgUtil: number; // smoothed utilisation
  mtd: { output: number; nominalOutput: number; va: number; realVa: number; wages: number; profit: number; taxableProfit: number; demand: number };
  utilization: number;
  demandCapped: number; // demand servable by capital capacity, real MYR/day
  lastMonthProfit: number;
}

export interface HouseholdState {
  population: number;
  laborForce: number;
  employed: number;
  wageIndex: number;
  savings: number; // MYR
  loans: number; // MYR (mirror of bank household loans)
  mpc: number;
  permanentIncome: number; // smoothed daily disposable income, MYR
  confidence: number; // 0..1
  expectedInflation: number;
  rentIndex: number;
  lastMonthDisposable: number;
  lastMonthReal: number;
  otherIncomeMonthly: number; // distributed profits/rents, MYR per month
  newCreditMonthly: number; // household credit granted for the current month, MYR
  mtd: { wages: number; transfers: number; other: number; tax: number; debtService: number; disposable: number; consumption: number; rent: number };
}

export interface BankState {
  reserves: number;
  loansH: number;
  loansF: number;
  deposits: number;
  capital: number;
  lendingRate: number;
  depositRate: number;
  nplRate: number; // monthly default rate
  willingness: number; // 0..1
  mtdNewLoans: number;
  mtdInterestH: number;
  mtdAmortH: number;
  firmCreditRatio: number; // share of firm credit demand met last month
  mtdDefaults: number;
  lastProfit: number;
}

export interface ExternalState {
  myDemand: number; // rest-of-Malaysia demand index (1 = base level)
  globalDemand: number;
  usDemand: number;
  techCycle: number;
  oil: number; // index, 1 = US$75/bbl
  tourism: number;
  opr: number;
  fedRate: number;
  mgs10: number;
  ust10: number;
  myrPerUsd: number;
  riskAppetite: number; // 0..1
  myInflation: number;
  usPrice: number; // US price level index
  drivers: Record<GlobalDriver, number>;
  /** Hidden mean-reverting cycle states (log deviations) behind the observable indices. */
  cycles: Record<string, number>;
  daysElapsed: number;
}

export interface ActiveEvent {
  id: number;
  templateId: string;
  title: string;
  startDay: number;
  endDay: number;
  ticker?: TickerId;
  magnitude: number;
}

export interface NewsItem {
  id: number;
  atMin: number;
  kind: 'event' | 'policy' | 'market' | 'report' | 'fund' | 'system';
  tone: 'good' | 'bad' | 'neutral';
  title: string;
  body?: string;
}

export interface Indicators {
  nominalGdpAnnual: number; // last closed month × 12
  realGdpAnnual: number;
  realGrowthYoY: number;
  cpi: number;
  inflationYoY: number;
  inflationMoM: number;
  unemployment: number;
  approval: number; // 0..100
  satisfaction: { employment: number; income: number; affordability: number; services: number; trust: number; stability: number };
  debtToGdp: number;
  deficitToGdp: number;
  publicNetWorth: number; // MYR
  gini: number;
  score: ScoreBreakdown;
}

export interface ScoreBreakdown {
  growth: number;
  wealth: number;
  satisfaction: number;
  stability: number;
  total: number;
  caps: string[];
}

export interface MonthlyReport {
  monthKey: number;
  label: string;
  nominalGdp: number;
  realGdp: number;
  gdpBySector: Record<SectorId, number>;
  cpi: number;
  inflationYoY: number;
  unemployment: number;
  employment: number;
  wageIndex: number;
  realDisposablePerCapita: number;
  gov: GovMonthFlows;
  treasury: number; // MYR
  debt: number; // MYR
  bondYield: number;
  fundNav: number; // MYR
  fundNetFlows: number; // cumulative treasury→fund injections minus withdrawals, MYR
  fundReturnMoM: number; // excludes transfers
  approval: number;
  investment: number;
  newLoans: number;
  npl: number;
  myrPerUsd: number;
  indexMY: number;
  indexUS: number;
  events: string[];
  policies: string[];
  notes: string[];
  reconciliation?: { openingTreasuryMinor: number; closingTreasuryMinor: number; netCashMinor: number; cashResidualMinor: number; openingDebtMinor: number; closingDebtMinor: number; debtResidualMinor: number };
  score: ScoreBreakdown;
}

export interface DailyPoint {
  t: number; // KL day
  treasury: number; // MYR
  nav: number; // MYR
  debt: number;
  cpi: number;
  unemployment: number;
  approval: number;
  fx: number;
  gdpRunRate: number; // annualised nominal GDP from today's VA
}

export interface PlayerAction {
  atMin: number;
  type: string;
  payload: unknown;
}

export interface GameState {
  controls: {
    lastTaxReliefMYR: number;
    incentives: { sector: SectorId; cut: number; startMin: number; endMin: number }[];
    plans: { category: BudgetCategory; monthly: number; growth: number; remaining: number; nextMonth: number }[];
    outcomes: { health: number; services: number; safety: number };
    debt: { newTermMonths: number; averageMonths: number; refinance: number };
    fxBand: { enabled: boolean; lower: number; upper: number; dailyUSD: number; reserveFloorUSD: number; status: string };
  };
  schemaVersion: number;
  campaignId: string;
  seed: number;
  scenario: ScenarioId;
  clock: ClockState;
  scheduler: SchedulerState;
  rng: RngState;
  companies: Record<TickerId, CompanyState>;
  market: MarketState;
  fund: FundState;
  government: GovernmentState;
  sectors: Record<SectorId, SectorState>;
  households: HouseholdState;
  bank: BankState;
  external: ExternalState;
  trade: TradeState;
  centralBank: CentralBankState;
  events: { active: ActiveEvent[]; nextId: number; log: ActiveEvent[] };
  indicators: Indicators;
  baseline: BaselineSnapshot;
  news: NewsItem[];
  nextNewsId: number;
  daily: DailyPoint[];
  reports: MonthlyReport[];
  actions: PlayerAction[];
  /** Policy history for reports (bounded). */
  policyLog: { atMin: number; effectiveMin: number; label: string }[];
  /** Trust shocks from recent policy changes; decays monthly. */
  policyChurn: number;
}

export interface TradePolicy { tariff: number; exportBudgetMonthly: number }
export interface TradeState {
  trackingStartDay: number;
  policy: TradePolicy;
  readiness: number;
  mtdExports: number;
  mtdImports: number;
  history: { monthKey: number; exports: number; imports: number; tariff: number; support: number }[];
}
export interface CentralBankState {
  usdReserves: number; // US cents; usable FX component only, excludes gold/SDRs/IMF
  myrCash: number; // sen; segregated, cannot be transferred to treasury or SWF
  openingEquityMYR: number;
  pressure: number; // log FX effect, decays daily
  dailyUsdUsed: number;
  lastInterventionDay: number;
  tx: { atMin: number; side: 'buyUSD' | 'sellUSD'; usdMinor: number; myrMinor: number; rate: number }[];
}
export interface BaselineSnapshot {
  profile: 'malaysia' | 'legacy-kl';
  openingTreasury: number;
  openingDebt: number;
  realGdpAnnual: number;
  nominalGdpAnnual: number;
  publicNetWorth: number;
  employment: number;
  realDisposablePerCapita: number;
  rentBurden: number;
}

export type ScenarioId = 'balanced' | 'recession';
