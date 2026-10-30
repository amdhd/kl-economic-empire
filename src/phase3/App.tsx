import { useEffect, useRef, useState } from 'react';
import { COMPANIES, COMPANY_BY_ID, currencyOf } from '../data/companies';
import { advance, applyCommand, createGame, type Command } from '../engine/game';
import { displayMinutes } from '../engine/clock';
import { isOpen } from '../engine/market-calendar';
import { FX_SPREAD, LOT, navMYR, quoteFill, validateOrder } from '../engine/sovereign-fund';
import { deserialize, serialize } from '../persistence/save';
import type { Currency, GameState, TickerId } from '../types/game';
import './phase3.css';

const money = (value: number, currency: Currency = 'MYR') =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const date = (minute: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(minute * 60_000));
const SLOT = 'kl-phase3-save';

function NavChart({ game }: { game: GameState }) {
  const points = game.fund.navHistory.map((p) => ({ t: p.t * 1440 - 480, nav: p.nav / 100 }));
  points.push({ t: displayMinutes(game.clock), nav: navMYR(game) });
  const low = Math.min(...points.map((p) => p.nav));
  const high = Math.max(...points.map((p) => p.nav));
  const x = (i: number) => 10 + (i / Math.max(1, points.length - 1)) * 680;
  const y = (v: number) => 105 - ((v - low) / Math.max(1, high - low)) * 80;
  return (
    <div className="chart">
      <div className="section-label">FUND VALUE · MYR · DAILY MARKS</div>
      <svg viewBox="0 0 700 125" role="img" aria-label="Actual fund NAV history in MYR">
        <path d="M10 105H690" stroke="#34434d" />
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.nav)}`).join(' ')}
          fill="none"
          stroke="#9ee6c3"
          strokeWidth="2"
        />
        <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.nav)} r="3" fill="#9ee6c3" />
      </svg>
      <div className="chart-axis">
        <span>
          {money(low)} – {money(high)}
        </span>
        <span>
          {date(points[0].t)} → {date(points.at(-1)!.t)} MYT
        </span>
      </div>
      {points.length === 1 && <p>Daily history begins when the first game day settles.</p>}
    </div>
  );
}

/** Integrates with Phase 1 by passing its game snapshot and command dispatcher. */
export function FundConsole({
  game: s,
  onCommand,
  onReview,
}: {
  game: GameState;
  onCommand: (cmd: Command) => void;
  onReview: () => void;
}) {
  const [tab, setTab] = useState('Fund');
  const [ticker, setTicker] = useState<TickerId>('MY:1155');
  const [units, setUnits] = useState('100');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [review, setReview] = useState(false);
  const [from, setFrom] = useState<Currency>('MYR');
  const [fxAmount, setFxAmount] = useState('1000000');
  const [transfer, setTransfer] = useState('1000000');
  const [reportIndex, setReportIndex] = useState(-1);
  const c = COMPANY_BY_ID[ticker];
  const quantity = Number(units);
  const validQty = Number.isSafeInteger(quantity) && quantity > 0;
  const q = validQty ? quoteFill(s, ticker, side, quantity) : null;
  const reason = validateOrder(s, ticker, side, quantity);
  const open = isOpen(c.exchange, displayMinutes(s.clock));
  const fx = s.external.myrPerUsd;
  const fxMinor = Math.round(Number(fxAmount) * 100);
  const fxReceive =
    from === 'MYR'
      ? Math.floor(fxMinor / (fx * (1 + FX_SPREAD)))
      : Math.floor(fxMinor * fx * (1 - FX_SPREAD));
  const report = s.reports[reportIndex < 0 ? s.reports.length - 1 : reportIndex];
  const last = s.companies[ticker].history.at(-1)!;
  const currency = currencyOf(ticker);
  return (
    <>
      <nav aria-label="Financial panels">
        {['Fund', 'Treasury', 'Statements', 'Reports'].map((t) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="console-grid">
        <section className="panel primary">
          {tab === 'Fund' && (
            <>
              <div className="section-label">SOVEREIGN WEALTH FUND / 01</div>
              <h1>Capital with a purpose.</h1>
              <p>One public portfolio. Every ringgit accounted for.</p>
              <div className="metrics">
                <article>
                  <small>NET ASSET VALUE · MYR</small>
                  <strong>{money(navMYR(s))}</strong>
                </article>
                <article>
                  <small>AVAILABLE MYR</small>
                  <strong>{money(s.fund.myrCash / 100)}</strong>
                </article>
                <article>
                  <small>AVAILABLE USD</small>
                  <strong>{money(s.fund.usdCash / 100, 'USD')}</strong>
                </article>
              </div>
              <NavChart game={s} />
              <h2>Holdings</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Security</th>
                      <th>Shares</th>
                      <th>Market value · MYR</th>
                      <th>Unrealized · local</th>
                      <th>Unrealized · MYR / FX included</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(s.fund.positions).map(([id, p]) => {
                      if (!p) return null;
                      const key = id as TickerId;
                      const cur = currencyOf(key);
                      const value = p.units * s.market.quotes[key].price;
                      const myr = value * (cur === 'USD' ? fx : 1);
                      return (
                        <tr key={id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => {
                                setTicker(key);
                                setUnits(String(LOT[COMPANY_BY_ID[key].exchange]));
                              }}
                            >
                              {COMPANY_BY_ID[key].displayName}
                            </button>
                            <small>{id}</small>
                          </td>
                          <td>{p.units.toLocaleString()}</td>
                          <td>{money(myr)}</td>
                          <td>
                            {money(value - p.costMinor / 100, cur)}
                            <small>{pct(value / (p.costMinor / 100) - 1)}</small>
                          </td>
                          <td>
                            {money(myr - p.costMYR / 100)}
                            <small>{pct(myr / (p.costMYR / 100) - 1)}</small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!Object.keys(s.fund.positions).length && (
                  <p>No equities held. Cash remains available to invest.</p>
                )}
              </div>
              <div className="metrics">
                <article>
                  <small>LIFETIME REALIZED · MYR</small>
                  <strong>{money(s.fund.realizedMYR / 100)}</strong>
                </article>
                <article>
                  <small>NET DIVIDENDS · MYR / USD</small>
                  <strong>
                    {money(s.fund.dividends.MYR / 100)} / {money(s.fund.dividends.USD / 100, 'USD')}
                  </strong>
                </article>
              </div>
              <h2>Orders</h2>
              <p>
                Closed-market orders expire in seven game days. Buys reserve no cash and revalidate in
                submission order.
              </p>
              <ul className="activity">
                {s.fund.orders
                  .slice(-15)
                  .reverse()
                  .map((o) => (
                    <li key={o.id}>
                      <span>
                        {o.side.toUpperCase()} {o.units.toLocaleString()} {o.ticker}
                        <small>
                          {date(o.createdMin)} MYT ·{' '}
                          {o.reason ??
                            (o.fillPrice
                              ? `Filled at ${money(o.fillPrice, currencyOf(o.ticker))}`
                              : `Expires ${date(o.expiresMin)}`)}
                        </small>
                      </span>
                      <span className="badge">{o.status}</span>
                      {o.status === 'queued' && (
                        <button onClick={() => onCommand({ type: 'cancelOrder', id: o.id })}>Cancel</button>
                      )}
                    </li>
                  ))}
              </ul>
              {!s.fund.orders.length && <p>No orders submitted.</p>}
              <h2>Transaction journal</h2>
              <ul className="activity">
                {s.fund.tx
                  .slice(-15)
                  .reverse()
                  .map((t) => (
                    <li key={t.id}>
                      <span>
                        {t.type.toUpperCase()} {t.ticker}
                        <small>{t.note}</small>
                      </span>
                      <span>
                        {money(t.amountMinor / 100, t.currency)}
                        {t.counterCurrency && (
                          <small>Received {money(t.counterAmountMinor! / 100, t.counterCurrency)}</small>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          {tab === 'Treasury' && (
            <>
              <div className="section-label">PUBLIC FINANCES / 02</div>
              <h1>The public balance sheet.</h1>
              <div className="metrics">
                <article>
                  <small>TREASURY CASH</small>
                  <strong>{money(s.government.treasury / 100)}</strong>
                </article>
                <article>
                  <small>DEBT PRINCIPAL</small>
                  <strong>{money(s.government.debt / 100)}</strong>
                </article>
                <article>
                  <small>UNPAID OBLIGATIONS</small>
                  <strong>{money(s.government.unpaidObligations)}</strong>
                </article>
              </div>
              <h2>Financing & fund transfers</h2>
              <label>
                Amount · MYR
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={transfer}
                  onChange={(e) => setTransfer(e.target.value)}
                />
              </label>
              <div className="actions">
                {(
                  [
                    ['fundInject', 'Contribute to SWF'],
                    ['fundWithdraw', 'Distribute to treasury'],
                    ['issueBonds', 'Issue bonds'],
                    ['repayDebt', 'Repay principal'],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    disabled={!Number.isFinite(Number(transfer)) || Number(transfer) <= 0}
                    onClick={() => onCommand({ type, amount: Number(transfer) })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p>
                Transfers conserve combined public wealth. Bonds increase both treasury cash and debt;
                principal repayments reduce both.
              </p>
              <label>
                Share of future net dividends to treasury
                <select
                  value={s.fund.dividendTransferPct}
                  onChange={(e) => onCommand({ type: 'setDividendTransfer', pct: Number(e.target.value) })}
                >
                  {[0, 0.25, 0.5, 1].map((v) => (
                    <option key={v} value={v}>
                      {pct(v)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Distributions settle monthly from available MYR cash. USD dividends need conversion first.
                Unpaid distributions carry forward.
              </p>
              <h2>Month-to-date fiscal flows · MYR</h2>
              <dl>
                {Object.entries(s.government.mtd).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{money(value)}</dd>
                  </div>
                ))}
              </dl>
              <h2>Treasury journal · latest 30 postings</h2>
              <ul className="activity">
                {s.government.ledger
                  .slice(-30)
                  .reverse()
                  .map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.kind}
                        <small>Balance {money(l.balanceMinor / 100)}</small>
                      </span>
                      <span>{money(l.amountMinor / 100)}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          {tab === 'Statements' && (
            <>
              <div className="section-label">FICTIONAL COMPANY ACCOUNTS / 03</div>
              <h1>{c.displayName}</h1>
              <p>
                Listing currency: {currency}. Latest closed month: {Math.floor(last.monthKey / 12)}-
                {String((last.monthKey % 12) + 1).padStart(2, '0')}. Pre-campaign statements are synthetic
                opening history.
              </p>
              <dl>
                {(
                  [
                    'revenue',
                    'ebitda',
                    'ebit',
                    'interest',
                    'pbt',
                    'taxKL',
                    'taxOther',
                    'netIncome',
                    'dividends',
                  ] as const
                ).map((k) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{money(last[k], currency)}</dd>
                  </div>
                ))}
              </dl>
              <div className="metrics">
                <article>
                  <small>COMPANY CASH</small>
                  <strong>{money(s.companies[ticker].cash, currency)}</strong>
                </article>
                <article>
                  <small>COMPANY DEBT</small>
                  <strong>{money(s.companies[ticker].debt, currency)}</strong>
                </article>
                <article>
                  <small>RETAINED EARNINGS</small>
                  <strong>{money(s.companies[ticker].retained, currency)}</strong>
                </article>
              </div>
              <h2>Current month accrual · {currency}</h2>
              <dl>
                {Object.entries(s.companies[ticker].mtd).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{money(v, currency)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                KL tax applies only to KL exposure ({pct(c.exposure.kl)}). Featured company tax is contained
                within sector collections, never collected twice. Maintenance capex equals depreciation in
                this simplified cash bridge.
              </p>
            </>
          )}
          {tab === 'Reports' && (
            <>
              <div className="section-label">MONTHLY RECONCILIATION / 04</div>
              <h1>Follow the money.</h1>
              {!report ? (
                <p>
                  The first reconciliation publishes automatically at the next calendar month boundary. Taxes,
                  expenses, debt and fund distributions settle while the clock runs.
                </p>
              ) : (
                <>
                  <label>
                    Closed month
                    <select
                      value={reportIndex < 0 ? s.reports.length - 1 : reportIndex}
                      onChange={(e) => setReportIndex(Number(e.target.value))}
                    >
                      {s.reports.map((r, i) => (
                        <option key={r.monthKey} value={i}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <dl>
                    <div>
                      <dt>Closing treasury</dt>
                      <dd>{money(report.treasury)}</dd>
                    </div>
                    <div>
                      <dt>Closing debt</dt>
                      <dd>{money(report.debt)}</dd>
                    </div>
                    <div>
                      <dt>Fund NAV · FX included</dt>
                      <dd>{money(report.fundNav)}</dd>
                    </div>
                    <div>
                      <dt>Fund monthly return · transfers excluded</dt>
                      <dd>{pct(report.fundReturnMoM)}</dd>
                    </div>
                    {report.reconciliation &&
                      Object.entries(report.reconciliation).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k.replace('Minor', '')}</dt>
                          <dd>{money(v / 100)}</dd>
                        </div>
                      ))}
                  </dl>
                  <h2>Fiscal flows · MYR</h2>
                  <dl>
                    {Object.entries(report.gov).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{money(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Cash residual = closing − opening − net posted cash. Debt residual = closing − opening −
                    borrowing + principal repaid. Both should be RM0.00.
                  </p>
                </>
              )}
            </>
          )}
        </section>
        <aside className="panel ticket">
          <div className="section-label">INVESTMENT DESK</div>
          <h2>Trade for the city.</h2>
          <label>
            Security
            <select
              value={ticker}
              onChange={(e) => {
                const id = e.target.value as TickerId;
                setTicker(id);
                setUnits(String(LOT[COMPANY_BY_ID[id].exchange]));
              }}
            >
              {COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="quote">
            <strong>{money(s.market.quotes[ticker].price, currency)}</strong>
            <span className="badge">
              {c.exchange} {open ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <p>
            Fictional simulated quote · {open ? 'Immediate settlement' : 'Queue for next open hourly tick'}
          </p>
          <div className="actions">
            {(['buy', 'sell'] as const).map((v) => (
              <button key={v} aria-pressed={side === v} onClick={() => setSide(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          <label>
            Shares · lot {LOT[c.exchange]}
            <input
              type="number"
              min={LOT[c.exchange]}
              step={LOT[c.exchange]}
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
          </label>
          {q && (
            <dl>
              <div>
                <dt>Estimated execution / share</dt>
                <dd>{money(q.px, currency)}</dd>
              </div>
              <div>
                <dt>Brokerage & clearing</dt>
                <dd>{money(q.fees, currency)}</dd>
              </div>
              <div>
                <dt>Spread & liquidity impact</dt>
                <dd>{money(Math.abs(q.px - q.mid) * quantity, currency)}</dd>
              </div>
              <div>
                <dt>{side === 'buy' ? 'Cash payable' : 'Net proceeds'}</dt>
                <dd>{money(Math.round(q.total * 100) / 100, currency)}</dd>
              </div>
            </dl>
          )}
          {reason && <p className="warning">{reason}</p>}
          <button
            className="accent"
            disabled={!!reason}
            onClick={() => {
              onReview();
              setReview(true);
            }}
          >
            Review {side} order
          </button>
          <p>No margin or short selling. Maximum 20% of NAV per equity; 25% of daily liquidity per order.</p>
          <hr />
          <h2>Currency conversion</h2>
          <p>
            USD/MYR {fx.toFixed(4)} · spread {pct(FX_SPREAD)}
          </p>
          <label>
            Pay currency
            <select value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
              <option>MYR</option>
              <option>USD</option>
            </select>
          </label>
          <label>
            Pay amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={fxAmount}
              onChange={(e) => setFxAmount(e.target.value)}
            />
          </label>
          <p>
            Receive{' '}
            {Number.isFinite(fxReceive) ? money(fxReceive / 100, from === 'MYR' ? 'USD' : 'MYR') : '—'} after
            spread and rounding.
          </p>
          <button
            disabled={!Number.isSafeInteger(fxMinor) || fxMinor <= 0 || fxReceive <= 0}
            onClick={() => onCommand({ type: 'fx', from, amountMinor: fxMinor })}
          >
            Confirm FX conversion
          </button>
        </aside>
      </div>
      {review && q && (
        <div className="modal-backdrop">
          <section className="panel modal" role="dialog" aria-modal="true" aria-label="Confirm fund order">
            <div className="section-label">CLOCK PAUSED FOR REVIEW</div>
            <h2>
              {side.toUpperCase()} {quantity.toLocaleString()} {c.displayName}
            </h2>
            <p>
              Estimated {side === 'buy' ? 'payment' : 'proceeds'}:{' '}
              {money(Math.round(q.total * 100) / 100, currency)}, including {money(q.fees, currency)} fees.
              Spread and impact are included in the execution price.
            </p>
            <p>
              {open
                ? 'Fills immediately at the current simulated quote.'
                : 'Queues for up to seven days. The actual price and fees are recalculated at execution.'}
            </p>
            <div className="actions">
              <button onClick={() => setReview(false)}>Back</button>
              <button
                className="accent"
                onClick={() => {
                  onCommand({ type: 'placeOrder', ticker, side, units: quantity });
                  setReview(false);
                }}
              >
                Confirm {side}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function PhaseThreeApp() {
  const [game, setGame] = useState(() => createGame());
  const state = useRef(game);
  const [message, setMessage] = useState('Investment desk ready. The fictional game clock is paused.');
  function publish() {
    setGame({ ...state.current });
  }
  function pause() {
    state.current.clock.paused = true;
    publish();
  }
  function command(cmd: Command) {
    const result = applyCommand(state.current, cmd, Math.floor(displayMinutes(state.current.clock)));
    setMessage(result.message);
    publish();
  }
  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) {
        advance(state.current, now - previous);
        setGame({ ...state.current });
      }
      previous = now;
    }, 100);
    const hidden = () => {
      previous = performance.now();
      if (document.hidden) {
        state.current.clock.paused = true;
        try {
          localStorage.setItem(SLOT, serialize(state.current));
        } catch {
          /* manual save reports storage failures */
        }
        setGame({ ...state.current });
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  function save() {
    try {
      localStorage.setItem(SLOT, serialize(state.current));
      setMessage('Saved fund, accounts, orders and clock.');
    } catch {
      setMessage('Save failed: browser storage unavailable.');
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SLOT);
      if (!raw) {
        setMessage('No saved game in this browser.');
        return;
      }
      state.current = deserialize(raw);
      publish();
      setMessage('Save restored. Clock paused; no offline catch-up.');
    } catch (e) {
      setMessage(`Load failed: ${String(e)}`);
    }
  }
  return (
    <div className="phase3-app">
      <header>
        <a href="#" className="brand">
          KL<span>ECONOMIC EMPIRE</span>
        </a>
        <div className="clock">
          <strong>{date(displayMinutes(game.clock))} MYT</strong>
          <small>{game.clock.paused ? 'PAUSED' : `RUNNING · ${game.clock.speed}×`}</small>
        </div>
        <div className="actions">
          <button onClick={pause}>Pause</button>
          {([1, 2, 3] as const).map((speed) => (
            <button
              key={speed}
              aria-pressed={!game.clock.paused && game.clock.speed === speed}
              onClick={() => {
                state.current.clock.speed = speed;
                state.current.clock.paused = false;
                publish();
              }}
            >
              {speed}×
            </button>
          ))}
          <button onClick={save}>Save</button>
          <button onClick={load}>Load</button>
        </div>
      </header>
      <div className="disclosure">
        ALTERNATE-HISTORY KUALA LUMPUR · ALL PRICES, FINANCIALS AND EVENTS ARE FICTIONAL SIMULATIONS
      </div>
      <div className="status" role="status">
        {message}
      </div>
      <main>
        <FundConsole game={game} onCommand={command} onReview={pause} />
      </main>
      <footer>
        PHASE 3 · PUBLIC INVESTMENT DESK <span>Local simulation / no live market feed</span>
      </footer>
    </div>
  );
}
