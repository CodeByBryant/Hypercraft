// Crafting and smelting recipes. Ingredients are item names or '#tags' (item tags include the
// tags of the block an item places). Shaped recipes may be placed anywhere in the grid and
// mirrored left-right; recipes that fit in 2x2 also work in the inventory's crafting grid.

import type { RecipeDef } from './types';
import { TIERS } from './tiers';

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
