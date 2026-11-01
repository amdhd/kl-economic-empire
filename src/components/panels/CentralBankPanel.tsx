import { useState } from 'react';
import { BILLS_MAX_SHARE, CREDIBILITY_START, OPR_MAX, OPR_MIN, QE_MAX_SHARE, SRR_MAX, SRR_MIN } from '../../engine/central-bank';
import { formatKL, klParts, klToEpochMin } from '../../engine/time';
import { useGame, useGameState } from '../../store/game-store';
import { fullMoneyMinor, money, pct } from '../../utils/format';
import { Section, Stat } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelShell } from './PanelShell';

/** The next MPC meeting is the 1st of the next odd-numbered month (the engine's fictional schedule). */
function nextMeeting(hour: number): string {
  const p = klParts(hour * 60);
  let y = p.year, m = p.month + 1;
  while (m % 2 === 0) m += 1;
  if (m > 12) { y += 1; m = 1; }
  return formatKL(klToEpochMin(y, m, 1)).date;
}

type Action = { title: string; body: string; run: () => void } | null;

export function CentralBankPanel() {
  const g = useGameState();
  const command = useGame.getState().command;
  const cb = g.centralBank;
  const [remit, setRemit] = useState(cb.remitShare);
  const [bn, setBn] = useState(10);
  const [confirm, setConfirm] = useState<Action>(null);
  const gdp = g.indicators.nominalGdpAnnual;
  const credLabel = cb.credibility >= 80 ? 'Strong' : cb.credibility >= 50 ? 'Shaky' : 'Weak';
  const ask = (a: Action) => setConfirm(a);
  const bondRoom = QE_MAX_SHARE * gdp - cb.qeHoldings;
  const billRoom = BILLS_MAX_SHARE * g.bank.reserves;
  return (
    <PanelShell title="Central bank · BNM" subtitle="Fictional powers over Bank Negara: interest rate, bank rules, bond buying and the reserves. Simulated; not real policy. BNM bills and reserves are the central bank's own balance sheet; government bonds and debt repayment are in Money & debt, Fiscal control." width={720}>
      <div className="grid grid-cols-4 gap-3 rounded-xl bg-slate-900/40 p-3">
        <Stat label="Policy rate (OPR)" value={pct(g.external.opr, 2)} sub={`next meeting ${nextMeeting(g.clock.hour)}`} />
        <Stat label="Market trust in BNM" value={`${cb.credibility.toFixed(0)}`} sub={credLabel} tone={cb.credibility < 50 ? 'down' : undefined} />
        <Stat label="FX reserves" value={money(cb.usdReserves / 100, 'USD')} sub="foreign currency" />
        <Stat label="MYR float" value={money(cb.myrCash / 100)} sub="BNM’s own ringgit" />
      </div>

      <p className="text-[12px] text-slate-400">The policy rate (OPR) and the bank reserve rule (SRR) are set in Money & debt, Fiscal control, beside the debt costs they move.</p>

      <Section title="1 · Bond buying (QE) and selling (QT)">
        <p className="text-[12.5px] text-slate-300">BNM creates money to buy government bonds. This <b>lowers the interest the government pays</b> and eases loans, but pushes prices up and weakens the ringgit. It does not give the treasury cash. Selling bonds back does the reverse.</p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="Bonds BNM holds" value={money(cb.qeHoldings)} sub={`${pct(cb.qeHoldings / gdp, 1)} of GDP (max ${QE_MAX_SHARE * 100}%)`} />
          <Stat label="Room left to buy" value={money(Math.max(0, bondRoom))} />
          <label className="text-[12px]">RM billion per order<input className="input num mt-1 block !w-28" type="number" min="1" max="20" step="1" value={bn} onChange={(e) => setBn(Number(e.target.value))} aria-label="Bond order size" data-testid="cb-bn" /></label>
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary" disabled={!(bn > 0) || bn * 1e9 > bondRoom} data-testid="cb-buy-bonds"
            onClick={() => ask({ title: 'Buy government bonds', body: `BNM buys RM${bn}bn of government bonds with newly created money. Expect lower yields, higher prices and a weaker ringgit.`, run: () => command({ type: 'cbBonds', amountMYR: bn * 1e9 }) })}>Buy bonds</button>
          <button className="btn" disabled={!(bn > 0) || bn * 1e9 > cb.qeHoldings} data-testid="cb-sell-bonds"
            onClick={() => ask({ title: 'Sell government bonds', body: `BNM sells RM${bn}bn of bonds back to the market, removing money. Yields rise and the ringgit firms.`, run: () => command({ type: 'cbBonds', amountMYR: -bn * 1e9 }) })}>Sell bonds</button>
        </div>
      </Section>

      <Section title="2 · The FX reserves: how to grow and use them">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Foreign-currency reserves" value={fullMoneyMinor(cb.usdReserves, 'USD')} />
          <Stat label="Reserve income last month" value={money(cb.lastIncome / 100)} sub="after bill interest" />
          <Stat label="BNM bills outstanding" value={money(cb.bills / 100)} sub={`banks could lend up to ${money(billRoom)}`} />
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-slate-300">
          <li><b>Defend the ringgit:</b> sell dollars from the reserves (Trade &amp; FX panel). Reserves shrink, the ringgit firms.</li>
          <li><b>Grow the reserves:</b> buy dollars with BNM’s ringgit float. When the float runs low, <b>issue BNM bills</b> below: banks lend BNM ringgit, so the float grows. Bills cost interest at the OPR, and banks have less to lend.</li>
          <li><b>Reserves earn interest</b> every month. Keep it to build the float, or <b>send a share to the treasury</b> as extra income (below).</li>
          <li><b>Reserves cannot pay the budget directly.</b> They back the currency; only the income they earn can be shared with the treasury.</li>
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px]">Bills RM billion<input className="input num ml-2 !w-24" type="number" min="1" max="100" step="1" value={bn} onChange={(e) => setBn(Number(e.target.value))} aria-label="Bills order size" /></label>
          <button className="btn btn-primary" disabled={!(bn > 0) || bn * 1e9 > billRoom - cb.bills / 100} data-testid="cb-issue-bills"
            onClick={() => ask({ title: 'Issue BNM bills', body: `Banks lend BNM RM${bn}bn. BNM’s ringgit float grows by the same amount; banks have less to lend and BNM pays them interest at the OPR.`, run: () => command({ type: 'cbBills', amountMYR: bn * 1e9 }) })}>Issue bills</button>
          <button className="btn" disabled={!(bn > 0) || bn * 1e8 > cb.bills} data-testid="cb-redeem-bills"
            onClick={() => ask({ title: 'Redeem BNM bills', body: `BNM repays RM${bn}bn from its ringgit float. Banks get their liquidity back.`, run: () => command({ type: 'cbBills', amountMYR: -bn * 1e9 }) })}>Redeem</button>
        </div>
        <label className="mt-3 block text-[12.5px]">Share of reserve income paid to the treasury: <b>{Math.round(remit * 100)}%</b> <span className="text-slate-400">(now {Math.round(cb.remitShare * 100)}%)</span>
          <input type="range" min={0} max={1} step={0.05} value={remit} onChange={(e) => setRemit(Number(e.target.value))} aria-label="Remittance share" data-testid="cb-remit" />
        </label>
        <button className="btn btn-primary mt-1" disabled={Math.abs(remit - cb.remitShare) < 1e-9} data-testid="cb-set-remit"
          onClick={() => ask({ title: 'Reserve income to the treasury', body: `${Math.round(remit * 100)}% of each month’s net reserve income is paid to the treasury on top of BNM’s normal dividend. The rest stays in BNM’s float to buy dollars.`, run: () => command({ type: 'cbPolicy', remitShare: remit }) })}>Apply</button>
      </Section>

      <Section title="Past rate meetings">
        {cb.mpc.length === 0 ? <p className="text-[12px] text-slate-400">No meetings yet. The first is {nextMeeting(g.clock.hour)}.</p> : (
          <table className="w-full text-right text-[12px]"><thead><tr className="text-slate-400"><th className="text-left">Date</th><th>Before</th><th>After</th><th>Rule wanted</th></tr></thead>
            <tbody>{[...cb.mpc].reverse().slice(0, 8).map((m, i) => <tr key={i}><td className="text-left">{formatKL(m.day * 1440).date}</td><td>{pct(m.from, 2)}</td><td>{pct(m.to, 2)}</td><td>{pct(m.rule, 2)}</td></tr>)}</tbody></table>
        )}
      </Section>
      {confirm && <ConfirmDialog title={confirm.title} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { confirm.run(); setConfirm(null); }}><p>{confirm.body}</p></ConfirmDialog>}
    </PanelShell>
  );
}

/** Policy rate and bank reserve rule. Shown in the Fiscal control tab (D-115). */
export function PolicyRateSections() {
  const g = useGameState();
  const command = useGame.getState().command;
  const cb = g.centralBank;
  const [target, setTarget] = useState(cb.targetOpr);
  const [srr, setSrr] = useState(cb.srr);
  const [confirm, setConfirm] = useState<Action>(null);
  const lastMpc = cb.mpc.at(-1);
  const rateDirection = target > cb.targetOpr ? 'raise' : 'cut';
  const ask = (a: Action) => setConfirm(a);
  return <>
      <Section title="Interest rate (OPR)">
        <p className="text-[12.5px] text-slate-300">
          The rate banks pay to borrow. <b>Raise</b> it to fight rising prices and support the ringgit; loans get more expensive and growth slows.
          <b> Cut</b> it to boost loans and jobs; prices may rise and the ringgit may weaken. BNM meets every two months and moves at most 0.50% per meeting, in 0.25% steps.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
          <button className={`btn ${cb.mode === 'auto' ? 'btn-primary' : ''}`} onClick={() => command({ type: 'cbPolicy', mode: 'auto' })} data-testid="cb-mode-auto">Automatic (BNM decides)</button>
          <button className={`btn ${cb.mode === 'manual' ? 'btn-primary' : ''}`} onClick={() => command({ type: 'cbPolicy', mode: 'manual' })} data-testid="cb-mode-manual">I set the rate</button>
        </div>
        {cb.mode === 'manual' ? (
          <div className="mt-2">
            <label className="block text-[12.5px]">Rate I want: <b>{pct(target, 2)}</b> <span className="text-slate-400">(now {pct(g.external.opr, 2)}, target in force {pct(cb.targetOpr, 2)})</span>
              <input type="range" min={OPR_MIN} max={OPR_MAX} step={0.0025} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target OPR" data-testid="cb-target" />
            </label>
            <button className="btn btn-primary mt-1" disabled={Math.abs(target - cb.targetOpr) < 1e-9} data-testid="cb-set-target"
              onClick={() => ask({ title: 'Set rate target', body: `BNM will ${rateDirection} the OPR towards ${pct(target, 2)} at its next meetings, starting ${nextMeeting(g.clock.hour)}. Moving far from what inflation and demand call for costs the market’s trust.`, run: () => command({ type: 'cbPolicy', targetOpr: target }) })}>Set target</button>
          </div>
        ) : <p className="mt-2 text-[12px] text-slate-400">BNM follows inflation and demand on its own. Switch to “I set the rate” to take control.</p>}
        <p className="mt-2 text-[12px] text-slate-400">
          Trust is {cb.credibility.toFixed(0)}/100 (healthy is {CREDIBILITY_START}+). Setting rates far from what inflation and demand call for lowers it, which raises prices, lifts bond yields and weakens the ringgit. It rebuilds when BNM runs on automatic.
          {lastMpc && ` Last meeting: ${pct(lastMpc.from, 2)} → ${pct(lastMpc.to, 2)} (the automatic rule wanted ${pct(lastMpc.rule, 2)}).`}
        </p>
      </Section>

      <Section title="Bank reserve rule (SRR)">
        <p className="text-[12.5px] text-slate-300">The share of deposits banks must lock away at BNM. <b>Higher</b> = banks lend less and loans cost more (cools the economy). <b>Lower</b> = more lending.</p>
        <label className="mt-2 block text-[12.5px]">Requirement: <b>{pct(srr, 1)}</b> <span className="text-slate-400">(now {pct(cb.srr, 1)})</span>
          <input type="range" min={SRR_MIN} max={SRR_MAX} step={0.005} value={srr} onChange={(e) => setSrr(Number(e.target.value))} aria-label="Reserve requirement" data-testid="cb-srr" />
        </label>
        <button className="btn btn-primary mt-1" disabled={Math.abs(srr - cb.srr) < 1e-9} data-testid="cb-set-srr"
          onClick={() => ask({ title: 'Change bank reserve rule', body: `Banks must hold ${pct(srr, 1)} of deposits at BNM (now ${pct(cb.srr, 1)}). Loan rates and lending change at the next month close.`, run: () => command({ type: 'cbPolicy', srr }) })}>Apply</button>
      </Section>

    {confirm && <ConfirmDialog title={confirm.title} confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={() => { confirm.run(); setConfirm(null); }}><p>{confirm.body}</p></ConfirmDialog>}
  </>;
}
