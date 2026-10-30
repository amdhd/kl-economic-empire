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
