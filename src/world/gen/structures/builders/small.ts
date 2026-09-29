// Small surface structures: cabins, watchtowers, witch huts, windmills, campsites, igloos,
// outposts, standing slabs, stone spheres, fossil sites, lighthouses and buried treasure.
// Each is authored in the piece frame (a right, b forward, c ana; floor at y = 0).

import { id, type Builder } from '../Builder';
import type { Start } from '../Placement';
import { IF_AIR, IF_SOFT, ball, pillar } from './common';

/** Level the site: foundation under a footprint and clear air above it. */
function site(b: Builder, a0: number, b0: number, c0: number, a1: number, b1: number, c1: number, baseBlock: number, clear = 6): void {
  b.foundation(a0, b0, c0, a1, b1, c1, 0, baseBlock, 12);
  b.clearAbove(a0, b0, c0, a1, b1, c1, 1, clear);
}

/** Log cabin: a 4D room of logs and planks with a chest and a crafting table. */
export function cabin(b: Builder): void {
  const log = id(b.pick(['log', 'spruce_log', 'birch_log'])), planks = id('planks');
  site(b, -3, -3, -3, 3, 3, 3, id('cobblestone'));
  b.room(-3, 0, -3, -3, 3, 5, 3, 3, log, planks, planks);
  b.box(-4, 6, -4, -4, 4, 6, 4, 4, id('spruce_planks'));
  b.box(-2, 7, -2, -2, 2, 7, 2, 2, id('spruce_planks'));
  b.box(0, 1, 3, 0, 0, 2, 3, 0, 0); // door
  b.box(3, 2, 0, 0, 3, 3, 0, 0, id('glass'));
  b.box(0, 2, 0, -3, 0, 3, 0, -3, id('glass'));
  b.set(-2, 1, -2, -2, id('crafting_table'));
  b.set(2, 1, -2, 2, id('furnace'));
  b.set(0, 4, 0, 0, id('lantern'));
  b.chest(-2, 1, -2, 2, 'cabin');
  b.set(2, 1, 2, -2, id('red_bed'));
}

/** Watchtower: four log posts, a ladder, a railed platform with a chest. */
export function watchtower(b: Builder): void {
  const log = id('log'), planks = id('planks'), fence = id('oak_fence');
  const h = b.int(8, 11);
  site(b, -2, -2, -2, 2, 2, 2, id('cobblestone'), 3);
  for (const [a, bb, c] of [
    [-2, -2, -2],
    [2, -2, -2],
    [-2, 2, -2],
    [2, 2, -2],
    [-2, -2, 2],
    [2, -2, 2],
    [-2, 2, 2],
    [2, 2, 2],
  ] as [number, number, number][])
    pillar(b, a, 0, bb, c, h + 2, log);
  b.box(-2, h, -2, -2, 2, h, 2, 2, planks);
  for (let c = -2; c <= 2; c++)
    for (let bb = -2; bb <= 2; bb++)
      for (let a = -2; a <= 2; a++) if (Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === 2) b.set(a, h + 1, bb, c, fence, IF_AIR);
  b.box(-2, h + 3, -2, -2, 2, h + 3, 2, 2, id('thatch'));
  // Ladder up the middle of the -b face.
  for (let y = 1; y < h; y++) b.faced(0, y, -1, 0, id('ladder'), 1, 1);
  b.set(0, h, -1, 0, 0);
  b.set(1, h + 1, 1, 1, id('lantern'));
  b.chest(-1, h + 1, 1, -1, 'watchtower');
}

/** Witch hut: dark planks on stilts, with a cauldron-like pit of glowing stuff. */
export function witchHut(b: Builder): void {
  const wood = id('spruce_planks'), stilt = id('dark_oak_log');
  const lift = 3;
  for (const [a, c] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as [number, number][])
    for (const bb of [-3, 3]) b.foundation(a, bb, c, a, bb, c, lift, stilt, 10);
  for (const [a, c] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as [number, number][])
    for (const bb of [-3, 3]) pillar(b, a, 0, bb, c, lift - 1, stilt);
  b.room(-3, lift, -3, -3, 3, lift + 5, 3, 3, wood, wood, id('thatch'));
  b.box(0, lift + 1, 3, 0, 0, lift + 2, 3, 0, 0);
  b.box(3, lift + 2, 0, 0, 3, lift + 3, 0, 0, id('glass'));
  // Steps down to the ground from the door.
  for (let k = 1; k <= lift; k++) b.set(0, lift - k, 3 + k, 0, wood, IF_SOFT);
  b.set(-2, lift + 1, -2, 0, id('glow_berries'));
  b.set(0, lift + 1, -2, 0, id('luminous_moss'));
  b.set(2, lift + 1, -2, -2, id('red_mushroom'));
  b.chest(2, lift + 1, -2, 2, 'witch_hut');
}

/**
 * Windmill: a round stone tower with a 4D rotor: two blade crosses, one in the (a, y)
 * plane and one in the (c, y) plane, so kata/ana you see a different set of blades.
 */
export function windmill(b: Builder): void {
  const stone = id('cobblestone'), plaster = id('plaster'), fence = id('oak_fence'), wool = id('wool');
  const h = 10;
  b.foundation(-3, -3, -3, 3, 3, 3, 0, stone, 12);
  for (let y = 0; y <= h; y++)
    for (let c = -3; c <= 3; c++)
      for (let bb = -3; bb <= 3; bb++)
        for (let a = -3; a <= 3; a++) {
          const r = Math.hypot(a, bb, c);
          const rr = 3.4 - y * 0.08;
          if (r > rr) continue;
          b.set(a, y, bb, c, y === 0 ? stone : r > rr - 1 ? (y < 3 ? stone : plaster) : 0);
        }
  ball(b, 0, h, 0, 0, 3, id('thatch'), 0, undefined, 0);
  b.box(0, 1, 3, 0, 0, 2, 3, 0, 0);
  const hub = h - 2;
  b.set(0, hub, 4, 0, id('log'));
  for (let k = 1; k <= 6; k++) {
    for (const [da, dy] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
    ] as [number, number][]) {
      b.set(da, hub + dy, 5, 0, k === 6 ? fence : wool, IF_AIR);
      b.set(0, hub + dy, 5, da, k === 6 ? fence : wool, IF_AIR); // the ana blades
    }
  }
  b.chest(-2, 1, 0, 0, 'windmill');
  b.set(2, 1, 0, 0, id('hay_bale'));
}

/** Campsite: a campfire, log seats around it on all six sides, a chest. */
export function campsite(b: Builder): void {
  const g = b.ground(0, 0, 0) - b.originY;
  b.set(0, g + 1, 0, 0, id('campfire'));
  for (const [a, bb, c] of [
    [2, 0, 0],
    [-2, 0, 0],
    [0, 2, 0],
    [0, -2, 0],
    [0, 0, 2],
    [0, 0, -2],
  ] as [number, number, number][])
    if (b.chance(0.8)) b.set(a, b.ground(a, bb, c) - b.originY + 1, bb, c, id('log'));
  b.set(3, b.ground(3, 3, 0) - b.originY + 1, 3, 0, id('wool'));
  b.chest(-3, b.ground(-3, 2, 1) - b.originY + 1, 2, 1, 'campsite');
}

/** Igloo: a 4D hemisphere of packed snow (a half 3-sphere), with a chest and a light. */
export function igloo(b: Builder): void {
  const snow = id('packed_snow');
  b.foundation(-4, -4, -4, 4, 4, 4, 0, snow, 6);
  ball(b, 0, 0, 0, 0, 4.4, snow, 1.2, undefined, 0);
  b.box(0, 1, 3, 0, 0, 2, 4, 0, 0);
  b.box(-3, 0, -3, -3, 3, 0, 3, 3, id('wool'));
  b.set(0, 3, 0, 0, id('lantern'));
  b.chest(-2, 1, -2, 0, 'igloo');
  b.set(2, 1, -2, 0, id('white_bed'));
}

/** Outpost: a stone and dark-wood tower with a bone-archer spawner on top. */
export function outpost(b: Builder): void {
  const wall = id('cobblestone'), wood = id('spruce_planks'), log = id('dark_oak_log');
  const h = 12;
  site(b, -3, -3, -3, 3, 3, 3, wall, 4);
  for (let y = 0; y <= h; y++)
    for (let c = -3; c <= 3; c++)
      for (let bb = -3; bb <= 3; bb++)
        for (let a = -3; a <= 3; a++) {
          const edge = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === 3;
          const corners = (Math.abs(a) === 3 ? 1 : 0) + (Math.abs(bb) === 3 ? 1 : 0) + (Math.abs(c) === 3 ? 1 : 0);
          const floor = y === 0 || y === 5 || y === 10;
          b.set(a, y, bb, c, floor ? wood : corners >= 2 ? log : edge ? (y < 4 ? wall : wood) : 0);
        }
  b.box(0, 1, 3, 0, 0, 2, 3, 0, 0);
  for (let y = 1; y < 10; y++) b.faced(-2, y, 0, 0, id('ladder'), 0, 1);
  b.set(-2, 5, 0, 0, 0);
  b.set(-2, 10, 0, 0, 0);
  b.box(-4, h + 1, -4, -4, 4, h + 1, 4, 4, wood);
  b.spawner(0, h + 2, 0, 0, 'bone_archer');
  b.set(2, h + 2, 2, 2, id('red_wool'));
  b.set(2, h + 3, 2, 2, id('red_wool'));
  b.chest(2, 6, -2, 2, 'outpost');
}

/** Standing slabs: tall thin monoliths (1 thick along one axis), a 4D henge of lore stones. */
export function standingSlabs(b: Builder): void {
  const stone = id(b.pick(['stone_bricks', 'weathered_stone', 'mossy_stone_bricks']));
  const n = b.int(3, 5);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const a = Math.round(Math.cos(t) * 4), c = Math.round(Math.sin(t) * 4);
    const bb = b.int(-2, 2);
    const g = b.ground(a, bb, c) - b.originY;
    const hgt = b.int(4, 7);
    // Thin along b, 3 wide in a and c: in some slices a wall, in others a thin post.
    b.box(a - 1, g - 1, bb, c - 1, a + 1, g + hgt, bb, c + 1, stone);
  }
  b.set(0, b.ground(0, 0, 0) - b.originY, 0, 0, id('chiseled_stone_bricks'));
}

/**
 * Stone sphere: the 4D version of a stone circle is a ring of pillars on a sphere in the
 * horizontal 3-space. Every slice through it shows a ring; the rings shrink toward the edge.
 */
export function stoneCircle(b: Builder): void {
  const stone = id(b.pick(['stone', 'mossy_cobblestone', 'weathered_stone']));
  const r = 7;
  // Pillars at the vertices of a subdivided octahedron (on a sphere of radius r).
  const dirs: [number, number, number][] = [];
  for (const [x, y, z] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ])
    dirs.push([x!, y!, z!]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) dirs.push([sx / Math.sqrt(3), sy / Math.sqrt(3), sz / Math.sqrt(3)]);
  for (const [x, y, z] of dirs) {
    const a = Math.round(x * r), bb = Math.round(y * r), c = Math.round(z * r);
    const g = b.ground(a, bb, c) - b.originY;
    pillar(b, a, g - 1, bb, c, g + b.int(3, 5), stone);
  }
  const g0 = b.ground(0, 0, 0) - b.originY;
  b.set(0, g0 + 1, 0, 0, id('amethyst'));
  b.chest(0, g0 - 1, 0, 1, 'stone_circle');
}

/** Fossil site: a half-buried 4D rib cage of bone blocks and a dig chest. */
export function fossilSite(b: Builder): void {
  const bone = id('bone_block');
  const g = b.ground(0, 0, 0) - b.originY;
  const len = b.int(8, 12);
  for (let t = -len / 2; t <= len / 2; t++) {
    b.set(0, g - 1, Math.round(t), 0, bone);
    if (Math.round(t) % 2 === 0) {
      // Ribs curve up in the (a, y) plane and in the (c, y) plane.
      for (let k = 0; k <= 4; k++) {
        const s = Math.sin((k / 4) * Math.PI) * 3, dy = Math.round((k / 4) * 5) - 2;
        b.set(Math.round(s), g + dy, Math.round(t), 0, bone);
        b.set(-Math.round(s), g + dy, Math.round(t), 0, bone);
        b.set(0, g + dy, Math.round(t), Math.round(s), bone);
        b.set(0, g + dy, Math.round(t), -Math.round(s), bone);
      }
    }
  }
  ball(b, 0, g + 3, len / 2 + 1, 0, 1.6, bone);
  b.chest(2, g - 2, 0, 2, 'fossil_site');
}

/** Lighthouse on a beach: a striped tower with a glowing top. */
export function lighthouse(b: Builder): void {
  const white = id('plaster'), red = id('red_wool'), stone = id('stone_bricks');
  const h = b.int(14, 18);
  b.foundation(-2, -2, -2, 2, 2, 2, 0, stone, 14);
  for (let y = 0; y <= h; y++)
    for (let c = -2; c <= 2; c++)
      for (let bb = -2; bb <= 2; bb++)
        for (let a = -2; a <= 2; a++) {
          const edge = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === 2;
          b.set(a, y, bb, c, y === 0 ? stone : edge ? (Math.floor(y / 3) % 2 ? red : white) : 0);
        }
  b.box(0, 1, 2, 0, 0, 2, 2, 0, 0);
  for (let y = 1; y < h; y++) b.faced(-1, y, 0, 0, id('ladder'), 0, -1);
  b.box(-3, h + 1, -3, -3, 3, h + 1, 3, 3, stone);
  b.box(-1, h + 2, -1, -1, 1, h + 3, 1, 1, id('sea_lantern'));
  b.box(-2, h + 4, -2, -2, 2, h + 4, 2, 2, stone);
  b.chest(1, 1, -1, 1, 'lighthouse');
}

/** Buried treasure: a chest under the sand of a beach. */
export function buriedTreasure(b: Builder, st: Start): void {
  const g = b.ground(0, 0, 0) - b.originY;
  b.set(0, g - 2, 0, 0, id('sand'), IF_SOFT);
  b.chest(0, g - 1, 0, 0, 'buried_treasure');
  void st;
}
