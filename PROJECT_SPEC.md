# KL ECONOMIC EMPIRE

**Codex-ready product requirements document (PRD), technical specification, economic design and implementation plan**  
**Version:** 1.0 — 31 October 2026  
**Project type:** Single-player, local-first, browser-based economic strategy simulation  
**Platform:** Desktop-first web app, works on macOS via local development server  
**Status:** Specification for implementation; no code or game mechanics are claimed to have been implemented yet

> **Instructions to Codex:** Treat this document as the source of truth. Implement incrementally, write tests, and validate each milestone in a running browser. Read the entire document before planning. Do not replace the specified economic simulation with random-only stock prices, fake UI controls, or an instant turn-based calendar. If a decision is ambiguous, choose the simplest deterministic, testable implementation consistent with the invariants here, and record the choice in `docs/decisions.md`. Ask only when a choice genuinely blocks the next milestone.

---

## 1. Vision

Build **KL Economic Empire**, a fictional economic and political strategy game set on a recognizable interactive **3D map of Kuala Lumpur**. The player is the **President of an autonomous Kuala Lumpur** in an alternate-history universe. The player's tools are financial and economic—not the road-building, individual-resident simulation or zoning of Cities: Skylines.

The player manages:

- Local fiscal policy, tax rates and government spending.
- A city government's treasury, deficits, debt and public wealth.
- A government-owned **sovereign wealth fund (SWF)** investing in a simulated market.
- Interconnected economic sectors, businesses, labor markets, consumer demand, inflation, banking and investment.
- Government credibility, financial stability, affordability, employment and citizen satisfaction.
- Exposure to external global/macroeconomic shocks that cannot all be controlled by local policy.

The 3D map is the experiential centerpiece: pan around KLCC, TRX, Bukit Bintang, KL Sentral, Bangsar and surrounding KL; interact with real-looking buildings and **verified business-location markers**; open panels showing **fictional simulated** company performance.

### Core distinction

This is **not** an accurate representation of the Malaysian government. Real Kuala Lumpur does not have a president with these powers, nor does city government independently set federal corporate income tax. Make the game clearly and consistently **alternate-history/fictional**. Any real company names and ticker symbols are used for context; game prices, financials, news, interventions and future events must be **fictional simulations**, never portrayed as actual financial data or investment advice.

### Audience and constraints

- Built for **personal use** by one player.
- Prioritize low recurring cost: **target RM0/month** on a local machine.
- **No backend needed** for MVP, no login, no real-time financial market data, no paid APIs.
- Use Codex to implement and iterate on a clean TypeScript codebase.
- Attractive, polished, game-like visuals; **not** a generic SaaS analytics dashboard.
- Prefer robustness, measurable simulation rules, readable code, explicit assumptions and testability over feature quantity.

---

## 2. Confirmed player preferences and final scope

These supersede any earlier session suggestions that conflict with them.

| Topic | Final decision |
|---|---|
| Game type | Economic-policy president; **not** city construction or road placement |
| Geography | Interactive **3D Kuala Lumpur** map, grounded in OSM building footprints / available heights |
| Malaysian stocks | **20 real Malaysian-listed companies**, with **simulated** stock prices, financials and scenarios |
| US stocks | **20 real S&P 500 company names/tickers** (e.g., NVIDIA, Meta), with **simulated** prices and financials |
| Total equities | **40 simulated equities** in a unified in-game market system |
| Fund trader | **Government sovereign wealth fund** only; not a personal player's brokerage account |
| Economic model | **Advanced interconnected economic simulation**, built progressively and tested |
| Timeline | Continuous clock displayed as **game minutes and hours**, like a city simulator |
| Speed controls | **Pause, 1×, 2× and 3× only** (5× added in §25); no instant month advances. Two paused-only safe skips were added in §26 |
| Campaign | **First 24 in-game months**, with an end-of-campaign score and optional continuation later |
| Win objective | Multiple goals: **public wealth, economic growth, citizen satisfaction and financial stability** |
| Hosting | Local desktop browser; optional static deployment later |
| Data | Fictional market data; no real-money trading or actual live stock feed |

### Hard non-goals for MVP

Do **not** implement interactive road building, bulldozing, zoning, traffic pathfinding, individual citizen agents, fully simulated construction logistics, a custom 3D mesh reconstruction of all Kuala Lumpur, multiplayer, cloud saves, real-money trading, actual Bursa/NASDAQ live market feeds, AI-generated agent chat, or a VR/Unreal/Unity environment.

---

## 3. Time system and simulation pacing — critical, replaces turn-based design

**There is no “Next Month” or “End Turn” button.** Time moves continuously while unpaused. The game displays **day, hour and minute**; the simulation advances regularly, while daily and monthly accounting events occur automatically at clock boundaries. Player policy decisions can be made during play and applied with explicit effective dates.

### Default game clock

- **Start:** `2027-01-01 08:00` **in fictional game time**, timezone `Asia/Kuala_Lumpur` for the KL world. Historical or future dates are game fiction, not forecasts.
- **Base rate:** `1 real second = 20 in-game minutes` at **1×**.
- **2×:** `1 real second = 40 game minutes`.
- **3×:** `1 real second = 60 game minutes`.
- **Paused:** time fully stops, no passive accrual or events.
- Use real calendar month lengths; don't hardcode every month as 30 days.
- **No skip-to-date, month, day, next event, fast-forward beyond 3× or offline catch-up** in the player UI.
- If the tab becomes hidden or the browser suspends: **auto-pause** (and persist state). Do not jump hours/months when the player returns.
- Save/reload restores exactly the prior game clock and state; save must not trigger accrual.
- Start/pause/1×/2×/3× controls always visible in the main HUD.
- Internal bulk simulation functions may exist **only for automated tests and dev tooling**, never exposed as a player cheat/control.

**Pacing examples (approximate):**

| Event | 1× real time | 3× real time |
|---|---:|---:|
| 1 game hour | 3 seconds | 1 second |
| 1 game day | 72 seconds | 24 seconds |
| 30-day game month | 36 minutes | 12 minutes |
| 24 months (~730 days) | 14.6 hours | 4.87 hours |

These are **full-clock elapsed running durations**, excluding time spent paused. A 24-month campaign is intended to require meaningful play; don't let users bypass it accidentally.

### Update cadence

- **Visual clock:** update at display-frame cadence as needed, derived from accumulated simulated milliseconds, without recalculating the economy every frame.
- **Hourly tick:** deterministic economic micro-steps, price discovery when markets open, credit/liquidity signals and event counters. At 3× this is approximately one simulated hour per real second; keep it light.
- **Daily boundary:** company sales/cost accrual, household spending and wages where appropriate, public-service delivery accrual, dynamic demand / FX, journal entries, stock history downsampling, economic headlines, weekly/monthly scheduling.
- **Weekly boundary:** sentiment, labor intentions, ongoing projects, portfolio risk reports, some policy reactions.
- **Month-end boundary:** income statements and tax settlement, macro aggregates, public budgets, interest payments, corporate dividends when scheduled, revaluation, approval, financial reports and dashboard series.
- **Policy effective date:** taxes generally effective the **next calendar month**; spending changes can affect future daily outlays subject to budgets and project lags; trading orders act only when that market is open and liquidity permits.
- **Markets:** simulate separate Bursa and US exchange trading calendars with local opening hours, weekends, and a maintainable holiday schedule. For MVP, accurate weekends/time zones are mandatory; holiday list may be a documented approximation. Never trade a closed market. Explicitly display **KL time** and each exchange's **open/closed** status.

### Implementation mechanics

Use a **fixed-step accumulator** driven by real elapsed time while the app is visible and unpaused:

1. Measure `deltaRealMs` from a monotonic clock (e.g. `performance.now()` in the browser).
2. Clamp unusually large frame gaps; **auto-pause** on tab visibility loss to prevent background catch-up.
3. Convert to `deltaGameMs = deltaRealMs * speed * 20 game-minutes/real-second` using a precise, well-defined unit mapping.
4. Accumulate simulated milliseconds; execute **one pure hourly economic tick** for each hour boundary crossed; process day/week/month boundary events in stable order.
5. Render a continuously interpolated displayed game time and throttle UI/store subscriptions so the entire React tree does not rerender every frame.
6. Save scheduler and pending actions with a versioned snapshot. All random draws must come from persisted seeded PRNG state.
7. Keep deterministic simulations: identical initial state + identical scheduled actions + identical hourly tick count => identical result independent of screen frame rate or machine speed.

**Important design detail:** visual time may progress by minutes continuously, but economic accounting must be based on deterministic discrete ticks rather than elapsed browser rendering frames. Do not double-process month-end because of reload.

---

## 4. Player fantasy, decision loop and campaign

### Central fantasy

“You have been given broad economic authority over a fictional autonomous Kuala Lumpur. Can you make it richer, more innovative and more livable without wrecking public finances or causing an economic crisis?”

### Repeating real-time decision loop

1. Watch the 3D KL skyline, evolving dashboard and news ticker as time moves.
2. Inspect local sectors, real-named companies and simulated share prices.
3. Adjust tax rates, fiscal budgets, borrowing policy and SWF asset allocation.
4. Buy/sell Malaysian and US simulated shares through the sovereign fund, respecting trading hours and fund liquidity.
5. Observe hourly and daily responses; review weekly/monthly economic reports.
6. React to recessions, credit tightening, inflation, tourism changes and company-specific shocks.
7. Balance the four campaign objectives to maximize the final 24-month score.

### End of 24 months

- Automatically pause at the campaign end boundary (24 calendar months after start).
- Produce an interactive **Economic Presidency Report**: opening/closing indicators, time series, important policies, major events, portfolio performance, government income/expenses, debt and approval.
- Final score 0–100, with hard failure penalties or caps for insolvency/catastrophic unemployment/approval.
- Game-over report should explain *why* the score changed, not merely show arbitrary numbers.
- Post-campaign **free play** may be added after MVP; never force it into first implementation.

### Proposed scorecard, adjustable after balancing

| Metric | Weight | Measurement principles |
|---|---:|---|
| **Growth/productivity** | 30% | Real value-added GDP, productivity, stable employment; reject purely nominal inflationary growth |
| **Public net wealth** | 30% | Treasury + SWF assets + relevant public assets − public liabilities, adjusted for sustainable finance |
| **Citizen satisfaction** | 25% | Employment, real disposable income, housing affordability, service quality, inequality proxy |
| **Stability** | 15% | Inflation deviation, debt service capacity, credit instability, excessive volatility |

Start with plausible **fictional** baselines and transparent objective functions in source constants. A starting aspirational victory threshold is 80/100 with approval >=60/100 and no government insolvency. Tune these thresholds using seeded campaign replays and documented outcomes; don't overfit to one strategy.

---

## 5. Map, geography and 3D experience

### Recommended stack

- **MapLibre GL JS** (Mapbox-style vector map renderer; 3D `fill-extrusion` for building footprints).
- **OpenFreeMap** for public hosted OSM vector tiles at the start. Use valid map source/layer names from the selected style; **inspect the style JSON instead of assuming source-layer property names**.
- OpenStreetMap data attribution displayed at all times; retain whatever provider attribution the tiles require.
- Use a standard basemap with **3D extruded buildings**, shadows/lighting where technically supported, subtle tilt and cinematic pitch; avoid promising photorealistic Google Earth quality.
- Suggested opening center **KLCC**, approximately `[101.7123, 3.1578]` in `[longitude, latitude]` order, with pitch around `55–65°`, zoom around `15–16` and bearing chosen for attractive skyline composition.
- Some OSM buildings lack heights: use documented height fallback values. KL skyline will be approximate; don't invent accurate tower geometry.
- Use CSS/React overlays and HTML markers for polished labels; use map layers/feature clustering for dense markers and good performance.

### Map features

- Zoom, pan, rotate, tilt; reset camera / return to KLCC.
- Hotspots/districts: **KLCC, Bukit Bintang, TRX, KL Sentral, Bangsar** at first; add others when validated.
- Click a company marker to open a company panel; clicking a generic building footprint may show only building/OSM information if available, **not a guessed company owner**.
- Company marker may represent a verified office, headquarters, branch or major property in KL; label the location type.
- If a company lacks a verified KL point, keep its stock tradable in the market UI but do not fabricate a KL map position.
- Optional district overlays: employment, average rents, economic activity, satisfaction (aggregated fictional district data, explicitly marked synthetic).
- Optional market-stress / business-performance overlays in later phases.
- 3D/map canvas should remain smooth when dashboard and company data update.

### Map licensing / asset rules

- Preserve map provider, OSM and any map style attribution as required.
- Never hotlink/copy copyrighted logos or proprietary map tiles without permission. Default to ticker-name badges / colored monograms.
- Don't scrape arbitrary map data or assume publicly shared service offers production SLAs. For scale later, consider self-hosted **Protomaps PMTiles** with licensed OSM-derived tiles on Cloudflare R2 and MapLibre rendering.

---

## 6. Technology and engineering architecture

### Final MVP stack

| Layer | Technology | Why |
|---|---|---|
| Frontend build | **Vite + React + TypeScript (strict)** | Fast local iteration, no unnecessary server |
| Styling | **Tailwind CSS** + reusable UI primitives | Consistent game visual system |
| Map | **MapLibre GL JS** | Open 3D building extrusions, camera and markers |
| Tiles | **OpenFreeMap** | Low-cost hosted vector maps |
| State | **Zustand** or equivalent thin store | HUD/UI state, user commands |
| Simulation | **Pure TypeScript modules**, fixed-step event scheduler | Reproducible and testable economics |
| Data persistence | **IndexedDB preferred** via a small typed storage wrapper; LocalStorage acceptable for early vertical slice | Versioned saves and history |
| Charts | **Recharts** | Price, profit, GDP, CPI, yield and approval history |
| Testing | **Vitest** for economic unit/invariant tests; **Playwright** for browser end-to-end | Prevent hidden simulation and rendering bugs |
| Runtime | Browser local development server | RM0 hosting and API bills for personal use |

Do not add a backend, Firebase, AWS, real-time websocket stock feed or commercial map API just because they are familiar. The entire game can run client-side. If performance profiling demands it, move the economic engine to a **Web Worker** in a later milestone without changing its deterministic API.

### Suggested repository structure

```text
kl-economic-empire/
├── PROJECT_SPEC.md                 # This document
├── AGENTS.md                       # Codex instructions / definition of done
├── README.md                       # Install, run, controls, disclosures
├── docs/
│   ├── decisions.md                # Architecture decisions & assumptions
│   ├── economy-model.md            # Equations, units, policy mappings
│   ├── game-balance.md             # Baselines and test campaign results
│   └── data-sources.md             # Geography and public company metadata provenance
├── public/
├── src/
│   ├── app/                        # App entry and top-level layouts
│   ├── components/
│   │   ├── hud/
│   │   ├── panels/
│   │   ├── markets/
│   │   └── charts/
│   ├── map/                        # MapLibre integration, overlays, markers
│   ├── data/
│   │   ├── companies.my.ts
│   │   ├── companies.us.ts
│   │   ├── districts.ts
│   │   └── economic-baseline.ts
│   ├── engine/
│   │   ├── clock.ts
│   │   ├── scheduler.ts
│   │   ├── rng.ts
│   │   ├── accounts.ts
│   │   ├── households.ts
│   │   ├── sectors.ts
│   │   ├── companies.ts
│   │   ├── banks.ts
│   │   ├── government.ts
│   │   ├── stock-market.ts
│   │   ├── sovereign-fund.ts
│   │   ├── fx.ts
│   │   ├── events.ts
│   │   ├── indicators.ts
│   │   └── victory.ts
│   ├── store/
│   ├── persistence/
│   ├── types/
│   └── utils/
├── tests/
│   ├── economic-invariants.test.ts
│   ├── clock.test.ts
│   ├── market-calendar.test.ts
│   ├── market-orders.test.ts
│   └── campaign.test.ts
└── e2e/
    ├── map.spec.ts
    └── game-loop.spec.ts
```

### Core engineering rules

- Simulation is **data-driven**, separate from React rendering.
- Use **versioned GameState and save migrations**.
- All monetary amounts have explicit units (`MYR`, `USD`, per hour/day/month/year). Prefer integer subunits for monetary ledger and share fills; if units are large, avoid unsafe JS integer overflow. Document rounding rules.
- Persist PRNG internal state and scheduled events, not only a seed at game start.
- Make player actions typed commands with timestamps and validation; keep a structured policy/event ledger.
- Use bounded series/history retention or compact snapshots to avoid unbounded browser memory.
- Store daily aggregates and monthly reports; don't save every rendered minute to storage.
- Add error boundaries, state validation on load and graceful failure of map tile requests.
- Never mutate React state from MapLibre callbacks in unsafe mount/unmount loops.
- Format fictional finances correctly: money, yields, percentages, FX, real vs nominal, annualized vs monthly.

---

## 7. Equity universe — exactly 40 simulated stocks

### Model policy

- Display **real publicly traded company names and ticker symbols** but **fictional market prices, balance sheets, revenues, earnings, volatility and dividends**.
- Do not fetch real-time trading quotes. Never label synthetic prices as live or market forecasts.
- **20 Malaysia-listed stocks**, **20 US stocks that are verified S&P 500 constituents for the chosen reference date**.
- The lists below are **candidate seed universes** from well-known companies; **before finalizing data**, verify up-to-date listing status, exact exchange codes, official company names, splits/renames, S&P 500 inclusion and location information. Replace any removed/renamed/unlisted constituent with a verified alternative, preserving 20+20.
- For non-KL operating companies, provide only a verified KL office/asset map marker or none at all; trading doesn't require a marker.

### 20 Malaysia candidate equities

| # | Company | Bursa code (candidate; verify) | Primary simulation sector |
|---:|---|---|---|
| 1 | Malayan Banking Berhad (Maybank) | 1155 | Banking |
| 2 | CIMB Group Holdings | 1023 | Banking |
| 3 | Public Bank Berhad | 1295 | Banking |
| 4 | Tenaga Nasional Berhad | 5347 | Utilities |
| 5 | Telekom Malaysia Berhad | 4863 | Telecom |
| 6 | Maxis Berhad | 6012 | Telecom |
| 7 | Axiata Group Berhad | 6888 | Telecom |
| 8 | IHH Healthcare Berhad | 5225 | Healthcare |
| 9 | Sunway Berhad | 5211 | Property / diversified |
| 10 | Genting Berhad | 3182 | Leisure / diversified |
| 11 | Genting Malaysia Berhad | 4715 | Leisure / tourism |
| 12 | MR D.I.Y. Group (M) Berhad | 5296 | Consumer retail |
| 13 | YTL Corporation Berhad | 4677 | Infrastructure / diversified |
| 14 | YTL Power International Berhad | 6742 | Utilities / infrastructure |
| 15 | Press Metal Aluminium Holdings | 8869 | Materials |
| 16 | PETRONAS Chemicals Group | 5183 | Chemicals / materials |
| 17 | PETRONAS Gas Berhad | 6033 | Energy infrastructure |
| 18 | Sime Darby Berhad | 4197 | Industrial / consumer |
| 19 | CelcomDigi Berhad | 6947 | Telecom |
| 20 | Gamuda Berhad | 5398 | Construction / infrastructure |

### 20 US candidate S&P 500 equities

| # | Company | Candidate ticker | Primary simulation sector |
|---:|---|---|---|
| 1 | NVIDIA | NVDA | Semiconductors / AI |
| 2 | Meta Platforms | META | Digital advertising |
| 3 | Microsoft | MSFT | Software / cloud |
| 4 | Apple | AAPL | Devices / services |
| 5 | Amazon | AMZN | Commerce / cloud |
| 6 | Alphabet (Class A) | GOOGL | Advertising / cloud |
| 7 | Broadcom | AVGO | Semiconductors / infrastructure |
| 8 | Tesla | TSLA | Automotive / energy |
| 9 | JPMorgan Chase | JPM | Banking |
| 10 | Visa | V | Payments |
| 11 | Mastercard | MA | Payments |
| 12 | Berkshire Hathaway (Class B) | BRK.B | Diversified |
| 13 | Exxon Mobil | XOM | Energy |
| 14 | Costco Wholesale | COST | Consumer retail |
| 15 | Walmart | WMT | Consumer retail |
| 16 | Procter & Gamble | PG | Consumer staples |
| 17 | Advanced Micro Devices | AMD | Semiconductors |
| 18 | Netflix | NFLX | Entertainment |
| 19 | UnitedHealth Group | UNH | Healthcare |
| 20 | Palantir Technologies | PLTR | Enterprise software |

**Implementation note:** normalize ticker symbols internally (e.g. `US:BRK.B`, `MY:1155`), never rely on bare labels as unique IDs. Reconfirm whether each example is a current member of the S&P 500; the universe can change with time. Seed plausible but clearly fictional initial market caps, operating exposures, yields, price histories, earnings, volatility and share supply.

### Geographic and economic exposure

- Malaysia-stock financial results depend on a weighted combination of **KL economic activity**, **rest-of-Malaysia demand**, and **global conditions**. A Malaysian issuer may generate significant revenue outside KL; do not apply full KL tax effects to worldwide earnings.
- US company results depend primarily on **US/global growth**, interest rates, sector shocks, and USD conditions. KL policies have little or no direct influence except through explicitly modeled small exposures.
- External companies may be affected by KL government's SWF trading only under a sufficiently significant order-to-liquidity ratio; local government spending should **not** cause NVIDIA's underlying global revenue to jump.
- Treat corporate taxes and dividends based on **model jurisdiction and tax exposure**. Kuala Lumpur's fictional corporate tax affects taxable KL profits/exposure, not the entirety of global company earnings.
- Use fictional MYR/USD FX, explicit conversion fees/spreads, and daily mark-to-market. Keep fund cash balances and trading settlement rules explicit.

---

## 8. Economic model — advanced, interconnected but feasible

### Philosophy

Economic realism comes from **coherent flows, constraints, lags and consistent accounting**, not adding dozens of randomized variables. Simulate households, firms, banks, government, labor and external demand as **aggregate agents**, not every resident or company in KL. Real named stocks are the 40 **featured securities** inside a broader aggregated economy. Avoid double counting.

### Minimum model sectors

1. **Banking & credit** — household/company lending, interest rates, defaults, bank profits and credit availability.
2. **Property & construction** — commercial activity, public infrastructure projects, rents, construction demand.
3. **Utilities & energy** — energy price shocks and input cost impacts across sectors.
4. **Telecommunications & technology** — productivity and corporate-service demand.
5. **Consumer, retail & tourism** — disposable income, visitor demand, spending sensitivity.
6. **Healthcare and public services** — health capacity, employment, citizen satisfaction.
7. **Industrial/materials** — local/nonlocal input and export demand.
8. **External US/global market** — tech cycle, foreign interest rates, FX, imports/exports.

Use 6 core KL sectors for initial MVP, extend to 8+ in advanced phase. Each sector has explicit input/output coefficients, labor share, capital share, demand sensitivity and public-sector exposure.

### Economic agents and stocks versus flows

- **Households**: population aggregate, employed/unemployed, hourly/monthly labor income, taxes, savings, consumption, rent, sentiment.
- **Companies**: revenues, operating expenses, wages, taxes, debt, capital, profit, reinvestment, dividend policy, share count, synthetic price.
- **Banks**: available credit, loans, deposit liabilities (or documented reduced-form approximation), interest income, credit risk. Avoid creating revenue as cash from nowhere.
- **Government**: treasury cash, recurring tax receipts, grants/transfers, operating and capital spending, debt principal, interest and fiscal position.
- **SWF**: legally/accountingly separate holdings and MYR/USD cash; equity transaction ledger, valuations, dividend income, transfer rules.
- **External sector**: national/global macro, tourism, exports/imports and USD exchange rate.

### Unit system

Define a compact and explicit accounting convention, e.g.:

- Treasury/fund stocks: integer **MYR cents** or another overflow-safe fixed-point representation.
- Per-day/per-month activity: **MYR flows** with documented conversion and rounding.
- GDP: **MYR value added per period**, not sum of company gross revenue.
- CPI: indexed level, monthly/annual inflation calculated from level changes.
- Unemployment, interest rates, yields and taxes: decimals internally (0.05 = 5%).
- FX `MYR_per_USD` with fixed snapshot at trade/valuation event.

### GDP and economic aggregates

Use a simplified **sector value-added model** (or an explicit Leontief-inspired input-output system):

`Sector value added = Sector gross output - Intermediate input purchases`

`KL nominal GDP = Sum of resident KL sectors' value added + correctly modeled net product taxes/subsidies`

`Real GDP = Nominal GDP / Price-index deflator * Base deflator`

Keep money flows and value-added GDP separate. Don't count a bank loan, a stock purchase, SWF asset appreciation or government bond issuance as GDP. Government spending may contribute via production of final services and demand for contractors, **not simply as a magic GDP multiplier**.

### Household demand

Example transparent reduced-form model (tunable):

`DisposableIncome_t = Wages_t + Transfers_t + OtherHouseholdIncome_t - HouseholdTax_t - DebtService_t`

`ConsumptionBudget_t = DisposableIncome_t * MPC_t + DrawdownFromSavings_t`

`MPC_t = clamp(baseMPC - unemploymentSensitivity * unemploymentRate_t - inflationUncertaintySensitivity * inflationShock_t, minMPC, maxMPC)`

Allocate consumption by sector; spending cannot exceed available resources and credit limits. Model housing/rent pressure separately for satisfaction. Keep households aggregated rather than individually simulated.

### Corporate income statement (featured companies)

For each company, internally consistent accounting:

`Revenue = AddressableDemand * MarketShare * PricingFactor + ExternalDemandContribution`

`EBITDA = Revenue - LaborCost - EnergyCost - IntermediateInputs - OtherOperatingCosts`

`EBIT = EBITDA - Depreciation`

`ProfitBeforeTax = EBIT - InterestExpense + NonOperatingIncome`

`CorporateTax = max(0, TaxableKLProfit * FictionalKLTaxRate + OtherTaxableProfit * ExogenousTaxRates - AllowedCredits)`

`NetIncome = ProfitBeforeTax - CorporateTax`

`RetainedIncome = NetIncome - DeclaredDividends`

Track cash separately from profit and revenue. In MVP, apply simplified accrual-to-cash conversion; in advanced version add receivables/payables/capex/debt balances. Do not pay dividends greater than distributable earnings/cash unless a deliberate, documented debt-financed dividend rule allows it.

### Company investment & delayed effects

- Investment responds to expected after-tax return, credit availability, capacity utilization, interest rates and confidence.
- Capital investment has a **construction/implementation lag**, not instant productivity gains.
- Hiring adjusts gradually to order books and demand rather than jumping immediately.
- Tax increases can improve near-term collections but reduce future private investment; tax cuts reduce near-term receipts and may induce future activity, but **not guaranteed**.

### Inflation and interest rates

- CPI changes are driven by demand pressure, wage growth, imported input costs, energy shocks, productivity and expectations.
- Keep an **exogenous Malaysia policy rate** influenced by national economy, rather than permitting KL's fictional president to arbitrarily set the Bank Negara Malaysia OPR.
- KL borrowing rate = exogenous risk-free benchmark + sovereign/municipal fiscal risk premium (fictional autonomy).
- US benchmark rate is external; affects global valuations and FX. Avoid assuming a local tax cut determines US interest rates.
- Inflation should reduce **real** disposable income and change real GDP, rather than simply increasing all nominal series in lockstep.

### Banking and liquidity

Start with a documented reduced-form credit channel:

`NewCreditSupply = f(bankCapital, depositFundingProxy, policyRate, defaults, confidence)`

`CreditDemand = f(investmentPlans, householdIncome, rates)`

`NewLoans = min(CreditSupply, CreditDemand, policyConstraints)`

Bank assets, liabilities and income must reconcile within the chosen approximation. Do not just add a “credit boost” to companies' cash without a matching liability.

### Labor and satisfaction

- Employment demand depends on sector output, productivity, labor cost and lagged investment.
- Unemployment changes with aggregate new jobs and layoffs, bounded by working-age population.
- Average wages respond to inflation, tight labor markets and productivity, with realistic lags.
- Satisfaction = weighted combination of employment, **real** disposable income, rent affordability, service quality, trust and economic volatility.
- Avoid approving policies that improve citizen approval solely by printing arbitrary government payouts unless those payouts are funded.

### External trade and economic shocks

Model national Malaysia and global US states as stochastic but **seeded** external factors:

- Oil / electricity price spike
- Ringgit appreciation/depreciation
- Global AI / technology boom or correction
- Tourism demand boom or slump
- Banking credit crunch
- Property oversupply
- Floods / disruptions as fictional scenario events (avoid portraying an event as a factual real-world forecast)

Each event must document its first-order impacts, secondary propagation and duration. Economic events should persist for days/weeks/months and generate readable logs, not just an arbitrary one-frame number jump.

### Explicit economic causal chains

**Increase fictional KL corporate tax (18% → 25%)**
1. Effective next tax period; government receives more tax on profitable KL-taxable income, **all else equal**.
2. Corporate after-tax earnings and investment incentives decline.
3. Lower investment/hiring may reduce later consumer spending and GDP.
4. Stock fundamentals may weaken for KL-exposed companies.
5. Government may spend incremental receipts, creating positive counter-effects.
6. Long-run outcome depends on timing, investment response, baseline economy and public spending quality.

**Spend RM500 million on public transport**
1. Treasury cash (or approved funding) declines; project commitments and disbursements are recorded.
2. Contractors and employees receive expenditure over a **build schedule**.
3. Construction sector demand rises, with local/nonlocal leakage and capacity constraints.
4. Transport productivity/affordability benefits appear after implementation lag.
5. Long-term taxable output and citizen satisfaction may improve; no guaranteed direct financial profit.

**Buy RM100 million of Maybank shares with SWF**
1. Fund cash decreases by cost and transaction fees.
2. Fund acquires an equal-value equity asset at execution price.
3. Fund NAV is nearly unchanged on trade before fees/slippage; no treasury tax revenue is created.
4. Mark-to-market changes NAV as simulated shares move; cash dividends flow into fund cash.
5. If the fund sends dividends to government, record a documented **transfer**; this is not newly created system-wide wealth.

---

## 9. Stock market and sovereign wealth fund mechanics

### Separate exchanges

- `MY` exchange for Bursa equities denominated in **MYR**.
- `US` exchange for 20 simulated S&P 500 equities denominated in **USD**.
- Use market calendar/time zones so US stocks do not open at KL daytime hours by mistake. US timezone `America/New_York` (DST supported).
- A simulated trading day has within-day price evolution and accessible OHLC and volume series; use distinct hourly/daily/monthly chart resolutions.
- Closed-market quotes may show last close but no immediate execution. Pending orders can be canceled.

### Price discovery — never pure random walk alone

Use a **fundamental + demand + risk** model, e.g.:

`FundamentalValue_t = normalized(ExpectedEarnings_t * SectorPE_t * MacroDiscountMultiplier_t + NetAssetAdjustment_t) / SharesOutstanding`

`MarketPrice_t+1 = max(priceFloor, [Price_t*(1-adjustmentRate) + FundamentalValue_t*adjustmentRate] * (1 + SeededIdiosyncraticShock_t + SectorShock_t + MarketShock_t))`

- Price dynamics should react to earnings revisions, sector trends, rates, market risk appetite, known company events, liquidity and investor sentiment.
- Persist random state; enforce finite prices and reasonable volatility bounds.
- For a baseline game, market price-impact of the player's order can be modeled with spread/slippage; for large orders use proportional liquidity impact.
- Ensure **share splits** (if modeled) change share count and price inversely without creating wealth.
- Keep trading **fictional**; no live API requirement.

### SWF rules

- One government-owned portfolio; **no player-owned portfolio**.
- Fund has MYR cash, USD cash, holdings (ticker, units, cost basis), settled/unsettled orders, realized gains, unrealized gains and dividend receipts.
- Government budget and fund accounts are separate.
- A cash injection into the SWF is a treasury **transfer**, not government revenue.
- Fund investment profits do **not** instantly appear in treasury. A dividend/transfer policy must be approved, with timing and restrictions.
- No leverage or short selling in MVP. No negative fund cash balances. No margin.
- Apply transaction fees, bid/ask spread and FX spread. All costs are shown before confirming orders.
- Optional guardrail: max 20% of fund NAV in one equity; soft/hard concentration limits should be explicit.
- The user can set target allocations (MY / US / cash) in addition to placing individual orders.
- US holdings show both **USD local return** and **MYR base-currency return** including FX changes.

### Synthetic index

- `KL Economic Stock Index`: price or market-cap weighted index of the featured Malaysian companies, explicitly fictional.
- `US Game Index`: separate fictional index of the 20 US companies.
- Do **not** call either the real FTSE Bursa Malaysia KLCI or the actual S&P 500 index value; keep official names only to describe membership/context.

### Orders, timing and validation

- Buy/sell orders route to the relevant exchange, validate available settled cash, market status and quantity.
- Orders entered when closed become queued limit/market orders for next open, subject to user-configurable duration, OR are explicitly rejected with a visible reason. Pick one consistent rule and document it.
- Executions create ledger entries for cash movement, fees, position units and realized gains; prevent same-order double fills.
- Stock trades are **asset exchanges**, not expenses that reduce net worth at cost (other than fees/slippage).
- Initial fictional price levels should not be confused with current real quoted market prices.

---

## 10. Government policies, fiscal accounting and constraints

### Player-controlled policies

1. **Fictional KL corporate profit tax**, applied to only the model's KL-taxable exposure.
2. **Property-related tax / commercial assessment**, linked to rents, occupancy and real estate activity.
3. **Consumption/visitor levy** in the alternate-history KL jurisdiction; model demand sensitivity and fairness effects.
4. **Household income-related city surcharge** if enabled, with progressive brackets and a poverty/affordability consequence.
5. **Operating budget allocations:** healthcare, public services, safety, economic development and administration.
6. **Infrastructure capex:** transport, connectivity, housing and resilience with implementation delays.
7. **Debt issuance / amortization policy:** borrowing capped by debt and servicing metrics; market rates reflect risk.
8. **SWF contribution/withdrawal policy:** treasury-funded injections and permissible distributions with a clear ledger.

### Distinct fiscal variables

- Government cash (treasury)
- Taxes accrued and taxes actually collected
- Operating expenditure and capital expenditure
- Public debt principal and interest
- Net fiscal flow per period
- Public asset stock (if modeled) and depreciation
- Sovereign fund market value
- Transfers between government and fund (not new total public wealth)

### Government budget identity

`EndingTreasury = StartingTreasury + TaxesCollected + BorrowingProceeds + SWFTransfersIn + OtherReceipts - OperatingOutlays - CapitalOutlays - DebtInterest - DebtPrincipalRepaid - SWFContributions`

Track corresponding debt and fund balance changes. This identity is mandatory and should be tested after **every monthly settlement** and around special events.

### Debt risk and insolvency

- Debt is a liability, not income; bond issuance brings cash **and** increases debt.
- Apply interest continuously/accrued over time and settle based on documented payment schedule.
- Rising debt/GDP or negative fiscal credibility increases borrowing spreads and can reduce approval or trigger a downgrade.
- Failure conditions may include inability to pay essential obligations and inability to refinance, not merely treasury briefly hitting zero if available funding exists.

---

## 11. User interface — game presentation and wireframes

### Visual direction

- A recognizable detailed KL 3D map fills **65–80% of the central game screen**.
- Top glass/dark HUD: date/time, speed controls, GDP, real growth, treasury, SWF NAV, public debt, unemployment, inflation, approval.
- Left compact policy/navigation rail; right context-dependent company/sector/government panel.
- Bottom event ticker and tab bar for policy, market, SWF, reports and objectives.
- Clean premium simulation aesthetic: subtle overlays, restrained accents, compact charts and smooth transitions, not excessive glossy buttons.
- Adaptive desktop-first layout; small screens may simplify to panels/tabs, not a full mobile game requirement.
- Display financial **units**, **time period** and **fictional-data label** on charts and cards.

### Main game screen (desktop ASCII wireframe)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ KL ECONOMIC EMPIRE  |  06 Jan 2027  14:40 MYT  |  [⏸] [1×] [2×] [3×]   |  [SAVE] [SETTINGS] │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ GDP RM ...   REAL GROWTH +...%   TREASURY RM ...   SWF NAV RM ...   APPROVAL ...%      │
│ UNEMPLOYMENT ...%     INFLATION ...%    DEBT RM ...      MYR/USD ...                  │
├──────────────┬──────────────────────────────────────────────────────┬────────────────────┤
│ GOVERNMENT   │                                                      │ COMPANY / DISTRICT │
│  Policies    │           INTERACTIVE 3D KUALA LUMPUR MAP            │                    │
│  Budget      │           KLCC / TRX / BUKIT BINTANG / ...           │  Maybank           │
│  Projects    │                                                      │  Fictional share   │
│  Debt        │        [Company name + price markers]                │  price RM ...      │
│              │        [Clickable building extrusions]               │  Revenue RM ...    │
│ MARKETS      │                                                      │  Net profit ...    │
│  MY stocks   │                                                      │  [Price chart]     │
│  US stocks   │                                                      │  [BUY] [SELL]      │
│  Sovereign   │                                                      │                    │
│  FX          │                                                      │                    │
├──────────────┴──────────────────────────────────────────────────────┴────────────────────┤
│ 📰 EVENT: Tourism rises ...     |  NEXT BUDGET REPORT: 25 GAME DAYS  |  MARKETS: MY OPEN │
│ [OVERVIEW] [POLICIES] [STOCKS] [SOVEREIGN FUND] [ECONOMY] [REPORTS] [OBJECTIVES]    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Stock market screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│ MARKETS     [Malaysia 20] [US 20] [Portfolio] [FX]                 │
│ Search ticker...   Filter: Sector | Winners/Losers | Watchlist       │
│ Ticker   Company       Price   Day %   1M %   P/E  Yield  Market   │
│ MY:1155  Maybank       RM ...   ...     ...      ...  ...    OPEN     │
│ US:NVDA  NVIDIA        $ ...    ...     ...      ...  ...    CLOSED   │
├──────────────────────────────────────────────────────────────────────┤
│ Selected: NVIDIA         [Hour] [Day] [Month]  [PRICE CHART]        │
│ Fictional revenue / net income / margin / balance sheet / events   │
│ SWF: Available USD cash | Existing position | Trade [BUY / SELL]  │
└──────────────────────────────────────────────────────────────────────┘
```

### Government and policy screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│ POLICIES & BUDGET                    Effective: 1 Feb 2027         │
│ Corporate tax on KL profits    [---- 18% -----] -> proposed 21%   │
│ Commercial property levy       [----- ... -----]                  │
│ Infrastructure spend           RM ... / month                     │
│ Healthcare/public services     RM ... / month                     │
│ Preview next-month fiscal effects (estimated, uncertain)          │
│ Treasury cash | Projected tax | Recurring expense | Debt service   │
│ [QUEUE POLICY] [REVERT PROPOSAL]                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Report and event screens

- Monthly economic report: revenue/profit trends, taxes, GDP accounting breakdown, jobs, CPI, real income, fiscal position, SWF returns and macro events.
- Policy history: who changed what (the player), when, effective date, recurring consequences.
- Event log: display a brief description and explicit positive/negative effects; allow inspect details; no forced blocking popups every few seconds.
- Campaign objective screen: component scores, current trend, risks and why a metric changed.
- End-screen: 24-month performance against starting state and strategy analysis.

### UX requirements

- No dead buttons, placeholder trades or fake settings.
- Visible feedback for policy submission, order execution, closed exchanges, insufficient cash and save/load.
- Pause automatically when a modal requiring deliberation is open (or make this a clearly indicated user preference), to avoid surprise clock progression.
- Graph axes must show units and timeframe.
- Support keyboard shortcuts if easy: Space=pause/resume, `1/2/3`=speed; shortcuts disabled when typing in inputs.
- Optional game speed color/status indicator; no extra speeds.

---

## 12. Data structures and interfaces (illustrative contract)

Codex should implement and refine these types—not necessarily copy them verbatim—but preserve the relationships and invariants.

```ts
type Currency = "MYR" | "USD";
type Exchange = "MY" | "US";
type GameSpeed = 0 | 1 | 2 | 3;
type TickerId = `${Exchange}:${string}`;

type Money = { currency: Currency; minorUnits: string }; // decimal-safe serialized integer

type Company = {
  id: TickerId;
  legalName: string;
  displayName: string;
  listingExchange: Exchange;
  sectorId: string;
  marketCurrency: Currency;
  klRevenueExposure: number;        // fraction [0,1]
  malaysiaRevenueExposure: number;  // fraction [0,1]
  otherGlobalRevenueExposure: number;
  geo?: {
    lng: number;
    lat: number;
    label: string;
    locationType: "hq" | "office" | "branch" | "asset";
    verificationSource: string;
  };
  financials: CompanyFinancials;
  market: SyntheticMarketState;
};

type Government = {
  treasuryMYR: string;
  debtMYR: string;
  unpaidObligationsMYR: string;
  policies: GovernmentPolicies;
  plannedProjects: InfrastructureProject[];
  ledger: LedgerEntry[];
};

type SovereignFund = {
  myrCash: string;
  usdCash: string;
  positions: Record<TickerId, Position>;
  pendingOrders: Order[];
  transactionLog: Transaction[];
};

type GameState = {
  schemaVersion: number;
  campaignId: string;
  clockEpochMinutes: number;
  campaignStartEpochMinutes: number;
  campaignEndEpochMinutes: number;
  speed: GameSpeed;
  isPaused: boolean;
  rngState: SerializableRngState;
  schedulerState: SchedulerState;
  government: Government;
  fund: SovereignFund;
  companies: Record<TickerId, Company>;
  sectors: Record<string, Sector>;
  households: AggregateHouseholds;
  banking: BankingSystem;
  externalEconomy: ExternalEconomy;
  indicators: EconomicIndicators;
  actions: PlayerAction[];
  history: CompressedHistory;
  reports: MonthlyReport[];
};
```

**Type warning:** the interface sketches use opaque references to additional types that Codex must implement. Safe handling of large fixed-point integer balances may require `bigint` internally serialized as a decimal string; never JSON.stringify raw bigint directly.

### Persistence

- Save named slots or autosave + manual save.
- On reload validate schema and data bounds; migrate supported earlier versions.
- Save clock boundary cursors / processed event IDs to ensure month-end, dividends and taxes are idempotent.
- Keep seeded histories deterministic; clicking Save/Load should not change any economic state.

---

## 13. Simulation scheduler ordering

Within an hour tick:

1. Apply user commands whose effective timestamp has arrived.
2. Open/close market sessions according to exchange calendars.
3. Update active continuous shocks, interest and ongoing project progress.
4. Update market prices and execute eligible queued trades in consistent priority order.
5. If day boundary: settle daily consumption/sector output, FX, wages/costs accrual and sector demand; append daily history.
6. If week boundary: adjust labor/credit plans, update expectations, emit weekly news.
7. If month boundary: close company earnings, corporate taxes, government expenditure and borrowing costs; compute GDP, CPI, labor, fiscal accounts, dividends, public wealth and approval; create report.
8. Recalculate score previews and publish compact view snapshots to the UI.
9. Check 24-month campaign-end boundary exactly once.

**Avoid circular updates within the same tick.** Explicitly decide whether market prices incorporate same-day earnings before or after reports are published. Document all lags. In advanced iterations, introduce a consistent stock-flow accounting matrix or reconciliation checks where practical.

---

## 14. Milestone-based Codex build phases

**Do not ask Codex to build everything at once.** After each phase, run the game, run automated tests and inspect the map/UI in a browser. Save a working commit.

### Phase 0 — Project foundation and decision log

**Deliverables**
- Initialize Vite/React/TypeScript, Tailwind, Vitest, Playwright and lint/format scripts.
- Add this `PROJECT_SPEC.md` and a small `AGENTS.md` instructing Codex to read it before editing.
- Create `docs/decisions.md`, `docs/economy-model.md` and README.
- Establish global formatting for MYR, USD, metrics and fictional labeling.

**Acceptance:** `npm install`, `npm run dev`, `npm run build`, and `npm test` work; no production backend is required.

### Phase 1 — 3D map, polished HUD and **real-time clock**

**Deliverables**
- A working KL map with 3D extruded buildings and correct OSM/OpenFreeMap attribution.
- Attractive responsive top HUD, side panel shell, bottom navigation.
- Game clock showing real calendar date and minute/hour in KL time.
- Speed controls: Pause / 1× / 2× / 3×, no month skip.
- Auto-pause on tab hidden, safe resume after browser visibility changes.
- Deterministic game clock unit tests.
- Save/reload clock and speed settings.

**Acceptance:** Run 1× and 3×, measure clock advance against expected conversion; no double ticks; game clock cannot jump after background-tab suspension. Map remains interactive.

### Phase 2 — 40 stocks, companies and market UI

**Deliverables**
- Seed 20 MY + 20 verified US stock entities with proper currencies and IDs.
- Validate ticker metadata and record sources. Mark all financial values as simulated.
- Verified KL business markers for the subset with legitimate map locations; others still appear in market browser.
- Stock-market tables, ticker search, detail panels and charts.
- Synthetic deterministic opening prices and daily/hourly history.
- Market calendars, session open/close and FX display.

**Acceptance:** Exactly 40 distinct securities, no duplicated tickers, MYR vs USD rendering correct, US market status reflects New York time/DST; no company marker with invented exact location.

### Phase 3 — Playable **sovereign fund**, treasury and company financials

**Deliverables**
- SWF cash balances, positions, orders, dividends and performance charts.
- Buy/sell flow, closed market queue/rejection, fees and FX conversion.
- Government treasury and debt as separate accounts; initial taxes and expense ledger.
- Company revenue/cost/profit/retained earnings models and fictional financial statements.
- Monthly reconciliation report and cash conservation tests.

**Acceptance:** Trades never create money; equity purchases change cash into assets; taxes don't equal stock gains; no negative cash without valid financing; portfolio MYR NAV includes FX.

### Phase 4 — Interconnected economy v1

**Deliverables**
- 6 sector input/output relationships with finite calibrated coefficients.
- Households, consumer spending, employment, wages, inflation, aggregate bank credit and borrowing rates.
- Corporate and property taxes; operating budgets; infrastructure projects with lags.
- Policy controls with effective dates, forward projections and causal explanations.
- Hourly/daily/monthly scheduler and comprehensive monthly report.

**Acceptance:** Raising tax affects after-tax profits and (through lags) investment; infrastructure affects near-term budgets and delayed demand/productivity; GDP is based on value added and remains distinct from share trading.

### Phase 5 — Advanced interconnected economy + external markets

**Deliverables**
- More realistic credit constraints, external Malaysia/US growth, global sector cycles, imported inflation and FX.
- KL revenue exposure of companies, global earnings separation and valuation sensitivity to rates.
- Multi-month economic events with second-order effects and readable history.
- Fiscal risk premiums, government debt service, insolvency checks and approval formation.
- Market fundamentals engine with price discovery and sector correlations.

**Acceptance:** External AI boom primarily impacts relevant US tech companies; local KL policies mostly affect KL-exposed earnings; USD/MYR moves affect fund NAV but not nominal US share quantities.

### Phase 6 — Campaign, balance and polish

**Deliverables**
- Full 24-month campaign objective scoring, failure conditions, end report.
- Scenarios: balanced growth, tax-maximizing, investment-heavy, austerity, adverse global recession.
- Seeded simulation replay tests; automated headless 24-month campaign engine runner (not available as a player skip control).
- Performance profiling at 3×; UX polish, keyboard controls, help/tooltips, autosave and stability.

**Acceptance:** No NaN/infinite values, no corrupt saves, no unbounded growth from free-money accounting bugs, legible reporting; different policy strategies produce meaningfully different economic outcomes.

### Rough effort and priority

| Build scope | Approximate human + Codex iteration effort | Goal |
|---|---:|---|
| Phases 0–2 | 15–35 hours | Map, continuous game clock and 40 visible stocks |
| Phase 3 | 12–25 hours | Playable fund, transactions, basic company accounting |
| Phase 4 | 25–50 hours | Meaningful local macroeconomic policy simulation |
| Phases 5–6 | 60–140+ hours | Advanced realism, long-campaign balance and polish |
| **Total** | **~112–250+ hours** | Extensive first-person project; estimates not promises |

Because the scope increased from 12 companies/turn-based design to 40 companies/continuous clock/advanced interconnected sectors, the earlier 40–80-hour estimate **does not apply to the complete specification**. A smaller playable slice should arrive substantially earlier than the fully balanced game.

---

## 15. Testing, acceptance criteria and invariants

### Clock tests

- 1×: `3 real seconds = 1 game hour` within tolerances.
- 3×: `1 real second = 1 game hour` within tolerances.
- Pause: no in-game time or financial state changes.
- Background tab: no catch-up upon return.
- Save/load: same game clock, same economy, same RNG, no event replay.
- Month-end applies once, including February/leap years, and runs the same at 1× vs 3× given identical actions at equal game times.
- No player-accessible skip controls or time acceleration beyond 3×.

### Trading and accounting tests

- Exactly 20 MY + 20 verified US game equities.
- Market order cannot fill when exchange is closed.
- Purchase: holdings gained + cash paid + fees; no fictitious profit created.
- Sale: holdings and cash update correctly; realized profit derived from actual basis.
- No selling more shares than fund owns; no negative free cash.
- FX conversion applies explicit rate and spread and preserves value subject to fees.
- NAV uses correct base currency, exchange rate and last known simulated prices.
- Treasury transfer into SWF reduces treasury and increases fund cash, leaving combined public net wealth unchanged before fees.
- Borrowing increases cash **and debt**; repaying principal decreases both.
- Expenditure/taxes affect flows; market gains are not tax revenue.

### Macro/causality tests

- GDP uses sector value added; changing intermediary revenue alone cannot mechanically inflate GDP.
- Tax rise tends to lower featured KL corporate after-tax income conditional on all else equal; actual dynamic response may vary.
- Government budget identity holds after daily/monthly settlement.
- Infrastructure effects occur over an explicit timeline, not instantly.
- Higher imported costs put upward pressure on CPI and reduce disposable real income unless offset.
- US stocks remain primarily sensitive to their US/global sector model rather than KL tax policy.
- Money and share quantities do not become NaN, infinite, or sign-invalid.
- Economic indicator ranges are bounded; bankruptcy/default routes are explicit rather than creating impossible balances.
- Replaying same scenario + actions + seed yields same daily and month-end reports.

### Browser/UI tests

- KL 3D buildings render or fall back clearly if network tiles unavailable.
- Company marker opens correct details; map does not falsely identify an unverified HQ.
- Labels and charts render simulated/disclaimer indicator and correct currency.
- Charts update on new game data; no dummy static chart substituting for actual history.
- No dead buttons.
- 3× mode remains responsive on an ordinary laptop; profile before premature optimization.

---

## 16. Product assumptions and things to verify before production polish

1. **Real geography availability:** building-height data quality varies by Kuala Lumpur district; fill extrusions approximate skyline, not photorealistic towers.
2. **Stock metadata:** confirm 20 current Bursa listings and 20 S&P 500 constituents; model user-selected real-world brand names only, with fully fictional game accounts.
3. **Map markers:** verify public KL premises and cite provenance in `docs/data-sources.md`. Do not invent headquarters coordinates.
4. **Economy baseline:** exact KL-local GDP/taxes cannot be inferred by summing corporate statements. Use explicitly fictional starting aggregates and calibrate for *internal plausibility*, not claim a validated KL forecast.
5. **Tax jurisdiction:** explicitly fictional alternate-history powers. Don't imply DBKL controls federal tax or US companies.
6. **Costs:** no monetary API bills when run locally using free hosted map tiles and local synthetic simulation. Internet connection still required for **hosted** OpenFreeMap map tile loading; fallback should explain network issue.
7. **Copyright/brand integrity:** avoid unauthorized imagery/logos, market-feed scraping or copying another game's protected art/UI wholesale.
8. **Simulation risk:** even internally coherent macro models are abstractions; expose assumptions and uncertainty rather than pretending to predict actual Malaysian or US stock returns.

---

## 17. Immediate Codex execution prompt

> **Copy the following into Codex after placing this file at the repository root as `PROJECT_SPEC.md`:**

```text
You are the lead gameplay engineer for KL ECONOMIC EMPIRE.

Read PROJECT_SPEC.md in full. It is the authoritative specification.

First, produce a short implementation plan and list any key technical assumptions in docs/decisions.md.

Then implement ONLY PHASE 0 and PHASE 1:
- Vite + React + TypeScript + Tailwind project
- Clean, premium city-simulation UI shell
- Working MapLibre + OpenFreeMap interactive Kuala Lumpur 3D map
- KLCC camera and 3D building extrusions
- Proper mapping attribution
- Top stats HUD and placeholder panels clearly labeled as demo data
- Continuous fictional game clock starting 2027-01-01 08:00 Asia/Kuala_Lumpur
- Fixed clock conversion: 1 real second = 20 game minutes at 1×
- Only Pause / 1× / 2× / 3×; no Next Month or skip functionality
- Auto-pause when page becomes hidden and no offline catch-up
- Persist/restore state with a versioned save
- Deterministic hourly tick scheduler with real calendar boundaries
- Unit tests for 1×/3×, pause, visibility, save/load and month boundaries

Do not build speculative full economic logic or the 40-stock market yet.
Do create typed extension points for companies, economy, government and SWF.
No backend, no paid APIs, no authentication.

Run install, build, unit tests, and browser smoke tests. Fix errors.
When done, summarize completed functionality, known limitations, and next Phase 2 tasks.
Do not declare success without the app running and tests passing.
```

### Prompts for subsequent Codex iterations

After Phase 1, use:

- **Phase 2:** “Read `PROJECT_SPEC.md`, implement Phase 2 only, verify all 40 securities, validate exchange calendars and show working market UI.”
- **Phase 3:** “Implement Phase 3 with double-entry-equivalent invariants for fund trades, government treasury, FX and company financials. Add tests.”
- **Phase 4:** “Implement interconnected economic sectors, household demand, value-added GDP, policies and lagged public investment. Document equations and tests.”
- **Phase 5:** “Integrate external markets, financial shocks, banking/credit and valuation. Verify causal separation of KL versus global shocks.”
- **Phase 6:** “Create scoring, campaign-end report and 24-month seeded strategy regression suite; profile 3× performance and polish.”

---

## 18. Definition of done

A project meets this specification only when a player can:

1. Explore a recognizable 3D Kuala Lumpur skyline with correct attributions.
2. See a **continuous minute/hour game clock** that runs at 1×/2×/3× or pauses; **never** press a month skip.
3. Inspect 40 simulated securities (20 Malaysian, 20 current verified S&P 500), separated by market and currency.
4. Use a government SWF to buy/sell shares under valid market, cash, FX and accounting rules.
5. Change meaningful fiscal policy and see plausible delayed second-order effects on companies, GDP, wages, inflation, budgets and approval.
6. Observe an internally reconciled, deterministic economy over the first **24 game months**, with monthly reports, events and no money-generation accounting exploits.
7. Save/load without changing results or advancing the clock.
8. Finish a campaign and receive a score balancing **wealth, growth, citizen satisfaction and financial stability**.

**Main priority:** a stable, engaging, understandable economic model with a beautiful 3D KL interface—*not* feature checkboxes or pseudo-realism.

## 19. User amendment — national starting data and trade/FX (31 October 2026)

The user requested official real-world starting GDP, debt, treasury and operating budgets, import/export policy,
central-bank forex controls, and full-digit money balances beside the bottom month-close countdown. They explicitly
chose **Malaysia as the economic baseline, keeping the KL map**. This overrides the city-only baseline and prohibition
on central-bank FX action above. The presidency, simulated securities, economic paths and future events remain fictional.
New campaigns use pinned, dated observations with linked provenance; old KL saves retain their original balances and
calibration. Treasury cash must be labelled by its reported scope, with reserves and SWF cash shown separately.
See D-018–D-023, `docs/data-sources.md` and `docs/economy-model.md` for the implemented boundaries and rules.

## 20. User amendment — logos, FDI, policy levers and global standing (31 October 2026)

The user chose to show real company logos (amending §5/§16's monogram default), sourced and recorded in
`docs/data-sources.md`, beside fictional simulated data. New campaigns add fictional FDI pledges from real companies,
toggle-and-slider policy levers with explicit phase cycles, AI adoption effects and a scored global-standing board
against the ten largest economies (IMF WEO data). See D-059–D-060.

## 21. User amendment — Deals & Power (31 October 2026)

The user requested implementation of negotiated investment deals, private takeovers, infrastructure concessions,
distressed-company rescues, startup rounds and long-term supply contracts, with staged validation on a new branch.
See `docs/deals-expansion-plan.md` and D-063–D-071. These extend the existing FDI/project/public-fund systems with a
Deal Room, explicit money reservations, obligations and ownership. Private startups, rescue targets, acquisition
targets and consortium counterparties are fictional. Negotiated real-name FDI remains clearly simulated.

SWF minority private investments use a 10% NAV budget; controlling acquisitions and rescue loans use an explicit
Khazanah strategic mandate, capped at 10% of its capital including deal assets. This expands available public
investment instruments without permitting leverage, short selling or bypassing listed-equity concentration rules.
Share purchases and loans exchange assets; only funded production contributes to GDP. Contracts can fail and leave
unpaid obligations. Public-to-public transfers/distributions cannot manufacture public wealth. Keep the existing
continuous clock, 24-month boundary, pause/1×/2×/3× and no offline catch-up. Migration preserves prior accounts and
signed contracts; new agreement rules activate prospectively. Build/test/browser gates apply to each milestone.

## 22. User amendment — central-bank powers (1 November 2026)

The user asked to control the policy rate and other central-bank tools, and to use or grow the BNM FX reserves. This overrides the
§8 rule that the OPR stays exogenous. The automatic rule remains the default; manual control is bounded by MPC meeting dates, step
limits and a credibility cost. Reserve operations still cannot be spent on the budget. See D-075 and `docs/economy-model.md`.

## 23. User amendment — trade ministry (1 November 2026)

The user asked to act as trade secretary: see Malaysia's imports and exports at real scale with charts, negotiate deals and
grow exports of specific products (electronics, services, steel and others). New Malaysia campaigns add a trade-ministry
ledger at official 2025 levels (MITI/DOSM, pinned in `docs/data-sources.md`), export promotion programmes, product trade
deals with partners and export buyer contracts in the Deal Room. Buyers are fictional and everything after the opening is a
simulation. The opening economy and the score formula are unchanged. See D-077 and `docs/economy-model.md`.

## 24. User amendment — term length and Boom sandbox (1 November 2026)

The user, playing for fun, asked to reach US$2tn GDP by year three and the world's largest economy by year ten. This
overrides the fixed 24-month boundary (§21): new campaigns choose a 2-, 3-, 5- or 10-year term (default 2). It adds an
opt-in **Boom mode** sandbox that removes realistic speed limits on growth. The realistic mode, its calibration and its
validation are unchanged and remain the default. The continuous clock, pause/1×/2×/3×, no time skip and no offline catch-up
all still apply, so a 10-year term is about 25 hours of play at 3×. See D-079 and `docs/economy-model.md`.


## 25. User amendment — 5× speed (1 November 2026)

The user asked for a faster speed for long terms. This overrides the "Pause, 1×, 2× and 3× only" rule in §2/§3 and the
"no acceleration beyond 3×" acceptance tests: the controls are now **Pause, 1×, 2×, 3× and 5×** (5× = 100 game minutes per
real second; key 5). It is the same continuous clock run faster, with the same hourly ticks in the same order, so results at
5× match 1× and 3× for the same actions at the same game times. There is still no skip, no next-month or next-event button
and no offline catch-up; long frames are still clamped, so a slow browser runs slower rather than catching up. A 10-year
term is about 15 hours of play at 5×. See D-081.

## 26. User amendment — safe time skip (1 November 2026)

The user pasted a skip-button specification and asked for the rules to be changed to allow it. This amends the
"real-time, replaces turn-based design" principle and the "no skip" rules in §2, §3, §15 and the acceptance tests
(any wording elsewhere that says "no skip" or "no month skip" is read as *no skip other than this one*). Keeping them,
the normal clock is unchanged: Pause, 1×, 2×, 3× and 5× only, the 250 ms frame clamp, auto-pause on a hidden tab and
no offline catch-up. Real time away from the game never counts as game time.

Two buttons, **Skip 15 days** and **Skip to month close**, are enabled **only while the game is paused**:

- **Same ticks, same result.** A skip runs the ordinary whole hourly ticks, so it produces exactly the state a normal
  run over the same game hours would. There is no second simulation path, no larger step and no interpolation.
- **Visible and cancellable.** It advances one game day per animation frame so the date visibly moves. Pressing Pause
  cancels it at the next whole tick and the game stays paused. Starting a command, opening a dialog, hiding the tab
  or changing speed also cancels it.
- **Stops early** (before the tick that would cross it) on: a fresh critical alert; a central-bank (MPC) meeting while
  the player steers the rate (manual mode); a Deal Room offer or FDI pledge closing within 3 days; and the end of
  the term. Each offer or meeting stops a skip once, so a second skip may let it lapse deliberately.
- **Undo.** The state is autosaved (and held in memory) before every skip; **Undo skip** restores it, paused, until
  play resumes.

Skips are an explicit player action, not offline progress. See D-083 and `docs/economy-model.md`.

## 27. User amendment — infrastructure capacity in Boom mode (1 November 2026)

The user found Boom mode had no never-ending problem: success only produced more success. In Boom games, growth now
loads three national networks (power, transport and ports, housing and services). A network running above its capacity
throttles the sectors that depend on it, raising prices and slowing growth, and new capacity arrives only years after
the player commissions and pays for it. The player must build ahead of demand, and each fix raises the next limit.
Realistic campaigns are unchanged. See D-084 and `docs/economy-model.md`.
