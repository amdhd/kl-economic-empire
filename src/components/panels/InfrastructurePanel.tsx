import { INFRA, NETWORKS, NETWORK_SPECS, type NetworkId } from '../../data/infrastructure';
import { SECTORS } from '../../data/economic-baseline';
import { orderCost, pendingSteps, projectedLoad, utilisation } from '../../engine/infrastructure';
import { useGame, useGameState } from '../../store/game-store';
import { money } from '../../utils/format';
import { Section } from '../ui';
import { PanelShell } from './PanelShell';

const tone = (u: number) => (u > 1 ? 'bg-rose-500' : u > INFRA.warnAt ? 'bg-amber-400' : 'bg-emerald-500');

export function InfrastructurePanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const st = g.infra;
  if (!st) {
    return <PanelShell title="Infrastructure" subtitle="Capacity limits">
      <p className="text-[12px] text-amber-200">Infrastructure limits are part of Boom sandbox games started on this version. This campaign has none.</p>
    </PanelShell>;
  }
  const worst = Math.min(...Object.values(st.mult));
  return <PanelShell title="Infrastructure" subtitle="Growth loads the networks. Capacity takes years to build, so order it before demand arrives." width={720}>
    <p className="text-[12px] text-slate-400" data-testid="infra-summary">
      Above 100% a network throttles the sectors that depend on it, which raises prices and slows growth.
      {worst < 0.995 ? ` Hardest-hit sector is running at ${(worst * 100).toFixed(0)}% of its capacity.` : ' No sector is held back now.'}
    </p>
    {NETWORKS.map((n: NetworkId) => {
      const spec = NETWORK_SPECS[n], x = st.nets[n];
      const u = utilisation(st, n);
      const soon = projectedLoad(st, n) / (x.capacity + INFRA.step * pendingSteps(st, n));
      const builds = st.builds.filter((b) => b.network === n);
      return <Section key={n} title={spec.label} right={<span className={`num text-[13px] font-semibold ${u > 1 ? 'down' : ''}`} data-testid={`infra-util-${n}`}>{(u * 100).toFixed(0)}% used</span>}>
        <p className="text-[11.5px] text-slate-400">{spec.blurb}</p>
        <div className="mt-2 h-2.5 overflow-hidden rounded bg-slate-700/60" role="img" aria-label={`${spec.label} utilisation ${(u * 100).toFixed(0)}%`}>
          <div className={`h-full ${tone(u)}`} style={{ width: `${Math.min(100, u * 100)}%` }} />
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11.5px] text-slate-300">
          <span>Load {x.load.toFixed(2)} · capacity {x.capacity.toFixed(2)}{pendingSteps(st, n) ? ` (+${(pendingSteps(st, n) * INFRA.step).toFixed(2)} coming)` : ''}</span>
          <span className={soon > 1 ? 'down' : ''} title="Load on the current trend, over capacity including builds already ordered">In ~18 months: {(soon * 100).toFixed(0)}% used</span>
        </div>
        {builds.map((b) => <div key={b.id} className="mt-1 flex items-center justify-between text-[11.5px] text-slate-400">
          <span>+{(b.steps * INFRA.step).toFixed(2)} · {money(b.paid)} of {money(b.cost)} paid</span>
          <button className="btn" onClick={() => command({ type: 'cancelInfra', id: b.id })}>Cancel</button>
        </div>)}
        <div className="mt-2 flex flex-wrap gap-2">
          {INFRA.orderSteps.map((k) => <button key={k} className="btn" data-testid={`infra-build-${n}-${k}`} onClick={() => command({ type: 'buildInfra', network: n, steps: k })}
            title={`About ${Math.round(spec.buildDays / 30)} months to build`}>+{(k * INFRA.step).toFixed(2)} · {money(orderCost(g, n, k))}</button>)}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Most exposed: {Object.entries(spec.weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([j]) => SECTORS[j as keyof typeof SECTORS].short).join(', ')}.</p>
      </Section>;
    })}
  </PanelShell>;
}
