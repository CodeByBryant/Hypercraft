// Temples and ruins: desert temple (a 4D step pyramid), jungle shrine, the Tesseract Grove
// Temple (the edges of a hypercube), ruined portals, ancient ruins, and sky towers whose
// floors only connect through W.

import { id, type Builder } from '../Builder';
import { IF_AIR, IF_SOFT, ball, pillar } from './common';

/**
 * Desert temple: a hyper-pyramid. Every level is a 3D cube (in a, b, c) one block smaller
 * than the one below, so any axis-aligned slice shows an ordinary step pyramid, and tilted
 * slices show pyramids with triangular and hexagonal steps. A treasure chamber below holds a
 * chest on each of its six walls: two of them are only reachable kata/ana.
 */
export function desertTemple(b: Builder): void {
  const ss = id('sandstone'), cut = id('cut_sandstone'), gold = id('gilded_bricks'), torch = id('torch');
  const R = 9;
  b.foundation(-R, -R, -R, R, R, R, 0, ss, 10);
  for (let k = 0; k <= R; k++) {
    const r = R - k;
    for (let c = -r; c <= r; c++)
      for (let bb = -r; bb <= r; bb++)
        for (let a = -r; a <= r; a++) {
          const outer = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === r;
          b.set(a, k, bb, c, outer ? (k % 3 === 2 ? cut : ss) : k < 5 ? 0 : ss);
        }
  }
  // Entrance hall (a 4D corridor from the +b face) and the inner room.
  b.box(-1, 1, 4, -1, 1, 3, R, 1, 0);
  b.box(-3, 1, -3, -3, 3, 4, 3, 3, 0);
  b.box(-3, 0, -3, -3, 3, 0, 3, 3, cut);
  b.set(0, 0, 0, 0, gold);
  for (const [a, c] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as [number, number][])
    b.set(a, 2, -3, c, torch, IF_AIR);
  // Shaft to the treasure chamber.
  b.box(0, -6, 0, 0, 0, -1, 0, 0, 0);
  b.set(0, 0, 0, 0, 0);
  b.room(-3, -9, -3, -3, 3, -5, 3, 3, cut, gold, ss);
  for (const [a, bb, c] of [
    [2, 0, 0],
    [-2, 0, 0],
    [0, 2, 0],
    [0, -2, 0],
    [0, 0, 2],
    [0, 0, -2],
  ] as [number, number, number][])
    b.chest(a, -8, bb, c, 'desert_temple');
  b.set(0, -8, 0, 0, id('lantern'));
}

/** Jungle shrine: a mossy stone temple with vines, a spawner of marsh leeches and loot. */
export function jungleShrine(b: Builder): void {
  const cobble = id('mossy_cobblestone'), brick = id('mossy_stone_bricks'), vine = id('hanging_vine');
  b.foundation(-5, -5, -5, 5, 5, 5, 0, cobble, 10);
  b.room(-5, 0, -5, -5, 5, 6, 5, 5, brick, cobble, cobble);
  b.room(-3, 6, -3, -3, 3, 10, 3, 3, brick, cobble, cobble);
  b.box(-1, 1, 5, -1, 1, 3, 5, 1, 0);
  b.box(-1, 7, 3, 0, 1, 8, 3, 0, 0);
  // Stairs up inside (along +b).
  for (let k = 0; k < 5; k++) b.faced(0, 1 + k, -3 + k, -2, id('stone_stairs'), 1, 1);
  for (let k = 0; k < 20; k++) {
    const a = b.int(-5, 5), c = b.int(-5, 5), bb = b.pick([-6, 6]);
    b.set(a, b.int(2, 5), bb, c, vine, IF_AIR);
  }
  b.set(0, 1, 0, 0, id('lantern'));
  b.chest(-3, 1, -3, 3, 'jungle_shrine');
  b.chest(2, 7, -2, -2, 'jungle_shrine');
}

/**
 * Tesseract Grove Temple: the 32 edges of a hypercube (side 12) in glowing tesseract
 * bricks, standing on a plinth. As you move kata/ana, the slice through the edges changes:
 * a cube frame when aligned, sliding bars and triangles when tilted. An altar at the centre
 * holds the chest. (It becomes a boss arena in a later phase.)
 */
export function tesseractTemple(b: Builder): void {
  const tb = id('tesseract_bricks'), plinth = id('chiseled_stone_bricks'), floor = id('stone_bricks');
  const r = 6;
  b.foundation(-r - 1, -r - 1, -r - 1, r + 1, r + 1, r + 1, 0, floor, 10);
  b.box(-r - 1, 0, -r - 1, -r - 1, r + 1, 0, r + 1, r + 1, floor);
  b.clearAbove(-r - 1, -r - 1, -r - 1, r + 1, r + 1, r + 1, 1, 2 * r + 3);
  const y0 = 1;
  // Edges: along each of the four axes (a, y, b, c), at every combination of the other three
  // coordinates on ±r.
  for (let t = -r; t <= r; t++)
    for (const s1 of [-r, r])
      for (const s2 of [-r, r])
        for (const s3 of [-r, r]) {
          b.set(t, y0 + r + s1, s2, s3, tb); // along a
          b.set(s1, y0 + r + t, s2, s3, tb); // along y
          b.set(s1, y0 + r + s2, t, s3, tb); // along b
          b.set(s1, y0 + r + s2, s3, t, tb); // along c
        }
  b.set(0, 1, 0, 0, plinth);
  b.set(0, 2, 0, 0, id('amethyst'));
  ball(b, 0, y0 + r, 0, 0, 1, id('lumen'));
  b.chest(0, 1, 1, 0, 'tesseract_temple');
  b.chest(0, 1, -1, 0, 'tesseract_temple');
}

/** Ruined portal: a broken obsidian frame with gold, some netherrack-like magma and a chest. */
export function ruinedPortal(b: Builder): void {
  const obs = id('obsidian'), gold = id('gold_block'), mag = id('magma_block'), cob = id('mossy_cobblestone');
  for (let c = -3; c <= 3; c++)
    for (let bb = -3; bb <= 3; bb++)
      for (let a = -3; a <= 3; a++) {
        if (a * a + bb * bb + c * c > 11 || !b.chance(0.6)) continue;
        const g = b.ground(a, bb, c) - b.originY;
        b.set(a, g, bb, c, b.chance(0.3) ? mag : cob);
      }
  // The frame: 4 wide x 5 tall in the (a, y) plane; some pieces missing, some fallen.
  const g0 = b.ground(0, 0, 0) - b.originY;
  for (let y = 0; y <= 4; y++)
    for (let a = -2; a <= 1; a++) {
      const edge = y === 0 || y === 4 || a === -2 || a === 1;
      if (!edge || !b.chance(0.75)) continue;
      b.set(a, g0 + 1 + y, 0, 0, b.chance(0.12) ? gold : obs);
    }
  b.set(2, g0 + 1, 2, 1, obs);
  b.set(-3, g0 + 1, -1, -2, obs);
  b.chest(2, g0 + 1, -2, 0, 'ruined_portal');
}

/** Ancient ruins: broken stone-brick walls of a 4D courtyard, half buried, and a chest. */
export function ruins(b: Builder): void {
  const bricks = [id('stone_bricks'), id('mossy_stone_bricks'), id('cracked_stone_bricks')];
  const R = b.int(5, 8);
  for (let c = -R; c <= R; c++)
    for (let bb = -R; bb <= R; bb++)
      for (let a = -R; a <= R; a++) {
        const wall = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === R;
        if (!wall) continue;
        const g = b.ground(a, bb, c) - b.originY;
        const h = b.chance(0.35) ? 0 : b.int(0, 3);
        for (let y = -1; y <= h; y++) b.set(a, g + y, bb, c, b.pick(bricks));
      }
  // A few inner pillars and a buried chest in the middle.
  for (let k = 0; k < 4; k++) {
    const a = b.int(-R + 2, R - 2), bb = b.int(-R + 2, R - 2), c = b.int(-R + 2, R - 2);
    const g = b.ground(a, bb, c) - b.originY;
    pillar(b, a, g, bb, c, g + b.int(1, 4), id('chiseled_stone_bricks'));
  }
  const g0 = b.ground(0, 0, 0) - b.originY;
  b.set(0, g0 - 2, 0, 0, bricks[0]!, IF_SOFT);
  b.chest(0, g0 - 1, 0, 0, 'ruins');
}

/**
 * Sky tower (Hollow Peaks): floating platforms stacked upward, each one shifted 5 blocks
 * along the piece's c axis (world W for most orientations). In any single slice the floors
 * look disconnected; the ladders between them run through W, so you climb by moving
 * kata/ana. Top floor: the chest.
 */
export function skyTower(b: Builder): void {
  const sky = id('skystone'), glass = id('glass'), moss = id('cloud_moss');
  const floors = b.int(4, 6);
  const g = b.ground(0, 0, 0) - b.originY;
  for (let f = 0; f < floors; f++) {
    const y = g + 3 + f * 6, c = f * 5;
    b.box(-3, y, -3, c - 2, 3, y, 3, c + 2, sky);
    b.box(-3, y + 1, -3, c - 2, 3, y + 1, 3, c + 2, moss, IF_AIR);
    for (const [a, bb] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ] as [number, number][])
      pillar(b, a, y + 1, bb, c, y + 3, glass);
    // A W-bridge to the next floor: a ramp that rises while moving along c.
    if (f + 1 < floors) {
      for (let k = 1; k <= 5; k++) {
        b.set(0, y + k, 0, c + k, sky);
        b.box(0, y + k + 1, 0, c + k, 0, y + k + 3, 0, c + k, 0);
      }
    } else b.chest(0, y + 1, 0, c, 'sky_tower');
  }
  // The base: a skystone plinth on the ground.
  b.foundation(-2, -2, -2, 2, 2, 2, g + 1, sky, 8);
  b.box(-2, g + 1, -2, -2, 2, g + 1, 2, 2, sky);
}
