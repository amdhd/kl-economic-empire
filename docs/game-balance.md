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

## Phase 6 calibration (2026-10-31)

This pass changes scoring, not simulated policy flows, event probabilities or RNG draws. The same 12 seeds were
run before and after: **2027, 11, 42, 201–209**. Strategies share `tools/campaigns.ts`; adaptive combines the
balanced-growth script with monthly counter-cyclical transfers/development. Adverse recession is hands-off in
the recession scenario. The before run uses the Phase 5 score. All table values are means of fictional replays.

| Strategy | Score before | Score after | Wealth before | Wealth after | Approval (unchanged) | Wins after |
|---|---:|---:|---:|---:|---:|---:|
| Hands-off | 53.79 | 52.80 | 51.44 | 50.50 | 63.21 | 0/12 |
| Balanced growth | 52.17 | 51.34 | 50.37 | 49.77 | 61.88 | 0/12 |
| Tax maximiser | 47.66 | 44.04 | 87.37 | 74.06 | 34.00 | 0/12 |
| All projects | 51.08 | 50.21 | 47.34 | 46.90 | 62.87 | 0/12 |
| Austerity | 44.71 | 42.91 | 76.92 | 70.93 | 36.27 | 0/12 |
| Adaptive | 57.12 | 56.10 | 49.18 | 48.61 | 70.53 | 0/12 |
| Adverse recession | 48.83 | 50.07 | 42.08 | 41.86 | 60.90 | 0/12 |

Changes: actual-day annualisation removes calendar luck; CPI deflation and income/output/service sustainability
reduce tax/austerity wealth credit; a symmetric ±1 pp benchmark adjustment partly cushions recorded external
shocks. Caps and 75/60 victory criteria are unchanged. Fiscal taxes still legitimately add public wealth; the
score now also evaluates whether that wealth was sustained without degrading living standards.

**Separate validation set: seeds 401–412**, with no further tuning after seeing its results:

| Strategy | Mean score | Range | Mean approval | Wins |
|---|---:|---:|---:|---:|
| Hands-off | 56.79 | 42.86–71.17 | 68.94 | 0/12 |
| Balanced growth | 57.26 | 43.82–75.06 | 70.02 | 1/12 |
| Tax maximiser | 44.44 | 41.28–46.23 | 35.78 | 0/12 |
| All projects | 56.17 | 41.92–72.67 | 71.15 | 0/12 |
| Austerity | 42.75 | 39.76–46.47 | 38.67 | 0/12 |
| Adaptive | 59.86 | 49.47–70.71 | 73.53 | 0/12 |
| Adverse recession | 48.52 | 35.37–60.91 | 60.59 | 0/12 |

Adaptive play still gives the best mean, but seed variance remains substantial and simple bots rarely win.
The external adjustment is intentionally limited to 3 total points; it does not erase a recession or fully solve
the early-cluster problem. Keep 75 provisional until human playtesting (see `docs/playtesting.md`), rather than
lower it just to make scripted bots win. Re-run with `npm run balance` or pass `--seeds` and `--output`; generated
JSON goes under ignored `artifacts/`, separate from Playwright's disposable output directory.

## National baseline pass — 31 October 2026

The user changed new campaigns to Malaysia observations (D-018–D-023). Keep legacy save calibration intact. The national
opening debt/GDP is about68.1% because debt is Q2 2026 and the denominator is observed2025 nominal GDP; this mixed-date
ratio is a game opening calculation, not MOF's contemporaneous63.1% figure. Start with a fictional80% borrowing cap and
65%/60% spread/rating thresholds. The narrow BNM cash proxy means bridge financing can still occur during a month.

The reduced taxes initially underfunded national operations because several federal tax categories were absent. Fix a
non-policy-responsive residual so opening total annual receipts equal the MOF2027 estimateRM380.816996bn. Do not alter
receipts to guarantee later solvency. Operating estimates totalRM376.84bn including the separately settled debt-service
reference. Published development capex is not automatically appropriated; commissioned game projects remain separate.

Strategy scripts now express spending as fractions of the sourced budgets; old absolute KL-sized amounts caused cuts
that contradicted their strategy names. `investment_heavy` keeps a national-compatible80% cap instead of cutting it to60%.
The old isolated Phase5 fiscal stress regression explicitly retains its original KL profile; national campaigns are also
covered by full-engine causal, accounting, strategy and save tests. National scoring does not reward inflation of a
negative opening net worth; it deflates modeled assets while retaining nominal liabilities.

Six-seed check (`npm run balance -- --seeds 2027,11,42,201,202,203 --output artifacts/malaysia-balance.json`):

| Strategy | Mean score | Range | Mean approval | Wins |
|---|---:|---:|---:|---:|
| Hands off |56.06|44.61–68.77|69.90|0/6|
| Balanced growth |54.99|36.21–71.23|69.91|0/6|
| Tax maximiser |46.08|43.99–48.34|35.09|0/6|
| Investment heavy |59.16|41.86–73.85|73.61|0/6|
| Austerity |42.98|41.57–44.31|34.35|0/6|
| Adaptive |58.06|49.04–69.96|73.85|0/6|
| Adverse recession |24.43|12.97–50.71|29.07|0/6|

These are deterministic bot replays, not human playtesting, and do not exercise optimized trade/FX strategies. National
infrastructure spending remains a set of KL projects relative to a larger national economy, so the benefit is smaller.
Keep victory75/approval60 pending human testing; this pass does not claim retuning the whole campaign. Early clustered
bad shocks remain a material balance issue. Monetary intervention elasticities are bounded fictional assumptions and
need human feedback. Keep comparisons multi-seed; no new RNG draws were introduced by trade/FX or migrations.

Verification for this expansion: strict build,147 unit/invariant/campaign tests,23 Playwright browser tests and lint pass.
Browser checks include full-digit treasury/SWF cash, official source links, laptop navigation scrolling, trade policy
month-boundary timing, FX inventory settlement and treasury reconciliation. Manual screenshots at1600×900 and1280×800
confirm the balance footer fits without horizontal overflow. No player saves were used for screenshots.

## Schema 6 pass — fiscal rules, SOEs, commodities and partners (31 October 2026)

Seeds 2027, 11, 42, 201–203 (`npm run balance -- --seeds …`), model-2 national campaigns. Means of fictional replays:

| Strategy | Score | Range | Growth | Wealth | Approval | Wins |
|---|---:|---:|---:|---:|---:|---:|
| Hands-off | 52.38 | 38.29–64.68 | 34.37 | 42.74 | 71.15 | 0/6 |
| Balanced growth | 52.37 | 38.62–64.72 | 36.49 | 40.77 | 72.35 | 0/6 |
| Tax maximiser | 37.90 | 24.89–44.76 | 0 | 67.63 | 29.49 | 0/6 |
| Investment heavy | 53.07 | 39.42–65.35 | 36.74 | 42.23 | 72.38 | 0/6 |
| Austerity | 27.82 | 23.83–39.84 | 0 | 64.14 | 17.14 | 0/6 |
| Adaptive | 53.43 | 46.40–63.24 | 37.73 | 41.34 | 73.39 | 0/6 |
| Adverse recession | 31.07 | 13.57–55.45 | 16.52 | 31.97 | 40.12 | 0/6 |

Doing nothing now leaves the deficit near 3.7% of GDP against a glide path to 3%, so fiscal credibility drifts from 60
toward the mid-40s, raising yields and lowering the stability score: consolidation is a real objective. Austerity scores
lower than before because deep development cuts erode public capital and the large demand multiplier (see
economy-model "Known limitation") amplifies the contraction. Bots still never win; 75 stays provisional pending
human playtesting.


## Household feedback correction — D-051 (31 October 2026)

Paired 24-month experiments on seeds **11, 42, 201, 2027**, current national model. Random event and commodity-episode
hazards are disabled, while seeded background price/demand cycles remain active. All policies are hands-off except
subsidy removal (fuel eligibility becomes zero at the next month boundary). Oil is a 50% event multiplier, ramped
in over seven days, active on days 31–120. Recession uses the existing 180-day slowdown/credit-crunch scenario.
Each shock is compared with its same-seed, same-version, same-diagnostic baseline. Values are the mean of individual
seed peak monthly real-GDP gaps, not real-world estimates. Baseline and after-run JSON are in ignored artifacts;
the repeatable dev-only harness is `scripts/household-balance.mjs`.

| Scenario | Peak GDP gap before | Peak gap after | Month 12 gap before | Month 12 gap after |
|---|---:|---:|---:|---:|
| Temporary oil shock | −2.505% | −1.798% | +0.093% | +0.788% |
| Remove fuel subsidy eligibility | −4.007% | −1.909% | −3.148% | −1.585% |
| Recession | −7.513% | −5.546% | −4.150% | −0.346% |

Ablation: fixing MPC at its opening value reduced the old recession trough to −5.778%; after the correction it is
−5.451%, close to the new full-model −5.546%. Fixing confidence at 0.6 changes the old recession trough to −6.670%
and the new one to −5.437%. These diagnostics isolate broad channels, not additive causal shares. Unit tests also
bound investment and credit adjustments separately. The cash constraint is tested with deliberately depleted savings;
these aggregate campaigns started with ample savings and did not hit it. Recessions still reduce wages/output and
income; persistent subsidy reform retains a negative output gap, rather than receiving a forced recovery.

Campaign-test expectations changed deliberately: a meaningful strategy-score spread is now >5 rather than >8, with
additional checks that tax maximisation lowers debt and costs >15 approval points. The responsive bot still gains
about 2.43 points on weak seeds (<55 passive score, seeds 301–312); its whole-sample gain is roughly −0.06, so stimulus
is no longer required to pay off in healthy campaigns. Require >1 point in the weak subset and more benefit there
than across all seeds. No victory thresholds, score coefficients or bot policies were changed to make tests pass.

**Remaining scoring limitation:** the score rewards recent recovered output/approval and partially offsets external
shocks. Across 20 seeded campaigns (201–220), the recession's final mean score can exceed the balanced mean (56.06 vs
53.13 in this pass), despite lost cumulative output and income. The recession regression now checks those full-campaign
economic costs, including >1% mean cumulative output loss, rather than incorrectly treating the adjusted endpoint score
as a measure of total harm. Scoring calibration and human playtesting remain separate work. These results demonstrate
less amplification, not validation against empirical Malaysian multipliers.

Experiment boundary: the existing weekly scheduler skips draws for already-active events, so different starting shocks
can change later RNG alignment even with the same seed. These are multi-seed replay comparisons, not perfectly matched
external histories. Within-scenario ablations retain the same prescribed shocks. No engine RNG ordering was changed.

Final verification for D-051–D-054: production build, lint, **211 unit/invariant/campaign tests** and **35 Playwright
browser tests** pass. The explanation panel was visually checked at 1280×800 and alert settings at 1600×900.

## National trend — D-055 (31 October 2026)

**Diagnosis.** A monthly probe (events off, seed 2027 and seven others) recorded investment against
`capital × (δ + g)`, capacity against output, utilisation, employment against the workforce, MPC, confidence, lending
rate, OPR, exports, wage index and return on capital. The opening was steady. The drift came from inconsistent trends:
government purchases flat in ringgit, a 3.5% KL-era natural rate against a 3.0% opening, and KL-era supply and
potential values. Because output is demand-determined, autonomous demand (exports ~4.4%, real government purchases
≈ −1.2%/yr, flat resources) set growth at ~2.6%. A supply-only fix raised unemployment to ~4.4%.

**No-event 24-month runs** (events off, commodity episodes and background cycles on; 8 seeds 2027, 11, 42, 201–205):

| | Before (8171ec3) | After (model 3) |
|---|---:|---:|
| Mean real growth, annualised over the campaign | 2.32% | 3.35% |
| Mean growth in the final 12 months | 2.40% | 3.52% |
| Mean unemployment after 12 months / at the end | 3.22% / 3.10% | 3.38% / 3.23% |
| Mean cash deficit at the end (% GDP) | 3.28% | 3.91% |
| Mean OPR at the end (opening 2.75%) | 2.22% | 2.38% |
| Noise-free seed 2027 (cycles and episodes zeroed): growth yr 1 / yr 2 | 2.41% / 2.55% | 3.30% / 3.60% |
| Noise-free seed 2027: unemployment at 12 / 24 months | 2.94% / 2.94% | 3.03% / 3.07% |

Growth rises about a percentage point. Unemployment stays near the 3.0% opening in the noise-free run under the
higher growth, although the seven sectors now add 2.6%/yr productivity rather than 1.5%. Noisy seeds still swing
(2.2–4.7% at the end) because of background cycles; seed 202 (an early oil episode) remains a downturn at 1.75%
growth, as it should. The structural result is ~3.5% growth against a 3.8% potential. Resources are flat in volume;
the seven sectors grow ~4.2%. Pre-8171ec3 code (7a68348) gave 2.69% mean growth on the same seeds, with end
unemployment between 1.5% and 6.2%.

**Strategy replays** (`npm run balance`, 12 default seeds; means of fictional replays):

| Strategy | Score before | Score after | Growth pts before → after | Wealth before → after | Approval before → after | Wins |
|---|---:|---:|---|---|---|---:|
| Hands-off | 52.06 | 52.73 | 30.2 → 36.7 | 45.3 → 40.8 | 70.0 → 73.4 | 0/12 |
| Balanced growth | 50.70 | 51.74 | 29.9 → 36.9 | 43.0 → 38.8 | 70.2 → 73.6 | 0/12 |
| Tax maximiser | 49.26 | 48.21 | 0.0 → 0.7 | 86.3 → 81.9 | 41.3 → 41.6 | 0/12 |
| Investment heavy | 51.52 | 52.48 | 30.0 → 37.1 | 44.5 → 40.4 | 69.9 → 73.4 | 0/12 |
| Austerity | 48.21 | 45.04 | 3.9 → 1.2 | 79.3 → 77.2 | 47.9 → 43.1 | 0/12 |
| Adaptive | 51.19 | 51.84 | 30.9 → 36.5 | 43.4 → 39.4 | 70.7 → 73.5 | 0/12 |
| Adverse recession | 56.77 | 57.33 | 45.3 → 52.7 | 43.8 → 37.5 | 73.8 → 77.6 | 0/12 |

The growth benchmark rose from 3.5% to 3.8%, yet growth points rose because untouched growth is now nearer potential.
Wealth points fell because inherited budgets now grow with the economy instead of silently consolidating. Austerity
scores lower since cutting a budget now also cancels its indexation. The D-051 limitation remains: the recession
scenario's endpoint score can exceed balanced play. Bots still never win; 75 stays provisional.

## Demand recalibration and wealth credit — D-056/D-057 (31 October 2026)

Macro validation results are in `docs/economy-model.md` (D-056). Effects on the untouched economy (8 seeds, events
off, cycles and episodes on): mean growth 3.26%/yr (final 12 months 3.0%). Unemployment holds at 3.2–3.3%,
and the worst seed's peak falls from 5.7% to 3.7%. Seed variance narrows (2.6–3.9% growth). The noise-free seed-2027
path is 3.2% / 3.4% growth with unemployment at 3.1–3.2%. Productivity (2.3%) and potential (3.6%) were revised so
supply matches this demand path.

**Strategy replays** (`npm run balance`, 12 default seeds):

| Strategy | D-055 | D-056 only | D-056 + D-057 | Growth | Wealth | Approval |
|---|---:|---:|---:|---:|---:|---:|
| Hands-off | 52.73 | 57.06 | 57.61 | 43.4 | 44.6 | 77.7 |
| Balanced growth | 51.74 | 55.67 | 56.41 | 43.6 | 42.6 | 78.1 |
| Tax maximiser | 48.21 | **61.23** | 54.14 | 17.9 | 69.7 | 56.7 |
| Investment heavy | 52.48 | 56.50 | 57.13 | 44.3 | 43.7 | 77.9 |
| Austerity | 45.04 | 55.08 | 46.74 | 11.8 | 52.5 | 59.2 |
| Adaptive | 51.84 | 56.20 | 56.62 | 43.5 | 43.2 | 77.8 |
| Adverse recession | 57.33 | 58.20 | 58.94 | 50.9 | 42.5 | 77.9 |

Smaller multipliers make the economy steadier and taxes cheaper. Without D-057, tax maximisation would have been
the best bot strategy. With it, tax and austerity rank below passive play again, and approval still bars both from
winning. Counter-cyclical stimulus is now roughly score-neutral: it lowers recession unemployment but costs wealth.
All bots cluster at 54–59 and none wins; 75 stays provisional pending human playtesting. The recession scenario's
endpoint score still exceeds balanced play (the D-051 limitation).

**After D-058** (fund macro effects, same 12 seeds): hands-off 58.01, balanced growth 56.83, tax maximiser 54.20,
investment heavy 57.70, austerity 47.51, adaptive 57.08, adverse recession 59.31; no wins. The bots barely trade
the fund, so these move mainly through Tobin's q.
