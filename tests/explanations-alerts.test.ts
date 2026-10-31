import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERTS, alertTransitions, economicAlerts, treasuryRunway, validAlertPreferences } from '../src/engine/alerts';
import { computeCpi } from '../src/engine/economy';
import { explainEconomy, type ExplainMetric } from '../src/engine/economic-explanations';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { daysInMonth } from '../src/engine/time';
import { deserialize, serialize } from '../src/persistence/save';
import { clone, withoutEvents } from './helpers';

const sum = (s: ReturnType<typeof createGame>, metric: ExplainMetric) => explainEconomy(s, metric).parts.reduce((a, p) => a + p.value, 0);

describe('read-only economic explanations', () => {
  it('reconciles monthly approval, current unemployment, GDP run rates and treasury movements', () => withoutEvents(() => {
    const s = createGame(1201);
    runHeadless(s, 24 * 80);
    const before = clone(s);
    const last = s.reports.at(-1)!, prev = s.reports.at(-2)!;
    expect(sum(s, 'approval')).toBeCloseTo(last.approval - prev.approval, 9);
    expect(sum(s, 'unemployment')).toBeCloseTo(100 * (1 - s.households.employed / s.households.laborForce - last.unemployment), 9);
    const rate = (r: typeof last) => r.nominalGdp * 365 / daysInMonth(Math.floor(r.monthKey / 12), r.monthKey % 12 + 1);
    expect(sum(s, 'gdp')).toBeCloseTo(rate(last) - rate(prev), 2);
    expect(sum(s, 'treasury')).toBeCloseTo(s.government.treasury / 100 - last.treasury, 3);
    expect(s).toEqual(before); // reads cannot change histories, clocks, RNG or balances
  }));

  it('reconciles CPI level contributions with fuel, rents and the consumption levy', () => {
    const s = createGame(1202);
    s.households.rentIndex = 1.2;
    s.world.policy.fuelEligible = 0;
    s.government.policies.tax.consumption = 0.08;
    s.sectors.util.price = 1.3;
    s.indicators.cpi = computeCpi(s);
    expect(sum(s, 'inflation')).toBeCloseTo(s.indicators.cpi - 100, 9);
    expect(explainEconomy(s, 'inflation').caveat).toContain('not the latest year-on-year');
  });

  it('shows missing-history states and outstanding policy/project lags without inventing attribution', () => {
    const s = createGame(1203);
    expect(explainEconomy(s, 'approval').parts).toHaveLength(0);
    expect(explainEconomy(s, 'gdp').parts).toHaveLength(0);
    expect(applyCommand(s, { type: 'queueTax', patch: { corporate: 0.25 } }, s.clock.hour * 60).ok).toBe(true);
    expect(applyCommand(s, { type: 'startProject', templateId: 'fibre' }, s.clock.hour * 60).ok).toBe(true);
    const view = explainEconomy(s, 'gdp');
    expect(view.pending.some(p => p.includes('02 Jan 2027'))).toBe(true);
    expect(view.pending.some(p => p.includes('Benefits require completion'))).toBe(true);
  });

  it('reconciles published CPI while a newly effective tax awaits daily settlement', () => withoutEvents(() => {
    const s = createGame(1204);
    applyCommand(s, { type: 'queueTax', patch: { consumption: 0.1 } }, s.clock.hour * 60);
    runHeadless(s, 16); // 2 January 00:00: the day just closed was priced before the new tax applied
    expect(s.government.policies.tax.consumption).toBe(0.1);
    expect(explainEconomy(s, 'inflation').parts.some(p => p.label === 'Awaiting daily price settlement')).toBe(true);
    expect(sum(s, 'inflation')).toBeCloseTo(s.indicators.cpi - 100, 9);
    runHeadless(s, 24);
    expect(explainEconomy(s, 'inflation').parts.some(p => p.label === 'Awaiting daily price settlement')).toBe(false);
  }));
});

describe('economic alerts', () => {
  it('checks real thresholds, has no opening runway estimate and never mutates the economy', () => {
    const s = createGame(1210), prefs = clone(DEFAULT_ALERTS);
    expect(treasuryRunway(s)).toBeNull();
    s.scheduler.mtdDays = 2;
    s.government.mtd.opex = 200;
    s.government.treasury = 300 * 100;
    s.households.employed = s.households.laborForce * 0.9;
    s.households.rentIndex = s.households.wageIndex * 1.5;
    const before = clone(s);
    const alerts = economicAlerts(s, prefs);
    expect(treasuryRunway(s)).toBe(3);
    expect(alerts.map(a => a.rule).sort()).toEqual(['housing', 'treasury', 'unemployment']);
    expect(alerts.every(a => a.severity === 'critical')).toBe(true);
    expect(s).toEqual(before);
    prefs.enabled = { treasury: false, unemployment: false, housing: false, projects: false };
    expect(economicAlerts(s, prefs)).toHaveLength(0);
  });

  it('notifies only on entry or escalation and rearms after a real recovery', () => {
    const s = createGame(1211), prefs = clone(DEFAULT_ALERTS);
    s.households.employed = s.households.laborForce * 0.93;
    let step = alertTransitions({}, economicAlerts(s, prefs));
    expect(step.fresh).toHaveLength(1);
    expect(step.fresh[0].severity).toBe('warning');
    step = alertTransitions(step.memory, economicAlerts(s, prefs, step.memory));
    expect(step.fresh).toHaveLength(0);
    s.households.employed = s.households.laborForce * 0.90;
    step = alertTransitions(step.memory, economicAlerts(s, prefs, step.memory));
    expect(step.fresh[0].severity).toBe('critical');
    s.households.employed = s.households.laborForce * 0.941; // 5.9%, inside release margin
    step = alertTransitions(step.memory, economicAlerts(s, prefs, step.memory));
    expect(step.memory.unemployment).toBe('warning');
    expect(step.fresh).toHaveLength(0);
    s.households.employed = s.households.laborForce * 0.98;
    step = alertTransitions(step.memory, economicAlerts(s, prefs, step.memory));
    expect(step.memory).toEqual({});
    s.households.employed = s.households.laborForce * 0.93;
    expect(alertTransitions(step.memory, economicAlerts(s, prefs, step.memory)).fresh).toHaveLength(1);
  });

  it('estimates construction overruns from paid work and remaining real work, ignoring completed projects', () => {
    const s = createGame(1212);
    expect(applyCommand(s, { type: 'startProject', templateId: 'fibre' }, s.clock.hour * 60).ok).toBe(true);
    s.sectors.prop.price = 1.5;
    const project = s.government.projects[0];
    expect(economicAlerts(s, DEFAULT_ALERTS).find(a => a.rule === 'projects')?.title).toContain('+50%');
    project.status = 'complete';
    expect(economicAlerts(s, DEFAULT_ALERTS).some(a => a.rule === 'projects')).toBe(false);
  });

  it('rejects corrupt persisted thresholds and booleans', () => {
    expect(validAlertPreferences(DEFAULT_ALERTS)).toBe(true);
    expect(validAlertPreferences(null)).toBe(false);
    expect(validAlertPreferences({ ...DEFAULT_ALERTS, runwayDays: -1 })).toBe(false);
    expect(validAlertPreferences({ ...DEFAULT_ALERTS, unemploymentPct: NaN })).toBe(false);
    expect(validAlertPreferences({ ...DEFAULT_ALERTS, pauseOnCritical: 'yes' })).toBe(false);
  });
});

describe('transparent campaign starts', () => {
  for (const scenario of ['export-slump', 'energy-shock'] as const) it(`${scenario} creates documented shocks and resumes deterministically`, () => withoutEvents(() => {
    const s = createGame(1220, scenario);
    expect(s.events.active).toHaveLength(1);
    const event = s.events.active[0];
    expect(event.templateId).toBe(scenario === 'export-slump' ? 'global_slowdown' : 'oil_spike');
    expect(event.endDay - event.startDay).toBe(scenario === 'export-slump' ? 180 : 90);
    runHeadless(s, 24 * 35);
    const t = deserialize(serialize(s));
    runHeadless(s, 24 * 10); runHeadless(t, 24 * 10);
    expect(t.reports).toEqual(s.reports);
    expect(t.rng).toEqual(s.rng);
    expect(t.scenario).toBe(scenario);
  }));
});
