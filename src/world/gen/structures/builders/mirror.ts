// Mirror Realm structures (Phase 9). The Silver Arch stands on the Surface: a small ruin whose
// rift sleeps until a Hand Mirror wakes it. (The Mirror Palace comes with the realm's mobs.)

import type { Builder } from '../Builder';
import { archCells } from '../../../../content/mirror';
import { REG } from '../../../../content/registry';
import { IF_SOFT } from '../Plan';

const id = (n: string) => REG.id(n);

/** Silver Arch: a plinth, four pillars, a roof and, between them, a dormant rift. */
export function silverArch(b: Builder): void {
  b.box(-1, 0, -1, -1, 1, 4, 1, 1, 0, IF_SOFT);
  b.foundation(-1, -1, -1, 1, 1, 1, -2, id('arch_stone'), 8);
  for (const c of archCells('dormant_rift')) b.set(c.d[0], c.d[1], c.d[2], c.d[3], id(c.block));
  // A little rubble: a few stones that have fallen from the roof.
  for (let k = 0; k < 4; k++) {
    const a = b.int(-3, 3), bb = b.int(-3, 3), c = b.int(-2, 2);
    if (Math.abs(a) <= 1 && Math.abs(bb) <= 1 && Math.abs(c) <= 1) continue;
    b.set(a, 0, bb, c, id('arch_stone'), IF_SOFT);
  }
}

/**
 * Mirror Palace: a great hall of mirrors. A checkered floor of arch stone and Mirror Glass, walls
 * of stone with a doorway on each of the six horizontal faces, and, at both ends of its W axis,
 * walls of Mirror Glass, so rotating your slice into W shows the hall repeating. At the heart a
 * mirrorite dais carries the Mirror Altar: hold a Hand Mirror to it and the Mirror Twin steps out.
 * Four chests of Mirror Armor stand in the corners, two spawners keep the Shamblers coming.
 */
export function mirrorPalace(b: Builder): void {
  const stone = id('arch_stone'), glass = id('mirror_glass'), gold = id('mirrorite_block'), altar = id('mirror_altar'), lamp = id('lumen');
  const A = 14, C = 7, Y = 10;
  b.box(-A, 0, -A, -C, A, Y + 2, A, C, 0);
  b.foundation(-A, -A, -C, A, A, C, -1, stone, 14);
  b.room(-A, -1, -A, -C, A, Y, A, C, stone, stone, stone);
  // The floor: a checkerboard of stone and glass.
  for (let c = -C + 1; c <= C - 1; c++) for (let bb = -A + 1; bb <= A - 1; bb++) for (let a = -A + 1; a <= A - 1; a++) if (((a + bb + c) & 1) === 0) b.set(a, -1, bb, c, glass);
  // The ends of the hall along W: glass from floor to roof.
  for (const c of [-C, C]) b.box(-A + 1, 0, -A + 1, c, A - 1, Y - 1, A - 1, c, glass);
  // A doorway in each of the six walls (the c ends are glass doors: the hall is open to W).
  b.box(-A, 0, -2, -2, -A, 4, 2, 2, 0);
  b.box(A, 0, -2, -2, A, 4, 2, 2, 0);
  b.box(-2, 0, -A, -2, 2, 4, -A, 2, 0);
  b.box(-2, 0, A, -2, 2, 4, A, 2, 0);
  b.box(-2, 0, -2, -C, 2, 4, 2, -C, 0);
  b.box(-2, 0, -2, C, 2, 4, 2, C, 0);
  // Lamps along the walls and the roof.
  for (let k = -9; k <= 9; k += 6) {
    b.set(-A, 6, k, 0, lamp);
    b.set(A, 6, k, 0, lamp);
    b.set(k, 6, -A, 0, lamp);
    b.set(k, 6, A, 0, lamp);
    b.set(k, Y, 0, 0, lamp);
    b.set(0, Y, k, 0, lamp);
  }
  // Four mirrorite pillars, and the dais.
  for (const [a, bb] of [[-7, -7], [-7, 7], [7, -7], [7, 7]] as [number, number][]) {
    for (let y = 0; y <= Y - 2; y++) b.set(a, y, bb, 0, gold);
    b.set(a, Y - 1, bb, 0, glass);
  }
  b.box(-3, 0, -3, -2, 3, 0, 3, 2, gold);
  b.set(0, 1, 0, 0, altar);
  // The treasure: a chest in each corner (kata/ana of the dais), and spawners in the side halls.
  for (const [a, bb, c] of [[-11, -11, -4], [11, -11, 4], [-11, 11, 4], [11, 11, -4]] as [number, number, number][]) b.chest(a, 0, bb, c, 'mirror_palace');
  b.spawner(-12, 0, 0, 4, 'reflection_shambler');
  b.spawner(12, 0, 0, -4, 'reflection_shambler');
}
