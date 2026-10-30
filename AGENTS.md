# Agent instructions — KL Economic Empire

1. Read `PROJECT_SPEC.md` in full before editing. It is the source of truth.
2. Read `docs/decisions.md` — it records every interpretation of an ambiguous spec point. Add to it when you make a new one.
3. The simulation lives in `src/engine/` and must stay **pure, deterministic and React-free**. All randomness comes from `state.rng` (seeded, persisted).
4. Never add player-facing time skips, speeds above 3×, or offline catch-up. `runHeadless()` is for tests/dev tooling only.
5. Money: ledger balances are integer minor units (sen / US cents) stored as JS numbers and guarded by `assertSafeMinor`. Macro flows are MYR floats. See `docs/economy-model.md`.
6. Prices, financials and news are **fictional simulations**. Never present them as real market data.

## Definition of done for any change
- `npm run build` passes (strict TypeScript).
- `npm test` passes (unit + invariant + campaign tests).
- `npm run e2e` passes, or the UI was checked in a browser.
- New economic rules are documented in `docs/economy-model.md` and covered by a test.
