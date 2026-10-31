import { useState } from 'react';
import {
  CONCESSION_IDS, CONCESSIONS, DEAL_ACCESS_GAIN, DEAL_TALK_DAYS, EXPORT_PRODUCT_IDS, EXPORT_PRODUCTS, GOODS_EXPORTS_2025, GOODS_IMPORTS_2025,
  IMPORT_CATEGORIES, IMPORT_CATEGORY_IDS, PARTNER_TRADE_2025, PROGRAMME_IDS, PROGRAMMES, SERVICES_EXPORTS_2025,
  type ConcessionId, type ExportProductId, type ProgrammeId,
} from '../../data/trade';
import { PARTNER_IDS, PARTNERS } from '../../data/world';
import type { Command } from '../../engine/game';
import { monthKeyLabel } from '../../engine/time';
import { offerValue, policyGains, requiredDepth, tradeRunRate } from '../../engine/trade-book';
import { useGame, useGameState } from '../../store/game-store';
import type { PartnerId, TradeMonth } from '../../types/game';
import { bnTick, money, pct } from '../../utils/format';
import { StackedBars } from '../charts/StackedBars';
import { TimeChart } from '../charts/TimeChart';
import { Bar, Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

type Tab = 'overview' | 'products' | 'deals' | 'promotion';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'products', label: 'Products' }, { id: 'deals', label: 'Trade deals' }, { id: 'promotion', label: 'Export promotion' },
];
/** Chart groups in fixed categorical order (validated for the dark panel surface). */
const GROUPS: { key: string; name: string; color: string; ids: ExportProductId[] }[] = [
  { key: 'ee', name: 'E&E', color: '#3987e5', ids: ['ee'] },
  { key: 'resources', name: 'Oil, gas & palm', color: '#d95926', ids: ['petroleum', 'lng', 'mining', 'palm'] },
  { key: 'services', name: 'Services', color: '#199e70', ids: EXPORT_PRODUCT_IDS.filter((id) => EXPORT_PRODUCTS[id].group === 'services') },
  { key: 'machinery', name: 'Machinery & equipment', color: '#c98500', ids: ['machinery'] },
  { key: 'chemMetals', name: 'Chemicals & steel', color: '#d55181', ids: ['chemicals', 'metals'] },
  { key: 'other', name: 'Food & other goods', color: '#008300', ids: ['food', 'otherGoods'] },
];
const bn = (v: number) => `RM${(v / 1e9).toFixed(v >= 100e9 ? 0 : 1)}bn`;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, v) => a + v, 0);
const annual = (m: TradeMonth, v: number) => (v * 365) / Math.max(1, m.days);
const NEGOTIABLE = EXPORT_PRODUCT_IDS.filter((id) => !EXPORT_PRODUCTS[id].commodity);
const DEAL_PARTNERS = PARTNER_IDS.filter((k) => k !== 'ROW');

export function TradeMinistryPanel() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('overview');
  if (!g.tradeBook?.enabled) {
    return <PanelShell title="Trade ministry" subtitle="Exports, imports, deals and promotion">
      <p className="text-[12px] text-amber-200">The trade ministry is modelled in new Malaysia campaigns. This save keeps its original calibration.</p>
    </PanelShell>;
  }
  return <PanelShell title="Trade ministry" subtitle="Malaysia's exports and imports · official 2025 opening levels, simulated since" width={800}>
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Trade ministry views">
      {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} data-testid={`ministry-tab-${t.id}`} onClick={() => setTab(t.id)}
        className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${tab === t.id ? 'bg-slate-600/80 text-white' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}>{t.label}</button>)}
    </div>
    {tab === 'overview' && <Overview />}
    {tab === 'products' && <Products />}
    {tab === 'deals' && <Deals />}
    {tab === 'promotion' && <Promotion />}
  </PanelShell>;
}

function Overview() {
  const g = useGameState(), tb = g.tradeBook, r = tradeRunRate(g);
  const exports = r.goodsExports + r.servicesExports, imports = r.goodsImports + r.servicesImports;
  const last = tb.history.at(-1);
  const months = tb.history.slice(-24);
  const lines = months.map((m) => ({ t: monthKeyLabel(m.monthKey), exports: sum(m.exports) / 1e9, imports: sum(m.imports) / 1e9 }));
  const bars = months.map((m) => Object.fromEntries([['t', monthKeyLabel(m.monthKey).slice(0, 3)], ...GROUPS.map((gr) => [gr.key, gr.ids.reduce((a, id) => a + m.exports[id], 0) / 1e9])]));
  const partners = last ? last.partners : tb.day.partners;
  const partnerTotal = sum(partners);
  return <>
    <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3" data-testid="ministry-headline">
      <Stat label="Exports · annual rate" value={money(exports, 'MYR', 2)} sub={`services ${money(r.servicesExports, 'MYR', 0)}`} />
      <Stat label="Imports · annual rate" value={money(imports, 'MYR', 2)} sub={`services ${money(r.servicesImports, 'MYR', 0)}`} />
      <Stat label="Trade balance" value={money(r.balance)} tone={r.balance >= 0 ? 'up' : 'down'} sub={pct(r.balance / Math.max(1, g.indicators.nominalGdpAnnual)) + ' of GDP'} />
      <Stat label="Total trade" value={money(exports + imports, 'MYR', 2)} sub={`${pct((exports + imports) / Math.max(1, g.indicators.nominalGdpAnnual), 0)} of GDP`} />
    </div>
    <p className="text-[11.5px] text-slate-400">{last ? `Run rate from ${monthKeyLabel(last.monthKey)}, annualised.` : 'Run rate from the last settled day until the first month closes on 1 February.'} Official 2025 reference: goods exports {money(GOODS_EXPORTS_2025, 'MYR', 3)}, goods imports {money(GOODS_IMPORTS_2025, 'MYR', 3)}, services exports {money(SERVICES_EXPORTS_2025)} (MITI, DOSM). The campaign opens at these levels scaled to 2027 GDP; later values are simulations.</p>
    <Section title="Monthly exports and imports">
      <TimeChart data={lines} xKey="t" series={[{ key: 'exports', name: 'Exports', color: '#3987e5' }, { key: 'imports', name: 'Imports', color: '#d95926' }]} yFormat={bnTick} unit="RM bn per month" height={160} />
    </Section>
    <Section title="What Malaysia sells">
      <StackedBars data={bars} xKey="t" series={GROUPS.map((gr) => ({ key: gr.key, name: gr.name, color: gr.color }))} yFormat={bnTick} unit="Exports, RM bn per month" />
    </Section>
    <Section title={`Goods exports by market${last ? ` · ${monthKeyLabel(last.monthKey)}` : ''}`}>
      <table className="w-full text-[12px]" data-testid="ministry-partners">
        <thead><tr className="text-left text-slate-400"><th>Market</th><th className="text-right">Annual rate</th><th className="w-1/3 px-2">Share</th><th className="text-right">2025 official</th></tr></thead>
        <tbody>{[...PARTNER_IDS].sort((a, b) => partners[b] - partners[a]).map((k) => <tr key={k}>
          <td className="py-0.5 font-semibold">{PARTNERS[k].name}</td>
          <td className="num text-right">{bn(last ? annual(last, partners[k]) : partners[k] * 365)}</td>
          <td className="px-2"><Bar value={partners[k]} max={partnerTotal * 0.32} color="#3987e5" /></td>
          <td className="num text-right text-slate-400">{bn(PARTNER_TRADE_2025[k].exports)}</td>
        </tr>)}</tbody>
      </table>
    </Section>
    <Section title={`Imports by use${last ? ` · ${monthKeyLabel(last.monthKey)}` : ''}`}>
      <table className="w-full text-[12px]">
        <tbody>{IMPORT_CATEGORY_IDS.map((c) => {
          const v = last ? annual(last, last.imports[c]) : tb.day.imports[c] * 365;
          return <tr key={c}><td className="py-0.5">{IMPORT_CATEGORIES[c].label}</td><td className="num pl-4 text-right">{bn(v)}</td><td className="num w-32 pl-4 text-right text-slate-400">2025: {bn(IMPORT_CATEGORIES[c].value2025)}</td></tr>;
        })}</tbody>
      </table>
    </Section>
  </>;
}

function Products() {
  const g = useGameState(), tb = g.tradeBook, last = tb.history.at(-1);
  const gains = policyGains(g);
  const levers = (id: ExportProductId) => [
    ...PROGRAMME_IDS.filter((p) => PROGRAMMES[p].products[id]).map((p) => PROGRAMMES[p].label),
    ...(EXPORT_PRODUCTS[id].commodity ? ['world prices and production; buyer contracts can lock the price'] : ['product trade deals']),
  ].join(' · ');
  return <>
    <p className="text-[12px] text-slate-400">Each line moves with its own drivers: chip demand for E&E, world prices for oil, gas, palm and steel, visitors for tourism, the ringgit and partner access for most goods. Policy gains are extra exports won by your programmes and deals; only their domestic content adds to GDP.</p>
    <table className="w-full text-[12px]" data-testid="ministry-products">
      <thead><tr className="text-left text-slate-400 [&>th:not(:first-child)]:pl-4 [&>th:not(:first-child)]:text-right"><th>Product</th><th>Annual rate</th><th>Share</th><th>vs 2025</th><th>Policy gain</th><th>Local content</th></tr></thead>
      <tbody>{EXPORT_PRODUCT_IDS.map((id) => {
        const p = EXPORT_PRODUCTS[id];
        const v = last ? annual(last, last.exports[id]) : tb.day.exports[id] * 365;
        const total = last ? annual(last, sum(last.exports)) : sum(tb.day.exports) * 365;
        const gain = gains.promotion[id] + gains.deals[id];
        return <tr key={id} className="align-top [&>td:not(:first-child)]:pl-4" title={`How to grow: ${levers(id)}. Source: ${p.source}.`}>
          <td className="py-1"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.label}<div className="text-[10.5px] text-slate-500">{p.group === 'services' ? 'Service' : 'Goods'} · grow via {levers(id)}</div></td>
          <td className="num text-right">{bn(v)}</td>
          <td className="num text-right">{pct(v / Math.max(1, total))}</td>
          <td className={`num text-right ${v >= p.value2025 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(v / p.value2025 - 1, 1, true)}</td>
          <td className={`num text-right ${gain > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>{gain > 0 ? pct(gain, 1, true) : '—'}</td>
          <td className="num text-right text-slate-400">{pct(p.domesticContent, 0)}</td>
        </tr>;
      })}</tbody>
    </table>
  </>;
}

function Deals() {
  const g = useGameState(), tb = g.tradeBook, command = useGame.getState().command, setPanel = useGame.getState().setPanel;
  const [partner, setPartner] = useState<PartnerId>('US');
  const [product, setProduct] = useState<ExportProductId>('ee');
  const [ask, setAsk] = useState<1 | 2>(1);
  const [offers, setOffers] = useState<Record<number, { concession: ConcessionId; give: 0 | 1 | 2 }>>({});
  const [review, setReview] = useState<{ cmd: Command; title: string; body: string } | null>(null);
  const today = g.scheduler.lastDay;
  const slice = EXPORT_PRODUCTS[product].value2025 * PARTNER_TRADE_2025[partner].exports / GOODS_EXPORTS_2025;
  const need = requiredDepth(g, partner, ask);
  const rel = g.world.partners[partner].relations;
  const open = tb.deals.filter((d) => ['draft', 'talks', 'inForce'].includes(d.status));
  const closed = tb.deals.filter((d) => !['draft', 'talks', 'inForce'].includes(d.status)).slice(-5);
  return <>
    <Section title="Propose a product deal">
      <div className="flex flex-wrap items-end gap-3 text-[12px]">
        <label>Partner<select className="input mt-1 block" value={partner} onChange={(e) => setPartner(e.target.value as PartnerId)} data-testid="deal-partner">{DEAL_PARTNERS.map((k) => <option key={k} value={k}>{PARTNERS[k].name}</option>)}</select></label>
        <label>Product chapter<select className="input mt-1 block" value={product} onChange={(e) => setProduct(e.target.value as ExportProductId)} data-testid="deal-product">{NEGOTIABLE.map((id) => <option key={id} value={id}>{EXPORT_PRODUCTS[id].label}</option>)}</select></label>
        <label>We ask for<select className="input mt-1 block" value={ask} onChange={(e) => setAsk(Number(e.target.value) as 1 | 2)} data-testid="deal-ask"><option value={1}>Tariff chapter (+{pct(DEAL_ACCESS_GAIN[1], 0)})</option><option value={2}>Deep chapter (+{pct(DEAL_ACCESS_GAIN[2], 0)})</option></select></label>
        <button className="btn btn-primary" data-testid="deal-propose" onClick={() => command({ type: 'tradeDeal', action: 'propose', partner, product, ask })}>Open draft</button>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Roughly {bn(slice)} a year of {EXPORT_PRODUCTS[product].short} goes to {PARTNERS[partner].name}; this chapter could add up to {bn(slice * DEAL_ACCESS_GAIN[ask])} a year once it phases in (about six months after talks of {Math.round(DEAL_TALK_DAYS[ask] / 30)} months). Relations {rel.toFixed(0)}/100: {PARTNERS[partner].name} will want a concession worth about {need.toFixed(1)}{need > 2 ? ' (more than any offer: improve relations first)' : ''}. Commodities sell at world prices and are not negotiable; for those, use buyer contracts.</p>
    </Section>
    <Section title="Open deals">
      {open.length === 0 && <p className="text-[12px] text-slate-400">No deals open yet.</p>}
      <div className="space-y-2">{open.map((d) => {
        const o = offers[d.id] ?? { concession: d.wanted.concession, give: d.wanted.give };
        const value = offerValue(d.partner, o.concession, o.give), required = requiredDepth(g, d.partner, d.ask);
        return <div key={d.id} className="rounded-lg bg-slate-800/50 p-2.5 text-[12px]" data-testid={`trade-deal-${d.id}`}>
          <div className="flex items-center justify-between gap-2"><b>{PARTNERS[d.partner].name} · {EXPORT_PRODUCTS[d.product].label} · {d.ask === 2 ? 'deep' : 'tariff'} chapter</b>
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold uppercase text-cyan-200">{d.status === 'talks' ? `talks · ${Math.max(0, (d.concludeDay ?? today) - today)}d` : d.status === 'inForce' ? 'in force' : 'draft'}</span></div>
          <p className="mt-1 text-slate-300">{d.note}</p>
          {d.status === 'draft' && <div className="mt-2 flex flex-wrap items-end gap-2">
            <label>Market we open<select className="input mt-1 block" value={o.concession} onChange={(e) => setOffers({ ...offers, [d.id]: { ...o, concession: e.target.value as ConcessionId } })} data-testid={`deal-concession-${d.id}`}>{CONCESSION_IDS.map((c) => <option key={c} value={c}>{CONCESSIONS[c].label}</option>)}</select></label>
            <label>Depth<select className="input mt-1 block" value={o.give} onChange={(e) => setOffers({ ...offers, [d.id]: { ...o, give: Number(e.target.value) as 0 | 1 | 2 } })} data-testid={`deal-give-${d.id}`}><option value={0}>Nothing</option><option value={1}>Tariff cuts</option><option value={2}>Tariffs + rules</option></select></label>
            <button className="btn" disabled={d.rounds >= 3} onClick={() => command({ type: 'tradeDeal', action: 'offer', id: d.id, ...o })} data-testid={`deal-offer-${d.id}`}>Make offer ({3 - d.rounds} left)</button>
            <button className="btn btn-primary" disabled={value + 1e-9 < required} onClick={() => setReview({ cmd: { type: 'tradeDeal', action: 'sign', id: d.id, ...o }, title: 'Sign and open formal talks', body: `Open formal talks with ${PARTNERS[d.partner].name}. Malaysia opens ${CONCESSIONS[o.concession].label.toLowerCase()} at depth ${o.give}: ${CONCESSIONS[o.concession].plain} Talks take about ${Math.round(DEAL_TALK_DAYS[d.ask] / 30)} months and collapse if a tariff dispute starts.` })} data-testid={`deal-sign-${d.id}`}>Sign</button>
            <span className={value + 1e-9 >= required ? 'text-emerald-300' : 'text-amber-200'}>Offer worth {value.toFixed(1)} of {required.toFixed(1)} needed</span>
          </div>}
          {d.status !== 'draft' && <p className="mt-1 text-slate-400">We open: {CONCESSIONS[d.concession].label} (depth {d.give}).</p>}
          <button className="btn mt-2" onClick={() => setReview({ cmd: { type: 'tradeDeal', action: 'withdraw', id: d.id }, title: 'Withdraw from this deal', body: d.status === 'inForce' ? 'Withdrawing a deal in force ends the market access at once and costs 15 points of relations.' : d.status === 'talks' ? 'Leaving talks costs 5 points of relations.' : 'Drop this draft.' })} data-testid={`deal-withdraw-${d.id}`}>Withdraw</button>
        </div>;
      })}</div>
      {closed.length > 0 && <div className="mt-2 space-y-0.5 text-[11.5px] text-slate-500">{closed.map((d) => <div key={d.id}>{PARTNERS[d.partner].name} · {EXPORT_PRODUCTS[d.product].short}: {d.status}</div>)}</div>}
    </Section>
    <Section title="Buyer contracts">
      <p className="text-[12px] text-slate-400">Long-term sales contracts with fictional foreign buyers (LNG, chips, steel, halal food, palm oil) are signed in the Deal Room. They need a 2% performance bond, add half their volume as new exports, and charge penalties if a sector is too stretched to deliver.</p>
      <button className="btn mt-2" onClick={() => setPanel('deals')} data-testid="ministry-open-deals">Open the Deal Room</button>
    </Section>
    {review && <ConfirmDialog title={review.title} confirmLabel="Confirm" onCancel={() => setReview(null)} onConfirm={() => { command(review.cmd); setReview(null); }}><p>{review.body}</p></ConfirmDialog>}
  </>;
}

function Promotion() {
  const g = useGameState(), tb = g.tradeBook, command = useGame.getState().command;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [review, setReview] = useState<{ id: ProgrammeId; budget: number } | null>(null);
  const totalBudget = PROGRAMME_IDS.reduce((a, id) => a + (tb.programmes[id].next?.budget ?? tb.programmes[id].budget), 0);
  const last = tb.history.at(-1);
  return <>
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-900/40 p-3">
      <Stat label="Programme budgets" value={`${money(totalBudget)}/yr`} />
      <Stat label="Paid last month" value={money(last?.promotion ?? 0)} />
      <Stat label="Exports won by policy" value={last ? `${money(annual(last, last.policyExports))}/yr` : '—'} sub="programmes, deals and contracts" />
    </div>
    <p className="text-[12px] text-slate-400">Budgets start tomorrow and are paid from treasury cash as export support. Promotion builds over about five months and fades the same way when cut; returns diminish as budgets grow.</p>
    <div className="space-y-2">{PROGRAMME_IDS.map((id) => {
      const spec = PROGRAMMES[id], pr = tb.programmes[id];
      const current = pr.next?.budget ?? pr.budget, value = draft[id] ?? current / 1e9;
      return <div key={id} className="rounded-lg bg-slate-800/50 p-2.5 text-[12px]" data-testid={`programme-${id}`}>
        <div className="flex items-center justify-between gap-2"><b>{spec.label}</b><span className="text-slate-400">{money(pr.budget)}/yr in force{pr.next ? ` → ${money(pr.next.budget)} from tomorrow` : ''}</span></div>
        <p className="text-slate-400">{spec.plain} Lifts: {Object.entries(spec.products).map(([p, max]) => `${EXPORT_PRODUCTS[p as ExportProductId].short} up to +${pct(max as number, 0)}`).join(', ')}.</p>
        <div className="mt-1 flex items-center gap-3">
          <input type="range" min={0} max={spec.maxBudget / 1e9} step={0.1} value={value} onChange={(e) => setDraft({ ...draft, [id]: Number(e.target.value) })} aria-label={`${spec.label} budget`} data-testid={`programme-budget-${id}`} />
          <span className="num w-24">RM{value.toFixed(1)}bn/yr</span>
          <button className="btn btn-primary" disabled={Math.abs(value * 1e9 - current) < 1e6} onClick={() => setReview({ id, budget: value * 1e9 })} data-testid={`programme-set-${id}`}>Set budget</button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400"><span className="w-28">Built up {pct(pr.boost, 0)}</span><Bar value={pr.boost} max={1} color="#199e70" /></div>
      </div>;
    })}</div>
    {review && <ConfirmDialog title="Set programme budget" confirmLabel="Set budget" onCancel={() => setReview(null)} onConfirm={() => { command({ type: 'exportProgramme', programme: review.id, budgetAnnual: review.budget }); setReview(null); }}>
      <p>{PROGRAMMES[review.id].label}: {money(review.budget)} a year from tomorrow, paid daily from treasury cash. Gains build over about five months.</p>
    </ConfirmDialog>}
  </>;
}
