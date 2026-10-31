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
