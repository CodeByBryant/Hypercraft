// Crystal Abyss structures (Phase 9). The Geode Gate lies deep under the Surface: a hollow geode
// (a 4-ball, so its room breathes as you step along W) with a dormant rift on a plinth at its
// heart. A Resonance Crystal held up to the rift wakes it. (The Crystal Cathedral follows with the
// Abyss's mobs.)

import { gateCells } from '../../../../content/abyss';
import { skyGateCells } from '../../../../content/cloud';
import { IF_SOFT } from '../Plan';
import { id, type Builder } from '../Builder';

/** Geode Gate: a husk, calcite and a glowing lining around a round room, the gate in its floor. */
export function geodeGate(b: Builder): void {
  const R = 9, CY = 3;
  const husk = id('geode_husk'), calc = id('calcite_layer'), lining = id('geode_lining'), cluster = id('resonance_cluster');
  for (let c = -R; c <= R; c++)
    for (let bb = -R; bb <= R; bb++)
      for (let y = CY - R; y <= CY + R; y++)
        for (let a = -R; a <= R; a++) {
          const d = Math.hypot(a, y - CY, bb, c);
          if (d > R) continue;
          let v: number;
          if (d > R - 1) v = husk;
          else if (d > R - 2) v = calc;
          else if (d > R - 3) v = lining;
          else v = y >= 0 ? 0 : y === -1 ? calc : lining;
          b.set(a, y, bb, c, v);
        }
  for (const k of gateCells('dormant_abyss_rift')) b.set(k.d[0], k.d[1], k.d[2], k.d[3], id(k.block));
  // Resonance clusters budding on the floor around the gate, and a chest for the first trip.
  for (let k = 0; k < 14; k++) {
    const a = b.int(-5, 5), bb = b.int(-5, 5), c = b.int(-3, 3);
    if (Math.abs(a) <= 1 && Math.abs(bb) <= 1 && Math.abs(c) <= 1) continue;
    if (Math.hypot(a, bb, c) > 5.4) continue;
    b.set(a, 0, bb, c, cluster);
  }
  b.chest(3, 0, 0, 0, 'geode_gate');
}

/** Where the Resonance Bell stands in the Cathedral's local frame (a, y, b, c): the heart of the arena. */
export const BELL_AT: [number, number, number, number] = [13, 2, 0, 0];

/**
 * Crystal Cathedral: a nave 37 long, 19 wide and 15 high (11 deep along w), cut out of whatever
 * stands there. Two rows of prism-glass pillars carry the roof; crystal windows line the long
 * walls; a doorway opens at the west end. At the east end a dais of calcite and a prism block carries
 * the Resonance Bell: ring a Tuning Fork at it and the Resonance Titan wakes. Four chests of Prism
 * armour stand in the side aisles (two of them kata/ana of the nave's centre), three spawners keep
 * spiders and slimes coming.
 */
export function crystalCathedral(b: Builder): void {
  const brick = id('cathedral_brick'), calc = id('calcite_layer'), glass = id('prism_glass'), pane = id('shifting_crystal'), lamp = id('geode_lining'), bell = id('cathedral_bell'), pedestal = id('prism_block');
  const L = 18, Wd = 9, C = 5, Y = 15;
  b.box(-L, 0, -Wd, -C, L, Y + 2, Wd, C, 0);
  b.foundation(-L, -Wd, -C, L, Wd, C, -1, brick, 14);
  b.room(-L, -1, -Wd, -C, L, Y, Wd, C, brick, calc, brick);
  // Pillars: two rows down the nave, each a column of prism glass from floor to roof.
  for (let a = -L + 4; a <= L - 4; a += 6)
    for (const bb of [-5, 5])
      for (const c of [-3, 3]) for (let y = 0; y < Y; y++) b.set(a, y, bb, c, glass);
  // Windows of crystal in both long walls, and in the ends along w.
  for (let a = -L + 3; a <= L - 3; a += 6) for (const bb of [-Wd, Wd]) b.box(a - 1, 4, bb, -3, a + 1, 11, bb, 3, pane);
  for (const c of [-C, C]) b.box(-6, 4, -3, c, 6, 11, 3, c, pane);
  // The doorway at the west end.
  b.box(-L, 0, -2, -2, -L, 5, 2, 2, 0);
  // Lamps hanging under the roof.
  for (let a = -L + 3; a <= L - 3; a += 6) for (const bb of [-4, 0, 4]) b.set(a, Y - 1, bb, 0, lamp);
  // The dais at the east end and the Bell on its pedestal.
  b.box(L - 8, 0, -4, -3, L - 2, 0, 4, 3, calc);
  b.box(L - 6, 1, -3, -2, L - 4, 1, 3, 2, pedestal);
  b.set(BELL_AT[0], BELL_AT[1], BELL_AT[2], BELL_AT[3], bell);
  // The treasure and the guards.
  for (const [a, bb, c] of [[-12, -7, 3], [-12, 7, -3], [3, -7, -3], [3, 7, 3]] as [number, number, number][]) b.chest(a, 0, bb, c, 'crystal_cathedral');
  b.spawner(-14, 0, 0, 3, 'prism_spider');
  b.spawner(-6, 0, 0, -3, 'geode_slime');
  b.spawner(8, 0, -6, 0, 'prism_spider');
}

/** Sky Gate: a plinth, four pillars, a roof and a dormant rift on a high peak, open to the wind. */
export function skyGate(b: Builder): void {
  b.box(-1, 0, -1, -1, 1, 4, 1, 1, 0, IF_SOFT);
  b.foundation(-1, -1, -1, 1, 1, 1, -2, id('sky_gate_stone'), 8);
  for (const c of skyGateCells('dormant_cloud_rift')) b.set(c.d[0], c.d[1], c.d[2], c.d[3], id(c.block));
}
