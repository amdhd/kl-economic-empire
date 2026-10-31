// External (rest-of-Malaysia, US, global) economy. Seeded mean-reverting cycles around trends,
// plus event modifiers. KL policy has (almost) no influence here by design.
import { LEGACY_BASELINE, baselineFor, demandFor } from '../data/economic-baseline';
import { BASELINE as nationalBase } from '../data/economic-baseline';
import { EVENT_BY_ID, type EventMods } from '../data/events';
import type { ExternalState, GameState, GlobalDriver } from '../types/game';
import { eventIsActive } from './events';
import { randnClipped } from './rng';
import { capitalControls } from './policy';
import { applyMpcDecision, monetaryEffects } from './central-bank';
import { clamp } from './util';
import { BOOM, boomOn } from '../data/boom';

export const DRIVERS: GlobalDriver[] = ['semis', 'software', 'ads', 'consumer', 'energy', 'finance', 'health', 'industrial', 'auto'];

const CYCLES: Record<string, { sd: number; persist: number }> = {
  my: { sd: 0.0018, persist: 0.985 },
  global: { sd: 0.0018, persist: 0.985 },
  us: { sd: 0.0018, persist: 0.985 },
  tech: { sd: 0.006, persist: 0.985 },
  oil: { sd: 0.012, persist: 0.99 },
  tourism: { sd: 0.004, persist: 0.98 },
  fx: { sd: 0.003, persist: 0.995 },
  risk: { sd: 0.012, persist: 0.97 },
  semis: { sd: 0.006, persist: 0.98 },
  auto: { sd: 0.005, persist: 0.98 },
};

const TREND = { my: 0.042, global: 0.03, us: 0.022, tech: 0.06, tourism: 0.045, usPrice: 0.025 };

/** Simulated demand relative to its trend path (1 = on trend), for the global standing board. */
export function cycleDeviation(s: GameState, which: 'us' | 'global'): number {
  const t = s.external.daysElapsed / 365;
  return which === 'us' ? s.external.usDemand / Math.exp(TREND.us * t) : s.external.globalDemand / Math.exp(TREND.global * t);
}

export interface AggregatedMods {
  oil: number;
  fx: number;
  tech: number;
  tourism: number;
  myDemand: number;
  globalDemand: number;
  usDemand: number;
  risk: number;
  creditWillingness: number;
  creditSpread: number;
  propDemand: number;
  usRate: number;
  capacity: Record<string, number>;
  drivers: Record<string, number>;
}

/** Combine active-event modifiers, ramping each in over its first 7 days. */
export function aggregateMods(s: GameState, today: number): AggregatedMods {
  const m: AggregatedMods = { oil: 1, fx: 1, tech: 1, tourism: 1, myDemand: 1, globalDemand: 1, usDemand: 1, risk: 0, creditWillingness: 1, creditSpread: 0, propDemand: 1, usRate: 0, capacity: {}, drivers: {} };
  for (const ev of s.events.active) {
    const t = EVENT_BY_ID[ev.templateId];
    if (!t || t.company || !eventIsActive(ev, today)) continue;
    const k = clamp((today - ev.startDay + 1) / 7, 0, 1) * ev.magnitude;
    const mods: EventMods = t.mods;
    const mul = (x: number | undefined) => (x === undefined ? 1 : Math.pow(x, k));
    m.oil *= mul(mods.oil);
    m.fx *= mul(mods.fx);
    m.tech *= mul(mods.tech);
    m.tourism *= mul(mods.tourism);
    m.myDemand *= mul(mods.myDemand);
    m.globalDemand *= mul(mods.globalDemand);
    m.usDemand *= mul(mods.usDemand);
    m.creditWillingness *= mul(mods.creditWillingness);
    m.propDemand *= mul(mods.propDemand);
    m.risk += (mods.risk ?? 0) * k;
    m.creditSpread += (mods.creditSpread ?? 0) * k;
    m.usRate += (mods.usRate ?? 0) * k;
    for (const [sec, x] of Object.entries(mods.capacity ?? {})) m.capacity[sec] = (m.capacity[sec] ?? 1) * Math.pow(x as number, k);
    for (const [d, x] of Object.entries(mods.drivers ?? {})) m.drivers[d] = (m.drivers[d] ?? 1) * Math.pow(x as number, k);
  }
  return m;
}

export function initialExternal(BASELINE: typeof LEGACY_BASELINE = nationalBase): ExternalState {
  const cycles: Record<string, number> = {};
  for (const k of Object.keys(CYCLES)) cycles[k] = 0;
  return {
    myDemand: 1, globalDemand: 1, usDemand: 1, techCycle: 1, oil: 1, tourism: 1,
    opr: BASELINE.opr, fedRate: BASELINE.fedRate, mgs10: BASELINE.mgs10, ust10: BASELINE.ust10,
    myrPerUsd: BASELINE.myrPerUsd, riskAppetite: 0.5, myInflation: 0.02, usPrice: 1,
    drivers: Object.fromEntries(DRIVERS.map((d) => [d, 1])) as Record<GlobalDriver, number>,
    cycles, daysElapsed: 0,
  };
}

/** Daily external update. `klInflation` feeds Malaysia's national inflation with a small weight. */
export function updateExternal(s: GameState, mods: AggregatedMods, klInflation: number, dayOfMonth: number, month: number, klOutputGap = 0): void {
  const BASELINE = baselineFor(s);
  const e = s.external;
  e.daysElapsed += 1;
  const t = e.daysElapsed / 365;
  for (const [k, c] of Object.entries(CYCLES)) e.cycles[k] = c.persist * (e.cycles[k] ?? 0) + c.sd * randnClipped(s.rng);
  const cy = e.cycles;
  e.myDemand = Math.exp(TREND.my * t + cy.my) * mods.myDemand;
  e.globalDemand = Math.exp(TREND.global * t + cy.global) * mods.globalDemand;
  e.usDemand = Math.exp(TREND.us * t + cy.us) * mods.usDemand;
  e.techCycle = Math.exp(TREND.tech * t + cy.tech) * mods.tech;
  e.oil = Math.exp(cy.oil) * mods.oil;
  e.tourism = Math.exp(TREND.tourism * t + cy.tourism) * mods.tourism;
  e.usPrice = Math.exp(TREND.usPrice * t);
  e.riskAppetite = clamp(0.5 + cy.risk + mods.risk, 0.05, 0.95);

  // Policy rates: central banks meet on the 1st of alternate months (fictional schedule).
  if (dayOfMonth === 1 && month % 2 === 1) {
    e.myInflation = clamp(0.85 * (0.02 + 0.03 * (e.oil - 1) + 0.2 * (e.myrPerUsd / BASELINE.myrPerUsd - 1)) + 0.15 * klInflation + monetaryEffects(s).inflation, -0.02, 0.12);
    // KL is a large share of the national economy, so its output gap enters the (fictional) rule.
    const oprTarget = BASELINE.opr + 1.3 * (e.myInflation - 0.02) + 0.5 * Math.log(e.myDemand / Math.exp(TREND.my * t)) + demandFor(s).oprGapWeight * klOutputGap;
    applyMpcDecision(s, oprTarget);
    const fedTarget = 0.0375 + mods.usRate + 1.2 * (Math.log(e.usDemand / Math.exp(TREND.us * t))) + 0.4 * (e.oil - 1) * 0.03;
    if (Math.abs(fedTarget - e.fedRate) > 0.00125) e.fedRate = clamp(e.fedRate + Math.sign(fedTarget - e.fedRate) * 0.0025, 0.005, 0.08);
  }
  const controls = capitalControls(s);
  e.mgs10 = 0.038 + 0.7 * (e.opr - BASELINE.opr) + 0.004 * cy.my * 10 + controls.yieldPremium + monetaryEffects(s).yield;
  e.ust10 = 0.042 + 0.6 * (e.fedRate - BASELINE.fedRate) + 0.6 * mods.usRate - 0.02 * (e.riskAppetite - 0.5);

  // Ringgit: rate differential, oil (Malaysia is a net energy exporter) and risk appetite.
  const diff = e.opr - e.fedRate - (BASELINE.opr - BASELINE.fedRate);
  s.centralBank.pressure *= Math.exp(-1 / 30);
  // Schema 9: a conversion requirement supports the ringgit; short-term flow controls damp its random swings.
  // Boom mode (D-079): productivity-led appreciation as the economy outgrows its opening size (Balassa–Samuelson style).
  const boom = boomOn(s);
  const catchUp = boom ? -BOOM.fxProductivityElasticity * Math.log(Math.max(1, s.indicators.realGdpAnnual / s.baseline.realGdpAnnual)) : 0;
  e.myrPerUsd = clamp(BASELINE.myrPerUsd * Math.exp(catchUp + s.centralBank.pressure + monetaryEffects(s).fx + controls.fxLevel + cy.fx * (1 - controls.fxDamping) - 1.5 * diff - 0.05 * (e.oil - 1) - 0.08 * (e.riskAppetite - 0.5)) * mods.fx, boom ? BOOM.fxFloor : 3.2, 6.5);

  const d = (name: GlobalDriver, base: number) => base * (mods.drivers[name] ?? 1);
  const g = e.globalDemand, us = e.usDemand, tc = e.techCycle;
  e.drivers = {
    semis: d('semis', Math.pow(tc, 1.4) * Math.exp(cy.semis)),
    software: d('software', tc * Math.exp(0.02 * t)),
    ads: d('ads', Math.sqrt(tc) * us),
    consumer: d('consumer', us * Math.exp(0.01 * t)),
    energy: d('energy', Math.pow(e.oil, 0.7) * Math.sqrt(g)),
    finance: d('finance', us * (1 + 2 * (e.fedRate - BASELINE.fedRate))),
    health: d('health', Math.exp(0.03 * t)),
    industrial: d('industrial', g),
    auto: d('auto', g * Math.exp(cy.auto)),
  };
}
