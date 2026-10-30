import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartPoint, Resolution } from '../../engine/market-view';
import type { Currency } from '../../types/game';
import { currencySymbol, sharePrice } from '../../utils/format';

const RES_LABEL: Record<Resolution, string> = { hour: 'hourly close', day: 'daily close', month: 'monthly close' };

/** Close-price area chart for one security. Axis shows units; caption shows resolution + fictional label. */
export function PriceChart({
  points,
  currency,
  resolution,
  height = 220,
  title,
  unit,
  decimals,
}: {
  points: ChartPoint[];
  currency: Currency;
  resolution: Resolution;
  height?: number;
  /** Overrides the "Price (RM) · daily close" caption, e.g. for FX. */
  title?: string;
  /** Overrides the y-axis unit label. */
  unit?: string;
  /** Plain-number tick precision instead of share-price formatting. */
  decimals?: number;
}) {
  const fmt = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : sharePrice(v, currency));
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-white/10 text-xs text-slate-400" style={{ height }}>
        Not enough simulated {RES_LABEL[resolution]} history yet — it builds while the market is open.
      </div>
    );
  }
  const up = points[points.length - 1].c >= points[0].c;
  const color = up ? '#34d399' : '#f87171';
  const gid = `pc-${currency}-${resolution}-${up ? 'u' : 'd'}`;
  return (
    <div data-testid="price-chart" data-points={points.length}>
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>{title ?? `Price (${currencySymbol(currency)}) · ${RES_LABEL[resolution]}`}</span>
        <span>Simulated · fictional</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={40} tickLine={false} axisLine={false} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(v: number) => fmt(v).replace(/^\S+ /, '')}
            width={56}
            tickLine={false}
            axisLine={false}
            label={{ value: unit ?? currencySymbol(currency), angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(_v, _n, item) => {
              const p = item.payload as ChartPoint;
              if (decimals !== undefined) return [fmt(p.c), unit ?? ''];
              return [`O ${fmt(p.o)} · H ${fmt(p.h)} · L ${fmt(p.l)} · C ${fmt(p.c)}${p.live ? ' (live)' : ''}`, ''];
            }}
          />
          <Area type="monotone" dataKey="c" stroke={color} strokeWidth={1.6} fill={`url(#${gid})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Minimal sparkline for index/FX cards. */
export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const data = values.map((v, i) => ({ i, v }));
  const color = values[values.length - 1] >= values[0] ? '#34d399' : '#f87171';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={['auto', 'auto']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.2} fill={color} fillOpacity={0.12} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
