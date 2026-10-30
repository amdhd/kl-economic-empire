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
