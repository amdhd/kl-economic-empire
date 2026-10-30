# Phase 3 accounting model

All prices, company accounts and economic series are fictional simulation data. The baseline engine already contains broader macro/campaign logic; this milestone changes fund/accounting behavior only.

## Units and rounding

Fund MYR and USD cash, treasury, public debt, position cost basis, realized returns and dividend totals are safe integer minor units (sen / US cents). `assertSafeMinor` guards postings and accumulated balances. Corporate and macro flows remain floats in major units of the explicitly named currency. `toMinor` rounds to nearest minor unit, halfway away from zero. Reject non-finite, non-positive, fractional-share and unsafe inputs. FX receipts round down. Treasury payments are limited to available cash, with the actual paid amount posted; financing and arrears are explicit in the existing government settlement. This also prevents multiple daily rounded disbursements overdrawing by a few sen.

## Equity orders and cash conservation

Immediate settlement, no leverage or short sales. MY board lots are 100 shares, US lots one share. The hard single-equity concentration limit is 20% of NAV; an order may not exceed 25% of the simulated average daily traded value.

- Impact = `0.1 × sqrt(midPrice × shares / averageDailyValue)`.
- Execution price = `mid × (1 ± (halfSpread + impact))`, plus for buys, minus for sells.
- MY half spread 0.10%, fee 0.20%; US half spread 0.02%, fee 0.03%.
- Buy: cash decreases by rounded `(executionPrice × shares + fees)`; units increase and basis increases by exactly the paid cash. MYR basis converts that rounded cash at execution FX.
- Sell: cash increases by rounded `(executionPrice × shares − fees)`; average cost basis is removed proportionately. Final liquidation removes the entire remaining basis. Realized local profit = proceeds less released local basis. Realized MYR profit = proceeds translated at sale FX less released acquisition-date MYR basis.
- Cumulative realized totals survive deletion of fully sold positions. Trades/mark-to-market gains never post government taxes or GDP.

An equal-value asset replaces spent cash; only fees/spread/impact reduce NAV. The external market is the counterparty, not a public account. Settlement functions enforce session hours, expiry and order status themselves. Filled/cancelled/expired orders cannot execute again. Closed-market orders queue for seven calendar days and can be cancelled. Pending sells reserve shares; buys do not reserve cash and compete in submission order. Revalidate all constraints at execution. Queued execution occurs at the first open **hourly tick**, potentially 30 minutes after the session opens. Quotes shown before confirmation include all estimated costs; actual future queued execution can differ.

## FX and portfolio valuation

`f = MYR per USD`. MYR→USD: `receivedCents = floor(paidSen / (f × 1.0025))`. USD→MYR: `receivedSen = floor(paidCents × f × 0.9975)`. Reject conversions whose receipt rounds to zero. Journal both currency cash legs and the FX snapshot. A round trip loses the spread and rounding; no nominal share quantities change.

`NAV_MYR = MYRCash/100 + USDCash/100 × f + Σ(shares × lastSimulatedPrice × currencyFX)`.

US holdings show local return against USD basis and MYR return against acquisition-date MYR basis. Daily NAV history contains real simulation marks (bounded at 800 points), with units and game dates shown. Monthly performance = `(endingNAV − netTreasuryInflowsDuringMonth) / previousNAV − 1`; this simple transfer-adjusted return is not a money-weighted or time-weighted attribution model. It includes FX, net dividends, fees and market moves.

## Company statements, dividends and taxes

Revenue less labor, energy and other costs = EBITDA. EBITDA less depreciation = EBIT. EBIT less net interest = pretax profit. KL corporate tax applies only to positive pretax profit × KL exposure. Other exposure uses exogenous MY 24% / US 21% rates. Net income = pretax profit less taxes. No tax refund on losses.

Featured companies are samples within the sector aggregates: their KL taxes are informational and already contained in the sector collections. Do not collect both independently. Operating revenue/costs accrue daily. At monthly close, maintenance capex equals depreciation, so the simplified net cash change before financing and dividends equals net income. Negative corporate cash is financed by matching new corporate debt.

Opening retained earnings are the undistributed net income in synthetic opening history. Thereafter retained earnings increase by net income minus dividends. At quarter end, declared dividends = `max(0, min(quarterNetIncome × payoutRatio, availableCash × 0.5, cumulativeRetainedEarnings + currentNetIncome))`. They cannot be paid from accumulated losses. Total declared dividends reduce company cash and retained earnings. The SWF receives its share by units / shares outstanding; other shareholders receive the remainder outside the public accounts. US dividends have fictional 15% withholding. Net SWF receipts increase listing-currency cash and cumulative dividend totals.

The configured fraction of net dividend receipts accrues as a pending MYR treasury distribution. Actual month-end payment is limited to available fund MYR cash; convert USD separately. Unpaid distributions carry forward. A transfer decreases fund cash and increases treasury cash by identical sen, without creating public wealth or tax revenue.

## Government and monthly reconciliation

Each treasury posting records signed integer cash and resulting treasury balance in a bounded journal (800 entries); monthly flow aggregates remain available in reports after journal pruning. Debt issuance increases cash **and debt**; repayment decreases both. Treasury contributions to and distributions from the SWF are separate from revenue and expenditure.

At month end: close companies, pay their dividends to holders, settle fund distributions, then close government flows. This includes distributions in the same month's report rather than the next month's opening ledger.

`EndingTreasury = OpeningTreasury + Taxes + Grants + Borrowing + FundDistributions − Opex − Capex − Interest − Principal − FundContributions − EmergencyOutlays`.

`EndingDebt = OpeningDebt + Borrowing − Principal`.

The report records opening/closing integer balances, net cash postings and both residuals. Residuals must equal exactly zero sen. Opening balances come from the prior report or fictional baseline for the first month. Reports, cash balances, histories, orders, boundary cursors and RNG are saved; restoring never settles another financial event.

## Save compatibility

Schema 2 adds cumulative realized/dividend totals and treasury journal. Schema 1 migration recovers totals from still-held positions; previously deleted positions and historical sale FX cannot be reconstructed. Legacy MYR realized profit is recoverable; legacy USD base-currency realized profit is not invented. New schema-2 activity records complete totals. Restore validates safe balances, positive FX/prices, valid positions and queued orders, and resumes paused.

## Validation

`tests/phase3-accounting.test.ts` covers closed/double/expired settlement, malformed inputs, liquidation returns, FX round trips, cash competition, sell reservations, company cash/earnings/debt reconciliation, dividend limits, jurisdictional tax exposure, save validation/migration and twelve exact monthly cash/debt reconciliations with treasury/fund transfers. Existing trading, clock, invariant and seeded campaign suites remain mandatory. `e2e/phase3.spec.ts` exercises quotes/order confirmation, open and closed orders, cancellation, FX, transfers, statements, reports, save/load and pause behavior in a real browser.
