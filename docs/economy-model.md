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
   Permanent income `P += 0.012(YD − P)`; desired spending `C* = MPC·(0.5·YD + 0.5·P) + equityWealthSpend`.
   Funded spending `C = min(max(0, C*), max(0, YD + savings))`; fuel costs reallocate this envelope (see D-051 below).
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

## Monthly close (`scheduler.ts` → companies → fund → government → bank → economy)
- **Government:** corporate tax `= rate × Σ max(0, sector profit)`; property levy `= rate × 0.5 × property gross output`;
  interest on debt; amortisation debt/120 refinanced to the cash-buffer target, within the debt/GDP cap.
  Yield `= MGS10 + 0.004 + 0.08·max(0, D/Y − 0.35) + 0.25·max(0, deficit − 0.03) + 0.02·arrearsFlag`. Rating and market access follow.
  Service quality → target `0.62·(real health+services+safety spend / base)^0.6 + project boosts`, 25 %/month.
- **Budget identity** (tested every month, exact to the sen):
  `ΔTreasury = taxes + grant + borrowing + SWF transfers in − opex − capex − interest − principal − emergency − SWF injections`.
- **Bank** (identity `reserves + loans = deposits + capital`, tested): NPL `= 0.0012 + 0.015·(u − 0.035) + …`; lending rate
  `= OPR + 2 % + event spread + 1.5·ΔNPL + capital stress`; supply `= min(capital/10 % − loans, 3 % of loans) × willingness`.
- **Investment:** desired capital growth `g = 3.5 % + 0.12·(after-tax ROK − base) − 0.6·Δlending rate + 0.12·(util − 85 %) + confidence`,
  partial adjustment 30 %/month, external finance rationed by bank supply. New capacity matures after **6 months**.
- **Wages:** `ΔW/W = (E[π] + 1.5 % + 0.6·(3.5 % − u)) / 12`; expectations `0.82E + 0.10π + 0.08·2 %`.
- **MPC:** gradually approaches a target within 0.835–0.875; unemployment acts through confidence rather than a second direct penalty. See D-051 below for equations.
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

## Phase 4 acceptance audit

The existing seven-sector model supplies Phase 4's six-sector minimum. The audit keeps its coefficients and RNG
draw order. `tests/economic-invariants.test.ts` additionally checks finite, nonnegative IO coefficients, positive
value-added shares and recovery of baseline gross output from final demand through `(I − A)⁻¹`.

- **Tax timing:** a January proposal effective 1 February leaves January company accounts, corporate collections
  and February investment plans unchanged. February earnings close at the new rate on 1 March; lower after-tax
  returns reduce the new plans then. Capacity additions enter a six-slot pipeline, so the first different capacity
  matures on 1 September. Plans and demand can change earlier; physical capacity cannot.
- **Infrastructure timing:** commissioning records a commitment. Payments start at the next daily settlement and
  buy 70% construction, 20% industrial and 10% technology output. IO links propagate demand to suppliers (including
  utilities) during the build. Treasury costs occur before any completed-project productivity boost. Real work
  accrues as `paid / constructionPrice`; completion unlocks benefits. Funding shortfalls can delay completion.
- **GDP separation:** the baseline's sector value added also equals final demand less imported intermediate
  inputs, rather than gross output. The trade test verifies actual filled buys and sells before comparing nominal
  GDP, real GDP, sector value added and corporate tax with the same-seed hands-off case.

### Policy and project estimates

`policy-preview.ts` reads state without postings or RNG draws. Estimates are changes in MYR per average month,
`D = 365/12`, with prices, current demand and the last closed corporate-profit base held fixed:

- Corporate: `(proposedRate − currentRate) × Σ max(0, lastMonthProfit_j) × D / daysInClosedMonth`.
- Property: rate change × `0.5 × currentPropertyOutput × currentPropertyPrice × D`.
- Household: rate change × current daily wages × surcharge base share × `D`.
- Consumption: let `B` be the resident consumer spending envelope (including new credit), `V` the model's current
  tax-exclusive visitor purchases. Daily levy at rate `t` is `B × t/(1+t) + V × t`; forecast the difference × `D`.
  The household plan uses funded transfers at the configured budget for this estimate, not a prediction of future
  financing constraints. Behavioral changes to income, tourism, investment and prices remain uncertain.

These bases work after tax regime changes and zero-rate months. Project quotes multiply base cost, scheduled
disbursements and annual upkeep by today's construction price index; ongoing monthly disbursement estimates are
capped by remaining real work. Future inflation and funding can change actual cost and timing. Settlement rules
and save schema are unchanged. `tests/policy-preview.test.ts` checks the forecast equations and zero-rate/short-month
cases; `e2e/phase4.spec.ts` exercises the forecasts, effective dates, reports and project payments in the browser.

Audit coverage: households, wages, CPI and bank credit already feed daily production and monthly reporting;
property/corporate taxes, operating budgets and effective-date controls are already present. Optional district
overlays and the score calibration issues in `game-balance.md` remain outside this acceptance pass (D-P4-01).

Validation (2026-10-31): strict production build, 93 unit/invariant/campaign tests, all 17 Playwright browser tests
and ESLint pass. Browser tests run on isolated port 5174, with Phase 4 tabs disabling player saves.

## Phase 5 — external economy, financial shocks and fiscal stress

The seven resident sectors remain linked to separate Malaysia, US/global and industry drivers. All values and
events below are fictional simulations. This phase retains the existing calibrated coefficients and adds the
event/fiscal corrections described here. No new saved state fields are introduced; saves remain schema 3.

### External demand, currency and company exposure

`external.ts` draws only from `s.rng`. Daily log cycles follow `cycle = persistence × cycle + sd × clippedNormal`.
Demand is `exp(annualTrend × days/365 + cycle) × activeEventModifier`. Annual real trends are 4.2% Malaysia,
3% global, 2.2% US, 6% technology and 4.5% tourism; US prices trend at 2.5%. Industry drivers combine these
states (e.g. semiconductors use `techCycle^1.4`, software uses technology plus trend, industrial uses global demand).
OPR and Fed rules meet on alternate month boundaries; only OPR has the documented small KL feedback.

FX, quoted MYR per USD, is clamped to 3.2–6.5:

`FX = baseFX × exp(fxCycle − 1.5 × relativeRateChange − 0.05 × (oil−1) − 0.08 × (riskAppetite−0.5)) × eventFX`.

Imports use FX times foreign goods/energy prices. Depreciation raises imported costs, propagates through input
prices and CPI, and can lower real household income while improving export price competitiveness. FX revalues
USD fund cash and shares in MYR; it never changes USD quote prices or share units by accounting alone.

Featured-company revenue is weighted by KL/rest-of-Malaysia/global exposure. MY issuers translate global USD
activity into MYR; US issuers translate their small local exposure into USD. KL activity uses sector output and
prices; rest-of-Malaysia prices use KL CPI as a reduced-form proxy. Global earnings use the corresponding external
industry driver and US price index. These are exposure-based earnings estimates, not separately consolidated
geographical cash ledgers. KL tax applies only to the KL share of positive pretax profit; other profits retain
exogenous MY/US tax rates. Exposure weights, earnings, benchmarks and sentiment feed the existing fundamental
valuation and correlated price-discovery model documented below. Company detail now shows model value, the
listing-market benchmark and rate sensitivity; the economy view includes US demand and both rate benchmarks.

### Event lifecycle and propagation

An event is effective on `startDay <= settledDay < endDay`. Macro strength is
`k = clamp((settledDay − startDay + 1)/7, 0, 1) × magnitude`. Multiplicative modifiers use `modifier^k`;
additive modifiers use `modifier × k`. Company beats/warnings retain 6%/day adjustment toward revenue targets
and 5%/day sentiment adjustment, without an extra macro ramp. Future or expired events cannot affect accrual.

All daily agents, including companies, settle the final valid day before expiry. Monthly banking uses that
same settled day's modifiers. A shock spawned at a Monday/month-start boundary affects the new period; it
cannot change the previous month's credit decision. Conversely, a crunch ending on 1 February still informs
January's closing bank decision. Lending rates and new-credit plans update monthly, so those consequences may
persist through the following month. Direct macro modifiers stop at expiry; price adjustment, company sentiment,
investment pipelines and household income retain their own lags. There is no blanket multi-week shock fade.

Opening recession events use the same registration, news and bounded 200-event history as weekly events,
without drawing additional randomness. Live and historical cards show cause, modelled secondary effects,
strength, active/ended status and the last active date (the exclusive end minus one day).

### Credit constraints and fiscal failure

The bank remains a reduced-form aggregate: new loans create matching deposits, repayments destroy both,
defaults reduce loans and capital, and bank earnings/distributions move value between deposits and capital.
Credit supply is capped by capital headroom at a 10% capital ratio and 3% of outstanding loans, scaled by
willingness. Credit crunches reduce willingness and raise spreads; defaults and low capital amplify the effect.
Investment and household credit compete for supply, so stronger credit cannot create unrecorded firm cash.
The bank identity is checked under stress as well as ordinary campaigns.

Daily treasury financing continues to respect market access and debt/GDP limits. Opex, transfers, capex and
emergency work share available funds. **Operating arrears = operating/maintenance/transfer amounts due + old
arrears − actual operating/transfer postings** (floored at zero). Unbuilt project work stays in the project's
remaining real work; unpaid emergency work stays in `pendingEmergency`. Neither shortfall is also recorded as
opex arrears. Otherwise funding recovery would pay the same obligation twice. Unpaid month-end interest still
enters arrears. Historical saved arrears remain payable; the engine does not invent a retroactive breakdown.

Debt interest accrues daily at the debt stock's average coupon. New issuance uses the current MGS benchmark plus
the fiscal premium, changing the average coupon by issue size. Debt principal is a liability, not revenue.
At monthly close, at least 30 consecutive arrears days plus no market access triggers insolvency, lowers trust
and caps the score at 30. A funded recovery before that condition does not automatically fail the campaign.

`tests/phase5-external.test.ts` covers AI versus unrelated sectors, all-issuer tax exposure, filled USD positions
under FX revaluation, FX/import inflation, rate-sensitive model values and prices, KL/US separation, shock
boundaries, save/load replay, constrained credit, bank identity, arrears recovery, coupons, fiscal risk and
insolvency/approval. The existing 12-seed adaptive and 20-seed recession campaign comparisons remain required.
`e2e/phase5.spec.ts` covers recession selection, readable live/retained shocks, expiry, banking reports and MY/US
valuation benchmarks, in isolated tabs with player saves disabled.

Validation (2026-10-31): strict production build, ESLint, 108 unit/invariant/campaign tests and the full 19-test
Playwright suite pass. The final Phase 5 UI additions also pass their two targeted browser tests. Event history
and valuation details were visually inspected in an isolated no-save browser tab.

## Phase 6 — campaign scoring and term report

Scoring stays 30% growth, 30% public wealth, 25% satisfaction and 15% stability. The victory gate remains 75
points, approval ≥60 and solvency. Insolvency caps the total at 30; unemployment >12% or approval <25 caps it at
40. The same pure calculation drives the live HUD/objectives preview and the final result. Historical monthly
scores in existing saves keep their prior calibration; newly calculated scores use these rules. No saved fields
change, so schema 3 and the existing migrations remain supported.

### Growth and external conditions

For the last up to three closed months, `realRunRate = Σ realGDP × 365 / Σ calendarDays` (including leap years).
Annualised growth since opening is `(realRunRate / openingRealRunRate)^(1 / max(closedMonths/12, 0.25)) − 1`.
This fixes month-length bias from multiplying every month by 12. Growth points remain
`clamp(50 + 1000 × (growth − benchmark) − 400 × (unemployment − openingUnemployment), 0, 100)`.

The benchmark is 3.5% plus a bounded external-condition estimate. For each retained macro event, define:

`pressure = .35 ln(MY-demand modifier) + .25 ln(global-demand modifier) + .15 ln(tourism modifier)
          + .05 ln(technology modifier) + .10 ln(credit-willingness modifier) − .10 ln(oil modifier)`.

Missing modifiers are 1. Sum `pressure × magnitude × rampStrength` over **elapsed** overlapping KL days, using
the existing seven-day ramp, then divide by elapsed campaign days and multiply by .25. Clamp the resulting
benchmark adjustment to ±0.01 (one annual percentage point). Future event duration has no effect until elapsed.
Company-specific events, FX, stock returns and player commands do not enter the adjustment. Tailwinds raise
the target and headwinds lower it. This can change at most 10 growth-component points (3 total points) relative
to the unadjusted benchmark. It only partly cushions external shocks; it is not a replayed counterfactual economy.
It uses the bounded 200-event retained history, and cannot recover events missing from legacy saves. Persistent
second-order damage and shocks without a weighted modifier are not fully compensated.

### Sustainable real public wealth

`realWealthChange = (treasury + fundNAV + publicAssets − debt − arrears) / (CPI/100) − openingNetWealth`.
`rawWealthPoints = clamp(50 + 400 × realWealthChange / openingNominalGDP, 0, 100)`.

Compute `credit = clamp(min(latestRealDisposableIncome/openingIncome, realRunRate/openingRealRunRate,
serviceQuality/openingServiceQuality), 0, 1)`. If raw points exceed 50, award `50 + (raw−50) × credit`; otherwise
keep raw points. Before the first monthly report, income and output use their opening levels. This reduces extra
wealth credit from taxes or austerity when living standards or services erode, without hiding actual collected
cash or changing its ledger. A genuine wealth loss retains its full score penalty. Satisfaction and stability
retain their existing rules; debt proceeds, fund transfers and inflation are not new real public wealth.

### End report and saves

The report compares campaign-creation balances with the latest/final state, not January's closing accounts.
Monthly real GDP comparisons and charts use actual calendar days. Fiscal totals sum closed monthly flows plus
current postings in integer minor units before display. Taxes/grants, operating/capital/emergency outlays,
interest, bond proceeds, principal and fund contributions are shown separately. Fiscal balance excludes financing.
Fund gain = final NAV − opening NAV − net treasury transfers; its percentage divides by opening NAV. This simple
measure includes FX/dividends/costs and is not a time-weighted return.

Score explanations, output/finance/fund charts, full retained policy/event disclosures and a link to monthly
accounts remain inspectable after completion. The last tick pauses exactly at 1 Jan 2029 08:00 MYT and zeros
fractional display time; further commands/ticks do nothing. The current net worth is refreshed at that boundary.
The end autosave restores paused and opens the Presidency Report. Legacy completed saves have any fractional
display overshoot clamped to zero, without economic accrual. Save validation rejects invalid speed/clock bounds,
RNG words, missing histories/securities, nonpositive CPI/capacity/productivity and malformed investment pipelines.

`tests/phase6-campaign.test.ts` covers calendar invariance, elapsed/capped shock adjustment, inflation/wealth,
sustainability, failure caps, opening accounts, transfer exclusion, final-boundary idempotence, multi-seed save
replay and corrupt saves. Shared scripts in `tools/campaigns.ts` drive both campaign regression tests and the
`npm run balance` CLI. These tools never add player controls or consume randomness outside `s.rng`.

Phase 6 validation: strict build, ESLint, 131 unit/invariant/campaign tests and 21 browser tests pass. The balance
pass uses 12 calibration seeds plus 12 separate validation seeds. `docs/performance.md` records the real 3× and
engine timings, including hosted-map stalls. `docs/playtesting.md` explicitly leaves human difficulty validation
open. Production bundles contain neither `__klDev` nor `runHours`.

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

## Malaysia baseline and trade/FX expansion (schema 4)

The 31 Oct 2026 user amendment changes **new** campaigns to a national Malaysia baseline while retaining the KL map.
Legacy KL saves select `LEGACY_CAL`, legacy fiscal/FX constants and the original sector calibration. Migration never
rescales cash, debt, history, RNG or the clock. The source ledger in `docs/data-sources.md` distinguishes observations
from assumptions and estimates; official data is pinned locally in code, with no live data service.

### National opening calibration and fiscal flows

Scale the seven fictional sector VA weights by a common scalar `a`. Calibration at fixed national budgets/credit is
affine in `a`, including the consumption product levy: solve `a = 1 + (observedGDP − GDP(1))/(GDP(2) − GDP(1))`.
Then `GDP0 = Σ sectorVA0 + openingProductLevy = RM2,025,379,140,000` (2025 current prices). Real GDP starts at this
same value in opening prices; it is **not** DOSM GDP at constant 2015 prices. Positive residual final exports are tested.
The IO coefficients, seven-sector weights, lending stocks and policy elasticities remain fictional model assumptions.

Monthly controlled opex = MOF annual 2027 operating allocations / 12. Healthcare uses B.42; services B.63+B.64;
safety B.60+B.62; development B.27+B.28 (operations only); household transfers T.14 pensions/allowances/gratuities.
Administration = total operating estimate − T.13 debt service − all five other groups. Debt interest is separate; the
opening average coupon is `61.013bn / openingDebt`, calibrated to the debt-service estimate. Subsequent financing
changes it normally. Development appropriations are not silently auto-spent; commissioned game projects remain capex.

The reduced tax system does not cover all federal revenue. Fix omitted receipts to
`(2027 official receipts − 365 × modeledOpeningDailyTaxes)/12`, where modeled taxes include corporate, property,
consumption and household receipts. These receipts use the legacy `federalGrant` key; nationally the UI says “other
public receipts.” They are a derived residual, not an observed grant or a policy-responsive tax base. The original
legacy KL grant remains RM1bn/month. National starting borrowing cap 80% and rating/premium thresholds 60%/65% are
fictional game rules; they are not legal debt limits. Legacy thresholds and cap remain unchanged. Service population
pressure is normalized against the selected baseline; transfers in inequality scoring use that profile's opening budget.
Company domestic demand and taxable exposure combine its KL and rest-of-Malaysia weights nationally; global exposure
remains external. Featured-company tax is still informational inside sector collections, never a second collection.

### Trade policy and accounting

Queue tariff `t ∈ [0,.2]` and export-service budget `B ∈ [0,2bn]` for the 1st of the next month. Settle the old month first.
`importCostIndex_j = FXrelative × foreign/energy basket_j × (1+t)`.
For actual delivered output `Y_j`, `imports_j = foreignCostIndex_j × importShare_j × Y_j` before tariffs.
`tariffReceipts = Σ imports_j × t`, posted via `post('importTariff')` to treasury. Sector input costs include this tariff;
nominal GDP adds the same net product tax back after sector VA. Real GDP at opening prices adds no tariff (base tariff0).
Tariffs therefore affect costs, profits, prices and subsequent demand, without directly manufacturing real GDP.

Each day `paidSupport = post('exportSupport', B ×12/365)`, capped to available treasury cash after essential outlays and
household withholding. It buys technology/financial services 60%/40%. `targetReadiness = clamp(.12 × paidSupport /
(1bn ×12/365),0,.12)`; `readiness += (targetReadiness−readiness)/90`. Multiply sector export demand by `1+readiness`.
No cash payment means no new boost; existing readiness decays. There is no support arrears balance or free GDP multiplier.
Delivered nominal exports = requested real exports × sector price × `actualOutput / requestedGrossOutput` (0 if no demand).
MTD and monthly trade records contain these delivered exports, production-input imports, paid tariffs and support.
This is a reduced sector trade account, excluding final household imports and re-exports, **not** official merchandise
trade or a complete balance of payments. Migrated campaigns record only flows since migration and label the partial month.
Fiscal revenue, expenditure, deficit, risk, monthly reconciliation and term report include both new treasury flow kinds.

### Central-bank FX operations

New national campaigns receive usable foreign currency USD116.4bn (15 Oct 2026 BNM component) and a **fictional** RM5bn
sterilisation float. Gold, SDRs, IMF and other reserve assets are excluded. Separate USD cents and MYR sen inventories
are guarded safe integers, nonnegative, nontransferable to treasury/SWF. This desk does not print treasury money.
`openingEquityMYR = openingUSD × openingFX + openingMYR` is a fixed accounting offset, not a government cash balance.

At current pre-intervention FX `f`, buying USD costs `ceil(usdCents × f ×1.002)` sen; selling yields
`floor(usdCents × f ×.998)` sen. Validate both resulting inventories before mutating; reject insufficient or unsafe
balances and nonpositive/unsafe requests. Shared turnover cap: USD1bn per KL calendar day across both directions,
not per order. Persist both legs, execution FX, timestamp, pressure and daily usage. Immediate round trips lose the
spread; intervention never directly changes GDP, treasury, fund cash or RNG.

Pressure `p` changes by `±.003 × USDamount/1bn` (+ for buying USD, − for selling), bounded ±.08. At each subsequent
daily fixing, first decay `p *= exp(−1/30)`, then include `exp(p)` in the existing FX equation, still bounded3.2–6.5.
Selling USD thus supports MYR (lower MYR/USD); buying weakens it. No exact rate or peg is guaranteed; external shocks
continue and all draws retain their order. OPR remains automatic, starting from the observed 2.75% reference.
Opening FX is `RM538,759,540,269 / USD132.1bn`, an implied reserve valuation ratio, **not** a spot-market quote.

Public net worth adds `CBUSD × currentFX + CBMYR − openingEquityMYR`, so reserve sales are asset exchanges and fees/
revaluations count. The wealth score instead uses `scoreNetWorth`, which values `CBUSD` at the opening FX rate: spreads and
trading losses lower the score, but reserve revaluation (random or caused by the player's own interventions) never
raises or lowers it (D-029). These are modeled balance-sheet changes, not an assertion of the consolidated Malaysian balance
sheet. National opening net worth is negative because unmodeled public assets are not invented. National wealth-score
change = `(currentNetWorth + debt + arrears)/CPIrelative − debt − arrears − openingNetWorth`; retaining nominal liabilities
prevents inflation alone from granting wealth score. Legacy KL keeps the prior CPI-adjusted net-wealth formula.

### Validation

`tests/trade-fx-baseline.test.ts` covers official units and grouped opex, fiscal residual calibration, national corporate
jurisdiction, v3 compatibility, tariff timing/propagation, cash-funded export lags, exact reconciliation, unsafe inputs,
reserve inventory/turnover constraints, round-trip costs, directional FX effects, RNG/save continuation and full-digit
sen formatting. Existing economic/campaign checks also exercise the national default. Browser checks cover sources,
full cash balances, confirmation, policy timing and reserve settlement. Strategy budget amounts are proportions of
the selected opening budget; the victory threshold still needs human playtesting at the new scale.

### Reference charts and deficit display

Historical charts are display-only DOSM observations (D-024), separate from all simulated reports, RNG and scoring.
Before settlements, campaign charts display their opening state as one marked point. The cash-budget deficit is paid
operating+capex+interest+emergency+export support minus taxes+other public receipts+tariffs. Exclude borrowing, principal
repayment and both SWF transfers. Positive means deficit; negative means surplus. MTD uses current postings, monthly
history uses closed reports. This is the existing cash accounting model, not an accrual deficit or GDP annualisation.

## Additional economic controls (schema5)

Sector relief: `effectiveCorporateRate_j = max(0, statutoryRate − activeRelief_j)`. Relief0–15pp starts on the next
calendar month's first minute and expires after1–60 months. Settlement uses the period just ended (`boundary−1minute`),
so February relief cannot touch January. Corporate sector receipts, featured-company domestic tax and private investment
use this same rate. No loss refunds. Closed-month tax expenditure = statutory tax on positive sector profits minus actual
corporate receipts, rounded to sen; it is forgone revenue, not another treasury outflow. Overlapping incentives are rejected.

Ministry plans: monthly appropriation0–RM50bn, annual escalation−10% to15%, horizon1–5 years. First applies next month;
subsequent appropriations apply every12 months. Reject a plan exceeding the budget ceiling in any scheduled year.
Daily settlement still pays through the normal treasury/financing/arrears path. No funds are reserved or granted upfront.
Cancelling affects future scheduled changes, retaining the current budget. Plans run after period settlement and before
manual policies due at the same boundary, so manual overrides win. Queuing a manual budget for a planned category
cancels that plan's future steps, so a later annual step never overwrites it (D-030). No time skip or offline catch-up is introduced.
For health, services and safety, `realFundingRatio = budget / profileOpeningBudget / CPIrelative × clamp(1−arrearsDays/30,0,1)`;
`outcomeTarget = clamp(62 × realFundingRatio^.6 + serviceBoost×100,0,98)` and `outcome += .25×(target−outcome)` monthly.
These diagnostic synthetic coverage/readiness indices expose individual budget outcomes; aggregate satisfaction retains
the existing service-quality channel, avoiding a second approval boost from the same expenditure.

Debt remains an amortising pool. On issuance, weighted term = `(oldDebt×oldTerm + newDebt×selectedTerm)/(oldDebt+newDebt)`.
Selected terms36/120/240 months price new coupons at current bond yield−0.002/+0/+0.005 respectively. Existing average
coupon is weighted by principal as before. Scheduled monthly principal = debt/weightedTerm, paid from available cash.
Cash-buffer rebuilding target = `max(0, configuredBufferMonths×monthlyOutlays − principalActuallyPaid×(1−refinanceShare))`.
Refinance share0–100% therefore trades lower borrowing against lower liquidity; essential daily financing remains subject
to debt cap/access rules. This is not a bullet-bond maturity ladder or a guarantee all desired refinancing is available.

Automatic FX bands: bounds3.2–6.5 MYR/USD, strictly ordered; configured daily operation>0 up toUSD1bn; reserve floor0–200bn.
After daily external fixing, if above upper bound sell USD; below lower buy USD; inside band do nothing. Size is the
minimum of configured cap, remaining shared daily turnover and available inventory (for sales, reserves above the floor;
for buys, MYRcash/(FX×1.002)). Round down to cents and execute through the manual intervention function. Both currency legs,
spread and inventory constraints remain identical. Floor applies to automatic USD sales; manual operations remain separately
player-directed. Pressure begins at the next fixing. Persist controller status; insufficient inventory pauses execution,
not fiscal spending. Migration enables no controller, grants no cash and consumes no RNG. Tests cover timing, expiry,
revenue/investment propagation, appropriation schedules, funding outcomes, debt terms/rollover, FX bounds and save continuity.

Validation for economic controls: strict build and lint pass;156 unit/invariant/campaign tests and24 browser tests pass.
The browser control test reviews all four settings, checks the selected debt coupon and observes automatic reserve sales.

## Resources, SOEs, commodities, partners and fiscal rules (schema 6, model 2)

Model-2 national campaigns only (`nationalV2`). Schema-5 saves migrate as model 1 with these systems off (D-031).

### Calibration
`NATIONAL_GDP = Σ sector VA + product levy + RESOURCE_VA0`, with `RESOURCE_VA0 = 148bn × 0.75 + 80bn × 0.6`. The private
capital stock is `capitalToVa × VA × (1 − φ)`, where `φ = development / (Σ K_full × (δ + g))` is the public share of fixed
investment; development purchases enter `G0`. Opening receipts: `380.8bn = modelled taxes + modelledResourceRevenue0 +
residual × 12`.

### Daily order
external → automatic FX → world (commodity prices, partner responses) → government (operating, transfers, projects,
development, fuel and wheat subsidies) → resources (upstream and palm VA, palm duty, PETRONAS capex deviation added to
purchases) → households and sectors → companies. Resource VA is added to nominal and real GDP.

### Resources
- Upstream revenue/day = `148bn/365 × production × (0.6 oil + 0.4 gas) × FX`; gas follows oil with a ~180-day lag.
  VA = 75% of revenue. Taxable profit = VA − 35% of opening VA × CPI. PITA = 38% × max(0, monthly taxable profit).
- `production *= 1 + 6%/365 × (capexAvg / 50bn − 1)`; capexAvg is a 365-day average. Capex below RM50bn shrinks output.
- PETRONAS cash += profit after tax + RM30bn/yr depreciation − capex − dividend + interest. Below RM30bn cash, capex is cut 30%.
- Palm value/day = `80bn/365 × volume × palm price × FX`; VA 60%, wages 30% of VA; duty on 28% of value; monthly
  corporate tax on profit. Households receive changes in estate wages and 40% of after-tax plantation profit.

### Commodities, subsidies and duties
- Pump price `= 2.60 × (0.45 + 0.55 × oil × FX)`. Effective household price `= e × min(market, ceiling) + (1 − e) × market`.
  Subsidy/yr `= 17bn L × e × max(0, market − ceiling) × (1 + 12% × leakage above 85% eligibility)`.
- CPI `= 94.5% × sector CPI + 5.5% × pump-price index`. Households pay `17bn/365 × (effective − opening)` from consumption.
- Imported inputs per unit of requirement (ringgit): `FX × [generic × importPriceIndex + energy × (1 + pass × (oil − 1))
  + wheat × wheatUserPrice + steel × (1 + safeguard)] × (1 + MFN tariff)`; utilities `pass = 0.4`, others 1.
- Wheat user price `= 1 + (1 − subsidy) × (p − 1)` above reference; the treasury pays the difference on yesterday's imports.
- Steel safeguard: 40% × duty of steel demand shifts to domestic industry (added to industry final demand); duty is
  collected on the remaining imports; users pay the duty-inclusive price on all steel (import parity).
- Companies: listed cost shares (`commodityCost`) are priced off world indices in listing currency.

### Trading partners
`exportAccess = Σ x_p × e^{cycle_p} × (1 + their_p)^{−2.5} × (1 + 0.05 × agreement_p)` multiplies the global and tech
export mixes and Malaysian companies' foreign sales. `importPriceIndex = (Σ m_p × price_p^{1−4})^{1/(1−4)}` with
`price_p = (1 + our_p)(1 − 0.02 × agreement_p)`; the duty share of that bill is collected as import tariff.

### Fiscal rules
Trailing-12-month window, annualised: deficit = (outlays − revenue)/GDP; primary = deficit − interest/GDP; current
balance = (revenue − (outlays − capital))/GDP; structural = deficit + 0.2 × output gap. Credibility
`C += 0.15 × (goal − C)`, goal = 35 + 30 (deficit ≤ target, else −20 × overshoot/2pp) + 20 (debt ok) + 15 (golden).
Premium `= 0.5% × (60 − C)/60` below 60, `−0.2% × (C − 60)/40` above.

### Wealth effect
`equityIndex += 0.05 × (MY index/1000 − equityIndex)` daily; consumption `+= 3%/365 × 450bn × (equityIndex − 1)`.

### Validation
`tests/phase7-world.test.ts`: official opening GDP, revenue and deficit; exact monthly reconciliation with the new flows;
separate RNG stream; SOE dividends are wealth-neutral; capex cuts lower production; Khazanah blocks; fuel, wheat, steel
and palm policies; tariffs, diversion, retaliation, agreements; glide path, credibility, escape clause; development and
public capital; wealth effect; schema-6 round trip, schema-5 migration and corrupt-save rejection.

### Historical limitation (addressed by D-051 below; not empirical calibration)
The engine's demand multiplier is large: removing the RON95 ceiling lowers real GDP by ~1.8% after 200 days in a
controlled run, and oil +50% by ~4.5% (model 1 gave ~5.6% before this change). Real-world estimates are several times
smaller. The cause is the existing feedback between unemployment, confidence and the propensity to consume, not the new
systems; D-051 reduces the repeated behavioural amplification. Further empirical calibration remains open; the historical numbers below and new controlled experiments use different shock durations and should not be directly compared.

## Schema 7: ten commodities and 60 securities
Prices: `p_c = exp(cycle_c + link_c + episodes_c)` with links coal `0.3 ln oil + g`, palm `0.4 ln oil + 0.3 g`, rubber
`0.3 ln oil + 2g`, rice `0.1 ln oil`, wheat `0.25 ln oil`, steel `3g`, aluminium `0.2 ln oil + 2g`, copper `3g` (g = global
cycle); LNG `= gasIndex × e^{cycle}`, gasIndex `+= (oil − gasIndex)/180`. Imported inputs are priced commodity by commodity
(`COMMODITY_IMPORT`); utilities' energy index `= 1 + 0.15(oil−1) + 0.25(LNG−1) + 0.25(coal−1)`. Food subsidy
`= σ × Σ_{wheat,rice} imports × FX × max(0, p − 1)`. Rubber VA `= 2.5bn × 0.7 × volume × price × FX`, 90% of its change
to households. Company revenue `× (1 + Σ s_c (p_c − 1))` for commodity-priced producers (Press Metal: aluminium 0.8).
Covered by `tests/phase7-world.test.ts` ("ten commodities", schema-6 migration).


## D-051: bounded household feedback and funded spending (31 October 2026)

The correction applies to future ticks of all campaigns, including existing saves; it does not rewrite previous
reports, cash, debt, RNG or the opening baseline. No fields or schema version change. A loaded old MPC moves toward
its new target gradually rather than jumping at load. Coefficients are fictional gameplay assumptions, not fitted
Malaysian estimates. Approval and wealth scoring still compare living standards with campaign-opening income.

### Confidence and precautionary saving

Use calendar-normalised real disposable income per person from monthly reports. At close, compare current income
with the report up to three months earlier: `trend = clamp((income / prior)^(1/n) − 1, −0.03, 0.03)`.
`n = min(3, prior report count)`; before any report use the opening income with `n = 1`. Thus a permanent level loss
stops being a negative trend after three stable intervals. Nonpositive current/prior incomes use −3%/+3% respectively
(current takes precedence); this avoids undefined ratios without claiming a precise growth rate at zero income.

- `inflationStress = max(0, coreInflation − 0.03)` (pump-price CPI remains excluded in model 2).
- `confidenceTarget = clamp(0.6 − (u − naturalU) − 0.5·inflationStress + 1.5·trend + 0.15·(risk − 0.5), 0.1, 0.95)`.
- `confidence += 0.25·(confidenceTarget − confidence)` monthly.
- `mpcTarget = 0.86 + clamp(0.06·(confidence − 0.6) − 0.1·inflationStress, −0.025, 0.015)`.
- `mpc += clamp(0.25·(mpcTarget − mpc), −0.005, 0.005)` monthly.

Wage losses still reduce actual disposable income. The separate direct unemployment penalty in MPC is removed.
Confidence's investment-growth contribution is `0.01·(confidence − 0.6)` per year (formerly 0.03); the multiplier on
net household credit-growth demand is `clamp(1 + 0.5·(confidence − 0.6), 0.8, 1.2)` (formerly confidence/0.6).
Both use the incoming month's confidence as before, while profitability, utilisation, rates, repayment demand and
bank supply retain their existing channels. No price, GDP or employment outcome is capped to force recovery.

### Household funding and fuel accounting

Daily desired cash spending uses the existing 50/50 current/permanent-income blend plus the equity wealth effect.
It is limited to `max(0, disposable + savings)`. This prevents paper gains or stale income expectations from financing
unavailable spending. Already-approved new credit is spent separately as before, with the existing bank loan/deposit
entries; the cap does not manufacture loans or count new credit twice.

The fuel-price delta reallocates that funded envelope: `fuelAdjustment = min(fuelDelta, C)` and nonfuel basket spending
is `C − fuelAdjustment`. If C is zero, both are zero. Higher fuel costs reduce other purchases; lower fuel costs release
basket spending within the same total cash outlay. If extra fuel costs exceed the envelope, other purchases reach zero
and fuel spending is affordability-rationed. Desired fuel volume/CPI pricing remains a reduced-form approximation.
Savings change by `YD − C`, and month-to-date total consumption records `C + newCredit`. Previously subtracting the
extra fuel bill only from basket demand accidentally booked that amount as household saving.

**Remaining boundary:** savings are the existing aggregate net liquid position. If mandatory tax/debt deductions alone
exceed income plus savings, the signed shortfall remains visible; discretionary spending is zero. This patch does not
forgive that shortfall, create emergency credit, or introduce a full household arrears/default waterfall. Normal
campaigns in the controlled four-seed runs never exhausted savings; explicit low-cash tests exercise the funding cap.

### Verification

`tests/household-behavior.test.ts` covers recovery after a persistent income-level loss, bounded/gradual saving responses,
separate investment/credit confidence channels, exhausted resources, fuel reallocation, read-only previews, actual daily
cash settlement and deterministic save/resume. Existing invariant tests cover fiscal/bank identities and policy lags.
`node scripts/household-balance.mjs artifacts/household-balance.json` runs paired 24-month baseline, temporary oil,
subsidy-removal and recession experiments across four seeds, with fixed-MPC and fixed-confidence diagnostic variants.
The script is dev-only. See `docs/game-balance.md` for measured before/after results and scoring limitations.

## D-052–D-054: explainability, risk signals and scenario settings

The read-only explanation module reports arithmetic contributions, not causal policy estimates:
- Unemployment: `−Δemployed / previousLabourForce + employedNow·(1/previousLabourForce − 1/currentLabourForce)`;
  multiply by 100 for percentage points. Previous workforce is reconstructed from last reported jobs/unemployment.
- CPI: each weighted basket price change from opening, with pump-price weight in national model 2. A reconciliation
  row separates any difference between the published CPI and prices under a just-effective policy awaiting daily settlement.
- Approval: `0.35 × componentWeight × (componentTarget − previousApproval)` at the latest monthly close.
- GDP: sector nominal value added annualised by actual calendar days; resources/net product taxes are the residual
  needed to reconcile total nominal GDP. These are explicitly not real-growth contributions.
- Treasury: month-to-date receipts minus paid outlays plus borrowing minus principal plus net SWF transfers.

Alerts are read-only daily UI signals. Treasury coverage = cash / average paid daily gross outlays, using the last
closed month or settled days so far before that. No estimate exists before spending is observed. This excludes future
revenue/financing and is not an insolvency prediction. Housing pressure = `100·(rentIndex/wageIndex − 1)`, not an observed
rent-to-income ratio. Estimated project cost = spent + remaining real work × current construction price, compared with
base cost. Completed/cancelled projects are excluded. Default warning thresholds: 14 days treasury, 6% unemployment,
25% housing pressure, 20% project overrun. Critical thresholds: half the treasury limit; +2, +15 and +20 percentage
points respectively for the other rules. A 10% release margin avoids boundary chatter. Alerts do not post money,
change RNG or alter economic decisions; optional pause only controls the existing clock.

New export-slump and energy-shock scenarios use existing slowdown/oil event templates, at normal magnitude for
180/90 days. Their future hazards equal the balanced scenario. Existing recession hazards remain unchanged and are
now explicitly shown before campaign creation. Tests cover explanation reconciliation, read-only behaviour, alert
entry/escalation/recovery, disabled rules, invalid preferences, project estimates and scenario save/resume. Browser
coverage verifies metric clicks, critical versus warning pause, deduplication and persisted preferences.

## D-055: national growth trend (model 3, schema 8)

New national campaigns use model 3; model-1/2 saves keep their previous trend and calibration (`trendFor`, `calibrationFor`).

| Parameter (`NATIONAL_TREND`) | Model 3 | Model 1/2 (`LEGACY_TREND`) | Used in |
|---|---:|---:|---|
| Labour productivity growth | 2.3%/yr (2.6% before D-056) | 1.5% | sector productivity, wage rule |
| Workforce trend | 1.6%/yr | 1.0% | `LF *= 1 + trend/12`, then the 6% monthly pull toward `employed/(1−u*)` |
| Natural unemployment `u*` | 3.0% | 3.5% | workforce pull, Phillips curve, confidence, NPLs |
| Capital growth `g0` | 4.0%/yr | 3.5% | calibration (`I0 = K(δ+g0)`, private capital share, residual exports) and the investment rule |
| Potential growth | 3.6%/yr (3.8% before D-056) | 3.5% | OPR output gap path and growth-score benchmark (`growthTarget`) |
| Other receipts | × nominal GDP index | fixed | see below |
| Opening budget path | 6%/yr, monthly | none | inherited ministry plans |

Steady-state logic: output is demand-determined (`Y = (I−A)⁻¹ f`, capped by capacity), so growth equals the growth
of autonomous demand (exports, government purchases, resources) with consumption and investment following income
and utilisation. Supply then has to match: seven-sector potential ≈ workforce + productivity ≈ 4.2%. Resources (~8%
of GDP) are flat in volume at PETRONAS's opening capex, giving 3.8% overall. Opening capital growth is 4.0% rather
than 4.2% because property & construction's residual exports turn negative above ~4.1%. Utilisation closes the
small gap through the investment rule.

**Inherited budget path.** Each operating budget category starts with a ministry plan:
`monthly = base × (1+m)`, `m = 1.06^{1/12} − 1`, applied on the 1st of every month from February 2027 (`everyMonths = 1`,
60 steps). After twelve steps the budget is 6% higher, which is trend real growth plus the 2% inflation target. Steps are monthly
so real purchases do not fall for a year and then jump. They are disclosed once (news item and Economic controls),
not logged monthly. A manual budget or a cancelled plan stops that category's indexation (D-030). Development capex
(`fiscal.developmentAnnual`) stays at its 2027 level, as Malaysia's development allocation has been broadly flat.

**Revenue buoyancy.** `otherPublicReceiptsMonthly = residual0 × nominalGdpAnnual / openingNominalGdp`, using the last
closed month's run rate (the opening value before the first close). It still never responds directly to tax sliders.
Unit elasticity is an assumption; resource revenue keeps its own commodity-price drivers.

**Results** (no-event runs, see `docs/game-balance.md`): growth ~3.3–3.6% with unemployment flat at 3.0% in a
noise-free run; 8-seed noisy mean 3.35% with unemployment ~3.2–3.4%. Unchanged policy keeps the deficit near its
opening level (~3.9%), so fiscal-rule credibility still falls without consolidation. **Open:** CPI settles near 1.3%/yr,
below the 2% anchor, because world commodity prices are flat in nominal USD while US prices trend at 2.5%, and
expectations put only an 8% monthly weight on the target. `tests/trend.test.ts` covers the steady opening, the 24-month
no-event path, plan indexation, buoyant receipts, the shared potential and schema-7 compatibility.

## D-056: macro validation and demand recalibration (model 3)

`tools/multipliers.ts` (dev/test only; `npm run multipliers -- --seeds …`) runs a baseline and one shocked campaign per
experiment with the same seed, random events and commodity episodes disabled, the shock starting 1 Feb 2027. A
harness-only oil event template sits outside `EVENTS`, so the weekly draws stay aligned. Definitions:

- Spending multiplier = Σ ΔrealGDP / Σ Δreal government purchases over months 1–12 (4q) or 1–23 (8q); the shock is
  +1% of opening GDP a year across health, services, safety, development and administration (and their plans).
- OPR: the policy rate is held +25bp / +100bp above the baseline run's daily path; GDP gap averaged over months 21–23.
- Sacrifice ratio = cumulative output loss (%-years, +100bp) / fall in YoY inflation at month 23.
- Okun = Δunemployment (pp) / Δreal GDP (%) in months 10–12 of the spending shock.
- Levy multiplier = −Σ ΔrealGDP / Σ Δreal levy receipts, months 2–13 (+1pp, effective 1 March).

| Metric (mean of seeds 2027, 11, 42, 201) | Before (D-055 only) | After (D-056) | Benchmark |
|---|---:|---:|---|
| Spending multiplier, 4q / 8q | 1.17 / 1.13 | 0.81 / 0.79 | 0.3–0.8 / 0.3–0.9 |
| OPR +25bp, real GDP after 8q | −0.47% | −0.13% | −0.25 … −0.02% |
| OPR +100bp, real GDP after 8q | −2.21% | −0.55% | — |
| Okun coefficient | 0.65 | 0.29 | 0.1–0.45 |
| Sacrifice ratio | 5.8 | 2.7 | 0.5–4 |
| Oil +10%, real GDP after 4q | −0.87% | −0.38% | −0.3 … +0.3% |
| Oil +50%, real GDP after ~200 days | −3.25% | −1.76% | — |
| RON95 eligibility removed, real GDP after ~200 days | −1.38% | −0.28% | — |
| Consumption levy +1pp, multiplier (4q) | 2.25 | 0.90 | 0.1–0.6 |

Changes (all `NATIONAL_DEMAND`, model 3 only):
- `desired = MPC·(0.2·YD + 0.8·P) + wealthSpend`; `P ← P·(1 + 0.059/365) + 0.002·(YD − P)`: permanent income expects
  trend nominal growth and adjusts with a ~1-year half-life.
- 12% of the non-fuel cash basket buys finished imports (`importedConsumption`), also removed from calibrated `C0`.
  These imports are a demand leakage; they are not added to the reduced sector trade account.
- Hiring moves 2% a week toward output-implied labour (labour hoarding); the workforce pull is 15% a month.
- Investment `g −= 0.2·Δlending rate`; household credit demand `× clamp(1 − 4·Δrate, 0.2, 1.6)`.
- OPR target `+ 0.75 × output gap`.
- Price targets index non-labour margins to `producerAnchor` (basket prices without the levy or pump prices).
- Visitor demand `× (1 − 0.75·Δlevy)`; PETRONAS effective capex `× gasIndex^0.5` (lagged oil/LNG index).

**Remaining gaps, documented rather than forced:** the 4-quarter spending multiplier sits at the top of the range
because the model has no crowding-out channel besides the OPR: public purchases have ~15% import content, so the
direct effect alone is ~0.8. Oil and levy shocks are still about 1.3–1.5× the range. The oil windfall (petroleum
tax, PETRONAS cash) is saved unless the player spends it, and households bear the full levy. Both are player-visible
levers rather than hidden amplifiers. Coefficients remain fictional game calibration checked against published
ranges, not estimated Malaysian parameters. `tests/multipliers.test.ts` locks these results in on two seeds.
