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
| MY:1023 CIMB | CIMB Bank Building (Menara CIMB), Jalan Stesen Sentral 2 (office) | way/590906078 |
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
