import { useState } from 'react';
import { baselineFor } from '../../data/economic-baseline';
import { COMMODITIES, COMMODITY_IDS, FUEL_CEILING0, PALM_DUTY0 } from '../../data/world';
import { fuelMarketPrice, fuelSubsidyDaily, wheatSubsidyDaily } from '../../engine/world';
import { formatKL } from '../../engine/time';
import type { CommodityPolicy } from '../../types/game';
import { useGame, useGameState } from '../../store/game-store';
import { money, pct } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

export function CommoditiesPanel() {
  const g = useGameState();
  const w = g.world;
  const command = useGame.getState().command;
  const pending = g.government.pending.filter((p) => p.kind === 'commodity');
  const proposed = { ...w.policy, ...Object.assign({}, ...pending.map((p) => p.patch)) } as CommodityPolicy;
  const [pol, setPol] = useState(proposed);
  const [confirm, setConfirm] = useState(false);
  if (!w.enabled) {
    return <PanelShell title="Commodities & subsidies" subtitle="World prices, fuel ceilings and duties">
      <p className="text-[12px] text-amber-200">Commodities, subsidies and the resource sector are modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  const fxf = g.external.myrPerUsd / baselineFor(g).myrPerUsd;
  const market = fuelMarketPrice(g);
  const changed = (Object.keys(pol) as (keyof CommodityPolicy)[]).filter((k) => Math.abs(pol[k] - proposed[k]) > 1e-9);
  const chart = w.history.slice(-365).map((h) => ({ t: formatKL(h.t * 1440).date, oil: h.oil * 100, palm: h.palm * 100, wheat: h.wheat * 100, steel: h.steel * 100 }));
  const set = (k: keyof CommodityPolicy, v: number) => setPol({ ...pol, [k]: v });
  return <PanelShell title="Commodities & subsidies" subtitle="World prices are exogenous; you control domestic ceilings, subsidies and duties" width={760}>
    <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3" data-testid="commodity-prices">
      {COMMODITY_IDS.map((c) => {
        const m = COMMODITIES[c];
        const price = m.reference * w.prices[c] * (m.currency === 'MYR' ? fxf : 1);
        return <Stat key={c} label={m.name} value={`${m.currency === 'USD' ? 'US$' : 'RM'}${price.toFixed(0)}/${m.unit}`} sub={`${pct(w.prices[c] - 1, 1, true)} vs reference`} />;
      })}
    </div>
    <Section title="World price indices · reference = 100">
      <TimeChart data={chart} xKey="t" unit="Index" yFormat={(v) => v.toFixed(0)} series={COMMODITY_IDS.map((c) => ({ key: c, name: COMMODITIES[c].name, color: COMMODITIES[c].color }))} />
      {w.episodes.length > 0 && <div className="mt-2 space-y-1 text-[12px] text-amber-200">{w.episodes.map((e) => <div key={e.id}>{e.title} · until {formatKL(e.endDay * 1440).date}</div>)}</div>}
    </Section>
    <Section title="This month · treasury effects">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Fuel subsidy paid" value={money(w.mtd.fuelSubsidy)} sub={`${money(fuelSubsidyDaily(g) * 365)}/yr at today's price`} />
        <Stat label="Wheat subsidy paid" value={money(w.mtd.wheatSubsidy)} sub={`${money(wheatSubsidyDaily(g) * 365)}/yr`} />
        <Stat label="Palm export duty" value={money(w.mtd.palmDuty)} />
        <Stat label="Steel safeguard duty" value={money(w.mtd.steelDuty)} />
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Oil & gas and palm oil are value added outside the seven industries: higher prices raise nominal GDP, PETRONAS profits, petroleum income tax and palm duty, and strengthen the ringgit. Households and firms pay more for fuel and inputs. Resource value added this month {money(w.mtd.resourceVa)}.</p>
    </Section>
    <Section title="Domestic policy · effective next calendar month">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
        <label className="block">RON95 ceiling · RM{pol.fuelCeiling.toFixed(2)}/L <span className="text-slate-400">(unsubsidised ≈ RM{market.toFixed(2)})</span>
          <input type="range" min={1.5} max={3.5} step={0.05} value={pol.fuelCeiling} onChange={(e) => set('fuelCeiling', Number(e.target.value))} aria-label="Fuel ceiling" data-testid="fuel-ceiling" />
        </label>
        <label className="block">Eligible share · {pct(pol.fuelEligible, 0)} of volume
          <input type="range" min={0} max={1} step={0.05} value={pol.fuelEligible} onChange={(e) => set('fuelEligible', Number(e.target.value))} aria-label="Fuel eligibility" data-testid="fuel-eligible" />
          <span className="text-slate-400">100% = blanket (leaks to non-residents and smuggling); 85% ≈ citizens only; lower = income-targeted</span>
        </label>
        <label className="block">Wheat subsidy · covers {pct(pol.wheatSubsidy, 0)} of price rises
          <input type="range" min={0} max={1} step={0.05} value={pol.wheatSubsidy} onChange={(e) => set('wheatSubsidy', Number(e.target.value))} aria-label="Wheat subsidy" data-testid="wheat-subsidy" />
        </label>
        <label className="block">Steel safeguard duty · {pct(pol.steelSafeguard, 1)}
          <input type="range" min={0} max={0.5} step={0.025} value={pol.steelSafeguard} onChange={(e) => set('steelSafeguard', Number(e.target.value))} aria-label="Steel safeguard" data-testid="steel-safeguard" />
          <span className="text-slate-400">Protects domestic steelmakers; raises construction costs</span>
        </label>
        <label className="block">Palm export duty · {pct(pol.palmExportDuty, 1)} <span className="text-slate-400">(opening {pct(PALM_DUTY0, 1)})</span>
          <input type="range" min={0} max={0.2} step={0.005} value={pol.palmExportDuty} onChange={(e) => set('palmExportDuty', Number(e.target.value))} aria-label="Palm export duty" data-testid="palm-duty" />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Raising the fuel ceiling above RM{FUEL_CEILING0.toFixed(2)} or narrowing eligibility saves money but raises prices and is unpopular. Extra household fuel spending comes out of other consumption.</p>
      <button className="btn btn-primary mt-2" disabled={!changed.length} onClick={() => setConfirm(true)} data-testid="review-commodity">Review changes</button>
      {pending.map((p) => <div key={p.id} className="mt-2 flex items-center justify-between gap-2 text-[12px] text-amber-200"><span>{p.label} · from {formatKL(p.effectiveMin).date}</span><button className="btn" onClick={() => command({ type: 'cancelPolicy', id: p.id })}>Withdraw</button></div>)}
    </Section>
    {confirm && <ConfirmDialog title="Queue commodity policy" confirmLabel="Queue policy" onCancel={() => setConfirm(false)} onConfirm={() => { command({ type: 'queueCommodity', patch: Object.fromEntries(changed.map((k) => [k, pol[k]])) }); setConfirm(false); }}>
      <ul className="list-disc space-y-1 pl-4">{changed.map((k) => <li key={k}>{k}: {k === 'fuelCeiling' ? `RM${proposed[k].toFixed(2)} → RM${pol[k].toFixed(2)}` : `${pct(proposed[k], 1)} → ${pct(pol[k], 1)}`}</li>)}<li>Effective on the 1st of next month.</li></ul>
    </ConfirmDialog>}
  </PanelShell>;
}
