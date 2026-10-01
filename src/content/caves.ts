// Playtest expansion: 12 more cave biomes (15 in all). An underground biome decorates cave
// floors (`surface`) and ceilings (`ceiling`) and grows floor and ceiling plants; it is picked
// from its climate point [humidity, weirdness, depth, 0] (depth 0 just under the surface,
// 1 at the bottom of the world). Caves far from every point stay plain stone.

import type { BiomeDef, BlockDef, Hex, MobSpawn, TextureDef, TexturePattern, TreeDef } from './types';

export const CAVE_TEXTURES: TextureDef[] = [];
export const CAVE_BLOCKS: BlockDef[] = [];

interface Opt extends Partial<BlockDef> {
  amount?: number;
  density?: number;
}

function tex(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): string {
  const t: TextureDef = { name, pattern, colors };
  if (o.amount !== undefined) t.amount = o.amount;
  if (o.density !== undefined) t.density = o.density;
  CAVE_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  CAVE_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1.5, ...strip(o) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  CAVE_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

// ---------------------------------------------------------------- blocks
cube('sky_crystal_block', 'crystal', ['#8ac8ff', '#5aa0e8', '#e8f8ff'], { emission: 6, hardness: 1.5 });
cube('crystal_crust', 'cells', ['#5a6a8a', '#4a5a7a', '#a8d8ff'], { hardness: 2 });
plant('sky_crystal_cluster', 'crystal', ['#a8d8ff', '#6ab0f0', '#ffffff'], { emission: 10 });
plant('crystal_icicle', 'bud', ['#4a6a9a', '#8ac0f0', '#e8f8ff'], { emission: 6 });

cube('cave_mycelium', 'speckle', ['#6a5a6a', '#5a4a5a', '#c8a8d8'], { density: 0.1, hardness: 0.8 });
cube('spore_rock', 'noise', ['#5a5060', '#4e4454'], { amount: 0.1 });
CAVE_TEXTURES.push({ name: 'cave_shroom_stem_side', pattern: 'bands', colors: ['#d8d0c8', '#c0b8b0'] }, { name: 'cave_shroom_stem_top', pattern: 'log_top', colors: ['#e8e0d8', '#c8c0b8', '#8a7a6a'] });
CAVE_BLOCKS.push({ name: 'cave_shroom_stem', render: 'opaque', solid: true, textures: { top: 'cave_shroom_stem_top', bottom: 'cave_shroom_stem_top', side: 'cave_shroom_stem_side' }, hardness: 1, tags: ['log'] });
tex('cave_shroom_cap', 'cap', ['#8a4ab8', '#e8a8ff']);
CAVE_BLOCKS.push({ name: 'cave_shroom_cap', render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: 'cave_shroom_cap' }, emission: 7, hardness: 0.3, tags: ['leaves'] });
plant('cave_toadstool', 'mushroom', ['#d8c8b8', '#b84ad8'], { emission: 5 });
plant('hanging_spores', 'bud', ['#4a3a5a', '#8a6aa8', '#e8c8ff'], { emission: 4 });

cube('cave_ice', 'cells', ['#a8d0e8', '#88b8d8', '#d8f0ff'], { hardness: 0.8, slows: 0.95 });
cube('frost_rock', 'speckle', ['#6a7a8a', '#5a6a7a', '#d8f0ff'], { density: 0.08 });
plant('frost_spike', 'crystal', ['#c8e8ff', '#a8d0f0', '#ffffff'], { emission: 2 });
plant('icicle', 'bud', ['#8ab0d0', '#c8e0f0', '#ffffff']);

cube('cave_basalt', 'columns', ['#3a3434', '#2a2626', '#5a4a44'], { hardness: 1.5 });
cube('smolder_rock', 'cracks', ['#3a2a24', '#2a1e1a', '#ff6a2a'], { density: 0.15, emission: 6, hardness: 1.5, damage: 1, tags: ['infiniburn'] });
plant('magma_bloom', 'flower', ['#3a1a10', '#3a1a10', '#ff6a1a'], { emission: 10 });
plant('ember_drip', 'bud', ['#3a1a10', '#a83a1a', '#ffb04a'], { emission: 8 });

cube('grotto_clay', 'noise', ['#5a6a7a', '#4e5e6e'], { amount: 0.08, hardness: 0.8 });
cube('silk_rock', 'speckle', ['#4a5060', '#3e4454', '#c8f0ff'], { density: 0.05 });
plant('glowworm_silk', 'plant', ['#2a4a5a', '#8affff'], { density: 0.35, emission: 12 });
plant('grotto_fern', 'plant', ['#2a5a4a', '#4a8a6a'], { density: 0.5 });

cube('fossil_sand', 'speckle', ['#c8b898', '#b8a888', '#f0e8d0'], { density: 0.08, hardness: 0.6 });
cube('ammonite_rock', 'cells', ['#8a7a6a', '#7a6a5a', '#e8d8c0'], { hardness: 2 });
plant('bone_shard', 'bud', ['#c8c0a8', '#e8e0d0', '#ffffff']);
plant('fossil_root', 'plant', ['#8a7a6a', '#c8b8a0'], { density: 0.4 });

cube('grotto_silt', 'noise', ['#6a7a6a', '#5e6e5e'], { amount: 0.1, hardness: 0.6, slows: 0.85 });
cube('wet_stone', 'noise', ['#4a5a5e', '#3e4e52'], { amount: 0.08 });
plant('pale_reed', 'plant', ['#a8b8b0', '#d8e8e0'], { density: 0.45 });
plant('drip_moss', 'plant', ['#3a6a5a', '#6aa88a'], { density: 0.4 });

cube('web_silk_floor', 'speckle', ['#c8c8c0', '#b0b0a8', '#ffffff'], { density: 0.2, hardness: 0.5, slows: 0.7 });
cube('cocoon_rock', 'cells', ['#6a6460', '#5a5450', '#d8d0c8'], { hardness: 1.5 });
plant('egg_sac', 'bud', ['#c8c0a8', '#e8e0c8', '#a8ff8a'], { emission: 3 });
plant('cave_web', 'speckle', ['#e8e8e8', '#c8c8c8', '#ffffff'], { density: 0.25, slows: 0.25 });

cube('root_soil', 'noise', ['#5a4430', '#4a3828'], { amount: 0.1, hardness: 0.6 });
cube('root_tangle', 'bands', ['#6a4a30', '#4a3420', '#8a6a44'], { amount: 0.08, hardness: 1 });
plant('long_roots', 'plant', ['#7a5a3a', '#a88a5a'], { density: 0.4 });
plant('root_sprout', 'bud', ['#4a5a2a', '#6a8a3a', '#c8e88a']);

cube('brimstone', 'speckle', ['#c8a82a', '#a88a1a', '#fff06a'], { density: 0.1, hardness: 1.2 });
cube('sulfur_crust', 'cracks', ['#8a7a1a', '#6a5a10', '#ffe84a'], { density: 0.15, emission: 4 });
plant('sulfur_crystal', 'crystal', ['#ffe84a', '#d8c02a', '#ffffff'], { emission: 6 });
plant('yellow_drip', 'bud', ['#6a5a10', '#c8a82a', '#fff08a'], { emission: 3 });

cube('lattice_stone', 'cage', ['#3a3a5a', '#2a2a4a', '#8a8aff'], { hardness: 2.5, emission: 3 });
cube('lattice_vault', 'cells', ['#2a2a44', '#1e1e36', '#6a6ae8'], { hardness: 2.5 });
plant('phase_shard', 'crystal', ['#8a8aff', '#5a5ae8', '#ffffff'], { emission: 9 });
plant('lattice_drip', 'bud', ['#2a2a4a', '#5a5aa8', '#c8c8ff'], { emission: 5 });

cube('rock_salt', 'cells', ['#e8d8d8', '#d8c8c8', '#ffffff'], { hardness: 1.2 });
cube('halite_crust', 'crystal', ['#f0e0e8', '#d8c0c8', '#ffffff'], { hardness: 1.5 });
plant('halite_spire', 'crystal', ['#f8e8f0', '#e8c8d8', '#ffffff'], { emission: 2 });
plant('salt_icicle', 'bud', ['#d8c8c8', '#f0e0e0', '#ffffff']);

export const CAVE_TREES: TreeDef[] = [{ name: 'cave_mushroom', shape: 'mushroom', log: 'cave_shroom_stem', leaves: 'cave_shroom_cap', height: [3, 6], radius: [2.2, 3.0] }];

// ---------------------------------------------------------------- biomes
const CAVE: MobSpawn[] = [
  { mob: 'shambler', weight: 60 },
  { mob: 'bone_archer', weight: 40 },
  { mob: 'hyperbat', weight: 30, group: [3, 6] },
  { mob: 'crystal_crawler', weight: 20 },
  { mob: 'ore_mimic', weight: 6 },
  { mob: 'phase_golem', weight: 4 },
];

function cave(b: Pick<BiomeDef, 'name' | 'displayName' | 'climate' | 'surface' | 'ceiling' | 'particles' | 'fogColor'> & { floorPlants: [string, number][]; ceilPlants: [string, number][]; trees?: BiomeDef['trees']; mobs?: MobSpawn[] }): BiomeDef {
  return {
    name: b.name,
    displayName: b.displayName,
    kind: 'underground',
    climate: b.climate,
    surface: b.surface,
    subsurface: b.surface,
    underwater: b.surface,
    ceiling: b.ceiling,
    heightBias: 0,
    heightScale: 1,
    trees: b.trees ?? [],
    plants: [...b.floorPlants.map(([block, density]) => ({ block, density, placement: 'floor' as const })), ...b.ceilPlants.map(([block, density]) => ({ block, density, placement: 'ceiling' as const }))],
    particles: b.particles,
    frozenWater: false,
    precipitation: 'none',
    skyColor: '#202428',
    fogColor: b.fogColor,
    grassColor: '#79c05a',
    foliageColor: '#5aa832',
    waterColor: '#3f76e4',
    mobs: { cave: [...(b.mobs ?? []), ...CAVE] },
    structures: [],
  };
}

export const CAVE_BIOMES: BiomeDef[] = [
  cave({ name: 'crystal_geodes', displayName: 'Crystal Geodes', climate: [0.5, 0.82, 0.6, 0], surface: 'sky_crystal_block', ceiling: 'crystal_crust', floorPlants: [['sky_crystal_cluster', 0.08]], ceilPlants: [['crystal_icicle', 0.08]], particles: [{ kind: 'mote', color: '#a8d8ff', rate: 8, glow: true }], fogColor: '#1a2a4a', mobs: [{ mob: 'crystal_crawler', weight: 40 }] }),
  cave({ name: 'mushroom_caverns', displayName: 'Mushroom Caverns', climate: [0.75, 0.72, 0.4, 0], surface: 'cave_mycelium', ceiling: 'spore_rock', trees: [{ tree: 'cave_mushroom', density: 0.01 }], floorPlants: [['cave_toadstool', 0.1]], ceilPlants: [['hanging_spores', 0.06]], particles: [{ kind: 'spore', color: '#e8a8ff', rate: 10, glow: true }], fogColor: '#2a1e34' }),
  cave({ name: 'frozen_caves', displayName: 'Frozen Caves', climate: [0.3, 0.28, 0.25, 0], surface: 'cave_ice', ceiling: 'frost_rock', floorPlants: [['frost_spike', 0.06]], ceilPlants: [['icicle', 0.12]], particles: [{ kind: 'snow', color: '#e8f8ff', rate: 3 }], fogColor: '#2a3a4a', mobs: [{ mob: 'frostbite_wraith', weight: 30 }] }),
  cave({ name: 'magma_caves', displayName: 'Magma Caves', climate: [0.1, 0.6, 0.88, 0], surface: 'cave_basalt', ceiling: 'smolder_rock', floorPlants: [['magma_bloom', 0.04]], ceilPlants: [['ember_drip', 0.06]], particles: [{ kind: 'ember', color: '#ff8a2a', rate: 8, glow: true }], fogColor: '#3a1a0e', mobs: [{ mob: 'lava_slime', weight: 30, group: [1, 2] }] }),
  cave({ name: 'glowworm_grotto', displayName: 'Glowworm Grotto', climate: [0.72, 0.2, 0.5, 0], surface: 'grotto_clay', ceiling: 'silk_rock', floorPlants: [['grotto_fern', 0.1]], ceilPlants: [['glowworm_silk', 0.2]], particles: [{ kind: 'firefly', color: '#8affff', rate: 8, glow: true }], fogColor: '#10222e' }),
  cave({ name: 'fossil_galleries', displayName: 'Fossil Galleries', climate: [0.22, 0.75, 0.7, 0], surface: 'fossil_sand', ceiling: 'ammonite_rock', floorPlants: [['bone_shard', 0.06]], ceilPlants: [['fossil_root', 0.06]], particles: [{ kind: 'dust', color: '#e8d8c0', rate: 5 }], fogColor: '#2e2a22', mobs: [{ mob: 'bone_archer', weight: 40, group: [1, 2] }] }),
  cave({ name: 'drowned_grottos', displayName: 'Drowned Grottos', climate: [0.95, 0.5, 0.3, 0], surface: 'grotto_silt', ceiling: 'wet_stone', floorPlants: [['pale_reed', 0.1]], ceilPlants: [['drip_moss', 0.1]], particles: [{ kind: 'bubble', color: '#a8e8ff', rate: 4 }], fogColor: '#14262a', mobs: [{ mob: 'drowned_sentinel', weight: 30 }] }),
  cave({ name: 'webbed_hollows', displayName: 'Webbed Hollows', climate: [0.4, 0.42, 0.55, 0], surface: 'web_silk_floor', ceiling: 'cocoon_rock', floorPlants: [['egg_sac', 0.05]], ceilPlants: [['cave_web', 0.12]], particles: [{ kind: 'dust', color: '#e8e8e0', rate: 4 }], fogColor: '#24221e', mobs: [{ mob: 'web_weaver', weight: 80, group: [1, 3] }] }),
  cave({ name: 'root_caverns', displayName: 'Root Caverns', climate: [0.85, 0.15, 0.12, 0], surface: 'root_soil', ceiling: 'root_tangle', floorPlants: [['root_sprout', 0.08]], ceilPlants: [['long_roots', 0.2]], particles: [{ kind: 'spore', color: '#c8e88a', rate: 4 }], fogColor: '#2a2214' }),
  cave({ name: 'sulfur_pits', displayName: 'Sulfur Pits', climate: [0.12, 0.25, 0.75, 0], surface: 'brimstone', ceiling: 'sulfur_crust', floorPlants: [['sulfur_crystal', 0.06]], ceilPlants: [['yellow_drip', 0.08]], particles: [{ kind: 'spore', color: '#fff06a', rate: 6 }], fogColor: '#3a3410', mobs: [{ mob: 'phase_creeper', weight: 30 }] }),
  cave({ name: 'hyperlattice_caves', displayName: 'Hyperlattice Caves', climate: [0.55, 0.98, 0.9, 0], surface: 'lattice_stone', ceiling: 'lattice_vault', floorPlants: [['phase_shard', 0.06]], ceilPlants: [['lattice_drip', 0.06]], particles: [{ kind: 'mote', color: '#8a8aff', rate: 10, glow: true }], fogColor: '#14142e', mobs: [{ mob: 'phase_golem', weight: 20 }, { mob: 'ana_stalker', weight: 20 }] }),
  cave({ name: 'salt_caverns', displayName: 'Salt Caverns', climate: [0.05, 0.5, 0.55, 0], surface: 'rock_salt', ceiling: 'halite_crust', floorPlants: [['halite_spire', 0.06]], ceilPlants: [['salt_icicle', 0.1]], particles: [{ kind: 'mote', color: '#ffe8f0', rate: 4 }], fogColor: '#3a3034' }),
];
