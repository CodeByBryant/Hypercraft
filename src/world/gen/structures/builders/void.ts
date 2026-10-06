// Hollow Void structures (Phase 8). The Stronghold lies under the Surface and holds the Void
// Gate: ONE cell sunk in the floor of its gate room with a gate frame on each of its six
// horizontal faces (+-a, +-b and +-c, the last two kata/ana of whoever stands in the room's
// slice). The island structures (Void City, Sky Vault, Starlight Garden) follow in 8.3.

import { A, Bf, C, id, type Builder } from '../Builder';
import { IF_AIR, weighted } from './common';

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

// ---------------------------------------------------------------- islands (Hollow Void)
// Each island hosts at most one structure, centred on it (VoidGenerator.islandHost). Local y = 0
// is the first air cell over the centre of the island; its top is bumpy, so every building clears
// the air above its footprint and sinks a foundation of voidstone under it.

/** Crystal Shrine: a waystone: pillar, glowing cap and crystals on the six sides. Common. */
export function crystalShrine(b: Builder): void {
  const brick = id('voidstone_bricks'), glow = id('starlight_block'), cluster = id('starlight_cluster'), base = id('voidstone');
  b.box(-1, 0, -1, -1, 1, 6, 1, 1, 0);
  b.foundation(-1, -1, -1, 1, 1, 1, -1, base, 6);
  b.box(-1, -1, -1, -1, 1, 0, 1, 1, brick); // a 3 x 3 x 3 plinth (a, b, c), the top two layers of it above ground
  for (let y = 1; y <= 3; y++) b.set(0, y, 0, 0, brick);
  b.set(0, 4, 0, 0, glow);
  for (const [a, bb, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as [number, number, number][]) b.set(a, 1, bb, c, cluster);
}

/** Starlight Garden: a moss lawn ringed by six crystal pillars, whisper trees and a chest of fruit. */
export function starlightGarden(b: Builder): void {
  const moss = id('whisper_moss'), crystal = id('starlight_crystal'), cluster = id('starlight_cluster'), vine = id('whisper_vine'), blossom = id('whisper_blossom');
  const bricks = id('starlight_bricks'), glow = id('starlight_block'), base = id('voidstone');
  b.box(-7, 0, -7, -7, 7, 8, 7, 7, 0);
  // The lawn: a ball of moss cut at the ground (radius 7 in a, b and c).
  for (let c = -7; c <= 7; c++)
    for (let bb = -7; bb <= 7; bb++)
      for (let a = -7; a <= 7; a++) if (a * a + bb * bb + c * c <= 49) b.set(a, -1, bb, c, moss);
  // The heart: a plinth of starlight bricks and the chest.
  b.foundation(-1, -1, -1, 1, 1, 1, -1, base, 6);
  b.box(-1, -1, -1, -1, 1, 0, 1, 1, bricks);
  b.chest(0, 1, 0, 0, 'starlight_garden');
  b.set(0, 2, 0, 0, glow);
  // Six crystal pillars, one toward each horizontal direction, topped by a glowing cluster.
  for (const [a, bb, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as [number, number, number][]) {
    const h = b.int(3, 5);
    for (let y = 0; y < h; y++) b.set(a * 5, y, bb * 5, c * 5, crystal);
    b.set(a * 5, h, bb * 5, c * 5, cluster);
  }
  // Whisper trees: vines stacked three to six high, a blossom on top.
  for (let k = 0; k < 12; k++) {
    const a = b.int(-6, 6), bb = b.int(-6, 6), c = b.int(-6, 6);
    if (a * a + bb * bb + c * c > 36 || Math.abs(a) + Math.abs(bb) + Math.abs(c) < 3) continue;
    const h = b.int(3, 6);
    for (let y = 0; y < h; y++) b.set(a, y, bb, c, vine, IF_AIR);
    b.set(a, h, bb, c, blossom, IF_AIR);
  }
}

/**
 * Sky Vault: a hall (9 x 9 x 7 in a, b, c) with a 3 x 3 x 3 doorway, aurora-glass windows you can
 * look in through from kata and ana, sentinels, and the vault's chest on a pedestal at the back.
 */
export function skyVault(b: Builder): void {
  const brick = id('voidstone_bricks'), plate = id('starlight_bricks'), glow = id('starlight_block'), glass = id('aurora_glass'), lantern = id('lantern'), base = id('voidstone');
  b.box(-4, 0, -4, -3, 4, 8, 4, 3, 0);
  b.foundation(-4, -4, -3, 4, 4, 3, -1, base, 8);
  b.room(-4, -1, -4, -3, 4, 6, 4, 3, brick, plate, plate);
  // The doorway on the -b face: 3 wide in a, 3 wide in c, 3 tall.
  b.box(-1, 0, -4, -1, 1, 2, -4, 1, 0);
  // Windows: slits on the +-a faces and on the +-c faces (kata/ana of the hall).
  for (const s of [-1, 1]) {
    b.box(s * 4, 2, -1, 0, s * 4, 3, 1, 0, glass);
    b.box(-1, 2, -1, s * 3, 1, 3, 1, s * 3, glass);
  }
  // Pillars with lanterns, a pedestal with the chest, glowing posts.
  for (const [a, bb] of [[-3, -2], [3, -2], [-3, 2], [3, 2]] as [number, number][]) {
    for (let y = 0; y <= 3; y++) b.set(a, y, bb, 0, brick);
    b.set(a, 4, bb, 0, lantern);
  }
  b.box(-1, 0, 2, -1, 1, 0, 3, 1, plate);
  b.chest(0, 1, 2, 0, 'sky_vault');
  for (const [a, c] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as [number, number][]) {
    b.set(a, 0, 3, c, glow);
    b.set(a, 1, 3, c, glow);
  }
  // The guards: two by the doorway, and often a third beside the pedestal (along c: off your slice).
  b.npc(-3, 0, -3, 0, 'sky_sentinel');
  b.npc(3, 0, -3, 0, 'sky_sentinel');
  if (b.chance(0.5)) b.npc(0, 0, 1, 2, 'sky_sentinel');
}

/**
 * Void City: two or three sites, each a stack of towers along c (the hidden axis), nine apart and
 * joined by one-block bridges that run along c ONLY, so from any one slice a bridge is a lone
 * block and a tower has neighbours you cannot see. The doors of a tower are on its a/b faces
 * (walk in) and on its c faces (through a bridge).
 */
export function voidCity(b: Builder): void {
  const brick = id('voidstone_bricks'), roof = id('starlight_bricks'), glass = id('aurora_glass'), lantern = id('lantern'), base = id('voidstone');
  const sites: [number, number][] = b.chance(0.5)
    ? [[-7, -4], [7, -4], [0, 7]]
    : [[-6, 0], [6, 0]];
  for (const [sa, sb] of sites) {
    const n = b.int(2, 3);
    const c0 = n === 3 ? -9 : -4;
    for (let t = 0; t < n; t++) {
      const tc = c0 + 9 * t;
      b.box(sa - 2, 0, sb - 2, tc - 2, sa + 2, 7, sb + 2, tc + 2, 0);
      b.foundation(sa - 2, sb - 2, tc - 2, sa + 2, sb + 2, tc + 2, -1, base, 8);
      b.room(sa - 2, -1, sb - 2, tc - 2, sa + 2, 4, sb + 2, tc + 2, brick, base, roof);
      // Battlements on the roof corners.
      for (const da of [-2, 2]) for (const db of [-2, 2]) for (const dc of [-2, 2]) b.set(sa + da, 5, sb + db, tc + dc, brick);
      // A door on an a or b face (a 1-wide, 2-tall opening), windows on the c faces.
      const side = b.int(0, 3);
      if (side < 2) b.box(sa + (side ? 2 : -2), 0, sb, tc, sa + (side ? 2 : -2), 1, sb, tc, 0);
      else b.box(sa, 0, sb + (side === 3 ? 2 : -2), tc, sa, 1, sb + (side === 3 ? 2 : -2), tc, 0);
      b.box(sa, 1, sb, tc - 2, sa, 2, sb, tc - 2, glass);
      b.box(sa, 1, sb, tc + 2, sa, 2, sb, tc + 2, glass);
      b.set(sa, 3, sb, tc, lantern);
      if (t === 0) b.chest(sa + 1, 0, sb + 1, tc + 1, 'void_city');
      // The bridge to the next tower, along c only, with a doorway at each end.
      if (t < n - 1) {
        b.box(sa, 0, sb, tc + 2, sa, 1, sb, tc + 2, 0);
        b.box(sa, 0, sb, tc + 7, sa, 1, sb, tc + 7, 0);
        for (let c = tc + 3; c <= tc + 6; c++) {
          b.set(sa, -1, sb, c, brick);
          b.box(sa, 0, sb, c, sa, 2, sb, c, 0);
        }
      }
    }
  }
}
