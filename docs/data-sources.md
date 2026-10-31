# Data sources and provenance

All share prices, financial statements, dividends, indices and FX rates in the game are **fictional simulations**.
Only company names, exchange codes/tickers and the KL map points below are real-world references, used for context.

## Equity universe — verified 31 Oct 2026

### Bursa Malaysia (20, MYR, IDs `MY:<stock code>`)

| ID | Company (legal name) | Verification note |
|---|---|---|
| MY:1155 | Malayan Banking Berhad | Spec seed list; Main Market constituent |
| MY:1023 | CIMB Group Holdings Berhad | Spec seed list |
| MY:1295 | Public Bank Berhad | Spec seed list |
| MY:5347 | Tenaga Nasional Berhad | Spec seed list |
| MY:4863 | Telekom Malaysia Berhad | Spec seed list |
| MY:6012 | Maxis Berhad | Spec seed list |
| MY:6888 | Axiata Group Berhad | Spec seed list |
| MY:5225 | IHH Healthcare Berhad | Spec seed list |
| MY:5211 | Sunway Berhad | Spec seed list |
| MY:3182 | Genting Berhad | Spec seed list |
| MY:4715 | Genting Malaysia Berhad | **Checked specifically.** Genting Bhd's Oct 2025 takeover offer closed on 1 Dec 2025 at 73.13%, below the 75% delisting threshold; Genting Malaysia remains listed ([ASGAM, 2 Dec 2025](https://asgam.com/2025/12/02/genting-bhds-takeover-offer-for-genting-malaysia-closes-with-shareholding-at-73-13/), [ASGAM, 5 Dec 2025](https://asgam.com/2025/12/05/genting-bhd-resumes-on-market-purchase-of-genting-malaysia-shares-draws-closer-to-75-delisting-threshold/)). Re-check if the parent crosses 75% after the 12-month cooling-off (~Dec 2026). |
| MY:5296 | MR D.I.Y. Group (M) Berhad | Spec seed list |
| MY:4677 | YTL Corporation Berhad | Spec seed list |
| MY:6742 | YTL Power International Berhad | Spec seed list |
| MY:8869 | Press Metal Aluminium Holdings Berhad | Spec seed list |
| MY:5183 | PETRONAS Chemicals Group Berhad | Spec seed list |
| MY:6033 | PETRONAS Gas Berhad | Spec seed list |
| MY:4197 | Sime Darby Berhad | Spec seed list |
| MY:6947 | CelcomDigi Berhad | Spec seed list |
| MY:5398 | Gamuda Berhad | Spec seed list |

### S&P 500 constituents (20, USD, IDs `US:<ticker>`)

NVDA, META, MSFT, AAPL, AMZN, GOOGL (Alphabet Class A), AVGO, TSLA, JPM, V, MA, BRK.B (Berkshire Hathaway Class B), XOM, COST, WMT, PG, AMD, NFLX, UNH, PLTR.

Verification: none of the 20 appears among the S&P 500 deletions in S&P Dow Jones Indices' 2026 quarterly announcements
([March](https://press.spglobal.com/2026-03-06-Vertiv-Holdings%2C-Lumentum-Holdings%2C-Coherent%2C-and-EchoStar-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400%2C-and-S-P-SmallCap-600),
[June](https://press.spglobal.com/2026-06-05-Marvell-Technology-and-Flex-Set-to-Join-S-P-500-Others-to-Join-S-P-MidCap-400-and-S-P-SmallCap-600),
[September](https://press.spglobal.com/2026-09-04-Bloom-Energy,-Illumina,-and-Everpure-Set-to-Join-S-P-500-Others-to-Join-S-P-100,-S-P-MidCap-400,-and-S-P-SmallCap-600)).
Removals in those announcements were Match Group, Molina Healthcare, Lamb Weston, Paycom, Pool Corp, Molson Coors, Builders FirstSource and The Trade Desk.
A third-party tracker (chartrow.com) also mentioned Exxon Mobil next to a 2026 change, but in garbled text that also listed it as joining. No S&P release confirms a removal, so XOM is kept. Re-verify before production polish (spec §16.2). Ad hoc changes between rebalances may have happened after this check.

`tests/securities.test.ts` pins the exact 20 + 20 code lists, so any replacement must update this file and the test together.

## KL map markers — OpenStreetMap, looked up 31 Oct 2026

Each point is the centroid Nominatim returned for the named OSM feature. The feature ID is stored in
`GeoPoint.verificationSource` (`src/data/geo.ts`). Map data © OpenStreetMap contributors (ODbL).

| Company | Location (type) | OSM feature |
|---|---|---|
| MY:1155 Maybank | Menara Maybank, Jalan Tun Perak (HQ) | way/784981167 |
| MY:1023 CIMB | CIMB Bank Building (OSM name), KL Sentral (office) | way/590906078 |
| MY:1295 Public Bank | Menara Public Bank 2, Jalan Raja Chulan (office) | way/1527532510 |
| MY:5347 Tenaga Nasional | Ibu Pejabat TNB, Jalan Panah, Bangsar (HQ) | node/4895692113 |
| MY:4863 Telekom Malaysia | Menara TM, Pantai Baharu (HQ) | way/154443873 |
| MY:6012 Maxis | Menara Maxis, KLCC (HQ) | way/23034384 |
| MY:6888 Axiata | Axiata Tower, KL Sentral (HQ) | way/467550544 |
| MY:5225 IHH Healthcare | Prince Court Medical Centre (asset) | way/324185283 |
| MY:3182 Genting, MY:4715 Genting Malaysia | Wisma Genting, Jalan Sultan Ismail (HQ) | way/120770467 |
| MY:5296 MR D.I.Y. | MR.DIY store, Jalan Sultan Ismail (branch) | node/9371314483 |
| MY:4677 YTL Corp, MY:6742 YTL Power | Menara YTL, Jalan Bukit Bintang (office) | way/919590949 |
| MY:5183 PETRONAS Chemicals, MY:6033 PETRONAS Gas | PETRONAS Twin Towers, KLCC (HQ) | way/279944536 |
| US:GOOGL Alphabet | Google office, Axiata Tower (office) | way/467550544 |
| US:XOM Exxon Mobil | Menara ExxonMobil, KLCC (office) | way/23034444 |
| US:TSLA Tesla | Tesla Experience Center, Damansara (branch) | node/12176202188 |

That makes 18 companies at 14 distinct buildings. Shared buildings become one grouped marker (`src/map/company-markers.ts`).

**Candidates looked up and rejected** (no marker; the stocks stay tradable):

- Sunway: Sunway Putra Mall (way/685599840) belongs to Sunway REIT, a separately listed entity, and the group HQ is in Bandar Sunway, Selangor.
- Sime Darby: Sime Darby Convention Centre (way/477617429) belongs to Sime Darby Property, demerged and separately listed. "Wisma Sime Darby" returned Wisma FGV.
- Gamuda: Menara Gamuda (way/842304312) is in Petaling Jaya, outside KL.
- CelcomDigi: "Menara Celcom" returned only a bus stop and Menara TM Semarak. Not verified.
- Press Metal, NVIDIA, Meta and the remaining US issuers: no verified KL premises found.

## Malaysia starting observations — pinned 31 October 2026

The user chose a national economic baseline with the existing KL map (D-018). These figures initialize **new** campaigns;
subsequent results remain fictional. There is no live feed. Observation dates differ, so these do not represent a
consolidated national balance sheet as of the fictional 1 Jan 2027 opening. Source labels/links also appear under
**Baseline & sources** in the game (`src/data/national-baseline.ts`). Values below are MYR unless explicitly USD.

| Observation used | Period and value | Primary source and conversion |
|---|---|---|
| Nominal GDP | 2025: RM2,025,379,140,000 | [OpenDOSM quarterly nominal GDP by sector](https://open.dosm.gov.my/data-catalogue/gdp_qtr_nominal_supply), dataset updated14 Aug2026. [CSV](https://storage.dosm.gov.my/gdp/gdp_qtr_nominal_supply.csv), `series=abs`, `sector=p0`, 2025 quarters485106.586,489742.018,517572.546,532957.990 **RM million**. Sum×1,000,000; no growth-rate rows or sector summation. |
| Federal debt principal | End Q2 2026: RM1,378,895,000,000 | [BNM national summary](https://www.bnm.gov.my/national-summary-data-page-for-malaysia), updated28 Oct2026: central-government total current liabilities1,378,895 RMmillion, comprising short+medium/long-term debt. [MOF debt outlook](https://belanjawan.mof.gov.my/pdf/belanjawan2027/revenue/section4.pdf), pp162–163, corroborates roundedRM1,378.9bn. Do not substitute public-sector debt or debt+guarantees. |
| Treasury opening **proxy** | 15 Oct 2026: RM8,865,574,579 | [BNM statement](https://www.bnm.gov.my/bnmstatement/-/asset_publisher/CnqTLIfj6izZ/content/bnm-statement-of-assets-liabilities-15-october-2026?_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_CnqTLIfj6izZ_assetEntryId=23431576), released22 Oct2026. “Deposits by: Federal Government.” Only deposits held at BNM, **not all consolidated government cash**, revenue, SWF assets or central-bank reserves. |
| Usable FX reserve component | 15 Oct 2026: USD116.4bn | Same BNM statement: “Foreign Currency Reserves.” Gross international reservesUSD132.1bn include IMF1.3bn,SDRs6bn,gold6bn,other2.4bn; these noncurrency components are not made available for game intervention. |
| Opening FX valuation anchor | ≈RM4.078422/USD | Same statement: RM538,759,540,269 gross reserve valuation divided by USD132.1bn. Derived accounting anchor, **not observed spot FX**; denominator is rounded in the source. |
| Opening OPR | September2026:2.75% | [BNM national summary](https://www.bnm.gov.my/national-summary-data-page-for-malaysia). Thereafter the fictional automatic rate rule applies; not a forecast of BNM decisions. |
| Population | 2025 estimate:34.2m, rounded | [DOSM current population estimates2025](https://www.dosm.gov.my/portal-main/release-content/current-population-estimates-2025). Pinned2025 reference for this calibration, not a claim of latest population. |
| Workforce/unemployment | Q3 2025:17.49m,3.0% | [DOSM labour-force release](https://www.dosm.gov.my/portal-main/release-content/principal-statistics-of-labour-force-malaysia-third-quarter-2025). Pinned reference; no commuters-only city workforce. |

### Federal operating allocations (2027 estimates, not actual spending)

[MOF detailed expenditure summary](https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/ringkasan_sebenar.pdf),
printed pp23,29,31–33, **last column2027, unitsRM**, visually checked against the original table. Use the detailed book's
RM376.840bn total rather than the speech's roundedRM376.8bn. “Mengurus” is operating; do not use a ministry's combined
“JUMLAH” operating+development allocation for opex. For example, health's totalRM47.7042988bn includes development
RM6.7495048bn; onlyRM40.954794bn enters health opex.

| Game line / purpose | Annual estimate used | Source line / transformation |
|---|---:|---|
| Healthcare |40,954,794,000|B.42 operations|
| Public services (education) |78,602,693,300|B.63 education63,473,399,800+B.64 higher education15,129,293,500|
| Safety |32,542,701,600|B.60 defence14,523,000,000+B.62 home affairs18,019,701,600|
| Economic development operations |2,819,788,700|B.27 works1,146,184,500+B.28 transport1,673,604,200; no development capex|
| Transfers |44,000,000,000|T.14 pensions, retirement allowances and gratuities; a simplified household transfer mapping|
| Administration / other operations |116,907,022,400|**Derived residual**, all federal operating estimates376,840,000,000 minus debt service61,013,000,000 and the five rows above; includes other ministries, subsidies and central services, not just administrative payroll|
| Debt service reference |61,013,000,000|T.13; excluded from controlled opex and used to calibrate opening effective coupon|

Monthly policy amounts = annual/12; daily settlement remains monthly×12/365. Sliders are fictional broad groupings,
not ministry-level implementation of Malaysia's actual fiscal system. Development allocations are excluded from these
operating controls; infrastructure capex stays player-commissioned under the existing game project model.

[MOF revenue estimates](https://belanjawan.mof.gov.my/pdf/belanjawan2027/revenue/summary.pdf), printedp238:2027 total
RM380,816,996,000. The fixed “other public receipts” amount is a **model-derived residual** of this total less the four
modeled opening taxes, not an official observed category. The report also separately lists non-tax revenue
RM72,548,410,000 and non-revenue receiptsRM10,598,980,000. Those alone do not fill the tax categories absent from the model.

### Explicit remaining assumptions and limits

Seven sector shares, IO coefficients, simulated company accounts, tax rates/exemptions, loans, savings, public capital,
SWF opening assets, project costs, elasticity/lags, reserve intervention float and credit rules remain fictional.
The public-net-worth score covers modeled accounts only; it is not Malaysia's consolidated net worth. Do not invent
unreported public assets to make it positive. The RM5bn central-bank MYR float and matched opening equity offset are
model assumptions, separate from the sourced treasury proxy and reserves. Legacy saves receive no new inventory.

Trade UI shows **simulated** sector export deliveries and imported production inputs, excluding re-exports/final imports.
It is deliberately not labelled or calibrated as official merchandise trade; use GDP's value-added identity rather than
adding gross trade to GDP. There is no claim that future simulated 2027/2028 trade, FX, rates or budgets are actual data.

## Historical chart references (31 Oct 2026 snapshot)

`src/data/official-history.ts` contains display-only observations, never inserted into simulation reports or scoring.
GDP: same [DOSM nominal sector CSV](https://storage.dosm.gov.my/gdp/gdp_qtr_nominal_supply.csv), `p0/abs`, Q1 2024–Q2 2026,
RM million ×4/1000 gives RM billion/year. This is a seasonally varying quarterly annualisation, not rolling annual GDP.
[CPI](https://open.dosm.gov.my/data-catalogue/cpi_headline): `cpi_2d.csv`, division `overall`, official index2010=100;
YoY computed from the same month's preceding-year index. [Labour](https://open.dosm.gov.my/data-catalogue/lfs_month):
`lfs_month.csv`, unemployment `u_rate` in percent. Combined monthly charts cover Jan2025–Aug2026, the common available
window at retrieval. Preserve the labour-series census-reference caveat described by DOSM. Both datasets are CC BY4.0.
No runtime downloads or historical spot-FX observations are implied. Chart references remain separate from campaign output.

Five-year display expansion: retain the latest60 common monthly CPI/labour observations (Sep2021–Aug2026) and20
published GDP quarters (Q3 2021–Q2 2026). Each window follows its own latest published endpoint; do not extrapolate.
The official five-year reference appears before simulated campaign charts. Both GDP axes explicitly show RM trillions.

## Schema 6: fiscal, resource and trade references (31 Oct 2026)

Official, read from Budget 2027 documents (belanjawan.mof.gov.my):
- Development expenditure estimate 2027: RM85,000,000,000 (expenditure summary, "Ringkasan Keseluruhan", p.33).
- Operating expenditure 2027: RM376,840,000,000 (same table). Total revenue 2027: RM380,816,996,000.
- Export duty 2027 estimate: RM1,914,000,000 (revenue code 62100). Returns on investment from non-financial
  enterprises 2027: RM35,492,468,000 (code 75200), dominated by the PETRONAS dividend.
- Fiscal rule targets follow the Public Finance and Fiscal Responsibility Act 2023 (deficit 3% of GDP, debt 60%).

Approximate public-scale references (rounded, recalled for calibration; verify before citing): PETRONAS dividend ≈ RM32bn
and capex ≈ RM50bn a year; PETRONAS stakes ≈ 64% PETRONAS Chemicals, 51% PETRONAS Gas; Khazanah stakes ≈ Axiata 36%,
IHH 26%, Telekom Malaysia 20%, CIMB 23%; RON95 ceiling RM1.99/L, ≈17bn litres a year, ≈85% eligible; partner trade
shares; reference prices (Brent US$75/bbl, CPO RM4,000/t, wheat US$230/t, HRC steel US$520/t). Everything after the
opening day is simulated.

## Schema 7 additions (31 Oct 2026)

Official: federal overall balance, % of GDP: 2021 −6.4 (foreword), 2022 −5.5 (Figure 1.3), 2023 −5.0, 2024 −4.1,
2025 −3.7, 2026 −3.6 (revised), 2027 −3.3 (estimate), MOF Fiscal Outlook 2027 federal government finance table
(`tinjauan_fiskal_2027.pdf`). Same table: net development expenditure 2027 RM81,500m; overall balance −RM77,523m.

Securities added (names/tickers real, financials fictional): Bursa 0166 Inari Amertron, 0097 ViTrox, 0128 Frontken,
5005 Unisem, 3867 Malaysian Pacific Industries, 0208 Greatech; US TSM, ASML, ARM (ADRs), QCOM, INTC, MU, TXN, AMAT,
LRCX, ORCL, CRM, ADBE, CSCO, IBM. Reconfirm listings before citing.

Commodity reference levels (APPROX, rounded): LNG Asia spot US$12/MMBtu, thermal coal US$120/t, natural rubber
US$1,700/t, Thai 5% rice US$420/t, aluminium US$2,500/t, copper US$9,500/t; Malaysian natural rubber output ≈350kt.

## Company logos (D-060, user-directed)

Logos are trademarks of their owners, used only to identify the real listed companies beside clearly fictional simulated data; no endorsement is implied. Files are 256px PNG/JPEG renderings fetched once from Wikimedia Commons/Wikipedia (31 Oct 2026). Licences are as the source page lists them; several are marked "Fair use" there. Companies without a file use a monogram: MY:0128, MY:0166, MY:0208, MY:3867, MY:5005, MY:8869, US:ADBE.

| Ticker | Source file | Licence (as listed) |
|---|---|---|
| MY:0097 | [VitroxLogo.png](https://commons.wikimedia.org/wiki/File:VitroxLogo.png) | Public domain |
| MY:1023 | [CIMB Group Logo.svg](https://commons.wikimedia.org/wiki/File:CIMB_Group_Logo.svg) | Public domain |
| MY:1155 | [Maybank logo.svg](https://en.wikipedia.org/wiki/File:Maybank_logo.svg) | Fair use |
| MY:1295 | [Public Bank Berhad logo.svg](https://en.wikipedia.org/wiki/File:Public_Bank_Berhad_logo.svg) | Fair use |
| MY:3182 | [Genting Logo.svg](https://commons.wikimedia.org/wiki/File:Genting_Logo.svg) | Public domain |
| MY:4197 | [Sime Darby Berhad Logo.jpg](https://commons.wikimedia.org/wiki/File:Sime_Darby_Berhad_Logo.jpg) | CC BY 4.0 |
| MY:4677 | [YTL Corporation Berhad Logo (former).svg](https://commons.wikimedia.org/wiki/File:YTL_Corporation_Berhad_Logo_(former).svg) | Public domain |
| MY:4715 | [Genting Malaysia Berhad logo.png](https://en.wikipedia.org/wiki/File:Genting_Malaysia_Berhad_logo.png) | Fair use |
| MY:4863 | [Telekom Malaysia logo (2023).svg](https://commons.wikimedia.org/wiki/File:Telekom_Malaysia_logo_(2023).svg) | Public domain |
| MY:5183 | [PETRONAS Logo (2013).png](https://commons.wikimedia.org/wiki/File:PETRONAS_Logo_(2013).png) | Public domain |
| MY:5211 | [Sunway logo.png](https://commons.wikimedia.org/wiki/File:Sunway_logo.png) | Public domain |
| MY:5225 | [IHH Healthcare logo.svg](https://commons.wikimedia.org/wiki/File:IHH_Healthcare_logo.svg) | Public domain |
| MY:5296 | [MR.DIY logo.png](https://commons.wikimedia.org/wiki/File:MR.DIY_logo.png) | Public domain |
| MY:5347 | [Tenaga Nasional.svg](https://commons.wikimedia.org/wiki/File:Tenaga_Nasional.svg) | Public domain |
| MY:5398 | [Gamuda Berhad Logo.png](https://en.wikipedia.org/wiki/File:Gamuda_Berhad_Logo.png) | Fair use |
| MY:6012 | [Maxis-logo.png](https://commons.wikimedia.org/wiki/File:Maxis-logo.png) | CC BY-SA 4.0 |
| MY:6033 | [PETRONAS Logo (2013).png](https://commons.wikimedia.org/wiki/File:PETRONAS_Logo_(2013).png) | Public domain |
| MY:6742 | [Ytlpowr-6742.png](https://commons.wikimedia.org/wiki/File:Ytlpowr-6742.png) | CC BY-SA 4.0 |
| MY:6888 | [Axiata logo.svg](https://commons.wikimedia.org/wiki/File:Axiata_logo.svg) | Public domain |
| MY:6947 | [Digi logo.png](https://commons.wikimedia.org/wiki/File:Digi_logo.png) | Copyrighted free use |
| US:AAPL | [Apple logo black.svg](https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg) | Public domain |
| US:AMAT | [Applied Materials Logo.svg](https://commons.wikimedia.org/wiki/File:Applied_Materials_Logo.svg) | Public domain |
| US:AMD | [AMD Logo.svg](https://commons.wikimedia.org/wiki/File:AMD_Logo.svg) | Public domain |
| US:AMZN | [Amazon logo.svg](https://commons.wikimedia.org/wiki/File:Amazon_logo.svg) | Public domain |
| US:ARM | [Arm logo 2025.svg](https://commons.wikimedia.org/wiki/File:Arm_logo_2025.svg) | Public domain |
| US:ASML | [ASML Holding N.V. logo.svg](https://commons.wikimedia.org/wiki/File:ASML_Holding_N.V._logo.svg) | Public domain |
| US:AVGO | [Broadcom logo (2016-present).svg](https://commons.wikimedia.org/wiki/File:Broadcom_logo_(2016-present).svg) | Public domain |
| US:BRK.B | [Berkshire-Hathaway-Logo.svg](https://commons.wikimedia.org/wiki/File:Berkshire-Hathaway-Logo.svg) | Public domain |
| US:COST | [Costco Wholesale logo 2010-10-26.svg](https://commons.wikimedia.org/wiki/File:Costco_Wholesale_logo_2010-10-26.svg) | Public domain |
| US:CRM | [Salesforce.com logo.svg](https://commons.wikimedia.org/wiki/File:Salesforce.com_logo.svg) | Public domain |
| US:CSCO | [Cisco logo.svg](https://commons.wikimedia.org/wiki/File:Cisco_logo.svg) | Public domain |
| US:GOOGL | [Alphabet Inc Logo 2015.svg](https://commons.wikimedia.org/wiki/File:Alphabet_Inc_Logo_2015.svg) | Public domain |
| US:IBM | [IBM logo.svg](https://commons.wikimedia.org/wiki/File:IBM_logo.svg) | Public domain |
| US:INTC | [Intel logo (1968-2006).svg](https://commons.wikimedia.org/wiki/File:Intel_logo_(1968-2006).svg) | Public domain |
| US:JPM | [Logo of JPMorganChase 2024.svg](https://commons.wikimedia.org/wiki/File:Logo_of_JPMorganChase_2024.svg) | Public domain |
| US:LRCX | [Lam-Research-Logo.svg](https://commons.wikimedia.org/wiki/File:Lam-Research-Logo.svg) | Public domain |
| US:MA | [Mastercard 2019 logo.svg](https://commons.wikimedia.org/wiki/File:Mastercard_2019_logo.svg) | Public domain |
| US:META | [Facebook, Inc. Logo 2019.svg](https://commons.wikimedia.org/wiki/File:Facebook,_Inc._Logo_2019.svg) | Public domain |
| US:MSFT | [Microsoft logo (1980).svg](https://commons.wikimedia.org/wiki/File:Microsoft_logo_(1980).svg) | Public domain |
| US:MU | [Micron Technology logo 2024.svg](https://commons.wikimedia.org/wiki/File:Micron_Technology_logo_2024.svg) | Public domain |
| US:NFLX | [Netflix logo.svg](https://commons.wikimedia.org/wiki/File:Netflix_logo.svg) | Public domain |
| US:NVDA | [NVIDIA logo.svg](https://commons.wikimedia.org/wiki/File:NVIDIA_logo.svg) | Apache License 2.0 |
| US:ORCL | [Oracle logo.svg](https://commons.wikimedia.org/wiki/File:Oracle_logo.svg) | Public domain |
| US:PG | [Procter & Gamble logo.svg](https://commons.wikimedia.org/wiki/File:Procter_%26_Gamble_logo.svg) | Public domain |
| US:PLTR | [Palantir Technologies logo.svg](https://commons.wikimedia.org/wiki/File:Palantir_Technologies_logo.svg) | Public domain |
| US:QCOM | [Qualcomm-Logo.svg](https://commons.wikimedia.org/wiki/File:Qualcomm-Logo.svg) | Public domain |
| US:TSLA | [Tesla Motors.svg](https://commons.wikimedia.org/wiki/File:Tesla_Motors.svg) | Public domain |
| US:TSM | [TSMC wordmark.svg](https://commons.wikimedia.org/wiki/File:TSMC_wordmark.svg) | Public domain |
| US:TXN | [TexasInstruments-Logo.svg](https://commons.wikimedia.org/wiki/File:TexasInstruments-Logo.svg) | Public domain |
| US:UNH | [UnitedHealth Group logo.svg](https://commons.wikimedia.org/wiki/File:UnitedHealth_Group_logo.svg) | Public domain |
| US:V | [Visa Inc. logo (1992–1999).svg](https://commons.wikimedia.org/wiki/File:Visa_Inc._logo_(1992%E2%80%931999).svg) | Public domain |
| US:WMT | [Walmart logo (2025).svg](https://commons.wikimedia.org/wiki/File:Walmart_logo_(2025).svg) | Public domain |
| US:XOM | [Exxon Mobil Logo.svg](https://commons.wikimedia.org/wiki/File:Exxon_Mobil_Logo.svg) | Public domain |

## Rail lines on the map (D-061)

`src/data/rail.ts`: OSM route relations 1895592 (Kelana Jaya), 4466552 (Ampang), 3374384 (Sri Petaling), 2546881 (KL Monorail),
5690837 (MRT Kajang), 11313577 (MRT Putrajaya) and 8394085 (Shah Alam), fetched via the Overpass API on 31 Oct 2026.
© OpenStreetMap contributors, ODbL. Track ways are chained in route order and simplified; trains are illustrative and
do not follow timetables. Construction and investment sites on the map are fictional locations.
