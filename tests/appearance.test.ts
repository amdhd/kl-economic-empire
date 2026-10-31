import { expect, test } from 'vitest';
import { validAppearance } from '../src/map/appearance';
import { glassTower } from '../src/map/glass-theme';
import { serialize, deserialize } from '../src/persistence/save';
import { createGame } from '../src/engine/game';
test('cosmetic save envelope preserves game state and accepts legacy saves', () => {
  const game = createGame(17, 'balanced');
  const snapshot = JSON.parse(serialize(game));
  expect(validAppearance(snapshot.appearance)).toBe(true);
  expect(validAppearance({ theme: 'bad', landmarks: 'yes' })).toBe(false);
  expect(deserialize(JSON.stringify(snapshot)).rng).toEqual(game.rng);
  delete snapshot.appearance;
  expect(deserialize(JSON.stringify(snapshot)).clock.hour).toBe(game.clock.hour);
});
test('fictional glass tower has closed finite geometry and ordered heights', () => {
  const tower = glassTower();
  expect(tower.features).toHaveLength(28);
  for (const feature of tower.features) {
    const ring = feature.geometry.coordinates[0];
    expect(ring[0][0]).toBeCloseTo(ring.at(-1)![0], 10);
    expect(ring[0][1]).toBeCloseTo(ring.at(-1)![1], 10);
    expect(ring.flat().every(Number.isFinite)).toBe(true);
    expect(feature.properties.height).toBeGreaterThan(feature.properties.base);
  }
});
