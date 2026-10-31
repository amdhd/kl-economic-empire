// Rival economies for the global standing board. Observations and projections are pinned from the IMF World Economic
// Outlook (October 2026 vintage) via the IMF DataMapper API, retrieved 31 Oct 2026 (see docs/data-sources.md):
// NGDPD = GDP, current prices, US$ bn; NGDP_RPCH = real growth %; PCPIPCH = inflation %; BCA_NGDPD = current account
// % of GDP; LP = population, millions. The game moves rivals along these projections; nothing here is live data.
export interface RivalCountry {
  id: string;
  name: string;
  flag: string;
  gdpUsd: [number, number, number]; // 2026, 2027, 2028 (US$ bn)
  realGrowth2027: number; // %
  inflation2027: number; // %
  currentAccount2026: number; // % of GDP
  population2026: number; // millions
  /** Which simulated external cycle moves this economy around its projection. */
  cycle: 'us' | 'global';
}

export const RIVALS: RivalCountry[] = [
  { id: 'USA', name: 'United States', flag: '🇺🇸', gdpUsd: [32642.373, 34441.607, 35877.138], realGrowth2027: 2.3, inflation2027: 2.8, currentAccount2026: -3.9, population2026: 342.838, cycle: 'us' },
  { id: 'CHN', name: 'China', flag: '🇨🇳', gdpUsd: [21546.403, 22939.132, 24234.521], realGrowth2027: 4.0, inflation2027: 1.4, currentAccount2026: 4.0, population2026: 1401.733, cycle: 'global' },
  { id: 'DEU', name: 'Germany', flag: '🇩🇪', gdpUsd: [5471.299, 5661.302, 5822.319], realGrowth2027: 1.1, inflation2027: 3.1, currentAccount2026: 4.5, population2026: 83.278, cycle: 'global' },
  { id: 'JPN', name: 'Japan', flag: '🇯🇵', gdpUsd: [4341.986, 4467.61, 4647.178], realGrowth2027: 0.7, inflation2027: 2.6, currentAccount2026: 4.6, population2026: 122.656, cycle: 'global' },
  { id: 'GBR', name: 'United Kingdom', flag: '🇬🇧', gdpUsd: [4268.446, 4488.949, 4699.727], realGrowth2027: 1.2, inflation2027: 2.8, currentAccount2026: -3.3, population2026: 69.85, cycle: 'global' },
  { id: 'IND', name: 'India', flag: '🇮🇳', gdpUsd: [4060.207, 4521.197, 4995.623], realGrowth2027: 7.0, inflation2027: 4.4, currentAccount2026: -1.5, population2026: 1476.626, cycle: 'global' },
  { id: 'FRA', name: 'France', flag: '🇫🇷', gdpUsd: [3554.155, 3648.999, 3747.402], realGrowth2027: 0.7, inflation2027: 2.2, currentAccount2026: -0.7, population2026: 69.082, cycle: 'global' },
  { id: 'RUS', name: 'Russia', flag: '🇷🇺', gdpUsd: [2861.156, 2675.035, 2638.379], realGrowth2027: 0.9, inflation2027: 4.8, currentAccount2026: 3.8, population2026: 143.394, cycle: 'global' },
  { id: 'ITA', name: 'Italy', flag: '🇮🇹', gdpUsd: [2701.737, 2772.406, 2830.231], realGrowth2027: 0.6, inflation2027: 2.8, currentAccount2026: 0.7, population2026: 58.879, cycle: 'global' },
  { id: 'BRA', name: 'Brazil', flag: '🇧🇷', gdpUsd: [2654.761, 2796.144, 2899.104], realGrowth2027: 1.9, inflation2027: 4.1, currentAccount2026: -2.4, population2026: 214.142, cycle: 'global' },
];

/** Malaysia's own IMF figures, shown for reference beside the simulated value. */
export const MALAYSIA_IMF = { gdpUsd2026: 547.1, gdpUsd2027: 589.81, gdpUsd2028: 630.943, realGrowth2027: 4.6, inflation2027: 1.9, currentAccount2026: 2.1, population2026: 34.234 };

/**
 * Mid-size economies for the peer ladder (D-085): the IMF WEO (Oct 2026) economies ranked 11th to 60th by 2026 US$ GDP,
 * from Canada down to Slovakia, same vintage, indicators and retrieval as above. They sit around Malaysia's own size, so
 * the player always has a rival a few percent away. They are NOT part of the top-ten score maths (RIVALS only), so adding
 * them leaves the campaign score unchanged. Nothing here is live data.
 */
export const PEERS: RivalCountry[] = [
  { id: 'CAN', name: 'Canada', flag: '🇨🇦', gdpUsd: [2490.256, 2625.469, 2748.94], realGrowth2027: 1.7, inflation2027: 2.4, currentAccount2026: -0.1, population2026: 41.432, cycle: 'global' },
  { id: 'KOR', name: 'South Korea', flag: '🇰🇷', gdpUsd: [2245.847, 2539.463, 2681.311], realGrowth2027: 2.8, inflation2027: 2.3, currentAccount2026: 18.8, population2026: 51.615, cycle: 'global' },
  { id: 'MEX', name: 'Mexico', flag: '🇲🇽', gdpUsd: [2176.236, 2314.518, 2425.005], realGrowth2027: 1.8, inflation2027: 3.6, currentAccount2026: -0.3, population2026: 134.407, cycle: 'global' },
  { id: 'AUS', name: 'Australia', flag: '🇦🇺', gdpUsd: [2110.657, 2217.437, 2301.554], realGrowth2027: 1.6, inflation2027: 3.1, currentAccount2026: -3.1, population2026: 28.078, cycle: 'global' },
  { id: 'ESP', name: 'Spain', flag: '🇪🇸', gdpUsd: [2085.276, 2193.416, 2290.372], realGrowth2027: 1.8, inflation2027: 2.7, currentAccount2026: 2.6, population2026: 49.94, cycle: 'global' },
  { id: 'TUR', name: 'Türkiye', flag: '🇹🇷', gdpUsd: [1817.987, 1950.781, 2073.795], realGrowth2027: 3.6, inflation2027: 26.5, currentAccount2026: -2.9, population2026: 86.245, cycle: 'global' },
  { id: 'IDN', name: 'Indonesia', flag: '🇮🇩', gdpUsd: [1479.954, 1608.966, 1765.038], realGrowth2027: 5.1, inflation2027: 2.8, currentAccount2026: -1.6, population2026: 287.198, cycle: 'global' },
  { id: 'NLD', name: 'Netherlands', flag: '🇳🇱', gdpUsd: [1423.856, 1479.886, 1532.027], realGrowth2027: 1.3, inflation2027: 2.8, currentAccount2026: 8.3, population2026: 18.13, cycle: 'global' },
  { id: 'SAU', name: 'Saudi Arabia', flag: '🇸🇦', gdpUsd: [1343.346, 1427.689, 1475.595], realGrowth2027: 7.9, inflation2027: 2.2, currentAccount2026: -3.5, population2026: 36.726, cycle: 'global' },
  { id: 'CHE', name: 'Switzerland', flag: '🇨🇭', gdpUsd: [1135.739, 1163.357, 1217.078], realGrowth2027: 1.2, inflation2027: 0.8, currentAccount2026: 6.2, population2026: 9.124, cycle: 'global' },
  { id: 'POL', name: 'Poland', flag: '🇵🇱', gdpUsd: [1133.088, 1206.515, 1276.008], realGrowth2027: 2.5, inflation2027: 2.8, currentAccount2026: -1.9, population2026: 36.333, cycle: 'global' },
  { id: 'TWN', name: 'Taiwan', flag: '🇹🇼', gdpUsd: [1019.596, 1095.185, 1165.668], realGrowth2027: 4.3, inflation2027: 1.8, currentAccount2026: 22, population2026: 23.198, cycle: 'global' },
  { id: 'BEL', name: 'Belgium', flag: '🇧🇪', gdpUsd: [772.699, 798.323, 820.229], realGrowth2027: 1.1, inflation2027: 2.9, currentAccount2026: -2.8, population2026: 11.929, cycle: 'global' },
  { id: 'ARG', name: 'Argentina', flag: '🇦🇷', gdpUsd: [768.206, 762.29, 761.045], realGrowth2027: 3.5, inflation2027: 21.2, currentAccount2026: 0.6, population2026: 47.948, cycle: 'global' },
  { id: 'ISR', name: 'Israel', flag: '🇮🇱', gdpUsd: [746.982, 799.798, 839.962], realGrowth2027: 4.4, inflation2027: 2, currentAccount2026: 1.1, population2026: 10.312, cycle: 'global' },
  { id: 'SWE', name: 'Sweden', flag: '🇸🇪', gdpUsd: [745.081, 768.414, 808.659], realGrowth2027: 2.2, inflation2027: 1.9, currentAccount2026: 7.3, population2026: 10.76, cycle: 'global' },
  { id: 'IRL', name: 'Ireland', flag: '🇮🇪', gdpUsd: [709.972, 749.73, 783.319], realGrowth2027: 3.7, inflation2027: 2.8, currentAccount2026: 7.4, population2026: 5.554, cycle: 'global' },
  { id: 'SGP', name: 'Singapore', flag: '🇸🇬', gdpUsd: [667.889, 706.656, 740.254], realGrowth2027: 3, inflation2027: 2.2, currentAccount2026: 16.7, population2026: 6.121, cycle: 'global' },
  { id: 'ARE', name: 'UAE', flag: '🇦🇪', gdpUsd: [661.018, 699.443, 737.659], realGrowth2027: 7.7, inflation2027: 2.5, currentAccount2026: 4.8, population2026: 11.575, cycle: 'global' },
  { id: 'NOR', name: 'Norway', flag: '🇳🇴', gdpUsd: [651.712, 646.518, 647.589], realGrowth2027: 1.3, inflation2027: 2.8, currentAccount2026: 20.7, population2026: 5.658, cycle: 'global' },
  { id: 'AUT', name: 'Austria', flag: '🇦🇹', gdpUsd: [616.896, 642.049, 662.753], realGrowth2027: 0.9, inflation2027: 3.3, currentAccount2026: 1.4, population2026: 9.205, cycle: 'global' },
  { id: 'THA', name: 'Thailand', flag: '🇹🇭', gdpUsd: [599.115, 598.144, 615.655], realGrowth2027: 2.1, inflation2027: 1.7, currentAccount2026: -1.2, population2026: 71.56, cycle: 'global' },
  { id: 'COL', name: 'Colombia', flag: '🇨🇴', gdpUsd: [572.735, 634.699, 663.262], realGrowth2027: 2.3, inflation2027: 5.7, currentAccount2026: -2.6, population2026: 53.399, cycle: 'global' },
  { id: 'VNM', name: 'Vietnam', flag: '🇻🇳', gdpUsd: [542.13, 587.128, 638.292], realGrowth2027: 7.5, inflation2027: 4.9, currentAccount2026: 0.3, population2026: 103.077, cycle: 'global' },
  { id: 'BGD', name: 'Bangladesh', flag: '🇧🇩', gdpUsd: [506.357, 570.026, 597.659], realGrowth2027: 3.2, inflation2027: 10.9, currentAccount2026: -0.3, population2026: 175.423, cycle: 'global' },
  { id: 'PHL', name: 'Philippines', flag: '🇵🇭', gdpUsd: [501.692, 545.399, 590.711], realGrowth2027: 5.1, inflation2027: 4.1, currentAccount2026: -4.8, population2026: 115.071, cycle: 'global' },
  { id: 'DNK', name: 'Denmark', flag: '🇩🇰', gdpUsd: [499.354, 520.424, 540.685], realGrowth2027: 2, inflation2027: 2.5, currentAccount2026: 11.2, population2026: 6.037, cycle: 'global' },
  { id: 'ZAF', name: 'South Africa', flag: '🇿🇦', gdpUsd: [489.083, 517.579, 537.157], realGrowth2027: 1.3, inflation2027: 3.9, currentAccount2026: -0.7, population2026: 63.858, cycle: 'global' },
  { id: 'ROU', name: 'Romania', flag: '🇷🇴', gdpUsd: [470.091, 500.036, 534.899], realGrowth2027: 2.2, inflation2027: 4.1, currentAccount2026: -7, population2026: 19, cycle: 'global' },
  { id: 'HKG', name: 'Hong Kong', flag: '🇭🇰', gdpUsd: [455.156, 477.058, 495.961], realGrowth2027: 2.8, inflation2027: 1.9, currentAccount2026: 13.8, population2026: 7.545, cycle: 'global' },
  { id: 'EGY', name: 'Egypt', flag: '🇪🇬', gdpUsd: [442.886, 486.185, 515.55], realGrowth2027: 4.7, inflation2027: 14.8, currentAccount2026: -4.4, population2026: 110.058, cycle: 'global' },
  { id: 'CZE', name: 'Czechia', flag: '🇨🇿', gdpUsd: [427.953, 447.589, 466.586], realGrowth2027: 1.9, inflation2027: 2.8, currentAccount2026: -1.9, population2026: 10.803, cycle: 'global' },
  { id: 'CHL', name: 'Chile', flag: '🇨🇱', gdpUsd: [402.243, 413.443, 430.407], realGrowth2027: 2.6, inflation2027: 3.5, currentAccount2026: -0.3, population2026: 20.151, cycle: 'global' },
  { id: 'PER', name: 'Peru', flag: '🇵🇪', gdpUsd: [399.593, 413.597, 434.972], realGrowth2027: 2.9, inflation2027: 2.6, currentAccount2026: 4, population2026: 34.753, cycle: 'global' },
  { id: 'KAZ', name: 'Kazakhstan', flag: '🇰🇿', gdpUsd: [397.921, 433.4, 455.701], realGrowth2027: 4.9, inflation2027: 8.2, currentAccount2026: 0.5, population2026: 20.606, cycle: 'global' },
  { id: 'NGA', name: 'Nigeria', flag: '🇳🇬', gdpUsd: [386.671, 467.9, 485.066], realGrowth2027: 4.3, inflation2027: 14.7, currentAccount2026: 7, population2026: 242.578, cycle: 'global' },
  { id: 'PRT', name: 'Portugal', flag: '🇵🇹', gdpUsd: [375.197, 393.624, 409.339], realGrowth2027: 1.9, inflation2027: 3, currentAccount2026: 0, population2026: 10.777, cycle: 'global' },
  { id: 'FIN', name: 'Finland', flag: '🇫🇮', gdpUsd: [338.564, 349.815, 360.384], realGrowth2027: 1.4, inflation2027: 1.6, currentAccount2026: 0.3, population2026: 5.628, cycle: 'global' },
  { id: 'DZA', name: 'Algeria', flag: '🇩🇿', gdpUsd: [331.894, 338.923, 337.792], realGrowth2027: 3.2, inflation2027: 3.9, currentAccount2026: -0.8, population2026: 48.028, cycle: 'global' },
  { id: 'IRN', name: 'Iran', flag: '🇮🇷', gdpUsd: [311.95, 317.424, 326.042], realGrowth2027: 3.6, inflation2027: 42, currentAccount2026: -1.2, population2026: 87.934, cycle: 'global' },
  { id: 'GRC', name: 'Greece', flag: '🇬🇷', gdpUsd: [304.627, 320.469, 331.794], realGrowth2027: 1.8, inflation2027: 3.6, currentAccount2026: -6.6, population2026: 10.357, cycle: 'global' },
  { id: 'NZL', name: 'New Zealand', flag: '🇳🇿', gdpUsd: [273.395, 288.973, 301.857], realGrowth2027: 2.6, inflation2027: 2.8, currentAccount2026: -3.4, population2026: 5.356, cycle: 'global' },
  { id: 'HUN', name: 'Hungary', flag: '🇭🇺', gdpUsd: [265.911, 278.347, 291.224], realGrowth2027: 2.1, inflation2027: 2.8, currentAccount2026: -0.5, population2026: 9.536, cycle: 'global' },
  { id: 'IRQ', name: 'Iraq', flag: '🇮🇶', gdpUsd: [245.234, 285.761, 307.205], realGrowth2027: 19, inflation2027: 3, currentAccount2026: -10.8, population2026: 46.64, cycle: 'global' },
  { id: 'UKR', name: 'Ukraine', flag: '🇺🇦', gdpUsd: [229.406, 245.439, 259.371], realGrowth2027: 3.5, inflation2027: 8.7, currentAccount2026: -11, population2026: 32.423, cycle: 'global' },
  { id: 'QAT', name: 'Qatar', flag: '🇶🇦', gdpUsd: [203.044, 245.166, 265.021], realGrowth2027: 18.8, inflation2027: 3.1, currentAccount2026: 7.1, population2026: 3.191, cycle: 'global' },
  { id: 'MAR', name: 'Morocco', flag: '🇲🇦', gdpUsd: [195.632, 207.553, 223.246], realGrowth2027: 4.2, inflation2027: 1.4, currentAccount2026: -4.9, population2026: 38.05, cycle: 'global' },
  { id: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', gdpUsd: [178.167, 202.648, 226.468], realGrowth2027: 6.5, inflation2027: 5.7, currentAccount2026: -5.1, population2026: 38.943, cycle: 'global' },
  { id: 'SVK', name: 'Slovakia', flag: '🇸🇰', gdpUsd: [167.062, 175.15, 184.292], realGrowth2027: 1.6, inflation2027: 3.5, currentAccount2026: -3.4, population2026: 5.409, cycle: 'global' },
];
