// Phase 9: the Cloud Archipelago (Realm F). Floating islands on a sea of cloud under an open sky,
// low gravity (40% of the Surface: you jump three blocks and fall slowly) and wind currents that push
// you along W in layers (src/physics/wind.ts). The fastest way across it is a Wind Glider, which rides
// the current instead of fighting it. The generator is src/world/gen/CloudGen.ts; this file is data
// and the fixed shapes the generator, the game and the tests share.
//
// Access: a Sky Gate on a Surface peak holds a dormant rift. A Zephyr Feather (three feathers and a
// resonance crystal) wakes it; the rift leads to the same x, z, w in the Cloud Archipelago, in a gate
// of your own on the top of whatever lies there, and back.

import { gateCells as makeGateCells } from './abyss';
import type { ArchCell } from './mirror';
import { CLOUD_SPAWNS } from './cloudMobs';
import type { BiomeDef, BlockDef, Hex, ItemDef, LootTable, MiningDef, RecipeDef, TextureDef, TexturePattern } from './types';

export const SKY_GATE_STONE = 'sky_gate_stone';
export const SKY_GATE_LAMP = 'sky_gate_lamp';

/** The cells of a Sky Gate around a rift's base cell: the arch in sky-gate stone with lamps of light. */
export function skyGateCells(rift: string): ArchCell[] {
  return makeGateCells(rift, SKY_GATE_STONE, SKY_GATE_LAMP);
}

// ---------------------------------------------------------------- textures and blocks

export const CLOUD_TEXTURES: TextureDef[] = [];
export const CLOUD_BLOCKS: BlockDef[] = [];

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
  CLOUD_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  CLOUD_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1.2, ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  CLOUD_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

// The four ground blocks of each biome: surface, subsurface, rock, and the underside of the island.
// Every biome's own (the registry test wants three unique blocks and two unique plants each).
//
// cirrus_meadow: gentle white-green meadows, cotton.
cube('cirrus_turf', 'speckle', ['#9ad87a', '#82c466', '#f4fff0'], { density: 0.1, hardness: 0.5 });
cube('cloud_loam', 'noise', ['#c8b896', '#b8a886'], { amount: 0.08, hardness: 0.5 });
cube('cirrus_rock', 'cells', ['#d8e0ec', '#c4cedc', '#f4f8ff'], { hardness: 1.4 });
cube('cirrus_underside', 'noise', ['#e4eaf4', '#d2dae8'], { amount: 0.1, hardness: 1 });
// storm_reef: dark storm-cloud islands, static in the air.
cube('storm_crust', 'cells', ['#4a5266', '#3e465a', '#8a94b0'], { hardness: 1.2 });
cube('thunder_silt', 'noise', ['#5a6278', '#4e566c'], { amount: 0.08, hardness: 0.6 });
cube('storm_rock', 'bands', ['#343c4e', '#2a3242', '#5a6684'], { amount: 0.06, hardness: 1.8 });
cube('storm_underside', 'noise', ['#2c3242', '#242a38'], { amount: 0.1, hardness: 1.2, emission: 1 });
// aurora_ridge: high ridged islands under green light, snow and ice.
cube('aurora_snow', 'speckle', ['#e8fff4', '#d4f0e4', '#ffffff'], { density: 0.1, hardness: 0.4, emission: 1 });
cube('ridge_ice', 'cells', ['#a8e0e8', '#94d0dc', '#e8ffff'], { hardness: 0.8, emission: 2 });
cube('ridge_stone', 'bands', ['#7a9ab0', '#6a8aa0', '#a8c8dc'], { amount: 0.05, hardness: 1.8 });
cube('ridge_glass', 'crystal', ['#8af0c8', '#6ad8b0', '#e8fff8'], { hardness: 1, emission: 6 });
// zephyr_terraces: windswept terraces of pale sand and clay.
cube('zephyr_sand', 'speckle', ['#f0e0b8', '#e0cea0', '#fffaf0'], { density: 0.1, hardness: 0.5 });
cube('terrace_clay', 'bands', ['#e0a888', '#d09878', '#f4c8a8'], { amount: 0.06, hardness: 0.7 });
cube('terrace_stone', 'cells', ['#c8a888', '#b89878', '#e0c8a8'], { hardness: 1.6 });
cube('terrace_underside', 'noise', ['#b08868', '#a07858'], { amount: 0.1, hardness: 1.2 });
// sunbreak_gardens: warm, flowering islands.
cube('sunbreak_grass', 'speckle', ['#c8e860', '#b0d448', '#fffff0'], { density: 0.1, hardness: 0.5 });
cube('garden_loam', 'noise', ['#a88860', '#987850'], { amount: 0.08, hardness: 0.5 });
cube('garden_stone', 'cells', ['#e8d8b0', '#d8c8a0', '#fffae8'], { hardness: 1.4 });
cube('garden_underside', 'noise', ['#c8b890', '#b8a880'], { amount: 0.1, hardness: 1 });
// nimbus_sea: the sea of cloud itself, soft and walkable.
cube('nimbus_cloud', 'speckle', ['#fafcff', '#e8eef8', '#ffffff'], { density: 0.08, hardness: 0.25 });
cube('nimbus_mist', 'noise', ['#dce6f4', '#ccd8ea'], { amount: 0.06, hardness: 0.3 });
cube('nimbus_core', 'cells', ['#b8c8e0', '#a8b8d4', '#e0eaf8'], { hardness: 0.6 });
cube('nimbus_underside', 'noise', ['#c4d0e4', '#b4c0d8'], { amount: 0.08, hardness: 0.4 });

// The Sky Gate and its rift.
cube(SKY_GATE_STONE, 'bricks', ['#d8e4f4', '#c4d2e8', '#f4f8ff'], { hardness: -1 });
cube(SKY_GATE_LAMP, 'crystal', ['#fff4c8', '#ffe08a', '#ffffff'], { hardness: -1, emission: 13 });
tex('dormant_cloud_rift', 'cells', ['#8a96b0', '#7a86a0', '#dce6f8'], {});
CLOUD_BLOCKS.push({ name: 'dormant_cloud_rift', displayName: 'Dormant Cloud Rift', render: 'translucent', solid: false, textures: { all: 'dormant_cloud_rift' }, tint: '#aab8d4', alpha: 0.5, emission: 3, hardness: -1, tags: ['rift_dormant'] });
tex('cloud_rift', 'portal', ['#fff4c8', '#ffffff', '#7ab8ff'], { alpha: 0.7 });
CLOUD_BLOCKS.push({ name: 'cloud_rift', displayName: 'Cloud Rift', render: 'translucent', solid: false, textures: { all: 'cloud_rift' }, tint: '#fff0c0', alpha: 0.6, emission: 12, hardness: -1, tags: ['rift'] });

// Plants: two (at least) for each biome. Cirrus cotton is what a Wind Glider is made of.
plant('cirrus_cotton', 'bud', ['#9ad87a', '#9ad87a', '#ffffff'], { emission: 1 });
plant('sky_clover', 'plant', ['#8ad06a', '#6ab852'], { density: 0.65 });
plant('static_thistle', 'flower', ['#4a5266', '#4a5266', '#fff08a'], { emission: 5 });
plant('reef_spike', 'crystal', ['#5a6684', '#3e465a', '#c8d4f0'], { emission: 3 });
plant('aurora_bloom', 'flower', ['#7a9ab0', '#7a9ab0', '#8affd0'], { emission: 6 });
plant('frost_wisp', 'plant', ['#c8f0f0', '#a8e0e8'], { density: 0.55, emission: 2 });
plant('wind_reed', 'plant', ['#e0cea0', '#c8b484'], { density: 0.6 });
plant('terrace_flower', 'flower', ['#c8a888', '#c8a888', '#ff9a6a'], { emission: 2 });
plant('sunbreak_rose', 'flower', ['#b0d448', '#b0d448', '#ff6a8a'], { emission: 3 });
plant('honey_bloom', 'bud', ['#c8e860', '#c8e860', '#ffd24a'], { emission: 3 });
plant('mist_lily', 'flower', ['#dce6f4', '#dce6f4', '#ffffff'], { emission: 2 });
plant('drift_reed', 'plant', ['#e8eef8', '#ccd8ea'], { density: 0.5 });

// ---------------------------------------------------------------- items, recipes, mining

export const CLOUD_ITEMS: ItemDef[] = [
  // Fuel for a Sky Gate (held up to a dormant rift): three feathers and a resonance crystal.
  { name: 'zephyr_feather', displayName: 'Zephyr Feather', icon: { shape: 'feather', colors: ['#e8f4ff', '#9ac8f0', '#ffffff'] }, use: 'rift_fuel', group: 'materials', tags: ['glint'] },
  // Picked from cirrus cotton: the cloth of a glider.
  { name: 'cloud_cotton', displayName: 'Cloud Cotton', icon: { shape: 'dust', colors: ['#ffffff', '#c8d8ec', '#f0f8ff'] }, group: 'materials' },
  // What the mobs of the Archipelago leave: the Thunder Hawk's feather, the Wind Sprite's dust, the cloth woven from
  // cotton (cloud armour) and the bolt a Storm Kite spits (an arrow's picture, not an item to find).
  { name: 'storm_feather', displayName: 'Storm Feather', icon: { shape: 'feather', colors: ['#fff08a', '#5a6684', '#ffffff'] }, group: 'materials', tags: ['glint'] },
  { name: 'gale_dust', displayName: 'Gale Dust', icon: { shape: 'dust', colors: ['#bcd8f8', '#7ab0e8', '#ffffff'] }, group: 'materials' },
  { name: 'cloud_silk', displayName: 'Cloud Silk', icon: { shape: 'ingot', colors: ['#f4f8ff', '#a8c8ec', '#ffffff'] }, group: 'materials' },
  { name: 'static_bolt', displayName: 'Static Bolt', icon: { shape: 'shard', colors: ['#fff08a', '#c8a020', '#ffffff'] }, group: 'materials' },
  // The Wind Glider: worn in the chest slot like wings (fall, press jump), but it rides the wind currents
  // instead of fighting them: in a current along W it carries you at full strength.
  { name: 'wind_glider', displayName: 'Wind Glider', maxStack: 1, durability: 600, enchantability: 12, armor: { slot: 'chest', points: 0, toughness: 0, repair: 'cloud_cotton' }, icon: { shape: 'glider', colors: ['#f4f8ff', '#8a6a4a', '#7ab8ff'] }, group: 'combat', tags: ['armor', 'armor_chest', 'wings', 'glider'] },
];

export const CLOUD_RECIPES: RecipeDef[] = [
  { type: 'shapeless', ingredients: ['feather', 'feather', 'feather', 'resonance_crystal'], result: 'zephyr_feather' },
  // Cloth of cotton on a frame of feather and string.
  { type: 'shaped', pattern: ['cc', 'cc'], key: { c: 'cloud_cotton' }, result: 'cloud_silk' },
  { type: 'shaped', pattern: ['ccc', 'cfc', 's s'], key: { c: 'cloud_cotton', f: 'feather', s: 'string' }, result: 'wind_glider' },
];

const one = (item: string, count: [number, number] = [1, 1]) => [{ item, count }];

export const CLOUD_MINING: Record<string, MiningDef> = {
  cirrus_turf: { tool: 'shovel' },
  cloud_loam: { tool: 'shovel' },
  cirrus_rock: { tool: 'pickaxe', tier: 0 },
  cirrus_underside: { tool: 'pickaxe', tier: 0 },
  storm_crust: { tool: 'pickaxe', tier: 0 },
  thunder_silt: { tool: 'shovel' },
  storm_rock: { tool: 'pickaxe', tier: 0 },
  storm_underside: { tool: 'pickaxe', tier: 0 },
  aurora_snow: { tool: 'shovel' },
  ridge_ice: { tool: 'pickaxe', tier: 0 },
  ridge_stone: { tool: 'pickaxe', tier: 0 },
  ridge_glass: { tool: 'pickaxe', tier: 0, drops: 'none' },
  zephyr_sand: { tool: 'shovel' },
  terrace_clay: { tool: 'shovel' },
  terrace_stone: { tool: 'pickaxe', tier: 0 },
  terrace_underside: { tool: 'pickaxe', tier: 0 },
  sunbreak_grass: { tool: 'shovel' },
  garden_loam: { tool: 'shovel' },
  garden_stone: { tool: 'pickaxe', tier: 0 },
  garden_underside: { tool: 'pickaxe', tier: 0 },
  nimbus_cloud: { tool: 'shovel' },
  nimbus_mist: { tool: 'shovel' },
  nimbus_core: { tool: 'shovel' },
  nimbus_underside: { tool: 'shovel' },
  cirrus_cotton: { drops: one('cloud_cotton', [1, 2]) },
  sky_clover: { shears: true, drops: 'none' },
  static_thistle: { drops: 'none' },
  reef_spike: { tool: 'pickaxe', tier: 0, drops: 'none' },
  aurora_bloom: { drops: 'none' },
  frost_wisp: { shears: true, drops: 'none' },
  wind_reed: { shears: true, drops: 'none' },
  terrace_flower: { drops: 'none' },
  sunbreak_rose: { drops: 'none' },
  honey_bloom: { drops: 'none' },
  mist_lily: { drops: 'none' },
  drift_reed: { shears: true, drops: 'none' },
};

// ---------------------------------------------------------------- biomes

/** What the generator does per biome (CloudGen reads this by biome name). */
export interface CloudStyle {
  /** Island biome: the lowest and highest island altitude (y) it is found at. */
  y?: [number, number];
}

function biome(b: Pick<BiomeDef, 'name' | 'displayName' | 'kind' | 'surface' | 'subsurface' | 'underwater' | 'stone' | 'ceiling' | 'plants' | 'skyColor' | 'fogColor' | 'grassColor' | 'foliageColor' | 'waterColor' | 'particles' | 'hazards' | 'precipitation'>): BiomeDef {
  return { climate: [0.5, 0.5, 0, 0], trees: [], frozenWater: false, heightBias: 0, heightScale: 1, realm: 'cloud', ...b };
}

/**
 * The six biomes: five island biomes (picked per island from noise at its centre, and by altitude: the
 * Aurora Ridge only on the highest islands) and the Nimbus Sea, the cloud floor between and under them.
 */
export const CLOUD_BIOMES: BiomeDef[] = [
  biome({
    name: 'cirrus_meadow', displayName: 'Cirrus Meadow', kind: 'land',
    surface: 'cirrus_turf', subsurface: 'cloud_loam', underwater: 'nimbus_mist', stone: 'cirrus_rock', ceiling: 'cirrus_underside',
    plants: [{ block: 'cirrus_cotton', density: 0.05 }, { block: 'sky_clover', density: 0.14 }],
    skyColor: '#8ec8ff', fogColor: '#dceaff', grassColor: '#9ad87a', foliageColor: '#82c466', waterColor: '#a8d0f0',
    particles: [{ kind: 'mote', color: '#ffffff', rate: 5, glow: true }], hazards: ['strong crosswinds at the rim'], precipitation: 'rain',
  }),
  biome({
    name: 'storm_reef', displayName: 'Storm Reef', kind: 'land',
    surface: 'storm_crust', subsurface: 'thunder_silt', underwater: 'nimbus_mist', stone: 'storm_rock', ceiling: 'storm_underside',
    plants: [{ block: 'static_thistle', density: 0.04 }, { block: 'reef_spike', density: 0.05 }],
    skyColor: '#5a6684', fogColor: '#8a94b0', grassColor: '#6a7490', foliageColor: '#5a6684', waterColor: '#6a7ea0',
    particles: [{ kind: 'ash', color: '#a8b4d0', rate: 6 }], hazards: ['lightning', 'static shocks'], precipitation: 'rain',
  }),
  biome({
    name: 'aurora_ridge', displayName: 'Aurora Ridge', kind: 'land',
    surface: 'aurora_snow', subsurface: 'ridge_ice', underwater: 'nimbus_mist', stone: 'ridge_stone', ceiling: 'ridge_glass',
    plants: [{ block: 'aurora_bloom', density: 0.04 }, { block: 'frost_wisp', density: 0.1 }],
    skyColor: '#6ab8e0', fogColor: '#c0f0e8', grassColor: '#a8f0d0', foliageColor: '#8ad8c0', waterColor: '#8ad0e0',
    particles: [{ kind: 'snow', color: '#e8fff8', rate: 8 }], hazards: ['thin air at altitude'], precipitation: 'snow',
  }),
  biome({
    name: 'zephyr_terraces', displayName: 'Zephyr Terraces', kind: 'land',
    surface: 'zephyr_sand', subsurface: 'terrace_clay', underwater: 'nimbus_mist', stone: 'terrace_stone', ceiling: 'terrace_underside',
    plants: [{ block: 'wind_reed', density: 0.12 }, { block: 'terrace_flower', density: 0.03 }],
    skyColor: '#a0d0f4', fogColor: '#f0e8d8', grassColor: '#e0cea0', foliageColor: '#c8b484', waterColor: '#b8d4ec',
    particles: [{ kind: 'dust', color: '#f0e0b8', rate: 8 }], hazards: ['gusts that throw you off the terraces'], precipitation: 'none',
  }),
  biome({
    name: 'sunbreak_gardens', displayName: 'Sunbreak Gardens', kind: 'land',
    surface: 'sunbreak_grass', subsurface: 'garden_loam', underwater: 'nimbus_mist', stone: 'garden_stone', ceiling: 'garden_underside',
    plants: [{ block: 'sunbreak_rose', density: 0.05 }, { block: 'honey_bloom', density: 0.06 }],
    skyColor: '#98d0ff', fogColor: '#fff4d8', grassColor: '#c8e860', foliageColor: '#b0d448', waterColor: '#b0d8f4',
    particles: [{ kind: 'petal', color: '#ffb0c8', rate: 5 }], hazards: [], precipitation: 'rain',
  }),
  biome({
    name: 'nimbus_sea', displayName: 'Nimbus Sea', kind: 'ocean',
    surface: 'nimbus_cloud', subsurface: 'nimbus_mist', underwater: 'nimbus_mist', stone: 'nimbus_core', ceiling: 'nimbus_underside',
    plants: [{ block: 'mist_lily', density: 0.02 }, { block: 'drift_reed', density: 0.05 }],
    skyColor: '#a8d4ff', fogColor: '#eef4ff', grassColor: '#f0f6ff', foliageColor: '#dce6f4', waterColor: '#ccdcf0',
    particles: [{ kind: 'mote', color: '#ffffff', rate: 4, glow: true }], hazards: ['a long fall if you dig through'], precipitation: 'rain',
  }),
];

export const CLOUD_STYLE: Record<string, CloudStyle> = {
  cirrus_meadow: {},
  storm_reef: {},
  aurora_ridge: { y: [98, 128] },
  zephyr_terraces: {},
  sunbreak_gardens: {},
  nimbus_sea: {},
};

// ---------------------------------------------------------------- loot

export const CLOUD_LOOT: Record<string, LootTable> = {};

for (const b of CLOUD_BIOMES) {
  b.structures = [];
  b.mobs = CLOUD_SPAWNS[b.name] ?? {};
}
