// Phase 9: the Mirror Realm (Realm D). A reflected copy of the Surface: the same continents, rivers
// and caves with x reflected (a portal trip mirrors your x), in a palette of silver, glass and
// quicksilver, under a sky where the sun crosses beneath your feet and the stars shine by day.
//
// "Up is W" here: the realm's vertical axis is displayed as W and its hidden axis as Y, and left
// and right are swapped (RealmDef.axisLabels, mirrorControls, invertedSky; the engine's physics
// still treat its up axis as the one it has always called Y: a relabelling is all "gravity along
// W" can mean in a world with no preferred axis). The generator is src/world/gen/MirrorGen.ts;
// this file is data and the few fixed shapes the generator, the game and the tests share.
//
// Access: a Silver Arch (a ruin on the Surface) holds a dormant rift. A Hand Mirror (silver ingot,
// Mirror Glass and a starlight shard) wakes it; step into the rift and you arrive in the Mirror
// Realm at the mirror image of where you stood, in a fresh arch of your own that leads home.

import { MIRROR_SPAWNS } from './mirrorMobs';
import type { BiomeDef, BlockDef, Hex, ItemDef, LootTable, MiningDef, RecipeDef, TextureDef, TexturePattern } from './types';

// ---------------------------------------------------------------- the rift arch

/** One cell of the arch, relative to the rift's base cell (a, y, b, c = x, y, z, w). */
export interface ArchCell {
  d: [number, number, number, number];
  block: string;
}

/**
 * The arch around a rift: a 3 x 3 x 3 plinth under it, four corner pillars in the (x, z) plane,
 * a roof, and the two rift cells themselves. `rift` is the block that fills the rift (dormant or
 * awake). Everything else is stone; the corners and roof are lit by Mirror Glass.
 */
export function archCells(rift: string): ArchCell[] {
  const out: ArchCell[] = [];
  for (let c = -1; c <= 1; c++)
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) out.push({ d: [a, -1, b, c], block: 'arch_stone' });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) for (let y = 0; y <= 2; y++) out.push({ d: [a, y, b, 0], block: y === 2 ? 'mirror_glass' : 'arch_stone' });
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) out.push({ d: [a, 3, b, 0], block: 'arch_stone' });
  out.push({ d: [0, 0, 0, 0], block: rift }, { d: [0, 1, 0, 0], block: rift });
  return out;
}

/** The air the arch needs around it (carved before an arrival arch is built). */
export const ARCH_AIR: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) for (let y = 0; y <= 3; y++) out.push([a, y, b, c]);
  return out;
})();

// ---------------------------------------------------------------- textures and blocks

export const MIRROR_TEXTURES: TextureDef[] = [];
export const MIRROR_BLOCKS: BlockDef[] = [];

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
  MIRROR_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  MIRROR_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1.5, ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  MIRROR_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

// The four ground blocks of each of the seven biomes: surface, subsurface, the bottom of shallow
// water, and the rock just under the soil. Each biome's four are its own (the registry test wants
// three unique blocks and two unique plants per biome).
//
// silver_plains: meadows and plains, grey-silver grass.
cube('silver_turf', 'speckle', ['#9aa6bc', '#8794ab', '#dfe6f4'], { density: 0.08, hardness: 0.7 });
cube('mirror_loam', 'noise', ['#6e7890', '#626c84'], { amount: 0.1, hardness: 0.6 });
cube('silver_silt', 'noise', ['#8a94aa', '#7a849a'], { amount: 0.08, hardness: 0.5 });
cube('silvered_stone', 'cells', ['#858da2', '#757d92', '#a6aec2'], { hardness: 2 });
// glass_forest: wooded land, teal glass moss.
cube('glass_moss', 'speckle', ['#5cc6b8', '#46aaa0', '#c8fff4'], { density: 0.1, hardness: 0.6 });
cube('prism_loam', 'noise', ['#3f7684', '#366a78'], { amount: 0.1, hardness: 0.6 });
cube('glass_silt', 'cells', ['#5a9eae', '#4a8e9e', '#a8e8f4'], { hardness: 0.5 });
cube('forest_quartz', 'cells', ['#bcd6de', '#a8c4cc', '#f0fbff'], { hardness: 2 });
// quicksilver_fen: wet lowlands, mercury sod.
cube('mercury_sod', 'speckle', ['#7d8aa6', '#6b7894', '#d0dcf4'], { density: 0.1, hardness: 0.6 });
cube('quick_mud', 'noise', ['#4a546c', '#404a60'], { amount: 0.12, hardness: 0.5 });
cube('quick_silt', 'cells', ['#66708a', '#586278', '#a6b4d0'], { hardness: 0.5 });
cube('fen_slate', 'bands', ['#3a425c', '#2e364e', '#5a6488'], { amount: 0.05, hardness: 2.2 });
// shard_dunes: hot dry land, glinting sand.
cube('glint_sand', 'speckle', ['#d8d0ec', '#c8c0e0', '#ffffff'], { density: 0.14, hardness: 0.5 });
cube('compact_glint', 'noise', ['#b0a8cc', '#a098bc'], { amount: 0.08, hardness: 0.7 });
cube('glint_silt', 'noise', ['#c0b8dc', '#b0a8cc'], { amount: 0.06, hardness: 0.5 });
cube('fused_sand', 'bands', ['#c8c0e4', '#b6aed4', '#e6e0f8'], { amount: 0.06, hardness: 1.5 });
// frost_mirror: cold land, rime.
cube('rime_turf', 'speckle', ['#e0eaff', '#cfdcf4', '#ffffff'], { density: 0.1, hardness: 0.6 });
cube('frozen_loam', 'noise', ['#9fb0d2', '#90a2c4'], { amount: 0.08, hardness: 0.7 });
cube('rime_silt', 'noise', ['#c0d0ec', '#b0c2e2'], { amount: 0.06, hardness: 0.5 });
cube('frostglass_rock', 'cells', ['#a8c4ec', '#98b4de', '#e8f4ff'], { hardness: 2 });
// echo_peaks: mountains, the stone that answers back.
cube('echo_stone', 'cells', ['#a49cc0', '#948cb2', '#c8c0e4'], { hardness: 2.2 });
cube('echo_scree', 'cells', ['#766f96', '#686188', '#9a93bc'], { hardness: 1.2 });
cube('echo_silt', 'noise', ['#8a84a6', '#7c7698'], { amount: 0.08, hardness: 0.5 });
cube('echo_rock', 'noise', ['#56526e', '#4a4662'], { amount: 0.1, hardness: 2.5 });
// chrome_sea: the seas (their beds).
cube('chrome_sand', 'speckle', ['#bcc6d8', '#aab4c8', '#f4f8ff'], { density: 0.1, hardness: 0.5 });
cube('chrome_silt', 'noise', ['#96a0b8', '#8892aa'], { amount: 0.08, hardness: 0.5 });
cube('chrome_bed', 'noise', ['#768096', '#68728a'], { amount: 0.08, hardness: 0.6 });
cube('deep_chrome', 'cells', ['#4c5670', '#424c66', '#6a7694'], { hardness: 2.4 });

// Mirrorite: the Mirror Realm's ore (echo rock and below), and its block.
tex('mirrorite_ore', 'ore', ['#56526e', '#4a4662', '#e8f0ff'], { density: 0.16 });
MIRROR_BLOCKS.push({ name: 'mirrorite_ore', displayName: 'Mirrorite Ore', render: 'opaque', solid: true, textures: { all: 'mirrorite_ore' }, hardness: 4, emission: 3, tags: ['ore'] });
cube('mirrorite_block', 'metal', ['#dfe9fa', '#aebcd6', '#ffffff'], { hardness: 5, emission: 2, tags: ['storage'] });

// The arch and its rift.
cube('arch_stone', 'bricks', ['#8a90a6', '#767c92', '#b4bacc'], { hardness: -1 });
tex('dormant_rift', 'cells', ['#2a2e44', '#1e2234', '#6a7298'], {});
MIRROR_BLOCKS.push({ name: 'dormant_rift', displayName: 'Dormant Rift', render: 'translucent', solid: false, textures: { all: 'dormant_rift' }, tint: '#4a5074', alpha: 0.5, emission: 2, hardness: -1, tags: ['rift_dormant'] });
tex('mirror_rift', 'portal', ['#c8d8ff', '#ffffff', '#6a78c8'], { alpha: 0.7 });
MIRROR_BLOCKS.push({ name: 'mirror_rift', displayName: 'Mirror Rift', render: 'translucent', solid: false, textures: { all: 'mirror_rift' }, tint: '#cfe0ff', alpha: 0.6, emission: 11, hardness: -1, tags: ['rift'] });

// The Mirror Palace: its altar (the Hand Mirror wakes the Twin there) and the Twin's beams.
tex('mirror_altar', 'metal', ['#e6eeff', '#9aa8c8', '#ffffff'], {});
MIRROR_BLOCKS.push({ name: 'mirror_altar', displayName: 'Mirror Altar', render: 'opaque', solid: true, textures: { all: 'mirror_altar' }, emission: 7, hardness: -1, tags: ['mirror_altar'] });
tex('mirror_beam', 'glow', ['#e8f0ff', '#9aa8ff', '#ffffff'], { alpha: 0.6 });
MIRROR_BLOCKS.push({ name: 'mirror_beam', displayName: 'Mirror Beam', render: 'translucent', solid: false, textures: { all: 'mirror_beam' }, tint: '#d4dcff', alpha: 0.55, emission: 14, hardness: -1, damage: 6, tags: ['lance'] });

// Plants: two (at least) for each biome.
plant('silver_bloom', 'flower', ['#7a869e', '#7a869e', '#f4f8ff'], { emission: 2 });
plant('mirror_reed', 'plant', ['#a8b4cc', '#8e9ab4'], { density: 0.6 });
plant('glass_fern', 'plant', ['#58c4b4', '#40a496'], { density: 0.65 });
plant('prism_lily', 'flower', ['#3f7684', '#3f7684', '#ffb0e8'], { emission: 4 });
plant('mercury_cap', 'mushroom', ['#6a7894', '#d4e0fa'], { emission: 3 });
plant('quick_rush', 'plant', ['#7e8aa6', '#606c88'], { density: 0.7 });
plant('glint_thistle', 'flower', ['#9a90bc', '#9a90bc', '#ffffff'], { emission: 3 });
plant('shard_cactus', 'plant', ['#b8b0d8', '#9e96c4'], { density: 0.4 });
plant('rime_bell', 'bud', ['#9fb0d2', '#9fb0d2', '#ffffff'], { emission: 3 });
plant('rime_fern', 'plant', ['#cfdcf4', '#b6c6e6'], { density: 0.6 });
plant('echo_bloom', 'flower', ['#766f96', '#766f96', '#e6e0ff'], { emission: 4 });
plant('resonance_reed', 'plant', ['#aaa4cc', '#8e88b4'], { density: 0.55 });
plant('chrome_kelp', 'plant', ['#a8b8d4', '#8c9cbc'], { density: 0.7 });
plant('silver_coral', 'crystal', ['#d8e4f8', '#b0c0e0', '#ffffff'], { emission: 4 });

// ---------------------------------------------------------------- items, recipes, mining

export const MIRROR_ITEMS: ItemDef[] = [
  // Used on a dormant rift (a Silver Arch) it wakes the rift.
  { name: 'hand_mirror', displayName: 'Hand Mirror', maxStack: 1, icon: { shape: 'mirror', colors: ['#dfe8ff', '#8a96b4', '#ffffff'] }, use: 'hand_mirror', readout: 'atlas', atlas: ['silver_arch'], group: 'tools', tags: ['glint'] },
  { name: 'mirror_shard', displayName: 'Mirror Shard', icon: { shape: 'shard', colors: ['#e6eeff', '#9aa8c8', '#ffffff'] }, group: 'materials' },
  { name: 'mirror_ingot', displayName: 'Mirrorite Ingot', icon: { shape: 'ingot', colors: ['#e6eeff', '#9aa8c8', '#ffffff'] }, group: 'materials' },
  // Dropped by the realm's mobs: an ingredient of the potion of reflection... and, for now, of trade.
  { name: 'reflection_dust', displayName: 'Reflection Dust', icon: { shape: 'dust', colors: ['#e6eeff', '#9aa8c8', '#ffffff'] }, group: 'materials' },
  // The Mirror Twin's heart: proof, and the key to what comes after.
  { name: 'twin_core', displayName: 'Twin Core', maxStack: 1, icon: { shape: 'gem', colors: ['#e6eeff', '#6a78c8', '#ffffff'] }, group: 'combat', tags: ['glint'] },
];

export const MIRROR_RECIPES: RecipeDef[] = [
  // Silver from the Surface, Mirror Glass from silver and glass, a shard of starlight from the Void.
  { type: 'shapeless', ingredients: ['silver_ingot', 'mirror_glass', 'starlight_shard'], result: 'hand_mirror' },
  { type: 'smelting', input: 'mirror_shard', result: 'mirror_ingot', time: 8, xp: 1, furnaces: ['furnace', 'blast_furnace'] },
  { type: 'shaped', pattern: ['iii', 'iii', 'iii'], key: { i: 'mirror_ingot' }, result: 'mirrorite_block' },
  { type: 'shapeless', ingredients: ['mirrorite_block'], result: 'mirror_ingot', count: 9 },
];

const one = (item: string, count: [number, number] = [1, 1]) => [{ item, count }];

export const MIRROR_MINING: Record<string, MiningDef> = {
  silver_turf: { tool: 'shovel' },
  mirror_loam: { tool: 'shovel' },
  silver_silt: { tool: 'shovel' },
  silvered_stone: { tool: 'pickaxe', tier: 0 },
  glass_moss: { tool: 'shovel' },
  prism_loam: { tool: 'shovel' },
  glass_silt: { tool: 'shovel' },
  forest_quartz: { tool: 'pickaxe', tier: 0 },
  mercury_sod: { tool: 'shovel' },
  quick_mud: { tool: 'shovel' },
  quick_silt: { tool: 'shovel' },
  fen_slate: { tool: 'pickaxe', tier: 0 },
  glint_sand: { tool: 'shovel' },
  compact_glint: { tool: 'shovel' },
  glint_silt: { tool: 'shovel' },
  fused_sand: { tool: 'pickaxe', tier: 0 },
  rime_turf: { tool: 'shovel' },
  frozen_loam: { tool: 'shovel' },
  rime_silt: { tool: 'shovel' },
  frostglass_rock: { tool: 'pickaxe', tier: 0 },
  echo_stone: { tool: 'pickaxe', tier: 0 },
  echo_scree: { tool: 'shovel' },
  echo_silt: { tool: 'shovel' },
  echo_rock: { tool: 'pickaxe', tier: 0 },
  chrome_sand: { tool: 'shovel' },
  chrome_silt: { tool: 'shovel' },
  chrome_bed: { tool: 'shovel' },
  deep_chrome: { tool: 'pickaxe', tier: 0 },
  mirrorite_ore: { tool: 'pickaxe', tier: 2, drops: one('mirror_shard', [1, 3]), xp: [2, 6] },
  mirrorite_block: { tool: 'pickaxe', tier: 2 },
  silver_bloom: { drops: 'none' },
  mirror_reed: { shears: true, drops: 'none' },
  glass_fern: { shears: true, drops: 'none' },
  prism_lily: { drops: 'none' },
  mercury_cap: { drops: 'none' },
  quick_rush: { shears: true, drops: 'none' },
  glint_thistle: { drops: 'none' },
  shard_cactus: { drops: 'none' },
  rime_bell: { drops: 'none' },
  rime_fern: { shears: true, drops: 'none' },
  echo_bloom: { drops: 'none' },
  resonance_reed: { shears: true, drops: 'none' },
  chrome_kelp: { shears: true, drops: 'none' },
  silver_coral: { tool: 'pickaxe', tier: 0, drops: 'none' },
  mirror_altar: {},
};

// ---------------------------------------------------------------- biomes

/** The palette a Mirror biome repaints the Surface with (the generator reads this). */
export interface MirrorPalette {
  surface: string;
  subsurface: string;
  underwater: string;
  stone: string;
}

function biome(b: Pick<BiomeDef, 'name' | 'displayName' | 'kind' | 'climate' | 'surface' | 'subsurface' | 'underwater' | 'stone' | 'plants' | 'skyColor' | 'fogColor' | 'grassColor' | 'foliageColor' | 'waterColor' | 'particles' | 'hazards' | 'frozenWater' | 'precipitation' | 'heightBias' | 'heightScale'>): BiomeDef {
  return { ceiling: b.stone, trees: [], realm: 'mirror', ...b };
}

/**
 * The seven Mirror biomes. Their `climate` points are unused (the generator picks a Mirror
 * biome from the Surface biome of the column it reflects, see mirrorBiomeFor); heights come from
 * the Surface terrain unchanged.
 */
export const MIRROR_BIOMES: BiomeDef[] = [
  biome({
    name: 'silver_plains', displayName: 'Silver Plains', kind: 'land', climate: [0.5, 0.4, 0, 0.1],
    surface: 'silver_turf', subsurface: 'mirror_loam', underwater: 'silver_silt', stone: 'silvered_stone',
    plants: [{ block: 'silver_bloom', density: 0.06 }, { block: 'mirror_reed', density: 0.12 }],
    skyColor: '#a8b8e0', fogColor: '#c8d2ec', grassColor: '#a9b6cf', foliageColor: '#9fb0cc', waterColor: '#c4d0e4',
    particles: [{ kind: 'mote', color: '#e8f0ff', rate: 3, glow: true }], hazards: [],
    frozenWater: false, precipitation: 'rain', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'glass_forest', displayName: 'Glass Forest', kind: 'land', climate: [0.55, 0.65, 0, 0.3],
    surface: 'glass_moss', subsurface: 'prism_loam', underwater: 'glass_silt', stone: 'forest_quartz',
    plants: [{ block: 'glass_fern', density: 0.14 }, { block: 'prism_lily', density: 0.04 }],
    skyColor: '#98d0e0', fogColor: '#b8e0e8', grassColor: '#58c8b8', foliageColor: '#4cd0c0', waterColor: '#b0dcec',
    particles: [{ kind: 'spore', color: '#c8fff4', rate: 5, glow: true }], hazards: ['shattering branches'],
    frozenWater: false, precipitation: 'rain', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'quicksilver_fen', displayName: 'Quicksilver Fen', kind: 'land', climate: [0.5, 0.9, 0, 0.05],
    surface: 'mercury_sod', subsurface: 'quick_mud', underwater: 'quick_silt', stone: 'fen_slate',
    plants: [{ block: 'quick_rush', density: 0.2 }, { block: 'mercury_cap', density: 0.04 }],
    skyColor: '#8c9cc0', fogColor: '#a4b0cc', grassColor: '#8794b0', foliageColor: '#7c8aaa', waterColor: '#d4dcec',
    particles: [{ kind: 'mote', color: '#d4e0fa', rate: 4, glow: true }], hazards: ['sinking mud'],
    frozenWater: false, precipitation: 'rain', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'shard_dunes', displayName: 'Shard Dunes', kind: 'land', climate: [0.85, 0.15, 0, 0.1],
    surface: 'glint_sand', subsurface: 'compact_glint', underwater: 'glint_silt', stone: 'fused_sand',
    plants: [{ block: 'glint_thistle', density: 0.02 }, { block: 'shard_cactus', density: 0.03 }],
    skyColor: '#c4b8e8', fogColor: '#dcd2f2', grassColor: '#d2cae8', foliageColor: '#c2bade', waterColor: '#c8c0e4',
    particles: [{ kind: 'dust', color: '#f0eaff', rate: 8 }], hazards: ['glassy sand'],
    frozenWater: false, precipitation: 'none', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'frost_mirror', displayName: 'Frost Mirror', kind: 'land', climate: [0.1, 0.4, 0, 0.2],
    surface: 'rime_turf', subsurface: 'frozen_loam', underwater: 'rime_silt', stone: 'frostglass_rock',
    plants: [{ block: 'rime_bell', density: 0.03 }, { block: 'rime_fern', density: 0.1 }],
    skyColor: '#b8d0f4', fogColor: '#d4e4fa', grassColor: '#dce8ff', foliageColor: '#cddcf8', waterColor: '#cfe0f8',
    particles: [{ kind: 'snow', color: '#ffffff', rate: 8 }], hazards: ['thin ice'],
    frozenWater: true, precipitation: 'snow', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'echo_peaks', displayName: 'Echo Peaks', kind: 'land', climate: [0.4, 0.4, 0, 0.9],
    surface: 'echo_stone', subsurface: 'echo_scree', underwater: 'echo_silt', stone: 'echo_rock',
    plants: [{ block: 'echo_bloom', density: 0.015 }, { block: 'resonance_reed', density: 0.04 }],
    skyColor: '#9c94c4', fogColor: '#b4acd4', grassColor: '#a49cc0', foliageColor: '#968eb6', waterColor: '#bcb4dc',
    particles: [{ kind: 'mote', color: '#e0daff', rate: 4, glow: true }], hazards: ['falling echoes'],
    frozenWater: false, precipitation: 'snow', heightBias: 0, heightScale: 1,
  }),
  biome({
    name: 'chrome_sea', displayName: 'Chrome Sea', kind: 'ocean', climate: [0.5, 0.5, 0, 0],
    surface: 'chrome_sand', subsurface: 'chrome_silt', underwater: 'chrome_bed', stone: 'deep_chrome',
    plants: [{ block: 'chrome_kelp', density: 0.12, placement: 'underwater' }, { block: 'silver_coral', density: 0.02, placement: 'underwater' }],
    skyColor: '#a0b4dc', fogColor: '#c0cce4', grassColor: '#b4c2dc', foliageColor: '#a4b4d2', waterColor: '#d2dcf0',
    particles: [{ kind: 'bubble', color: '#f0f6ff', rate: 3 }], hazards: [],
    frozenWater: false, precipitation: 'rain', heightBias: 0, heightScale: 1,
  }),
];

/** The ground blocks of each Mirror biome by name (what the generator paints with). */
export const MIRROR_PALETTES: Record<string, MirrorPalette> = Object.fromEntries(
  MIRROR_BIOMES.map((b) => [b.name, { surface: b.surface, subsurface: b.subsurface, underwater: b.underwater, stone: b.stone ?? b.surface }]),
);

/**
 * Which Mirror biome reflects a Surface biome: seas stay seas, high ground becomes echo peaks,
 * cold land frost, wet land fen, hot dry land dunes, wooded land glass forest, the rest plains.
 */
export function mirrorBiomeFor(b: Pick<BiomeDef, 'kind' | 'climate' | 'trees'>): string {
  if (b.kind === 'ocean') return 'chrome_sea';
  const [t, h, , m] = b.climate;
  if (m >= 0.6) return 'echo_peaks';
  if (t <= 0.25) return 'frost_mirror';
  if (h >= 0.78) return 'quicksilver_fen';
  if (t >= 0.7 && h <= 0.4) return 'shard_dunes';
  const trees = b.trees.reduce((s, x) => s + x.density, 0);
  return trees >= 0.005 ? 'glass_forest' : 'silver_plains';
}

/** Mirrors an x coordinate (a cell, or a position) between the Surface and the Mirror Realm. */
export const flipCell = (x: number): number => -x - 1;

// ---------------------------------------------------------------- loot

const W = (lo: number, hi: number): [number, number] => [lo, hi];

export const MIRROR_LOOT: Record<string, LootTable> = {
  mirror_palace: {
    pools: [
      // Every chest holds a piece of Mirror Armor.
      {
        rolls: W(1, 1),
        entries: [
          { item: 'mirror_helmet', weight: 3, wear: W(0.05, 0.4) },
          { item: 'mirror_chestplate', weight: 2, wear: W(0.05, 0.4) },
          { item: 'mirror_leggings', weight: 3, wear: W(0.05, 0.4) },
          { item: 'mirror_boots', weight: 3, wear: W(0.05, 0.4) },
        ],
      },
      {
        rolls: W(3, 5),
        entries: [
          { item: 'mirror_shard', weight: 9, count: W(2, 5) },
          { item: 'mirror_ingot', weight: 5, count: W(1, 3) },
          { item: 'silver_ingot', weight: 8, count: W(2, 6) },
          { item: 'reflection_dust', weight: 6, count: W(1, 4) },
          { item: 'starlight_shard', weight: 5, count: W(1, 3) },
          { item: 'golden_apple', weight: 3 },
          { item: 'xp_bottle', weight: 4, count: W(1, 4) },
          { item: 'book', weight: 3, enchant: W(15, 30) },
          { item: 'hand_mirror', weight: 1 },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- spawns and structures

// Natural spawns (mirrorMobs.ts), and which structures a Mirror biome may host.
for (const b of MIRROR_BIOMES) {
  b.mobs = { night: MIRROR_SPAWNS[b.name] ?? [] };
  b.structures = b.kind === 'land' ? ['mirror_palace'] : [];
}
