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
