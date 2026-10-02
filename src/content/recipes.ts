// Crafting and smelting recipes. Ingredients are item names or '#tags' (item tags include the
// tags of the block an item places). Shaped recipes may be placed anywhere in the grid and
// mirrored left-right; recipes that fit in 2x2 also work in the inventory's crafting grid.

import type { RecipeDef } from './types';
import { TIERS } from './tiers';
import { ARMOR_RECIPES } from './armor';
import { FOOD_RECIPES } from './food';
import { BREWING_RECIPES } from './potions';
import { FARM_RECIPES } from './farming';
import { SMITHING_RECIPES } from './smithing';
import { ORE_RECIPES } from './ores';

export const RECIPES: RecipeDef[] = [
  // Wood.
  { type: 'shapeless', ingredients: ['log'], result: 'planks', count: 4 },
  { type: 'shapeless', ingredients: ['dead_log'], result: 'planks', count: 4 },
  { type: 'shapeless', ingredients: ['birch_log'], result: 'birch_planks', count: 4 },
  { type: 'shapeless', ingredients: ['spruce_log'], result: 'spruce_planks', count: 4 },
  { type: 'shapeless', ingredients: ['acacia_log'], result: 'acacia_planks', count: 4 },
  { type: 'shapeless', ingredients: ['cherry_log'], result: 'cherry_planks', count: 4 },
  { type: 'shaped', pattern: ['#', '#'], key: { '#': '#planks' }, result: 'stick', count: 4 },
  { type: 'shaped', pattern: ['#', '#'], key: { '#': 'bamboo_block' }, result: 'stick', count: 2 },
  { type: 'shaped', pattern: ['##', '##'], key: { '#': '#planks' }, result: 'crafting_table' },
  { type: 'shaped', pattern: ['###', '# #', '###'], key: { '#': '#planks' }, result: 'chest' },
  { type: 'shaped', pattern: ['s s', 'sss', 's s'], key: { s: 'stick' }, result: 'ladder', count: 3 },
  // Beds: sleep through the night, and set where you respawn.
  { type: 'shaped', pattern: ['www', 'ppp'], key: { w: 'wool', p: '#planks' }, result: 'white_bed' },
  { type: 'shaped', pattern: ['www', 'ppp'], key: { w: 'red_wool', p: '#planks' }, result: 'red_bed' },
  { type: 'shaped', pattern: ['www', 'ppp'], key: { w: 'blue_wool', p: '#planks' }, result: 'blue_bed' },

  // Light and stations.
  { type: 'shaped', pattern: ['c', 's'], key: { c: '#coal', s: 'stick' }, result: 'torch', count: 4 },
  { type: 'shaped', pattern: ['###', '# #', '###'], key: { '#': '#stone_crafting' }, result: 'furnace' },
  { type: 'shaped', pattern: ['iii', 'ifi', 'sss'], key: { i: 'iron_ingot', f: 'furnace', s: 'smooth_stone' }, result: 'blast_furnace' },
  { type: 'shaped', pattern: [' l ', 'lfl', ' l '], key: { l: '#log', f: 'furnace' }, result: 'smoker' },

  // Building.
  { type: 'shaped', pattern: ['sss'], key: { s: 'smooth_stone' }, result: 'stone_slab', count: 6 },
  { type: 'shaped', pattern: ['c  ', 'cc ', 'ccc'], key: { c: 'cobblestone' }, result: 'stone_stairs', count: 4 },
  { type: 'shaped', pattern: ['bb', 'bb'], key: { b: 'brick' }, result: 'bricks' },
  { type: 'shaped', pattern: ['ss', 'ss'], key: { s: 'sand' }, result: 'sandstone' },
  { type: 'shaped', pattern: ['ss', 'ss'], key: { s: 'sandstone' }, result: 'cut_sandstone', count: 4 },
  { type: 'shaped', pattern: ['cc', 'cc'], key: { c: 'clay_ball' }, result: 'clay' },
  { type: 'shapeless', ingredients: ['cobblestone', 'moss_block'], result: 'mossy_cobblestone' },
  { type: 'shaped', pattern: ['aa', 'aa'], key: { a: 'amethyst_shard' }, result: 'amethyst' },

  // Tools without a tier.
  { type: 'shaped', pattern: [' i', 'i '], key: { i: 'iron_ingot' }, result: 'shears' },
  { type: 'shaped', pattern: ['i i', ' i '], key: { i: 'iron_ingot' }, result: 'bucket' },
  { type: 'shapeless', ingredients: ['iron_ingot', 'flint'], result: 'flint_and_steel' },
  { type: 'shaped', pattern: [' i ', 'ifi', ' i '], key: { i: 'iron_ingot', f: 'fluxite_dust' }, result: 'compass' },
  { type: 'shaped', pattern: [' g ', 'gfg', ' g '], key: { g: 'gold_ingot', f: 'fluxite_dust' }, result: 'clock' },

  // Combat and fibre.
  { type: 'shaped', pattern: [' ts', 't s', ' ts'], key: { t: 'stick', s: 'string' }, result: 'bow' },
  { type: 'shaped', pattern: ['f', 's', 'e'], key: { f: 'flint', s: 'stick', e: 'feather' }, result: 'arrow', count: 4 },
  { type: 'shaped', pattern: ['ss', 'ss'], key: { s: 'string' }, result: 'wool' },
  { type: 'shaped', pattern: ['hh', 'hh'], key: { h: 'rabbit_hide' }, result: 'leather' },

  // Nuggets.
  { type: 'shapeless', ingredients: ['iron_ingot'], result: 'iron_nugget', count: 9 },
  { type: 'shapeless', ingredients: ['gold_ingot'], result: 'gold_nugget', count: 9 },
  { type: 'shaped', pattern: ['nnn', 'nnn', 'nnn'], key: { n: 'iron_nugget' }, result: 'iron_ingot' },
  { type: 'shaped', pattern: ['nnn', 'nnn', 'nnn'], key: { n: 'gold_nugget' }, result: 'gold_ingot' },

  // Smelting (seconds in a furnace; blast furnaces and smokers take half).
  { type: 'smelting', input: 'raw_iron', result: 'iron_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'raw_gold', result: 'gold_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'raw_copper', result: 'copper_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'iron_ore', result: 'iron_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'deep_iron_ore', result: 'iron_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'gold_ore', result: 'gold_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'deep_gold_ore', result: 'gold_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: 'copper_ore', result: 'copper_ingot', furnaces: ['furnace', 'blast_furnace'] },
  { type: 'smelting', input: '#sand', result: 'glass' },
  { type: 'smelting', input: 'cobblestone', result: 'stone' },
  { type: 'smelting', input: 'stone', result: 'smooth_stone' },
  { type: 'smelting', input: 'cobbled_deepstone', result: 'deepstone' },
  { type: 'smelting', input: 'clay_ball', result: 'brick' },
  { type: 'smelting', input: 'clay', result: 'terracotta_tan' },
  { type: 'smelting', input: '#log', result: 'charcoal' },
  { type: 'smelting', input: 'sandstone', result: 'cut_sandstone' },

  // Phase 5: paper, books, food, decoration and structure blocks.
  { type: 'shaped', pattern: ['rrr'], key: { r: 'reeds' }, result: 'paper', count: 3 },
  { type: 'shapeless', ingredients: ['paper', 'paper', 'paper', 'leather'], result: 'book' },
  { type: 'shaped', pattern: ['ppp', 'bbb', 'ppp'], key: { p: '#planks', b: 'book' }, result: 'bookshelf' },
  { type: 'shaped', pattern: ['www'], key: { w: 'wheat' }, result: 'bread' },
  { type: 'shaped', pattern: ['www', 'www', 'www'], key: { w: 'wheat' }, result: 'hay_bale' },
  { type: 'shapeless', ingredients: ['hay_bale'], result: 'wheat', count: 9 },
  { type: 'shaped', pattern: ['ww', 'ww'], key: { w: 'wheat' }, result: 'thatch' },
  { type: 'shaped', pattern: ['nnn', 'ntn', 'nnn'], key: { n: 'iron_nugget', t: 'torch' }, result: 'lantern' },
  { type: 'shaped', pattern: ['psp', 'psp'], key: { p: '#planks', s: 'stick' }, result: 'oak_fence', count: 3 },
  { type: 'shaped', pattern: [' s ', 'scs', 'lll'], key: { s: 'stick', c: '#coal', l: '#log' }, result: 'campfire' },
  { type: 'shaped', pattern: ['ss', 'ss'], key: { s: 'stone' }, result: 'stone_bricks', count: 4 },
  { type: 'shapeless', ingredients: ['stone_bricks', 'moss_block'], result: 'mossy_stone_bricks' },
  { type: 'shaped', pattern: ['cs', 'sc'], key: { c: 'clay_ball', s: 'sand' }, result: 'plaster', count: 4 },
  { type: 'shaped', pattern: ['gg', 'gg'], key: { g: 'glow_scale' }, result: 'sea_lantern' },
  { type: 'shapeless', ingredients: ['wool', 'poppy'], result: 'red_wool' },
  { type: 'shapeless', ingredients: ['wool', 'cornflower'], result: 'blue_wool' },
  { type: 'smelting', input: 'stone_bricks', result: 'cracked_stone_bricks' },

  // Phase 6: the Ember Depths.
  { type: 'smelting', input: 'cinder', result: 'cinder_brick' },
  { type: 'shaped', pattern: ['bb', 'bb'], key: { b: 'cinder_brick' }, result: 'cinder_bricks' },
  { type: 'smelting', input: 'cinder_bricks', result: 'cracked_cinder_bricks' },
  { type: 'shaped', pattern: ['#', '#'], key: { '#': 'cinder_bricks' }, result: 'chiseled_cinder_bricks' },
  { type: 'shaped', pattern: ['vv', 'vv'], key: { v: 'voidstone' }, result: 'voidstone_bricks', count: 4 },
  { type: 'smelting', input: 'soul_sand', result: 'soul_glass' },
  // Ancient Slag: smelt the block into scrap; 4 scrap + 4 gold make an ingot (the tools use ingots).
  { type: 'smelting', input: 'ancient_slag', result: 'slag_scrap', time: 20, furnaces: ['furnace', 'blast_furnace'] },
  { type: 'shapeless', ingredients: ['slag_scrap', 'slag_scrap', 'slag_scrap', 'slag_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot'], result: 'ancient_slag_ingot' },
  { type: 'shapeless', ingredients: ['sulfur', '#coal'], result: 'fire_charge', count: 2 },
  { type: 'shaped', pattern: ['sss', 'sss', 'sss'], key: { s: 'sulfur' }, result: 'sulfur_block' },
  { type: 'shapeless', ingredients: ['sulfur_block'], result: 'sulfur', count: 9 },
  { type: 'shapeless', ingredients: ['emberwood_log'], result: 'planks', count: 4 },
];

// Storage blocks: 9 <-> 1.
for (const [item, block] of [
  ['coal', 'coal_block'],
  ['copper_ingot', 'copper_block'],
  ['iron_ingot', 'iron_block'],
  ['gold_ingot', 'gold_block'],
  ['azurite', 'azurite_block'],
  ['verdant', 'verdant_block'],
  ['hyperite', 'hyperite_block'],
] as [string, string][]) {
  RECIPES.push({ type: 'shaped', pattern: ['###', '###', '###'], key: { '#': item }, result: block });
  RECIPES.push({ type: 'shapeless', ingredients: [block], result: item, count: 9 });
}

// Tools for every tier.
for (const t of TIERS) {
  const m = t.material;
  RECIPES.push({ type: 'shaped', pattern: ['MMM', ' s ', ' s '], key: { M: m, s: 'stick' }, result: `${t.name}_pickaxe` });
  RECIPES.push({ type: 'shaped', pattern: ['MM', 'Ms', ' s'], key: { M: m, s: 'stick' }, result: `${t.name}_axe` });
  RECIPES.push({ type: 'shaped', pattern: ['M', 's', 's'], key: { M: m, s: 'stick' }, result: `${t.name}_shovel` });
  RECIPES.push({ type: 'shaped', pattern: ['MM', ' s', ' s'], key: { M: m, s: 'stick' }, result: `${t.name}_hoe` });
  RECIPES.push({ type: 'shaped', pattern: ['M', 'M', 's'], key: { M: m, s: 'stick' }, result: `${t.name}_sword` });
}

// Phase 7: armour and food.
RECIPES.push(...ARMOR_RECIPES, ...FOOD_RECIPES);

// Phase 7: stations.
RECIPES.push(
  { type: 'shaped', pattern: [' b ', 'hoh', 'ooo'], key: { b: 'book', h: 'hyperite', o: 'obsidian' }, result: 'enchanting_table' },
  { type: 'shaped', pattern: ['III', ' i ', 'iii'], key: { I: 'iron_block', i: 'iron_ingot' }, result: 'anvil' },
  { type: 'shaped', pattern: ['sls', 'p p'], key: { s: 'stick', l: 'stone_slab', p: '#planks' }, result: 'grindstone' },
);

// Phase 7: brewing.
RECIPES.push(...BREWING_RECIPES);

// Phase 7: farming.
RECIPES.push(...FARM_RECIPES);

// Phase 7: husbandry.
RECIPES.push({ type: 'shaped', pattern: ['ss ', 'sb ', '  s'], key: { s: 'string', b: 'slime_ball' }, result: 'lead', count: 2 });

// Phase 7: smithing and shields.
RECIPES.push(...SMITHING_RECIPES, ...ORE_RECIPES);
RECIPES.push({ type: 'shaped', pattern: ['pip', 'ppp', ' p '], key: { p: '#planks', i: 'iron_ingot' }, result: 'shield' });
