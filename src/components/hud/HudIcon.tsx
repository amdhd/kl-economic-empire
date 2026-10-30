const paths: Record<string, string> = {
  overview: 'M4 19V9l8-5 8 5v10H4Zm5 0v-7h6v7',
  population: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  objectives: 'M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8',
  policies: 'M12 3v18M4 7h16M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7ZM8 21h8',
  projects: 'M3 21h18M5 21V5h10v16M9 9h2m-2 4h2m-2 4h2m4-5h4v9',
  debt: 'm3 8 9-5 9 5H3Zm2 4v6m7-6v6m7-6v6M3 21h18',
  controls: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6',
  trade: 'M3 7h17l-4-4m5 14H4l4 4M20 7l-4 4M4 17l4-4',
  markets: 'M3 3v18h18M6 15l5-5 4 3 6-8',
  fund: 'M8 7V4h8v3M3 7h18v13H3V7Zm0 6h18m-11-2h4v4h-4',
  economy: 'M4 20V10h4v10m4 0V4h4v16m4 0v-8h3v8',
  sources: 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4',
  reports: 'M4 3h16v18H4V3Zm4 5h8m-8 4h8m-8 4h5',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
};
export function HudIcon({ name, size = 23 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.info} /></svg>;
}
