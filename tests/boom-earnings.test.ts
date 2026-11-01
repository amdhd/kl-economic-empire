import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../src/data/companies';
import { baseEps, ttmNetIncome } from '../src/engine/companies';
import { createGame, runHeadless } from '../src/engine/game';
import { withoutEvents } from './helpers';

const epsRatios = (s: ReturnType<typeof createGame>, pick: (g: number) => boolean) =>
  COMPANIES.filter((c) => c.exchange === 'MY' && pick(c.exposure.global)).map((c) => {
    const st = s.companies[c.id];
    return ttmNetIncome(st) / st.shares / baseEps(c, s.government.policies.tax.corporate, s.baseline.profile);
  });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('Boom company earnings (D-110)', () => {
  it('Malaysian firms, exporters included, do not lose earnings to wages and the strong ringgit in a boom', () => withoutEvents(() => {
    const s = createGame(20270101, 'balanced', 'malaysia', { months: 36, boom: true });
    runHeadless(s, 24 * 31 * 6);
    expect(mean(epsRatios(s, () => true))).toBeGreaterThan(1.08);
    expect(mean(epsRatios(s, (g) => g >= 0.5))).toBeGreaterThan(1.0);
  }));
});
