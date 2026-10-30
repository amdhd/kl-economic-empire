// Pinned official starting observations, retrieved 31 October 2026. No runtime network feed.
export const OFFICIAL_SOURCES = {
  gdp: 'https://www.dosm.gov.my/portal-main/release-content/gross-domestic-product-2025',
  gdpTable: 'https://open.dosm.gov.my/data-catalogue/gdp_qtr_nominal_supply',
  expenditure: 'https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/ringkasan_sebenar.pdf',
  revenue: 'https://belanjawan.mof.gov.my/pdf/belanjawan2027/revenue/summary.pdf',
  debt: 'https://www.bnm.gov.my/national-summary-data-page-for-malaysia',
  bnm: 'https://www.bnm.gov.my/bnmstatement/-/asset_publisher/CnqTLIfj6izZ/content/bnm-statement-of-assets-liabilities-15-october-2026?_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_CnqTLIfj6izZ_assetEntryId=23431576',
};
export const OFFICIAL_BASELINES = [
  { label: 'Malaysia nominal GDP', value: 2_025_379_140_000, period: '2025 · current prices · sum of four quarterly p0/abs observations', source: OFFICIAL_SOURCES.gdpTable },
  { label: 'Federal debt principal', value: 1_378_895_000_000, period: 'End Q2 2026 · BNM national summary · RM million × 1,000,000', source: OFFICIAL_SOURCES.debt },
  { label: 'Opening treasury cash proxy', value: 8_865_574_579, period: '15 Oct 2026 · federal deposits at BNM only', source: OFFICIAL_SOURCES.bnm },
  { label: 'Federal operating expenditure', value: 376_840_000_000, period: '2027 estimate · includes debt service · MOF p.33', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Health operating allocation', value: 40_954_794_000, period: '2027 estimate · B.42 · excludes development allocation', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Education + higher education operations', value: 63_473_399_800 + 15_129_293_500, period: '2027 estimate · B.63 + B.64 · derived sum', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Defence + home affairs operations', value: 14_523_000_000 + 18_019_701_600, period: '2027 estimate · B.60 + B.62 · derived sum', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Works + transport operations', value: 1_146_184_500 + 1_673_604_200, period: '2027 estimate · B.27 + B.28 · derived sum', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Pensions, allowances & gratuities', value: 44_000_000_000, period: '2027 estimate · T.14', source: OFFICIAL_SOURCES.expenditure },
  { label: 'Debt service reference', value: 61_013_000_000, period: '2027 estimate · T.13 · opening effective coupon calibrated to this', source: OFFICIAL_SOURCES.expenditure },
];
