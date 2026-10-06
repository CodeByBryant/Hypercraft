// How blocks are mined and what they drop. Blocks without an entry break by hand at their
// hardness and drop themselves. `tier` is the minimum tool harvest level (see tiers.ts):
// 0 = wood/gold, 1 = stone/copper, 2 = iron/azurite, 3 = verdant/hyperite.

import type { DropDef, MiningDef } from './types';
import { FARM_MINING, LEAF_SAPLING } from './farming';
import { ORE_MINING } from './ores';
import { WOOD_MINING } from './woods';
import { VOID_MINING } from './void';
import { FIBRE_CHANCE, FIBRE_PLANTS, FORAGE_MINING, LEAF_FRUIT, addDrop } from './forage';
import { ALL_BLOCKS, ALL_TEXTURES } from './registry';

export const MINING: Record<string, MiningDef> = {};

const set = (names: string[], def: MiningDef) => {
  for (const n of names) MINING[n] = { ...MINING[n], ...def };
};
const one = (item: string, count: [number, number] = [1, 1]): DropDef[] => [{ item, count }];

// Stone-like: pickaxe required.
set(
  [
    'stone', 'cobblestone', 'smooth_stone', 'sandstone', 'cut_sandstone', 'bricks', 'stone_slab', 'stone_stairs', 'cobbled_deepstone',
    'limestone', 'mossy_cobblestone', 'frost_stone', 'savanna_stone', 'basalt', 'scoria', 'magma_block', 'skystone', 'hollow_stone',
    'dripstone_block', 'calcite', 'hush_stone', 'silent_shale', 'tidestone', 'bone_block', 'fossil_stone', 'weathered_stone',
    'geode_shell', 'terracotta_white', 'terracotta_orange', 'terracotta_yellow', 'terracotta_red', 'terracotta_brown', 'terracotta_tan',
    'coral_red', 'coral_yellow', 'coral_blue', 'coral_pink', 'blue_ice', 'packed_ice', 'furnace', 'lit_furnace', 'blast_furnace',
    'lit_blast_furnace', 'smoker', 'lit_smoker', 'coal_block', 'pointed_dripstone',
  ],
  { tool: 'pickaxe', tier: 0 },
);
set(['stone'], { drops: one('cobblestone') });
set(['deepstone'], { tool: 'pickaxe', tier: 0, drops: one('cobbled_deepstone') });
set(['lit_furnace'], { drops: one('furnace') });
set(['lit_blast_furnace'], { drops: one('blast_furnace') });
set(['lit_smoker'], { drops: one('smoker') });
set(['copper_block', 'iron_block'], { tool: 'pickaxe', tier: 1 });
set(['gold_block', 'azurite_block', 'verdant_block', 'hyperite_block'], { tool: 'pickaxe', tier: 2 });
set(['obsidian'], { tool: 'pickaxe', tier: 3 });
set(['amethyst'], { tool: 'pickaxe', tier: 0, drops: one('amethyst_shard', [2, 4]) });
set(['amethyst_cluster'], { tool: 'pickaxe', tier: 0, drops: one('amethyst_shard', [1, 2]) });

// Ores.
set(['coal_ore'], { tool: 'pickaxe', tier: 0, drops: one('coal'), xp: [0, 2] });
set(['copper_ore'], { tool: 'pickaxe', tier: 1, drops: one('raw_copper', [2, 4]) });
set(['iron_ore', 'deep_iron_ore'], { tool: 'pickaxe', tier: 1, drops: one('raw_iron') });
set(['gold_ore', 'deep_gold_ore'], { tool: 'pickaxe', tier: 2, drops: one('raw_gold') });
set(['azurite_ore', 'deep_azurite_ore'], { tool: 'pickaxe', tier: 1, drops: one('azurite', [3, 6]), xp: [2, 5] });
set(['fluxite_ore', 'deep_fluxite_ore'], { tool: 'pickaxe', tier: 2, drops: one('fluxite_dust', [3, 5]), xp: [1, 5] });
set(['verdant_ore'], { tool: 'pickaxe', tier: 2, drops: one('verdant'), xp: [3, 7] });
set(['hyperite_ore', 'deep_hyperite_ore'], { tool: 'pickaxe', tier: 2, drops: one('hyperite'), xp: [3, 7] });

// Soils: shovel.
set(
  [
    'dirt', 'sand', 'gravel', 'snow', 'clay', 'loam', 'coarse_dirt', 'podzol_dirt', 'mud', 'peat', 'red_sand', 'dune_sand', 'bleached_sand',
    'permafrost', 'packed_snow', 'gravelly_loam', 'marsh_mud', 'jungle_soil', 'mycelium_dirt', 'fen_mud', 'ash_soil', 'sea_sand',
    'dark_gravel', 'petal_turf_under', 'forest_loam', 'ocean_silt', 'abyssal_mud', 'rime_gravel', 'cloud_moss', 'moss_block',
    'echo_moss', 'luminous_moss', 'grass', 'podzol', 'snowy_turf', 'dry_turf', 'mycelium', 'steppe_turf', 'petal_turf', 'glass_turf',
    'orchard_turf', 'forest_turf', 'glade_turf',
  ],
  { tool: 'shovel' },
);
set(['grass', 'snowy_turf', 'dry_turf', 'steppe_turf', 'glass_turf', 'orchard_turf', 'forest_turf', 'glade_turf'], { drops: one('dirt') });
set(['podzol'], { drops: one('podzol_dirt') });
set(['mycelium'], { drops: one('mycelium_dirt') });
set(['petal_turf'], { drops: one('petal_turf_under') });
set(['clay'], { drops: one('clay_ball', [4, 4]) });
set(['gravel', 'dark_gravel'], { drops: [{ item: 'flint', chance: 0.12 }, { item: 'gravel', chance: 0.88 }] });

// Wood: axe.
set(
  [
    'log', 'birch_log', 'spruce_log', 'acacia_log', 'cherry_log', 'dead_log', 'planks', 'birch_planks', 'spruce_planks', 'acacia_planks',
    'cherry_planks', 'bamboo_block', 'mushroom_stem', 'red_mushroom_cap', 'brown_mushroom_cap', 'ladder', 'crafting_table', 'chest',
  ],
  { tool: 'axe' },
);
set(['red_mushroom_cap'], { drops: [{ item: 'red_mushroom', count: [0, 2] }] });
set(['brown_mushroom_cap'], { drops: [{ item: 'brown_mushroom', count: [0, 2] }] });

// Leaves: shears keep them; otherwise sticks and (from fruit trees) apples.
set(
  ['leaves', 'birch_leaves', 'spruce_leaves', 'frosted_spruce_leaves', 'acacia_leaves', 'cherry_leaves', 'apple_leaves', 'azalea_leaves'],
  { tool: 'hoe', shears: true, drops: [{ item: 'stick', count: [1, 2], chance: 0.04 }] },
);
set(['leaves'], { drops: [{ item: 'stick', count: [1, 2], chance: 0.04 }, { item: 'apple', chance: 0.01 }] });
set(['apple_leaves'], { drops: [{ item: 'stick', count: [1, 2], chance: 0.04 }, { item: 'apple', chance: 0.12 }] });

// Grass-like plants only drop with shears.
set(
  [
    'tall_grass', 'fern', 'tall_fern', 'snow_grass', 'dune_grass', 'tall_dry_grass', 'feather_grass', 'jungle_fern', 'cave_fern',
    'lattice_fern', 'frost_fern', 'seagrass', 'kelp', 'frost_kelp', 'hanging_vine', 'echo_vine', 'reeds', 'bladderwrack', 'brine_weed',
    'sea_lettuce',
  ],
  { shears: true, drops: 'none' },
);
set(['dead_bush'], { shears: true, drops: one('stick', [0, 2]) });
set(['bone_shrub', 'rib_weed'], { shears: true, drops: [{ item: 'bone', chance: 0.5 }] });

// Glass and ice shatter.
set(['glass', 'ice'], { drops: 'none' });

// Webs: swords and shears cut them quickly; they drop string.
set(['cobweb'], { tool: 'sword', shears: true, drops: [{ item: 'string' }] });
set(['wool'], { tool: 'shears' });

// Phase 5: structure blocks.
set(['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks', 'sea_bricks', 'tesseract_bricks', 'gilded_bricks', 'lantern'], { tool: 'pickaxe', tier: 0 });
set(['mob_spawner'], { tool: 'pickaxe', tier: 0, drops: 'none' });
set(['sea_lantern'], { tool: 'pickaxe', drops: [{ item: 'glow_scale', count: [1, 2] }] });
set(['bookshelf'], { tool: 'axe', drops: [{ item: 'book', count: [3, 3] }] });
set(['oak_fence', 'campfire'], { tool: 'axe' });
set(['campfire'], { drops: [{ item: 'charcoal', count: [1, 2] }] });
set(['thatch', 'hay_bale'], { tool: 'hoe' });
set(['dirt_path'], { tool: 'shovel', drops: [{ item: 'dirt' }] });
set(['plaster'], { tool: 'pickaxe' });
set(['red_bed', 'blue_bed', 'white_bed'], { tool: 'axe' });
for (const c of ['red', 'blue', 'white']) set([`${c}_bed_head`], { tool: 'axe', drops: one(`${c}_bed`) });
set(['wild_wheat'], { drops: [{ item: 'wheat', count: [1, 2] }] });
set(['reeds'], { shears: false, drops: [{ item: 'reeds' }] });

// Phase 6: the Ember Depths.
set(
  [
    'cinder', 'cinder_bricks', 'cracked_cinder_bricks', 'chiseled_cinder_bricks', 'smoldering_cinder', 'glowing_cinder', 'prism_basalt',
    'columnar_basalt', 'glowing_basalt', 'sulfur_block', 'scorched_stone', 'ashstone', 'soul_stone', 'magma_crust', 'pumice', 'ember_crystal',
  ],
  { tool: 'pickaxe', tier: 0 },
);
set(['ember_moss', 'glowing_cinder'], { tool: 'pickaxe', tier: 0, drops: one('cinder') });
set(['sulfur_moss'], { tool: 'pickaxe', tier: 0, drops: one('cinder') });
set(['ember_quartz_ore'], { tool: 'pickaxe', tier: 0, drops: one('ember_quartz'), xp: [2, 5] });
set(['gilded_cinder'], { tool: 'pickaxe', tier: 0, drops: one('gold_nugget', [2, 6]) });
set(['hypercinder_ore'], { tool: 'pickaxe', tier: 1, drops: one('hypercinder', [1, 2]), xp: [1, 3] });
set(['sulfur_vent'], { tool: 'pickaxe', tier: 0, drops: one('sulfur', [1, 3]) });
set(['fractured_voidstone'], { tool: 'pickaxe', tier: 2 });
set(['voidstone', 'voidstone_bricks', 'ancient_slag'], { tool: 'pickaxe', tier: 3 });
set(['ash_block', 'soul_sand', 'soul_soil', 'rift_soil'], { tool: 'shovel' });
set(['emberwood_log', 'charred_log', 'sulfur_stem'], { tool: 'axe' });
set(['sulfur_cap'], { tool: 'hoe' });
set(['phase_crystal', 'soul_glass', 'ember_bloom'], { tool: 'pickaxe' });
set(['ember_leaves'], { drops: [{ item: 'stick', count: [1, 2], chance: 0.05 }, { item: 'hypercinder', chance: 0.02 }] });
set(['fire', 'soul_fire', 'erupting_magma'], { drops: 'none' });
set(['ember_grass', 'brimstone_sprouts', 'ash_tuft', 'soul_fern', 'rift_grass', 'cinder_lichen'], { shears: true, drops: 'none' });

// Phase 7 stations.
set(['enchanting_table', 'anvil'], { tool: 'pickaxe', tier: 0 });
set(['grindstone', 'brewing_stand'], { tool: 'pickaxe', tier: 0 });
set(['smithing_table'], { tool: 'axe' });
set(['frosted_ice'], { drops: 'none' });

// Phase 7 brewing ingredients: emberglass crumbles into dust (like glowstone); ember ferns
// carry ember wart.
set(['emberglass'], { drops: [{ item: 'emberglass_dust', count: [2, 4] }] });
set(['ember_fern'], { shears: true, drops: [{ item: 'ember_wart', chance: 0.4 }] });

// Wood families: every log, plank, slab, stair, fence and door is for axes.
for (const [name, def] of Object.entries(WOOD_MINING)) set([name], def);
// Stone and crystal "trunks" (tagged pillar) are for pickaxes.
set(ALL_BLOCKS.filter((b) => b.tags?.includes('pillar')).map((b) => b.name), { tool: 'pickaxe', tier: 0 });
set(['nest_twigs'], { tool: 'axe', drops: [{ item: 'stick', count: [2, 4] }] });

// Every leafy block (leaves and fruit textures) works like leaves: hoe, shears keep it,
// otherwise a stick now and then (and below, its sapling). Caps, warts and crystal tips that
// are tagged leaves keep dropping themselves.
const LEAFY = new Set(ALL_TEXTURES.filter((t) => t.pattern === 'leaves' || t.pattern === 'fruit').map((t) => t.name));
for (const b of ALL_BLOCKS) {
  if (!b.tags?.includes('leaves') || MINING[b.name] || !LEAFY.has(b.textures.all ?? '')) continue;
  set([b.name], { tool: 'hoe', shears: true, drops: [{ item: 'stick', count: [1, 2], chance: 0.04 }] });
}

// Phase 7 farming: crops, fruit, bushes, seeds from grass; leaves drop saplings.
for (const [name, def] of Object.entries(FARM_MINING)) set([name], def);
for (const [name, def] of Object.entries(ORE_MINING)) set([name], def);
for (const [name, def] of Object.entries(FORAGE_MINING)) set([name], def);
for (const [name, def] of Object.entries(VOID_MINING)) set([name], def);
// Fruit from leaves, plant fibre from long grass (what it drops by hand; shears keep the plant).
for (const [leaves, [fruit, chance]] of Object.entries(LEAF_FRUIT)) set([leaves], { tool: 'hoe', shears: true, drops: addDrop(MINING[leaves]?.drops ?? [{ item: 'stick', count: [1, 2], chance: 0.04 }], { item: fruit, chance }) });
for (const name of FIBRE_PLANTS) if (MINING[name]) set([name], { drops: addDrop(MINING[name]!.drops, { item: 'plant_fibre', chance: FIBRE_CHANCE }) });
for (const [leaves, sapling] of Object.entries(LEAF_SAPLING)) {
  const cur = MINING[leaves];
  const drops = Array.isArray(cur?.drops) ? [...cur.drops] : [];
  set([leaves], { shears: true, drops: [...drops, { item: sapling, chance: 0.05 }] });
}
