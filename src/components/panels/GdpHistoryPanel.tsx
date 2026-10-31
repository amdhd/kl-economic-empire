import { gdpHistory } from '../../engine/gdp-history';
import { useGameState } from '../../store/game-store';
import { bnTick } from '../../utils/format';
import { TimeChart } from '../charts/TimeChart';
import { Section } from '../ui';
import { PanelShell } from './PanelShell';

/** Monthly US$ GDP with two or three plain reasons for each month's rise or fall (D-086). */
export function GdpHistoryPanel() {
  const g = useGameState();
  const months = gdpHistory(g);
  const rows = months.slice(1).reverse();
  return <PanelShell title="Monthly GDP history" subtitle="Why GDP in US dollars rose or fell each month · fictional simulation" width={640}>
    <Section title="GDP in US dollars · annual run rate by month">
      <TimeChart data={months.map((m) => ({ t: m.label, gdp: m.usd }))} xKey="t" series={[{ key: 'gdp', name: 'GDP (US$)', color: '#60a5fa' }]} yFormat={(v) => bnTick(v, 'US$')} unit="US$ per year, at each month's ringgit rate" height={150} area />
    </Section>
    {!rows.length && <p className="text-[12.5px] text-slate-400">The first monthly close arrives at the end of the first month. Reasons will appear here.</p>}
    {rows.map((m) => <Section key={m.monthKey} title={m.label} right={<span className={`num text-[12.5px] font-semibold ${m.changeUsd >= 0 ? 'up' : 'down'}`}>{m.changeUsd >= 0 ? '▲' : '▼'} {m.changeUsd >= 0 ? '+' : '−'}US${Math.abs(m.changeUsd).toFixed(1)}bn ({(m.changePct * 100).toFixed(1)}%)</span>}>
      <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-slate-300" data-testid={`gdp-reasons-${m.monthKey}`}>{m.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </Section>)}
  </PanelShell>;
}
