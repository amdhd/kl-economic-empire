# Human campaign validation

Automated replays validate determinism, causal separation and accounting; they do not validate human difficulty.
The 75-point / 60-approval victory gate remains provisional. This checklist has **not** been completed by a human.

1. Start a balanced campaign at seed 20270101, and later one recession campaign at a different seed. Record the
   seed, scenario, dates and reasons for policy choices. Use only Pause/1×/2×/3×; a term takes about 4.9 running
   hours at 3×, with additional pauses for decisions. Spread sessions across saves as needed.
2. In the first month, inspect sectors, budgets, the corporate-tax forecast and exchange sessions. Confirm that
   the cost and effective date are understandable before making each decision. Trade a small MY position and a
   USD position, noticing fees, FX and overnight US hours. Try Help and keyboard controls while deliberating.
3. Through the term, respond to unemployment and shocks. Stagger infrastructure and budgets; compare service
   quality, real income, credit conditions and treasury needs. Record any case where the causal explanation seems
   inconsistent, a control is confusing, or the model feels unresponsive. Save/reload between real sessions and
   verify that game time stays where it was left.
4. At the end, inspect the score calculation, true opening/closing comparison, term cash flows, fund gain and
   policy/event history. Record score, approval, solvency, the four component scores and whether the outcome feels
   earned. Distinguish difficulty from poor explanation and from a broken economic rule.
5. Evaluate several strategies/seeds before proposing a victory-bar change. A single lucky win or bad-event
   cluster is insufficient calibration. Add dated evidence to `game-balance.md`; do not label a bot replay as a
   human session.

Automated browser checks exercise UI controls and report readability, not a five-hour human decision process.
Known limitations: external-shock compensation is partial, the seven-sector economy is reduced form, and hosted
map loading can cause stalls even when deterministic engine ticks are inexpensive.
