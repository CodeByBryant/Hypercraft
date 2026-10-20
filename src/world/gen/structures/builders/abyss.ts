// Crystal Abyss structures (Phase 9). The Geode Gate lies deep under the Surface: a hollow geode
// (a 4-ball, so its room breathes as you step along W) with a dormant rift on a plinth at its
// heart. A Resonance Crystal held up to the rift wakes it. (The Crystal Cathedral follows with the
// Abyss's mobs.)

import { gateCells } from '../../../../content/abyss';
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
