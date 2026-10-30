# Game balance log

Score = 30 % growth + 30 % public net wealth + 25 % satisfaction + 15 % stability (`src/engine/indicators.ts`).
Victory: score ≥ 80, approval ≥ 60, no insolvency. Caps: insolvency → 30, unemployment > 12 % → 40, approval < 25 → 40.

## Stability tuning (2026-10-31)
| Problem observed in seeded headless runs | Fix |
|---|---|
| Investment accelerator: boom to 1.5 % unemployment and 8 % inflation, then bust to 13.5 % | Partial adjustment of investment plans, lower return sensitivity, labour-capacity cap on output, softer Phillips curve |
| Any +3 % demand shock pinned unemployment at the floor | Elastic workforce (commuters/migrants) |
| No-event baseline slid into a deflationary spiral (u → 19 %) | Permanent-income smoothing, relative-price export competitiveness, OPR reacts to KL output gap, weaker NPL→spread feedback |
| Month-length sawtooth in household income | Distributions normalised to an average month |
| Thin-margin companies (Sime Darby) had near-zero baseline profit | D&A capped at 30 % of EBITDA |

## Hands-off variation (8 seeds, balanced scenario, before player input)
Unemployment ranges 1.5–9.4 %, inflation −1.8…5 %, scores 38–77. Recessions arise from random event clusters,
so passive play rarely wins.

## Strategy comparison (seed 2027, `tests/campaign.test.ts`)
| Strategy | Score | Growth | Wealth | Satisfaction | Stability | Approval | Debt RM bn | Unemp. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Hands-off | 70.9 | 69 | 57 | 83 | 83 | 84 | 49.1 | 1.7 % |
| Balanced growth (3 projects, small tax trim, SWF 35/35/30 via weekly rebalances) | 77.1 | 80 | 58 | 85 | 95 | 85 | 54.1 | 1.8 % |
| Tax maximiser (30/8/10/6 %) | 50.1 | 0 | 91 | 34 | 95 | 37 | 49.1 | 8.2 % |
| Investment-heavy (all 7 projects, 60 % debt cap) | 82.9 | 97 | 60 | 86 | 95 | 86 | 56.6 | 1.7 % |
| Austerity (−30–60 % budgets) | 48.4 | 0 | 79 | 45 | 90 | 49 | 49.1 | 4.2 % |

**Open balance issues**
- Investment-heavy wins on this seed: project productivity gains may be too generous relative to their cost, and
  the growth component saturates. Consider diminishing returns per project kind or a construction-capacity limit.
- The adverse recession scenario scores lower on average (tested), but needs tuning for a satisfying comeback arc.
- Wealth component rarely exceeds ~60 without tax rises; SWF returns are small relative to GDP-scaled wealth.
