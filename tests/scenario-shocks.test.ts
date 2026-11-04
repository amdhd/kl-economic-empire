import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import type { ScenarioId } from '../src/types/game';
import { withoutEvents } from './helpers';

const run = (scenario: ScenarioId, days: number) => {
  const s = createGame(2027, scenario, 'malaysia', { months: 24 });
  runHeadless(s, 24 * days);
  return s;
};

describe('Scenario shocks are a real handicap (D-141)', () => {
  it('an opening shock does not reshuffle the random stream (the business cycle matches the balanced start)', () => withoutEvents(() => {
    const a = run('balanced', 300), b = run('export-slump', 300);
    expect(b.external.cycles).toEqual(a.external.cycles);
  }));

  it('each scenario costs cumulative output and does not out-score the balanced start', () => withoutEvents(() => {
    const total = (s: ReturnType<typeof run>) => s.reports.reduce((a, r) => a + r.realGdp, 0);
    const base = run('balanced', 24 * 31);
    for (const scenario of ['recession', 'export-slump', 'energy-shock'] as const) {
      const s = run(scenario, 24 * 31);
      expect(total(s) / total(base) - 1).toBeLessThan(-0.003);
      expect(s.indicators.score.total).toBeLessThanOrEqual(base.indicators.score.total);
    }
  }), 300_000);
});
