# Architecture & design decisions

Interpretations of ambiguous points in `PROJECT_SPEC.md`. Newest last.

| ID | Decision | Why |
|---|---|---|
| D-001 | **Money representation:** ledger balances (treasury, debt, fund cash, positions' cost) are integer minor units (sen / US cents) in JS `number`, guarded by `assertSafeMinor` (safe to ±9×10¹⁵ = RM 90 trillion). Macro flows (GDP, wages, sector output) are MYR floats. Rounding: half away from zero at each posting (`toMinor`). | Spec allows any overflow-safe fixed-point; `bigint` would complicate JSON saves and arithmetic for no benefit at KL scale. |
| D-002 | **Time:** state stores `clock.hour` (UTC epoch hours of the last processed boundary) + `clock.subHourMs` (visual only). Economic changes happen only in `runHourTick`. Frames are clamped to 250 ms; hidden tabs auto-pause. | Determinism independent of frame rate; no background catch-up. |
| D-003 | **Map:** OpenFreeMap `liberty` style. Inspected style JSON: 3D layer `building-3d`, source-layer `building`, properties `render_height`/`render_min_height`. We recolour by height; missing heights fall back to the style's own default. MapLibre v6's worker is loaded via an explicit `setWorkerUrl` (bundling breaks its self-location). | Spec: inspect, don't assume. |
| D-004 | **Tick ordering:** at a boundary tick we first settle the period that just *ended* (day → week → month), then apply player policies whose effective time has arrived, then markets. | A tax effective 1 Feb must not tax January. Spec §13 lists commands first; we document the deviation. |
| D-005 | **Daily cadence for flows:** monthly policy amounts are "per average month"; daily flow = monthly × 12/365. Month-close distributions are normalised to an average month. | Avoids 31-day vs 28-day sawtooth in demand. |
| D-006 | **Featured companies are a sample, not an addition.** Government corporate tax is computed on the 7 KL *sector aggregates*; company-level KL tax (exposure × rate) is informational. Company revenue indexes KL sector activity, Malaysia demand and a global driver by exposure. | Avoids double counting (spec §8). |
| D-007 | **Taxes collected:** consumption levy and household surcharge are remitted daily (point of sale / withholding); corporate tax and property levy settle at month close on that month's base. | Simple, testable timing that makes the treasury dip within a month. |
| D-008 | **Closed-market orders queue** as market orders for the next open hourly tick and expire after 7 days; cancellable. Orders on an open exchange fill immediately at the last tick's price + spread + impact. Settlement is T+0. | Spec asks to pick one rule. |
| D-009 | **Bursa holidays:** fixed-date holidays exact; lunar/religious holidays for 2027–2029 are an approximation in `market-calendar.ts`. NYSE holidays (incl. Good Friday, observed rules) and New York DST are computed by rule. | Spec: weekends/time zones mandatory, holidays may be approximate. |
| D-010 | **Liquidity & impact are cumulative per stock per session** (`fundDayValue`): impact = 0.1·√(today's fund value / ADV); hard cap 25 % of ADV per session. | Prevents splitting orders to dodge impact/limits. |
| D-011 | **Workforce is elastic**: KL workforce (incl. commuters/migrants) grows 1 %/yr and moves 6 %/month toward labour demand. | Without it any demand shock pinned unemployment at the floor (see game-balance.md). |
| D-012 | **Central bank:** OPR is exogenous (fictional rule on national inflation, Malaysia demand and a 0.2 weight on the KL output gap); the president cannot set it. | Spec §8. |
| D-013 | **Dev tooling:** `window.__klDev.runHours()` exists only when `import.meta.env.DEV` (stripped from production). `sessionStorage.klDevNoSave` disables saving in automated test tabs. `runHeadless()` is test-only. | Spec allows bulk simulation only for tests/dev tooling. |
| D-014 | **Deliberation pause:** confirmation dialogs (trades, policies, projects, transfers) pause the clock while open — a user preference in Save/Load, default on. | Spec §11 UX. |
| D-015 | **Score preview** uses the same function as the final score; during year one real growth in the HUD is shown vs the starting level rather than annualised. | Annualising 2–3 months exaggerated noise ("−10 % YoY"). |
| D-016 | **Project accounting:** 60 % of capex is capitalised as public assets; completed projects cost 3 %/yr upkeep; project cost escalates with the construction price index (progress tracked as real `work`); productivity gains saturate per sector. Save schema bumped to v2 with a migration. | Removed the "commission everything" free lunch (game-balance.md, pass 2). |
| D-017 | **Victory threshold 75** (spec suggested 80 as a starting point to tune). | Seeded replays: hands-off ≤ 71, crude scripted play ≤ 77 on favourable seeds. |

## Phase 2 — 40 stocks, companies and market UI

Plan: (1) verify the 20 + 20 listings and KL marker points, recording provenance; (2) generate synthetic history on the
real exchange calendars; (3) add pure market view models; (4) build the market UI with search, detail and charts;
(5) add unit and e2e tests; (6) stop at Phase 2. No SWF trading UI (Phase 3) and no economy changes (Phase 4+).

- **D-P2-01 Integration.** Phase 1 owns the app shell, map and store, and that work was uncommitted while Phase 2 was built.
  Reusable market UI therefore lives in `src/components/markets/` under names Phase 1 does not use (`MarketBrowser`,
  `SecurityDetail`, `PriceChart`, `ExchangeStatusChips`). Pure logic lives in `src/engine/market-view.ts` and
  `src/map/company-markers.ts`. `src/phase2/` is a thin harness (rAF loop, auto-pause when hidden, Space/1/2/3, marker
  map) mounted by `src/main.tsx`, so this phase can be run and tested alone. On merge, keep the Phase 1 shell in
  `main.tsx`, render `MarketBrowser`/`SecurityDetail` in its Markets panel, and the harness can be deleted.
  Phase 1's map already draws markers from `CompanySeed.geo`, so the verified data flows into it unchanged.
- **D-P2-02 Listing verification.** The spec seed lists are kept: all 40 were confirmed as listed / S&P 500 members as of
  31 Oct 2026 (sources in `docs/data-sources.md`). Genting Malaysia was checked specifically after its 2025 takeover
  offer, and it remains listed. The exact code lists are pinned in `tests/securities.test.ts`.
- **D-P2-03 Map markers.** A company gets a marker only for an OSM feature looked up by name, with the OSM ID recorded in
  `verificationSource`. Candidate buildings owned by separately listed affiliates (Sunway REIT, Sime Darby Property) are
  rejected, and so are offices outside KL (Gamuda, in Petaling Jaya). Companies sharing a building get one grouped
  marker. A test pins the 18 verified IDs, so a new marker needs a matching docs entry.
- **D-P2-04 Synthetic history.** At game creation each security gets 180 sessions of fictional daily bars, only on that
  exchange's real trading dates (weekends and calendar holidays skipped). Bars are walked backwards from the opening
  price, so the last close equals the game's opening price. The last 10 sessions also get hourly bars at the session's
  whole-hour ticks: a Brownian bridge from that day's open to its close, with the daily high/low widened to contain it.
  Retention: `DAILY_BARS = 800`, `HOURLY_BARS = 120` (about 20 sessions). All draws come from `s.rng` at creation, so
  history is deterministic per seed and shifts later random streams compared with Phase 0.
- **D-P2-05 Campaign scenario test.** Shifting the RNG stream showed that a single seed's 24-month score is bimodal
  (about 40 vs about 70) and far noisier than the recession-vs-balanced effect: the old 3-seed test passed by luck. It now
  compares 20-seed averages (balanced ≈ 51, recession ≈ 47). Reducing outcome variance is Phase 6 balancing work.
- **D-P2-06 Seed data sanity.** With the default 5–6% depreciation, Costco, Walmart, UnitedHealth and Sime Darby came out
  loss-making or at about 0.3–1% net margin. They now have explicit D&A ratios (1–2.5% of revenue), so all 40 show
  positive fictional earnings and P/E between 5 and 200 (tested). The values remain fictional.
- **D-P2-07 Market metrics.** The 1M change compares with the close about 21 sessions back. P/E uses trailing-12-month
  fictional net income and shows "n/m" when that is ≤ 0. Yield uses trailing-12-month declared dividends. While a session
  runs, day and month charts append a provisional "live" bar from the open/high/low/last, which is replaced by the
  finalised bar after the close. Monthly charts aggregate daily bars. Hourly labels use the exchange's local time.
- **D-P2-08 Search and status.** A non-empty search spans both markets, so a ticker is found from either tab. Exchange
  status shows local time with MYT/EST/EDT and the next open or close. Next-change search uses 30-minute steps, which hit
  every boundary (09:00, 12:30, 14:30, 17:00 MYT; 09:30, 16:00 ET).
- **D-P2-09 Parallel dev servers.** `playwright.config.ts` reads `E2E_PORT` (default 5173) and starts its own
  `vite --strictPort`, so parallel checkouts never test another branch's server through `reuseExistingServer`.

## Phase 3 — sovereign fund, treasury and company accounting

Developed concurrently on `codex/phase-3-sovereign-fund` without the shared log, so its original D-004…D-013 numbers were
renumbered here as D-P3-xx (restatements of conventions already recorded above — D-004, D-006, D-008, D-009 — are folded in).

- **D-P3-01 Settlement & orders** (refines D-008). Settlement is idempotent and re-validates cash, holdings and limits at
  fill time; `executeOrder` itself enforces session hours, expiry and status, so filled/cancelled/expired orders can never
  execute again. Buys do not reserve cash and compete in submission order; pending sells reserve held shares.
- **D-P3-02 Minor-unit safety.** Integer sen/cents use nearest minor-unit rounding for trades and transfers; FX receipts round down. Reject invalid/unsafe inputs before mutating accounts. All balances and basis amounts must remain safe integers. Enforce the existing hard 20% concentration cap, 25% daily-liquidity cap and no leverage/shorts.
- **D-P3-03 Realised returns & dividends.** Persist realized gains and dividends in cumulative currency-specific fund totals, including after a position is fully liquidated. Track realized MYR gains at sale FX against acquisition-date MYR basis. Transaction records include the FX snapshot and both FX cash legs. Daily NAV is marked to simulated prices and current FX; monthly returns exclude treasury transfers.
- **D-P3-04 Monthly reconciliation.** Monthly reconciliation includes all month-end SWF distributions in the same treasury flow report. Derive opening cash/debt from prior reports (fictional baseline for first month) and test the exact minor-unit identity. Fund transaction retention is bounded; cumulative totals survive pruning.
- **D-P3-05 Company accounting.** Company accounts use listing-currency major-unit accrual flows. Maintenance capex equals depreciation, so cash change before dividends/financing equals net income. Dividends are capped by cash and cumulative distributable retained earnings; opening retained earnings equal the synthetic historical undistributed earnings. Cash shortfalls receive explicit matching corporate debt. No Phase 4–6 expansion is included.
- **D-P3-06 Treasury clamp.** `post()` limits outflows to available treasury cash and records the amount actually paid;
  callers already finance or record arrears first, so the clamp only absorbs sub-sen rounding across daily disbursements.
- **D-P3-07 Integration.** The standalone `src/phase3/App.tsx` desk was not mounted: the shell's Fund, Treasury & debt and
  Reports panels gained its unique views instead (realised P&L and dividend totals, treasury journal, month-to-date flows,
  company statements, reconciliation residuals). Save schema 3 chains master's v2 (project `work`) and Phase 3's v2
  (fund totals, treasury journal); the v2→v3 step fills whichever fields are missing, so saves from either branch load.

## Phase 4 — interconnected economy acceptance audit

- **D-P4-01 Scope.** Keep the existing seven-sector economy (the milestone's six sectors are a minimum), household,
  bank, fiscal and project systems. Audit their causal behavior and strengthen the existing invariant suite rather
  than replace the model. External-shock score adjustment, tax/wealth scoring and human calibration of the victory
  bar remain Phase 6 work. The explicitly optional district overlays remain deferred; no district geography or
  synthetic allocation rules are introduced by this audit.
- **D-P4-02 Static fiscal previews.** Quote fictional MYR per average month (365/12 days). Corporate previews use the
  latest closed month's positive sector profits, normalised for its calendar length; other previews use current
  prices and demand. Reuse the settlement household spending calculation without changing state or consuming RNG.
  Keep resident consumer spending tax-inclusive and visitor spending tax-exclusive, and freeze current tourism
  demand for this all-else-equal preview. Never divide historical receipts by the currently effective rate: these
  may refer to different tax regimes, including a zero-rate month. Project quotes use the current construction
  index for cost, disbursement and upkeep; template costs remain base-price costs. These are forecast corrections,
  not changes to settlement, economic parameters or the save schema.

## Phase 5 — external markets, credit and shock propagation

Plan: retain the existing external/credit/valuation systems; test the three acceptance chains and stress paths;
correct event-period settlement and fiscal arrears; expose event causes and lifecycle in the UI; verify and commit.

- **D-P5-01 Event periods.** Events apply on KL days `startDay <= day < endDay`. Macro modifiers ramp in over seven
  days; company shocks retain their existing revenue/sentiment smoothing. Finish every accrual for the last valid
  day before expiring an event. Monthly bank decisions use modifiers from the final settled day, so newly spawned
  Monday/month-start events cannot change the month just ended. Initial recession events enter the same bounded
  history/news path as random events. Expiry removes direct modifiers; prices, credit plans, capital and company
  sentiment can retain lagged consequences. No extra RNG draws are introduced.
- **D-P5-02 Unpaid spending.** `unpaidObligations` carries unpaid operating/transfer obligations and unpaid interest.
  Unbuilt project work and `pendingEmergency` already carry their own unpaid balances; never also book those
  amounts as operating arrears. Daily operating arrears are due less actual posted operating payments. Commitments
  remain subject to financing and the existing 30-day/no-market-access insolvency rule. No state fields change;
  old recorded arrears remain payable, with no speculative historical adjustment on load.
- **D-P5-03 Scope.** Keep seven domestic sectors plus the external Malaysia/US/global drivers as the Phase 5 model.
  Add causal and accounting coverage for credit stress, geographical tax/earnings separation, FX, rates, market
  response and fiscal failure. Preserve the existing fictional calibrations and defer score/threshold tuning and
  optional map overlays to later work.

## Phase 6 — campaign, calibration and polish

Plan: correct calendar-based scoring and true opening/closing comparisons; add transparent sustainability and
bounded external-condition adjustments; run shared strategies across multiple seeds; finish the term report,
modal/keyboard and save checks; profile browser play at 3×; verify and commit.

- **D-P6-01 Score calibration.** Annualise the last three months' real GDP using their actual total days. Adjust
  the 3.5% growth benchmark by a symmetric, capped ±1 percentage point estimate from *elapsed* recorded macro
  events, never future exposure or player actions. This only partly cushions external shocks; it is not a
  counterfactual economy. Deflate public net wealth by CPI. Additional wealth credit above 50 is scaled by the
  weakest of real disposable income, real output and service quality relative to their opening levels (0–100%).
  Genuine losses keep their full penalty. Preserve component weights, hard failure caps and the 75/60 victory
  gate pending human playtesting; do not claim automated replay as human validation. No saved fields change.
- **D-P6-02 Term report.** Opening means campaign creation, not the first monthly close. Show actual calendar
  run rates, transfer-adjusted fund gain, cumulative fiscal flows, score explanations and inspectable full retained
  policy/event history. Reset visual fractional time at the exact campaign boundary. Existing save schema 3 stays
  valid; imported historical scores retain their prior calibration while current previews use the new formula.
- **D-P6-03 Validation/tooling.** Share scripted strategies between campaign tests and a Node/Vite command-line
  balance runner. Both remain outside player controls. Profile real 3× browser play and tick/serialization costs
  with explicit machine/sample caveats. Modal help uses the deliberation-pause preference; speed shortcuts cannot
  resume a paused deliberation dialog. Validate corrupt saves before they can restore an unusable clock or economy.

## Malaysia baseline, trade and central-bank FX — user-directed expansion

- **D-018 Scope override (31 Oct 2026).** The user explicitly chose “Switch the economic baseline to Malaysia,
  keeping the KL map.” New campaigns therefore use dated Malaysian GDP, federal debt/cash proxy and federal
  operating estimates. This supersedes the original city-only fiscal scope in §§1, 2, 8 and 10. Keep the title,
  verified KL geography and fictional presidency, securities, future events and economic paths. Preserve legacy
  KL saves, including their original calibration, rather than silently resetting/scaling their money or history.
- **D-019 Observation boundaries.** Pin official data available on 31 Oct 2026, with reference dates and units.
  GDP is the sum of DOSM 2025 nominal quarters; the real game series is rebased to opening prices. Cash uses
  federal deposits at BNM only, expressly a narrow proxy rather than consolidated treasury cash. The 2027
  operating estimates are allocations, not actual spending. Group education/higher education, defence/home
  affairs, works/transport operations and pensions into existing controls. Other operations are a derived residual;
  exclude debt service (paid separately) and development capital appropriations (projects remain commissioned).
  Do not claim the seven fictional sector splits, taxes, loans, SWF or public asset stock are national statistics.
- **D-020 Fiscal scale.** Solve sector scale so value added plus the opening product levy equals observed nominal
  GDP exactly. Keep positive residual exports. Calibrate fixed omitted federal receipts to the official 2027
  total less the modeled opening tax base; changing tax sliders cannot move that residual. Existing `federalGrant`
  storage key means “other public receipts” nationally and still means the old grant in legacy saves. National
  debt cap starts at 80% (a game rule, not a legal limit); risk/rating debt thresholds are 65%/60%, keeping the
  old 35%/30% thresholds for KL. Normalize population pressure and transfers to the matching profile. National
  company tax/demand exposure combines KL and rest-of-Malaysia weights; global exposure stays separate.
- **D-021 Trade.** Tariffs (0–20%) and export services (RM0–2bn/month) are effective next month. Tariffs charge
  actual imported production inputs and increase costs; net product-tax treatment prevents counting that same
  domestic transfer as lost GDP. Export services require actual cash, buy domestic services and build bounded
  demand access over 90 days. No unpaid discretionary support is carried as an essential fiscal obligation.
  Measured exports are capacity-rationed sector deliveries; imports are production inputs, not complete customs
  or balance-of-payments statistics. These are modeled flows, not calibrated official merchandise totals.
- **D-022 Central bank.** User-directed FX control supersedes D-012's prohibition on player central-bank action;
  OPR remains automatic. Use the BNM foreign-currency reserve component, excluding gold/SDRs/IMF/other assets.
  A separate fictional RM5bn sterilisation inventory permits purchases without printing fiscal cash. Reserve
  operations cannot transfer to treasury/SWF; both currency legs, fees and turnover are journalled. Effect is
  temporary, bounded pressure on the next daily fixing, not a guaranteed peg. Subtract opening portfolio equity
  when adding central-bank gains/losses to modeled public wealth. For the negative national opening net worth,
  deflate asset values and retain nominal liabilities in scoring, preventing inflation alone from earning wealth
  credit. The initial FX anchor is an implied reserve valuation ratio, expressly not an observed spot quote.
- **D-023 Compatibility and balances.** Schema 4 chains 1→2→3→4. Persist profile, opening cash/debt, trade and CB
  accounts. Legacy saves receive zero new reserve inventory; do not reconstruct trade activity that was never
  recorded. Label their first upgraded trade month partial. Keep all prior clocks/RNG/cash/history. Display exact
  treasury sen and both SWF cash currencies beside “Month closes in”; distinguish spendable cash from fund NAV.

- **D-024 Historical chart references.** On user request, display pinned DOSM GDP, CPI/inflation and unemployment
  history separately from campaign charts. Historical quarterly nominal GDP is annualised by multiplying by four,
  retaining seasonality; it is not a rolling annual series. Official CPI retains 2010=100, separately from campaign
  opening=100. Campaign charts show a visible opening point before any daily/monthly settlements. No invented
  historical FX series: explicitly identify the opening FX anchor as an implied reserve valuation. Deficit display
  uses paid expenditure less public receipts, excluding financing, debt principal and SWF transfers; positive is deficit.

- **D-025 GDP chart units.** Format historical GDP ticks/tooltips as explicit MYR trillions (e.g. RM2.18tn),
  and dates as quarter/year. Bare billion values near2000 were easily mistaken for calendar years. This changes
  presentation only; source values remain quarterly nominal GDP ×4 in RM billion, with seasonality retained.

- **D-026 Economic controls (user requested all four).** Sector corporate tax relief starts next month, expires after
  1–60 months and cannot overlap within a sector. It reduces tax on positive eligible profits only, including company
  domestic exposure; investment uses the same effective rate. Show static cost and actual closed-month receipts forgone.
  Ministry plans schedule 1–5 annual appropriations starting next month, with nominal annual escalation. Queuing a
  manual budget for a planned category replaces that plan (D-030). Cancelling removes future changes while retaining current funding.
  Health/education/safety outcomes are lagged synthetic coverage/readiness indices from real funded budgets, not official
  service statistics. Aggregate service quality retains its existing fiscal channel.
- **D-027 Debt strategy.** Retain the existing amortising debt-pool abstraction, rather than falsely imply bullet bonds.
  Select 3/10/20-year terms for new issuance, with coupon adjustment −0.20/0/+0.50pp. Weighted term and coupon of existing
  debt change only when new debt is issued. Monthly scheduled principal uses weighted term. A refinancing share below100%
  reduces the rebuilt liquidity target by the corresponding share of principal actually paid; it does not prohibit
  essential bridge financing or bypass debt caps/market access. No new debt is invented during save migration.
- **D-028 FX band.** Optional automatic controller checks each daily fixing once, sells USD above the upper MYR/USD bound
  or buys below the lower bound, subject to daily configured size, segregated inventory, USD-sale reserve floor, spreads
  and the same shared daily turnover cap as manual interventions. Pressure affects subsequent fixings, never guarantees
  a peg. No new RNG draws. Schema5 persists all controls; schema4 migrates to neutral defaults without resetting accounts.
- **D-029 Reserve revaluation is outside the wealth score.** Public net worth still shows central-bank reserve equity
  at the current MYR/USD rate. The wealth score values USD reserves at the opening rate (`scoreNetWorth`), so spreads and
  trading losses still cost score, but exchange-rate moves do not count. Reason: review found that selling USD early and
  buying late weakened the ringgit and raised the score by up to ~3 points, and random FX moves swung reserve equity by
  −RM6bn to +RM34bn across seeds. The SWF's own USD holdings keep their existing market valuation.
- **D-030 Manual budgets replace ministry plans.** Queuing a manual appropriation for a category with a ministry plan
  cancels that plan's future annual steps, and the review dialog says so. Previously the plan's next annual step silently
  overwrote the player's manual budget.
- **D-031 Model generations (schema 6).** New national campaigns are "model 2": oil & gas and palm oil form a resource
  sector outside the seven input–output industries, the federal development programme is modelled, and SOEs,
  commodities, trading partners, fiscal rules and the equity wealth effect are active. Schema-5 saves migrate as
  "model 1" with all of these off and their original calibration (`CAL_V1`, `BASE_BUDGET_V1`), so balances and outcomes
  do not jump. Legacy KL saves are unaffected.
- **D-032 Development expenditure (OFFICIAL RM85.0bn, Budget 2027).** Paid daily as capital outlays, bought from
  construction, industry, ICT and social programmes, 60% capitalised as public assets, and accumulated in a separate
  public-capital stock (depreciation 4%/yr) that raises every sector's productivity with elasticity 0.05. Because the
  sector capital-output ratios describe the whole capital stock, model 2 scales the private stock and private investment
  down by the public share of fixed investment; adding RM85bn on top double-counted public investment and drove
  construction's calibrated exports negative. Opening deficit = (376.84 + 85.0 − 380.82)/GDP ≈ 4.0%.
- **D-033 Resource sector and receipts.** Opening value added: upstream oil & gas RM111bn, palm oil RM48bn (APPROX scale);
  the seven sectors are recalibrated so total GDP still equals the official figure. Petroleum income tax (38% statutory)
  is paid on upstream profit with fixed costs; palm pays corporate tax and the export duty, whose opening rate is set so
  receipts match the OFFICIAL RM1.914bn 2027 export duty estimate. PETRONAS (RM32bn APPROX dividend) and Khazanah
  (payout of its listed dividends) pay the treasury. Every opening modelled receipt is subtracted from the residual
  "other receipts", so opening revenue still equals the OFFICIAL RM380.8bn. Line 75200 (RM35.5bn, returns from
  non-financial enterprises) is dominated by the PETRONAS dividend.
- **D-034 SOE wealth accounting.** Public net worth includes changes in PETRONAS book equity (cash − debt) and Khazanah
  NAV at market. A dividend or special dividend therefore moves cash between public accounts without creating wealth,
  so extracting SOE cash cannot raise the wealth score. PNB is not modelled as a dividend source: its income goes to
  unit holders, not the federal government.
- **D-035 KL projects in national campaigns.** City projects' productivity, rent, service and tourism effects are scaled
  by KL's share of national output (≈15%). Previously a RM4.5bn KL rail line raised productivity in every Malaysian
  sector by up to 2%, a large free lunch exposed by the "commission everything" balance test.
- **D-036 Commodities.** World prices are exogenous indices (oil reuses the existing oil cycle; palm, wheat and steel
  have their own AR(1) cycles plus seeded supply/demand episodes). They come from a separate persisted RNG stream
  (`world.rng`) so the existing seeds' draw order, prices and events are unchanged. Players control domestic
  instruments only: RON95 ceiling and eligibility, wheat subsidy, steel safeguard duty, palm export duty.
- **D-037 Fuel subsidy and core inflation.** The opening RON95 subsidy (17bn litres × 85% eligible × RM0.61 ≈ RM8.8bn,
  APPROX) is carved out of the administration residual so total operating spending still equals the official estimate.
  Households pay any change in their fuel bill out of other consumption, and the CPI carries pump prices at a 5.5% weight.
  Because that direct real-income effect is now explicit, the behavioural spending and confidence penalties key off core
  inflation (excluding administered fuel prices); otherwise a one-off pump-price change compounded through the existing
  inflation→MPC→unemployment loop. Utilities feel 40% of crude moves (regulated gas, ICPT pass-through).
- **D-038 Trading partners.** Eight partners with APPROX rounded trade shares. Bilateral surcharges are relative to
  opening conditions. Imports follow a CES price index across partners (substitution elasticity 4: diversion means costs
  rise less than the tariff). Partners mirror a share of surcharges after 60 days (de-escalate after 30). Agreements
  need relations ≥ 50 and no dispute, take 180 days, and add 5% export access and 2% cheaper imports per tier (max 2).
- **D-039 Fiscal rules.** Modelled on the Public Finance and Fiscal Responsibility Act 2023: deficit ≤ 3% of GDP, debt
  ≤ 60% (or falling), golden rule. The deficit target glides from the opening deficit to the ceiling over 24 months.
  Rules are not self-enforcing. Monthly credibility moves 15% toward a compliance target and shifts the sovereign
  premium by −20bp to +50bp and the rating by up to ±1 notch; credibility below 50 lowers the stability score.
  Loosening a rule costs credibility at once. The escape clause is justified by an output gap below −2% or an active
  adverse macro shock (−2 points); otherwise −20 and capped. It lapses after 18 months. Model 2's deficit-premium and
  rating thresholds start at 4.5% of GDP, because the real budget opens near 4%.
- **D-040 Equity wealth effect.** Households hold an APPROX RM450bn of listed equity and spend 3% a year of gains or
  losses on Bursa prices (smoothed over ~20 days). This is how share prices reach the real economy; trading itself still
  never enters GDP.

- **D-041 City-first info views (user-directed UI, 31 Oct 2026).** The reference screenshots supersede §11's
  persistent left navigation and top stat rows: a single Info views button opens the category grid; the chosen
  inspector appears beside it, while clock/speed, key indicators and exact treasury/fund cash remain in a bottom
  dock. Categories stay open until toggled, and a panel can remain open with the menu hidden. District camera
  shortcuts move into a compact location picker. Original SVG icons and charcoal/cyan glass take visual cues
  from the references without copying game assets. Population uses existing household totals and sector job
  shares; do not fabricate birth/death, age, homelessness or geographic overlays absent from the model. No
  economic rules, saved game fields, RNG draws or clock behavior change.

- **D-042 Info-view dismissal and market space (user correction, 31 Oct 2026).** Supersedes D-041's independent
  panel visibility: switching Info views off dismisses the active category panel and company selection, returning
  to the map. Reopening starts with categories only. Market windows use available workspace width, a compact
  title/subtitle/status header and inline index sparklines. The company list owns bounded vertical/horizontal
  scrolling; fixed header/filter/footer rows never compete with it through nested percentage-height scrollers.
  Ordinary inspectors retain their body scroll. No simulation behavior changes.
- **D-043 60 securities (user request, 31 Oct 2026).** Supersedes the spec's 40-security universe. Added 14 US-listed
  semiconductor and software leaders (TSMC, ASML and Arm as ADRs, not S&P 500 members) and 6 Bursa semiconductor and
  automation names (Inari, ViTrox, Frontken, Unisem, MPI, Greatech), because Penang's back-end chip cluster is central
  to Malaysia's exports. Names and tickers are real; every financial value is fictional seed data at roughly realistic
  scale. No map markers: none has a verified OSM location in KL. Schema-6 saves gain them from a fresh same-seed game,
  with each index divisor rescaled so index values do not jump.
- **D-044 Ten commodities (user request).** Oil, LNG, coal, palm oil, rubber, rice, wheat, steel, aluminium, copper.
  LNG reprices with a ~6-month lag to oil plus its own cycle and sets 40% of PETRONAS's realised price; utilities'
  fuel costs follow a damped oil/LNG/coal mix (15/25/25%); rubber is a smallholder plantation crop (≈RM2.5bn, 90% to
  households) inside the resource sector; the food subsidy covers rice as well as wheat; aluminium sets 80% of Press
  Metal's realised price; copper and aluminium are construction, industrial and chipmaker inputs. Reference prices
  are APPROX. Adding cycles changes the world stream's draw order, so model-2 world paths differ from schema 6.
- **D-045 Net development expenditure.** Use the Fiscal Outlook's net development expenditure (RM81.5bn = gross RM83.0bn
  − RM1.5bn loan recoveries) instead of the expenditure book's RM85bn line, which adds a RM2bn contingency reserve. The
  opening overall deficit is then RM77.5bn, matching the official 2027 overall balance (−RM77,523m).
- **D-046 Official deficit history.** The fiscal chart shows MOF's federal overall deficit for 2021–2025 (outturns) and
  2026 (revised), then the simulated 12-month deficit. Official ratios use same-year GDP; the simulation measures
  against opening (2025) GDP, so the same ringgit deficit reads higher in the game, as the panel states.

- **D-047 Cloud saves (user-directed).** Optional Firebase email/password sign-in with console-provisioned account; no social login. Realtime Database stores versioned JSON snapshots because campaign saves may exceed Firestore document limits. Local saving is first and independent. Slots opt into session sync through upload/load; revision transactions reject concurrent or unseen overwrites. Missing configuration leaves the game local-only. No economic rules change.
- **D-048 Cloud sync volume.** Saves are 2–5 MB, and daily autosaves would upload every ~24 real seconds at 3×. Routine
  autosaves are coalesced per slot and throttled to one upload per 5 minutes; pause, tab hide, manual slot saves and
  campaign end upload immediately; only the newest snapshot is sent, and snapshots the game just serialized skip
  re-validation. Rules also require the email/password provider (`email_verified` is optional; see docs/cloud-saves.md).
- **D-049 City-builder bottom toolbar and Economy window (user request, 31 Oct 2026).** Supersedes D-041's bottom dock of
  nine stat cards plus a cash row. The bottom is one slim toolbar: time controls and clock, campaign month and close
  countdown, the news ticker, an approval chip and a single money readout (treasury balance with its change over the
  last day). Clicking the money readout opens a centred, tabbed Economy window modelled on city-builder finance screens:
  Summary (all former stat cards, cash positions, fiscal flows), Budget, Taxation, Loans and Production, each with a
  line list, a slider editor and an explanation column, and the monthly balance pinned to the list. Edits use the same
  commands and lags as the full panels (budgets tomorrow, taxes next month); no economic rule changes.
- **D-050 Modern Glass appearance (user-directed).** Default to London-inspired steel-blue building colors, charcoal roads, muted greenery and overcast lighting, with an original KL palette toggle. Add one original 168m tiered elliptical extrusion prototype near KLCC, explicitly labeled fictional and switchable; no copied models, company ownership or economic effects. This is stylized glass shading, not physically reflective materials. Cosmetic preferences persist separately in local storage and optionally in the save envelope (including cloud saves); old saves remain valid without an engine schema change. No construction tools or economic rules are introduced.

- **D-051 Household feedback correction (user-directed).** Replace the campaign-opening income gap in confidence
  with up to three months of geometric monthly real-income-per-person change. Keep opening comparisons in approval
  and scoring. Remove unemployment's second direct MPC penalty; bound precautionary saving and ease into it monthly.
  Reduce confidence's separate investment and credit-demand multipliers without changing bank supply. Bound daily
  ordinary spending by income plus net savings; approved credit remains separate. Fuel costs reallocate the funded
  spending envelope and no longer appear as fictitious saving. Mandatory-payment shortfalls remain a visible signed
  net liquid position (no new household debt/default model). Apply prospectively to existing saves, with no state,
  RNG, clock, schema or historical-balance reset. The 24-month score still emphasizes recent conditions and adjusts
  for external shocks: recession tests now measure cumulative output/income costs, not guaranteed lower final scores.
  Record the new equations, boundaries and paired replay results in economy-model.md and game-balance.md.
- **D-052 Economic explanations (user request #4).** Click GDP, unemployment, inflation, approval or treasury in the
  Economy summary (also approval in the bottom bar) for a read-only inspector. Decompose nominal GDP run-rate change,
  workforce/employment arithmetic, CPI level versus opening, monthly approval formula and month-to-date cash flows.
  Label periods/units and separate those measured contributions from present mechanisms, recent decisions, active
  events and pending delivery. Do not invent counterfactual policy shares or statistical forecast bands. CPI includes
  an explicit settlement-timing reconciliation when a newly effective rate is not yet reflected in published prices.
- **D-053 Alerts and settings (user request #10).** Device-local preferences persist separately from engine saves:
  enabled rules and thresholds for gross-outlay treasury coverage, unemployment, rent/wage-index pressure and estimated
  project cost escalation; brief/detailed notifications, confirmation pause and optional critical-alert pause.
  Evaluate at daily UI settlements, notify on entry/escalation, rearm after a 10% recovery margin. Store at most 40
  session alerts. Loading seeds the monitor without replaying existing risks; new games reset it. Critical pauses
  require player resume and cannot be undone by closing a deliberation dialog. No speed, offline or simulation changes.
- **D-054 Additional starting scenarios.** Export downturn starts the existing global slowdown for 180 days at
  magnitude 1; Energy squeeze starts the existing +40% oil shock for 90 days at magnitude 1 (seven-day ramp).
  Both retain normal later event probabilities. The Recession card now discloses its existing persistent 3× adverse /
  0.6× other hazard weights and 180-day, 1.3× opening shocks. Scenarios reuse deterministic registered events without
  additional random draws; no new economic equations or saved fields. Saved scenario strings remain in schema 7.
- **D-055 National growth trend for an untouched economy (model 3, schema 8).** Diagnosis with a monthly probe (events
  off): the opening is steady (month-1 output, jobs and investment equal the calibration), but the trends disagree.
  (1) The natural rate was the KL-era 3.5% against a 3.0% national opening, so the workforce pull and Phillips curve
  dragged unemployment up. (2) Output is demand-determined; autonomous demand grew ~2.6%: exports ~4.4%, government
  purchases flat in ringgit (≈ −1.2%/yr real), resources flat, investment following utilisation. (3) Supply (workforce
  1% + productivity 1.5%), capital growth and the OPR/score potential (3.5%) were KL-era values. (4) The omitted-receipts
  residual was fixed in ringgit, so revenue/GDP fell with nominal growth. Raising supply alone made unemployment worse,
  confirming demand as the binding constraint. New campaigns use **model 3**: natural rate 3.0%, workforce trend 1.6%,
  productivity 2.6%, opening capital growth 4.0% (higher turns property's residual exports negative), potential 3.8%
  (seven sectors ≈ 4.2%, resources flat) for both the OPR output gap and the growth-score benchmark, other receipts
  indexed to last month's nominal GDP, and inherited ministry plans indexing each operating budget at 6%/yr (trend real
  growth + 2% target) in monthly steps for five years. Monthly steps avoid a year of falling real purchases followed by a
  January jump. Development capex stays at its 2027 level. Plans are ordinary, visible, cancellable controls; manual
  budgets replace them as in D-030. Plans gain optional `everyMonths` (1 or 12; absent = annual), hence schema 8 with
  a no-op migration. Model 1/2 saves keep their trend, calibration, fixed receipts and no plans, so they replay unchanged.
  Unchanged policy now leaves the deficit near its opening ~3.8–3.9% (spending tracks the economy), so consolidation
  remains the player's choice. CPI still settles ~1.3%/yr because world commodity prices are flat in nominal USD;
  this is recorded as an open calibration issue.
- **D-056 Demand multiplier recalibration (model 3).** Harness first: `tools/multipliers.ts` (`npm run multipliers`,
  `tests/multipliers.test.ts`) runs paired same-seed campaigns with events/episodes off and one shock from 1 Feb 2027:
  +1% of GDP government purchases, OPR +25/+100bp held above the baseline path, oil +10%/+50%, consumption levy +1pp,
  RON95 eligibility removal. Benchmarks: spending multiplier 0.3–0.8 (Rafiq, IMF WP/13/149, finds Malaysian multipliers
  declined after 1998), OPR 25bp ≈ 0.1–0.16pp of GDP (Bank Muamalat SVAR, 2025), Okun 0.1–0.45 and sacrifice ratio
  0.5–4 (typical EM ranges; no Malaysia-specific Okun estimate was found, so these are labelled assumptions).
  Model-3 changes (`NATIONAL_DEMAND`; model 1/2 keep `LEGACY_DEMAND`): 12% of household cash spending buys finished
  imports (in calibration too); desired spending weights current income 0.2 (was 0.5); permanent income corrects
  0.2%/day (was 1.2%) and drifts with expected trend nominal income (5.9%/yr); hiring adjusts 2%/week (was 12%);
  investment −0.2 and household credit −4 per unit lending-rate change (were −0.6, −8); workforce pull 15%/month (was
  6%, migrant/participation flows); OPR gap weight 0.75 (was 0.2); producers anchor non-labour margins to prices
  excluding the levy and pump prices; visitor levy elasticity 0.75 (was 1.5); PETRONAS capex scales with the lagged
  oil/gas index (elasticity 0.5). Productivity is lowered to 2.3% and potential to 3.6% (revising D-055) so supply
  matches the ~3.5% demand path and unemployment holds near 3%. Results and remaining gaps (4-quarter spending 0.81,
  oil +10% −0.38%, levy multiplier 0.9: an unrecycled oil windfall and full levy incidence) are in economy-model.md.
- **D-057 Wealth credit against trend (model 3).** After D-056, tax rises cost much less output, and the tax-maximiser
  bot scored best (61.2 vs hands-off 57.1) on 93 wealth points despite 0.7% real growth: the D-051 credit compared
  living standards with *opening* levels. Model 3 compares output with the potential path and real income per head
  with the productivity path, removes 4% of the credit per 1% shortfall (`1 − 4·(1 − min(ratios, services))`), and
  lowers the wealth slope from 400 to 300 points per unit of real net-wealth change ÷ opening GDP. Losses keep their
  full penalty. Model 1/2 saves keep the D-051 rule. The counter-cyclical bot in `tools/campaigns.ts` now measures
  "neutral" against the inherited budget path, not the 2027 level (it had been cancelling indexation). Its campaign test
  now checks recession unemployment and a bounded score cost instead of a score gain.
- **D-058 Sovereign fund macro effects (user-requested trade-off, model 3).** (a) Fund MYR→USD conversions are capital
  outflows: `pressure += 0.003 × US$bn` through the central bank's bounded (±0.08) pressure, decaying over 30 days from
  the next fixing; USD→MYR reverses it. Converting the fund's whole ~RM25bn (≈US$6bn) gives ≈1.8% weaker ringgit at
  peak. (b) Half of each fill's price impact becomes company sentiment, decaying 5%/day, so domestic buying lifts
  the price and KL index (and, through the existing equity index, household spending). The fill price still pays the
  full impact, so buy-and-sell round trips lose value (tested). (c) Tobin's q: desired capital growth `+ 0.008 ×
  ln(equityIndex)` for all share-price moves, using the lagged equity index. 0.02 nearly doubled OPR transmission, so
  0.008 keeps OPR +25bp at −0.17% after 8 quarters. Model 1/2 saves keep trades macro-neutral. The FX desk discloses
  the expected pressure before conversion.
- **D-059 FDI, policy levers, AI and global standing (user request; schema 9, model 3).** Twelve levers (AI programme,
  AI adoption credit, reskilling, FDI incentive, green lane, minimum wage, foreign-worker levy and freeze, export-proceeds
  conversion, short-term flow controls, carbon tax, green incentives) with a phase cycle: announced → effective
  (tomorrow or the 1st of next month) → linear phase-in → full effect. FDI attractiveness reacts to announcements at once.
  New treasury lines `policyLevy`/`policyGrant`; the opening worker levy leaves the receipts residual, so opening revenue
  is unchanged. FDI pledges arrive on a separate RNG stream (main RNG untouched); a scripted opening Alphabet RM10bn data
  centre pledge. Approved projects buy domestic output, import equipment, pay grants as they build, support the ringgit
  (−0.003 log per US$bn converted) and add exports once operating. Rivals follow IMF WEO (Oct 2026) US$ GDP paths moved by
  the simulated cycles. Standing (US$ GDP 50%, exports 25%, ringgit 25%) is 15% of the model-3 score; weights 25/25/22/13/15.
  All defaults are neutral (existing tests and calibration hold). Schema-8 saves migrate with these systems off.
- **D-060 Real company logos (user-directed spec amendment).** See PROJECT_SPEC §20 and docs/data-sources.md.
- **D-061 Living map (user request: trains, construction, market cues).** Display-only; reads state, never changes it.
  Seven KL rail lines (Kelana Jaya, Ampang, Sri Petaling, Monorail, MRT Kajang, MRT Putrajaya, Shah Alam) are pinned from
  OpenStreetMap route relations (ODbL, fetched via Overpass on 31 Oct 2026, simplified to ~4 m). Train counts follow service
  hours (none 00:00–06:00, ×1.35 at peaks), employment (elastic, so recessions visibly thin service), tourism and a completed
  LRT project; motion is real-time, scaled by game speed and stopped while paused. Projects and approved FDI show a crane
  marker and a rising extrusion at illustrative **fictional** sites (the game has no real addresses), then a lit "operating"
  block. Company markers flash on hourly moves ≥1% and show an 8-second bubble when a company event starts.
  Automated browsers (navigator.webdriver) update trains every 500 ms to keep tests light.
- **D-062 Treasury chip shows daily closes (user request).** Display-only. The bottom-bar treasury reads the latest
  `s.daily` close instead of the live ledger, so it changes once per settled day (the opening balance before the first
  close). Its trend is the change vs the previous close in signed billions ("+1.2B", millions below 0.1B), green/red.
  Hovering (or focusing) the chip shows a card with the balance, the change vs the close seven days earlier (or the oldest
  close), and a sparkline of the last 30 daily closes coloured by that weekly trend. The live balance stays in the Economy window.
- **D-063 Deals expansion planning (user request, 31 Oct 2026).** Scope ideas 2–7: negotiated investment, takeovers,
  concessions, rescues, startup rounds and supply contracts. See `docs/deals-expansion-plan.md` for the proposed
  phased design. Extend schema-9 FDI rather than duplicate it; plan a shared Deal Room and explicit contract/ownership
  accounting. Fictional private targets and a separate SOE strategic mandate avoid silently changing listed-security
  concentration rules. Budgets/caps and migration details are provisional until implementation; no runtime rules,
  saved fields or economic effects are changed by this planning entry.
- **D-064 Deal foundations.** Implement plan phases sequentially on codex/deals-power-expansion. Schema 10 adds a
  segregated escrow reservation ledger, using treasury financing lines or actual fund/SOE cash transfers. Escrow
  remains an asset until payment; no borrowing on signature. An optional fictional advisory offer exercises the
  shared lifecycle. Existing saves receive empty disabled deals; signed FDI is untouched. No new randomness is drawn.
- **D-065 Negotiated FDI.** Preserve existing standard approvals; opt into delivery/sourcing/training negotiation by
  reviewing the linked offer in Deal Room. Deterministic bounded counteroffers (three rounds), fully reserved grants,
  quarterly build milestones and deadline clawbacks extend the original pledge instead of creating another project.
  Training changes the funded purchasing mix, not an arbitrary employment counter. Claims earn no wealth until collected.
- **D-066 Private concessions.** Reuse project completion effects and reject duplicate funding routes. Private assets
  are excluded from public assets; public support is an expense. Contribution/charges/term/guarantee alter the service
  quote. Record capped contingent calls and unpaid contractual arrears separately from essential fiscal obligations.
  No automatic discretionary bridge financing. User revenue is a slice of existing service activity, not extra GDP.
- **D-067 Physical supply agreements.** Reprice the fleet's existing nominal envelope and only a voluntary 20% industry
  cohort. Keep household pump subsidies separate. Collateral is an asset until refunded or impaired; operating bills
  remain ordinary operating/input costs. Explicit quantities, indexation, duration premium and capped exit/default
  loss make fixed prices a trade-off, not a guaranteed subsidy. Industry quantities are activity-equivalent units.
- **D-068 Startup equity.** Private firms remain outside the listed stock universe. Primary equity, 1% fees, capped
  SWF private exposure, conservative net-asset marks, ownership dilution and cash-backed exits share one enterprise
  ledger. Operating sales sample the existing sector; only funded incremental capex adds demand/capacity. Persist
  venture quality on deals.rng. No public wealth is created by signing, moving money or marking future profits.
- **D-069 Rescues.** Distinguish illiquidity from insolvency, validate creditor recovery and require positive post-
  recap assets. Khazanah cash funds staged equity/secured loans, with actual monthly cash repayments and matching
  enterprise liabilities. Failed milestones withhold funding; recovery is bounded by estate/buyer cash. Public
  distributions require earned profits and reduce equity claims, preventing cash-extraction wealth exploits.
- **D-070 Private takeovers.** Cash-backed rival bids, shareholder acceptance, control premiums, one-time ownership
  closing and delayed persisted integration outcomes operate on fictional private firms only. Sellers receive the
  acquisition payment; company capital is not conjured by a share sale. Khazanah mandate exposure is capped; fees,
  impairments, actual earnings, distributions and exits all reconcile through the enterprise ownership ledger.
- **D-071 Deal integration.** Preserve sampled-firm versus aggregate production boundaries; rescue rehabilitation
  uses funded capex and the existing six-month capacity pipeline. Repay supplier arrears when cash returns and
  require shareholder consent to recap dilution. Record actual retained earnings in book claims so distributions
  cannot generate public wealth. Concession cancellation from Projects routes through the contract; a supplier
  default restores spot pricing for unfulfilled volume. Guarantee provisions use capped current-utilisation stress
  projections, separate from maximum exposure and unpaid calls. Add opt-in deal alerts and unfinished-contract
  reporting. Later fictional cohorts arrive every 90 days without touching existing random streams. Schema-9 model-3
  saves may enable new agreements prospectively; older models retain their disabled rules.

- **D-072 Next-day policy, instalments and reserve display (user request).** Every player policy (taxes, trade tariff and
  export support, partner surcharges, commodity policy, development expenditure and the labour/capital/green levers) now
  takes effect at the next 00:00 KL, like budgets; previously these waited for the 1st of next month. Ministry plans and
  sector incentives keep their monthly schedule. Companies now pay corporate tax in daily instalments of 80% of the last closed
  month's bill (the opening modelled bill in month one); month close settles only the difference, so total tax is
  unchanged while the treasury no longer sags for two weeks and triggers bridge borrowing. The treasury readout is
  explained as the government's spendable working float (federal deposits), not income, with days of outlays covered; BNM's
  US$116.4bn FX reserve is shown beside it in the treasury card and the Economy summary, marked not spendable (D-022).
  Budget sliders show compact RM (RM3.41bn) instead of raw millions.

