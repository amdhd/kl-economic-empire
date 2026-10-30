# Economy model

All parameters live in `src/data/economic-baseline.ts` and `src/engine/*.ts`. Fictional calibration aimed at
internal plausibility (≈ RM 300 bn GDP, 1.75 m workforce incl. commuters, 3.6 % unemployment, 2 % inflation).

## Units
Ledger balances: integer sen/cents. Flows: MYR per day (accumulated monthly). Rates: decimals. Indices: 1 = base.
CPI: 100 = start. FX: MYR per USD.

## Calibration (`calibration.ts`)
- 7 KL sectors *j* (finance, property & construction, utilities & energy, telecom & tech, consumer/retail/tourism,
  healthcare & public services, industrial & materials). Input–output matrix `A[i][j]`, import share `m_j`.
- Value-added ratio `v_j = 1 − Σ_i A_ij − m_j`; base gross output `Y0_j = VA_j / 365 / v_j`.
- Final demand `f0 = (I − A)·Y0`. Household, government and investment components come from the behavioural
  rules at baseline; **exports are the residual** `X0 = f0 − C0 − G0 − I0` (test asserts all > 0).

## Daily step (`economy.ts`, order: external → government → households/sectors → companies)
1. **Households:** wages `Σ L_j·w0_j·W`; disposable `YD = wages + transfers + distributed profits − surcharge − interest − amortisation`.
   Permanent income `P += 0.012(YD − P)`; consumption `C = MPC·(0.5·YD + 0.5·P)` (draws on savings when income dips).
   New household credit is spent 35 % on property, 65 % on consumer goods.
2. **Demand:** consumption by basket share; consumer-sector spending net of the consumption levy; government
   purchases by budget line; investment by `INVESTMENT_GOODS`; exports `X0_j × index_j`, where the index mixes
   Malaysia demand, global demand, tourism (× levy elasticity 1.5, × completed tourism projects) and the tech cycle,
   each scaled by relative-price competitiveness `(p_j / (FX·P_US))^−ε`.
3. **Production:** `Y = (I − A)⁻¹ f_real`, capped by capital capacity `cap_j·(1+infra_j)` and labour capacity
   `L_j·prod_j·1.08`. Utilisation `= demand / capacity`.
4. **Accounts:** `VA_j = p_j Y_j − Σ_i A_ij p_i Y_j − m_j P^imp_j Y_j`; profit `= VA − wages − δK − interest − property levy`.
   **Nominal GDP = Σ VA + consumption levy**; real GDP = `Σ v_j Y_j` + levy at base rate (double deflation).
   Share trading, bond issuance, SWF valuation and transfers never enter GDP (tested).
5. **Prices:** each sector moves 2.5 %/day toward a cost target
   `Σ_i A_ij p_i + m_j P^imp_j + v_j (ls_j·W/prod_j + (1−ls_j)·markup(util)·CPI)`; import prices = FX × (foreign
   goods, oil). Rent index tracks property prices × housing factor × utilisation × property-levy pass-through.
   CPI = basket-weighted prices (consumer goods incl. levy, rent for property).

## Weekly
Employment moves 12 % toward `demand / labour productivity`, bounded by 98.5 % of the workforce. Seeded events spawn.

## Monthly close (`scheduler.ts` → government → companies → fund → bank → economy)
- **Government:** corporate tax `= rate × Σ max(0, sector profit)`; property levy `= rate × 0.5 × property gross output`;
  interest on debt; amortisation debt/120 refinanced to the cash-buffer target, within the debt/GDP cap.
  Yield `= MGS10 + 0.4 % + 8·max(0, D/Y − 35 %) + 0.25·max(0, deficit − 3 %) + arrears`. Rating and market access follow.
  Service quality → target `0.62·(real health+services+safety spend / base)^0.6 + project boosts`, 25 %/month.
- **Budget identity** (tested every month, exact to the sen):
  `ΔTreasury = taxes + grant + borrowing + SWF transfers in − opex − capex − interest − principal − emergency − SWF injections`.
- **Bank** (identity `reserves + loans = deposits + capital`, tested): NPL `= 0.12 % + 1.5·(u − 3.5 %) + …`; lending rate
  `= OPR + 2 % + event spread + 1.5·ΔNPL + capital stress`; supply `= min(capital/10 % − loans, 3 % of loans) × willingness`.
- **Investment:** desired capital growth `g = 3.5 % + 0.12·(after-tax ROK − base) − 0.6·Δlending rate + 0.12·(util − 85 %) + confidence`,
  partial adjustment 30 %/month, external finance rationed by bank supply. New capacity matures after **6 months**.
- **Wages:** `ΔW/W = (E[π] + 1.5 % + 0.6·(3.5 % − u)) / 12`; expectations `0.82E + 0.10π + 0.08·2 %`.
- **MPC** `= 0.86 − 0.5(u − 3.5 %) − 1.0·max(0, π − 3 %) + 0.1(confidence − 0.6)`, clamped 0.70–0.95.
- **Approval:** 35 %/month toward satisfaction = 25 % employment + 25 % real income + 15 % affordability + 15 % services
  + 10 % trust + 10 % stability. Trust falls with tax rises, cuts to services/transfers, arrears, downgrades.

## Companies & market (`companies.ts`, `stock-market.ts`)
Revenue/day `= rev0/365 × shock × (kl·KLsector + my·MYdemand + global·driver × FX)`; costs split labour/energy/other
with 35 % fixed. Taxes: KL rate on the KL share of profit, 24 % (MY) / 21 % (US) on the rest. Quarterly dividends ≤ 50 % of cash.
Fundamental value `= EPS_fwd × base P/E × ((r0+5 %)/(r+5 %))^(1.5·duration) × e^{0.6(risk−0.5)} × e^{sentiment}`.
Hourly (open sessions only): `Δln P = 0.012·ln(FV/P) + market + sector + idiosyncratic shocks`, clipped ±6 %.

## Causal chains (each covered by `tests/economic-invariants.test.ts`)
- Corporate tax 18 % → 25 %: receipts ↑ from the effective month, after-tax profit and investment ↓ with a lag, KL-exposed
  company earnings ↓, US company earnings essentially unchanged.
- Infrastructure: capex immediately (priced at the construction index), productivity only after completion,
  saturating per sector; 3 %/yr upkeep afterwards; only 60 % of capex counts as public assets.
- Oil shock: CPI ↑, real disposable income ↓.
- AI boom: US semiconductor revenue ↑ ≫ Malaysian retail.
- More public-service spending: service quality ↑ over months, at a fiscal cost.

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

## Sovereign fund & public accounting (Phase 3)

All prices, company accounts and economic series are fictional simulation data. The baseline engine already contains broader macro/campaign logic; this milestone changes fund/accounting behavior only.

### Units and rounding

Fund MYR and USD cash, treasury, public debt, position cost basis, realized returns and dividend totals are safe integer minor units (sen / US cents). `assertSafeMinor` guards postings and accumulated balances. Corporate and macro flows remain floats in major units of the explicitly named currency. `toMinor` rounds to nearest minor unit, halfway away from zero. Reject non-finite, non-positive, fractional-share and unsafe inputs. FX receipts round down. Treasury payments are limited to available cash, with the actual paid amount posted; financing and arrears are explicit in the existing government settlement. This also prevents multiple daily rounded disbursements overdrawing by a few sen.

### Equity orders and cash conservation

Immediate settlement, no leverage or short sales. MY board lots are 100 shares, US lots one share. The hard single-equity concentration limit is 20% of NAV; the fund's cumulative trading in one stock may not exceed 25% of its simulated average daily traded value per session (D-010).

- Impact = `0.1 × sqrt((fund value already traded this session + midPrice × shares) / averageDailyValue)`.
- Execution price = `mid × (1 ± (halfSpread + impact))`, plus for buys, minus for sells.
- MY half spread 0.10%, fee 0.20%; US half spread 0.02%, fee 0.03%.
- Buy: cash decreases by rounded `(executionPrice × shares + fees)`; units increase and basis increases by exactly the paid cash. MYR basis converts that rounded cash at execution FX.
- Sell: cash increases by rounded `(executionPrice × shares − fees)`; average cost basis is removed proportionately. Final liquidation removes the entire remaining basis. Realized local profit = proceeds less released local basis. Realized MYR profit = proceeds translated at sale FX less released acquisition-date MYR basis.
- Cumulative realized totals survive deletion of fully sold positions. Trades/mark-to-market gains never post government taxes or GDP.

An equal-value asset replaces spent cash; only fees/spread/impact reduce NAV. The external market is the counterparty, not a public account. Settlement functions enforce session hours, expiry and order status themselves. Filled/cancelled/expired orders cannot execute again. Closed-market orders queue for seven calendar days and can be cancelled. Pending sells reserve shares; buys do not reserve cash and compete in submission order. Revalidate all constraints at execution. Queued execution occurs at the first open **hourly tick**, potentially 30 minutes after the session opens. Quotes shown before confirmation include all estimated costs; actual future queued execution can differ.

### FX and portfolio valuation

`f = MYR per USD`. MYR→USD: `receivedCents = floor(paidSen / (f × 1.0025))`. USD→MYR: `receivedSen = floor(paidCents × f × 0.9975)`. Reject conversions whose receipt rounds to zero. Journal both currency cash legs and the FX snapshot. A round trip loses the spread and rounding; no nominal share quantities change.

`NAV_MYR = MYRCash/100 + USDCash/100 × f + Σ(shares × lastSimulatedPrice × currencyFX)`.

US holdings show local return against USD basis and MYR return against acquisition-date MYR basis. Daily NAV history contains real simulation marks (bounded at 800 points), with units and game dates shown. Monthly performance = `(endingNAV − netTreasuryInflowsDuringMonth) / previousNAV − 1`; this simple transfer-adjusted return is not a money-weighted or time-weighted attribution model. It includes FX, net dividends, fees and market moves.

### Company statements, dividends and taxes

Revenue less labor, energy and other costs = EBITDA. EBITDA less depreciation = EBIT. EBIT less net interest = pretax profit. KL corporate tax applies only to positive pretax profit × KL exposure. Other exposure uses exogenous MY 24% / US 21% rates. Net income = pretax profit less taxes. No tax refund on losses.

Featured companies are samples within the sector aggregates: their KL taxes are informational and already contained in the sector collections. Do not collect both independently. Operating revenue/costs accrue daily. At monthly close, maintenance capex equals depreciation, so the simplified net cash change before financing and dividends equals net income. Negative corporate cash is financed by matching new corporate debt.

Opening retained earnings are the undistributed net income in synthetic opening history. Thereafter retained earnings increase by net income minus dividends. At quarter end, declared dividends = `max(0, min(quarterNetIncome × payoutRatio, availableCash × 0.5, cumulativeRetainedEarnings + currentNetIncome))`. They cannot be paid from accumulated losses. Total declared dividends reduce company cash and retained earnings. The SWF receives its share by units / shares outstanding; other shareholders receive the remainder outside the public accounts. US dividends have fictional 15% withholding. Net SWF receipts increase listing-currency cash and cumulative dividend totals.

The configured fraction of net dividend receipts accrues as a pending MYR treasury distribution. Actual month-end payment is limited to available fund MYR cash; convert USD separately. Unpaid distributions carry forward. A transfer decreases fund cash and increases treasury cash by identical sen, without creating public wealth or tax revenue.

### Government and monthly reconciliation

Each treasury posting records signed integer cash and resulting treasury balance in a bounded journal (800 entries); monthly flow aggregates remain available in reports after journal pruning. Debt issuance increases cash **and debt**; repayment decreases both. Treasury contributions to and distributions from the SWF are separate from revenue and expenditure.

At month end: close companies, pay their dividends to holders, settle fund distributions, then close government flows. This includes distributions in the same month's report rather than the next month's opening ledger.

`EndingTreasury = OpeningTreasury + Taxes + Grants + Borrowing + FundDistributions − Opex − Capex − Interest − Principal − FundContributions − EmergencyOutlays`.

`EndingDebt = OpeningDebt + Borrowing − Principal`.

The report records opening/closing integer balances, net cash postings and both residuals. Residuals must equal exactly zero sen. Opening balances come from the prior report or fictional baseline for the first month. Reports, cash balances, histories, orders, boundary cursors and RNG are saved; restoring never settles another financial event.

### Save compatibility

Schema 3 (integration) holds cumulative realized/dividend totals, the treasury journal and project `work`. The schema 1→2→3 migration recovers totals from still-held positions; previously deleted positions and historical sale FX cannot be reconstructed. Legacy MYR realized profit is recoverable; legacy USD base-currency realized profit is not invented. New schema-2 activity records complete totals. Restore validates safe balances, positive FX/prices, valid positions and queued orders, and resumes paused.

### Validation

`tests/phase3-accounting.test.ts` covers closed/double/expired settlement, malformed inputs, liquidation returns, FX round trips, cash competition, sell reservations, company cash/earnings/debt reconciliation, dividend limits, jurisdictional tax exposure, save validation/migration and twelve exact monthly cash/debt reconciliations with treasury/fund transfers. Existing trading, clock, invariant and seeded campaign suites remain mandatory. `e2e/phase3.spec.ts` exercises quotes/order confirmation, open and closed orders, cancellation, FX, transfers, statements, reports, save/load and pause behavior in a real browser.
