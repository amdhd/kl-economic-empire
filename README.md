# KL Economic Empire

A single-player, local-first economic strategy simulation set on an interactive 3D map of Kuala Lumpur.
You are the President of a **fictional, alternate-history autonomous Kuala Lumpur**: set taxes and budgets,
commission infrastructure, manage public debt, and run a sovereign wealth fund across **40 simulated equities**
(20 Bursa Malaysia + 20 S&P 500 names). Score is judged after 24 in-game months on growth, public wealth,
citizen satisfaction and stability.

> **Fiction notice.** Real KL has no president with these powers. Company names and tickers are real, but every
> price, financial statement, dividend and event is a deterministic **simulation** — not market data and not
> investment advice.

## Run it (macOS, Node 20+)

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Strict type-check + production build to `dist/` |
| `npm test` | Vitest: clock, calendars, orders, accounting invariants, causal chains, 24-month campaign suite |
| `npm run e2e` | Playwright browser tests (first time: `npx playwright install chromium`). `E2E_PORT=5174 npm run e2e` runs a separate server so parallel worktrees don't test each other |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run balance` | Dev-only multi-seed strategy comparison; JSON in `artifacts/balance.json`. Optional `-- --seeds 401,402 --output artifacts/check.json` |
| `npm run profile` | Dev-only engine timings plus isolated 12-second real 3× Chromium sample across a month close; port 5176, results in `artifacts/` |

No backend, accounts or paid APIs. The map uses free **OpenFreeMap** vector tiles (needs internet; the simulation
keeps running offline and the map shows a fallback message).

## Controls

- **Space** pause/resume · **1/2/3** speed · **Esc** close panel · **?** help
- 1× = 20 game minutes per real second, 2× = 40, 3× = 60. There is no skip: a 24-month term is ~14.6 h at 1×
  or ~4.9 h at 3×. The game auto-pauses (and autosaves) when the tab is hidden and never catches up offline.
- Click company pills on the map (only **OSM-verified** KL locations), or open *Stock markets*.
- Bursa trades 09:00–12:30 & 14:30–17:00 MYT; US stocks trade 09:30–16:00 New York time (overnight in KL).
  Orders on a closed exchange queue for the next open and expire after 7 days.

## Project layout

```
src/engine/      pure, deterministic simulation (no React)
src/data/        companies, OSM-verified locations, fictional economic baseline, events, projects
src/store/       Zustand store + real-time loop (rAF), visibility auto-pause, autosave
src/map/         MapLibre GL + OpenFreeMap 3D buildings and company markers
src/components/  HUD, panels, charts
src/persistence/ versioned save format + IndexedDB storage
tests/           Vitest suites        e2e/  Playwright specs        docs/  design records
```

See `PROJECT_SPEC.md` (source of truth), `docs/decisions.md`, `docs/economy-model.md`, `docs/game-balance.md`
and `docs/data-sources.md`.

The campaign report explains calendar-adjusted growth, a small capped external-shock adjustment, sustainable real
public wealth, cumulative fiscal flows and fund gain excluding transfers. Human validation of the 75-point victory
bar is pending; see `docs/playtesting.md`. Browser profiling includes hosted-map/rendering costs, so results depend
on the machine and network; measured results are in `docs/performance.md`. Neither developer script adds time-skip
controls to the player UI.

### Malaysia baseline, trade and forex

New campaigns now start from dated official Malaysian GDP, federal debt, a treasury cash proxy and2027 operating
allocations, while retaining the KL map. **Baseline & sources** explains reference dates, groupings, links and remaining
model assumptions. Prices, companies' financials, future economic outcomes and events remain fictional.

Open **Trade & central bank** to queue import tariffs/export services for next month and buy/sell USD using segregated
central-bank inventory. OPR remains automatic. Treasury and SWF cash appear in full digits beside **Month closes in**;
click either to open its account panel. Treasury uses federal deposits at BNM only, not all government cash.

Schema4 preserves older KL saves with their original money and calibration. Start a new campaign to use the national
baseline and sourced reserve inventory; existing saves are not silently converted. Trade history in upgraded saves
starts from the upgrade date, so the first recorded month is partial.

### Economic controls

Open **Economic controls** in the Government rail for sector tax relief, multi-year ministry appropriations,
new-debt term/refinancing strategy and automatic reserve-limited FX bands. Review dialogs show fiscal costs and
tradeoffs. Ministry outcomes are synthetic coverage/readiness indices; debt uses an amortising pool, not bullet bonds.
Schema5 saves preserve these settings; older saves receive neutral controls without changing money or RNG.
