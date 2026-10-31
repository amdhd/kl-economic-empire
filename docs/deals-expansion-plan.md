# Deals & Power expansion — implementation plan

Status: phases A–H implemented, 31 October 2026, on `codex/deals-power-expansion`.
Implementation choices and validation are recorded below and in docs/decisions.md and docs/economy-model.md.
Scope: requested ideas 2–7: investment negotiations, takeovers, infrastructure concessions, company rescues,
startup investments and long-term supply contracts. PROJECT_SPEC.md and recorded amendments remain authoritative.

## Problem and goals

The player can already adjust policy, approve FDI and invest public funds. The missing experience is negotiating
with counterparties, accepting contractual obligations and managing outcomes over time.

Deliver one Deal Room where the president can compare offers, negotiate bounded terms, fund agreements and follow
milestones. Success means different terms create measurable fiscal, employment, service and investment outcomes;
players can understand their exposure before signing; and no agreement manufactures public wealth or GDP.

Player stories:
- As president, I want to compare investor offers and negotiate commitments so incentives buy delivered outcomes.
- As public investor, I want to see valuation, ownership and downside before risking fund capital.
- As fiscal manager, I want all future payments and guarantees visible so today’s deals do not hide tomorrow’s bills.
- As player, I want counterparties to counteroffer, reject proposals and sometimes win competing bids.

## Current systems to extend

- `src/engine/fdi.ts`: seeded pledges, incentive offers, building/operating stages, grants, exports and jobs.
  Extend this lifecycle for negotiated FDI; do not generate a second economic project for the same investment.
- Existing projects: real work, construction prices, public assets and upkeep. Concessions need a distinct ownership
  and funding route while reusing project effects and delivery calculations.
- Existing treasury, SWF and SOE accounts: retain separation; add tagged deal records rather than duplicate balances.
- Existing explanations, alerts, policy history and final report: expose commitments, missed milestones and outcomes.
- Current baseline: schema 9/model 3. Choose the next schema at implementation time after checking the live repository.

## Shared design and constraints

One lifecycle: opportunity → due diligence → negotiating → agreed/reserved → active → completed/exited,
with explicit rejected, expired, failed and restructured states. Each feature uses only relevant stages.

Each deal stores its type, counterparty, sector, funding owner, currency, term version, expiry, signed terms,
funding schedule, milestones, obligations, ownership claims and bounded event history. Settlement IDs make payments,
share transfers, defaults and clawbacks idempotent. Material term changes require a new review/acceptance.

Negotiation uses a small set of visible concessions and deterministic counterparty utility: commercial return,
risk, policy credibility, alternatives and requested obligations. Use a persisted deal RNG only for explicitly
uncertain outcomes. Persist evaluation outcomes so reopening a panel or reloading cannot reroll an offer.

Keep the engine pure and React-free. Public cash balances, funding reservations, investment basis and contractual
payment ledger amounts use integer minor units guarded by assertSafeMinor; macro production flows remain MYR floats.
Currency conversions use the existing FX accounts/spreads. No new leverage or short-selling permission.

Reserve cash on acceptance where a closing payment is needed; reservations reduce available cash without being
expenses or payments. Revalidate at closing, release on expiry and prevent two deals spending the same cash.
Future appropriations are commitments, not reservations of cash that does not yet exist.

Show near-term cash needed, total scheduled payments, contingent exposure, exit cost and key assumptions separately.
Never present a probability-weighted estimate as a guaranteed maximum. Cap contractual guarantees explicitly.

## Feature requirements and delivery order

| Phase | Feature / playable scope | Completion gate |
|---|---|---|
| A | Shared Deal Room, lifecycle, cash reservations, obligation registry, seeded counterparties, save migration | One demonstration offer can be reviewed, rejected, signed, settled and restored without duplicate effects. |
| B | **2. Negotiated investment deals** — extend existing FDI offers with grant share, delivery deadlines, local sourcing and jobs/training commitments; bounded counteroffers and rival-location alternatives | A cheaper grant can lose a bid; staged payments require verified milestones; missed commitments can cancel unpaid support or create a collectible clawback claim. |
| C | **4. Infrastructure concessions** — compare direct public funding with a private consortium financing/operating a project; negotiate public contribution, service payment, user charge and capped guarantees | Private construction receives actual funding; service payments begin only on delivery; demand shortfall can trigger an affordable, recorded guarantee payment. |
| D | **7. Energy and supply contracts** — fixed/indexed prices, volume, duration and capped termination cost; start with fuel and industrial inputs | Prices can move against either party; fulfilled contract volumes replace spot purchases instead of adding a second input cost. |
| E | **6. Startup investment rounds** — fictional private firms pitch milestones, equity stakes and follow-on rounds; failure, dilution and acquisition exits | Investment exchanges cash for an asset; no immediate GDP/wealth reward; funding can run out and ownership reconciles through every round. |
| F | **5. Distressed-company rescues** — conditional loan, equity recapitalisation, staged restructuring or refusal; job and creditor consequences | Distinguish liquidity from insolvency; loans have matching liabilities; defaults/recoveries cannot pay beyond available enterprise assets. |
| G | **3. Takeovers and bidding wars** — fictional private targets, negotiated controlling stakes, competing bids, shareholder acceptance and delayed integration | Closing transfers ownership once; price includes control premium/fees; operating benefits are delayed and integration can fail. |
| H | Integrated campaign balancing, reporting and final browser polish | All six features interact without dominant free-money strategies, double-counted output or invisible obligations. |

A–B form the first playable release. C–D add public contracts. E–G reuse the enterprise/ownership system, with takeovers
last because they depend on trustworthy valuation, ownership and restructuring. These are milestone gates, not dates.
No deadline or delivery-time estimate has been requested.

### B: investment negotiations

Start with three proposal templates: regional hub, renewable-energy project and data centre. Retain current FDI
kind calibration and existing long-build projects. Direct jobs must flow through the existing labour accounting;
local-sourcing promises cannot create suppliers or jobs without demand and delivery capacity.

Limit negotiation rounds and show a response date in game time. Rival-location alternatives use fictional names
and disclosed commercial factors. Tax relief must reduce actual eligible tax receipts and expire, rather than pay
an equivalent cash grant on top. Clawbacks are receivables until collected; defaults can make them unrecoverable.
Existing signed FDI projects keep their original terms and delivery paths.

### C: concessions

Use a small fixed menu of consortium offers and terms, rather than a general procurement simulator. This provides
bidding without introducing the separately unrequested contractor-reputation feature. Distinguish government-owned
assets from privately owned concession assets. Do not book the whole concession as public wealth or hide its future
payments. Avoid duplicate productivity boosts when replacing a public-project funding route.

### D: supply agreements

Start with government fuel procurement and optional input-purchasing programmes for participating domestic firms.
The president cannot bind every private firm to a national contract. Define participating volume and funding payer.
Monthly quantities settle from daily deliveries; shortages and counterparty failures produce explicit shortfalls.
Procurement price and supplier revenue must reconcile. Household administered prices and subsidy payments remain
separate: cheaper procurement must not generate a second subsidy saving on the same litres.

### E–G: enterprises, rescues and takeovers

Use a small roster of wholly fictional private enterprises, separate from the 60 listed securities. A startup exit
can be a fictional private acquisition; no IPO or change to the listed stock universe is needed for this release.
Use cash-backed, minority SWF investments with a configurable strategic allocation budget, initially proposed at
10% of fund NAV. Controlling acquisitions belong to a separate, explicitly authorised SOE strategic-investment
mandate with its own exposure limit; do not silently bypass the SWF’s existing concentration cap.

Before any enterprise purchases, document ownership, cash, debt, external shareholders, investment basis and
consolidation. Public-to-public transfers and acquisitions within public ownership cannot earn public-wealth credit.
Investment write-downs, dilution, liquidation proceeds and sale proceeds flow through the same valuation rules.
Featured companies remain samples of the aggregate economy: new enterprises’ sales/jobs must be allocated within
sector activity or funded incremental production, not added to aggregates a second time.

Rescue loans are tagged contractual receivables in the authorised SOE mandate, not a general corporate-bond market
or permission for SWF leverage. Loans mature, accrue interest, can restructure and can lose value. Distressed cases
use fictional companies; no invented scandal or insolvency is attributed to a real business.

## Interface

Add a Deal Room entry alongside Investment & FDI. Tabs: Opportunities, Negotiations, Active agreements, Public
exposure and Outcomes. Route existing FDI offers into the room while preserving access from their current panel.

Offer cards show the counterparty, rationale, decision deadline, payment owner and main trade-off. The detail view
compares current and proposed terms, milestones, cash needs, downside and alternatives. Signing uses the existing
confirmation-pause preference. Deadlines progress only with the normal game clock.

Alerts cover expiring offers, unfunded payments, guarantee calls, failed milestones and distressed holdings.
Explanations distinguish contractual facts, current conditions and uncertain forecasts. Illustrative map sites remain
explicitly fictional; national deals without verified KL locations need no marker.

## Economic and campaign accounting

- Buying equity or lending exchanges cash for an asset; fees and impairment reduce value. Neither is GDP.
- Grants and incentives incur real fiscal costs. Pledges are not realised investment or spendable cash.
- Construction and procurement affect GDP through funded production, inputs and imports using existing accounting.
- Guarantees remain contingent until triggered; register caps and stress exposure from signing onward. Recognise
  expected losses conservatively in risk reporting and reconcile any score valuation adjustment explicitly.
- Unfunded contractual payments follow documented arrears/default rules; discretionary negotiations cannot silently
  inherit essential-service bridge financing.
- The 24-month end report includes uncompleted deals, remaining payments, guarantees, holdings and impairments.
  Long-duration deals retain their true duration; signing late cannot earn full future profits in the final score.
- Recalibrate scoring separately using current model-3 weights, including global standing. Do not restore obsolete
  four-component weights or reward a favourable paper valuation solely because the player signed a deal.

## Priorities and boundaries

P0: all six requested feature types, meaningful accept/reject/counteroffer choices, explicit money/ownership,
settlement schedules, failure paths, persistence, explanations and campaign exposure reporting.
P1 after those work: richer negotiation personalities, more templates, joint ventures and additional commodities.
P2: public-listed-company takeovers, IPOs, secondary private-share trading and complex derivatives.
Market manipulation (#1), corporate bond markets (#8), full contractor systems (#9) and persistent rival-investor
agents (#10) are outside this requested expansion. Scripted rival bids remain part of negotiated deals/takeovers.

## Validation and success targets

Every phase must pass build, unit/invariant/campaign tests and e2e or a browser check. Document each new equation in
economy-model.md before marking its phase complete. Test real calendar deadlines, rejection/expiry, cash reservation
races, partial funding, default, cancellation, dilution and save/resume at every settlement boundary.

Required invariants: no unsafe minor amounts, no duplicate settlement, ownership sums to 100%, reservations never
exceed eligible cash, every loan has a liability, and no public transfer/acquisition creates wealth. Disabled new
systems must reproduce previous economic paths and RNG streams for migrated saves.

Balance using at least 12 development seeds and 12 held-out seeds. Compare no deals, selective deals, accept every
offer, aggressive incentives, rescues and takeovers. Report cumulative real output/income and public wealth plus
recent-condition campaign scores. Initial design target: accepting every deal must not dominate selective play;
all six categories must offer at least two viable term choices in some scenarios. These are targets to verify,
not claims of completed balancing. Human playtesting must confirm the room feels like negotiation, not six extra sliders.

## Migration, implementation handoff and open decisions

Introduce versioned deal state and migration only when implementing phase A. Existing saves receive an empty,
inactive expansion and retain balances, clocks, RNG, signed FDI and prior histories. New campaigns enable the
expansion; an old save may opt in prospectively with a disclosed start date. Never generate retroactive obligations.

Candidate modules: engine/deals.ts (shared lifecycle), deal-accounts.ts, concessions.ts, supply-contracts.ts,
private-enterprises.ts and corresponding data templates/UI components. Extend fdi.ts, scheduler, commands, state,
persistence and reports incrementally. Each phase should finish as a reviewable implementation and validation unit.

Nonblocking decisions for implementation: exact offer arrival rates, negotiation-round limits, exposure budgets,
valuation discounts and contract caps. Start conservative, record chosen values in decisions.md, and tune using the
validation seeds. Implementation was subsequently authorised, with a separate branch and validation between phases.


## Implementation and validation record

All six requested categories are available in Info views → Deal Room. Shared exposure reporting, alerts,
schema-10 migration and prospective opt-in for existing model-3 saves are implemented. Each implementation phase
passed build and simulation checks plus targeted browser checks before starting the next phase. Final validation:
strict build, lint and 269 simulation tests. A full browser run passed all 46 tests before the final fuel-envelope
edge-case fix. The final full run passed 45/46, with an existing help-dialog navigation click timing out after
its element detached; both phase-6 browser tests passed on an isolated rerun (24.7s). This intermittent browser
timing failure remains a test-suite limitation. The zero-administration-budget fuel-contract case
is covered: contracted fleet volume cannot exceed the actual procurement envelope or create negative spending.

The reproducible campaign harness is `node scripts/deal-balance.mjs`. It runs six strategies across development
seeds 1801–1812 and held-out seeds 1901–1912: 144 complete campaigns. It checks fiscal reconciliation, finite
balances, valid deal states and the selective-versus-accept-all wealth trade-off. Raw results are generated in
ignored `artifacts/deal-balance.json`; these are fictional simulation outcomes.

| Held-out mean | Campaign score | End public wealth, RM bn | Cumulative real output, RM bn | Remaining commitments, RM bn |
|---|---:|---:|---:|---:|
| No deals | 58.91 | -1325.85 | 4187.78 | 0.000 |
| Selective | 59.66 | -1326.90 | 4195.08 | 0.285 |
| Accept all | 59.91 | -1327.54 | 4198.34 | 1.292 |
| Aggressive incentives | 59.94 | -1333.96 | 4204.67 | 3.743 |
| Rescues | 58.91 | -1325.88 | 4187.82 | 0.000 |
| Takeovers | 58.90 | -1325.93 | 4187.78 | 0.000 |

Accept-all increases output and the weighted campaign score, but selective play preserves about RM0.64bn more
public wealth in held-out means and about RM3.19bn in development means. Aggressive incentives carry higher
costs and future obligations. These checks establish an accounting and economic trade-off, not a claim that
balance or enjoyment is proven. Existing campaign weights and victory thresholds were unchanged. Regression
scenarios exercise at least two accepted term choices in each category. Human playtesting remains necessary
for negotiation feel, clarity and difficulty; richer templates remain outside this implementation.
