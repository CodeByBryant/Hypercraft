// Playtest expansion: 24 more Surface land biomes and 3 more oceans. Each has its own surface
// block, its own plants and (mostly) its own trees, many with new tree shapes (giant redwoods,
// mangroves on prop roots, baobabs, palms, pines, weeping wisteria, crystal spires) and terrain
// styles (karst pillars, hoodoos, glaciers). Pure data, like terrain.ts.

import type { BiomeDef, BlockDef, Hex, MobSpawn, TextureDef, TexturePattern, TreeDef } from './types';

export const WILDS_TEXTURES: TextureDef[] = [];
export const WILDS_BLOCKS: BlockDef[] = [];

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
  WILDS_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  WILDS_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1, ...strip(o) });
}

/** Grass-like block: a top over a soil fringe (not biome-tinted: these keep their own colour). */
function turf(name: string, top: Hex[], dirt: Hex[], o: Opt = {}): void {
  tex(`${name}_top`, 'grass_top', top, { amount: 0.12 });
  tex(`${name}_side`, 'grass_side', [dirt[0]!, dirt[1] ?? dirt[0]!, top[0]!]);
  tex(`${name}_soil`, 'noise', dirt, { amount: 0.12 });
  WILDS_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { top: `${name}_top`, side: `${name}_side`, bottom: `${name}_soil` }, hardness: 0.6, ...strip(o) });
}

function log(name: string, bark: Hex[], rings: Hex[], pattern: TexturePattern = 'log_side', o: Opt = {}): void {
  tex(`${name}_side`, pattern, bark);
  tex(`${name}_top`, 'log_top', rings);
  WILDS_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { top: `${name}_top`, bottom: `${name}_top`, side: `${name}_side` }, hardness: 2, tags: ['log'], ...strip(o) });
}

function leaves(name: string, colors: Hex[], o: Opt & { fruit?: Hex; pattern?: TexturePattern } = {}): void {
  const { fruit, pattern, ...rest } = o;
  if (fruit) tex(name, 'fruit', [colors[0]!, colors[1] ?? colors[0]!, fruit], { density: 0.28 });
  else tex(name, pattern ?? 'leaves', colors, { density: o.density ?? 0.3 });
  WILDS_BLOCKS.push({ name, render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: name }, hardness: 0.2, tags: ['leaves'], ...strip(rest) });
}

function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  WILDS_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, replaceable: true, hardness: 0, tags: ['plant'], ...strip(o) });
}

// ---------------------------------------------------------------- blocks

// Redwood Forest
turf('redwood_duff', ['#7a4a2a', '#6a3e22'], ['#4a2e1e', '#3e2618']);
log('redwood_log', ['#8a3a22', '#6a2a18'], ['#a85a3a', '#8a4428', '#5a2a1a']);
leaves('redwood_needles', ['#2e5a2a', '#244a20'], { density: 0.34 });
plant('sword_fern', 'plant', ['#2e6a2a', '#4a8a3a'], { density: 0.55 });
plant('redwood_sorrel', 'flower', ['#3a7a3a', '#3a7a3a', '#f0c8d8']);
// Mangrove Swamp
cube('mangrove_mud', 'noise', ['#4a3a2e', '#3e3026'], { amount: 0.1, hardness: 0.5, slows: 0.7 });
log('mangrove_log', ['#5a3a2a', '#4a2e20'], ['#6a4a34', '#5a3a28', '#3a2418']);
leaves('mangrove_leaves', ['#3a6a2a', '#2e5a22']);
plant('mangrove_propagule', 'bud', ['#3a5a2a', '#5a7a3a', '#a8c86a']);
plant('mud_lily', 'flower', ['#3a5a2a', '#3a5a2a', '#f8f0e0']);
// Baobab Savanna
cube('red_earth', 'noise', ['#a8502a', '#94461f'], { amount: 0.08, hardness: 0.6 });
log('baobab_log', ['#a8988a', '#8a7a6c'], ['#c8b8a8', '#a8988a', '#6a5a4a']);
leaves('baobab_leaves', ['#6a8a2a', '#5a7a20'], { density: 0.4 });
plant('savanna_aloe', 'bud', ['#4a7a4a', '#6a9a5a', '#e86a3a']);
plant('dry_tussock', 'plant', ['#b89a5a', '#d8c07a'], { density: 0.6 });
// Red Outback
cube('outback_dirt', 'speckle', ['#c8602a', '#b0521f', '#e8a06a'], { density: 0.08, hardness: 0.6 });
log('ghost_gum_log', ['#e8e4dc', '#d0ccc4'], ['#f0ece4', '#d8d4cc', '#a8a49c']);
leaves('gum_leaves', ['#8aa86a', '#7a985a']);
plant('spinifex', 'plant', ['#a8a05a', '#c8c07a'], { density: 0.6 });
plant('desert_pea', 'flower', ['#4a6a3a', '#4a6a3a', '#e82a2a']);
// Tundra
turf('tundra_moss', ['#7a8a5a', '#6a7a4a'], ['#5a4a3a', '#4a3e30']);
plant('arctic_cotton', 'flower', ['#6a7a5a', '#6a7a5a', '#ffffff']);
plant('reindeer_lichen', 'speckle', ['#c8c8b0', '#a8a890', '#e8e8d0'], { density: 0.3 });
// Glacier
cube('glacier_ice', 'cells', ['#a8d8f0', '#88c0e0', '#d8f0ff'], { hardness: 0.8 });
cube('glacial_rock', 'speckle', ['#7a8a94', '#6a7a84', '#c8e0f0'], { density: 0.06, hardness: 1.5 });
plant('ice_bloom', 'crystal', ['#c8f0ff', '#88d0f0', '#ffffff'], { emission: 3 });
plant('snow_lichen', 'speckle', ['#d8e8e8', '#b8d0d0', '#ffffff'], { density: 0.25 });
// Aspen Parkland
turf('parkland_turf', ['#8aa84a', '#7a983a'], ['#5a4a32', '#4e4028']);
log('aspen_log', ['#e8e8e0', '#3a3a34'], ['#f0f0e8', '#d8d8d0', '#8a8a80'], 'bands');
leaves('aspen_leaves', ['#e8c02a', '#d8a81a']);
plant('fireweed', 'flower', ['#4a6a3a', '#4a6a3a', '#d84a9a']);
plant('yarrow', 'flower', ['#5a7a4a', '#5a7a4a', '#f0ecd8']);
// Rainforest
turf('rainforest_floor', ['#3a6a2a', '#2e5a22'], ['#3a2a1a', '#2e2214']);
log('kapok_log', ['#8a8070', '#6a6254'], ['#a89a84', '#8a7e6a', '#5a5040']);
leaves('kapok_leaves', ['#2a7a2a', '#1e6a1e'], { density: 0.36 });
plant('bromeliad', 'bud', ['#2a6a3a', '#4a8a4a', '#e83a6a']);
plant('heliconia', 'flower', ['#2a6a2a', '#2a6a2a', '#ff8a1a']);
// Cloud Forest
turf('cloud_turf', ['#5a8a5a', '#4a7a4a'], ['#4a3e30', '#3e3428']);
log('mossy_bark_log', ['#4a5a3a', '#3a4a2e'], ['#6a5a44', '#5a4a38', '#3a5a2a'], 'cracks');
leaves('cloud_leaves', ['#4a8a5a', '#3a7a4a'], { density: 0.38 });
plant('tree_fern', 'plant', ['#3a7a3a', '#5a9a4a'], { density: 0.6 });
plant('mist_orchid', 'flower', ['#3a6a3a', '#3a6a3a', '#e8c8ff']);
// Glowshroom Forest
cube('glow_mycelium', 'speckle', ['#3a3a5a', '#2e2e4a', '#6ae8ff'], { density: 0.08, emission: 3, hardness: 0.6 });
log('glowshroom_stem', ['#d8d8e8', '#b8b8d0'], ['#e8e8f0', '#c8c8d8', '#6ae8ff'], 'bands');
leaves('glowshroom_cap', ['#2a8ae8', '#6ae8ff'], { pattern: 'cap', emission: 11 });
plant('lumen_shroom', 'mushroom', ['#c8d8e8', '#4ad8ff'], { emission: 9 });
plant('spore_puff', 'bud', ['#3a4a6a', '#6a8aaa', '#c8f0ff'], { emission: 4 });
// Crystal Fields
cube('quartz_sand', 'speckle', ['#e8e0e8', '#d0c8d8', '#ffffff'], { density: 0.1, hardness: 0.5 });
log('quartz_pillar', ['#f0e8f8', '#d8c8e8'], ['#ffffff', '#e8d8f8', '#b89ad8'], 'crystal', { tags: ['pillar'] });
leaves('prism_tip', ['#c8a8ff', '#ffffff'], { pattern: 'crystal', emission: 10 });
plant('crystal_grass', 'crystal', ['#d8c8f0', '#b8a8e0', '#ffffff'], { emission: 2 });
plant('prism_flower', 'flower', ['#8a7aa8', '#8a7aa8', '#ff8aff'], { emission: 4 });
// Petrified Forest
cube('petrified_soil', 'speckle', ['#a88a6a', '#94785a', '#d8b88a'], { density: 0.08, hardness: 0.7 });
log('petrified_log', ['#8a7a6a', '#a8604a'], ['#c8907a', '#a87060', '#e8c8a8'], 'bands', { hardness: 4, tags: ['pillar'] });
plant('stone_fern', 'plant', ['#7a7a6a', '#a8a890'], { density: 0.5 });
plant('agate_bud', 'bud', ['#6a5a4a', '#a8603a', '#e8a8c8']);
// Highland Moor
turf('moor_peat', ['#6a5a3a', '#5a4e30'], ['#3a2e22', '#30261c']);
plant('cotton_grass', 'flower', ['#6a7a4a', '#6a7a4a', '#ffffff']);
plant('bog_myrtle', 'bud', ['#4a5a2a', '#6a7a3a', '#a88a4a']);
// Karst Pillars
turf('karst_turf', ['#5a9a4a', '#4a8a3a'], ['#8a8a7a', '#7a7a6a']);
cube('karst_limestone', 'bands', ['#c8c8b8', '#b0b0a0', '#d8d8c8'], { amount: 0.05, hardness: 1.5 });
log('cliff_pine_log', ['#6a4a34', '#5a3e2a'], ['#8a6a4a', '#6a4e34', '#4a3424']);
leaves('cliff_pine_needles', ['#2a5a3a', '#204a30'], { density: 0.34 });
plant('cliff_orchid', 'flower', ['#3a6a3a', '#3a6a3a', '#ff6ab8']);
plant('karst_fern', 'plant', ['#3a7a4a', '#5a9a5a'], { density: 0.5 });
// Hoodoo Badlands
cube('hoodoo_sand', 'noise', ['#d8905a', '#c8804a'], { amount: 0.07, hardness: 0.5 });
cube('hoodoo_rock', 'bands', ['#c8703a', '#e8b88a', '#a8502a'], { amount: 0.06, hardness: 1.25 });
plant('yucca', 'plant', ['#6a8a5a', '#a8c08a'], { density: 0.55 });
plant('barrel_cactus', 'bud', ['#4a7a3a', '#5a8a4a', '#ff6a8a']);
// Sunflower Plains
turf('sunflower_turf', ['#8ab84a', '#7aa83a'], ['#6a4e30', '#5a4228']);
plant('sunflower', 'flower', ['#4a7a2a', '#4a7a2a', '#ffd81a']);
plant('buttercup', 'flower', ['#5a8a3a', '#5a8a3a', '#fff04a']);
// Pine Barrens
cube('barren_sand', 'speckle', ['#d8c8a0', '#c8b890', '#8a7a5a'], { density: 0.08, hardness: 0.5 });
log('pitch_pine_log', ['#4a3a2e', '#3a2c22'], ['#6a5240', '#4e3a2c', '#c89a5a']);
leaves('pine_needles', ['#3a6a3a', '#2e5a30'], { density: 0.3 });
plant('blueberry_bush', 'fruit', ['#3a6a3a', '#2e5a2e', '#3a4ad8'], { density: 0.4 });
plant('bracken', 'plant', ['#6a8a3a', '#8aa84a'], { density: 0.6 });
// Geyser Basin
cube('sinter', 'bands', ['#e8e0d0', '#f0c88a', '#c8b8a0'], { amount: 0.05, hardness: 1 });
cube('geyserite', 'cells', ['#d8d0c0', '#b8b0a0', '#f0e8d8'], { hardness: 1.2 });
cube('geyser_vent', 'cracks', ['#c8b8a0', '#a89880', '#bff8ff'], { density: 0.25, emission: 5, damage: 1, hardness: 1.5 });
plant('thermophile_mat', 'speckle', ['#e8803a', '#c8602a', '#ffd04a'], { density: 0.3 });
plant('steam_reed', 'plant', ['#a8b0a0', '#d8e0d0'], { density: 0.4 });
// Wisteria Woods
turf('wisteria_turf', ['#6aa85a', '#5a984a'], ['#5a4a38', '#4e4030']);
log('wisteria_log', ['#6a5a5a', '#5a4a4a'], ['#8a7a78', '#6a5a5a', '#4a3a3a'], 'cracks');
leaves('wisteria_leaves', ['#a87ad8', '#8a5ac8'], { density: 0.34 });
plant('bleeding_heart', 'flower', ['#4a7a4a', '#4a7a4a', '#ff5a9a']);
plant('hosta', 'plant', ['#4a8a5a', '#8ac87a'], { density: 0.6 });
// Boreal Bog
cube('sphagnum', 'speckle', ['#7a8a3a', '#6a7a2e', '#c86a4a'], { density: 0.1, hardness: 0.4, slows: 0.85 });
log('black_spruce_log', ['#3a3430', '#2e2824'], ['#5a4a40', '#3e342c', '#2a221e']);
leaves('black_spruce_needles', ['#1e3a2a', '#162e20'], { density: 0.32 });
plant('pitcher_plant', 'bud', ['#5a2a2a', '#8a3a3a', '#c8a84a']);
plant('cranberry', 'fruit', ['#4a5a2a', '#3a4a22', '#d81a2a'], { density: 0.35 });
// Burnt Woods
cube('ash_loam', 'speckle', ['#4a4440', '#3a3634', '#8a8480'], { density: 0.1, hardness: 0.6 });
log('scorched_log', ['#1e1a18', '#2a2420'], ['#2a2420', '#1a1614', '#c84a1a'], 'cracks');
plant('fireweed_sprout', 'flower', ['#3a5a2a', '#3a5a2a', '#e85ab8']);
plant('char_fern', 'plant', ['#2a2a24', '#5a6a3a'], { density: 0.5 });
// Kaleidoscope Fields
turf('prism_turf', ['#6ac8a8', '#a86ad8'], ['#5a4a6a', '#4a3e5a']);
log('chroma_log', ['#d86a8a', '#6a8ad8'], ['#e8a8c8', '#a8c8e8', '#ffffff'], 'bands');
leaves('chroma_leaves', ['#ff6ad8', '#6affd8'], { density: 0.3, emission: 3 });
plant('kaleido_flower', 'flower', ['#5a5a8a', '#5a5a8a', '#ffe83a'], { emission: 3 });
plant('spectrum_grass', 'plant', ['#ff6a8a', '#6a8aff'], { density: 0.5 });
// Olive Groves
cube('terra_rossa', 'noise', ['#a8483a', '#94402f'], { amount: 0.08, hardness: 0.6 });
log('olive_log', ['#7a6a5a', '#5a4e40'], ['#a89078', '#8a745c', '#5a4a3a'], 'cracks');
leaves('olive_leaves', ['#8a9a6a', '#7a8a5a'], { fruit: '#3a2a4a' });
plant('rosemary', 'plant', ['#5a7a6a', '#8ab0a0'], { density: 0.55 });
plant('thyme', 'flower', ['#5a6a4a', '#5a6a4a', '#c8a8e8']);
// Palm Isles
cube('white_sand', 'speckle', ['#f8f4e8', '#e8e4d8', '#ffffff'], { density: 0.06, hardness: 0.5, tags: ['sand'] });
log('palm_log', ['#a8885a', '#8a704a'], ['#c8a878', '#a8885a', '#6a5434'], 'bands');
leaves('palm_fronds', ['#4aa83a', '#3a9a2a'], { density: 0.26 });
plant('beach_grass', 'plant', ['#a8b86a', '#c8d88a'], { density: 0.55 });
plant('sea_oats', 'flower', ['#a8a86a', '#a8a86a', '#e8d8a0']);
// Oceans
cube('abyssal_ooze', 'noise', ['#1a1e2a', '#14182a'], { amount: 0.08, hardness: 0.5 });
plant('tube_worms', 'bud', ['#e8e0d0', '#c8c0b0', '#ff3a3a'], { tags: ['plant', 'underwater'] });
plant('abyss_glowcap', 'mushroom', ['#2a3a5a', '#3ae8ff'], { emission: 10, tags: ['plant', 'underwater'] });
cube('sargasso_sand', 'speckle', ['#c8b88a', '#b8a87a', '#8a7a3a'], { density: 0.08, hardness: 0.5 });
plant('sargassum', 'plant', ['#8a7a2a', '#b8a03a'], { density: 0.6, tags: ['plant', 'underwater'] });
plant('drift_weed', 'plant', ['#6a5a1a', '#8a7a2a'], { density: 0.5, tags: ['plant', 'underwater'] });
cube('lantern_coral_sand', 'speckle', ['#d8c8b0', '#c8b8a0', '#6affe8'], { density: 0.05, hardness: 0.5 });
plant('lantern_coral', 'bud', ['#1a4a5a', '#2a8a9a', '#8affff'], { emission: 12, tags: ['plant', 'underwater'] });
plant('glow_anemone', 'flower', ['#2a3a5a', '#2a3a5a', '#ff8aff'], { emission: 9, tags: ['plant', 'underwater'] });

// ---------------------------------------------------------------- trees

export const WILDS_TREES: TreeDef[] = [
  { name: 'redwood', shape: 'giant', log: 'redwood_log', leaves: 'redwood_needles', height: [18, 28], radius: [2.6, 3.4] },
  { name: 'mangrove', shape: 'mangrove', log: 'mangrove_log', leaves: 'mangrove_leaves', height: [5, 7], radius: [2.4, 3.0] },
  { name: 'baobab', shape: 'baobab', log: 'baobab_log', leaves: 'baobab_leaves', height: [6, 9], radius: [2.6, 3.4] },
  { name: 'ghost_gum', shape: 'birch', log: 'ghost_gum_log', leaves: 'gum_leaves', height: [6, 9], radius: [2.2, 2.8] },
  { name: 'aspen', shape: 'birch', log: 'aspen_log', leaves: 'aspen_leaves', height: [7, 10], radius: [1.8, 2.3] },
  { name: 'kapok', shape: 'wide', log: 'kapok_log', leaves: 'kapok_leaves', height: [14, 20], radius: [3.6, 4.4] },
  { name: 'cloud_oak', shape: 'ball', log: 'mossy_bark_log', leaves: 'cloud_leaves', height: [5, 8], radius: [2.6, 3.2] },
  { name: 'glowshroom', shape: 'mushroom', log: 'glowshroom_stem', leaves: 'glowshroom_cap', height: [5, 9], radius: [2.8, 3.8] },
  { name: 'crystal_spire', shape: 'spire', log: 'quartz_pillar', leaves: 'prism_tip', height: [5, 11], radius: [1.2, 1.8] },
  { name: 'petrified_tree', shape: 'dead', log: 'petrified_log', height: [4, 7], radius: [0, 0] },
  { name: 'cliff_pine', shape: 'pine', log: 'cliff_pine_log', leaves: 'cliff_pine_needles', height: [7, 10], radius: [2.0, 2.6] },
  { name: 'pitch_pine', shape: 'pine', log: 'pitch_pine_log', leaves: 'pine_needles', height: [9, 13], radius: [1.8, 2.4] },
  { name: 'wisteria', shape: 'weeping', log: 'wisteria_log', leaves: 'wisteria_leaves', height: [5, 7], radius: [2.6, 3.2] },
  { name: 'black_spruce', shape: 'cone', log: 'black_spruce_log', leaves: 'black_spruce_needles', height: [8, 12], radius: [1.4, 1.9] },
  { name: 'scorched_snag', shape: 'dead', log: 'scorched_log', height: [5, 9], radius: [0, 0] },
  { name: 'chroma_tree', shape: 'ball', log: 'chroma_log', leaves: 'chroma_leaves', height: [4, 6], radius: [2.2, 2.8] },
  { name: 'olive', shape: 'ball', log: 'olive_log', leaves: 'olive_leaves', height: [3, 4], radius: [1.8, 2.3] },
  { name: 'palm', shape: 'palm', log: 'palm_log', leaves: 'palm_fronds', height: [6, 9], radius: [2.6, 3.2] },
];

// ---------------------------------------------------------------- biomes

const DAY: MobSpawn[] = [
  { mob: 'kata_sheep', weight: 12, group: [2, 4] },
  { mob: 'ana_cow', weight: 10, group: [2, 4] },
  { mob: 'hyperchicken', weight: 10, group: [2, 4] },
  { mob: 'tesseract_rabbit', weight: 6, group: [1, 3] },
];
const NIGHT: MobSpawn[] = [
  { mob: 'shambler', weight: 100, group: [1, 3] },
  { mob: 'bone_archer', weight: 80, group: [1, 2] },
  { mob: 'phase_creeper', weight: 60 },
  { mob: 'web_weaver', weight: 50 },
  { mob: 'ana_stalker', weight: 25 },
  { mob: 'kata_slime', weight: 20, group: [1, 2] },
];
const CAVE: MobSpawn[] = [
  { mob: 'shambler', weight: 60 },
  { mob: 'bone_archer', weight: 40 },
  { mob: 'hyperbat', weight: 30, group: [3, 6] },
  { mob: 'crystal_crawler', weight: 20 },
  { mob: 'ore_mimic', weight: 6 },
];
const WATER: MobSpawn[] = [
  { mob: 'reef_squid', weight: 10, group: [2, 4] },
  { mob: 'lantern_fish', weight: 12, group: [3, 6] },
];
const COMMON = ['ruined_portal', 'ancient_ruins', 'stone_circle', 'campsite', 'standing_slabs', 'dungeon', 'hypermine', 'buried_treasure', 'ana_vault', 'library_ruins'];

type LandOpts = Omit<BiomeDef, 'kind' | 'frozenWater' | 'precipitation' | 'foliageColor' | 'waterColor' | 'heightBias' | 'heightScale' | 'underwater'> &
  Partial<Pick<BiomeDef, 'frozenWater' | 'precipitation' | 'foliageColor' | 'waterColor' | 'heightBias' | 'heightScale' | 'underwater'>>;

function land(b: LandOpts): BiomeDef {
  return {
    kind: 'land',
    underwater: 'sand',
    heightBias: 0,
    heightScale: 1,
    frozenWater: false,
    precipitation: 'rain',
    foliageColor: b.grassColor,
    waterColor: '#3f76e4',
    mobs: { day: DAY, night: NIGHT, cave: CAVE },
    structures: COMMON,
    ...b,
  };
}

function sea(b: Omit<LandOpts, 'trees'> & { trees?: BiomeDef['trees'] }): BiomeDef {
  return {
    kind: 'ocean',
    underwater: b.surface,
    heightBias: 0,
    heightScale: 1,
    trees: [],
    frozenWater: false,
    precipitation: 'rain',
    foliageColor: b.grassColor,
    waterColor: '#3f76e4',
    mobs: { water: WATER, night: [{ mob: 'drowned_sentinel', weight: 30 }] },
    structures: ['shipwreck', 'sunken_monument', 'buried_treasure'],
    ...b,
  };
}

export const WILDS_BIOMES: BiomeDef[] = [
  land({
    name: 'redwood_forest', displayName: 'Redwood Forest', climate: [0.45, 0.82, 0.55, 0.55], terrain: 'hills',
    surface: 'redwood_duff', subsurface: 'forest_loam', heightBias: 4, heightScale: 1.1,
    trees: [{ tree: 'redwood', density: 0.006 }, { tree: 'spruce', density: 0.004 }],
    plants: [{ block: 'sword_fern', density: 0.14 }, { block: 'redwood_sorrel', density: 0.04 }],
    particles: [{ kind: 'leaf', color: '#8a4a2a', rate: 3 }, { kind: 'dust', color: '#e8f0e0', rate: 4 }],
    skyColor: '#8aaed8', fogColor: '#c8d8e0', grassColor: '#4a7a3a', foliageColor: '#2e5a2a',
    structures: ['cabin', ...COMMON],
  }),
  land({
    name: 'mangrove_swamp', displayName: 'Mangrove Swamp', climate: [0.8, 0.95, 0.4, 0.05], terrain: 'marsh',
    surface: 'mangrove_mud', subsurface: 'mangrove_mud', underwater: 'mangrove_mud',
    trees: [{ tree: 'mangrove', density: 0.016 }],
    plants: [{ block: 'mangrove_propagule', density: 0.05 }, { block: 'mud_lily', density: 0.03 }],
    particles: [{ kind: 'firefly', color: '#d8ff6a', rate: 6, glow: true, night: true }, { kind: 'spore', color: '#c8d8a8', rate: 2 }],
    skyColor: '#7ab0c8', fogColor: '#a8c8b8', grassColor: '#5a8a3a', waterColor: '#3a6a5a',
    structures: ['witch_hut', ...COMMON],
  }),
  land({
    name: 'baobab_savanna', displayName: 'Baobab Savanna', climate: [0.85, 0.25, 0.25, 0.2],
    surface: 'red_earth', subsurface: 'red_earth', precipitation: 'none',
    trees: [{ tree: 'baobab', density: 0.0018 }],
    plants: [{ block: 'dry_tussock', density: 0.14 }, { block: 'savanna_aloe', density: 0.015 }],
    particles: [{ kind: 'dust', color: '#e8b07a', rate: 4 }],
    skyColor: '#8ab8f0', fogColor: '#e8d8b0', grassColor: '#b8a85a',
    structures: ['village_savanna', ...COMMON],
  }),
  land({
    name: 'red_outback', displayName: 'Red Outback', climate: [0.92, 0.18, 0.5, 0.35], terrain: 'steppe',
    surface: 'outback_dirt', subsurface: 'red_earth', precipitation: 'none',
    trees: [{ tree: 'ghost_gum', density: 0.0012 }],
    plants: [{ block: 'spinifex', density: 0.1 }, { block: 'desert_pea', density: 0.012 }],
    particles: [{ kind: 'dust', color: '#e88a4a', rate: 6 }],
    skyColor: '#7ab0ff', fogColor: '#f0c8a0', grassColor: '#a8984a',
    mobs: { day: [{ mob: 'tesseract_rabbit', weight: 10, group: [2, 4] }, { mob: 'dune_camel', weight: 6 }], night: NIGHT, cave: CAVE },
  }),
  land({
    name: 'tundra', displayName: 'Tundra', climate: [0.08, 0.4, 0.25, 0.25],
    surface: 'tundra_moss', subsurface: 'permafrost', precipitation: 'snow', frozenWater: true,
    trees: [],
    plants: [{ block: 'arctic_cotton', density: 0.04 }, { block: 'reindeer_lichen', density: 0.08 }],
    particles: [{ kind: 'snow', color: '#ffffff', rate: 4 }],
    skyColor: '#a8c8e8', fogColor: '#d8e8f0', grassColor: '#7a8a5a',
    mobs: { day: [{ mob: 'frost_fox', weight: 8, group: [1, 2] }, { mob: 'ana_cow', weight: 6, group: [2, 4] }], night: [{ mob: 'frostbite_wraith', weight: 40 }, ...NIGHT], cave: CAVE },
  }),
  land({
    name: 'glacier', displayName: 'Glacier', climate: [0.02, 0.6, 0.7, 0.45], terrain: 'glacier',
    surface: 'glacier_ice', subsurface: 'packed_ice', stone: 'glacial_rock', precipitation: 'snow', frozenWater: true, heightBias: 8,
    trees: [],
    plants: [{ block: 'ice_bloom', density: 0.01 }, { block: 'snow_lichen', density: 0.03 }],
    particles: [{ kind: 'snow', color: '#ffffff', rate: 10 }],
    skyColor: '#b8d8f8', fogColor: '#e8f4ff', grassColor: '#a8d8f0',
    mobs: { day: [{ mob: 'frost_fox', weight: 6 }], night: [{ mob: 'frostbite_wraith', weight: 60 }, ...NIGHT], cave: CAVE },
  }),
  land({
    name: 'aspen_parkland', displayName: 'Aspen Parkland', climate: [0.35, 0.45, 0.6, 0.3],
    surface: 'parkland_turf', subsurface: 'loam',
    trees: [{ tree: 'aspen', density: 0.007 }],
    plants: [{ block: 'fireweed', density: 0.03 }, { block: 'yarrow', density: 0.03 }],
    particles: [{ kind: 'leaf', color: '#e8c02a', rate: 5 }],
    skyColor: '#8ab4f8', fogColor: '#d0e0f0', grassColor: '#8aa84a',
  }),
  land({
    name: 'rainforest', displayName: 'Rainforest', climate: [0.9, 0.98, 0.6, 0.35], terrain: 'hills',
    surface: 'rainforest_floor', subsurface: 'jungle_soil', heightBias: 2,
    trees: [{ tree: 'kapok', density: 0.003 }, { tree: 'jungle', density: 0.012 }],
    plants: [{ block: 'bromeliad', density: 0.05 }, { block: 'heliconia', density: 0.03 }, { block: 'jungle_fern', density: 0.1 }],
    particles: [{ kind: 'firefly', color: '#a8ff6a', rate: 5, glow: true, night: true }, { kind: 'leaf', color: '#2a7a2a', rate: 3 }],
    skyColor: '#7ab8a8', fogColor: '#a8d0b8', grassColor: '#3a8a2a', waterColor: '#2a7a6a',
  }),
  land({
    name: 'cloud_forest', displayName: 'Cloud Forest', climate: [0.55, 0.95, 0.5, 0.75], terrain: 'hills',
    surface: 'cloud_turf', subsurface: 'forest_loam', heightBias: 10, heightScale: 1.2,
    trees: [{ tree: 'cloud_oak', density: 0.012 }],
    plants: [{ block: 'tree_fern', density: 0.08 }, { block: 'mist_orchid', density: 0.03 }],
    particles: [{ kind: 'dust', color: '#f0f8ff', rate: 12 }],
    skyColor: '#a8c0d0', fogColor: '#e0e8ec', grassColor: '#5a8a5a',
  }),
  land({
    name: 'glowshroom_forest', displayName: 'Glowshroom Forest', climate: [0.4, 0.85, 0.85, 0.2],
    surface: 'glow_mycelium', subsurface: 'loam',
    trees: [{ tree: 'glowshroom', density: 0.006 }],
    plants: [{ block: 'lumen_shroom', density: 0.04 }, { block: 'spore_puff', density: 0.03 }],
    particles: [{ kind: 'spore', color: '#6ae8ff', rate: 10, glow: true }],
    skyColor: '#5a6a9a', fogColor: '#8a9ac8', grassColor: '#4a6a9a',
    mobs: { day: [{ mob: 'glass_moth', weight: 10, group: [2, 4] }], night: NIGHT, cave: CAVE },
  }),
  land({
    name: 'crystal_fields', displayName: 'Crystal Fields', climate: [0.25, 0.3, 0.92, 0.35],
    surface: 'quartz_sand', subsurface: 'quartz_sand',
    trees: [{ tree: 'crystal_spire', density: 0.004 }],
    plants: [{ block: 'crystal_grass', density: 0.08 }, { block: 'prism_flower', density: 0.02 }],
    particles: [{ kind: 'mote', color: '#e8c8ff', rate: 8, glow: true }],
    skyColor: '#b8a8f0', fogColor: '#e0d8f8', grassColor: '#c8b8e8',
    mobs: { day: [{ mob: 'glass_moth', weight: 10, group: [2, 4] }], night: [{ mob: 'crystal_crawler', weight: 50 }, ...NIGHT], cave: CAVE },
  }),
  land({
    name: 'petrified_forest', displayName: 'Petrified Forest', climate: [0.75, 0.22, 0.75, 0.45], terrain: 'steppe',
    surface: 'petrified_soil', subsurface: 'petrified_soil', precipitation: 'none',
    trees: [{ tree: 'petrified_tree', density: 0.004 }],
    plants: [{ block: 'stone_fern', density: 0.05 }, { block: 'agate_bud', density: 0.015 }],
    particles: [{ kind: 'dust', color: '#d8b88a', rate: 4 }],
    skyColor: '#90b8f0', fogColor: '#e8d0b0', grassColor: '#a8906a',
  }),
  land({
    name: 'highland_moor', displayName: 'Highland Moor', climate: [0.3, 0.75, 0.25, 0.7], terrain: 'hills',
    surface: 'moor_peat', subsurface: 'peat', heightBias: 6,
    trees: [],
    plants: [{ block: 'cotton_grass', density: 0.05 }, { block: 'bog_myrtle', density: 0.06 }],
    particles: [{ kind: 'dust', color: '#e0e4e8', rate: 6 }],
    skyColor: '#8a9ab0', fogColor: '#b8c0c8', grassColor: '#6a5a3a',
    structures: ['stone_circle', 'standing_slabs', ...COMMON],
  }),
  land({
    name: 'karst_pillars', displayName: 'Karst Pillars', climate: [0.62, 0.78, 0.65, 0.65], terrain: 'pillars',
    surface: 'karst_turf', subsurface: 'loam', stone: 'karst_limestone',
    trees: [{ tree: 'cliff_pine', density: 0.006 }],
    plants: [{ block: 'cliff_orchid', density: 0.02 }, { block: 'karst_fern', density: 0.08 }],
    particles: [{ kind: 'dust', color: '#f0f8f0', rate: 8 }],
    skyColor: '#90b8c8', fogColor: '#c8dcd8', grassColor: '#5a9a4a', waterColor: '#3a8a8a',
  }),
  land({
    name: 'hoodoo_badlands', displayName: 'Hoodoo Badlands', climate: [0.8, 0.12, 0.45, 0.6], terrain: 'hoodoos',
    surface: 'hoodoo_sand', subsurface: 'hoodoo_rock', stone: 'hoodoo_rock', precipitation: 'none',
    trees: [],
    plants: [{ block: 'yucca', density: 0.03 }, { block: 'barrel_cactus', density: 0.015 }],
    particles: [{ kind: 'dust', color: '#e8a07a', rate: 5 }],
    skyColor: '#80b0ff', fogColor: '#f0c0a0', grassColor: '#b8905a',
    mobs: { day: [{ mob: 'dune_camel', weight: 6 }], night: NIGHT, cave: CAVE },
  }),
  land({
    name: 'sunflower_plains', displayName: 'Sunflower Plains', climate: [0.62, 0.42, 0.55, 0.12],
    surface: 'sunflower_turf', subsurface: 'loam',
    trees: [{ tree: 'oak', density: 0.0006 }],
    plants: [{ block: 'sunflower', density: 0.06 }, { block: 'buttercup', density: 0.04 }, { block: 'tall_grass', density: 0.1 }],
    particles: [{ kind: 'petal', color: '#ffd81a', rate: 3 }],
    skyColor: '#78a8ff', fogColor: '#c8dcff', grassColor: '#8ab84a',
    mobs: { day: [{ mob: 'hyperhorse', weight: 6, group: [2, 4] }, ...DAY], night: NIGHT, cave: CAVE },
    structures: ['village_meadow', ...COMMON],
  }),
  land({
    name: 'pine_barrens', displayName: 'Pine Barrens', climate: [0.48, 0.3, 0.6, 0.15],
    surface: 'barren_sand', subsurface: 'sand',
    trees: [{ tree: 'pitch_pine', density: 0.006 }],
    plants: [{ block: 'blueberry_bush', density: 0.03 }, { block: 'bracken', density: 0.08 }],
    particles: [{ kind: 'leaf', color: '#3a6a3a', rate: 2 }],
    skyColor: '#80aef0', fogColor: '#c8d8e8', grassColor: '#7a9a4a',
  }),
  land({
    name: 'geyser_basin', displayName: 'Geyser Basin', climate: [0.68, 0.55, 0.88, 0.12], terrain: 'flat',
    surface: 'sinter', subsurface: 'geyserite', stone: 'geyserite',
    trees: [],
    plants: [{ block: 'thermophile_mat', density: 0.06 }, { block: 'steam_reed', density: 0.04 }],
    vents: [{ block: 'geyser_vent', density: 0.006 }],
    particles: [{ kind: 'mote', color: '#f0f8ff', rate: 14 }],
    skyColor: '#90b0d8', fogColor: '#e8ecf0', grassColor: '#e8c88a', waterColor: '#4ac8d8',
    mobs: { day: DAY, night: NIGHT, cave: CAVE },
  }),
  land({
    name: 'wisteria_woods', displayName: 'Wisteria Woods', climate: [0.66, 0.68, 0.88, 0.4],
    surface: 'wisteria_turf', subsurface: 'loam',
    trees: [{ tree: 'wisteria', density: 0.008 }],
    plants: [{ block: 'bleeding_heart', density: 0.03 }, { block: 'hosta', density: 0.06 }],
    particles: [{ kind: 'petal', color: '#b88ae8', rate: 6 }],
    skyColor: '#a0b0f0', fogColor: '#e0d0f0', grassColor: '#6aa85a',
  }),
  land({
    name: 'boreal_bog', displayName: 'Boreal Bog', climate: [0.22, 0.88, 0.35, 0.08], terrain: 'marsh',
    surface: 'sphagnum', subsurface: 'peat', underwater: 'peat', precipitation: 'snow',
    trees: [{ tree: 'black_spruce', density: 0.006 }],
    plants: [{ block: 'pitcher_plant', density: 0.03 }, { block: 'cranberry', density: 0.04 }],
    particles: [{ kind: 'spore', color: '#c8d8a8', rate: 3 }],
    skyColor: '#8aa0b8', fogColor: '#b8c4c8', grassColor: '#6a7a3a', waterColor: '#3a4a3a',
    mobs: { day: [{ mob: 'bog_frog', weight: 10, group: [2, 4] }], night: [{ mob: 'marsh_leech', weight: 40 }, ...NIGHT], cave: CAVE },
  }),
  land({
    name: 'burnt_woods', displayName: 'Burnt Woods', climate: [0.7, 0.28, 0.12, 0.4],
    surface: 'ash_loam', subsurface: 'loam',
    trees: [{ tree: 'scorched_snag', density: 0.008 }],
    plants: [{ block: 'fireweed_sprout', density: 0.04 }, { block: 'char_fern', density: 0.05 }],
    particles: [{ kind: 'ash', color: '#6a6460', rate: 8 }],
    skyColor: '#a8a8b0', fogColor: '#c8c0b8', grassColor: '#6a6450',
  }),
  land({
    name: 'kaleidoscope_fields', displayName: 'Kaleidoscope Fields', climate: [0.5, 0.5, 0.98, 0.55],
    surface: 'prism_turf', subsurface: 'loam',
    trees: [{ tree: 'chroma_tree', density: 0.003 }],
    plants: [{ block: 'kaleido_flower', density: 0.06 }, { block: 'spectrum_grass', density: 0.1 }],
    particles: [{ kind: 'mote', color: '#ff8aff', rate: 6, glow: true }, { kind: 'petal', color: '#6affd8', rate: 4 }],
    skyColor: '#b0a0f8', fogColor: '#e8d8ff', grassColor: '#a86ad8',
  }),
  land({
    name: 'olive_groves', displayName: 'Olive Groves', climate: [0.72, 0.38, 0.18, 0.5], terrain: 'hills',
    surface: 'terra_rossa', subsurface: 'terra_rossa', heightBias: 3,
    trees: [{ tree: 'olive', density: 0.005 }],
    plants: [{ block: 'rosemary', density: 0.05 }, { block: 'thyme', density: 0.04 }],
    particles: [{ kind: 'dust', color: '#f0e0c0', rate: 2 }],
    skyColor: '#70a8ff', fogColor: '#d8e0f0', grassColor: '#8a9a5a',
    structures: ['village_meadow', ...COMMON],
  }),
  land({
    name: 'palm_isles', displayName: 'Palm Isles', climate: [0.95, 0.75, 0.2, 0.05], terrain: 'flat',
    surface: 'white_sand', subsurface: 'white_sand', underwater: 'white_sand', heightBias: -2,
    trees: [{ tree: 'palm', density: 0.004 }],
    plants: [{ block: 'beach_grass', density: 0.06 }, { block: 'sea_oats', density: 0.03 }],
    particles: [{ kind: 'dust', color: '#ffffff', rate: 2 }],
    skyColor: '#60b0ff', fogColor: '#c8f0ff', grassColor: '#6ab84a', waterColor: '#2ac8d8',
  }),
  // ---- oceans
  sea({
    name: 'abyssal_trench', displayName: 'Abyssal Trench', climate: [0.75, 1, 0, 0],
    surface: 'abyssal_ooze', subsurface: 'abyssal_ooze', heightBias: -14,
    plants: [{ block: 'tube_worms', density: 0.03, placement: 'underwater' }, { block: 'abyss_glowcap', density: 0.02, placement: 'underwater' }],
    particles: [{ kind: 'bubble', color: '#6ae8ff', rate: 4 }],
    skyColor: '#5a7ab0', fogColor: '#7a90b8', grassColor: '#3a4a6a', waterColor: '#1a2a5a',
  }),
  sea({
    name: 'sargasso_sea', displayName: 'Sargasso Sea', climate: [0.7, 0.45, 0, 0],
    surface: 'sargasso_sand', subsurface: 'sand',
    plants: [{ block: 'sargassum', density: 0.12, placement: 'underwater' }, { block: 'drift_weed', density: 0.06, placement: 'underwater' }],
    particles: [{ kind: 'bubble', color: '#e8e0a8', rate: 3 }],
    skyColor: '#70a8f0', fogColor: '#c0d8e8', grassColor: '#8a7a2a', waterColor: '#2a6a7a',
  }),
  sea({
    name: 'lantern_reef', displayName: 'Lantern Reef', climate: [0.95, 0.45, 0, 0],
    surface: 'lantern_coral_sand', subsurface: 'sand',
    plants: [{ block: 'lantern_coral', density: 0.05, placement: 'underwater' }, { block: 'glow_anemone', density: 0.03, placement: 'underwater' }],
    particles: [{ kind: 'bubble', color: '#8affff', rate: 5 }],
    skyColor: '#5ab0f8', fogColor: '#b8f0ff', grassColor: '#2a8a9a', waterColor: '#1ab8c8',
  }),
];
