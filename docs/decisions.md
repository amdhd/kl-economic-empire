# Implementation decisions

## Phase 3 implementation plan

1. Audit existing fund, treasury, company and persistence code against Phase 3 invariants.
2. Harden settlement, safe minor-unit balances, realized returns, dividends and monthly reconciliation; add regression tests.
3. Add an isolated playable fund/treasury/financial-statements screen with explicit quotes, FX costs, orders and actual performance history.
4. Run build, all unit/invariant/campaign tests and browser tests; save a working commit. Stop at Phase 3.

## Scope and integration

The user's Phase 3 request supersedes Section 17's initial Phase 0/1 scope. Phase 1 is being developed concurrently in another checkout. This branch uses the committed engine and adds its UI in `src/phase3/`; it does not copy the other session's uncommitted work. The original repository has no decision/economy logs, despite existing engine references to D-004/D-006/D-008/D-009. The following records describe the existing conventions and Phase 3 refinements.

- D-004: Settle the prior day/month before applying next-period policies and then discover prices/fill orders. Published earnings affect the next open market tick. Keep existing scheduler order for reproducibility.
- D-006: Featured companies are samples inside aggregate sectors. Their KL tax is informational; sector tax is collected once. Their dividends are funded by company cash and distributed proportionately to the SWF and external shareholders.
- D-008: Closed-market orders queue for seven calendar days. Settlement is immediate when open, revalidates cash/holdings/limits, and is idempotent. No cash reservation for buys; orders compete in submission order. Pending sells reserve held shares. Cancellation releases that reservation. Quotes are estimates, not guaranteed future fills.
- D-009: Existing holiday schedules are approximate, with hourly queued execution (first open hourly tick, potentially later than a half-hour session opening). Exchange timezone/weekend rules remain unchanged in Phase 3.
- D-010: Integer sen/cents use nearest minor-unit rounding for trades and transfers; FX receipts round down. Reject invalid/unsafe inputs before mutating accounts. All balances and basis amounts must remain safe integers. Enforce the existing hard 20% concentration cap, 25% daily-liquidity cap and no leverage/shorts.
- D-011: Persist realized gains and dividends in cumulative currency-specific fund totals, including after a position is fully liquidated. Track realized MYR gains at sale FX against acquisition-date MYR basis. Transaction records include the FX snapshot and both FX cash legs. Daily NAV is marked to simulated prices and current FX; monthly returns exclude treasury transfers.
- D-012: Monthly reconciliation includes all month-end SWF distributions in the same treasury flow report. Derive opening cash/debt from prior reports (fictional baseline for first month) and test the exact minor-unit identity. Fund transaction retention is bounded; cumulative totals survive pruning.
- D-013: Company accounts use listing-currency major-unit accrual flows. Maintenance capex equals depreciation, so cash change before dividends/financing equals net income. Dividends are capped by cash and cumulative distributable retained earnings; opening retained earnings equal the synthetic historical undistributed earnings. Cash shortfalls receive explicit matching corporate debt. No Phase 4–6 expansion is included.
