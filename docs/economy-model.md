# Economy model

All parameters live in `src/data/economic-baseline.ts` and `src/engine/*.ts`. Fictional calibration aimed at
internal plausibility (≈ RM 300 bn GDP, 1.75 m workforce incl. commuters, 3.6 % unemployment, 2 % inflation).

## Units
Ledger balances: integer sen/cents. Flows: MYR per day (accumulated monthly). Rates: decimals. Indices: 1 = base.
CPI: 100 = start. FX: MYR per USD.

## Calibration (`calibration.ts`)
- 7 KL sectors *j* (finance, property & construction, utilities & energy, telecom & tech, consumer/retail/tourism,
  healthcare & public services, industrial & materials). Input–output matrix `A[i][j]`, import share `m_j`.
- Value-added ratio `v_j = 1 − Σ_i A_ij − m_j`; base gross output `Y0_j = VA_j / 365 / v_j`.
- Final demand `f0 = (I − A)·Y0`. Household, government and investment components come from the behavioural
  rules at baseline; **exports are the residual** `X0 = f0 − C0 − G0 − I0` (test asserts all > 0).

## Daily step (`economy.ts`, order: external → government → households/sectors → companies)
1. **Households:** wages `Σ L_j·w0_j·W`; disposable `YD = wages + transfers + distributed profits − surcharge − interest − amortisation`.
   Permanent income `P += 0.012(YD − P)`; consumption `C = MPC·(0.5·YD + 0.5·P)` (draws on savings when income dips).
   New household credit is spent 35 % on property, 65 % on consumer goods.
2. **Demand:** consumption by basket share; consumer-sector spending net of the consumption levy; government
   purchases by budget line; investment by `INVESTMENT_GOODS`; exports `X0_j × index_j`, where the index mixes
   Malaysia demand, global demand, tourism (× levy elasticity 1.5, × completed tourism projects) and the tech cycle,
   each scaled by relative-price competitiveness `(p_j / (FX·P_US))^−ε`.
3. **Production:** `Y = (I − A)⁻¹ f_real`, capped by capital capacity `cap_j·(1+infra_j)` and labour capacity
   `L_j·prod_j·1.08`. Utilisation `= demand / capacity`.
4. **Accounts:** `VA_j = p_j Y_j − Σ_i A_ij p_i Y_j − m_j P^imp_j Y_j`; profit `= VA − wages − δK − interest − property levy`.
   **Nominal GDP = Σ VA + consumption levy**; real GDP = `Σ v_j Y_j` + levy at base rate (double deflation).
   Share trading, bond issuance, SWF valuation and transfers never enter GDP (tested).
5. **Prices:** each sector moves 2.5 %/day toward a cost target
   `Σ_i A_ij p_i + m_j P^imp_j + v_j (ls_j·W/prod_j + (1−ls_j)·markup(util)·CPI)`; import prices = FX × (foreign
   goods, oil). Rent index tracks property prices × housing factor × utilisation × property-levy pass-through.
   CPI = basket-weighted prices (consumer goods incl. levy, rent for property).

## Weekly
Employment moves 12 % toward `demand / labour productivity`, bounded by 98.5 % of the workforce. Seeded events spawn.

## Monthly close (`scheduler.ts` → government → companies → fund → bank → economy)
- **Government:** corporate tax `= rate × Σ max(0, sector profit)`; property levy `= rate × 0.5 × property gross output`;
  interest on debt; amortisation debt/120 refinanced to the cash-buffer target, within the debt/GDP cap.
  Yield `= MGS10 + 0.4 % + 8·max(0, D/Y − 35 %) + 0.25·max(0, deficit − 3 %) + arrears`. Rating and market access follow.
  Service quality → target `0.62·(real health+services+safety spend / base)^0.6 + project boosts`, 25 %/month.
- **Budget identity** (tested every month, exact to the sen):
  `ΔTreasury = taxes + grant + borrowing + SWF transfers in − opex − capex − interest − principal − emergency − SWF injections`.
- **Bank** (identity `reserves + loans = deposits + capital`, tested): NPL `= 0.12 % + 1.5·(u − 3.5 %) + …`; lending rate
  `= OPR + 2 % + event spread + 1.5·ΔNPL + capital stress`; supply `= min(capital/10 % − loans, 3 % of loans) × willingness`.
- **Investment:** desired capital growth `g = 3.5 % + 0.12·(after-tax ROK − base) − 0.6·Δlending rate + 0.12·(util − 85 %) + confidence`,
  partial adjustment 30 %/month, external finance rationed by bank supply. New capacity matures after **6 months**.
- **Wages:** `ΔW/W = (E[π] + 1.5 % + 0.6·(3.5 % − u)) / 12`; expectations `0.82E + 0.10π + 0.08·2 %`.
- **MPC** `= 0.86 − 0.5(u − 3.5 %) − 1.0·max(0, π − 3 %) + 0.1(confidence − 0.6)`, clamped 0.70–0.95.
- **Approval:** 35 %/month toward satisfaction = 25 % employment + 25 % real income + 15 % affordability + 15 % services
  + 10 % trust + 10 % stability. Trust falls with tax rises, cuts to services/transfers, arrears, downgrades.

## Companies & market (`companies.ts`, `stock-market.ts`)
Revenue/day `= rev0/365 × shock × (kl·KLsector + my·MYdemand + global·driver × FX)`; costs split labour/energy/other
with 35 % fixed. Taxes: KL rate on the KL share of profit, 24 % (MY) / 21 % (US) on the rest. Quarterly dividends ≤ 50 % of cash.
Fundamental value `= EPS_fwd × base P/E × ((r0+5 %)/(r+5 %))^(1.5·duration) × e^{0.6(risk−0.5)} × e^{sentiment}`.
Hourly (open sessions only): `Δln P = 0.012·ln(FV/P) + market + sector + idiosyncratic shocks`, clipped ±6 %.

## Causal chains (each covered by `tests/economic-invariants.test.ts`)
- Corporate tax 18 % → 25 %: receipts ↑ from the effective month, after-tax profit and investment ↓ with a lag, KL-exposed
  company earnings ↓, US company earnings essentially unchanged.
- Infrastructure: capex immediately, productivity only after completion.
- Oil shock: CPI ↑, real disposable income ↓.
- AI boom: US semiconductor revenue ↑ ≫ Malaysian retail.
- More public-service spending: service quality ↑ over months, at a fiscal cost.
