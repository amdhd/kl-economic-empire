import { useId } from 'react';
import { outlaysOf } from '../../engine/government';
import { fullMoneyMinor, money, pct } from '../../utils/format';
import { compactBillions, signedBillions, treasuryTrend } from '../../utils/treasury-trend';
import { useGame, useGameState } from '../../store/game-store';

const W = 308;
const H = 120;

/** Sparkline of daily treasury closes with a soft glow and an end dot, coloured by the weekly trend. */
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, ''); // safe inside url(#…)
  const color = up ? '#4ade80' : '#ef6a5b';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = 10;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2);
  const y = (v: number) => (hi === lo ? H / 2 : pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ex = x(values.length - 1);
  const ey = y(values[values.length - 1]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <radialGradient id={`${id}g`} cx="0.6" cy="0.7" r="0.6"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}l`} x1="0" x2="1"><stop offset="0" stopColor={color} stopOpacity="0.75" /><stop offset="1" stopColor={color} /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}g)`} />
      <path d={d} fill="none" stroke={`url(#${id}l)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="11" fill={color} opacity="0.15" />
      <circle cx={ex} cy={ey} r="5" fill={color} />
    </svg>
  );
}

/** Bottom-bar treasury readout: the latest daily close, a ±billions day trend, and a wealth-history card on hover. */
export function TreasuryChip() {
  const g = useGameState();
  const panel = useGame((s) => s.panel);
  const setPanel = useGame.getState().setPanel;
  const t = treasuryTrend(g.daily);
  // Updates once per settled day; before the first close it shows the opening balance.
  const minor = t.close === null ? g.government.treasury : Math.round(t.close * 100);
  const dir = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const weekUp = t.weekChange >= 0;
  // Cash on hand is a working float, not income: how many days of outlays it covers is the number to watch.
  const last = g.reports.at(-1);
  const dailyOutlays = (last ? outlaysOf(last.gov) : Object.values(g.government.policies.budget).reduce((a, b) => a + b, 0)) / 30;
  const runwayDays = dailyOutlays > 0 ? minor / 100 / dailyOutlays : Infinity;
  return (
    <div className="cs-money-wrap">
      <button className={`cs-money ${panel === 'finance' ? 'is-active' : ''}`} onClick={() => setPanel(panel === 'finance' ? null : 'finance')} aria-pressed={panel === 'finance'}
        aria-label="Treasury balance at the last daily close. Click for the full Economy window." data-testid="bottom-treasury">
        <span className="cs-coin" aria-hidden><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></svg></span>
        <b className="num">{fullMoneyMinor(minor)}</b>
        <span className={`num cs-trend ${dir(t.dayChange)}`} data-testid="treasury-day-trend">{t.dayChange < 0 ? '▼' : t.dayChange > 0 ? '▲' : '•'} {signedBillions(t.dayChange)}</span>
      </button>
      <div className={`treasury-pop ${weekUp ? 'up' : 'down'}`} role="tooltip" data-testid="treasury-pop">
        <div className="tp-label">Treasury balance</div>
        <div className="tp-value num">{compactBillions(minor / 100)}</div>
        <div className="tp-change num">{weekUp ? '▲' : '▼'} {signedBillions(t.weekChange)} ({pct(t.weekPct, 2, true)}) <span>past week</span></div>
        <div className="tp-sub">Spendable government cash, not income. Receipts arrive daily and at month close; the state borrows to refill it.</div>
        <div className="tp-sub num" data-testid="treasury-runway">Covers ~{Number.isFinite(runwayDays) ? Math.floor(runwayDays) : '∞'} days of outlays</div>
        <div className="tp-sub num" data-testid="treasury-bnm">BNM FX reserves {money(g.centralBank.usdReserves / 100, 'USD')} · not spendable</div>
        <div className="tp-label mt">Treasury history</div>
        <div className="tp-sub">Daily closes · last {Math.max(t.history.length, 1)} days · simulated</div>
        {t.history.length >= 2 ? <Sparkline values={t.history} up={weekUp} /> : <div className="tp-empty">History starts after the first daily close.</div>}
      </div>
    </div>
  );
}
