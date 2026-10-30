# Implementation decisions

Phases 1–3 were developed concurrently in separate checkouts, and each may add a section here. Phase 2 entries use
`D-P2-xx` IDs so they cannot collide with other sessions' numbering when the branches are merged.

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
