// Underwater structures: shipwrecks on the sea floor and sunken monuments.

import { id, type Builder } from '../Builder';
import { pillar } from './common';

/**
 * Shipwreck: a hull of planks lying on the sea floor, tilted by its orientation into any
 * horizontal direction (so some wrecks lie along W). Supply and treasure chests inside.
 */
export function shipwreck(b: Builder): void {
  const plank = id(b.pick(['planks', 'spruce_planks', 'birch_planks'])), log = id('log'), water = id('water');
  const len = b.int(12, 17);
  const half = Math.floor(len / 2);
  for (let bb = -half; bb <= half; bb++) {
    // Hull cross-section: narrower at the bow and stern; 3D in (a, y, c) around the keel.
    const taper = 1 - Math.pow(Math.abs(bb) / (half + 1), 2);
    const w = Math.max(1, Math.round(3 * taper));
    for (let c = -w; c <= w; c++)
      for (let a = -w; a <= w; a++) {
        const r = Math.max(Math.abs(a), Math.abs(c));
        for (let y = 0; y <= 3; y++) {
          const shell = r === w || y === 0;
          // Broken: holes in the hull.
          if (shell && b.chance(0.12)) {
            b.set(a, y, bb, c, water);
            continue;
          }
          b.set(a, y, bb, c, shell ? plank : water);
        }
      }
  }
  // Deck beams and a broken mast.
  for (let bb = -half + 2; bb <= half - 2; bb += 3) b.box(-2, 3, bb, -2, 2, 3, bb, 2, log);
  pillar(b, 0, 1, 0, 0, b.int(4, 8), log);
  b.chest(0, 1, half - 2, 0, 'shipwreck_supply');
  b.chest(0, 1, -half + 2, 1, 'shipwreck_treasure');
}

/**
 * Sunken monument: a sea-brick hall on the sea floor, lit by sea lanterns, with a golden
 * core and a treasure chest on each of its six inner walls.
 */
export function sunkenMonument(b: Builder): void {
  const sb = id('sea_bricks'), lamp = id('sea_lantern'), water = id('water'), gold = id('gold_block');
  const R = 7, H = 8;
  for (let c = -R; c <= R; c++)
    for (let bb = -R; bb <= R; bb++)
      for (let y = 0; y <= H; y++)
        for (let a = -R; a <= R; a++) {
          const m = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c));
          const shell = m === R || y === 0 || y === H;
          const lit = shell && (a + bb + c + y) % 5 === 0;
          b.set(a, y, bb, c, shell ? (lit ? lamp : sb) : water);
        }
  // Roof spires and doorways on all six faces.
  for (const [a, bb, c] of [
    [R, 0, 0],
    [-R, 0, 0],
    [0, R, 0],
    [0, -R, 0],
    [0, 0, R],
    [0, 0, -R],
  ] as [number, number, number][]) {
    b.box(a, 1, bb, c, a, 3, bb, c, water);
    b.chest(Math.sign(a) * (R - 1), 1, Math.sign(bb) * (R - 1), Math.sign(c) * (R - 1), 'sunken_monument');
  }
  pillar(b, 0, H + 1, 0, 0, H + 4, sb);
  b.set(0, H + 5, 0, 0, lamp);
  b.box(-1, 1, -1, -1, 1, 2, 1, 1, gold);
  b.spawner(0, 3, 0, 0, 'drowned_sentinel');
}
