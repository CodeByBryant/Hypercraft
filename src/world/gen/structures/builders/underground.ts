// Underground structures: dungeons with spawners, hypermines (a 4D network of tunnels along
// all three horizontal axes), library ruins, deep silent vaults and Ana Vaults (sealed rooms
// that open only onto an Ana Sheet, so the only way in is through the sheet along W).

import { A, Bf, C, ORIENTS, id, type Builder } from '../Builder';
import { IF_AIR, IF_SOFT, pillar, weighted } from './common';

/** Dungeon: a 7x6x7x7 mossy room with a spawner in the middle and chests by the walls. */
export function dungeon(b: Builder): void {
  const cob = id('cobblestone'), moss = id('mossy_cobblestone');
  for (let c = -3; c <= 3; c++)
    for (let bb = -3; bb <= 3; bb++)
      for (let y = 0; y <= 5; y++)
        for (let a = -3; a <= 3; a++) {
          const shell = y === 0 || y === 5 || Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === 3;
          b.set(a, y, bb, c, shell ? (b.chance(0.45) ? moss : cob) : 0);
        }
  const mob = weighted(b, [
    ['shambler', 4],
    ['bone_archer', 3],
    ['web_weaver', 2],
    ['hollow_husk', 1],
  ] as [string, number][]);
  b.spawner(0, 1, 0, 0, mob);
  const spots: [number, number, number][] = [
    [2, 0, 0],
    [-2, 0, 0],
    [0, 2, 0],
    [0, -2, 0],
    [0, 0, 2],
    [0, 0, -2],
  ];
  const n = b.int(1, 3);
  for (let i = 0; i < n; i++) {
    const [a, bb, c] = spots.splice(b.int(0, spots.length - 1), 1)[0]!;
    b.chest(a, 1, bb, c, 'dungeon');
  }
  for (let k = 0; k < 6; k++) b.set(b.int(-2, 2), 4, b.int(-2, 2), b.int(-2, 2), id('cobweb'), IF_AIR);
}

/**
 * Hypermine: tunnels with a 3x3x3 cross-section (height 3, width 3 in both perpendicular
 * horizontal axes) branching along a, b and c. A slice shows ordinary corridors along its
 * two visible horizontal axes, and 3x3 openings where a W tunnel crosses it: walk kata/ana
 * into them. Timber supports every four blocks, webs, torches, loot at the ends.
 */
export function hypermine(b: Builder): void {
  const plank = id('planks'), fence = id('oak_fence'), web = id('cobweb'), torch = id('torch');
  interface Seg {
    p: [number, number, number, number];
    axis: number;
    sign: number;
    depth: number;
  }
  const queue: Seg[] = [];
  const dirs: [number, number][] = [
    [A, 1],
    [A, -1],
    [Bf, 1],
    [Bf, -1],
    [C, 1],
    [C, -1],
  ];
  for (let k = 0; k < 4; k++) {
    const [axis, sign] = dirs.splice(b.int(0, dirs.length - 1), 1)[0]!;
    queue.push({ p: [0, 0, 0, 0], axis, sign, depth: 0 });
  }
  let segs = 0;
  // Central chamber.
  b.box(-3, 0, -3, -3, 3, 4, 3, 3, 0);
  b.box(-3, -1, -3, -3, 3, -1, 3, 3, plank, IF_SOFT);
  while (queue.length && segs < 22) {
    const s = queue.shift()!;
    const len = b.int(8, 16);
    const q = [s.p[0], s.p[1], s.p[2], s.p[3]];
    const [p1, p2] = [0, 1, 2].filter((k) => k !== s.axis) as [number, number];
    for (let t = 1; t <= len; t++) {
      q[[0, 2, 3][s.axis]!] = s.p[[0, 2, 3][s.axis]!]! + t * s.sign;
      const L = [q[0]!, q[2]!, q[3]!]; // local a, b, c
      if (Math.abs(L[0]!) > 32 || Math.abs(L[1]!) > 32 || Math.abs(L[2]!) > 32) break;
      for (let u = -1; u <= 1; u++)
        for (let v = -1; v <= 1; v++) {
          const cell = [L[0]!, L[1]!, L[2]!];
          cell[p1] = cell[p1]! + u;
          cell[p2] = cell[p2]! + v;
          b.box(cell[0]!, q[1]!, cell[1]!, cell[2]!, cell[0]!, q[1]! + 2, cell[1]!, cell[2]!, 0);
          b.set(cell[0]!, q[1]! - 1, cell[1]!, cell[2]!, plank, IF_SOFT);
          if (b.chance(0.03)) b.set(cell[0]!, q[1]! + 2, cell[1]!, cell[2]!, web);
        }
      // Supports: corner posts and a beam overhead.
      if (t % 4 === 0) {
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as [number, number][]) {
          const cell = [L[0]!, L[1]!, L[2]!];
          cell[p1] = cell[p1]! + u;
          cell[p2] = cell[p2]! + v;
          pillar(b, cell[0]!, q[1]!, cell[1]!, cell[2]!, q[1]! + 1, fence);
        }
        for (let u = -1; u <= 1; u++)
          for (let v = -1; v <= 1; v++) {
            const cell = [L[0]!, L[1]!, L[2]!];
            cell[p1] = cell[p1]! + u;
            cell[p2] = cell[p2]! + v;
            b.set(cell[0]!, q[1]! + 2, cell[1]!, cell[2]!, plank);
          }
        if (b.chance(0.35)) {
          const cell = [L[0]!, L[1]!, L[2]!];
          cell[p1] = cell[p1]! + 1;
          b.set(cell[0]!, q[1]! + 1, cell[1]!, cell[2]!, torch);
        }
      }
    }
    segs++;
    const end: [number, number, number, number] = [q[0]!, q[1]!, q[2]!, q[3]!];
    // Occasionally drop to a lower level at a junction (a 3-block shaft: no fall damage).
    if (b.chance(0.25)) {
      const L = [end[0], end[2], end[3]];
      b.box(L[0]! - 1, end[1] - 3, L[1]! - 1, L[2]! - 1, L[0]! + 1, end[1] + 2, L[1]! + 1, L[2]! + 1, 0);
      end[1] = end[1] - 3;
    }
    const branches = s.depth >= 3 ? 0 : b.int(1, 3);
    if (branches === 0 || b.chance(0.2)) {
      const L = [end[0], end[2], end[3]];
      const cell = [L[0]!, L[1]!, L[2]!];
      cell[p1] = cell[p1]! + 1;
      if (b.chance(0.6)) b.chest(cell[0]!, s.p[1], cell[1]!, cell[2]!, 'hypermine');
      else if (b.chance(0.4)) b.spawner(cell[0]!, s.p[1], cell[1]!, cell[2]!, 'web_weaver');
    }
    for (let k = 0; k < branches; k++) {
      const [axis, sign] = b.pick([
        [A, 1],
        [A, -1],
        [Bf, 1],
        [Bf, -1],
        [C, 1],
        [C, -1],
      ] as [number, number][]);
      if (axis === s.axis && sign === -s.sign) continue;
      queue.push({ p: end, axis, sign, depth: s.depth + 1 });
    }
  }
}

/** Library ruins: a stone-brick hall lined with bookshelves, cobwebbed, with chests. */
export function library(b: Builder): void {
  const walls = [id('stone_bricks'), id('mossy_stone_bricks'), id('cracked_stone_bricks')];
  const shelf = id('bookshelf');
  for (let c = -4; c <= 4; c++)
    for (let bb = -5; bb <= 5; bb++)
      for (let y = 0; y <= 6; y++)
        for (let a = -4; a <= 4; a++) {
          const shell = y === 0 || y === 6 || Math.abs(a) === 4 || Math.abs(bb) === 5 || Math.abs(c) === 4;
          const lining = !shell && y <= 4 && (Math.abs(a) === 3 || Math.abs(c) === 3) && bb % 3 !== 0;
          b.set(a, y, bb, c, shell ? b.pick(walls) : lining ? shelf : 0);
        }
  for (let bb = -3; bb <= 3; bb += 3) b.set(0, 5, bb, 0, id('lantern'));
  b.set(0, 1, 0, 0, id('crafting_table'));
  b.chest(0, 1, -4, 0, 'library');
  b.chest(0, 1, 4, 0, 'library');
  for (let k = 0; k < 10; k++) b.set(b.int(-3, 3), b.int(3, 5), b.int(-4, 4), b.int(-3, 3), id('cobweb'), IF_AIR);
}

/** Deep silent vault: hush-stone chambers in the Silent Layer, with echo moss and a lurker. */
export function silentVault(b: Builder): void {
  const hush = id('hush_stone'), moss = id('echo_moss'), shale = id('silent_shale');
  b.room(-5, 0, -5, -5, 5, 6, 5, 5, hush, shale, hush);
  for (let k = 0; k < 40; k++) b.set(b.int(-4, 4), 0, b.int(-4, 4), b.int(-4, 4), moss);
  for (const [a, c] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as [number, number][])
    pillar(b, a, 1, 0, c, 5, id('chiseled_stone_bricks'));
  b.spawner(0, 1, 0, 0, 'lurker');
  b.chest(-4, 1, 0, 0, 'deep_silent_vault');
  b.chest(4, 1, 0, 0, 'deep_silent_vault');
  b.chest(0, 1, 0, 4, 'deep_silent_vault');
  b.set(0, 5, 0, 0, id('echo_sprout'), IF_AIR);
}

/**
 * Ana Vault: a sealed tesseract-brick room right beside an Ana Sheet along world W. Its only
 * opening faces the sheet, so from any ordinary slice it is a closed box inside solid rock;
 * you get in by entering the sheet and moving ana into the vault.
 */
export function anaVault(b: Builder): void {
  b.orient(ORIENTS[0]!); // c = world +w: the sheet lies at c = -2
  const tb = id('tesseract_bricks');
  b.room(-3, 0, -3, 0, 3, 5, 3, 6, tb, tb, tb);
  // Opening on the sheet side and a short passage into the sheet cavity.
  b.box(-1, 1, -1, 0, 1, 3, 1, 0, 0);
  b.box(-1, 0, -1, -1, 1, 3, 1, -1, 0);
  b.set(0, 4, 0, 3, id('lantern'));
  b.chest(-2, 1, -2, 5, 'ana_vault');
  b.chest(2, 1, 2, 5, 'ana_vault');
  b.set(0, 1, 0, 5, id('amethyst'));
}
