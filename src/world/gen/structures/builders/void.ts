// Hollow Void structures (Phase 8). The Stronghold lies under the Surface and holds the Void
// Gate: ONE cell sunk in the floor of its gate room with a gate frame on each of its six
// horizontal faces (+-a, +-b and +-c, the last two kata/ana of whoever stands in the room's
// slice). The island structures (Void City, Sky Vault, Starlight Garden) follow in 8.3.

import { A, Bf, C, id, type Builder } from '../Builder';
import { weighted } from './common';

/** Wall bricks: mostly plain, some mossy, some cracked. */
function brick(b: Builder): number {
  const r = b.rng.next();
  return r < 0.62 ? id('stone_bricks') : r < 0.82 ? id('mossy_stone_bricks') : id('cracked_stone_bricks');
}

/** A hollow box of bricks: walls, floor and roof on every face, air inside. Corners inclusive. */
function shell(b: Builder, a0: number, y0: number, b0: number, c0: number, a1: number, y1: number, b1: number, c1: number): void {
  for (let c = c0; c <= c1; c++)
    for (let bb = b0; bb <= b1; bb++)
      for (let y = y0; y <= y1; y++)
        for (let a = a0; a <= a1; a++) {
          const wall = a === a0 || a === a1 || y === y0 || y === y1 || bb === b0 || bb === b1 || c === c0 || c === c1;
          b.set(a, y, bb, c, wall ? brick(b) : 0);
        }
}

/** The three local horizontal axes as a vector: [a, b, c] with `t` along `axis` and (u, v) across. */
function across(axis: number, t: number, u: number, v: number): [number, number, number] {
  const q: [number, number, number] = [0, 0, 0];
  const [p1, p2] = [A, Bf, C].filter((k) => k !== axis) as [number, number];
  q[axis] = t;
  q[p1] = u;
  q[p2] = v;
  return q;
}

type RoomKind = 'storeroom' | 'library' | 'crypt' | 'armory' | 'cell';

/** The six side rooms of a stronghold: one on each horizontal axis, so two lie kata/ana. */
const ROOMS: RoomKind[] = ['storeroom', 'library', 'crypt', 'armory', 'cell', 'storeroom'];

/**
 * Stronghold: a gate room (9 x 5 x 9 x 9 inside 7) with the Void Gate at its middle, and six
 * corridors, one along each of +-a, +-b, +-c, to six side rooms. The ones along c are only
 * reachable by moving kata/ana, since the corridor leaves the room through its ana/kata wall.
 */
export function stronghold(b: Builder): void {
  const chiseled = id('chiseled_stone_bricks'), torch = id('torch'), lantern = id('lantern');
  const frame = id('void_gate_frame'), eye = id('void_gate_frame_eye'), gate = id('void_gate');

  // Gate room: walls at +-4, floor at y = 0, roof at y = 6.
  shell(b, -4, 0, -4, -4, 4, 6, 4, 4);
  // The six corridors and rooms, built before the gate so nothing overwrites it.
  const kinds = [...ROOMS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = b.int(0, i);
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const dirs: [number, number][] = [
    [A, 1],
    [A, -1],
    [Bf, 1],
    [Bf, -1],
    [C, 1],
    [C, -1],
  ];
  dirs.forEach(([axis, sign], n) => {
    const len = b.int(5, 8);
    const tc = 4 + len + 4;
    // The room first (walls at +-3 around its centre), then the tube that joins it to the gate
    // room: a 5 x 5 brick sleeve with a 3 x 3 passage.
    const c0 = across(axis, tc * sign, 0, 0);
    shell(b, c0[0] - 3, 0, c0[1] - 3, c0[2] - 3, c0[0] + 3, 5, c0[1] + 3, c0[2] + 3);
    for (let t = 4; t <= tc - 3; t++)
      for (let u = -2; u <= 2; u++)
        for (let v = -2; v <= 2; v++)
          for (let y = 0; y <= 4; y++) {
            const q = across(axis, t * sign, u, v);
            const inside = Math.abs(u) <= 1 && Math.abs(v) <= 1 && y >= 1 && y <= 3;
            // The ends of the tube lie in the walls of the rooms it joins: carve only the passage.
            if (!inside && (t === 4 || t === tc - 3)) continue;
            b.set(q[0], y, q[1], q[2], inside ? 0 : brick(b));
          }
    // A torch on the floor every few blocks.
    for (let t = 6; t < tc - 3; t += 3) {
      const q = across(axis, t * sign, 1, 1);
      if (b.chance(0.7)) b.set(q[0], 1, q[1], q[2], torch);
    }
    furnish(b, kinds[n]!, axis, sign, tc);
  });

  // The gate room. A dais of chiseled bricks (5 x 5 x 5 in a, b, c) sunk into the floor, the gate
  // cell at its middle, a frame on each of the six horizontal faces of that cell.
  for (let c = -2; c <= 2; c++) for (let bb = -2; bb <= 2; bb++) for (let a = -2; a <= 2; a++) b.set(a, 0, bb, c, chiseled);
  b.set(0, -1, 0, 0, chiseled);
  const faces: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  let eyes = 0;
  for (const [a, bb, c] of faces) {
    // About one frame in ten comes with its eye already in place, like Minecraft's.
    const has = b.chance(0.1);
    if (has) eyes++;
    b.set(a, 0, bb, c, has ? eye : frame);
  }
  b.set(0, 0, 0, 0, eyes === 6 ? gate : 0);
  // Pillars with lanterns on top, torches on the dais, a spawner at the back.
  for (const [a, bb] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as [number, number][]) {
    for (let y = 1; y <= 4; y++) b.set(a, y, bb, 0, chiseled);
    b.set(a, 5, bb, 0, lantern);
  }
  for (const [a, bb, c] of [
    [2, 2, 0],
    [-2, 2, 0],
    [2, -2, 0],
    [-2, -2, 0],
    [0, 2, 2],
    [0, -2, -2],
  ] as [number, number, number][])
    b.set(a, 1, bb, c, torch);
  b.spawner(0, 1, 0, -3, weighted(b, [['shambler', 4], ['bone_archer', 3], ['web_weaver', 3]] as [string, number][]));
}

/** What a side room holds. (axis, sign, tc) place its centre; everything is inside +-2. */
function furnish(b: Builder, kind: RoomKind, axis: number, sign: number, tc: number): void {
  const at = (da: number, y: number, db: number, dc: number): [number, number, number, number] => {
    const q = across(axis, tc * sign, 0, 0);
    return [q[0] + da, y, q[1] + db, q[2] + dc];
  };
  const set = (p: [number, number, number, number], v: number) => b.set(p[0], p[1], p[2], p[3], v);
  const chest = (p: [number, number, number, number], loot: string) => b.chest(p[0], p[1], p[2], p[3], loot);
  const torch = id('torch'), shelf = id('bookshelf'), web = id('cobweb');
  const corners: [number, number, number][] = [
    [2, 2, 2],
    [-2, 2, 2],
    [2, -2, 2],
    [-2, -2, 2],
    [2, 2, -2],
    [-2, 2, -2],
    [2, -2, -2],
    [-2, -2, -2],
  ];
  const spots = corners.map(([da, db, dc]) => at(da, 1, db, dc));
  switch (kind) {
    case 'storeroom':
      chest(spots[0]!, 'stronghold');
      chest(spots[7]!, 'stronghold');
      set(at(0, 1, 0, 0), torch);
      break;
    case 'library':
      // Shelves against the walls of the room (the cells next to the walls, half-way up).
      for (let u = -2; u <= 2; u++)
        for (let y = 1; y <= 2; y++) {
          if (b.chance(0.7)) set(at(u, y, -2, 0), shelf);
          if (b.chance(0.7)) set(at(u, y, 2, 0), shelf);
        }
      chest(at(0, 1, 0, 0), 'stronghold_library');
      break;
    case 'crypt':
      b.spawner(...at(0, 1, 0, 0), weighted(b, [['hollow_husk', 3], ['bone_archer', 3], ['shambler', 2]] as [string, number][]));
      chest(spots[3]!, 'stronghold');
      for (let k = 0; k < 8; k++) set(at(b.int(-2, 2), b.int(2, 4), b.int(-2, 2), b.int(-2, 2)), web);
      break;
    case 'armory':
      chest(spots[0]!, 'stronghold_armory');
      chest(spots[3]!, 'stronghold_armory');
      chest(spots[5]!, 'stronghold');
      break;
    case 'cell':
      chest(spots[2]!, 'stronghold');
      b.spawner(...at(0, 1, 2, 0), weighted(b, [['web_weaver', 3], ['shambler', 3], ['bone_archer', 2]] as [string, number][]));
      break;
  }
}
