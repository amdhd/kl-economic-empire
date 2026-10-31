import { CompanyLogo } from '../CompanyLogo';
import { useState } from 'react';
import { COMPANY_BY_ID } from '../../data/companies';
import { SECTORS } from '../../data/economic-baseline';
import { EXCHANGES } from '../../engine/market-calendar';
import { exchangeStatus, priceSeries, securityRow, type Resolution } from '../../engine/market-view';
import { fundamentalValue } from '../../engine/stock-market';
import { LOCATION_TYPE_LABEL } from '../../map/company-markers';
import type { GameState, TickerId } from '../../types/game';
import { money, num, pct, sharePrice } from '../../utils/format';
import { PriceChart } from './PriceChart';

const RESOLUTIONS: { id: Resolution; label: string }[] = [
  { id: 'hour', label: 'Hour' },
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
];

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-rose-300' : 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

/** Detail panel for one security: quote, chart (hour/day/month), fictional financials, exposure, KL location. */
export function SecurityDetail({ game, id, nowMin }: { game: GameState; id: TickerId; nowMin: number }) {
  const [res, setRes] = useState<Resolution>('day');
  const c = COMPANY_BY_ID[id];
  const r = securityRow(game, c);
  const st = game.companies[id];
  const cur = r.currency;
  const status = exchangeStatus(c.exchange, Math.floor(nowMin));
  const last12 = st.history.slice(-12);
  const ttmRev = last12.reduce((a, h) => a + h.revenue, 0);
  const ttmNi = last12.reduce((a, h) => a + h.netIncome, 0);
  const ttmEbitda = last12.reduce((a, h) => a + h.ebitda, 0);
  const lastM = st.history[st.history.length - 1];
  const tone = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : undefined);

  return (
    <section data-testid="security-detail" data-ticker={id} className="flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{id}</span>
            <span className={`text-[11px] ${status.open ? 'text-emerald-300' : 'text-slate-400'}`}>
              {EXCHANGES[c.exchange].name} · {status.label} · {status.nextChangeLabel}
            </span>
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white"><CompanyLogo id={id} size={28} />{c.displayName}</h2>
          <div className="text-xs text-slate-400">
            {c.legalName} · {c.industry} · listed in {cur}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-white" data-testid="detail-price">
            {sharePrice(r.price, cur)}
          </div>
          <div className={`text-sm tabular-nums ${r.dayChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(r.dayChange, 2, true)} today</div>
          {cur === 'USD' && <div className="text-[11px] text-slate-500">≈ {sharePrice(r.price * game.external.myrPerUsd, 'MYR')} at fictional FX</div>}
        </div>
      </header>

      <div>
        <div className="mb-2 flex gap-1" role="tablist" aria-label="Chart resolution">
          {RESOLUTIONS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={res === x.id}
              onClick={() => setRes(x.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${res === x.id ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <PriceChart points={priceSeries(game, id, res)} currency={cur} resolution={res} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Day range" value={`${sharePrice(game.market.quotes[id].dayLow, cur)} – ${sharePrice(game.market.quotes[id].dayHigh, cur)}`} />
        <Stat label="1M change" value={pct(r.monthChange, 1, true)} tone={tone(r.monthChange)} />
        <Stat label="Market cap" value={money(r.marketCap, cur)} />
        <Stat label="P/E (TTM)" value={Number.isFinite(r.pe) ? num(r.pe, 1) : 'n/m'} />
        <Stat label="Dividend yield" value={pct(r.dividendYield, 2)} />
        <Stat label="Shares out" value={`${num(st.shares / 1e9, 2)}bn`} />
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fictional financials ({cur}, simulated)</h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Revenue · 12m" value={money(ttmRev, cur)} />
          <Stat label="EBITDA margin" value={pct(ttmRev ? ttmEbitda / ttmRev : 0, 1)} />
          <Stat label="Net income · 12m" value={money(ttmNi, cur)} tone={tone(ttmNi)} />
          <Stat label="Last month revenue" value={lastM ? money(lastM.revenue, cur) : '—'} />
          <Stat label="Last month net income" value={lastM ? money(lastM.netIncome, cur) : '—'} tone={lastM ? tone(lastM.netIncome) : undefined} />
          <Stat label="Domestic tax · last month" value={lastM ? money(lastM.taxKL, cur) : '—'} />
          <Stat label="Cash" value={money(st.cash, cur)} />
          <Stat label="Debt" value={money(st.debt, cur)} />
          <Stat label="Net margin · 12m" value={pct(ttmRev ? ttmNi / ttmRev : 0, 1)} />
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Valuation drivers (fictional model)</h3>
        <div className="grid grid-cols-3 gap-2" data-testid="valuation-drivers">
          <Stat label="Model value" value={sharePrice(fundamentalValue(game, id), cur)} />
          <Stat label={c.exchange === 'MY' ? 'MGS10 benchmark' : 'UST10 benchmark'} value={pct(c.exchange === 'MY' ? game.external.mgs10 : game.external.ust10, 2)} />
          <Stat label="Rate sensitivity" value={num(c.rateSensitivity, 1)} />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Earnings, the external benchmark rate, risk appetite and company sentiment drive model value. Higher rates reduce value; higher sensitivity increases the effect. Traded prices adjust during open sessions.</p>
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Revenue exposure (model)</h3>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/5" title="Share of revenue driven by KL / rest of Malaysia / global demand">
          <div className="bg-emerald-400" style={{ width: `${c.exposure.kl * 100}%` }} />
          <div className="bg-sky-400" style={{ width: `${c.exposure.my * 100}%` }} />
          <div className="bg-violet-400" style={{ width: `${c.exposure.global * 100}%` }} />
        </div>
        <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
          <span>
            <i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
            KL {pct(c.exposure.kl, 1)}
          </span>
          <span>
            <i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />
            Rest of MY {pct(c.exposure.my, 1)}
          </span>
          <span>
            <i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-400" />
            Global {pct(c.exposure.global, 1)}
          </span>
          <span className="ml-auto">KL sector: {SECTORS[c.sector].short}</span>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 px-3 py-2 text-xs" data-testid="kl-location">
        {c.geo ? (
          <>
            <div className="text-slate-200">
              {LOCATION_TYPE_LABEL[c.geo.locationType]}: {c.geo.label}
            </div>
            <div className="text-[11px] text-slate-500">Source: {c.geo.verificationSource}</div>
          </>
        ) : (
          <div className="text-slate-400">No verified Kuala Lumpur location — not shown on the map. Still tradable in the market.</div>
        )}
      </div>
    </section>
  );
}
