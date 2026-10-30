# KL Economic Empire — Phase 3

A local fictional economic simulation. All prices, financial statements and news are synthetic; this is an alternate-history KL game, with no live market feed or backend.

## Run

```sh
npm install
npm run dev -- --port 5174
```

Open http://localhost:5174. The investment desk starts paused at 1 January 2027, 08:00 MYT. Use Pause / 1× / 2× / 3×; at 1× one real second equals 20 game minutes. Order review pauses time. Hiding the tab pauses and saves; returning never catches up. Save/Load uses a local Phase 3 save slot and restores paused. There are no player time skips.

Fund: review buy/sell estimates, confirm orders, cancel pending orders, inspect positions and actual NAV history, or convert MYR/USD with explicit costs. Treasury: contribute/distribute fund capital, issue/repay debt and configure future dividend distributions. Statements: view each featured company's fictional accounts. Reports: inspect monthly fiscal cash/debt reconciliation after a month settles automatically.

```sh
npm run build
npm test
npm run e2e
npm run lint
```

Browser tests start this worktree on port **5174**, refuse to reuse another server, and therefore do not accidentally test the concurrently running Phase 1 checkout. Node 22.12+, 24, or 26+ is supported by the installed Vitest version; the current host's Node 25 runs the checks but npm reports an engine-range warning.

## Integrating with the concurrent Phase 1 branch

Phase 3 was implemented on a separate worktree from committed HEAD. No Phase 1 uncommitted files were copied. The standalone `src/main.tsx` is only a mount for `src/phase3/App.tsx`. When combining branches, retain the Phase 1 application entry and mount the exported `FundConsole` in its panel system:

```tsx
<FundConsole
  game={gameSnapshot}
  onCommand={dispatchCommand}
  onReview={pauseClock}
/>
```

`onCommand` accepts the engine's typed `Command`; dispatch against the authoritative game state at the displayed game minute, then publish a snapshot and show the `CommandResult.message`. `onReview` must pause the shared clock. Import `src/phase3/phase3.css` (already imported by the component module). The standalone `PhaseThreeApp` supplies its own local clock/save host and should be replaced by the shared Phase 1 host when integrating. The engine uses schema 2; supported schema 1 saves migrate on load.

This milestone does not implement or verify the Phase 1 map or Phase 2 source verification. It reuses the committed 40-company/calendar and macro/campaign engine. The map session may require manual conflict resolution in `src/main.tsx`, shared game/types/save files and new docs. No Phase 4–6 features were added.

See [decisions](docs/decisions.md) and [accounting equations](docs/economy-model.md) for costs, limits, scheduler order, rounding, fictional taxes and save migration limitations.
