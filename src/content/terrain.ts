// Phase 2 terrain content: biome blocks, plants, ores, cave blocks. Pure data built with a few
// helpers (every block also gets its procedural texture). Referenced by name from biomes.ts,
// trees.ts and the generator.

import type { BlockDef, Hex, TextureDef, TexturePattern } from './types';

export const TERRAIN_TEXTURES: TextureDef[] = [];
export const TERRAIN_BLOCKS: BlockDef[] = [];

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
  TERRAIN_TEXTURES.push(t);
  return name;
}

function strip(o: Opt): Partial<BlockDef> {
  const { amount: _a, density: _d, alpha: _al, ...rest } = o;
  return rest;
}

/** Opaque full cube with one texture. */
function cube(name: string, pattern: TexturePattern, colors: Hex[], o: Opt = {}): void {
  tex(name, pattern, colors, o);
  TERRAIN_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { all: name }, hardness: 1, ...strip(o) });
}

/** Grass-like block: tinted top, tinted fringe on the sides, dirt bottom. */
function turf(name: string, top: Hex[], dirt: Hex[], o: Opt & { bt?: 0 | 1 } = {}): void {
  tex(`${name}_top`, 'grass_top', top, { amount: 0.12 });
  tex(`${name}_side`, 'grass_side', [dirt[0]!, dirt[1] ?? dirt[0]!, top[0]!]);
  tex(`${name}_soil`, 'noise', dirt, { amount: 0.12 });
  const { bt, ...rest } = o;
  TERRAIN_BLOCKS.push({
    name,
    render: 'opaque',
    solid: true,
    textures: { top: `${name}_top`, side: `${name}_side`, bottom: `${name}_soil` },
    biomeTint: bt ?? 0,
    hardness: 0.6,
    ...strip(rest),
  });
}

function log(name: string, bark: Hex[], rings: Hex[]): void {
  tex(`${name}_side`, 'log_side', bark);
  tex(`${name}_top`, 'log_top', rings);
  TERRAIN_BLOCKS.push({ name, render: 'opaque', solid: true, textures: { top: `${name}_top`, bottom: `${name}_top`, side: `${name}_side` }, hardness: 2, tags: ['log'] });
}

function leaves(name: string, colors: Hex[], o: Opt & { bt?: 0 | 1 | 2; fruit?: Hex } = {}): void {
  const { bt, fruit, ...rest } = o;
  if (fruit) tex(name, 'fruit', [colors[0]!, colors[1] ?? colors[0]!, fruit], { density: 0.28 });
  else tex(name, 'leaves', colors, { density: o.density ?? 0.3 });
  TERRAIN_BLOCKS.push({ name, render: 'cutout', solid: true, opaque: false, lightOpacity: 1, textures: { all: name }, biomeTint: bt ?? 0, hardness: 0.2, tags: ['leaves'], ...strip(rest) });
}

/** Cross-sheet plant (replaceable, no collision). */
function plant(name: string, pattern: TexturePattern, colors: Hex[], o: Opt & { bt?: 0 | 1 | 2 } = {}): void {
  const { bt, ...rest } = o;
  tex(name, pattern, colors, { density: o.density ?? 0.5 });
  TERRAIN_BLOCKS.push({ name, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, biomeTint: bt ?? 0, replaceable: true, hardness: 0, tags: ['plant'], ...strip(rest) });
}

function ore(name: string, fleck: Hex, o: Opt = {}): void {
  cube(name, 'ore', ['#808080', '#6c6c6c', fleck], { density: 0.15, hardness: 3, tags: ['ore'], ...o });
}

function deepOre(name: string, fleck: Hex, o: Opt = {}): void {
  cube(name, 'ore', ['#4a4a52', '#3d3d45', fleck], { density: 0.15, hardness: 4.5, tags: ['ore'], ...o });
}

// --- stones & soils -----------------------------------------------------------------------
cube('deepstone', 'noise', ['#4a4a52', '#3e3e46'], { amount: 0.1, hardness: 3 });
cube('cobbled_deepstone', 'cells', ['#4a4a52', '#2e2e34', '#5e5e68'], { hardness: 3.5 });
cube('limestone', 'noise', ['#c9c3a8', '#b8b196'], { amount: 0.06, hardness: 1.2 });
cube('mossy_cobblestone', 'cells', ['#6f7d5a', '#4f5a3c', '#8a9a6a'], { hardness: 2 });
cube('loam', 'noise', ['#6d4c33', '#5a3e29'], { amount: 0.14, hardness: 0.5 });
cube('coarse_dirt', 'speckle', ['#7a5a40', '#694b34', '#9a8266'], { density: 0.12, hardness: 0.5 });
cube('podzol_dirt', 'noise', ['#5f4228', '#4d3520'], { hardness: 0.5 });
cube('mud', 'noise', ['#3f3a33', '#352f29'], { amount: 0.08, hardness: 0.5 });
cube('peat', 'noise', ['#2f261d', '#3a2f24'], { amount: 0.1, hardness: 0.5 });
cube('red_sand', 'noise', ['#be6a30', '#a95b27'], { amount: 0.07, hardness: 0.5 });
cube('dune_sand', 'noise', ['#e6cf8f', '#d4b978'], { amount: 0.05, hardness: 0.5 });
cube('bleached_sand', 'speckle', ['#eee6d0', '#e0d6bb', '#ffffff'], { density: 0.05, hardness: 0.5 });
cube('cut_sandstone', 'bands', ['#dccf9a', '#cfbf86', '#e4d8a8'], { amount: 0.03, hardness: 0.8 });
cube('permafrost', 'speckle', ['#6b5a4c', '#5c4c40', '#dfeeff'], { density: 0.1, hardness: 0.8 });
cube('packed_snow', 'noise', ['#e8eef4', '#d8e2ea'], { amount: 0.04, hardness: 0.3 });
cube('packed_ice', 'noise', ['#8fb6ef', '#7ea6e0'], { amount: 0.05, hardness: 0.5 });
cube('blue_ice', 'crystal', ['#6fa4f0', '#5d92e2', '#b9d6ff'], { hardness: 2.8 });
cube('frost_stone', 'bands', ['#9fb3c8', '#8aa0b8', '#b8c9da'], { amount: 0.04, hardness: 1.5 });
cube('gravelly_loam', 'cells', ['#7a6a5a', '#5f5245', '#958574'], { hardness: 0.6 });
cube('savanna_stone', 'bands', ['#a88e6a', '#9a7f5c', '#b69c78'], { amount: 0.05, hardness: 1.5 });
cube('marsh_mud', 'noise', ['#4a4232', '#3c3527'], { amount: 0.1, hardness: 0.5 });
cube('luminous_moss', 'speckle', ['#2f5f3a', '#27502f', '#9dffc7'], { density: 0.12, emission: 6, hardness: 0.2 });
cube('moss_block', 'noise', ['#5a7f2d', '#4a6b24'], { amount: 0.12, hardness: 0.2 });
cube('jungle_soil', 'noise', ['#4b3a24', '#3d2f1d'], { amount: 0.12, hardness: 0.5 });
cube('mycelium_dirt', 'noise', ['#6b5560', '#5a4652'], { amount: 0.1, hardness: 0.5 });
cube('fen_mud', 'noise', ['#3f3448', '#342a3c'], { amount: 0.08, hardness: 0.5 });
cube('mushroom_stem', 'noise', ['#e2dccd', '#d2cab8'], { amount: 0.05, hardness: 0.2 });
cube('red_mushroom_cap', 'cap', ['#c0302a', '#f4ece0'], { hardness: 0.2 });
cube('brown_mushroom_cap', 'cap', ['#8f6a4a', '#c9a986'], { hardness: 0.2 });
cube('basalt', 'dripstone', ['#4a4a4f', '#3b3b40'], { hardness: 1.25 });
cube('scoria', 'cells', ['#5c3a32', '#3d241f', '#7a4e40'], { hardness: 1.5 });
cube('magma_block', 'fluid', ['#b8420f', '#ff8a1f', '#ffd24a'], { emission: 3, damage: 1, hardness: 0.5 });
cube('ash_soil', 'speckle', ['#6b6868', '#5a5757', '#a8a4a0'], { density: 0.08, hardness: 0.5 });
cube('skystone', 'noise', ['#c7cfe0', '#b4bdd0'], { amount: 0.06, hardness: 1.5 });
cube('hollow_stone', 'crystal', ['#8b8fb8', '#767aa3', '#c9ccff'], { hardness: 1.5 });
cube('cloud_moss', 'noise', ['#e4f0ee', '#cfe2dd'], { amount: 0.05, hardness: 0.3 });
cube('dripstone_block', 'dripstone', ['#86664f', '#735643'], { hardness: 1.5 });
cube('calcite', 'speckle', ['#e8e6e0', '#dcdad2', '#ffffff'], { density: 0.06, hardness: 0.75 });
cube('hush_stone', 'speckle', ['#1d2530', '#16202a', '#2fd3c8'], { density: 0.04, hardness: 3 });
cube('echo_moss', 'speckle', ['#0f2a33', '#0b212a', '#35f0e0'], { density: 0.1, emission: 2, hardness: 0.3 });
cube('silent_shale', 'bands', ['#272c36', '#1f242d', '#313745'], { amount: 0.04, hardness: 3 });
cube('sea_sand', 'noise', ['#d9cfa4', '#c9be91'], { amount: 0.06, hardness: 0.5 });
cube('tidestone', 'cells', ['#4f9a92', '#3b7c75', '#6fc0b5'], { hardness: 1.5 });
cube('dark_gravel', 'cells', ['#4c4a48', '#35332f', '#666360'], { hardness: 0.6 });
cube('bone_block', 'bands', ['#e7e2cf', '#d8d2bc', '#efe9d8'], { amount: 0.03, hardness: 2 });
cube('fossil_stone', 'speckle', ['#b9ad90', '#a89c80', '#efe8d4'], { density: 0.1, hardness: 2 });
cube('weathered_stone', 'cells', ['#8e8a80', '#6f6b62', '#a7a399'], { hardness: 1.5 });
cube('geode_shell', 'noise', ['#3d3b44', '#2f2d36'], { amount: 0.08, hardness: 1.25 });
cube('amethyst', 'crystal', ['#9a5cd6', '#8448c2', '#e2b8ff'], { hardness: 1.5, emission: 2 });
cube('cherry_planks', 'planks', ['#e8b4b8', '#d8a0a6', '#b9848a'], { hardness: 2 });
cube('petal_turf_under', 'noise', ['#6d4c33', '#5a3e29'], { hardness: 0.5 });
for (const [n, c] of [
  ['white', '#d1b3a1'],
  ['orange', '#a15325'],
  ['yellow', '#ba8523'],
  ['red', '#8f3d2e'],
  ['brown', '#4d3323'],
  ['tan', '#9f6f4e'],
] as [string, Hex][]) {
  cube(`terracotta_${n}`, 'noise', [c, c], { amount: 0.05, hardness: 1.25, tags: ['terracotta'] });
}
for (const [n, c, hi] of [
  ['red', '#c8323c', '#ff6a75'],
  ['yellow', '#d6b92f', '#ffe36a'],
  ['blue', '#2f5fd6', '#6e9bff'],
  ['pink', '#d65fa8', '#ff9ad4'],
] as [string, Hex, Hex][]) {
  cube(`coral_${n}`, 'cells', [c, hi, c], { hardness: 0.5, tags: ['coral'] });
  plant(`coral_fan_${n}`, 'bud', [c, c, hi], { tags: ['plant', 'underwater'] });
}

// --- turf -----------------------------------------------------------------------------------
turf('podzol', ['#6b5130', '#5a4228'], ['#5f4228', '#4d3520']);
turf('snowy_turf', ['#f0f5fa', '#dfe8f0'], ['#866043', '#6a4a31']);
turf('dry_turf', ['#b5ad6a', '#a39a58'], ['#8a6a48', '#765a3c']);
turf('mycelium', ['#8a7a8a', '#766676'], ['#6b5560', '#5a4652']);
turf('steppe_turf', ['#a5a070', '#948f60'], ['#7a6250', '#664f40']);
turf('petal_turf', ['#e9a8c0', '#d98fac'], ['#6d4c33', '#5a3e29']);
turf('glass_turf', ['#9fd6b8', '#86c2a2'], ['#4a4232', '#3c3527']);
turf('orchard_turf', ['#c4c4c4', '#a8a8a8'], ['#7a5634', '#664628'], { bt: 1 });
turf('forest_turf', ['#c4c4c4', '#a8a8a8'], ['#5f4228', '#4d3520'], { bt: 1 });

// --- logs & leaves --------------------------------------------------------------------------
log('birch_log', ['#e8e4d8', '#3a3530'], ['#e0d4b0', '#cbbf98', '#e8e4d8']);
log('spruce_log', ['#4a3322', '#3a281b'], ['#8a6a48', '#765a3c', '#4a3322']);
log('acacia_log', ['#7a6a5c', '#655749'], ['#c26a3a', '#aa5c32', '#7a6a5c']);
log('cherry_log', ['#4a2b2e', '#3a2124'], ['#d8a0a6', '#c48a90', '#4a2b2e']);
log('dead_log', ['#8a7f6e', '#6f6557'], ['#a89c86', '#968a74', '#8a7f6e']);
leaves('birch_leaves', ['#c8c8c8', '#a0a0a0'], { bt: 2 });
leaves('spruce_leaves', ['#3d5a3a', '#2f4a2d']);
leaves('frosted_spruce_leaves', ['#dce8ea', '#8fa89a'], { density: 0.25 });
leaves('acacia_leaves', ['#9aa33a', '#7f8a2c']);
leaves('cherry_leaves', ['#f1a9c8', '#e38fb3']);
leaves('apple_leaves', ['#c8c8c8', '#a0a0a0'], { bt: 2, fruit: '#d8302a' });
leaves('azalea_leaves', ['#6f9a38', '#5a8230'], { fruit: '#d86ad8' });
cube('bamboo_block', 'bamboo', ['#7ab83a', '#5a9a28'], { shape: 'post', opaque: false, hardness: 1, tags: ['log'] });
cube('cactus', 'bamboo', ['#4f8a30', '#3d7024'], { shape: 'post', opaque: false, damage: 1, hardness: 0.4 });
plant('kelp', 'plant', ['#3f7a3a', '#2f6a2c'], { density: 0.7, tags: ['plant', 'underwater'] });
plant('seagrass', 'plant', ['#4f9a4a', '#3a803a'], { density: 0.55, tags: ['plant', 'underwater'] });
plant('frost_kelp', 'plant', ['#6fa8b0', '#4f8a92'], { density: 0.6, tags: ['plant', 'underwater'] });

// --- plants ---------------------------------------------------------------------------------
plant('clover', 'plant', ['#c8c8c8', '#a0a0a0'], { bt: 1, density: 0.35 });
plant('poppy', 'flower', ['#3f7a2a', '#3f7a2a', '#d42a2a']);
plant('cornflower', 'flower', ['#3f7a2a', '#3f7a2a', '#3f6ad4']);
plant('fern', 'plant', ['#c8c8c8', '#a0a0a0'], { bt: 1, density: 0.6 });
plant('bluebell', 'flower', ['#3f7a2a', '#3f7a2a', '#6a6ae0']);
plant('brown_mushroom', 'mushroom', ['#d8d0c0', '#8f6a4a']);
plant('red_mushroom', 'mushroom', ['#d8d0c0', '#c0302a']);
plant('lily_of_valley', 'flower', ['#3f7a2a', '#3f7a2a', '#f4f4f4']);
plant('tall_fern', 'plant', ['#c8c8c8', '#a0a0a0'], { bt: 1, density: 0.7 });
plant('sweet_berry_bush', 'flower', ['#2f5a2a', '#2f5a2a', '#b0202a'], { damage: 0.5 });
plant('frost_fern', 'plant', ['#a8c8d0', '#88a8b0'], { density: 0.55 });
plant('snowdrop', 'flower', ['#5a8a5a', '#5a8a5a', '#ffffff']);
plant('ice_crystal_bud', 'bud', ['#b9d6ff', '#b9d6ff', '#eaf4ff'], { emission: 3 });
plant('frost_moss', 'plant', ['#9fb8b0', '#809a92'], { density: 0.3 });
plant('snow_grass', 'plant', ['#dfe8e0', '#b8c8bc'], { density: 0.4 });
plant('frostbloom', 'flower', ['#6a8a8a', '#6a8a8a', '#8fd8ff'], { emission: 2 });
plant('dune_grass', 'plant', ['#c8b878', '#a89858'], { density: 0.4 });
plant('dead_bush', 'plant', ['#7a5a3a', '#5a4028'], { density: 0.35 });
plant('mesa_flower', 'flower', ['#6a7a3a', '#6a7a3a', '#f08a2a']);
plant('tall_dry_grass', 'plant', ['#c8b060', '#a89048'], { density: 0.6 });
plant('savanna_shrub', 'plant', ['#8a8a3a', '#6a6a2a'], { density: 0.5 });
plant('reeds', 'plant', ['#6a8a3a', '#8aa04a'], { density: 0.75 });
plant('glowcap', 'mushroom', ['#9fe8c8', '#3fffb0'], { emission: 9 });
plant('marsh_marigold', 'flower', ['#4a7a2a', '#4a7a2a', '#ffd42a']);
plant('bamboo_shoot', 'plant', ['#7ab83a', '#5a9a28'], { density: 0.4 });
plant('jungle_fern', 'plant', ['#4f9a3a', '#3a802c'], { density: 0.7 });
plant('orchid', 'flower', ['#3f7a2a', '#3f7a2a', '#d86ad8']);
plant('puffball', 'mushroom', ['#e8e0d0', '#d8d0c0']);
plant('pink_petals', 'flower', ['#9a6a3a', '#9a6a3a', '#f4a8c8']);
plant('lilac', 'flower', ['#3f7a2a', '#3f7a2a', '#c89ae8']);
plant('ember_fern', 'plant', ['#d8581a', '#a8401a'], { emission: 7, density: 0.5 });
plant('charred_bush', 'plant', ['#3a3030', '#2a2020'], { density: 0.35 });
plant('sky_bloom', 'flower', ['#6aa8a0', '#6aa8a0', '#b8e8ff'], { emission: 3 });
plant('hanging_vine', 'plant', ['#5a9a4a', '#4a8a3a'], { density: 0.5 });
plant('wild_wheat', 'plant', ['#d8c060', '#b8a048'], { density: 0.55 });
plant('cave_fern', 'plant', ['#5a9a3a', '#4a8a2a'], { density: 0.6 });
plant('glow_berries', 'flower', ['#4a7a2a', '#4a7a2a', '#ffb02a'], { emission: 12 });
plant('spore_blossom', 'flower', ['#5a8a3a', '#5a8a3a', '#ff7ad0'], { emission: 4 });
plant('pointed_dripstone', 'bud', ['#86664f', '#86664f', '#a8886a']);
plant('echo_sprout', 'bud', ['#0f3a44', '#0f3a44', '#35f0e0'], { emission: 5 });
plant('bone_shrub', 'plant', ['#e0dac8', '#c8c2b0'], { density: 0.3 });
plant('thistle', 'flower', ['#6a7a4a', '#6a7a4a', '#a86ad8']);
plant('amethyst_cluster', 'bud', ['#9a5cd6', '#9a5cd6', '#f0d0ff'], { emission: 5 });

// --- Phase 2 biome-unique additions (each biome has 3+ unique blocks and 2+ unique plants) ---
cube('forest_loam', 'noise', ['#5a3f28', '#4a331f'], { amount: 0.13, hardness: 0.5 });
turf('glade_turf', ['#c4c4c4', '#a8a8a8'], ['#7a5a3a', '#684b30'], { bt: 1 });
cube('ocean_silt', 'noise', ['#8d8a78', '#7c7968'], { amount: 0.08, hardness: 0.5 });
cube('abyssal_mud', 'speckle', ['#2c3038', '#232730', '#4a90a8'], { density: 0.04, hardness: 0.6 });
cube('rime_gravel', 'cells', ['#8a98a8', '#6c7a8a', '#d8e8f4'], { hardness: 0.6 });
plant('lattice_fern', 'plant', ['#4f8f5a', '#3a7a48'], { density: 0.65 });
plant('white_tulip', 'flower', ['#3f7a2a', '#3f7a2a', '#f8f4ec']);
plant('strawberry_bush', 'flower', ['#3f6a2a', '#3f6a2a', '#e8302a']);
plant('lingonberry', 'flower', ['#2f4a2a', '#2f4a2a', '#c0203a']);
plant('feather_grass', 'plant', ['#d0c8a0', '#b8b088'], { density: 0.45 });
plant('desert_bloom', 'flower', ['#8a8a3a', '#8a8a3a', '#f8d24a']);
plant('mesa_brush', 'plant', ['#8a6a3a', '#6f542c'], { density: 0.4 });
plant('rib_weed', 'bud', ['#d8d0b8', '#d8d0b8', '#f4eedc']);
plant('wind_bell', 'flower', ['#7ab0c0', '#7ab0c0', '#e8f8ff'], { emission: 4 });
plant('sea_lettuce', 'plant', ['#5ab84a', '#48a03a'], { density: 0.5, tags: ['plant', 'underwater'] });
plant('tube_sponge', 'bud', ['#c8a040', '#c8a040', '#e8c060'], { tags: ['plant', 'underwater'] });
plant('deep_anemone', 'flower', ['#3a2a4a', '#3a2a4a', '#c86ad8'], { tags: ['plant', 'underwater'] });
plant('glow_polyp', 'bud', ['#1a3a4a', '#1a3a4a', '#5ff4ff'], { emission: 8, tags: ['plant', 'underwater'] });
plant('frost_anemone', 'flower', ['#5a7a8a', '#5a7a8a', '#d8f4ff'], { emission: 2, tags: ['plant', 'underwater'] });
plant('brine_weed', 'plant', ['#6a8a8a', '#587878'], { density: 0.45, tags: ['plant', 'underwater'] });
plant('bladderwrack', 'plant', ['#6a6a2a', '#585820'], { density: 0.6, tags: ['plant', 'underwater'] });
plant('sea_grape', 'flower', ['#3a6a2a', '#3a6a2a', '#8ad84a'], { tags: ['plant', 'underwater'] });
plant('cave_lichen', 'plant', ['#a8a070', '#8a8458'], { density: 0.3 });
plant('echo_vine', 'plant', ['#0f3a44', '#1a5a64'], { density: 0.45, emission: 3 });

// --- ores -----------------------------------------------------------------------------------
ore('copper_ore', '#d8804a');
ore('gold_ore', '#f0d040');
ore('azurite_ore', '#2f5fe0');
ore('fluxite_ore', '#ff3030', { emission: 2 });
ore('verdant_ore', '#2fd870');
deepOre('deep_iron_ore', '#d8ad8f');
deepOre('deep_gold_ore', '#f0d040');
deepOre('deep_azurite_ore', '#2f5fe0');
deepOre('deep_fluxite_ore', '#ff3030', { emission: 3 });
deepOre('deep_hyperite_ore', '#5ff4ff', { emission: 7 });
