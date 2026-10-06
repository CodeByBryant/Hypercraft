// Phase 8: the Hollow Void (Realm C). Floating islands in black space under an aurora: no day,
// no sea, nothing below the islands but the fall. Data only (blocks, textures, items, recipes,
// biomes, mining rules) and the fixed geometry of the central island that the generator, the
// game (gates, spires, arrival) and the tests share. The generator is src/world/gen/VoidGen.ts.
//
// Access: a Stronghold on the Surface holds the Void Gate: ONE air cell with a gate frame on each
// of its six horizontal faces (+-x, +-z and +-w, so two of them are kata/ana of your slice). Each
// frame takes a Void Eye; when all six hold one, the cell lights and you can step in. A return
// gate stands on the arrival platform, so nobody is trapped.
//
// Outer islands: six Gateway Spires on the central island (one per horizontal direction) teleport
// to landing islands 1024 blocks out; every landing has a spire back. The central spires wake when
// the Void Sovereign falls.

import type { BiomeDef, BlockDef, Hex, ItemDef, LootTable, MiningDef, RecipeDef, TextureDef, TexturePattern } from './types';

// ---------------------------------------------------------------- fixed geometry

/** Surface height of the central island (its top block is at y = VOID_TOP). */
export const VOID_TOP = 64;
/** Horizontal radius (in x, z and w) of the central island, and of the Sovereign's arena. */
export const CENTRAL_R = 56;
export const ARENA_R = 26;
/** Distance of the six central Gateway Spires from the middle, and of the landing islands. */
export const SPIRE_R = 38;
export const LANDING_DIST = 1024;
/** Y of the surface of a landing island, and its radius. */
export const LANDING_TOP = 72;
export const LANDING_R = 30;
/** Islands further out than this from the middle are random (none closer than the gap). */
export const ISLAND_GAP = 300;

/** The six horizontal directions in (x, z, w). */
export const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const DIR_NAMES = ['+x', '-x', '+z', '-z', '+w', '-w'];

/** The block cell of the arrival platform's return gate (the cell the membrane fills). */
export const ARRIVAL_GATE: [number, number, number, number] = [-30, VOID_TOP + 1, -30, 0];
/** Where you stand on arrival (beside the return gate). */
export const ARRIVAL_POS: [number, number, number, number] = [ARRIVAL_GATE[0] + 3.5, VOID_TOP + 1, ARRIVAL_GATE[2] + 0.5, ARRIVAL_GATE[3] + 0.5];

/** Centre cell (x, z, w) of central spire k: the beam rises from y = VOID_TOP + 1. */
export function spireXZW(k: number): [number, number, number] {
  const d = DIRS[k]!;
  return [d[0] * SPIRE_R, d[1] * SPIRE_R, d[2] * SPIRE_R];
}
/** Centre (x, z, w) of landing island k. */
export function landingXZW(k: number): [number, number, number] {
  const d = DIRS[k]!;
  return [d[0] * LANDING_DIST, d[1] * LANDING_DIST, d[2] * LANDING_DIST];
}
/** Height of a beam above its plinth, in cells. */
export const BEAM_HEIGHT = 10;

export interface GatewayHit {
  /** Where it takes you: a standing position beside the other beam (never inside it). */
  to: [number, number, number, number];
  /** 'out' leaves the central island (dormant until the Sovereign falls), 'back' returns. */
  kind: 'out' | 'back';
  spire: number;
}

/** The gateway whose beam contains the cell (x, y, z, w), or null. Pure: the spires are fixed. */
export function gatewayAt(x: number, y: number, z: number, w: number): GatewayHit | null {
  for (let k = 0; k < 6; k++) {
    const s = spireXZW(k);
    if (x === s[0] && z === s[1] && w === s[2] && y >= VOID_TOP + 1 && y <= VOID_TOP + BEAM_HEIGHT) {
      const l = landingXZW(k);
      return { to: [l[0] + 3.5, LANDING_TOP + 1, l[1] + 0.5, l[2] + 0.5], kind: 'out', spire: k };
    }
    const l = landingXZW(k);
    if (x === l[0] && z === l[1] && w === l[2] && y >= LANDING_TOP + 1 && y <= LANDING_TOP + BEAM_HEIGHT) {
      return { to: [s[0] + 3.5, VOID_TOP + 1, s[1] + 0.5, s[2] + 0.5], kind: 'back', spire: k };
    }
  }
  return null;
}

// ---------------------------------------------------------------- textures and blocks

export const VOID_TEXTURES: TextureDef[] = [];
export const VOID_BLOCKS: BlockDef[] = [];

interface Opt extends Partial<BlockDef> {
  amount?: number;
  density?: number;
  alpha?: number;
}

function tex(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): string {
  const t: TextureDef = { name, pattern, colors };
  if (o.amount !== undefined) t.amount = o.amount;
  if (o.density !== undefined) t.density = o.density;
  if (o.alpha !== undefined) t.alpha = o.alpha;
  VOID_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  VOID_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1.5, ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  VOID_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

// The body of every island, and the surfaces of the six biomes (each its own block).
cube('void_rock', 'noise', ['#2a2640', '#211d34'], { amount: 0.1, hardness: 2.5 });
cube('void_turf', 'speckle', ['#4a4668', '#3d3a58', '#a89cdc'], { density: 0.08, hardness: 0.8 });
cube('whisper_moss', 'speckle', ['#5a3a78', '#3f2a58', '#e8a0ff'], { density: 0.1, hardness: 0.6 });
cube('crag_stone', 'cells', ['#3a4260', '#2c3350', '#6a78b0'], { hardness: 3 });
cube('spire_stone', 'bands', ['#1a1830', '#13122a', '#3a3560'], { amount: 0.04, hardness: 3.5 });
cube('glimmer_moss', 'speckle', ['#2f6a6a', '#255a5a', '#9dfff0'], { density: 0.12, emission: 6, hardness: 0.4 });
cube('shard_gravel', 'cells', ['#5a5878', '#3f3d58', '#a8a6d0'], { hardness: 1 });

// Starlight: crystal ore (light 12), its storage block and bricks.
cube('starlight_crystal', 'crystal', ['#9ad8ff', '#6ab0f0', '#f0fbff'], { emission: 12, hardness: 3.5, tags: ['ore', 'crystal'] });
cube('starlight_block', 'crystal', ['#8ac8ff', '#5a9ae0', '#e8f8ff'], { emission: 9, hardness: 3, tags: ['storage'] });
cube('starlight_bricks', 'bricks', ['#8aa8d8', '#7490c4', '#c8e0ff'], { hardness: 3, emission: 2 });

// Void Cities and the arena.
VOID_BLOCKS.push({ name: 'aurora_glass', render: 'translucent', solid: true, textures: { all: tex('aurora_glass', 'glass', ['#d8c8ff', '#ffffff'], { alpha: 0.16 }) }, tint: '#d8c8ff', alpha: 0.16, emission: 3, hardness: 0.4, tags: ['glass'] });
cube('sovereign_stone', 'metal', ['#1c1830', '#0e0a1c', '#6a4ac8'], { hardness: -1, emission: 3 });

// The gate: frames (empty and holding an eye), the lit cell, and the spire beams.
cube('void_gate_frame', 'cells', ['#1a1228', '#120c1e', '#6a3aa8'], { hardness: -1, tags: ['gate_frame'] });
cube('void_gate_frame_eye', 'crystal', ['#2a1a48', '#9affc8', '#e8fff0'], { hardness: -1, emission: 8, tags: ['gate_frame', 'gate_frame_eye'] });
tex('void_gate', 'portal', ['#3aff9a', '#b8ffe0', '#2a1a6a'], { alpha: 0.7 });
VOID_BLOCKS.push({ name: 'void_gate', displayName: 'Void Gate', render: 'translucent', solid: false, textures: { all: 'void_gate' }, tint: '#6affc0', alpha: 0.6, emission: 11, hardness: -1, tags: ['void_gate'] });
tex('gateway_beam', 'glow', ['#c8a0ff', '#8a5aff', '#ffffff'], { alpha: 0.55 });
VOID_BLOCKS.push({ name: 'gateway_beam', displayName: 'Gateway Beam', render: 'translucent', solid: false, textures: { all: 'gateway_beam' }, tint: '#b890ff', alpha: 0.5, emission: 14, hardness: -1, tags: ['gateway'] });

// Plants: two (at least) for each biome.
plant('dusk_lily', 'flower', ['#3a4a5a', '#3a4a5a', '#b8a0ff'], { emission: 2 });
plant('void_reed', 'plant', ['#5a5a80', '#44446a'], { density: 0.6 });
plant('whisper_vine', 'plant', ['#9a5ad0', '#7a3ab0'], { density: 0.75, emission: 3 });
plant('whisper_blossom', 'bud', ['#7a3ab0', '#7a3ab0', '#ff9af0'], { emission: 8 });
plant('starlight_cluster', 'crystal', ['#9ad8ff', '#6ab0f0', '#f0fbff'], { emission: 11 });
plant('prism_sprout', 'plant', ['#7ac8ff', '#5aa0e0'], { density: 0.5, emission: 4 });
plant('shade_fern', 'plant', ['#2a2a48', '#1e1e38'], { density: 0.6 });
plant('null_thistle', 'flower', ['#3a3a5a', '#3a3a5a', '#c0c0ff'], { emission: 3 });
plant('glimmer_cap', 'mushroom', ['#2f7a7a', '#9dfff0'], { emission: 8 });
plant('lumen_reed', 'plant', ['#5aeed0', '#3ac8b0'], { density: 0.6, emission: 5 });
plant('rift_weed', 'plant', ['#6a4a5a', '#503848'], { density: 0.55 });
plant('shard_blossom', 'bud', ['#8a5a7a', '#8a5a7a', '#ffb0d8'], { emission: 5 });

// ---------------------------------------------------------------- items, recipes, mining

export const VOID_ITEMS: ItemDef[] = [
  // Held, it points at the nearest Stronghold like an atlas; used on a gate frame it takes its place.
  { name: 'void_eye', displayName: 'Void Eye', icon: { shape: 'eye', colors: ['#9affc8', '#2a1a48', '#e8fff0'] }, use: 'void_eye', readout: 'atlas', atlas: ['stronghold'], group: 'tools', tags: ['glint'] },
  { name: 'whisper_fruit', displayName: 'Whisper Fruit', icon: { shape: 'berries', colors: ['#c87aff', '#7a3ab0', '#ffd0ff'] }, group: 'food' },
  { name: 'starlight_shard', displayName: 'Starlight Shard', icon: { shape: 'shard', colors: ['#9ad8ff', '#5a9ae0', '#f0fbff'] }, group: 'materials' },
];

export const VOID_RECIPES: RecipeDef[] = [
  // Phase dust from the Surface's phase mobs, hypercinder from the Ember Depths.
  { type: 'shapeless', ingredients: ['phase_dust', 'hypercinder'], result: 'void_eye' },
  { type: 'shaped', pattern: ['sss', 'sss', 'sss'], key: { s: 'starlight_shard' }, result: 'starlight_block' },
  { type: 'shapeless', ingredients: ['starlight_block'], result: 'starlight_shard', count: 9 },
  { type: 'shaped', pattern: ['ss', 'ss'], key: { s: 'starlight_shard' }, result: 'starlight_bricks', count: 4 },
];

const one = (item: string, count: [number, number] = [1, 1]) => [{ item, count }];

export const VOID_MINING: Record<string, MiningDef> = {
  void_rock: { tool: 'pickaxe', tier: 0 },
  crag_stone: { tool: 'pickaxe', tier: 0 },
  spire_stone: { tool: 'pickaxe', tier: 1 },
  shard_gravel: { tool: 'shovel' },
  void_turf: { tool: 'shovel' },
  whisper_moss: { tool: 'shovel' },
  glimmer_moss: { tool: 'shovel' },
  starlight_crystal: { tool: 'pickaxe', tier: 2, drops: one('starlight_shard', [2, 4]), xp: [3, 7] },
  starlight_block: { tool: 'pickaxe', tier: 1 },
  starlight_bricks: { tool: 'pickaxe', tier: 0 },
  starlight_cluster: { tool: 'pickaxe', tier: 0, drops: one('starlight_shard', [1, 2]) },
  aurora_glass: { drops: 'none' },
  whisper_vine: { drops: [{ item: 'whisper_fruit', chance: 0.12 }] },
  whisper_blossom: { drops: one('whisper_fruit', [1, 2]) },
  void_reed: { shears: true, drops: 'none' },
  prism_sprout: { shears: true, drops: [{ item: 'starlight_shard', chance: 0.08 }] },
  shade_fern: { shears: true, drops: 'none' },
  lumen_reed: { shears: true, drops: 'none' },
  rift_weed: { shears: true, drops: 'none' },
};

/** Food: Whisper Fruit teleports you (see Game.consume), always edible like a golden apple. */
export const VOID_FOOD: Record<string, { nutrition: number; saturation: number; always?: boolean }> = {
  whisper_fruit: { nutrition: 3, saturation: 2.4, always: true },
};

// ---------------------------------------------------------------- loot

const W = (lo: number, hi: number): [number, number] => [lo, hi];

/** Chest loot of the Stronghold (merged into LOOT_TABLES by loot.ts) and, later, the islands. */
export const VOID_LOOT: Record<string, LootTable> = {
  stronghold: {
    pools: [
      {
        rolls: W(3, 6),
        entries: [
          { item: 'iron_ingot', weight: 10, count: W(1, 5) },
          { item: 'bread', weight: 8, count: W(1, 4) },
          { item: 'torch', weight: 6, count: W(2, 8) },
          { item: 'phase_dust', weight: 6, count: W(1, 3) },
          { item: 'xp_bottle', weight: 4, count: W(1, 3) },
          { item: 'hypercinder', weight: 3, count: W(1, 2) },
          { item: 'golden_apple', weight: 3 },
          { item: 'void_eye', weight: 2 },
          { item: 'iron_pickaxe', weight: 2, wear: W(0.2, 0.8) },
        ],
      },
    ],
  },
  stronghold_library: {
    pools: [
      {
        rolls: W(3, 5),
        entries: [
          { item: 'paper', weight: 8, count: W(2, 6) },
          { item: 'book', weight: 7, enchant: 'random' },
          { item: 'book', weight: 3, enchant: W(15, 30) },
          { item: 'xp_bottle', weight: 3, count: W(1, 4) },
        ],
      },
    ],
  },
  stronghold_armory: {
    pools: [
      {
        rolls: W(2, 4),
        entries: [
          { item: 'iron_helmet', weight: 4, wear: W(0.1, 0.6) },
          { item: 'iron_chestplate', weight: 3, wear: W(0.1, 0.6) },
          { item: 'iron_leggings', weight: 3, wear: W(0.1, 0.6) },
          { item: 'iron_boots', weight: 4, wear: W(0.1, 0.6) },
          { item: 'iron_sword', weight: 3, wear: W(0.1, 0.6), enchant: W(5, 20) },
          { item: 'shield', weight: 2 },
          { item: 'bow', weight: 2, enchant: W(5, 20) },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- biomes

function biome(b: Omit<BiomeDef, 'kind' | 'heightBias' | 'heightScale' | 'frozenWater' | 'precipitation' | 'realm' | 'waterColor' | 'foliageColor' | 'subsurface' | 'underwater' | 'stone' | 'ceiling' | 'trees'>): BiomeDef {
  return {
    kind: 'land',
    heightBias: 0,
    heightScale: 1,
    frozenWater: false,
    precipitation: 'none',
    waterColor: '#2a1a4a',
    foliageColor: b.grassColor,
    realm: 'void',
    subsurface: 'void_rock',
    underwater: 'void_rock',
    stone: 'void_rock',
    ceiling: 'void_rock',
    trees: [],
    ...b,
  };
}

/** Climate points are [fertility, height, 0, 0]: two smooth noise fields pick the biome. */
export const VOID_BIOMES: BiomeDef[] = [
  biome({
    name: 'hollow_plateau',
    displayName: 'Hollow Plateau',
    climate: [0.5, 0.5, 0, 0],
    surface: 'void_turf',
    plants: [
      { block: 'dusk_lily', density: 0.02 },
      { block: 'void_reed', density: 0.05 },
    ],
    particles: [{ kind: 'mote', color: '#b8a0ff', rate: 5, glow: true }],
    skyColor: '#06030f',
    fogColor: '#10081e',
    grassColor: '#8a7cc8',
    hazards: ['the edge'],
  }),
  biome({
    name: 'whisper_gardens',
    displayName: 'Whisper Gardens',
    climate: [0.85, 0.35, 0, 0],
    surface: 'whisper_moss',
    plants: [
      { block: 'whisper_vine', density: 0.035 },
      { block: 'whisper_blossom', density: 0.01 },
    ],
    particles: [{ kind: 'firefly', color: '#ff9af0', rate: 9, glow: true }],
    skyColor: '#0a0414',
    fogColor: '#1a0a2c',
    grassColor: '#c87aff',
    hazards: ['whispering vines'],
  }),
  biome({
    name: 'starlight_crags',
    displayName: 'Starlight Crags',
    climate: [0.2, 0.85, 0, 0],
    surface: 'crag_stone',
    plants: [
      { block: 'starlight_cluster', density: 0.012 },
      { block: 'prism_sprout', density: 0.03 },
    ],
    particles: [{ kind: 'mote', color: '#9ad8ff', rate: 8, glow: true }],
    skyColor: '#040a18',
    fogColor: '#0a1a30',
    grassColor: '#6ab0f0',
    hazards: ['sharp drops'],
  }),
  biome({
    name: 'void_spires',
    displayName: 'Void Spires',
    climate: [0.15, 0.2, 0, 0],
    surface: 'spire_stone',
    plants: [
      { block: 'shade_fern', density: 0.04 },
      { block: 'null_thistle', density: 0.012 },
    ],
    particles: [{ kind: 'ash', color: '#3a3560', rate: 6 }],
    skyColor: '#03020a',
    fogColor: '#0a0818',
    grassColor: '#3a3560',
    hazards: ['void walkers'],
  }),
  biome({
    name: 'glimmer_meadows',
    displayName: 'Glimmer Meadows',
    climate: [0.7, 0.7, 0, 0],
    surface: 'glimmer_moss',
    plants: [
      { block: 'glimmer_cap', density: 0.03 },
      { block: 'lumen_reed', density: 0.06 },
    ],
    particles: [{ kind: 'spore', color: '#9dfff0', rate: 10, glow: true }],
    skyColor: '#04100f',
    fogColor: '#0a2220',
    grassColor: '#5aeed0',
    hazards: [],
  }),
  biome({
    name: 'shattered_reach',
    displayName: 'Shattered Reach',
    climate: [0.4, 0.05, 0, 0],
    surface: 'shard_gravel',
    plants: [
      { block: 'rift_weed', density: 0.04 },
      { block: 'shard_blossom', density: 0.01 },
    ],
    particles: [{ kind: 'dust', color: '#a8a6d0', rate: 7 }],
    skyColor: '#08040e',
    fogColor: '#160c1e',
    grassColor: '#a8a6d0',
    hazards: ['loose fragments'],
  }),
];
