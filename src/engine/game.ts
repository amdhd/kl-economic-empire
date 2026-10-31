import { takeoverOffers } from './takeovers';
import { rescueOffers } from './rescues';
import { enterpriseOffers } from './private-enterprises';
import { supplyOffers } from './supply-contracts';
import { concessionOffers } from './concessions';
import { syncInvestmentDeals } from './investment-deals';
import type { Deal } from '../types/deals';
import { initialDeals, addDeal, dealCommand, offerDeal } from './deals';
import { exportOffers } from './export-contracts';
import { initialTradeBook, setProgramme, tradeDealCommand, type TradeDealAction } from './trade-book';
import type { ProgrammeId } from '../data/trade';
import { CAMPAIGN_LENGTHS, type CampaignMonths } from '../data/boom';
// Game construction, typed player commands, and the real-time driver.
import { initialControls, controlCommand } from './policy-controls';
import { COMPANIES } from '../data/companies';
import { BASE_TAX, BASELINE, LEGACY_BASELINE, LEGACY_BUDGET, LEGACY_TREND, NATIONAL_TREND, BUDGET_LABELS, SECTOR_IDS, SECTORS, TAX_LABELS } from '../data/economic-baseline';
import { BASE_BUDGET as nationalBudget } from '../data/economic-baseline';
import { initialCentralBank, interveneFx } from './trade-fx';
import { setMonetaryPolicy, tradeBills, tradeBonds } from './central-bank';
import { DEVELOPMENT_ANNUAL0, RESOURCE_VA0 } from '../data/world';
import { exitEscape, initialFiscal, invokeEscape, setFiscalRule } from './fiscal-rules';
import { initialSoe, khazanahTrade, setKhazanahPayout, setPetronasPolicy, soeEquity, soeSpecialDividend } from './soe';
import { initialWorld, seedWorldHistory, startNegotiation, validateCommodityPolicy } from './world';
import { initialPolicy, setLever } from './policy';
import { decidePledge, initialFdi, openingPledge } from './fdi';
import { outputGap } from './scheduler';
import { PROJECT_BY_ID } from '../data/projects';
import type {
  BorrowingPolicy, BudgetCategory, BudgetPolicy, Currency, GameSpeed, GameState, LeverId, ScenarioId, SectorState, TaxPolicy, TickerId,
} from '../types/game';
import { BASE_MPC, CAL, LEGACY_CAL } from './calibration';
import type { CommodityPolicy, FiscalRule, PartnerId, PendingPolicy } from '../types/game';
import { PARTNERS } from '../data/world';
const PARTNER_NAMES = Object.fromEntries(Object.entries(PARTNERS).map(([k, v]) => [k, v.name])) as Record<PartnerId, string>;
import { accumulate } from './clock';
import { initialCompany } from './companies';
import { computeCpi } from './economy';
import { initialExternal } from './external';
import { startEvent } from './events';
import { BASE_NPL } from './banks';
import { emptyFlows, issueDebt, repayDebt, treasuryMYR } from './government';
import { computeScore, publicNetWorth } from './indicators';
import { runHourTick } from './scheduler';
import { cancelOrder, convertFx, executeRebalance, injectFund, navMYR, placeOrder, withdrawFund } from './sovereign-fund';
import { initialMarket, seedHistory } from './stock-market';
import { seedRng } from './rng';
import { klDay, klParts, klToEpochMin, monthKey } from './time';
import { clamp, news, pushBounded, toMinor } from './util';

export const SCHEMA_VERSION = 14;
export const START = { year: 2027, month: 1, day: 1, hour: 8 };
export const CAMPAIGN_MONTHS = 24;

export interface GameOptions { months?: CampaignMonths; boom?: boolean }

export function createGame(seed = 20270101, scenario: ScenarioId = 'balanced', profile: 'malaysia' | 'legacy-kl' = 'malaysia', options: GameOptions = {}): GameState {
  const base = profile === 'legacy-kl' ? LEGACY_BASELINE : BASELINE;
  const cal = profile === 'legacy-kl' ? LEGACY_CAL : CAL;
  const months = CAMPAIGN_LENGTHS.includes(options.months ?? 24) ? options.months ?? 24 : 24;
  return createWithProfile(seed, scenario, profile, base, cal, { months, boom: profile === 'malaysia' && !!options.boom });
}

function createWithProfile(seed: number, scenario: ScenarioId, profile: 'malaysia' | 'legacy-kl', BASELINE: typeof LEGACY_BASELINE, CAL: typeof LEGACY_CAL, mode: GameState['mode']): GameState {
  const BASE_LEND_RATE = BASELINE.opr + 0.02;
  const BASE_BUDGET = profile === 'legacy-kl' ? LEGACY_BUDGET : nationalBudget;
  const startMin = klToEpochMin(START.year, START.month, START.day, START.hour);
  const endMin = klToEpochMin(START.year + mode.months / 12, START.month, START.day, START.hour);
  const startDay = klDay(startMin);
  const mk = monthKey(START.year, START.month);
  const trend = profile === 'legacy-kl' ? LEGACY_TREND : NATIONAL_TREND;

  const sectors = {} as Record<string, SectorState>;
  for (const j of SECTOR_IDS) {
    const inv = (CAL.K0[j] * (BASELINE.depreciation + trend.capitalGrowth)) / 12;
    sectors[j] = {
      id: j,
      capacity: CAL.cap0[j],
      output: CAL.Y0[j],
      price: 1,
      employment: CAL.L0[j],
      productivity: 1,
      capital: CAL.K0[j],
      pipeline: Array.from({ length: 6 }, () => inv / CAL.capitalPerCap[j]),
      investmentMonthly: inv,
      infraBoost: 0,
      retained: 0,
      avgUtil: 0.85,
      utilization: 0.85,
      demandCapped: CAL.Y0[j],
      lastMonthProfit: CAL.profit0[j] * 30.4,
      mtd: { output: 0, nominalOutput: 0, va: 0, realVa: 0, wages: 0, profit: 0, taxableProfit: 0, demand: 0 },
    };
  }
  const employed = SECTOR_IDS.reduce((a, j) => a + CAL.L0[j], 0);
  const loans = BASELINE.householdLoans + BASELINE.firmLoans;
  const capital = loans * BASELINE.bankCapitalRatio;
  // Model 2: oil & gas and palm oil value added sit outside the seven calibrated sectors.
  const gdpAnnual = CAL.gdpDaily * 365 + (profile === 'malaysia' ? RESOURCE_VA0 : 0);

  const s = {
    // Model 3 inherits a neutral medium-term budget path (D-055): each operating appropriation is indexed at
    // `budgetEscalation` a year, applied in monthly steps for five years. These are ordinary ministry plans,
    // so the player sees them and can replace or cancel any of them.
    controls: { ...initialControls(), plans: trend.budgetEscalation > 0 ? (Object.keys(BASE_BUDGET) as BudgetCategory[]).map(category => {
      const growth = Math.pow(1 + trend.budgetEscalation, 1 / 12) - 1;
      return { category, monthly: BASE_BUDGET[category] * (1 + growth), growth, remaining: 60, nextMonth: mk + 1, everyMonths: 1 as const };
    }) : [] },
    deals: initialDeals(seed, profile === 'malaysia', startDay),
    schemaVersion: SCHEMA_VERSION,
    mode,
    campaignId: `kl-${seed}-${scenario}${mode.boom ? '-boom' : ''}${mode.months !== 24 ? `-${mode.months}m` : ''}`,
    seed,
    scenario,
    clock: { hour: startMin / 60, subHourMs: 0, speed: 1 as GameSpeed, paused: true, startHour: startMin / 60, endHour: endMin / 60 },
    scheduler: { lastDay: startDay, lastMonthKey: mk, lastWeekDay: startDay, campaignEnded: false, ticks: 0, mtdGdpNominal: 0, mtdGdpReal: 0, mtdDays: 0, startNav: 0 },
    rng: seedRng(seed),
    companies: {},
    market: undefined as unknown as GameState['market'],
    fund: {
      myrCash: toMinor(BASELINE.fundMYR), usdCash: toMinor(BASELINE.fundUSD), positions: {}, orders: [], tx: [], nextId: 1,
      dividendTransferPct: 0, pendingDividendTransfer: 0, totalInjectedMYR: 0, totalWithdrawnMYR: 0, realized: { MYR: 0, USD: 0 }, realizedMYR: 0, dividends: { MYR: 0, USD: 0 }, feesPaidMYR: 0, navHistory: [],
    },
    government: {
      ledger: [], treasury: toMinor(BASELINE.treasury), debt: toMinor(BASELINE.debt), avgDebtRate: BASELINE.debtRate, accruedInterest: 0,
      unpaidObligations: 0, daysInArrears: 0,
      policies: { tax: { ...BASE_TAX, household: profile === 'malaysia' ? 0 : BASE_TAX.household }, budget: { ...BASE_BUDGET }, borrowing: { cashBufferMonths: 1, maxDebtToGdp: profile === 'malaysia' ? 0.8 : 0.45 } },
      pending: [], projects: [], nextId: 1, mtd: emptyFlows(), accruedCorporateTax: 0, publicAssets: BASELINE.publicAssets,
      bondYield: BASELINE.mgs10 + 0.004, creditRating: 9, marketAccess: true, serviceQuality: BASELINE.serviceQuality, insolvent: false,
      resilience: 0, tourismBoost: 0, housingFactor: 1, serviceBoost: 0, mtdArrearsDays: 0, pendingEmergency: 0,
    },
    sectors,
    households: {
      population: BASELINE.population, laborForce: BASELINE.laborForce, employed, wageIndex: 1, savings: BASELINE.householdSavings,
      loans: BASELINE.householdLoans, mpc: BASE_MPC, permanentIncome: CAL.hh.disposable, confidence: 0.6, expectedInflation: 0.02, rentIndex: 1,
      lastMonthDisposable: CAL.hh.disposable * 30.4, lastMonthReal: CAL.hh.disposable * 30.4,
      otherIncomeMonthly: (CAL.hh.other * 365) / 12, newCreditMonthly: (CAL.hh.credit * 365) / 12, equityIndex: 1,
      mtd: { wages: 0, transfers: 0, other: 0, tax: 0, debtService: 0, disposable: 0, consumption: 0, rent: 0 },
    },
    bank: {
      reserves: BASELINE.bankReserves, loansH: BASELINE.householdLoans, loansF: BASELINE.firmLoans,
      deposits: BASELINE.bankReserves + loans - capital, capital, lendingRate: BASE_LEND_RATE, depositRate: BASELINE.opr - 0.01,
      nplRate: BASE_NPL, willingness: 0.9, mtdNewLoans: 0, mtdInterestH: 0, mtdAmortH: 0, firmCreditRatio: 1, mtdDefaults: 0, lastProfit: 0,
    },
    external: initialExternal(BASELINE),
    trade: { trackingStartDay: startDay, policy: { tariff: 0, exportBudgetMonthly: 0 }, readiness: 0, mtdExports: 0, mtdImports: 0, history: [] },
    world: initialWorld(seed, profile === 'malaysia'),
    soe: initialSoe(profile === 'malaysia'),
    // Opening deficit for the glide path: official 2027 revenue vs operating + development spending.
    policy: initialPolicy(profile === 'malaysia'),
    fdi: initialFdi(seed, profile === 'malaysia'),
    fiscal: initialFiscal(profile === 'malaysia' ? DEVELOPMENT_ANNUAL0 : 0, profile === 'malaysia' ? (376_840_000_000 + DEVELOPMENT_ANNUAL0 - 380_816_996_000) / gdpAnnual : 0),
    centralBank: { ...initialCentralBank(profile, BASELINE.myrPerUsd), targetOpr: BASELINE.opr },
    events: { active: [], nextId: 1, log: [] },
    indicators: {
      nominalGdpAnnual: gdpAnnual, realGdpAnnual: gdpAnnual, realGrowthYoY: 0, cpi: 100, inflationYoY: 0.02, inflationMoM: 0,
      unemployment: 1 - employed / BASELINE.laborForce, approval: BASELINE.approval,
      satisfaction: { employment: 80, income: 62, affordability: 66, services: 62, trust: 70, stability: 85 },
      debtToGdp: BASELINE.debt / gdpAnnual, deficitToGdp: 0, publicNetWorth: 0, gini: 0.4,
      score: { growth: 50, wealth: 50, satisfaction: 62, stability: 80, total: 0, caps: [] },
    },
    baseline: {
      profile, model: 3, pit: profile === 'malaysia', nonTax: profile === 'malaysia', openingTreasury: BASELINE.treasury, openingDebt: BASELINE.debt,
      realGdpAnnual: gdpAnnual, nominalGdpAnnual: gdpAnnual, publicNetWorth: 0, employment: employed,
      realDisposablePerCapita: (CAL.hh.disposable * 365) / BASELINE.population,
      rentBurden: (CAL.hh.consumption * SECTORS.prop.consumption) / CAL.hh.disposable,
    },
    news: [], nextNewsId: 1, daily: [], reports: [], actions: [], policyLog: [], policyChurn: 0,
  } as unknown as GameState;

  for (const c of COMPANIES) s.companies[c.id] = initialCompany(c, mk, BASE_TAX.corporate, profile);
  s.market = initialMarket(s);
  seedHistory(s, startDay);
  s.indicators.cpi = computeCpi(s);
  s.tradeBook = initialTradeBook(s, s.fdi.enabled && s.world.enabled);
  s.scheduler.startNav = navMYR(s);
  s.soe.openingEquity = soeEquity(s);
  if (s.world.enabled) seedWorldHistory(s.world, seed, startDay);
  s.baseline.publicNetWorth = publicNetWorth(s);
  s.indicators.publicNetWorth = s.baseline.publicNetWorth;
  s.indicators.score = computeScore(s);

  if (s.deals.enabled) addDeal(s, 'advisory', 'diligence', 'Independent investment due diligence', 'treasury', 250_000);
  if (scenario === 'recession') {
    for (const id of ['global_slowdown', 'credit_crunch']) {
      startEvent(s, id, startDay, 180, 1.3);
    }
    s.external.cycles.global = -0.03;
    s.external.cycles.us = -0.03;
    s.external.cycles.risk = -0.15;
  }
  openingPledge(s, startDay);
  syncInvestmentDeals(s);
  concessionOffers(s);
  supplyOffers(s);
  enterpriseOffers(s);
  rescueOffers(s);
  takeoverOffers(s);
  exportOffers(s);
  if (scenario === 'export-slump') startEvent(s, 'global_slowdown', startDay, 180, 1);
  if (scenario === 'energy-shock') startEvent(s, 'oil_spike', startDay, 90, 1);
  if (s.controls.plans.length) news(s, { kind: 'policy', tone: 'neutral', title: 'Inherited budget path', body: `Operating appropriations are indexed at ${(trend.budgetEscalation * 100).toFixed(0)}% a year, in monthly steps, roughly in line with trend nominal GDP. Development spending stays at its 2027 level. Review or cancel each ministry plan under Economic controls.` });
  news(s, { kind: 'system', tone: 'neutral', title: 'Welcome, President', body: 'A fictional Malaysian presidency governs the national economy from the KL map. New campaigns use dated official starting figures; subsequent outcomes are simulations. All companies’ prices and financials are fictional simulations. Press Space to start the clock.' });
  return s;
}

// ------------------------------------------------------------------ commands
export type Command =
  | { type: 'enableDeals' }
  | { type: 'dealOffer'; id: number; terms: Partial<Deal['terms']> }
  | { type: 'deal'; id: number; action: 'review' | 'sign' | 'reject' | 'cancel' | 'collect' | 'followOn' | 'dilute' | 'exit' | 'liquidate' | 'dividend' }
  | { type: 'sectorIncentive'; sector: import('../types/game').SectorId; cut: number; months: number }
  | { type: 'ministryPlan'; category: BudgetCategory; monthly: number; growth: number; years: number }
  | { type: 'cancelMinistryPlan'; category: BudgetCategory }
  | { type: 'debtStrategy'; termMonths: number; refinance: number }
  | { type: 'fxBand'; enabled: boolean; lower: number; upper: number; dailyUSD: number; reserveFloorUSD: number }

  | { type: 'queueTrade'; tariff: number; exportBudgetMonthly: number }
  | { type: 'queueCommodity'; patch: Partial<CommodityPolicy> }
  | { type: 'setDevelopment'; annual: number }
  | { type: 'setFiscalRule'; patch: Partial<FiscalRule> }
  | { type: 'fiscalEscape'; invoke: boolean }
  | { type: 'partnerTariff'; partner: PartnerId; tariff: number }
  | { type: 'negotiateAgreement'; partner: PartnerId }
  | { type: 'petronasPolicy'; dividendAnnual: number; capexAnnual: number }
  | { type: 'soeSpecialDividend'; entity: 'petronas' | 'khazanah'; amount: number }
  | { type: 'khazanahPayout'; payout: number }
  | { type: 'khazanahTrade'; ticker: TickerId; side: 'buy' | 'sell'; fraction: number }
  | { type: 'interveneFx'; side: 'buyUSD' | 'sellUSD'; usdMinor: number }
  | { type: 'cbPolicy'; mode?: 'auto' | 'manual'; targetOpr?: number; srr?: number; remitShare?: number }
  | { type: 'cbBonds'; amountMYR: number }
  | { type: 'cbBills'; amountMYR: number }
  | { type: 'queueTax'; patch: Partial<TaxPolicy> }
  | { type: 'queueBudget'; patch: Partial<BudgetPolicy> }
  | { type: 'setBorrowing'; patch: Partial<BorrowingPolicy> }
  | { type: 'cancelPolicy'; id: number }
  | { type: 'startProject'; templateId: string }
  | { type: 'cancelProject'; id: number }
  | { type: 'issueBonds'; amount: number }
  | { type: 'repayDebt'; amount: number }
  | { type: 'fundInject'; amount: number }
  | { type: 'fundWithdraw'; amount: number }
  | { type: 'setDividendTransfer'; pct: number }
  | { type: 'placeOrder'; ticker: TickerId; side: 'buy' | 'sell'; units: number }
  | { type: 'cancelOrder'; id: number }
  | { type: 'fx'; from: Currency; amountMinor: number }
  | { type: 'setLever'; lever: LeverId; value: number }
  | { type: 'decidePledge'; id: number; approve: boolean; incentive: number }
  | { type: 'rebalance'; targetMY: number; targetUS: number }
  | { type: 'exportProgramme'; programme: ProgrammeId; budgetAnnual: number }
  | ({ type: 'tradeDeal' } & TradeDealAction);

export interface CommandResult {
  ok: boolean;
  message: string;
}

/** Commands act at the current game minute (`atMin`); the minute is recorded for replay. */
export function applyCommand(s: GameState, cmd: Command, atMin: number): CommandResult {
  if (s.scheduler.campaignEnded) return { ok: false, message: 'The campaign has ended.' };
  const res = dispatch(s, cmd, atMin);
  if (res.ok) pushBounded(s.actions, { atMin, type: cmd.type, payload: cmd }, 5000);
  return res;
}

/** Policy decisions take effect at the start of the next KL day (D-072). */
function tomorrowStart(atMin: number): number {
  const p = klParts(atMin);
  return klToEpochMin(p.year, p.month, p.day) + 1440;
}

function dispatch(s: GameState, cmd: Command, atMin: number): CommandResult {
  const gov = s.government;
  switch (cmd.type) {
    case 'enableDeals': { if(s.deals.enabled||!s.fdi.enabled)return {ok:false,message:'Deals are already enabled or this save uses an earlier economic model.'}; s.deals.enabled=true;s.deals.startDay=s.scheduler.lastDay;s.deals.lastOfferDay=s.scheduler.lastDay;addDeal(s,'advisory','diligence','Independent investment due diligence','treasury',250_000);syncInvestmentDeals(s);concessionOffers(s);supplyOffers(s);enterpriseOffers(s);rescueOffers(s);takeoverOffers(s);exportOffers(s);return {ok:true,message:'Deal Room enabled prospectively. Existing contracts keep their original terms.'}; }
    case 'dealOffer': { const err=offerDeal(s,cmd.id,cmd.terms); return {ok:!err,message:err??'Counterparty response received.'}; }
    case 'deal': { const err = dealCommand(s, cmd.id, cmd.action); return { ok: !err, message: err ?? 'Deal updated.' }; }
    case 'sectorIncentive': case 'ministryPlan': case 'cancelMinistryPlan': case 'debtStrategy': case 'fxBand': return controlCommand(s, cmd, atMin);
    case 'interveneFx': return interveneFx(s, cmd.side, cmd.usdMinor, atMin);
    case 'exportProgramme': {
      const err = setProgramme(s, cmd.programme, cmd.budgetAnnual);
      if (err) return { ok: false, message: err };
      logPolicy(s, atMin, tomorrowStart(atMin), `Export programme: ${cmd.programme} RM${(cmd.budgetAnnual / 1e9).toFixed(2)}bn a year`);
      return { ok: true, message: 'Programme budget set; spending and promotion start tomorrow and build over about five months.' };
    }
    case 'tradeDeal': {
      const err = tradeDealCommand(s, cmd);
      if (err) return { ok: false, message: err };
      if (cmd.action !== 'offer') logPolicy(s, atMin, atMin, `Trade deal ${cmd.action}${cmd.action === 'propose' ? `: ${cmd.product} with ${PARTNER_NAMES[cmd.partner]}` : ` #${cmd.id}`}`);
      return { ok: true, message: cmd.action === 'propose' ? 'Draft opened. The partner has named its price.' : cmd.action === 'offer' ? 'Partner response received.' : cmd.action === 'sign' ? 'Formal talks opened.' : 'Deal withdrawn.' };
    }
    case 'cbPolicy': case 'cbBonds': case 'cbBills': {
      const err = cmd.type === 'cbPolicy' ? setMonetaryPolicy(s, cmd, atMin) : cmd.type === 'cbBonds' ? tradeBonds(s, cmd.amountMYR, atMin) : tradeBills(s, cmd.amountMYR, atMin);
      return err ? { ok: false, message: err } : { ok: true, message: 'Central-bank decision recorded.' };
    }
    case 'queueCommodity': {
      if (!s.world.enabled) return { ok: false, message: 'Commodity policy is available in new Malaysia campaigns.' };
      const err = validateCommodityPolicy(cmd.patch);
      if (err) return { ok: false, message: err };
      const cur = { ...s.world.policy, ...Object.assign({}, ...gov.pending.filter((p) => p.kind === 'commodity').map((p) => p.patch)) } as CommodityPolicy;
      const patch: Partial<CommodityPolicy> = {};
      const parts: string[] = [];
      const fmt: Record<keyof CommodityPolicy, (v: number) => string> = {
        fuelCeiling: (v) => `RON95 ceiling RM${v.toFixed(2)}/L`, fuelEligible: (v) => `ceiling for ${(v * 100).toFixed(0)}% of volume`,
        wheatSubsidy: (v) => `wheat subsidy ${(v * 100).toFixed(0)}% of price rises`, steelSafeguard: (v) => `steel safeguard ${(v * 100).toFixed(1)}%`,
        palmExportDuty: (v) => `palm export duty ${(v * 100).toFixed(1)}%`,
      };
      for (const [k, raw] of Object.entries(cmd.patch) as [keyof CommodityPolicy, number][]) {
        const v = k === 'fuelCeiling' ? Math.round(raw * 100) / 100 : Math.round(raw * 1000) / 1000;
        if (Math.abs(v - cur[k]) < 1e-9) continue;
        patch[k] = v;
        parts.push(fmt[k](v));
      }
      if (!parts.length) return { ok: false, message: 'No change to queue.' };
      // Subsidy cuts are politically costly, as in every country that has tried them.
      if (patch.fuelCeiling !== undefined && patch.fuelCeiling > cur.fuelCeiling) s.policyChurn += ((patch.fuelCeiling - cur.fuelCeiling) / cur.fuelCeiling) * 25;
      if (patch.fuelEligible !== undefined && patch.fuelEligible < cur.fuelEligible) s.policyChurn += (cur.fuelEligible - patch.fuelEligible) * 12;
      return queue(s, 'commodity', patch, `Commodities: ${parts.join('; ')}`, tomorrowStart(atMin), atMin);
    }
    case 'setDevelopment': {
      if (!s.world.enabled) return { ok: false, message: 'The development budget is modelled in new Malaysia campaigns.' };
      if (!Number.isFinite(cmd.annual) || cmd.annual < 0 || cmd.annual > 200e9) return { ok: false, message: 'Development spending must be RM0–200bn a year.' };
      const annual = Math.round(cmd.annual / 1e8) * 1e8;
      const pendingDev = gov.pending.filter((p) => p.kind === 'development').at(-1)?.patch as { annual: number } | undefined;
      if (annual === (pendingDev?.annual ?? s.fiscal.developmentAnnual)) return { ok: false, message: 'No change to queue.' };
      return queue(s, 'development', { annual }, `Development expenditure RM${(annual / 1e9).toFixed(1)}bn a year`, tomorrowStart(atMin), atMin);
    }
    case 'setFiscalRule': {
      if (!s.world.enabled) return { ok: false, message: 'Fiscal rules apply to new Malaysia campaigns.' };
      const r = setFiscalRule(s, cmd.patch);
      if (r.ok) logPolicy(s, atMin, atMin, `Fiscal rule: deficit ≤ ${(s.fiscal.rule.deficitCap * 100).toFixed(1)}% of GDP, debt ≤ ${(s.fiscal.rule.debtCap * 100).toFixed(0)}%, golden rule ${s.fiscal.rule.goldenRule ? 'on' : 'off'}`);
      return r;
    }
    case 'fiscalEscape': {
      if (!s.world.enabled) return { ok: false, message: 'Fiscal rules apply to new Malaysia campaigns.' };
      const r = cmd.invoke ? invokeEscape(s, outputGap(s)) : exitEscape(s);
      if (r.ok) logPolicy(s, atMin, atMin, cmd.invoke ? 'Fiscal escape clause invoked' : 'Fiscal escape clause ended');
      return r;
    }
    case 'partnerTariff': {
      if (!s.world.enabled) return { ok: false, message: 'Trade partners are available in new Malaysia campaigns.' };
      if (!(cmd.partner in s.world.partners) || !Number.isFinite(cmd.tariff) || cmd.tariff < 0 || cmd.tariff > 0.5) return { ok: false, message: 'Choose a partner and a 0–50% surcharge.' };
      const tariff = Math.round(cmd.tariff * 1000) / 1000;
      const pend = gov.pending.filter((p) => p.kind === 'partner' && (p.patch as { partner: PartnerId }).partner === cmd.partner).at(-1)?.patch as { tariff: number } | undefined;
      if (tariff === (pend?.tariff ?? s.world.partners[cmd.partner].ourTariff)) return { ok: false, message: 'No change to queue.' };
      if (tariff > 0) s.world.partners[cmd.partner].negotiationDoneDay = null;
      return queue(s, 'partner', { partner: cmd.partner, tariff }, `Surcharge on imports from ${PARTNER_NAMES[cmd.partner]}: ${(tariff * 100).toFixed(1)}%`, tomorrowStart(atMin), atMin);
    }
    case 'negotiateAgreement': {
      const r = startNegotiation(s, cmd.partner, atMin);
      if (r.ok) logPolicy(s, atMin, atMin, `Opened trade talks with ${PARTNER_NAMES[cmd.partner]}`);
      return r;
    }
    case 'petronasPolicy': {
      const r = setPetronasPolicy(s, cmd.dividendAnnual, cmd.capexAnnual);
      if (r.ok) logPolicy(s, atMin, atMin, r.message);
      return r;
    }
    case 'soeSpecialDividend': {
      const r = soeSpecialDividend(s, cmd.entity, cmd.amount);
      if (r.ok) logPolicy(s, atMin, atMin, r.message);
      return r;
    }
    case 'khazanahPayout': {
      const r = setKhazanahPayout(s, cmd.payout);
      if (r.ok) logPolicy(s, atMin, atMin, r.message);
      return r;
    }
    case 'khazanahTrade': {
      const r = khazanahTrade(s, cmd.ticker, cmd.side, cmd.fraction, atMin);
      if (r.ok) logPolicy(s, atMin, atMin, r.message);
      return r;
    }
    case 'queueTrade': {
      if (!Number.isFinite(cmd.tariff) || cmd.tariff < 0 || cmd.tariff > 0.2 || !Number.isFinite(cmd.exportBudgetMonthly) || cmd.exportBudgetMonthly < 0 || cmd.exportBudgetMonthly > 2e9) return { ok: false, message: 'Tariff must be 0–20%; export support RM 0–2bn/month.' };
      const patch = { tariff: Math.round(cmd.tariff * 1000) / 1000, exportBudgetMonthly: Math.round(cmd.exportBudgetMonthly / 1e6) * 1e6 };
      const pending = gov.pending.filter(p => p.kind === 'trade').at(-1)?.patch;
      const current = { ...s.trade.policy, ...pending };
      if (patch.tariff === current.tariff && patch.exportBudgetMonthly === current.exportBudgetMonthly) return { ok: false, message: 'No change to queue.' };
      return queue(s, 'trade', patch, `Trade: tariff ${(patch.tariff * 100).toFixed(1)}%, export support RM ${(patch.exportBudgetMonthly / 1e6).toFixed(0)}m/month`, tomorrowStart(atMin), atMin);
    }
    case 'setLever': {
      const err = setLever(s, cmd.lever, cmd.value, atMin);
      return err ? { ok: false, message: err } : { ok: true, message: 'Policy decided. Its phase cycle is shown under Policy decisions.' };
    }
    case 'decidePledge': {
      const err = decidePledge(s, cmd.id, cmd.approve, cmd.incentive);
      const p = s.fdi.pledges.find(x => x.id === cmd.id);
      return err ? { ok: false, message: err } : { ok: true, message: p?.status === 'building' ? 'Investment approved: build-out starts tomorrow.' : p?.status === 'withdrawn' ? 'The investor walked away from that offer.' : 'Pledge declined.' };
    }
    case 'queueTax': {
      const patch: Partial<TaxPolicy> = {};
      const parts: string[] = [];
      for (const [k, v] of Object.entries(cmd.patch) as [keyof TaxPolicy, number][]) {
        const meta = TAX_LABELS[k];
        if (!meta || !Number.isFinite(v)) return { ok: false, message: `Invalid tax ${k}` };
        const val = Math.round(clamp(v, meta.min, meta.max) * 1000) / 1000;
        const cur = pendingValue(s, 'tax', k) ?? gov.policies.tax[k];
        if (Math.abs(val - cur) < 1e-9) continue;
        patch[k] = val;
        parts.push(`${meta.label} ${(cur * 100).toFixed(1)}% → ${(val * 100).toFixed(1)}%`);
        if (val > cur) s.policyChurn += (val - cur) * 100 * 0.8 * (k === 'incomeTax' ? 0.3 : 1);
        else s.policyChurn += 0.5;
      }
      if (!parts.length) return { ok: false, message: 'No change to queue.' };
      return queue(s, 'tax', patch, parts.join('; '), tomorrowStart(atMin), atMin);
    }
    case 'queueBudget': {
      const patch: Partial<BudgetPolicy> = {};
      const parts: string[] = [];
      for (const [k, v] of Object.entries(cmd.patch) as [BudgetCategory, number][]) {
        if (!(k in BUDGET_LABELS) || !Number.isFinite(v) || v < 0 || v > 50e9) return { ok: false, message: `Invalid budget for ${k}` };
        const cur = pendingValue(s, 'budget', k) ?? gov.policies.budget[k];
        const val = Math.round(v / 1e6) * 1e6;
        if (val === cur) continue;
        patch[k] = val;
        parts.push(`${BUDGET_LABELS[k]} RM ${(cur / 1e6).toFixed(0)}m → RM ${(val / 1e6).toFixed(0)}m/month`);
        if (val < cur && (k === 'transfers' || k === 'health' || k === 'services')) s.policyChurn += ((cur - val) / cur) * 10;
      }
      if (!parts.length) return { ok: false, message: 'No change to queue.' };
      // A manual appropriation replaces that ministry's multi-year plan; otherwise the plan's next
      // annual step would silently overwrite the player's decision (docs/decisions.md D-030).
      const replaced = s.controls.plans.filter((pl) => pl.category in patch);
      if (replaced.length) {
        s.controls.plans = s.controls.plans.filter((pl) => !(pl.category in patch));
        parts.push(`replaces ${replaced.map((pl) => BUDGET_LABELS[pl.category]).join(', ')} ministry plan`);
      }
      return queue(s, 'budget', patch, parts.join('; '), tomorrowStart(atMin), atMin);
    }
    case 'setBorrowing': {
      const b = { ...gov.policies.borrowing, ...cmd.patch };
      if (!(b.cashBufferMonths >= 0.25 && b.cashBufferMonths <= 6)) return { ok: false, message: 'Cash buffer must be 0.25–6 months' };
      if (!(b.maxDebtToGdp >= 0.1 && b.maxDebtToGdp <= 0.8)) return { ok: false, message: 'Debt cap must be 10–80% of GDP' };
      gov.policies.borrowing = b;
      logPolicy(s, atMin, atMin, `Borrowing rule: buffer ${b.cashBufferMonths} months, cap ${(b.maxDebtToGdp * 100).toFixed(0)}% of GDP`);
      return { ok: true, message: 'Borrowing rule updated (effective now).' };
    }
    case 'cancelPolicy': {
      const n = gov.pending.length;
      gov.pending = gov.pending.filter((p) => p.id !== cmd.id);
      return n === gov.pending.length ? { ok: false, message: 'Policy not found or already in force.' } : { ok: true, message: 'Proposal withdrawn.' };
    }
    case 'startProject': {
      const t = PROJECT_BY_ID[cmd.templateId];
      if (!t) return { ok: false, message: 'Unknown project' };
      if (gov.projects.some((p) => p.templateId === t.id && p.status !== 'cancelled')) return { ok: false, message: `${t.name} has already been commissioned.` };
      gov.projects.push({ id: gov.nextId++, templateId: t.id, name: t.name, kind: t.kind, cost: t.cost, spent: 0, work: 0, startDay: klDay(atMin), durationDays: t.durationDays, status: 'building' });
      logPolicy(s, atMin, atMin, `Commissioned ${t.name} (RM ${(t.cost / 1e9).toFixed(1)}bn over ${Math.round(t.durationDays / 30)} months)`);
      news(s, { kind: 'policy', tone: 'neutral', title: `Commissioned: ${t.name}`, body: `RM ${(t.cost / 1e9).toFixed(1)}bn disbursed over ~${Math.round(t.durationDays / 30)} months. Benefits begin on completion.` });
      return { ok: true, message: `${t.name} commissioned.` };
    }
    case 'cancelProject': {
      const project=gov.projects.find(x=>x.id===cmd.id);
      if(project?.concessionDealId!==undefined){const err=dealCommand(s,project.concessionDealId,'cancel');return {ok:!err,message:err??'Concession terminated; obligations remain in Deal Room.'};}
      const p = gov.projects.find((x) => x.id === cmd.id);
      if (!p || p.status !== 'building') return { ok: false, message: 'Project not under construction.' };
      p.status = 'cancelled';
      logPolicy(s, atMin, atMin, `Cancelled ${p.name} (RM ${(p.spent / 1e6).toFixed(0)}m sunk)`);
      s.policyChurn += 3;
      return { ok: true, message: `${p.name} cancelled. Spent funds are sunk; no benefits.` };
    }
    case 'issueBonds': {
      if (!Number.isFinite(cmd.amount) || !(cmd.amount > 0)) return { ok: false, message: 'Amount must be positive and finite' };
      const got = issueDebt(s, cmd.amount, 'Discretionary issuance');
      if (got <= 0) return { ok: false, message: gov.marketAccess ? 'Debt cap reached — raise the cap or repay debt first.' : 'No market access.' };
      logPolicy(s, atMin, atMin, `Issued RM ${(got / 1e6).toFixed(0)}m bonds`);
      return { ok: true, message: `Issued RM ${(got / 1e6).toFixed(0)}m of bonds: treasury and debt both up.` };
    }
    case 'repayDebt': {
      if (!Number.isFinite(cmd.amount) || !(cmd.amount > 0)) return { ok: false, message: 'Amount must be positive and finite' };
      if (cmd.amount > treasuryMYR(gov)) return { ok: false, message: 'Treasury cash is insufficient.' };
      const paid = repayDebt(s, cmd.amount);
      logPolicy(s, atMin, atMin, `Repaid RM ${(paid / 1e6).toFixed(0)}m of debt`);
      return { ok: true, message: `Repaid RM ${(paid / 1e6).toFixed(0)}m: treasury and debt both down.` };
    }
    case 'fundInject': {
      const err = injectFund(s, cmd.amount);
      if (err) return { ok: false, message: err };
      logPolicy(s, atMin, atMin, `Injected RM ${(cmd.amount / 1e6).toFixed(0)}m into the SWF`);
      return { ok: true, message: 'Transfer complete: treasury → SWF. Public net worth unchanged.' };
    }
    case 'fundWithdraw': {
      const err = withdrawFund(s, cmd.amount);
      if (err) return { ok: false, message: err };
      logPolicy(s, atMin, atMin, `Withdrew RM ${(cmd.amount / 1e6).toFixed(0)}m from the SWF`);
      return { ok: true, message: 'Transfer complete: SWF → treasury. This is a transfer, not revenue.' };
    }
    case 'setDividendTransfer': {
      if (!(cmd.pct >= 0 && cmd.pct <= 1)) return { ok: false, message: 'Must be 0–100%' };
      s.fund.dividendTransferPct = cmd.pct;
      logPolicy(s, atMin, atMin, `SWF dividend transfer policy: ${(cmd.pct * 100).toFixed(0)}% to treasury monthly`);
      return { ok: true, message: 'Dividend transfer policy updated.' };
    }
    case 'placeOrder': {
      const o = placeOrder(s, cmd.ticker, cmd.side, cmd.units, atMin);
      if (o.status === 'rejected') return { ok: false, message: o.reason ?? 'Rejected' };
      if (o.status === 'filled') return { ok: true, message: `Filled: ${cmd.side} ${cmd.units.toLocaleString()} @ ${o.fillPrice!.toFixed(3)}` };
      return { ok: true, message: 'Market closed — order queued for the next open session (expires in 7 days).' };
    }
    case 'cancelOrder':
      return cancelOrder(s, cmd.id) ? { ok: true, message: 'Order cancelled.' } : { ok: false, message: 'Order is no longer pending.' };
    case 'rebalance': {
      if (!(cmd.targetMY >= 0 && cmd.targetUS >= 0 && cmd.targetMY + cmd.targetUS <= 1)) return { ok: false, message: 'Targets must be ≥ 0 and sum to ≤ 100%' };
      const r = executeRebalance(s, cmd.targetMY, cmd.targetUS, atMin);
      logPolicy(s, atMin, atMin, `SWF rebalance toward MY ${(cmd.targetMY * 100).toFixed(0)}% / US ${(cmd.targetUS * 100).toFixed(0)}% / cash ${((1 - cmd.targetMY - cmd.targetUS) * 100).toFixed(0)}%`);
      if (r.placed === 0) return { ok: r.rejected === 0, message: r.rejected ? `All ${r.rejected} rebalance orders were rejected.` : 'Already at target — no orders needed.' };
      return { ok: true, message: `Rebalance: ${r.placed} orders placed${r.rejected ? `, ${r.rejected} rejected` : ''} (closed markets queue for the next open).` };
    }
    case 'fx': {
      const err = convertFx(s, cmd.from, cmd.amountMinor);
      return err ? { ok: false, message: err } : { ok: true, message: 'FX conversion complete.' };
    }
  }
}

function pendingValue(s: GameState, kind: 'tax' | 'budget', key: string): number | undefined {
  let v: number | undefined;
  for (const p of s.government.pending) if (p.kind === kind && key in p.patch) v = (p.patch as Record<string, number>)[key];
  return v;
}

function queue(s: GameState, kind: PendingPolicy['kind'], patch: object, label: string, effectiveMin: number, atMin: number): CommandResult {
  s.government.pending.push({ id: s.government.nextId++, createdMin: atMin, effectiveMin, kind, patch, label });
  logPolicy(s, atMin, effectiveMin, label);
  const p = klParts(effectiveMin);
  news(s, { kind: 'policy', tone: 'neutral', title: `Queued: ${label}`, body: `Effective ${p.day}/${p.month}/${p.year}.` });
  return { ok: true, message: `Queued — effective ${p.day}/${p.month}/${p.year}.` };
}

function logPolicy(s: GameState, atMin: number, effectiveMin: number, label: string) {
  pushBounded(s.policyLog, { atMin, effectiveMin, label }, 300);
}

// ------------------------------------------------------------------ time drivers
/** Real-time driver used by the UI loop. Returns hourly ticks executed. */
export function advance(s: GameState, deltaRealMs: number): number {
  const hours = accumulate(s.clock, deltaRealMs);
  for (let i = 0; i < hours && !s.scheduler.campaignEnded; i++) runHourTick(s);
  return hours;
}

/**
 * TEST / DEV TOOLING ONLY — runs `hours` hourly ticks without real time. Never wired to player UI.
 * `onHour` runs before each tick (use it to inject scripted commands at exact game times).
 */
export function runHeadless(s: GameState, hours: number, onHour?: (s: GameState) => void): void {
  for (let i = 0; i < hours && !s.scheduler.campaignEnded; i++) {
    onHour?.(s);
    runHourTick(s);
  }
}

export const nowMinute = (s: GameState) => s.clock.hour * 60;
export { treasuryMYR, navMYR, SECTORS };
