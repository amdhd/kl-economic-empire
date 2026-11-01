import { useEffect, useMemo, useState } from 'react';
import { budgetFor } from '../../data/economic-baseline';
import { budgetLines, budgetOutlook, BUDGET_CATEGORIES, currentBudget, indexedBudget, planGrowth, yearReview } from '../../engine/year-review';
import { useGame, useGameState } from '../../store/game-store';
import type { BudgetPolicy } from '../../types/game';
import { money, pct } from '../../utils/format';
import { Section, SimTag, Stat } from '../ui';

const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const pctChange = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

/** End-of-year window (D-107): what happened in the year that just closed, then the budget for the next one. */
export function YearReviewWindow({ year }: { year: number }) {
  const g = useGameState();
  const close = useGame.getState().closeYearReview;
  const command = useGame.getState().command;
  const pausing = useGame((s) => s.pauseOnDialogs);
  const review = useMemo(() => yearReview(g, year), [g, year, g.reports.length]);
  const now = currentBudget(g);
  const base = budgetFor(g);
  const [edits, setEdits] = useState<Partial<BudgetPolicy>>({});
  const proposed = Object.fromEntries(BUDGET_CATEGORIES.map((k) => [k, edits[k] ?? now[k]])) as BudgetPolicy;
  const changed = BUDGET_CATEGORIES.filter((k) => proposed[k] !== now[k]);
  const lines = budgetLines(g, proposed);
  const outlook = budgetOutlook(g, proposed);
  const baseOutlook = budgetOutlook(g, now);
  const inflation = review?.inflationYoY ?? 0;

  // The window is a deliberate stop: it pauses the clock like any dialog, and Esc closes it.
  const dialog = useGame.getState().dialog;
  useEffect(() => {
    dialog(true);
    return () => dialog(false);
  }, [dialog]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);

  if (!review) return null;
  const f = review.fiscal;
  const queue = () => {
    const patch = Object.fromEntries(changed.map((k) => [k, proposed[k]])) as Partial<BudgetPolicy>;
    if (command({ type: 'queueBudget', patch }).ok) close();
  };
  const replacedPlans = g.controls.plans.filter((p) => changed.includes(p.category));

  return (
    <div className="pointer-events-auto fixed inset-0 z-[62] grid place-items-center bg-slate-950/60 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`${year} in review`} data-testid="year-review">
      <div className="glass flex max-h-[92vh] w-[880px] max-w-[96vw] flex-col rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-600/30 px-6 pb-3 pt-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Year end</div>
            <h2 className="mt-0.5 text-[24px] font-black tracking-tight text-white">{year} in review</h2>
            {pausing && <div className="mt-1 text-[11px] font-semibold text-amber-300">⏸ Clock paused while you review</div>}
          </div>
          <SimTag />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <Section title={`How ${year} went`}>
            <ul className="mb-3 list-disc space-y-1 pl-4 text-[13px] text-slate-200" data-testid="year-headlines">
              {review.headlines.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
              <Stat label="Real growth" value={pctChange(review.gdp.realGrowth)} tone={review.gdp.realGrowth >= 0 ? 'up' : 'down'} />
              <Stat label="GDP (US$)" value={`US$${review.gdp.usdEnd.toFixed(0)}bn`} sub={pctChange(review.gdp.usdChangePct)} tone={review.gdp.usdChangePct >= 0 ? 'up' : 'down'} />
              <Stat label="Inflation" value={pct(review.inflationYoY)} />
              <Stat label="Unemployment" value={pct(review.unemployment.end)} sub={`from ${pct(review.unemployment.start)}`} tone={review.unemployment.end <= review.unemployment.start ? 'up' : 'down'} />
              <Stat label="Approval" value={review.approval.end.toFixed(0)} sub={`${pts(review.approval.end - review.approval.start)} pts`} tone={review.approval.end >= review.approval.start ? 'up' : 'down'} />
              <Stat label="Score" value={review.score.end.toFixed(0)} sub={`${pts(review.score.end - review.score.start)} pts`} tone={review.score.end >= review.score.start ? 'up' : 'down'} />
            </div>
          </Section>

          <Section title="Government finances">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Revenue" value={money(f.revenue)} />
              <Stat label="Spending" value={money(f.outlays)} sub={`operating ${money(f.operating)} · capital ${money(f.capital)} · interest ${money(f.interest)}`} />
              <Stat label={f.deficit > 0 ? 'Deficit' : 'Surplus'} value={money(Math.abs(f.deficit))} sub={`${pct(Math.abs(f.deficitPct))} of GDP`} tone={f.deficit > 0 ? 'down' : 'up'} />
              <Stat label="Debt" value={money(f.debtEnd)} sub={`${pct(f.debtToGdp)} of GDP · was ${money(f.debtStart)}`} />
              <Stat label="Treasury" value={money(f.treasury)} />
              <Stat label="Credit rating" value={f.rating} />
              <Stat label="Sovereign fund" value={money(review.fundNav.end)} sub={`was ${money(review.fundNav.start)}`} />
            </div>
          </Section>

          {review.events.length > 0 && (
            <Section title="Notable events">
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-300">{review.events.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </Section>
          )}

          <Section title={`${year + 1} budget plan · per year · effective tomorrow`} right={<div className="flex gap-1.5">
            <button className="btn" onClick={() => setEdits({})} disabled={!changed.length} data-testid="plan-keep">Keep current plan</button>
            <button className="btn" onClick={() => setEdits(indexedBudget(g, inflation))} data-testid="plan-index" title="Replace the plans: raise every line once by last year's inflation and hold it there">Index to inflation ({pctChange(inflation)})</button>
          </div>}>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
              {lines.map((l) => {
                const k = l.category;
                const v = proposed[k] * 12;
                return (
                  <div key={k}>
                    <div className="mb-0.5 flex items-center justify-between text-[12px]">
                      <span className="text-slate-300">{l.label}</span>
                      <span className="num">
                        {proposed[k] !== now[k] && <span className="text-slate-500 line-through">{money(l.current, 'MYR', 2)}</span>} <b>{money(v, 'MYR', 2)}</b>
                      </span>
                    </div>
                    <input type="range" min={0} max={base[k] * 2.5} step={10e6} value={proposed[k]} onChange={(e) => setEdits({ ...edits, [k]: Number(e.target.value) })} aria-label={l.label} data-testid={`plan-${k}`} />
                    {planGrowth(g, k) > 0 && <div className="num text-[11px] text-cyan-200/80">{proposed[k] === now[k] ? `Plan raises this ${pct(planGrowth(g, k))} a year` : 'Replaces the plan that raised it'}</div>}
                    {l.outcome && <div className="num text-[11px] text-slate-400">Service-quality target {l.outcome.now.toFixed(0)}{proposed[k] !== now[k] && <> → <b className={l.outcome.proposed >= l.outcome.now ? 'up' : 'down'}>{l.outcome.proposed.toFixed(0)}</b></>}</div>}
                  </div>
                );
              })}
            </div>
            {outlook && baseOutlook ? (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-slate-950/40 p-3 sm:grid-cols-4" data-testid="plan-outlook">
                <Stat label="Projected revenue" value={money(outlook.revenue)} />
                <Stat label="Projected spending" value={money(outlook.outlays)} sub={`${outlook.budgetChange >= 0 ? '+' : '−'}${money(Math.abs(outlook.budgetChange))} budget change`} />
                <Stat label={outlook.deficit > 0 ? 'Projected deficit' : 'Projected surplus'} value={money(Math.abs(outlook.deficit))} sub={`${pct(Math.abs(outlook.deficitPct))} of GDP`} tone={outlook.deficit > 0 ? 'down' : 'up'} />
                <Stat label="Projected rating" value={outlook.rating} sub={outlook.rating !== baseOutlook.rating ? `${baseOutlook.rating} if unchanged` : `debt ${pct(outlook.debtToGdp)} of GDP`} tone={outlook.ratingScore >= baseOutlook.ratingScore ? 'up' : 'down'} />
              </div>
            ) : <p className="mt-3 text-[12px] text-slate-400">The fiscal outlook appears once a few months of reports exist.</p>}
            <p className="mt-2 text-[11.5px] text-slate-400">
              Estimate, not a forecast: revenue grows with last year's GDP; capital, interest and subsidies stay at last year's level. Cuts to services and transfers cost trust, and cuts to health, services and safety lower service quality over several months.
              {replacedPlans.length > 0 && <span className="text-amber-300"> Changing a line replaces its multi-year ministry plan.</span>}
            </p>
          </Section>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-600/30 px-6 py-3">
          <button className="btn" onClick={close} data-testid="year-continue">Continue without changes</button>
          <button className="btn btn-primary" disabled={!changed.length} onClick={queue} data-testid="year-queue">Queue {changed.length || ''} budget change{changed.length === 1 ? '' : 's'} &amp; continue</button>
        </div>
      </div>
    </div>
  );
}
