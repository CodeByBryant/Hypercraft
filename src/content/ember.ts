// Phase 6: the Ember Depths. An enclosed realm under a bedrock ceiling, with a lava sea at
// y 32 and eight biomes. Blocks, textures, "trees" (fungi, crystal trees, charred trees,
// tesseract frames) and the biomes themselves; the generator is src/world/gen/EmberGen.ts.
//
// Biomes are picked from heat, vapour and soul (noise over x, z, w) and altitude, plus a "sea"
// field for the Magma Sea: walking kata/ana changes the landscape here as well, and so does
// climbing. Each biome's emberTerrain shapes the 4D terrain around it.

import type { BiomeDef, BlockDef, Hex, MobSpawn, TextureDef, TexturePattern, TreeDef } from './types';

export const EMBER_TEXTURES: TextureDef[] = [];
export const EMBER_BLOCKS: BlockDef[] = [];

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
  EMBER_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  EMBER_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1, ...strip(o) });
}

/** A ground block with its own top (moss, crust) over another block's sides. */
function topped(name: string, top: [TexturePattern, Hex[]], side: string, o: Opt = {}): void {
  tex(`${name}_top`, top[0], top[1], o);
  EMBER_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { top: `${name}_top`, side, bottom: side }, hardness: 0.5, ...strip(o) });
}

function log(name: string, side: [TexturePattern, Hex[]], top: [TexturePattern, Hex[]], o: Opt = {}): void {
  tex(`${name}_side`, side[0], side[1], o);
  tex(`${name}_top`, top[0], top[1]);
  EMBER_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { top: `${name}_top`, bottom: `${name}_top`, side: `${name}_side` }, hardness: 2, tags: ['log', 'ember_wood', 'fireproof'], ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  EMBER_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant', 'fireproof'], ...strip(o) });
}

function ore(name: string, host: Hex[], fleck: Hex, o: Opt = {}): void {
  cube(name, 'ore', [host[0]!, host[1]!, fleck], { density: 0.16, hardness: 3, tags: ['ore'], ...o });
}

// ---------------------------------------------------------------- common rock and glow
const CINDER: Hex[] = ['#6e2a22', '#52201b', '#ff7a2a'];
cube('cinder', 'speckle', CINDER, { density: 0.035, hardness: 0.4, tags: ['cinder', 'infiniburn'] });
cube('cinder_bricks', 'bricks', ['#4a1a1a', '#3c1515', '#1e0a0a'], { hardness: 2, tags: ['cinder_bricks'] });
cube('cracked_cinder_bricks', 'bricks', ['#4a1a1a', '#351313', '#ff5a1a'], { hardness: 2, tags: ['cinder_bricks'] });
cube('chiseled_cinder_bricks', 'metal', ['#541e1e', '#2a0c0c', '#7a2a24'], { hardness: 2, tags: ['cinder_bricks'] });
// Voidstone: the obsidian-like stone of the realm (portal frames can use it too).
cube('voidstone', 'cells', ['#1e1030', '#120a1e', '#6a3aa8'], { hardness: 50, tags: ['portal_frame'] });
cube('voidstone_bricks', 'bricks', ['#241438', '#1a0e2a', '#0c0614'], { hardness: 25 });
// Emberglass: the realm's glowstone. Hangs from ceilings in clusters.
cube('emberglass', 'glow', ['#ffb050', '#ff8a20', '#fff0b0'], { emission: 15, hardness: 0.3 });
ore('ember_quartz_ore', ['#6e2a22', '#52201b'], '#f4e0d8');
ore('gilded_cinder', ['#6e2a22', '#52201b'], '#f4d03f', { hardness: 1.5 });
cube('hypercinder_ore', 'cracks', ['#3a1612', '#2a0e0c', '#ff3aa8'], { density: 0.25, hardness: 3.5, tags: ['ore'] });
// Ancient Slag: rare, deep, blast-proof; smelts into slag scrap (the best tool material).
cube('ancient_slag', 'cracks', ['#3a2a24', '#2a1e1a', '#9a6a3a'], { density: 0.1, hardness: 30, tags: ['ore'] });
// Fire burns forever on cinder; soul fire is blue. Both hurt.
tex('fire', 'flame', ['#d8300a', '#ff9a1a', '#fff2a0']);
EMBER_BLOCKS.push({ name: 'fire', render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: 'fire' }, emission: 15, damage: 1, replaceable: true, hardness: 0, animation: 'flame', tags: ['fire'] });
tex('soul_fire', 'flame', ['#0a6a8a', '#2ad8f0', '#d8ffff']);
EMBER_BLOCKS.push({ name: 'soul_fire', displayName: 'Soul Fire', render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: 'soul_fire' }, emission: 10, damage: 2, replaceable: true, hardness: 0, animation: 'flame', tags: ['fire'] });
// Magma pillars summoned by the Magma Regent: a damaging, glowing column (no flow).
tex('erupting_magma', 'fluid', ['#c8420a', '#ff9a1f', '#fff08a']);
EMBER_BLOCKS.push({ name: 'erupting_magma', displayName: 'Erupting Magma', render: 'opaque', solid: false, opaque: false, textures: { all: 'erupting_magma' }, emission: 15, damage: 6, hardness: -1, animation: 'churn' });

// ---------------------------------------------------------------- Cinder Plains
topped('ember_moss', ['speckle', ['#9a2e1a', '#7a2414', '#ffb040']], 'cinder', { density: 0.14, hardness: 0.4, tags: ['infiniburn'] });
cube('smoldering_cinder', 'cracks', ['#5a2018', '#461812', '#ff8a2a'], { density: 0.15, emission: 4, hardness: 0.6, tags: ['infiniburn'] });
log('emberwood_log', ['log_side', ['#3a1a14', '#2a120e']], ['log_top', ['#6a2a1a', '#4a1e14', '#ff6a1a']]);
tex('ember_leaves', 'leaves', ['#ff6a1a', '#d8400a'], { density: 0.28 });
EMBER_BLOCKS.push({ name: 'ember_leaves', render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: 'ember_leaves' }, emission: 7, hardness: 0.2, tags: ['leaves', 'fireproof'] });
plant('ember_grass', 'flame', ['#8a1a0a', '#ff5a1a', '#ffb050'], { emission: 5 });
plant('fire_blossom', 'flower', ['#5a1a10', '#5a1a10', '#ff8a2a'], { emission: 9 });

// ---------------------------------------------------------------- Basalt Prisms
tex('columnar_basalt_side', 'columns', ['#3e3e46', '#2c2c32', '#16161a']);
tex('columnar_basalt_top', 'cells', ['#4a4a52', '#34343a', '#1c1c20']);
EMBER_BLOCKS.push({ name: 'columnar_basalt', render: 'opaque', solid: true, textures: { top: 'columnar_basalt_top', bottom: 'columnar_basalt_top', side: 'columnar_basalt_side' }, hardness: 1.25 });
cube('glowing_basalt', 'cracks', ['#34343a', '#26262c', '#ff6a1a'], { density: 0.12, emission: 6, hardness: 1.25 });
cube('prism_basalt', 'noise', ['#2e2e34', '#26262b'], { amount: 0.06, hardness: 1.25 });
plant('cinder_lichen', 'speckle', ['#4a2a20', '#3a2018', '#ff9a4a'], { density: 0.08, emission: 3 });
plant('magma_bulb', 'mushroom', ['#3a1a14', '#ff6a1a'], { emission: 10 });

// ---------------------------------------------------------------- Sulfur Fungal Forest
topped('sulfur_moss', ['speckle', ['#c8b42a', '#a8961e', '#fff27a']], 'cinder', { density: 0.12, hardness: 0.4 });
cube('sulfur_block', 'noise', ['#d8c43a', '#bca82a'], { amount: 0.08, hardness: 1 });
log('sulfur_stem', ['dripstone', ['#d8e0a8', '#b8c488']], ['log_top', ['#e8f0b8', '#c8d498', '#8a9a4a']], { emission: 3 });
cube('sulfur_cap', 'cap', ['#e8c81a', '#ff8a1a'], { hardness: 0.3, emission: 4 });
cube('sulfur_vent', 'cracks', ['#8a7a1a', '#6a5a12', '#fff27a'], { density: 0.3, emission: 7, damage: 1, hardness: 1 });
plant('sulfur_shroom', 'mushroom', ['#c8d498', '#e8c81a'], { emission: 6 });
plant('brimstone_sprouts', 'plant', ['#8a7a1a', '#fff27a'], { density: 0.35 });

// ---------------------------------------------------------------- Magma Sea
cube('pumice', 'cells', ['#8a7a70', '#6a5c54', '#a89a90'], { hardness: 0.6 });
cube('magma_crust', 'cracks', ['#2a1210', '#1e0c0a', '#ff6a1a'], { density: 0.2, emission: 8, damage: 1, hardness: 0.6, tags: ['infiniburn'] });
cube('scorched_stone', 'speckle', ['#4a3a34', '#3a2c28', '#8a4a2a'], { density: 0.05, hardness: 1.5 });
plant('lava_reeds', 'plant', ['#5a1a0a', '#ff7a2a'], { density: 0.3, emission: 4 });
plant('flame_lily', 'flower', ['#2a4a1a', '#2a4a1a', '#ff4a1a'], { emission: 8 });

// ---------------------------------------------------------------- Ash Wastes
cube('ash_block', 'noise', ['#8a8682', '#76726e'], { amount: 0.1, hardness: 0.5, slows: 0.8 });
cube('ashstone', 'speckle', ['#4a4644', '#3c3836', '#6a6664'], { density: 0.06, hardness: 1.5 });
log('charred_log', ['cracks', ['#1a1414', '#120e0e', '#ff5a1a']], ['log_top', ['#2a2020', '#1a1414', '#ff4a0a']], { density: 0.05 });
plant('ash_tuft', 'plant', ['#6a6664', '#b8b4b0'], { density: 0.4 });
plant('withered_bloom', 'flower', ['#3a3634', '#3a3634', '#c8b8a8']);

// ---------------------------------------------------------------- Soul Glass Canyons
cube('soul_sand', 'noise', ['#4a3a2e', '#3a2c22'], { amount: 0.12, hardness: 0.5, slows: 0.45, tags: ['infiniburn'] });
cube('soul_soil', 'speckle', ['#3e3026', '#30241c', '#5ad8e8'], { density: 0.03, hardness: 0.5, tags: ['infiniburn'] });
tex('soul_glass', 'crystal', ['#3ab8c8', '#2a8a9a', '#c8ffff'], { alpha: 0.45 });
EMBER_BLOCKS.push({ name: 'soul_glass', render: 'translucent', solid: true, opaque: false, textures: { all: 'soul_glass' }, emission: 4, hardness: 0.6, alpha: 0.55, tags: ['glass'] });
cube('soul_stone', 'bands', ['#3a4a50', '#2e3c42', '#46585e'], { amount: 0.05, hardness: 1.5 });
plant('soul_fern', 'plant', ['#1a4a50', '#5ad8e8'], { density: 0.4, emission: 3 });
plant('wisp_bloom', 'flower', ['#1a3a40', '#1a3a40', '#8affff'], { emission: 11 });

// ---------------------------------------------------------------- Emberglass Grove
cube('glowing_cinder', 'speckle', ['#7a2e1a', '#5e2214', '#ffd070'], { density: 0.12, emission: 5, hardness: 0.4, tags: ['infiniburn'] });
tex('ember_crystal', 'crystal', ['#ff8a2a', '#e8601a', '#fff0c0'], { alpha: 0.75 });
EMBER_BLOCKS.push({ name: 'ember_crystal', render: 'translucent', solid: true, opaque: false, textures: { all: 'ember_crystal' }, emission: 10, hardness: 1.5, alpha: 0.8, tags: ['log', 'crystal', 'fireproof'] });
tex('ember_bloom', 'crystal', ['#ffc050', '#ff8a2a', '#ffffff'], { alpha: 0.9 });
EMBER_BLOCKS.push({ name: 'ember_bloom', render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: 'ember_bloom' }, emission: 13, hardness: 0.3, tags: ['leaves', 'crystal', 'fireproof'] });
plant('blazecap', 'mushroom', ['#e8c8a8', '#ffb050'], { emission: 12 });
plant('crystal_sprouts', 'bud', ['#ff8a2a', '#ffc050', '#fff0c0'], { emission: 8 });

// ---------------------------------------------------------------- Shattered Tesseracts
cube('rift_soil', 'speckle', ['#2a1a3a', '#1e122c', '#b86aff'], { density: 0.05, hardness: 0.6 });
cube('fractured_voidstone', 'cracks', ['#1e1030', '#160a24', '#9a5aff'], { density: 0.12, hardness: 8 });
cube('phase_crystal', 'crystal', ['#c88aff', '#9a5ae8', '#ffffff'], { emission: 12, hardness: 1 });
plant('rift_grass', 'plant', ['#3a1a5a', '#b86aff'], { density: 0.4, emission: 2 });
plant('phase_bloom', 'flower', ['#2a1a4a', '#2a1a4a', '#e0a8ff'], { emission: 10 });

// ---------------------------------------------------------------- trees and big features
export const EMBER_TREES: TreeDef[] = [
  { name: 'emberwood', shape: 'ball', log: 'emberwood_log', leaves: 'ember_leaves', height: [4, 6], radius: [2.0, 2.6] },
  { name: 'sulfur_fungus', shape: 'fungus', log: 'sulfur_stem', leaves: 'sulfur_cap', height: [5, 9], radius: [2.6, 3.8] },
  { name: 'charred_tree', shape: 'dead', log: 'charred_log', height: [4, 7], radius: [0, 0] },
  { name: 'ember_crystal_tree', shape: 'crystal', log: 'ember_crystal', leaves: 'ember_bloom', height: [5, 8], radius: [2.4, 3.4] },
  // A floating tesseract frame: the 32 edges of a 4D hypercube, with glowing vertices.
  { name: 'tesseract_frame', shape: 'tesseract', log: 'voidstone', leaves: 'phase_crystal', height: [4, 7], radius: [0, 0] },
];

// ---------------------------------------------------------------- biomes

const HOUNDS: MobSpawn = { mob: 'cinder_hound', weight: 40, group: [3, 5] };
const SLIMES: MobSpawn = { mob: 'lava_slime', weight: 25, group: [1, 2] };
const DRAKES: MobSpawn = { mob: 'magma_drake', weight: 12 };
const BRUTES: MobSpawn = { mob: 'ember_brute', weight: 25, group: [1, 3] };
const GOLEMS: MobSpawn = { mob: 'slag_golem', weight: 15 };
const WISPS: MobSpawn = { mob: 'soul_wisp', weight: 20, group: [2, 4] };

const EMBER_STRUCTS = ['ember_ruined_portal'];

function biome(b: Omit<BiomeDef, 'kind' | 'heightBias' | 'heightScale' | 'frozenWater' | 'precipitation' | 'realm' | 'waterColor' | 'foliageColor'> & { foliageColor?: Hex }): BiomeDef {
  return {
    kind: 'land',
    heightBias: 0,
    heightScale: 1,
    frozenWater: false,
    precipitation: 'none',
    waterColor: '#ff6a1a',
    foliageColor: b.foliageColor ?? b.grassColor,
    realm: 'ember',
    ...b,
  };
}

// Climate points: [heat, vapour, soul, altitude]. Altitude 0 is the lava sea, 1 the roof: the
// generator picks biomes in 3D, so the ledges and islands high up have biomes of their own.
export const EMBER_BIOMES: BiomeDef[] = [
  biome({
    name: 'cinder_plains',
    displayName: 'Cinder Plains',
    ember: 'plains',
    climate: [0.5, 0.5, 0.45, 0.2],
    emberTerrain: { fill: -0.12, vertical: 0.25, shelves: 0.55, floor: 37, roof: 108, rough: 0.45 },
    surface: 'ember_moss',
    subsurface: 'cinder',
    underwater: 'magma_block',
    stone: 'smoldering_cinder',
    ceiling: 'cinder',
    trees: [{ tree: 'emberwood', density: 0.0035 }],
    plants: [
      { block: 'ember_grass', density: 0.12 },
      { block: 'fire_blossom', density: 0.012 },
      { block: 'fire', density: 0.004 },
    ],
    particles: [
      { kind: 'ember', color: '#ff8a2a', rate: 6, glow: true },
      { kind: 'ash', color: '#6a5a54', rate: 2 },
    ],
    skyColor: '#3a0e08',
    fogColor: '#6a1e0e',
    grassColor: '#c8401a',
    mobs: { day: [HOUNDS, SLIMES, BRUTES, DRAKES, WISPS] },
    structures: ['citadel', 'forge', ...EMBER_STRUCTS],
    hazards: ['fire patches', 'lava lakes'],
  }),
  biome({
    name: 'basalt_prisms',
    displayName: 'Basalt Prisms',
    ember: 'prisms',
    climate: [0.8, 0.22, 0.45, 0.45],
    emberTerrain: { fill: 0.02, vertical: 0.9, shelves: 0.15, floor: 39, roof: 106, rough: 0.2 },
    surface: 'columnar_basalt',
    subsurface: 'glowing_basalt',
    underwater: 'magma_block',
    stone: 'prism_basalt',
    ceiling: 'columnar_basalt',
    trees: [],
    plants: [
      { block: 'cinder_lichen', density: 0.05 },
      { block: 'magma_bulb', density: 0.01 },
    ],
    particles: [
      { kind: 'ash', color: '#4a4a52', rate: 5 },
      { kind: 'ember', color: '#ff6a1a', rate: 2, glow: true },
    ],
    skyColor: '#1a1618',
    fogColor: '#3c3236',
    grassColor: '#4a4a52',
    mobs: { day: [GOLEMS, SLIMES, { ...DRAKES, weight: 18 }, { ...HOUNDS, weight: 20, group: [2, 4] }] },
    structures: ['citadel', 'basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['column drops', 'lava pockets'],
  }),
  biome({
    name: 'sulfur_fungal_forest',
    displayName: 'Sulfur Fungal Forest',
    ember: 'fungal',
    climate: [0.35, 0.82, 0.35, 0.3],
    emberTerrain: { fill: -0.22, vertical: 0.35, shelves: 0.45, floor: 38, roof: 110, rough: 0.3 },
    surface: 'sulfur_moss',
    subsurface: 'cinder',
    underwater: 'magma_block',
    stone: 'sulfur_block',
    ceiling: 'sulfur_block',
    trees: [{ tree: 'sulfur_fungus', density: 0.009 }],
    plants: [
      { block: 'sulfur_shroom', density: 0.04 },
      { block: 'brimstone_sprouts', density: 0.1 },
    ],
    particles: [
      { kind: 'spore', color: '#fff27a', rate: 10, glow: true },
      { kind: 'dust', color: '#d8c43a', rate: 3 },
    ],
    skyColor: '#3a3008',
    fogColor: '#6a5a14',
    grassColor: '#d8c43a',
    mobs: { day: [{ ...BRUTES, weight: 40 }, { ...HOUNDS, weight: 20 }, { ...WISPS, weight: 10 }] },
    structures: ['forge', ...EMBER_STRUCTS],
    hazards: ['sulfur vents (burn)'],
  }),
  biome({
    name: 'magma_sea',
    displayName: 'Magma Sea',
    ember: 'sea',
    climate: [0.6, 0.4, 0.4, 0],
    emberTerrain: { fill: -0.55, vertical: 0.15, shelves: 0.25, floor: 22, roof: 112, rough: 0.5, islands: 0.35 },
    surface: 'pumice',
    subsurface: 'scorched_stone',
    underwater: 'magma_crust',
    stone: 'scorched_stone',
    ceiling: 'cinder',
    trees: [],
    plants: [
      { block: 'lava_reeds', density: 0.08 },
      { block: 'flame_lily', density: 0.015 },
    ],
    particles: [
      { kind: 'ember', color: '#ffb050', rate: 10, glow: true },
    ],
    skyColor: '#4a1206',
    fogColor: '#8a2a08',
    grassColor: '#8a7a70',
    mobs: { day: [{ ...DRAKES, weight: 40 }, { ...SLIMES, weight: 40 }, { ...WISPS, weight: 10 }] },
    structures: ['magma_bridge', 'regent_caldera', ...EMBER_STRUCTS],
    hazards: ['lava sea', 'magma crust'],
  }),
  biome({
    name: 'ash_wastes',
    displayName: 'Ash Wastes',
    ember: 'ash',
    climate: [0.3, 0.22, 0.3, 0.25],
    emberTerrain: { fill: -0.18, vertical: 0.1, shelves: 0.65, floor: 38, roof: 108, rough: 0.2, dunes: 1 },
    surface: 'ash_block',
    subsurface: 'ash_block',
    underwater: 'magma_block',
    stone: 'ashstone',
    ceiling: 'ashstone',
    trees: [{ tree: 'charred_tree', density: 0.004 }],
    plants: [
      { block: 'ash_tuft', density: 0.08 },
      { block: 'withered_bloom', density: 0.01 },
    ],
    particles: [
      { kind: 'ash', color: '#9a9690', rate: 18 },
      { kind: 'ash', color: '#5a5654', rate: 8 },
    ],
    skyColor: '#2a2826',
    fogColor: '#6a6460',
    grassColor: '#8a8682',
    mobs: { day: [HOUNDS, GOLEMS, DRAKES] },
    structures: ['citadel', 'basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['ash (slows)', 'low visibility'],
  }),
  biome({
    name: 'soul_glass_canyons',
    displayName: 'Soul Glass Canyons',
    ember: 'canyons',
    climate: [0.3, 0.48, 0.85, 0.4],
    emberTerrain: { fill: 0.0, vertical: 1, shelves: 0.2, floor: 33, roof: 106, rough: 0.3, canyons: 1 },
    surface: 'soul_sand',
    subsurface: 'soul_soil',
    underwater: 'soul_soil',
    stone: 'soul_stone',
    ceiling: 'soul_glass',
    trees: [],
    plants: [
      { block: 'soul_fern', density: 0.08 },
      { block: 'wisp_bloom', density: 0.02 },
      { block: 'soul_fire', density: 0.003 },
    ],
    particles: [
      { kind: 'mote', color: '#8affff', rate: 8, glow: true },
      { kind: 'ash', color: '#2a4a50', rate: 3 },
    ],
    skyColor: '#081e24',
    fogColor: '#1a4a54',
    grassColor: '#3ab8c8',
    mobs: { day: [{ ...WISPS, weight: 40 }, { mob: 'bone_archer', weight: 30, group: [1, 2] }, DRAKES, { ...GOLEMS, weight: 8 }] },
    structures: ['forge', ...EMBER_STRUCTS],
    hazards: ['soul sand (slows)', 'soul fire', 'canyon drops'],
  }),
  biome({
    name: 'emberglass_grove',
    displayName: 'Emberglass Grove',
    ember: 'grove',
    climate: [0.78, 0.75, 0.45, 0.6],
    emberTerrain: { fill: -0.08, vertical: 0.45, shelves: 0.45, floor: 39, roof: 106, rough: 0.4 },
    surface: 'glowing_cinder',
    subsurface: 'cinder',
    underwater: 'magma_block',
    stone: 'cinder',
    ceiling: 'emberglass',
    trees: [{ tree: 'ember_crystal_tree', density: 0.0065 }],
    plants: [
      { block: 'blazecap', density: 0.03 },
      { block: 'crystal_sprouts', density: 0.05 },
    ],
    particles: [
      { kind: 'firefly', color: '#ffc050', rate: 10, glow: true },
      { kind: 'mote', color: '#ff8a2a', rate: 4, glow: true },
    ],
    skyColor: '#4a2008',
    fogColor: '#8a4a12',
    grassColor: '#ff8a2a',
    mobs: { day: [{ ...WISPS, weight: 25 }, BRUTES, SLIMES] },
    structures: ['forge', ...EMBER_STRUCTS],
    hazards: ['glare', 'lava lakes'],
  }),
  biome({
    name: 'shattered_tesseracts',
    displayName: 'Shattered Tesseracts',
    ember: 'shattered',
    climate: [0.75, 0.4, 0.85, 0.85],
    emberTerrain: { fill: -0.38, vertical: 0.45, shelves: 0, floor: 30, roof: 114, rough: 0.8, islands: 1 },
    surface: 'rift_soil',
    subsurface: 'rift_soil',
    underwater: 'magma_block',
    stone: 'fractured_voidstone',
    ceiling: 'fractured_voidstone',
    trees: [{ tree: 'tesseract_frame', density: 0.0022 }],
    plants: [
      { block: 'rift_grass', density: 0.08 },
      { block: 'phase_bloom', density: 0.015 },
    ],
    particles: [
      { kind: 'mote', color: '#c88aff', rate: 8, glow: true },
      { kind: 'ember', color: '#9a5aff', rate: 2, glow: true },
    ],
    skyColor: '#140828',
    fogColor: '#2e164a',
    grassColor: '#9a5aff',
    mobs: { day: [{ ...GOLEMS, weight: 20 }, { mob: 'ana_stalker', weight: 15 }, DRAKES, { ...HOUNDS, weight: 20 }] },
    structures: ['citadel', ...EMBER_STRUCTS],
    hazards: ['floating frames', 'Ana Stalkers'],
  }),
];
