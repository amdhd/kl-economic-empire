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
