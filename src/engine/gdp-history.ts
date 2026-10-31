// Monthly GDP history with plain-language reasons (D-086). Read-only: everything is derived from the closed monthly
// reports, so it also works for older saves. GDP is shown in US dollars at each month's own ringgit rate, so a month's
// move is split into "more output" (valued at last month's rate) and "ringgit rate" (the rest).
import { baselineFor, SECTOR_IDS, SECTORS } from '../data/economic-baseline';
import type { GameState, MonthlyReport } from '../types/game';
import { calibrationFor } from './calibration';
import { daysInMonth } from './time';

export interface GdpMonth {
  monthKey: number;
  label: string;
  /** Annual run rate, US$ billions at that month's ringgit rate, and the same in ringgit billions. */
  usd: number;
  myr: number;
  myrPerUsd: number;
  changeUsd: number;
  changePct: number;
  /** Two or three short reasons for the move; empty for the opening reference. */
  reasons: string[];
}

const annualFactor = (r: MonthlyReport) => 365 / daysInMonth(Math.floor(r.monthKey / 12), (r.monthKey % 12) + 1);
const usdBn = (v: number) => `US$${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}bn`;
const myrBn = (v: number) => `RM${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}bn`;
const signed = (v: number, text: string) => `${v >= 0 ? '+' : '−'}${text}`;

export function gdpHistory(s: GameState): GdpMonth[] {
  const fx0 = baselineFor(s).myrPerUsd;
  const open = s.baseline.nominalGdpAnnual / 1e9;
  const cal = calibrationFor(s);
  const out: GdpMonth[] = [];
  let prevMyr = open, prevFx = fx0, prevUsd = open / fx0;
  let prevSector: Record<string, number> = Object.fromEntries(SECTOR_IDS.map((id) => [id, (cal.Y0[id] * cal.v[id] * 365) / 1e9]));
  let prevReal: number | null = null, prevCpi = 100;
  out.push({ monthKey: s.reports.length ? s.reports[0].monthKey - 1 : 0, label: 'Opening', usd: prevUsd, myr: open, myrPerUsd: fx0, changeUsd: 0, changePct: 0, reasons: [] });
  for (const r of s.reports) {
    const a = annualFactor(r);
    const myr = (r.nominalGdp * a) / 1e9, usd = myr / r.myrPerUsd;
    const sector: Record<string, number> = Object.fromEntries(SECTOR_IDS.map((id) => [id, (r.gdpBySector[id] * a) / 1e9]));
    const volumeUsd = (myr - prevMyr) / prevFx; // the change if the ringgit rate had not moved
    const fxUsd = usd - prevUsd - volumeUsd;
    const changeUsd = usd - prevUsd, changePct = prevUsd > 0 ? changeUsd / prevUsd : 0;
    const reasons: string[] = [];
    reasons.push(`US$ GDP ${changeUsd >= 0 ? 'rose' : 'fell'} ${usdBn(changeUsd)} (${signed(changePct, `${Math.abs(changePct * 100).toFixed(1)}%`)}) to ${usdBn(usd)}.`);
    const fxPct = prevFx / r.myrPerUsd - 1;
    reasons.push(Math.abs(fxPct) < 0.0005
      ? `The ringgit was steady, so the move is all output: ${signed(volumeUsd, usdBn(volumeUsd))} (${signed(myr - prevMyr, myrBn(myr - prevMyr))} a year in ringgit).`
      : `Output in ringgit ${myr >= prevMyr ? 'grew' : 'shrank'} ${Math.abs((myr / prevMyr - 1) * 100).toFixed(1)}% (${signed(volumeUsd, usdBn(volumeUsd))}). The ringgit ${fxPct > 0 ? 'strengthened' : 'weakened'} ${Math.abs(fxPct * 100).toFixed(1)}% against the dollar (${signed(fxUsd, usdBn(fxUsd))}).`);
    const moves = SECTOR_IDS.map((id) => ({ name: SECTORS[id].short, d: sector[id] - prevSector[id] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 2).filter((m) => Math.abs(m.d) >= 0.05);
    const realAnnual = r.realGdp * a;
    const real = prevReal ? realAnnual / prevReal - 1 : null;
    const price = r.cpi / prevCpi - 1;
    let third = moves.length ? `Biggest sector moves: ${moves.map((m) => `${m.name} ${signed(m.d, myrBn(m.d))}/yr`).join(', ')}.` : 'Sector output was little changed.';
    if (real !== null) third += ` Real output ${signed(real, `${Math.abs(real * 100).toFixed(1)}%`)}, consumer prices ${signed(price, `${Math.abs(price * 100).toFixed(1)}%`)}.`;
    if (r.events.length) third += ` Active shock: ${r.events[0]}.`;
    reasons.push(third);
    out.push({ monthKey: r.monthKey, label: r.label, usd, myr, myrPerUsd: r.myrPerUsd, changeUsd, changePct, reasons });
    prevMyr = myr; prevFx = r.myrPerUsd; prevUsd = usd; prevSector = sector; prevReal = realAnnual; prevCpi = r.cpi;
  }
  return out;
}
