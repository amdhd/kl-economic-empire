import type { ScenarioId } from '../types/game';
export const SCENARIOS: { id: ScenarioId; title: string; description: string }[] = [
  { id: 'balanced', title: 'Balanced start', description: 'Calm opening; normal seeded event probabilities.' },
  { id: 'recession', title: 'Adverse: global recession', description: '180-day slowdown and credit crunch at 1.3× strength. Adverse events remain 3× as likely throughout; other events 0.6×.' },
  { id: 'export-slump', title: 'Export downturn', description: '270-day global slowdown at 2× strength (world demand about −10%). Normal event probabilities afterward; no forced credit crunch.' },
  { id: 'energy-shock', title: 'Energy squeeze', description: '150-day oil supply shock: oil about +66% (1.5× strength) after a seven-day ramp. Normal event probabilities; later prices remain simulated.' },
];
