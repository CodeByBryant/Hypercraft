// Villages in 4D: a plaza with a well, and roads leaving along all six horizontal directions
// (±a, ±b, ±c: in the world, ±x, ±z and ±w). Houses line the roads on four sides each (the
// two perpendicular horizontal axes, both ways), so a village is a 3D cross of streets: any
// one slice shows the plaza, two or three roads, and houses whose kata/ana neighbours are a
// step along W away. Every house stands on its own foundation at its own ground height and
// houses one villager with a profession that matches the building.

import { A, Bf, C, id, type Builder, type Orient } from '../Builder';
import type { Start } from '../Placement';
import { IF_AIR, IF_SOFT, ball, pillar, subOrient, weighted } from './common';

interface Style {
  wall: number;
  frame: number;
  floor: number;
  roof: number;
  base: number;
  path: number;
  window: number;
  fence: number;
  bed: string;
  stilts?: boolean;
}

const STYLES: Record<string, () => Style> = {
  meadow: () => ({ wall: id('planks'), frame: id('log'), floor: id('planks'), roof: id('thatch'), base: id('cobblestone'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'red_bed' }),
  orchard: () => ({ wall: id('plaster'), frame: id('log'), floor: id('planks'), roof: id('thatch'), base: id('cobblestone'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'red_bed' }),
  marsh: () => ({ wall: id('spruce_planks'), frame: id('dark_oak_log'), floor: id('spruce_planks'), roof: id('thatch'), base: id('dark_oak_log'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'blue_bed', stilts: true }),
  taiga: () => ({ wall: id('spruce_planks'), frame: id('spruce_log'), floor: id('spruce_planks'), roof: id('spruce_planks'), base: id('mossy_cobblestone'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'blue_bed' }),
  snow: () => ({ wall: id('spruce_planks'), frame: id('spruce_log'), floor: id('spruce_planks'), roof: id('packed_snow'), base: id('stone_bricks'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'white_bed' }),
  savanna: () => ({ wall: id('acacia_planks'), frame: id('acacia_log'), floor: id('acacia_planks'), roof: id('thatch'), base: id('terracotta_orange'), path: id('dirt_path'), window: id('glass'), fence: id('oak_fence'), bed: 'red_bed' }),
  desert: () => ({ wall: id('cut_sandstone'), frame: id('sandstone'), floor: id('sandstone'), roof: id('cut_sandstone'), base: id('sandstone'), path: id('sandstone'), window: id('glass'), fence: id('oak_fence'), bed: 'white_bed' }),
};

type Kind = 'house' | 'smithy' | 'library' | 'temple' | 'mason' | 'fletcher' | 'farm' | 'shrine';

const KINDS: [Kind, number][] = [
  ['house', 6],
  ['farm', 4],
  ['smithy', 2],
  ['library', 2],
  ['temple', 1.5],
  ['mason', 1.5],
  ['fletcher', 1.5],
  ['shrine', 1],
];

/** Profession of the villager living in each kind of building. */
const PROFESSION: Record<Kind, string[]> = {
  house: ['farmer', 'farmer', 'nitwit'],
  farm: ['farmer'],
  smithy: ['smith'],
  library: ['librarian', 'cartographer'],
  temple: ['cleric'],
  mason: ['mason'],
  fletcher: ['fletcher'],
  shrine: ['w_walker'],
};

export function village(b: Builder, st: Start): void {
  const style = (STYLES[(st.def.params?.style as string) ?? 'meadow'] ?? STYLES.meadow!)();
  const base = b.orientation;
  const y0 = b.originY;
  const vid = `v${st.i},${st.j},${st.k}`;
  // Plaza: a path ball around the well, then the well itself.
  pathArea(b, style, 0, 0, 0, 5);
  well(b, style);
  lampPost(b, style, 3, 3, 0);
  lampPost(b, style, -3, -3, 0);
  // Roads along the six horizontal directions (some villages skip a few).
  const dirs: [number, number][] = [
    [A, 1],
    [A, -1],
    [Bf, 1],
    [Bf, -1],
    [C, 1],
    [C, -1],
  ];
  let houses = 0;
  for (const [axis, sign] of dirs) {
    if (houses > 0 && b.chance(0.2)) continue;
    const len = b.int(16, 30);
    const [p1, p2] = [0, 1, 2].filter((k) => k !== axis) as [number, number];
    // Road cells: 3x3 cross-section in the two perpendicular axes, following the ground.
    for (let t = 4; t <= len; t++)
      for (let u = -1; u <= 1; u++)
        for (let v = -1; v <= 1; v++) {
          const q = [0, 0, 0];
          q[axis] = t * sign;
          q[p1] = u;
          q[p2] = v;
          road(b, style, q[0]!, q[1]!, q[2]!);
        }
    if (b.chance(0.8)) {
      const q = [0, 0, 0];
      q[axis] = Math.min(len, 12) * sign;
      q[p1] = 2;
      lampPost(b, style, q[0]!, q[1]!, q[2]!);
    }
    // Houses on the four sides, every ~10 blocks.
    for (let t = 9; t + 3 <= len; t += b.int(9, 12)) {
      for (const [side, ss] of [
        [p1, 1],
        [p1, -1],
        [p2, 1],
        [p2, -1],
      ] as [number, number][]) {
        if (!b.chance(0.55)) continue;
        const kind = weighted(b, KINDS);
        // The piece faces the road: its forward (b) axis points back toward the road; its
        // own a axis runs along the road; its c axis is the remaining perpendicular.
        const other = [0, 1, 2].find((k) => k !== axis && k !== side)!;
        const o = subOrient(base, [axis, sign], [side, -ss], [other, 1]);
        const q = [0, 0, 0];
        q[axis] = t * sign;
        q[side] = 3 * ss;
        b.push();
        b.shift(q[0]!, 0, q[1]!, q[2]!);
        b.orient(o);
        // Door threshold sits at the road's edge; the building extends away from the road.
        const g = Math.max(b.ground(0, -4, 0), b.sea) + 1;
        b.shift(0, g - b.originY, 0, 0);
        building(b, style, kind, vid);
        b.pop();
        houses++;
      }
    }
  }
  void y0;
}

/** A dirt-path patch (3D ball in the horizontal axes) laid on the ground. */
function pathArea(b: Builder, s: Style, a0: number, b0: number, c0: number, r: number): void {
  for (let c = -r; c <= r; c++)
    for (let bb = -r; bb <= r; bb++)
      for (let a = -r; a <= r; a++) {
        if (a * a + bb * bb + c * c > r * r) continue;
        road(b, s, a0 + a, b0 + bb, c0 + c);
      }
}

/** One road cell: path on the ground, cleared headroom. */
function road(b: Builder, s: Style, a: number, bb: number, c: number): void {
  const g = b.ground(a, bb, c) - b.originY;
  if (g + b.originY < b.sea) {
    // Over water: a plank bridge at sea level.
    b.set(a, b.sea - b.originY, bb, c, s.floor);
    for (let y = 1; y <= 3; y++) b.set(a, b.sea - b.originY + y, bb, c, 0);
    return;
  }
  b.set(a, g, bb, c, s.path);
  for (let y = 1; y <= 3; y++) b.set(a, g + y, bb, c, 0);
}

/** 4D well: a stone rim around a 3x3x3 (horizontal) shaft of water. */
function well(b: Builder, s: Style): void {
  const g = b.ground(0, 0, 0) - b.originY;
  for (let c = -2; c <= 2; c++)
    for (let bb = -2; bb <= 2; bb++)
      for (let a = -2; a <= 2; a++) {
        const rim = Math.max(Math.abs(a), Math.abs(bb), Math.abs(c)) === 2;
        if (rim) {
          b.set(a, g, bb, c, s.base);
          b.set(a, g + 1, bb, c, s.base);
        } else {
          for (let y = g - 3; y <= g; y++) b.set(a, y, bb, c, id('water'));
          b.set(a, g + 1, bb, c, 0);
        }
      }
  // Roof on four posts at the (a, c) corners.
  for (const [a, c] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as [number, number][])
    pillar(b, a, g + 2, 0, c, g + 4, s.fence);
  b.box(-2, g + 5, -2, -2, 2, g + 5, 2, 2, s.roof);
}

function lampPost(b: Builder, s: Style, a: number, bb: number, c: number): void {
  const g = b.ground(a, bb, c) - b.originY;
  pillar(b, a, g + 1, bb, c, g + 3, s.fence);
  b.set(a, g + 4, bb, c, id('lantern'));
}

/**
 * A building in its own frame: the door is at (0, 1..2, 0, 0) on the front wall (b = 0); the
 * body spans a ∈ [-3, 3], b ∈ [-6, 0], c ∈ [-3, 3] with the floor at y = 0.
 */
function building(b: Builder, s: Style, kind: Kind, vid: string): void {
  if (kind === 'farm') {
    farm(b, s, vid);
    return;
  }
  const stone = kind === 'temple' || kind === 'mason' || kind === 'shrine';
  const wall = kind === 'temple' ? id('stone_bricks') : kind === 'shrine' ? id('tesseract_bricks') : kind === 'mason' ? id('bricks') : s.wall;
  const frame = stone ? id('chiseled_stone_bricks') : s.frame;
  const tall = kind === 'temple' || kind === 'library' ? 6 : 4;
  // Foundation (or stilts in marshes).
  if (s.stilts) {
    for (const [a, bb, c] of [
      [-3, 0, -3],
      [3, 0, -3],
      [-3, -6, -3],
      [3, -6, -3],
      [-3, 0, 3],
      [3, 0, 3],
      [-3, -6, 3],
      [3, -6, 3],
    ] as [number, number, number][])
      b.foundation(a, bb, c, a, bb, c, 0, s.frame, 10);
  } else b.foundation(-3, 0, -3, 3, -6, 3, 0, s.base, 12);
  // Shell: floor, six walls with frame pillars on the edges, flat ceiling.
  for (let c = -3; c <= 3; c++)
    for (let bb = -6; bb <= 0; bb++)
      for (let y = 0; y <= tall + 1; y++)
        for (let a = -3; a <= 3; a++) {
          const ea = a === -3 || a === 3, eb = bb === -6 || bb === 0, ec = c === -3 || c === 3;
          const edges = (ea ? 1 : 0) + (eb ? 1 : 0) + (ec ? 1 : 0);
          let v = 0;
          if (y === 0) v = stone ? id('stone_bricks') : s.floor;
          else if (y === tall + 1) v = s.roof;
          else if (edges >= 2) v = frame;
          else if (edges === 1) v = wall;
          b.set(a, y, bb, c, v);
        }
  // Roof: a 4D hip roof, each layer one smaller in a, b and c.
  for (let k = 0; k < 4; k++) b.box(-4 + k, tall + 2 + k, -7 + k, -4 + k, 4 - k, tall + 2 + k, 1 - k, 4 - k, kind === 'shrine' ? id('tesseract_bricks') : s.roof);
  // Door (front wall) and, half the time, a second door on the ana wall (reach it kata/ana).
  b.box(0, 1, 0, 0, 0, 2, 0, 0, 0);
  b.set(0, 0, 1, 0, s.path, IF_SOFT);
  if (b.chance(0.5)) b.box(0, 1, -3, 3, 0, 2, -3, 3, 0);
  // Windows on the side walls and the back.
  for (const [a, bb, c] of [
    [-3, -3, 0],
    [3, -3, 0],
    [0, -3, -3],
    [0, -3, 3],
    [0, -6, 0],
  ] as [number, number, number][])
    b.box(a, 2, bb, c, a, 3, bb, c, s.window);
  // Light.
  b.set(0, tall, -3, 0, id('lantern'));
  // Interior by kind.
  const B_ = (a: number, y: number, bb: number, c: number, name: string) => b.set(a, y, bb, c, id(name));
  switch (kind) {
    case 'house':
      B_(-2, 1, -5, -2, 'crafting_table');
      b.chest(2, 1, -5, 2, 'village_house');
      B_(2, 1, -5, -2, 'hay_bale');
      break;
    case 'smithy':
      B_(-2, 1, -5, -2, 'furnace');
      B_(-2, 1, -5, 2, 'blast_furnace');
      B_(2, 1, -5, -2, 'iron_block');
      b.chest(2, 1, -5, 2, 'village_smith');
      B_(0, 1, -5, -2, 'lava');
      break;
    case 'library':
      for (const c of [-2, -1, 1, 2]) for (let y = 1; y <= 4; y++) B_(-2, y, -5, c, 'bookshelf');
      for (const bb of [-4, -3, -2]) for (let y = 1; y <= 3; y++) B_(2, y, bb, -2, 'bookshelf');
      b.chest(2, 1, -5, 2, 'village_library');
      break;
    case 'temple':
      for (const [a, c] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
      ] as [number, number][])
        pillar(b, a, 1, -5, c, 5, id('chiseled_stone_bricks'));
      B_(0, 1, -5, 0, 'gilded_bricks');
      B_(0, 2, -5, 0, 'amethyst');
      b.chest(0, 1, -4, 2, 'village_temple');
      break;
    case 'mason':
      B_(-2, 1, -5, -2, 'stone_bricks');
      B_(-2, 1, -5, 2, 'clay');
      B_(2, 1, -5, -2, 'furnace');
      b.chest(2, 1, -5, 2, 'village_house');
      break;
    case 'fletcher':
      for (const c of [-2, 2]) B_(-2, 1, -5, c, 'hay_bale');
      B_(2, 1, -5, -2, 'oak_fence');
      b.chest(2, 1, -5, 2, 'village_house');
      break;
    case 'shrine':
      // The W-Walker's shrine: a small tesseract frame of glowing bricks.
      for (const [a, c] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as [number, number][])
        pillar(b, a, 1, -3, c, 3, id('tesseract_bricks'));
      B_(0, 2, -3, 0, 'amethyst');
      b.chest(2, 1, -5, 2, 'village_temple');
      break;
  }
  // Everyone who lives here has a bed (sleep through the night; it sets your respawn point).
  if (kind !== 'temple' && kind !== 'shrine') b.bed(-2, 1, -2, 2, s.bed, Bf, -1);
  const prof = b.pick(PROFESSION[kind]);
  b.npc(0, 1, -2, 0, prof === 'nitwit' ? 'villager' : `villager_${prof}`, { village: vid, profession: prof });
}

/** A 4D field: wheat plots around a water channel, with a fence post at each corner. */
function farm(b: Builder, s: Style, vid: string): void {
  const water = id('water'), soil = id('dirt'), wheat = id('wild_wheat');
  for (let c = -3; c <= 3; c++)
    for (let bb = -6; bb <= 0; bb++)
      for (let a = -3; a <= 3; a++) {
        const g = b.ground(a, bb, c) - b.originY;
        const rim = a === -3 || a === 3 || bb === -6 || bb === 0 || c === -3 || c === 3;
        if (rim) {
          b.set(a, g, bb, c, s.frame);
          b.set(a, g + 1, bb, c, 0);
        } else if (a === 0) {
          b.set(a, g, bb, c, water);
          b.set(a, g - 1, bb, c, soil, IF_SOFT);
        } else {
          b.set(a, g, bb, c, soil);
          b.set(a, g + 1, bb, c, wheat);
        }
        b.set(a, g + 2, bb, c, 0, IF_AIR);
      }
  const g0 = b.ground(0, -3, 0) - b.originY;
  b.chest(-3, g0 + 1, -6, -3, 'village_farm');
  b.npc(2, g0 + 1, 1, 0, 'villager_farmer', { village: vid, profession: 'farmer' });
  void ball;
  void s;
}

export type { Orient };
