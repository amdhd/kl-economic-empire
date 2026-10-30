# Data sources & provenance

## Map
- Tiles/style: **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`), OpenMapTiles schema, © OpenStreetMap
  contributors. Attribution is always shown by MapLibre's attribution control (non-compact).
- No proprietary logos: companies are shown as coloured monograms.

## Company map markers (verified 2026-10-31)
Coordinates were obtained from **OpenStreetMap Nominatim** searches bounded to KL and matched to the named building.
Only these 16 companies have markers; all others are tradable but not placed on the map.

| Companies | Location | Type | OSM match |
|---|---|---|---|
| Maybank (1155) | Menara Maybank, 100 Jalan Tun Perak | HQ | office/bank |
| Public Bank (1295) | Menara Public Bank 2, Jalan Raja Chulan | office | landuse/commercial |
| Telekom Malaysia (4863) | Menara TM, Pantai Baharu | HQ | building/office |
| Axiata (6888) | Axiata Tower, KL Sentral | HQ | building/office |
| Maxis (6012) | Menara Maxis, KLCC | HQ | building |
| Genting (3182), Genting Malaysia (4715) | Wisma Genting, Jalan Sultan Ismail | HQ | building/office |
| YTL Corporation (4677), YTL Power (6742) | Menara YTL, Jalan Bukit Bintang | office | building/office |
| IHH Healthcare (5225) | Prince Court Medical Centre | asset (hospital) | amenity/hospital |
| PETRONAS Chemicals (5183), PETRONAS Gas (6033) | PETRONAS Twin Towers, KLCC | HQ | tourism/attraction |
| MR D.I.Y. (5296) | MR.DIY store, Jalan Sultan Ismail | branch | shop/doityourself |
| Alphabet (GOOGL) | Google office, Axiata Tower | office | office/company |
| Exxon Mobil (XOM) | Menara ExxonMobil, KLCC | office | building/commercial |
| Tesla (TSLA) | Tesla Experience Center, Damansara | branch | shop/car |

Deliberately **not** placed: CIMB (no Menara CIMB match), TNB and CelcomDigi (HQs found in Petaling Jaya, outside KL),
Sime Darby (search returned Wisma FGV), Sunway, Gamuda, Press Metal and most US names.

## Equity universe
- Bursa codes and S&P 500 membership are taken from the spec's candidate lists and checked against knowledge as of
  mid-2026. **Not verified live** (no market-data API is used). Before any public release, re-check listings,
  renames and S&P 500 membership; the engine needs only `src/data/companies.*.ts` edited, keeping 20 + 20.
- All revenues, margins, debt, cash, share counts, P/E levels, volatilities and payouts are **fictional seeds**.
  Starting prices derive from these seeds (± up to 12 %) and are not real quotes. Pre-2027 chart history is a
  seeded synthetic backfill.

## Economy
All macro aggregates (GDP, employment, budgets, debt, bank balances) are fictional, chosen for internal consistency.
