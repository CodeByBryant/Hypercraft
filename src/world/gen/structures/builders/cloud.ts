// Cloud Archipelago structures (Phase 9.7). The Cloud Citadel stands on an island: a courtyard inside a
// low curtain wall with four towers, and at its heart a keep whose roof carries the Storm Beacon. (The
// Sky Gate, the way in from the Surface, is in abyss.ts beside the Geode Gate.)

import { id, type Builder } from '../Builder';

/** Where the Storm Beacon stands in the Citadel's local frame (a, y, b, c): the heart of the arena. */
export const BEACON_AT: [number, number, number, number] = [0, 10, 0, 0];

/**
 * Cloud Citadel: a 31 x 31 courtyard (13 deep along w) behind a wall six high with a gate in each
 * side, four towers on the corners, and a keep of cloud brick in the middle with four chests of Cloud
 * armour and gliders and two spawners. A ramp climbs its east side to the roof, where the Storm Beacon
 * waits: sound a Storm Horn at it and the Storm Sovereign comes.
 */
export function cloudCitadel(b: Builder): void {
  const brick = id('cloud_brick'), lamp = id('sky_gate_lamp'), pane = id('ridge_glass'), beacon = id('storm_beacon');
  const R = 15, C = 6, K = 7, KC = 4;
  b.box(-R - 1, 0, -R - 1, -C, R + 1, 20, R + 1, C, 0);
  b.foundation(-R, -R, -C, R, R, C, -1, brick, 14);
  b.box(-R, -1, -R, -C, R, -1, R, C, brick);
  // The curtain wall, a gate in each of its four sides (wide enough to fly a glider through).
  b.box(-R, 0, -R, -C, R, 5, -R, C, brick);
  b.box(-R, 0, R, -C, R, 5, R, C, brick);
  b.box(-R, 0, -R, -C, -R, 5, R, C, brick);
  b.box(R, 0, -R, -C, R, 5, R, C, brick);
  b.box(-2, 0, -R, -3, 2, 4, -R, 3, 0);
  b.box(-2, 0, R, -3, 2, 4, R, 3, 0);
  b.box(-R, 0, -2, -3, -R, 4, 2, 3, 0);
  b.box(R, 0, -2, -3, R, 4, 2, 3, 0);
  // Four towers on the corners, a lamp on each.
  for (const [a, bb] of [[-R, -R], [-R, R], [R, -R], [R, R]] as [number, number][]) {
    b.box(a - 1, 0, bb - 1, -2, a + 1, 12, bb + 1, 2, brick);
    b.set(a, 13, bb, 0, lamp);
  }
  // The keep: walls, a floor, a roof at y 9 with a parapet and the Beacon on it.
  b.room(-K, -1, -K, -KC, K, 9, K, KC, brick, brick, brick);
  b.box(-K, 0, -2, -2, -K, 3, 2, 2, 0);
  for (const bb of [-K, K]) for (const a of [-3, 3]) b.box(a - 1, 2, bb, -2, a + 1, 5, bb, 2, pane);
  b.box(-K, 10, -K, -KC, K, 10, -K, KC, brick);
  b.box(-K, 10, K, -KC, K, 10, K, KC, brick);
  b.box(-K, 10, -K, -KC, -K, 10, K, KC, brick);
  b.box(K, 10, -K, -KC, K, 10, K, KC, brick);
  b.box(-K + 1, 10, -K + 1, -KC + 1, K - 1, 10, K - 1, KC - 1, 0);
  b.set(BEACON_AT[0], BEACON_AT[1], BEACON_AT[2], BEACON_AT[3], beacon);
  for (const [a, bb] of [[-K, -K], [-K, K], [K, -K], [K, K]] as [number, number][]) b.set(a, 11, bb, 0, lamp);
  // A ramp up the east side to the roof.
  for (let j = 0; j <= 9; j++) b.box(K + 1 + j, 0, -1, -1, K + 1 + j, 9 - j, 1, 1, brick);
  // Inside: the treasure and the guards.
  for (const [a, bb, c] of [[-5, -5, 2], [5, -5, -2], [-5, 5, -2], [5, 5, 2]] as [number, number, number][]) b.chest(a, 0, bb, c, 'cloud_citadel');
  b.spawner(0, 0, -5, 0, 'wind_sprite');
  b.spawner(0, 0, 5, 0, 'storm_kite');
}
