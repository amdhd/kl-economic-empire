// Game construction, typed player commands, and the real-time driver.
import { COMPANIES } from '../data/companies';
import { BASE_BUDGET, BASE_TAX, BASELINE, BUDGET_LABELS, SECTOR_IDS, SECTORS, TAX_LABELS } from '../data/economic-baseline';
import { PROJECT_BY_ID } from '../data/projects';
import type {
  BorrowingPolicy, BudgetCategory, BudgetPolicy, Currency, GameSpeed, GameState, ScenarioId, SectorState, TaxPolicy, TickerId,
} from '../types/game';
import { BASE_LEND_RATE, BASE_MPC, CAL, CAPITAL_GROWTH0 } from './calibration';
import { accumulate } from './clock';
import { initialCompany } from './companies';
import { computeCpi } from './economy';
import { initialExternal } from './external';
import { BASE_NPL } from './banks';
import { emptyFlows, issueDebt, repayDebt, treasuryMYR } from './government';
import { computeScore, publicNetWorth } from './indicators';
import { runHourTick } from './scheduler';
import { cancelOrder, convertFx, injectFund, navMYR, placeOrder, withdrawFund } from './sovereign-fund';
import { initialMarket, seedHistory } from './stock-market';
import { seedRng } from './rng';
import { klDay, klParts, klToEpochMin, monthKey } from './time';
import { clamp, news, pushBounded, toMinor } from './util';

export const SCHEMA_VERSION = 1;
export const START = { year: 2027, month: 1, day: 1, hour: 8 };
export const CAMPAIGN_MONTHS = 24;

export function createGame(seed = 20270101, scenario: ScenarioId = 'balanced'): GameState {
  const startMin = klToEpochMin(START.year, START.month, START.day, START.hour);
  const endMin = klToEpochMin(START.year + CAMPAIGN_MONTHS / 12, START.month, START.day, START.hour);
  const startDay = klDay(startMin);
  const mk = monthKey(START.year, START.month);

  const sectors = {} as Record<string, SectorState>;
  for (const j of SECTOR_IDS) {
    const inv = (CAL.K0[j] * (BASELINE.depreciation + CAPITAL_GROWTH0)) / 12;
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
  const gdpAnnual = CAL.gdpDaily * 365;

  const s = {
    schemaVersion: SCHEMA_VERSION,
    campaignId: `kl-${seed}-${scenario}`,
    seed,
    scenario,
    clock: { hour: startMin / 60, subHourMs: 0, speed: 1 as GameSpeed, paused: true, startHour: startMin / 60, endHour: endMin / 60 },
    scheduler: { lastDay: startDay, lastMonthKey: mk, lastWeekDay: startDay, campaignEnded: false, ticks: 0, mtdGdpNominal: 0, mtdGdpReal: 0, mtdDays: 0, startNav: 0 },
    rng: seedRng(seed),
    companies: {},
    market: undefined as unknown as GameState['market'],
    fund: {
      myrCash: toMinor(BASELINE.fundMYR), usdCash: toMinor(BASELINE.fundUSD), positions: {}, orders: [], tx: [], nextId: 1,
      dividendTransferPct: 0, pendingDividendTransfer: 0, totalInjectedMYR: 0, totalWithdrawnMYR: 0, feesPaidMYR: 0, navHistory: [],
    },
    government: {
      treasury: toMinor(BASELINE.treasury), debt: toMinor(BASELINE.debt), avgDebtRate: BASELINE.debtRate, accruedInterest: 0,
      unpaidObligations: 0, daysInArrears: 0,
      policies: { tax: { ...BASE_TAX }, budget: { ...BASE_BUDGET }, borrowing: { cashBufferMonths: 1, maxDebtToGdp: 0.45 } },
      pending: [], projects: [], nextId: 1, mtd: emptyFlows(), accruedCorporateTax: 0, publicAssets: BASELINE.publicAssets,
      bondYield: BASELINE.mgs10 + 0.004, creditRating: 9, marketAccess: true, serviceQuality: 0.62, insolvent: false,
      resilience: 0, tourismBoost: 0, housingFactor: 1, serviceBoost: 0, mtdArrearsDays: 0, pendingEmergency: 0,
    },
    sectors,
    households: {
      population: BASELINE.population, laborForce: BASELINE.laborForce, employed, wageIndex: 1, savings: BASELINE.householdSavings,
      loans: BASELINE.householdLoans, mpc: BASE_MPC, permanentIncome: CAL.hh.disposable, confidence: 0.6, expectedInflation: 0.02, rentIndex: 1,
      lastMonthDisposable: CAL.hh.disposable * 30.4, lastMonthReal: CAL.hh.disposable * 30.4,
      otherIncomeMonthly: (CAL.hh.other * 365) / 12, newCreditMonthly: (CAL.hh.credit * 365) / 12,
      mtd: { wages: 0, transfers: 0, other: 0, tax: 0, debtService: 0, disposable: 0, consumption: 0, rent: 0 },
    },
    bank: {
      reserves: BASELINE.bankReserves, loansH: BASELINE.householdLoans, loansF: BASELINE.firmLoans,
      deposits: BASELINE.bankReserves + loans - capital, capital, lendingRate: BASE_LEND_RATE, depositRate: BASELINE.opr - 0.01,
      nplRate: BASE_NPL, willingness: 0.9, mtdNewLoans: 0, mtdInterestH: 0, mtdAmortH: 0, firmCreditRatio: 1, mtdDefaults: 0, lastProfit: 0,
    },
    external: initialExternal(),
    events: { active: [], nextId: 1, log: [] },
    indicators: {
      nominalGdpAnnual: gdpAnnual, realGdpAnnual: gdpAnnual, realGrowthYoY: 0, cpi: 100, inflationYoY: 0.02, inflationMoM: 0,
      unemployment: 1 - employed / BASELINE.laborForce, approval: 62,
      satisfaction: { employment: 80, income: 62, affordability: 66, services: 62, trust: 70, stability: 85 },
      debtToGdp: BASELINE.debt / gdpAnnual, deficitToGdp: 0, publicNetWorth: 0, gini: 0.4,
      score: { growth: 50, wealth: 50, satisfaction: 62, stability: 80, total: 0, caps: [] },
    },
    baseline: {
      realGdpAnnual: gdpAnnual, nominalGdpAnnual: gdpAnnual, publicNetWorth: 0, employment: employed,
      realDisposablePerCapita: (CAL.hh.disposable * 365) / BASELINE.population,
      rentBurden: (CAL.hh.consumption * SECTORS.prop.consumption) / CAL.hh.disposable,
    },
    news: [], nextNewsId: 1, daily: [], reports: [], actions: [], policyLog: [], policyChurn: 0,
  } as unknown as GameState;

  for (const c of COMPANIES) s.companies[c.id] = initialCompany(c, mk, BASE_TAX.corporate);
  s.market = initialMarket(s);
  seedHistory(s, startDay);
  s.indicators.cpi = computeCpi(s);
  s.scheduler.startNav = navMYR(s);
  s.baseline.publicNetWorth = publicNetWorth(s);
  s.indicators.publicNetWorth = s.baseline.publicNetWorth;
  s.indicators.score = computeScore(s);

  if (scenario === 'recession') {
    for (const id of ['global_slowdown', 'credit_crunch']) {
      s.events.active.push({ id: s.events.nextId++, templateId: id, title: id === 'global_slowdown' ? 'Global recession' : 'Banking credit crunch', startDay, endDay: startDay + 180, magnitude: 1.3 });
    }
    s.external.cycles.global = -0.03;
    s.external.cycles.us = -0.03;
    s.external.cycles.risk = -0.15;
  }
  news(s, { kind: 'system', tone: 'neutral', title: 'Welcome, President', body: 'Alternate-history Kuala Lumpur has broad economic autonomy. All companies’ prices and financials are fictional simulations. Press Space to start the clock.' });
  return s;
}

// ------------------------------------------------------------------ commands
export type Command =
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
  | { type: 'fx'; from: Currency; amountMinor: number };

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

function firstOfNextMonth(atMin: number): number {
  const p = klParts(atMin);
  return p.month === 12 ? klToEpochMin(p.year + 1, 1, 1) : klToEpochMin(p.year, p.month + 1, 1);
}

function dispatch(s: GameState, cmd: Command, atMin: number): CommandResult {
  const gov = s.government;
  switch (cmd.type) {
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
        if (val > cur) s.policyChurn += (val - cur) * 100 * 0.8;
        else s.policyChurn += 0.5;
      }
      if (!parts.length) return { ok: false, message: 'No change to queue.' };
      return queue(s, 'tax', patch, parts.join('; '), firstOfNextMonth(atMin), atMin);
    }
    case 'queueBudget': {
      const patch: Partial<BudgetPolicy> = {};
      const parts: string[] = [];
      for (const [k, v] of Object.entries(cmd.patch) as [BudgetCategory, number][]) {
        if (!(k in BUDGET_LABELS) || !Number.isFinite(v) || v < 0 || v > 5e9) return { ok: false, message: `Invalid budget for ${k}` };
        const cur = pendingValue(s, 'budget', k) ?? gov.policies.budget[k];
        const val = Math.round(v / 1e6) * 1e6;
        if (val === cur) continue;
        patch[k] = val;
        parts.push(`${BUDGET_LABELS[k]} RM ${(cur / 1e6).toFixed(0)}m → RM ${(val / 1e6).toFixed(0)}m/month`);
        if (val < cur && (k === 'transfers' || k === 'health' || k === 'services')) s.policyChurn += ((cur - val) / cur) * 10;
      }
      if (!parts.length) return { ok: false, message: 'No change to queue.' };
      const p = klParts(atMin);
      return queue(s, 'budget', patch, parts.join('; '), klToEpochMin(p.year, p.month, p.day) + 1440, atMin);
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
      gov.projects.push({ id: gov.nextId++, templateId: t.id, name: t.name, kind: t.kind, cost: t.cost, spent: 0, startDay: klDay(atMin), durationDays: t.durationDays, status: 'building' });
      logPolicy(s, atMin, atMin, `Commissioned ${t.name} (RM ${(t.cost / 1e9).toFixed(1)}bn over ${Math.round(t.durationDays / 30)} months)`);
      news(s, { kind: 'policy', tone: 'neutral', title: `Commissioned: ${t.name}`, body: `RM ${(t.cost / 1e9).toFixed(1)}bn disbursed over ~${Math.round(t.durationDays / 30)} months. Benefits begin on completion.` });
      return { ok: true, message: `${t.name} commissioned.` };
    }
    case 'cancelProject': {
      const p = gov.projects.find((x) => x.id === cmd.id);
      if (!p || p.status !== 'building') return { ok: false, message: 'Project not under construction.' };
      p.status = 'cancelled';
      logPolicy(s, atMin, atMin, `Cancelled ${p.name} (RM ${(p.spent / 1e6).toFixed(0)}m sunk)`);
      s.policyChurn += 3;
      return { ok: true, message: `${p.name} cancelled. Spent funds are sunk; no benefits.` };
    }
    case 'issueBonds': {
      if (!(cmd.amount > 0)) return { ok: false, message: 'Amount must be positive' };
      const got = issueDebt(s, cmd.amount, 'Discretionary issuance');
      if (got <= 0) return { ok: false, message: gov.marketAccess ? 'Debt cap reached — raise the cap or repay debt first.' : 'No market access.' };
      logPolicy(s, atMin, atMin, `Issued RM ${(got / 1e6).toFixed(0)}m bonds`);
      return { ok: true, message: `Issued RM ${(got / 1e6).toFixed(0)}m of bonds: treasury and debt both up.` };
    }
    case 'repayDebt': {
      if (!(cmd.amount > 0)) return { ok: false, message: 'Amount must be positive' };
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

function queue(s: GameState, kind: 'tax' | 'budget', patch: object, label: string, effectiveMin: number, atMin: number): CommandResult {
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
