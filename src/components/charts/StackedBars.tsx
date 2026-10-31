import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Series } from './TimeChart';

interface Props {
  data: Record<string, number | string>[];
  xKey: string;
  series: Series[];
  yFormat: (v: number) => string;
  height?: number;
  unit: string;
  dataLabel?: string;
}

/** Stacked monthly bars: one colour per series in fixed order, a 2px surface gap between segments, legend below. */
export function StackedBars({ data, xKey, series, yFormat, height = 190, unit, dataLabel = 'Simulated' }: Props) {
  if (!data.length) return <div className="grid place-items-center text-xs text-slate-500" style={{ height }}>No data yet — history builds as the clock runs.</div>;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[9.5px] uppercase tracking-wider text-slate-500">
        <span>{unit}</span>
        <span>{dataLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke="#334155" strokeOpacity={0.35} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: '#8b9ab5', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={yFormat} tick={{ fill: '#8b9ab5', fontSize: 10 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            cursor={{ fill: '#94a3b8', fillOpacity: 0.08 }}
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: '#cbd5e1' }}
            itemStyle={{ color: '#e2e8f0' }}
            formatter={(v, n) => [yFormat(Number(v)), n]}
          />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} stroke="#111a2c" strokeWidth={2}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-300" aria-label="Chart legend">
        {series.map((s) => <span className="inline-flex items-center gap-1.5" key={s.key}><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}
