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
EMBER_BLOCKS.push({ name: 'ember_crystal', render: 'translucent', solid: true, opaque: false, textures: { all: 'ember_crystal' }, emission: 10, hardness: 1.5, alpha: 0.8, tags: ['pillar', 'crystal', 'fireproof'] });
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
    vents: [{ block: 'sulfur_vent', density: 0.004 }],
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

// ================================================================ playtest expansion
// Seventeen more Ember biomes, spread over the realm's height: lava shores and mires low down,
// forests, valleys and spires in the middle, gardens, roosts and floating isles near the roof.
// Every one has its own surface, its own plants and (mostly) its own trees.

/** Leaves-like cutout block (fungus warts, fronds, plumes). */
function foliage(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.3 });
  EMBER_BLOCKS.push({ name, render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: name }, hardness: 0.3, tags: ['leaves', 'fireproof'], ...strip(o) });
}

// ---- low: lava shores and mires
cube('obsidian_sand', 'speckle', ['#1c1424', '#120c18', '#7a4aa8'], { density: 0.06, hardness: 0.6 });
cube('glass_slag', 'cells', ['#2a2430', '#1c1822', '#5a4a6a'], { hardness: 2 });
plant('obsidian_shards', 'bud', ['#1a1020', '#3a2a4a', '#b88aff'], { emission: 4 });
plant('lava_bloom', 'flower', ['#3a1a10', '#3a1a10', '#ffb030'], { emission: 9 });

cube('scorched_basalt', 'columns', ['#3a2c2a', '#2a201e', '#ff6a1a'], { hardness: 1.25 });
cube('magma_vein_rock', 'cracks', ['#3e2420', '#2c1814', '#ff8a2a'], { density: 0.18, emission: 5, hardness: 1.5 });
tex('molten_cascade', 'fluid', ['#d8500a', '#ffa02a', '#fff0a0']);
EMBER_BLOCKS.push({ name: 'molten_cascade', displayName: 'Molten Cascade', render: 'opaque', solid: false, opaque: false, textures: { all: 'molten_cascade' }, emission: 15, damage: 4, hardness: -1, animation: 'churn' });
plant('cinder_reed', 'plant', ['#4a1a10', '#ff6a2a'], { density: 0.35, emission: 3 });
plant('heat_shimmer_moss', 'speckle', ['#5a2a14', '#3a1a0c', '#ffd070'], { density: 0.12, emission: 4 });

cube('boiling_mud', 'noise', ['#5a3a2a', '#4a2e20'], { amount: 0.14, hardness: 0.5, slows: 0.5 });
cube('mire_clay', 'noise', ['#6a4a3a', '#5a3e30'], { amount: 0.08, hardness: 0.6 });
cube('mud_vent', 'cracks', ['#4a3424', '#3a2818', '#ffd8a0'], { density: 0.25, emission: 6, damage: 1, hardness: 1 });
plant('bubble_reed', 'plant', ['#5a4a2a', '#c8a05a'], { density: 0.3 });
plant('mire_cap', 'mushroom', ['#c8a888', '#a85a2a'], { emission: 5 });

cube('slag_gravel', 'speckle', ['#4a3e3a', '#3a302c', '#a8622a'], { density: 0.14, hardness: 0.6 });
cube('iron_crust', 'metal', ['#5a3a2a', '#3a2418', '#a85a2a'], { hardness: 3 });
plant('rust_fern', 'plant', ['#7a3a1a', '#c8622a'], { density: 0.4 });
plant('scrap_thorn', 'bud', ['#3a2a24', '#5a4a40', '#c8a07a']);

// ---- middle: forests, valleys, spires
topped('crimson_nylium', ['speckle', ['#8a1a24', '#6a1018', '#ff4a5a']], 'cinder', { density: 0.12, hardness: 0.4, tags: ['infiniburn'] });
log('crimson_stem', ['bands', ['#7a1a2a', '#5a1020']], ['log_top', ['#8a2030', '#6a1424', '#ff5a6a']], { emission: 2 });
foliage('crimson_wart', 'cap', ['#a8141e', '#ff3a3a']);
plant('crimson_roots', 'plant', ['#7a1424', '#ff4a5a'], { density: 0.4 });
plant('weeping_vines', 'plant', ['#8a1a20', '#ff6a3a'], { density: 0.45, emission: 3 });

topped('warped_nylium', ['speckle', ['#1a6a6a', '#105050', '#3affd8']], 'cinder', { density: 0.12, hardness: 0.4 });
log('warped_stem', ['bands', ['#1a4a5a', '#103a4a']], ['log_top', ['#1a5a6a', '#104a5a', '#5affe8']], { emission: 2 });
foliage('warped_wart', 'cap', ['#0a7a7a', '#3affd8']);
plant('warped_roots', 'plant', ['#105a6a', '#3affd8'], { density: 0.4 });
plant('twisting_sprouts', 'bud', ['#0a4a4a', '#1a8a8a', '#7affe8'], { emission: 4 });

cube('bone_soil', 'speckle', ['#7a6a5a', '#6a5a4a', '#d8c8a8'], { density: 0.08, hardness: 0.5 });
log('bone_pillar', ['bands', ['#d8ceb8', '#c8bca4']], ['log_top', ['#e8dec8', '#c8bca4', '#8a7a64']], { tags: ['pillar', 'fireproof'] });
plant('marrow_grass', 'plant', ['#a89a7a', '#e8dcc0'], { density: 0.4 });
plant('skull_bloom', 'flower', ['#5a4a3a', '#5a4a3a', '#e8e0d0'], { emission: 2 });

topped('ember_straw', ['grass_top', ['#c8902a', '#a87a1a']], 'cinder', { hardness: 0.4 });
log('ashwood_log', ['log_side', ['#4a3a34', '#3a2c26']], ['log_top', ['#6a5048', '#4a3a34', '#ff9a4a']]);
foliage('ashwood_canopy', 'leaves', ['#d8701a', '#a8500a'], { emission: 4 });
plant('flame_grass', 'flame', ['#8a4a0a', '#ffb030', '#fff0a0'], { emission: 6 });
plant('cinder_bush', 'bud', ['#4a2a14', '#8a4a1a', '#ff8a3a']);

cube('lumin_dust', 'speckle', ['#c8a85a', '#a88a4a', '#fff4c0'], { density: 0.2, emission: 6, hardness: 0.5 });
cube('glow_veined_rock', 'cracks', ['#5a4a3a', '#4a3c2e', '#ffe89a'], { density: 0.16, emission: 7, hardness: 1.5 });
plant('glowshard', 'crystal', ['#ffe89a', '#ffd050', '#ffffff'], { emission: 14 });
plant('lightcap', 'mushroom', ['#e8d8a8', '#fff0a0'], { emission: 12 });

cube('obsidian_scree', 'speckle', ['#1a1222', '#0e0a14', '#6a3aa8'], { density: 0.05, hardness: 1.2 });
log('spire_obsidian', ['crystal', ['#1e1430', '#120c1e', '#7a4ac8']], ['log_top', ['#241838', '#160e24', '#9a6ae8']], { hardness: 25, tags: ['pillar', 'fireproof'] });
foliage('violet_shard', 'crystal', ['#b88aff', '#8a5ae8', '#ffffff'], { emission: 12 });
plant('void_grass', 'plant', ['#2a1a3a', '#8a5ad8'], { density: 0.35 });
plant('spire_moss', 'speckle', ['#2a1a3a', '#1e122c', '#b88aff'], { density: 0.15, emission: 2 });

cube('magma_coral_block', 'cells', ['#a83a1a', '#7a240c', '#ffb050'], { emission: 5, hardness: 1 });
log('magma_coral_stem', ['cracks', ['#8a2a14', '#6a1e0c', '#ffa040']], ['log_top', ['#a8401a', '#7a2a10', '#ffd070']], { emission: 6, tags: ['pillar', 'fireproof'] });
foliage('magma_coral_fan', 'leaves', ['#ff6a2a', '#d8401a'], { emission: 9 });
plant('ember_anemone', 'flower', ['#6a1a0c', '#6a1a0c', '#ff8a3a'], { emission: 8 });
plant('heat_polyp', 'bud', ['#5a1a0a', '#a83a1a', '#ffc070'], { emission: 6 });

topped('scorch_moss', ['grass_top', ['#7a5a1a', '#5a4010']], 'cinder', { hardness: 0.4 });
log('blazewood_log', ['log_side', ['#5a3a1a', '#4a2c10']], ['log_top', ['#7a5020', '#5a3a14', '#ffc040']]);
foliage('blaze_fronds', 'leaves', ['#ffa020', '#d87a0a'], { emission: 8 });
plant('flare_vine', 'plant', ['#8a4a0a', '#ffc040'], { density: 0.45, emission: 7 });
plant('pyre_lily', 'flower', ['#4a3a0a', '#4a3a0a', '#ffd040'], { emission: 10 });

// ---- high: gardens, stalactites, isles, roosts, smoke
topped('garden_moss', ['grass_top', ['#5a7a2a', '#4a6a1a']], 'cinder', { hardness: 0.4 });
cube('root_cinder', 'bands', ['#4a2a1a', '#3a2014', '#7a4a2a'], { amount: 0.06, hardness: 0.8 });
plant('ember_vines', 'plant', ['#4a5a1a', '#c8a03a'], { density: 0.45, emission: 3 });
plant('lantern_pod', 'fruit', ['#3a4a1a', '#3a4a1a', '#ffd070'], { density: 0.3, emission: 13 });

cube('dripcinder', 'dripstone', ['#6a3a30', '#4a2a22'], { hardness: 1.5 });
log('dripcinder_column', ['dripstone', ['#7a4438', '#5a3228']], ['log_top', ['#7a4438', '#5a3228', '#ff9a5a']], { tags: ['pillar', 'fireproof'] });
foliage('drip_tip', 'crystal', ['#ff9a5a', '#d86a3a', '#ffe0c0'], { emission: 6 });
plant('cave_ember_moss', 'speckle', ['#4a2a1e', '#3a2018', '#ff8a4a'], { density: 0.14, emission: 3 });
plant('drip_bulb', 'fruit', ['#4a2a1e', '#4a2a1e', '#ffa060'], { density: 0.3, emission: 10 });

topped('ash_turf', ['grass_top', ['#9a948e', '#86807a']], 'ash_block', { hardness: 0.5 });
cube('cloud_ash', 'noise', ['#b8b2ac', '#a8a29c'], { amount: 0.06, hardness: 0.4 });
plant('ash_lily', 'flower', ['#6a6460', '#6a6460', '#e8e0d8'], { emission: 2 });
plant('drift_puff', 'bud', ['#8a847e', '#c8c2bc', '#ffffff']);

cube('aurum_rock', 'speckle', ['#a8802a', '#8a6a1a', '#ffe070'], { density: 0.12, emission: 3, hardness: 2 });
log('nest_twigs', ['thatch', ['#8a6a3a', '#6a4e2a', '#3a2a1a']], ['log_top', ['#8a6a3a', '#6a4e2a', '#ffd070']]);
foliage('phoenix_plume', 'flame', ['#d8401a', '#ffa020', '#fff8c0'], { emission: 13, density: 0.6 });
plant('fire_feather', 'flame', ['#c8300a', '#ff8a1a', '#ffe8a0'], { emission: 11 });
plant('sunspark', 'flower', ['#6a4a0a', '#6a4a0a', '#fff0a0'], { emission: 12 });

cube('smog_rock', 'noise', ['#3a3438', '#2e282c'], { amount: 0.1, hardness: 1.2 });
topped('soot_turf', ['speckle', ['#2a2628', '#1e1a1c', '#6a6266']], 'smog_rock', { density: 0.1, hardness: 0.5 });
plant('soot_fern', 'plant', ['#2a2628', '#5a5256'], { density: 0.4 });
plant('smoke_bell', 'flower', ['#2a2628', '#2a2628', '#a8a0a4']);

EMBER_TREES.push(
  { name: 'crimson_fungus', shape: 'fungus', log: 'crimson_stem', leaves: 'crimson_wart', height: [5, 10], radius: [2.4, 3.6] },
  { name: 'warped_fungus', shape: 'fungus', log: 'warped_stem', leaves: 'warped_wart', height: [6, 11], radius: [2.2, 3.4] },
  { name: 'rib_arch', shape: 'dead', log: 'bone_pillar', height: [5, 9], radius: [0, 0] },
  { name: 'ashwood', shape: 'ball', log: 'ashwood_log', leaves: 'ashwood_canopy', height: [5, 7], radius: [2.4, 3.2] },
  { name: 'obsidian_spire', shape: 'spire', log: 'spire_obsidian', leaves: 'violet_shard', height: [8, 16], radius: [1.4, 2.2] },
  { name: 'magma_coral', shape: 'crystal', log: 'magma_coral_stem', leaves: 'magma_coral_fan', height: [3, 6], radius: [2.0, 3.0] },
  { name: 'blaze_palm', shape: 'ball', log: 'blazewood_log', leaves: 'blaze_fronds', height: [8, 12], radius: [2.0, 2.8] },
  { name: 'dripcinder_spire', shape: 'spire', log: 'dripcinder_column', leaves: 'drip_tip', height: [5, 11], radius: [1.2, 1.8] },
  { name: 'phoenix_nest', shape: 'fungus', log: 'nest_twigs', leaves: 'phoenix_plume', height: [3, 5], radius: [2.0, 2.6] },
);

const SURF = (s: string, sub: string, stone: string, ceiling = 'cinder') => ({ surface: s, subsurface: sub, underwater: 'magma_block', stone, ceiling });
const GUARDS: MobSpawn = { mob: 'citadel_guard', weight: 10, group: [1, 2] };

EMBER_BIOMES.push(
  // ---- low (altitude ~0.1)
  biome({
    name: 'obsidian_shoals', displayName: 'Obsidian Shoals', ember: 'plains',
    climate: [0.85, 0.15, 0.2, 0.08],
    emberTerrain: { fill: -0.3, vertical: 0.1, shelves: 0.3, floor: 33, roof: 110, rough: 0.35, dunes: 0.4 },
    ...SURF('obsidian_sand', 'obsidian_sand', 'glass_slag'),
    trees: [],
    plants: [{ block: 'obsidian_shards', density: 0.05 }, { block: 'lava_bloom', density: 0.012 }],
    particles: [{ kind: 'ember', color: '#b88aff', rate: 4, glow: true }],
    skyColor: '#1e0c22', fogColor: '#3a1a3e', grassColor: '#6a3a9a',
    mobs: { day: [SLIMES, { ...DRAKES, weight: 18 }, HOUNDS] },
    structures: ['forge', ...EMBER_STRUCTS],
    hazards: ['lava shores', 'sharp shards'],
  }),
  biome({
    name: 'lavafall_cliffs', displayName: 'Lavafall Cliffs', ember: 'falls',
    climate: [0.92, 0.55, 0.3, 0.18],
    emberTerrain: { fill: 0.05, vertical: 0.9, shelves: 0.35, floor: 34, roof: 106, rough: 0.3 },
    ...SURF('scorched_basalt', 'scorched_basalt', 'magma_vein_rock', 'magma_vein_rock'),
    trees: [],
    plants: [{ block: 'cinder_reed', density: 0.06 }, { block: 'heat_shimmer_moss', density: 0.1 }],
    particles: [{ kind: 'ember', color: '#ffa02a', rate: 12, glow: true }, { kind: 'ash', color: '#4a2a1a', rate: 3 }],
    skyColor: '#4a1004', fogColor: '#8a2a08', grassColor: '#ff6a1a',
    mobs: { day: [{ ...DRAKES, weight: 25 }, SLIMES, BRUTES] },
    structures: ['basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['molten cascades', 'sheer drops'],
  }),
  biome({
    name: 'boiling_mire', displayName: 'Boiling Mire', ember: 'plains',
    climate: [0.55, 0.92, 0.2, 0.12],
    emberTerrain: { fill: -0.25, vertical: 0.15, shelves: 0.5, floor: 34, roof: 108, rough: 0.25 },
    ...SURF('boiling_mud', 'mire_clay', 'mire_clay'),
    trees: [],
    plants: [{ block: 'bubble_reed', density: 0.1 }, { block: 'mire_cap', density: 0.02 }],
    vents: [{ block: 'mud_vent', density: 0.006 }],
    particles: [{ kind: 'spore', color: '#c8a888', rate: 6 }, { kind: 'ash', color: '#8a6a5a', rate: 2 }],
    skyColor: '#2a1a10', fogColor: '#5a3a24', grassColor: '#8a6a3a',
    mobs: { day: [{ ...SLIMES, weight: 40 }, HOUNDS, WISPS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['mud slows you', 'scalding vents'],
  }),
  biome({
    name: 'slag_heaps', displayName: 'Slag Heaps', ember: 'ash',
    climate: [0.65, 0.08, 0.6, 0.15],
    emberTerrain: { fill: -0.15, vertical: 0.2, shelves: 0.4, floor: 37, roof: 108, rough: 0.5, dunes: 0.8 },
    ...SURF('slag_gravel', 'slag_gravel', 'iron_crust'),
    trees: [],
    plants: [{ block: 'rust_fern', density: 0.08 }, { block: 'scrap_thorn', density: 0.03 }],
    particles: [{ kind: 'dust', color: '#a8622a', rate: 4 }],
    skyColor: '#2a1a12', fogColor: '#5a3a24', grassColor: '#a8622a',
    mobs: { day: [{ ...GOLEMS, weight: 30 }, BRUTES, HOUNDS] },
    structures: ['forge', 'basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['Slag Golems'],
  }),
  // ---- middle (altitude ~0.3-0.55)
  biome({
    name: 'crimson_wilds', displayName: 'Crimson Wilds', ember: 'plains',
    climate: [0.62, 0.66, 0.12, 0.35],
    emberTerrain: { fill: -0.12, vertical: 0.3, shelves: 0.45, floor: 38, roof: 108, rough: 0.4 },
    ...SURF('crimson_nylium', 'cinder', 'cinder', 'crimson_wart'),
    trees: [{ tree: 'crimson_fungus', density: 0.009 }],
    plants: [{ block: 'crimson_roots', density: 0.14 }, { block: 'weeping_vines', density: 0.08, placement: 'ceiling' }],
    particles: [{ kind: 'spore', color: '#ff4a5a', rate: 10, glow: true }],
    skyColor: '#3a0810', fogColor: '#6a1420', grassColor: '#c81a2a',
    mobs: { day: [{ ...BRUTES, weight: 35 }, HOUNDS, SLIMES] },
    structures: ['citadel', 'forge', ...EMBER_STRUCTS],
    hazards: ['Ember Brutes'],
  }),
  biome({
    name: 'warped_woods', displayName: 'Warped Woods', ember: 'plains',
    climate: [0.22, 0.66, 0.62, 0.42],
    emberTerrain: { fill: -0.12, vertical: 0.35, shelves: 0.45, floor: 38, roof: 108, rough: 0.4 },
    ...SURF('warped_nylium', 'cinder', 'cinder', 'warped_wart'),
    trees: [{ tree: 'warped_fungus', density: 0.009 }],
    plants: [{ block: 'warped_roots', density: 0.14 }, { block: 'twisting_sprouts', density: 0.03 }],
    particles: [{ kind: 'spore', color: '#3affd8', rate: 10, glow: true }],
    skyColor: '#081a22', fogColor: '#103a44', grassColor: '#1a9a9a',
    mobs: { day: [{ ...WISPS, weight: 30 }, { mob: 'ana_stalker', weight: 20 }, HOUNDS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['Ana Stalkers'],
  }),
  biome({
    name: 'bone_valley', displayName: 'Bone Valley', ember: 'plains',
    climate: [0.18, 0.32, 0.72, 0.3],
    emberTerrain: { fill: -0.2, vertical: 0.5, shelves: 0.3, floor: 36, roof: 108, rough: 0.3, canyons: 0.4 },
    ...SURF('bone_soil', 'bone_soil', 'soul_stone'),
    trees: [{ tree: 'rib_arch', density: 0.006 }],
    plants: [{ block: 'marrow_grass', density: 0.1 }, { block: 'skull_bloom', density: 0.01 }],
    particles: [{ kind: 'mote', color: '#e8e0d0', rate: 5 }, { kind: 'ash', color: '#8a8070', rate: 2 }],
    skyColor: '#141c20', fogColor: '#3a4a50', grassColor: '#d8c8a8',
    mobs: { day: [{ mob: 'bone_archer', weight: 45, group: [1, 3] }, WISPS, GOLEMS] },
    structures: ['citadel', ...EMBER_STRUCTS],
    hazards: ['Bone Archers'],
  }),
  biome({
    name: 'ember_savanna', displayName: 'Ember Savanna', ember: 'plains',
    climate: [0.72, 0.32, 0.08, 0.42],
    emberTerrain: { fill: -0.22, vertical: 0.15, shelves: 0.6, floor: 39, roof: 110, rough: 0.25 },
    ...SURF('ember_straw', 'cinder', 'scorched_stone'),
    trees: [{ tree: 'ashwood', density: 0.003 }],
    plants: [{ block: 'flame_grass', density: 0.16 }, { block: 'cinder_bush', density: 0.02 }],
    particles: [{ kind: 'ember', color: '#ffc040', rate: 6, glow: true }],
    skyColor: '#3a1a04', fogColor: '#7a3a0a', grassColor: '#d8902a',
    mobs: { day: [{ ...HOUNDS, weight: 45 }, DRAKES, BRUTES] },
    structures: ['forge', 'basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['hound packs', 'grass fires'],
  }),
  biome({
    name: 'glowstone_hollows', displayName: 'Glowstone Hollows', ember: 'plains',
    climate: [0.45, 0.22, 0.55, 0.52],
    emberTerrain: { fill: 0.05, vertical: 0.25, shelves: 0.3, floor: 38, roof: 104, rough: 0.5 },
    ...SURF('lumin_dust', 'lumin_dust', 'glow_veined_rock', 'glow_veined_rock'),
    trees: [],
    plants: [{ block: 'lightcap', density: 0.03 }, { block: 'glowshard', density: 0.09, placement: 'ceiling' }],
    particles: [{ kind: 'mote', color: '#fff0a0', rate: 10, glow: true }],
    skyColor: '#3a2a0a', fogColor: '#8a6a2a', grassColor: '#ffe070',
    mobs: { day: [{ ...WISPS, weight: 35 }, SLIMES, GOLEMS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['glare'],
  }),
  biome({
    name: 'obsidian_spires', displayName: 'Obsidian Spires', ember: 'prisms',
    climate: [0.92, 0.3, 0.72, 0.55],
    emberTerrain: { fill: -0.05, vertical: 1, shelves: 0.1, floor: 37, roof: 108, rough: 0.2 },
    ...SURF('obsidian_scree', 'obsidian_scree', 'glass_slag', 'obsidian_scree'),
    trees: [{ tree: 'obsidian_spire', density: 0.006 }],
    plants: [{ block: 'void_grass', density: 0.08 }, { block: 'spire_moss', density: 0.06 }],
    particles: [{ kind: 'mote', color: '#b88aff', rate: 6, glow: true }],
    skyColor: '#120a1e', fogColor: '#2a1a40', grassColor: '#8a5ad8',
    mobs: { day: [{ mob: 'ana_stalker', weight: 25 }, DRAKES, GOLEMS] },
    structures: ['basalt_ziggurat', ...EMBER_STRUCTS],
    hazards: ['spire drops', 'Ana Stalkers'],
  }),
  biome({
    name: 'magma_reef', displayName: 'Magma Reef', ember: 'plains',
    climate: [0.88, 0.78, 0.25, 0.3],
    emberTerrain: { fill: -0.2, vertical: 0.3, shelves: 0.4, floor: 35, roof: 108, rough: 0.6, islands: 0.25 },
    ...SURF('magma_coral_block', 'cinder', 'smoldering_cinder'),
    trees: [{ tree: 'magma_coral', density: 0.012 }],
    plants: [{ block: 'ember_anemone', density: 0.04 }, { block: 'heat_polyp', density: 0.05 }],
    particles: [{ kind: 'bubble', color: '#ffa040', rate: 0 }, { kind: 'ember', color: '#ff8a3a', rate: 8, glow: true }],
    skyColor: '#3a0e04', fogColor: '#7a2a0a', grassColor: '#ff6a2a',
    mobs: { day: [{ ...SLIMES, weight: 35 }, DRAKES, WISPS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['hot coral', 'lava pockets'],
  }),
  biome({
    name: 'blaze_jungle', displayName: 'Blaze Jungle', ember: 'plains',
    climate: [0.95, 0.92, 0.5, 0.45],
    emberTerrain: { fill: -0.1, vertical: 0.4, shelves: 0.5, floor: 38, roof: 110, rough: 0.45 },
    ...SURF('scorch_moss', 'cinder', 'smoldering_cinder', 'scorch_moss'),
    trees: [{ tree: 'blaze_palm', density: 0.012 }],
    plants: [{ block: 'pyre_lily', density: 0.03 }, { block: 'flare_vine', density: 0.07, placement: 'ceiling' }],
    particles: [{ kind: 'firefly', color: '#ffc040', rate: 8, glow: true }],
    skyColor: '#3a2004', fogColor: '#7a4a0a', grassColor: '#d8a02a',
    mobs: { day: [{ ...DRAKES, weight: 20 }, BRUTES, HOUNDS] },
    structures: ['forge', ...EMBER_STRUCTS],
    hazards: ['Magma Drakes'],
  }),
  // ---- high (altitude ~0.7-0.9)
  biome({
    name: 'hanging_gardens', displayName: 'Hanging Gardens', ember: 'plains',
    climate: [0.5, 0.86, 0.62, 0.76],
    emberTerrain: { fill: -0.05, vertical: 0.2, shelves: 0.7, floor: 38, roof: 112, rough: 0.3 },
    ...SURF('garden_moss', 'cinder', 'root_cinder', 'root_cinder'),
    trees: [{ tree: 'emberwood', density: 0.004 }],
    plants: [{ block: 'ember_vines', density: 0.16, placement: 'ceiling' }, { block: 'lantern_pod', density: 0.04, placement: 'ceiling' }],
    particles: [{ kind: 'firefly', color: '#ffd070', rate: 10, glow: true }, { kind: 'leaf', color: '#6a7a2a', rate: 3 }],
    skyColor: '#1e2408', fogColor: '#4a5a1a', grassColor: '#7a9a2a',
    mobs: { day: [{ ...WISPS, weight: 35 }, DRAKES] },
    structures: [...EMBER_STRUCTS],
    hazards: ['long falls'],
  }),
  biome({
    name: 'stalactite_forest', displayName: 'Stalactite Forest', ember: 'plains',
    climate: [0.4, 0.5, 0.18, 0.86],
    emberTerrain: { fill: 0, vertical: 0.85, shelves: 0.2, floor: 38, roof: 100, rough: 0.3 },
    ...SURF('dripcinder', 'dripcinder', 'dripcinder', 'dripcinder'),
    trees: [{ tree: 'dripcinder_spire', density: 0.012 }],
    plants: [{ block: 'cave_ember_moss', density: 0.1 }, { block: 'drip_bulb', density: 0.05, placement: 'ceiling' }],
    particles: [{ kind: 'dust', color: '#a86a4a', rate: 4 }],
    skyColor: '#2a100a', fogColor: '#5a2a1a', grassColor: '#a85a3a',
    mobs: { day: [{ ...GOLEMS, weight: 25 }, { mob: 'hyperbat', weight: 20, group: [2, 4] }, HOUNDS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['dripstone points'],
  }),
  biome({
    name: 'floating_ash_isles', displayName: 'Floating Ash Isles', ember: 'shattered',
    climate: [0.18, 0.12, 0.5, 0.92],
    emberTerrain: { fill: -0.45, vertical: 0.2, shelves: 0.2, floor: 30, roof: 116, rough: 0.6, islands: 0.9 },
    ...SURF('ash_turf', 'cloud_ash', 'ashstone'),
    trees: [{ tree: 'charred_tree', density: 0.003 }],
    plants: [{ block: 'ash_lily', density: 0.03 }, { block: 'drift_puff', density: 0.05 }],
    particles: [{ kind: 'ash', color: '#c8c2bc', rate: 14 }],
    skyColor: '#3a3634', fogColor: '#7a7470', grassColor: '#b8b2ac',
    mobs: { day: [{ ...DRAKES, weight: 30 }, WISPS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['long falls', 'Magma Drakes'],
  }),
  biome({
    name: 'phoenix_roost', displayName: 'Phoenix Roost', ember: 'plains',
    climate: [0.95, 0.55, 0.88, 0.9],
    emberTerrain: { fill: -0.25, vertical: 0.4, shelves: 0.3, floor: 36, roof: 114, rough: 0.4, islands: 0.4 },
    ...SURF('aurum_rock', 'aurum_rock', 'aurum_rock', 'aurum_rock'),
    trees: [{ tree: 'phoenix_nest', density: 0.004 }],
    plants: [{ block: 'fire_feather', density: 0.04 }, { block: 'sunspark', density: 0.02 }],
    particles: [{ kind: 'ember', color: '#fff0a0', rate: 12, glow: true }],
    skyColor: '#4a3004', fogColor: '#a8701a', grassColor: '#ffd040',
    mobs: { day: [{ ...DRAKES, weight: 35 }, GUARDS] },
    structures: [...EMBER_STRUCTS],
    hazards: ['Magma Drakes', 'burning plumes'],
  }),
  biome({
    name: 'smoke_veil', displayName: 'Smoke Veil', ember: 'plains',
    climate: [0.12, 0.72, 0.32, 0.72],
    emberTerrain: { fill: -0.08, vertical: 0.3, shelves: 0.5, floor: 38, roof: 110, rough: 0.4 },
    ...SURF('soot_turf', 'smog_rock', 'smog_rock', 'smog_rock'),
    trees: [{ tree: 'charred_tree', density: 0.002 }],
    plants: [{ block: 'soot_fern', density: 0.1 }, { block: 'smoke_bell', density: 0.02 }],
    particles: [{ kind: 'ash', color: '#4a4448', rate: 18 }, { kind: 'dust', color: '#6a6266', rate: 6 }],
    skyColor: '#141214', fogColor: '#2e2a2c', grassColor: '#4a4448',
    mobs: { day: [{ mob: 'ana_stalker', weight: 25 }, { ...WISPS, weight: 15 }, BRUTES] },
    structures: [...EMBER_STRUCTS],
    hazards: ['smoke hides the drops', 'Ana Stalkers'],
  }),
);
