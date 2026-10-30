# Game balance log

Score = 30 % growth + 30 % public net wealth + 25 % satisfaction + 15 % stability (`src/engine/indicators.ts`).
Victory: score ≥ **75** (recalibrated from the spec's aspirational 80, see below), approval ≥ 60, no insolvency. Caps: insolvency → 30, unemployment > 12 % → 40, approval < 25 → 40.

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

**Open balance issues (superseded by pass 2 below)**
- Investment-heavy won on this seed: fixed in pass 2.
- The adverse recession scenario scores lower on average (tested), but needs tuning for a satisfying comeback arc.
- Wealth component rarely exceeds ~60 without tax rises; SWF returns are small relative to GDP-scaled wealth.

## Balance pass 2 (2026-10-31): projects, SWF weight, victory bar

**Diagnosis.** Commissioning all 7 projects was a free lunch: it ended with a *higher* public net worth than doing
nothing (+RM 7.4 bn vs +5.4 bn) despite ~RM 10 bn of spending, because capex was booked 1:1 as public assets with
no running costs, and the productivity gains also lowered inflation. The growth score was very steep (±1 pp/yr = ±15 pts).
The SWF was ~4 % of GDP, so fund skill barely moved the wealth score.

**Changes**
| Rule | Value | Where |
|---|---|---|
| Capex booked as public assets | 60 % (rest = leakage, land, design, overruns) | `ASSET_CAPITALISATION` |
| Upkeep of completed projects | 3 %/yr of cost × construction price index, paid as opex | `MAINTENANCE_RATE` |
| Construction-cost escalation | spending is priced at the property/construction price index; completion needs real work = cost | `ProjectState.work` (save schema v2, migrated) |
| Diminishing returns | each gain × exp(−existing sector boost / 4 %) | `BOOST_SATURATION` |
| Growth score slope | 1000 per pp of annual real growth (was 1500) | `computeScore` |
| Inflation penalty | band ±1.25 pp around 2.5 %, slope 1000 (was ±1 pp, 1500) | `computeScore` |
| Starting SWF | RM 15 bn + US$ 2.5 bn ≈ RM 26 bn (was ≈ RM 13 bn) | `BASELINE` |
| Victory threshold | 75 (was 80) | `VICTORY` |

**Replays after the change** (final score, 3 seeds)
| Strategy | seed 2027 | seed 11 | seed 42 |
|---|---:|---:|---:|
| Hands-off | 70.7 | 56.9 | 53.6 |
| All 7 projects at once (60 % debt cap) | 77.2 | 52.2 | 53.9 |
| SWF only (40/40 via rebalances) | 72.5 | 57.7 | 55.5 |
| 4 projects + SWF + more health/services | 76.9 | 54.0 | 53.3 |
| Adaptive: staggered projects + SWF + counter-cyclical budget | 73.1 | 61.7 | 58.5 |

**Reading.** Front-loading every project now trades public wealth for growth and, on unlucky seeds, causes a
post-construction fiscal cliff (unemployment 1.5 % → 7 %) — staggering projects matters. Responding to conditions is
the most robust approach (best on both tough seeds; locked in by a test). Hands-off cannot reach the victory bar on
any tested seed; scripted strategies reach it only on the favourable seed, so 75 leaves room for a human who reacts
to events better than these simple bots. Re-tune the bar if human playtests win too easily.

**Still open**
- Seeds with early event clusters (11, 42) keep growth scores low for everyone; consider scoring growth against a
  benchmark that partly adjusts for external shocks.
- Wealth still rewards tax-maximising strongly; it's balanced only by the satisfaction penalty.

## Phase 4 acceptance audit (2026-10-31)

No economic coefficients, scoring weights, event hazards, RNG draw order or victory threshold were tuned in this
pass. The acceptance tests now pin tax effective dates and the six-month capacity lag, paid construction demand
before productivity benefits, finite IO calibration and GDP separation from confirmed filled trades. Fiscal and
project forecast fixes change displayed estimates only. Historical replay tables above remain historical samples;
they are not a new balance result. External-event seed variance, the tax/wealth incentive and the victory bar's
dependence on scripted bots still require Phase 6 work and human playtesting.

## Phase 5 correctness pass (2026-10-31)

Shock timing and fiscal stress now have focused regression coverage. Company shocks include their final active
day; monthly bank decisions use the final settled day's stress rather than the new calendar day's events.
Unfunded capex and emergency work are no longer duplicated into operating arrears. These corrections can change
campaign outcomes even though event hazards, random draws, macro coefficients, scoring and victory thresholds
were not tuned. Earlier balance tables are historical and should not be treated as current calibration.

The full campaign suite still compares adaptive play over 12 seeds and recession/balanced scenarios over 20 seeds.
External-shock score variance, the tax/wealth incentive and human calibration of the victory threshold remain
Phase 6 work. Historical arrears in existing saves are preserved; no retroactive expenditure reconstruction is
attempted.
