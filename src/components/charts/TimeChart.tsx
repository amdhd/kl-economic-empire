import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface Series {
  key: string;
  name: string;
  color: string;
}

interface Props {
  data: Record<string, number | string>[];
  xKey: string;
  series: Series[];
  yFormat: (v: number) => string;
  xFormat?: (v: number | string) => string;
  height?: number;
  area?: boolean;
  unit: string; // shown as axis caption, e.g. "RM bn" or "% YoY"
  dataLabel?: string;
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
}

export function TimeChart({ data, xKey, series, yFormat, xFormat, height = 150, area, unit, domain, dataLabel = 'Simulated' }: Props) {
  if (!data.length) return <div className="grid place-items-center text-xs text-slate-500" style={{ height }}>No data yet — history builds as the clock runs.</div>;
  const common = {
    data,
    margin: { top: 6, right: 6, left: 0, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="#334155" strokeOpacity={0.35} vertical={false} />
      <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fill: '#8b9ab5', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
      <YAxis tickFormatter={(v) => yFormat(Number(v))} tick={{ fill: '#8b9ab5', fontSize: 10 }} axisLine={false} tickLine={false} width={76} domain={domain ?? ['auto', 'auto']} />
      <Tooltip
        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }}
        labelStyle={{ color: '#cbd5e1' }}
        labelFormatter={(v) => (xFormat ? xFormat(v as number) : String(v))}
        formatter={(v, n) => [yFormat(Number(v)), n]}
      />
    </>
  );
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[9.5px] uppercase tracking-wider text-slate-500">
        <span>{unit}</span>
        <span>{dataLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {area ? (
          <AreaChart {...common}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={`url(#g-${s.key})`} strokeWidth={1.8} dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false} />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
      {series.length > 1 && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-300" aria-label="Chart legend">
        {series.map(s => <span className="inline-flex items-center gap-1.5" key={s.key}><span className="h-0.5 w-3" style={{ background: s.color }} />{s.name}</span>)}
      </div>}
    </div>
  );
}
