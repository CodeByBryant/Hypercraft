// Phase 9: the Crystal Abyss (Realm E). A sunless geode world under everything: caverns lit only
// by the crystals that grow in them, hyper-geodes whose hollows breathe as you step along W, and
// crystal walls cut obliquely through the dark (they SHIFT as you move kata and ana: a wall that
// stands in front of you in one slice stands beside you in the next). The generator is
// src/world/gen/AbyssGen.ts; this file is data and the fixed shapes the generator, the game and the
// tests share.
//
// Light is the game here: the ambient glow is almost nothing, so torches, lanterns and the
// luminous biomes decide where you can see.
//
// Access: a Geode Gate in a deep geode on the Surface holds a dormant rift. A Resonance Crystal
// (grown on the Surface in crystal geodes, and everywhere in the Abyss) is its fuel; stepping into
// the awake rift leads to the Abyss at the same x, z, w (and about the same depth), in a gate of
// your own that leads home. Prism Shards (the Abyss ore) make the Prism tier.

import type { BiomeDef, BlockDef, Hex, ItemDef, LootTable, MiningDef, RecipeDef, TextureDef, TexturePattern } from './types';
import type { ArchCell } from './mirror';
import { ABYSS_SPAWNS } from './abyssMobs';

// ---------------------------------------------------------------- the gate

/** The block names of a Geode Gate (a rift arch in the stone of the deep). */
export const GATE_STONE = 'gate_stone';
export const GATE_LAMP = 'gate_crystal';

// ---------------------------------------------------------------- textures and blocks

export const ABYSS_TEXTURES: TextureDef[] = [];
export const ABYSS_BLOCKS: BlockDef[] = [];

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
  ABYSS_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  ABYSS_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1.5, ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  ABYSS_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

/** A translucent solid (crystal walls, pillars). */
function pane(name: string, pattern: TexturePattern, colors: Hex[], tint: Hex, alpha: number, o: Opt = {}): void {
  tex(name, pattern, colors, { alpha });
  ABYSS_BLOCKS.push({ name, render: 'translucent', solid: true, textures: { all: name }, tint, alpha, hardness: 1.5, ...strip(o) });
}

// The four ground blocks of each biome: surface, subsurface, rock just under it, and the ceiling
// (the underside of every mass). Every biome's own; the registry test wants three unique blocks and
// two unique plants each.
//
// prism_forest: luminous crystal forests, violet moss, tall prism pillars.
cube('lumen_moss', 'speckle', ['#6a4aa8', '#583a94', '#d8b8ff'], { density: 0.1, hardness: 0.7, emission: 3 });
cube('crystal_loam', 'noise', ['#3e2a68', '#34235a'], { amount: 0.1, hardness: 0.6 });
cube('forest_geode', 'cells', ['#4a3a7a', '#3c2e6a', '#9a80e0'], { hardness: 2.2 });
cube('prism_crust', 'crystal', ['#7a5ac8', '#6246ac', '#e8d8ff'], { hardness: 1.8, emission: 4 });
// geode_hollows: the floors inside great geodes, calcite and agate.
cube('geode_floor', 'bands', ['#c8b8e8', '#b4a2d6', '#f0e8ff'], { amount: 0.06, hardness: 1.2, emission: 2 });
cube('calcite_gravel', 'speckle', ['#d8d0e8', '#c4bad8', '#ffffff'], { density: 0.12, hardness: 0.6 });
cube('agate_rock', 'bands', ['#8a5aa8', '#7a4a98', '#d89ae8'], { amount: 0.08, hardness: 2.4 });
cube('hollow_crust', 'crystal', ['#a890d8', '#9078c4', '#f4eaff'], { hardness: 1.6, emission: 3 });
// resonance_caverns: caverns that answer back, humming stone.
cube('resonant_stone', 'cells', ['#4a6aa8', '#3c5a98', '#a8c8ff'], { hardness: 2, emission: 1 });
cube('tuned_gravel', 'speckle', ['#3a5288', '#2e447a', '#88a8e8'], { density: 0.1, hardness: 0.6 });
cube('sounding_rock', 'bands', ['#2e3e6c', '#26345e', '#5a78c0'], { amount: 0.06, hardness: 2.4 });
cube('chime_crust', 'crystal', ['#5a82d0', '#4a70c0', '#d8eaff'], { hardness: 1.8, emission: 4 });
// lumen_grotto: bioluminescent grottoes, glowcap soil.
cube('glowcap_soil', 'speckle', ['#2a7a6a', '#206a5a', '#a8ffe0'], { density: 0.12, hardness: 0.6, emission: 3 });
cube('lumen_clay', 'noise', ['#1e5a52', '#184c46'], { amount: 0.1, hardness: 0.6 });
cube('grotto_rock', 'cells', ['#1e4a52', '#183e46', '#5ac8b8'], { hardness: 2.2 });
cube('lumen_silt', 'noise', ['#2a6a60', '#225a52'], { amount: 0.08, hardness: 0.5 });
// shard_barrens: broken ground, dark and jagged.
cube('barren_gravel', 'speckle', ['#5a4a6c', '#4a3c5c', '#c8a8e8'], { density: 0.1, hardness: 0.7 });
cube('splinter_rubble', 'cells', ['#443858', '#382e4a', '#7a6498'], { hardness: 1 });
cube('barren_rock', 'noise', ['#2e2640', '#261f36'], { amount: 0.1, hardness: 2.5 });
cube('splinter_crust', 'crystal', ['#6a4a98', '#563a84', '#d0a8ff'], { hardness: 2, emission: 3 });
// echo_lakes: the dark lakes, and their beds.
cube('pearl_sand', 'speckle', ['#a8c8e8', '#94b4d8', '#f0faff'], { density: 0.1, hardness: 0.5, emission: 2 });
cube('lake_silt', 'noise', ['#5a78a0', '#4c6a92'], { amount: 0.08, hardness: 0.5 });
cube('lakebed_rock', 'cells', ['#2e4a6c', '#263e5e', '#5a88c0'], { hardness: 2.2 });
cube('lake_crust', 'crystal', ['#5a98c8', '#4a88b8', '#d0f0ff'], { hardness: 1.8, emission: 3 });
// The rock of the deep, under everything.
cube('abyss_rock', 'noise', ['#1c1830', '#161228'], { amount: 0.1, hardness: 3 });

// Crystals: the Abyss ore (prism shards), their block, the walls and the pillars.
tex('prism_ore', 'ore', ['#2e2640', '#261f36', '#d8b0ff'], { density: 0.2 });
ABYSS_BLOCKS.push({ name: 'prism_ore', displayName: 'Prism Crystal', render: 'opaque', solid: true, textures: { all: 'prism_ore' }, hardness: 5, emission: 8, tags: ['ore'] });
cube('prism_block', 'metal', ['#c8a8ff', '#a888e8', '#f4eaff'], { hardness: 5, emission: 6, tags: ['storage'] });
cube('resonance_block', 'crystal', ['#7ac8ff', '#5aa8f0', '#f0fbff'], { hardness: 3, emission: 9, tags: ['storage'] });
// The geode: husk, calcite and the luminous lining.
cube('geode_husk', 'noise', ['#3a3548', '#2e293c'], { amount: 0.08, hardness: 1.5 });
cube('calcite_layer', 'bands', ['#e0d8f0', '#cec4e2', '#ffffff'], { amount: 0.05, hardness: 1.2 });
cube('geode_lining', 'crystal', ['#b890f0', '#9c74e0', '#f4e8ff'], { hardness: 1.5, emission: 10 });
// Crystal pillars (the forests) and the shifting walls.
pane('prism_glass', 'crystal', ['#c8a8ff', '#a888f0', '#ffffff'], '#c8b0ff', 0.7, { emission: 10 });
pane('shifting_crystal', 'glass', ['#a8d8ff', '#88b8f0', '#ffffff'], '#a8d0ff', 0.55, { emission: 6, hardness: 2 });

// The Geode Gate and its rift.
cube(GATE_STONE, 'bricks', ['#3a2e5a', '#30264c', '#6a58a0'], { hardness: -1, emission: 2 });
cube(GATE_LAMP, 'crystal', ['#b8d8ff', '#88b8f0', '#ffffff'], { hardness: -1, emission: 13 });
tex('dormant_abyss_rift', 'cells', ['#1e1a38', '#141228', '#5a4a98'], {});
ABYSS_BLOCKS.push({ name: 'dormant_abyss_rift', displayName: 'Dormant Abyss Rift', render: 'translucent', solid: false, textures: { all: 'dormant_abyss_rift' }, tint: '#3a2e68', alpha: 0.5, emission: 3, hardness: -1, tags: ['rift_dormant'] });
tex('abyss_rift', 'portal', ['#b8a0ff', '#ffffff', '#5a3ac8'], { alpha: 0.7 });
ABYSS_BLOCKS.push({ name: 'abyss_rift', displayName: 'Abyss Rift', render: 'translucent', solid: false, textures: { all: 'abyss_rift' }, tint: '#c0a8ff', alpha: 0.6, emission: 12, hardness: -1, tags: ['rift'] });

// Plants: two (at least) for each biome. The Resonance Cluster is the fuel.
plant('prism_bloom', 'flower', ['#4a3a7a', '#4a3a7a', '#f0b8ff'], { emission: 6 });
plant('lumen_fern', 'plant', ['#8a6ad8', '#6a4ab8'], { density: 0.65, emission: 3 });
plant('geode_bud', 'bud', ['#a890d8', '#a890d8', '#f8f0ff'], { emission: 7 });
plant('calcite_spike', 'crystal', ['#e0d8f0', '#c0b4dc', '#ffffff'], { emission: 4 });
plant('resonance_cluster', 'crystal', ['#7ac8ff', '#4a98e8', '#f0fbff'], { emission: 11 });
plant('chime_reed', 'plant', ['#5a82d0', '#4668b0'], { density: 0.6, emission: 2 });
plant('lumen_cap', 'mushroom', ['#2a7a6a', '#a8ffe0'], { emission: 9 });
plant('grotto_sprout', 'plant', ['#3aa890', '#2a8870'], { density: 0.6, emission: 3 });
plant('shard_thorn', 'crystal', ['#6a4a98', '#4a3278', '#e0c0ff'], { emission: 5 });
plant('glint_weed', 'plant', ['#7a6498', '#5a4678'], { density: 0.55 });
plant('glow_kelp', 'plant', ['#5ac8d8', '#3aa8c0'], { density: 0.7, emission: 4 });
plant('lake_coral', 'crystal', ['#88c8f0', '#5aa0d8', '#ffffff'], { emission: 6 });

// ---------------------------------------------------------------- items, recipes, mining

export const ABYSS_ITEMS: ItemDef[] = [
  // The Abyss ore, and what it smelts to (the Prism tier).
  { name: 'prism_shard', displayName: 'Prism Shard', icon: { shape: 'prism', colors: ['#e0c8ff', '#a888e8', '#ffffff'] }, group: 'materials' },
  { name: 'prism_ingot', displayName: 'Prism Ingot', icon: { shape: 'ingot', colors: ['#d8b8ff', '#9a78e0', '#ffffff'] }, group: 'materials' },
  // Grown on the Surface in crystal geodes, and in every geode of the Abyss: the Abyss gate's fuel
  // (held up to a dormant rift) and what attunes a compass to find the gates.
  { name: 'resonance_crystal', displayName: 'Resonance Crystal', icon: { shape: 'shard', colors: ['#a8e0ff', '#5aa0e8', '#ffffff'] }, use: 'rift_fuel', group: 'materials', tags: ['glint'] },
  // The Resonance Titan's heart: proof, and the right to wear what the Cathedral keeps.
  { name: 'resonance_heart', displayName: 'Resonance Heart', maxStack: 1, icon: { shape: 'gem', colors: ['#a8e0ff', '#3a6ad8', '#ffffff'] }, group: 'combat', tags: ['glint'] },
  // A Slicer Compass tuned by resonance: its arrow points to the nearest Geode Gate.
  { name: 'resonance_compass', displayName: 'Resonance Compass', maxStack: 1, icon: { shape: 'compass', colors: ['#5aa0e8', '#2a4a98', '#e8f8ff'] }, readout: 'atlas', atlas: ['geode_gate'], group: 'tools', tags: ['glint'] },
];

export const ABYSS_RECIPES: RecipeDef[] = [
  { type: 'smelting', input: 'prism_shard', result: 'prism_ingot', time: 10, xp: 2, furnaces: ['furnace', 'blast_furnace'] },
  { type: 'shaped', pattern: ['iii', 'iii', 'iii'], key: { i: 'prism_ingot' }, result: 'prism_block' },
  { type: 'shapeless', ingredients: ['prism_block'], result: 'prism_ingot', count: 9 },
  { type: 'shaped', pattern: ['ccc', 'ccc', 'ccc'], key: { c: 'resonance_crystal' }, result: 'resonance_block' },
  { type: 'shapeless', ingredients: ['resonance_block'], result: 'resonance_crystal', count: 9 },
  { type: 'shapeless', ingredients: ['slicer_compass', 'resonance_crystal', 'resonance_crystal', 'resonance_crystal'], result: 'resonance_compass' },
];

const one = (item: string, count: [number, number] = [1, 1]) => [{ item, count }];

export const ABYSS_MINING: Record<string, MiningDef> = {
  lumen_moss: { tool: 'shovel' },
  crystal_loam: { tool: 'shovel' },
  forest_geode: { tool: 'pickaxe', tier: 0 },
  prism_crust: { tool: 'pickaxe', tier: 0 },
  geode_floor: { tool: 'pickaxe', tier: 0 },
  calcite_gravel: { tool: 'shovel' },
  agate_rock: { tool: 'pickaxe', tier: 0 },
  hollow_crust: { tool: 'pickaxe', tier: 0 },
  resonant_stone: { tool: 'pickaxe', tier: 0 },
  tuned_gravel: { tool: 'shovel' },
  sounding_rock: { tool: 'pickaxe', tier: 0 },
  chime_crust: { tool: 'pickaxe', tier: 0 },
  glowcap_soil: { tool: 'shovel' },
  lumen_clay: { tool: 'shovel' },
  grotto_rock: { tool: 'pickaxe', tier: 0 },
  lumen_silt: { tool: 'shovel' },
  barren_gravel: { tool: 'shovel' },
  splinter_rubble: { tool: 'pickaxe', tier: 0 },
  barren_rock: { tool: 'pickaxe', tier: 0 },
  splinter_crust: { tool: 'pickaxe', tier: 0 },
  pearl_sand: { tool: 'shovel' },
  lake_silt: { tool: 'shovel' },
  lakebed_rock: { tool: 'pickaxe', tier: 0 },
  lake_crust: { tool: 'pickaxe', tier: 0 },
  abyss_rock: { tool: 'pickaxe', tier: 1 },
  prism_ore: { tool: 'pickaxe', tier: 3, drops: one('prism_shard', [1, 2]), xp: [3, 7] },
  prism_block: { tool: 'pickaxe', tier: 3 },
  resonance_block: { tool: 'pickaxe', tier: 1 },
  geode_husk: { tool: 'pickaxe', tier: 0 },
  calcite_layer: { tool: 'pickaxe', tier: 0 },
  geode_lining: { tool: 'pickaxe', tier: 0, drops: 'none' },
  prism_glass: { tool: 'pickaxe', tier: 0, drops: 'none' },
  shifting_crystal: { tool: 'pickaxe', tier: 1, drops: 'none' },
  resonance_cluster: { tool: 'pickaxe', tier: 0, drops: one('resonance_crystal', [1, 3]) },
  // The Surface's crystal geodes grow the first ones (the Abyss's fuel has to come from somewhere).
  sky_crystal_cluster: { tool: 'pickaxe', tier: 0, drops: one('resonance_crystal', [1, 2]) },
  prism_bloom: { drops: 'none' },
  lumen_fern: { shears: true, drops: 'none' },
  geode_bud: { drops: 'none' },
  calcite_spike: { tool: 'pickaxe', tier: 0, drops: 'none' },
  chime_reed: { shears: true, drops: 'none' },
  lumen_cap: { drops: 'none' },
  grotto_sprout: { shears: true, drops: 'none' },
  shard_thorn: { tool: 'pickaxe', tier: 0, drops: 'none' },
  glint_weed: { shears: true, drops: 'none' },
  glow_kelp: { shears: true, drops: 'none' },
  lake_coral: { tool: 'pickaxe', tier: 0, drops: 'none' },
};

// ---------------------------------------------------------------- the gate

/**
 * The cells of a Geode Gate around a rift's base cell (a, y, b, c = x, y, z, w): the same
 * arch as the Silver Arch (a plinth, four pillars, a roof, two rift cells) in gate stone, with
 * the corner lamps in gate crystal.
 */
export function gateCells(rift: string): ArchCell[] {
  const out: ArchCell[] = [];
  for (let c = -1; c <= 1; c++)
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) out.push({ d: [a, -1, b, c], block: GATE_STONE });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) for (let y = 0; y <= 2; y++) out.push({ d: [a, y, b, 0], block: y === 2 ? GATE_LAMP : GATE_STONE });
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) out.push({ d: [a, 3, b, 0], block: GATE_STONE });
  out.push({ d: [0, 0, 0, 0], block: rift }, { d: [0, 1, 0, 0], block: rift });
  return out;
}

// ---------------------------------------------------------------- biomes

/** What the generator does per biome (AbyssGen reads this by biome name). */
export interface AbyssStyle {
  /** Crystal pillars (prism glass) per 1000 floor cells: the luminous forests. */
  pillars: number;
  /** Hanging growth under overhangs. */
  hanging: [string, number][];
}

function biome(b: Pick<BiomeDef, 'name' | 'displayName' | 'kind' | 'surface' | 'subsurface' | 'underwater' | 'stone' | 'ceiling' | 'plants' | 'skyColor' | 'fogColor' | 'grassColor' | 'foliageColor' | 'waterColor' | 'particles' | 'hazards'>): BiomeDef {
  return { climate: [0.5, 0.5, 0, 0], trees: [], frozenWater: false, precipitation: 'none', heightBias: 0, heightScale: 1, realm: 'abyss', ...b };
}

/**
 * The six biomes. The generator picks one of the five land biomes by two noise fields over
 * (x, z, w) and the lake wherever the floor lies below the water line; `climate` is unused.
 * Heights are the cavern floors, wherever they happen to be.
 */
export const ABYSS_BIOMES: BiomeDef[] = [
  biome({
    name: 'prism_forest', displayName: 'Prism Forest', kind: 'land',
    surface: 'lumen_moss', subsurface: 'crystal_loam', underwater: 'pearl_sand', stone: 'forest_geode', ceiling: 'prism_crust',
    plants: [{ block: 'prism_bloom', density: 0.05 }, { block: 'lumen_fern', density: 0.12 }],
    skyColor: '#1a1030', fogColor: '#2a1a4a', grassColor: '#8a6ad8', foliageColor: '#a888f0', waterColor: '#5a4a98',
    particles: [{ kind: 'mote', color: '#d8b8ff', rate: 5, glow: true }], hazards: ['pitch dark between the pillars'],
  }),
  biome({
    name: 'geode_hollows', displayName: 'Geode Hollows', kind: 'land',
    surface: 'geode_floor', subsurface: 'calcite_gravel', underwater: 'pearl_sand', stone: 'agate_rock', ceiling: 'hollow_crust',
    plants: [{ block: 'geode_bud', density: 0.06 }, { block: 'calcite_spike', density: 0.05 }],
    skyColor: '#1e1634', fogColor: '#30244e', grassColor: '#c8b8e8', foliageColor: '#b4a2d6', waterColor: '#6a5aa8',
    particles: [{ kind: 'mote', color: '#f0e8ff', rate: 4, glow: true }], hazards: ['sharp calcite'],
  }),
  biome({
    name: 'resonance_caverns', displayName: 'Resonance Caverns', kind: 'land',
    surface: 'resonant_stone', subsurface: 'tuned_gravel', underwater: 'pearl_sand', stone: 'sounding_rock', ceiling: 'chime_crust',
    plants: [{ block: 'resonance_cluster', density: 0.035 }, { block: 'chime_reed', density: 0.1 }],
    skyColor: '#101a34', fogColor: '#1c2a50', grassColor: '#5a82d0', foliageColor: '#4668b0', waterColor: '#4a6ab0',
    particles: [{ kind: 'mote', color: '#a8c8ff', rate: 5, glow: true }], hazards: ['humming stone'],
  }),
  biome({
    name: 'lumen_grotto', displayName: 'Lumen Grotto', kind: 'land',
    surface: 'glowcap_soil', subsurface: 'lumen_clay', underwater: 'lumen_silt', stone: 'grotto_rock', ceiling: 'lumen_clay',
    plants: [{ block: 'lumen_cap', density: 0.06 }, { block: 'grotto_sprout', density: 0.14 }],
    skyColor: '#0a1c1e', fogColor: '#12302e', grassColor: '#3aa890', foliageColor: '#2a8870', waterColor: '#2a7a7a',
    particles: [{ kind: 'spore', color: '#a8ffe0', rate: 7, glow: true }], hazards: ['spore clouds'],
  }),
  biome({
    name: 'shard_barrens', displayName: 'Shard Barrens', kind: 'land',
    surface: 'barren_gravel', subsurface: 'splinter_rubble', underwater: 'pearl_sand', stone: 'barren_rock', ceiling: 'splinter_crust',
    plants: [{ block: 'shard_thorn', density: 0.05 }, { block: 'glint_weed', density: 0.06 }],
    skyColor: '#0e0a18', fogColor: '#1a1228', grassColor: '#7a6498', foliageColor: '#5a4678', waterColor: '#3a2e68',
    particles: [{ kind: 'dust', color: '#c8a8e8', rate: 6 }], hazards: ['falling shards', 'no light at all'],
  }),
  biome({
    name: 'echo_lakes', displayName: 'Echo Lakes', kind: 'ocean',
    surface: 'pearl_sand', subsurface: 'lake_silt', underwater: 'pearl_sand', stone: 'lakebed_rock', ceiling: 'lake_crust',
    plants: [{ block: 'glow_kelp', density: 0.12, placement: 'underwater' }, { block: 'lake_coral', density: 0.03, placement: 'underwater' }],
    skyColor: '#0a1426', fogColor: '#10243c', grassColor: '#5a98c8', foliageColor: '#4a88b8', waterColor: '#2a5a9a',
    particles: [{ kind: 'bubble', color: '#a8d8ff', rate: 4 }], hazards: ['deep dark water'],
  }),
];

export const ABYSS_STYLE: Record<string, AbyssStyle> = {
  prism_forest: { pillars: 9, hanging: [['lumen_fern', 0.02]] },
  geode_hollows: { pillars: 0, hanging: [['calcite_spike', 0.03]] },
  resonance_caverns: { pillars: 0, hanging: [['chime_reed', 0.02]] },
  lumen_grotto: { pillars: 0, hanging: [['grotto_sprout', 0.03]] },
  shard_barrens: { pillars: 0, hanging: [['shard_thorn', 0.025]] },
  echo_lakes: { pillars: 0, hanging: [] },
};

// ---------------------------------------------------------------- loot

const W = (lo: number, hi: number): [number, number] => [lo, hi];

export const ABYSS_LOOT: Record<string, LootTable> = {
  // The first trip: fuel for the rift, light for the dark, and a little of the Surface's comfort.
  geode_gate: {
    pools: [
      { rolls: W(1, 1), entries: [{ item: 'resonance_crystal', weight: 1, count: W(2, 4) }] },
      { rolls: W(1, 1), entries: [{ item: 'torch', weight: 1, count: W(10, 20) }] },
      {
        rolls: W(1, 3),
        entries: [
          { item: 'lantern', weight: 4, count: W(1, 2) },
          { item: 'golden_apple', weight: 3 },
          { item: 'bread', weight: 6, count: W(2, 5) },
          { item: 'iron_ingot', weight: 6, count: W(2, 6) },
          { item: 'xp_bottle', weight: 3, count: W(1, 3) },
        ],
      },
    ],
  },
};

// Everything a Surface land biome offers: the Geode Gate (see structures.ts and biomes.ts).
// Natural spawns come with the Abyss mobs (9.5); until then the existing cavern dwellers live here.
for (const b of ABYSS_BIOMES) b.mobs = { day: ABYSS_SPAWNS[b.name] ?? [] };
