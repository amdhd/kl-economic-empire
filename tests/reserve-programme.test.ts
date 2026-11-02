import { describe, expect, it } from 'vitest';
import { bankIdentityGap } from '../src/engine/banks';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { publicNetWorth, reserveEquityChange } from '../src/engine/indicators';
import { goldIndex, totalReservesUsd } from '../src/engine/reserves';
import { deserialize, serialize } from '../src/persistence/save';
import { withoutEvents } from './helpers';

const month = 24 * 31;
const boom = () => createGame(5, 'balanced', 'malaysia', { months: 36, boom: true });

describe('Reserve-accumulation programme (D-132)', () => {
  it('is off by default: reserves, gold and money created do not change', () => withoutEvents(() => {
    const s = boom(), usd = s.centralBank.usdReserves;
    runHeadless(s, month * 3);
    expect(s.centralBank.goldTonnes).toBe(0);
    expect(s.centralBank.moneyCreated).toBe(0);
    expect(s.centralBank.usdReserves).toBeGreaterThanOrEqual(usd); // only the float can change it, never a purchase
    expect(s.centralBank.reserveProgramme.totalBoughtUsd).toBe(0);
  }));

  it('buys dollars and gold every month close, funded by bills and new money, with the books balanced', () => withoutEvents(() => {
    const s = boom(), control = boom();
    const usd0 = s.centralBank.usdReserves;
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 20e9, targetUsd: 400e9, goldShare: 0.3, sterilise: 0.5 }, 0).ok).toBe(true);
    runHeadless(s, month * 4); runHeadless(control, month * 4);
    const cb = s.centralBank, p = cb.reserveProgramme;
    expect(p.totalBoughtUsd / 100).toBeGreaterThan(40e9); // at least two closes' worth
    expect(cb.usdReserves - usd0).toBeGreaterThan(0.7 * 0.5 * p.totalBoughtUsd); // the dollar part of the purchases
    expect(cb.goldTonnes).toBeGreaterThan(0);
    expect(cb.bills).toBeGreaterThan(control.centralBank.bills); // sterilisation
    expect(cb.moneyCreated).toBeGreaterThan(0); // the unsterilised part
    expect(cb.reserveLiquidity).toBeGreaterThan(0);
    // The bank identity still holds (within rounding) and every balance is a safe integer.
    expect(Math.abs(bankIdentityGap(s) - bankIdentityGap(control))).toBeLessThan(1e3);
    for (const n of [cb.usdReserves, cb.bills, cb.moneyCreated, cb.goldCostUsd]) expect(Number.isSafeInteger(n)).toBe(true);
    // Buying costs only spreads, storage and bill interest. At a fixed exchange rate and gold cost the central-bank balance sheet
    // (what the wealth score uses) is below the no-programme run, so the programme can never earn score.
    expect(reserveEquityChange(s, true) - reserveEquityChange(control, true)).toBeLessThan(0);
    // At market, public net worth gains only what gold and the dollars earn from price moves, bounded here.
    expect(publicNetWorth(s) - publicNetWorth(control)).toBeLessThan(0.05 * totalReservesUsd(s) * s.external.myrPerUsd + goldGainBound(s));
    // Side effect: the ringgit is weaker than without the programme, and the pressure is positive.
    expect(s.external.myrPerUsd).toBeGreaterThan(control.external.myrPerUsd);
  }));

  it('stops at the target and rejects a target below today’s reserves or above the monthly cap', () => withoutEvents(() => {
    const s = boom();
    const have = totalReservesUsd(s);
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 10e9, targetUsd: have - 1e9 }, 0).ok).toBe(false);
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 41e9, targetUsd: have + 100e9 }, 0).ok).toBe(false);
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 10e9, targetUsd: have + 15e9, goldShare: 0, sterilise: 1 }, 0).ok).toBe(true);
    runHeadless(s, month * 4);
    expect(s.centralBank.reserveProgramme.monthlyUsd).toBe(0);
    expect(totalReservesUsd(s)).toBeLessThanOrEqual(have + 15e9 + 5e9); // reserves also earn income, so a small overshoot only
    expect(s.centralBank.reserveProgramme.totalBoughtUsd / 100).toBeLessThanOrEqual(15e9 + 1e6);
  }));

  it('realistic mode caps the pace at US$5bn a month', () => {
    const s = createGame(5, 'balanced', 'malaysia');
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 6e9, targetUsd: 300e9 }, 0).ok).toBe(false);
    expect(applyCommand(s, { type: 'cbReserves', monthlyUsd: 5e9, targetUsd: 300e9 }, 0).ok).toBe(true);
  });

  it('survives a save round trip and upgrades a schema-19 save', () => withoutEvents(() => {
    const s = boom();
    applyCommand(s, { type: 'cbReserves', monthlyUsd: 10e9, targetUsd: 200e9, goldShare: 0.2, sterilise: 0.8 }, 0);
    runHeadless(s, month * 2);
    const back = deserialize(serialize(s));
    expect(back.centralBank.goldTonnes).toBe(s.centralBank.goldTonnes);
    expect(back.centralBank.reserveProgramme).toEqual(s.centralBank.reserveProgramme);
    const old = JSON.parse(serialize(boom())) as { schemaVersion: number; state: Record<string, unknown> & { schemaVersion: number; centralBank: Record<string, unknown> } };
    for (const k of ['goldTonnes', 'goldCostUsd', 'moneyCreated', 'reserveLiquidity', 'reserveProgramme']) delete old.state.centralBank[k];
    old.schemaVersion = 19; old.state.schemaVersion = 19;
    const up = deserialize(JSON.stringify(old));
    expect(up.centralBank.reserveProgramme.monthlyUsd).toBe(0);
    expect(up.centralBank.goldTonnes).toBe(0);
  }));

  it('gold price index is deterministic and bounded', () => {
    const a = boom(), b = boom();
    expect(goldIndex(a)).toBe(goldIndex(b));
    for (const d of [0, 200, 800, 3000]) { a.external.daysElapsed = d; expect(goldIndex(a)).toBeGreaterThan(0.5 - 1e-9); expect(goldIndex(a)).toBeLessThan(3 + 1e-9); }
  });
});

/** Gold marked to market can rise with the gold price; allow for it in the public-net-worth bound. */
function goldGainBound(s: ReturnType<typeof boom>) {
  return Math.max(0, goldIndex(s) - 1) * s.centralBank.goldTonnes * 32150.7 * 2600 * s.external.myrPerUsd;
}
