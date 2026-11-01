import { describe, expect, it } from 'vitest';
import { FUEL_SUBSIDY0, SUBSIDY_REFERENCE } from '../src/data/world';
import { createGame } from '../src/engine/game';
import { fuelSubsidyDaily } from '../src/engine/world';

describe('petrol subsidy calibration (D-111)', () => {
  it('opens near RM12bn a year: the PM\'s RM20bn blanket bill less the RM8bn targeting saving', () => {
    expect(FUEL_SUBSIDY0).toBeGreaterThan(SUBSIDY_REFERENCE.ron95Blanket2024 * 1e9 * 0.55);
    expect(FUEL_SUBSIDY0).toBeLessThan(SUBSIDY_REFERENCE.ron95Blanket2024 * 1e9 * 0.65);
    const s = createGame(3, 'balanced', 'malaysia', { months: 24 });
    expect((fuelSubsidyDaily(s) * 365) / FUEL_SUBSIDY0).toBeCloseTo(1, 2);
  });
});
