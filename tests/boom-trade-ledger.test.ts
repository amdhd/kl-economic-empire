import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from '../src/engine/game';
import { baseExports, tradeRunRate } from '../src/engine/trade-book';
import { SECTOR_IDS } from '../src/data/economic-baseline';

describe('Boom trade ledger follows the core export reach', () => {
  it('ledger exports grow with capacity in Boom, and the balance does not collapse', () => {
    const s = createGame(20270101, 'balanced', 'malaysia', { months: 60, boom: true });
    const open = tradeRunRate(s);
    runHeadless(s, 24 * 30 * 24);
    for (const j of SECTOR_IDS) expect(s.sectors[j].capacity).toBeGreaterThan(0);
    const r = tradeRunRate(s);
    expect(r.goodsExports + r.servicesExports).toBeGreaterThan((open.goodsExports + open.servicesExports) * 1.3);
    expect(r.balance / s.indicators.nominalGdpAnnual).toBeGreaterThan(-0.12);
  });
  it('realistic campaigns are unchanged: no capacity reach in the ledger', () => {
    const s = createGame(20270101, 'balanced', 'malaysia');
    const before = baseExports(s);
    for (const j of SECTOR_IDS) s.sectors[j].capacity *= 2;
    expect(baseExports(s)).toEqual(before);
  });
});
