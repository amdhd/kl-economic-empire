# Economy model

Units: ledger balances are integer minor units (sen / US cents). Macro flows are MYR floats. Rates and shares are
decimals (0.05 = 5%). Everything is a fictional simulation. Other phases document their own subsystems in further
sections of this file.

## Stock market (Phase 2)

Implemented in `src/engine/stock-market.ts`, `src/engine/market-calendar.ts` and `src/engine/market-view.ts`.

### Exchanges and sessions

| Exchange | Currency | Local time | Continuous sessions | Economic ticks (whole hours) |
|---|---|---|---|---|
| `MY` Bursa Malaysia | MYR | MYT, UTC+8 (no DST) | 09:00–12:30, 14:30–17:00 | 09, 10, 11, 12, 15, 16 |
| `US` NYSE/Nasdaq | USD | America/New_York (EST −5 / EDT −4) | 09:30–16:00 | 10, 11, 12, 13, 14, 15 |

- Weekends are closed. NYSE holidays are computed by rule (incl. Good Friday and observed dates). Bursa fixed holidays
  are exact; its lunar holidays are a documented approximation.
- US DST runs from the 2nd Sunday of March to the 1st Sunday of November, so the US open is 22:30 MYT in winter and
  21:30 MYT in summer.
- Prices move only on hourly ticks while that exchange is open. A closed market shows its last price.

### Price discovery (hourly, open market only)

For each security `i` on exchange `x`:

```
EPS_i       = max((0.5·TTM_NI + 0.5·4·last-3-month NI) / shares, 0.15·|baseline EPS|)
rateMult    = ((r0 + ERP) / (r + ERP)) ^ (1.5·rateSensitivity)    r = MGS10 (MY) or UST10 (US), ERP = 5%
riskMult    = exp(0.6·(riskAppetite − 0.5))
Fundamental = EPS · basePE · rateMult · riskMult · exp(sentiment)

r_t = clamp( 0.012·ln(Fundamental / P) + σ_mkt,x/√1512 · β_i · z_mkt + 0.10/√1512 · z_driver + 0.8·σ_i/√1512 · z_i , ±6% )
P_t+1 = roundTick(P_t · e^{r_t})
```

- σ_mkt = 11% (MY) / 15% (US) annualised. The market shock is scaled by `0.6 + 0.8·(1 − riskAppetite)`.
  β = 0.7 + 0.4·min(σ_i/0.25, 2). One sector shock per global driver per tick. All normals are clipped and drawn from `s.rng`.
- The pull-to-fundamental half-life is about 9.5 trading days. KL corporate tax reaches prices only through
  after-tax earnings (KL-exposed share only).
- Tick sizes: US $0.01. Bursa RM0.005 (< RM1), RM0.01 (< RM10), RM0.02 (< RM100), RM0.10 otherwise.
- Volume (traded value) = market cap × turnover (0.15%/day MY, 0.6%/day US), split over 6 ticks and raised by large moves.

### Bars, indices and history

- Hourly bars are appended on each open tick (retention 120). A daily OHLCV bar is finalised once the session has
  closed (retention 800). Bar `t` is the epoch hour (hourly) or the exchange-local day number `Date.UTC(y,m,d)/864e5`
  (daily).
- **KL Economic Stock Index** and **US Game Index** are market-cap weighted over the 20 featured names of each exchange,
  with a divisor set so both start at 1000. They are fictional and are not the FTSE Bursa Malaysia KLCI or the S&P 500.
- Pre-game history: see D-P2-04 (180 trading-date sessions, hourly Brownian bridge for the last 10, last close =
  opening price).

### Display metrics (read-only, `market-view.ts`)

| Metric | Definition |
|---|---|
| Day % | price / previous session close − 1 |
| 1M % | price / close 21 sessions ago − 1 |
| P/E | price / (TTM net income / shares). "n/m" if earnings ≤ 0 |
| Yield | TTM declared dividends per share / price |
| Market cap (MYR) | price × shares × MYR/USD for US names |

### FX

`MYR per USD` is an external, fictional, mean-reverting rate (see `external.ts`). It is fixed daily into `s.daily[].fx`.
The SWF pays a 0.25% conversion spread. FX changes the MYR value of US holdings but never their share quantities.

Tests: `tests/market-calendar.test.ts`, `tests/market-view.test.ts`, `tests/securities.test.ts`, `tests/market-orders.test.ts`.
