// Global standing (schema 9, model 3; D-059): Malaysia against the ten largest economies by IMF 2026 US$ GDP.
// Rivals follow their IMF WEO (Oct 2026) projections, moved by the simulated US/global cycles. Malaysia's US$ GDP is
// the simulated nominal GDP run rate at the current simulated ringgit. Nothing here is live data.
import { MALAYSIA_IMF, RIVALS, type RivalCountry } from '../data/countries';
import { baselineFor } from '../data/economic-baseline';
import type { GameState } from '../types/game';
import { cycleDeviation } from './external';
import { clamp } from './util';

/** Years of game time since the campaign opened (1 Jan 2027). */
export const yearsElapsed = (s: GameState) => Math.max(0, s.external.daysElapsed / 365);

/** Rival US$ GDP run rate (bn): the IMF annual path, log-interpolated, × the simulated cycle around its trend. */
export function rivalGdpUsd(s: GameState, r: RivalCountry, t = yearsElapsed(s)): number {
  const [g26, g27, g28] = r.gdpUsd;
  const path = t <= 1 ? g26 * Math.pow(g27 / g26, t) : g27 * Math.pow(g28 / g27, t - 1);
  return path * cycleDeviation(s, r.cycle);
}

/** Malaysia's simulated US$ GDP run rate (bn) from the last closed month, at that month's closing FX. */
export function malaysiaGdpUsd(s: GameState): number {
  return s.indicators.nominalGdpAnnual / s.external.myrPerUsd / 1e9;
}

export interface StandingRow { id: string; name: string; flag: string; gdpUsd: number; growthPct: number; inflationPct: number; currentAccountPct: number; perCapita: number; currencyPct: number; isMalaysia: boolean; rank: number }

export function standingBoard(s: GameState): StandingRow[] {
  const t = yearsElapsed(s);
  const rows: StandingRow[] = RIVALS.map(r => ({ id: r.id, name: r.name, flag: r.flag, gdpUsd: rivalGdpUsd(s, r, t), growthPct: r.realGrowth2027, inflationPct: r.inflation2027, currentAccountPct: r.currentAccount2026,
    perCapita: rivalGdpUsd(s, r, t) * 1e3 / r.population2026, currencyPct: 0, isMalaysia: false, rank: 0 }));
  const my = malaysiaGdpUsd(s);
  const open = s.fdi?.standing[0];
  const growthPct = s.indicators.realGrowthYoY ? s.indicators.realGrowthYoY * 100 : MALAYSIA_IMF.realGrowth2027;
  const tradeBalance = s.trade.history.slice(-12);
  const ca = tradeBalance.length ? 100 * tradeBalance.reduce((a, m) => a + m.exports - m.imports, 0) * (12 / tradeBalance.length) / Math.max(1, s.indicators.nominalGdpAnnual) : MALAYSIA_IMF.currentAccount2026;
  rows.push({ id: 'MYS', name: 'Malaysia (you)', flag: '🇲🇾', gdpUsd: my, growthPct, inflationPct: s.indicators.inflationYoY * 100, currentAccountPct: ca,
    perCapita: my * 1e9 / s.households.population, currencyPct: open ? 100 * (open.myrPerUsd / s.external.myrPerUsd - 1) : 0, isMalaysia: true, rank: 0 });
  rows.sort((a, b) => b.gdpUsd - a.gdpUsd).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** Gap to the smallest of the ten rivals and years to close it at the current relative US$ growth. */
export function gapToTopTen(s: GameState) {
  const t = yearsElapsed(s);
  const tenth = Math.min(...RIVALS.map(r => rivalGdpUsd(s, r, t)));
  const my = malaysiaGdpUsd(s);
  const comps = standingComponents(s);
  const rel = comps.relativeGdpGrowth;
  return { tenth, my, ratio: my / tenth, yearsToClose: rel > 0.0005 ? Math.log(tenth / my) / Math.log(1 + rel) : Infinity };
}

/** Score inputs: US$ GDP growth relative to the rivals, export growth relative to rival GDP, and the ringgit. */
export function standingComponents(s: GameState) {
  const hist = s.fdi?.standing ?? [];
  const open = hist[0];
  const last = hist.at(-1);
  if (!open || !last || hist.length < 2) return { relativeGdpGrowth: 0, relativeExportGrowth: 0, ringgitChange: 0, gdpPoints: 50, tradePoints: 50, currencyPoints: 50, points: 50 };
  const years = Math.max((hist.length - 1) / 12, 0.25);
  const tOpen = 0, tNow = yearsElapsed(s);
  const rivalGrowth = Math.exp(RIVALS.reduce((a, r) => a + Math.log(rivalGdpUsd(s, r, tNow) / rivalGdpUsd(s, r, tOpen)), 0) / RIVALS.length);
  const relativeGdpGrowth = Math.pow((last.gdpUsd / open.gdpUsd) / rivalGrowth, 1 / years) - 1;
  const relativeExportGrowth = open.exportsUsd > 0 ? Math.pow((last.exportsUsd / open.exportsUsd) / rivalGrowth, 1 / years) - 1 : 0;
  const ringgitChange = open.myrPerUsd / last.myrPerUsd - 1;
  const gdpPoints = clamp(50 + 800 * relativeGdpGrowth, 0, 100);
  const tradePoints = clamp(50 + 500 * relativeExportGrowth, 0, 100);
  const currencyPoints = clamp(50 + 400 * ringgitChange, 0, 100);
  return { relativeGdpGrowth, relativeExportGrowth, ringgitChange, gdpPoints, tradePoints, currencyPoints, points: 0.5 * gdpPoints + 0.25 * tradePoints + 0.25 * currencyPoints };
}

/** Month close: record Malaysia's US$ GDP, exports and FX (the first record is the opening reference). */
export function monthCloseStanding(s: GameState, monthKey: number, monthExportsMYR: number, days: number): void {
  if (!s.fdi?.enabled) return;
  const exportsUsd = monthExportsMYR * 365 / days / s.external.myrPerUsd / 1e9;
  const fx0 = baselineFor(s).myrPerUsd;
  if (!s.fdi.standing.length) s.fdi.standing.push({ monthKey: monthKey - 1, gdpUsd: s.baseline.nominalGdpAnnual / fx0 / 1e9, exportsUsd: monthExportsMYR * 365 / days / fx0 / 1e9, myrPerUsd: fx0 });
  s.fdi.standing.push({ monthKey, gdpUsd: malaysiaGdpUsd(s), exportsUsd, myrPerUsd: s.external.myrPerUsd });
  if (s.fdi.standing.length > 61) s.fdi.standing.splice(1, 1); // keep the opening reference
}
