// Food (Phase 7): hunger points (nutrition) and saturation restored, Minecraft's values.
// Saturation is the absolute amount restored (Minecraft's nutrition x modifier x 2). Effects
// are [effect, seconds, amplifier, chance]. Items listed here that already exist (apples,
// bread, raw meat) get their food data merged in by the item registry; the rest are new items.

import type { FoodDef, Hex, ItemDef, RecipeDef } from './types';

/** Food data for item names (existing and new). */
export const FOOD: Record<string, FoodDef> = {
  apple: { nutrition: 4, saturation: 2.4 },
  bread: { nutrition: 5, saturation: 6 },
  raw_beef: { nutrition: 3, saturation: 1.8 },
  raw_mutton: { nutrition: 2, saturation: 1.2 },
  raw_chicken: { nutrition: 2, saturation: 1.2, effects: [['hunger', 30, 0, 0.3]] },
  raw_rabbit: { nutrition: 3, saturation: 1.8 },
  rotten_flesh: { nutrition: 4, saturation: 0.8, effects: [['hunger', 30, 0, 0.8]] },
  cooked_beef: { nutrition: 8, saturation: 12.8 },
  cooked_mutton: { nutrition: 6, saturation: 9.6 },
  cooked_chicken: { nutrition: 6, saturation: 7.2 },
  cooked_rabbit: { nutrition: 5, saturation: 6 },
  carrot: { nutrition: 3, saturation: 3.6 },
  potato: { nutrition: 1, saturation: 0.6 },
  baked_potato: { nutrition: 5, saturation: 6 },
  poisonous_potato: { nutrition: 2, saturation: 1.2, effects: [['poison', 5, 0, 0.6]] },
  beetroot: { nutrition: 1, saturation: 1.2 },
  beetroot_soup: { nutrition: 6, saturation: 7.2, remainder: 'bowl' },
  melon_slice: { nutrition: 2, saturation: 1.2 },
  sweet_berries: { nutrition: 2, saturation: 0.4 },
  strawberries: { nutrition: 2, saturation: 1.2 },
  golden_apple: { nutrition: 4, saturation: 9.6, always: true, effects: [['regeneration', 5, 1, 1], ['absorption', 120, 0, 1]] },
  enchanted_golden_apple: { nutrition: 4, saturation: 9.6, always: true, effects: [['regeneration', 20, 1, 1], ['absorption', 120, 3, 1], ['resistance', 300, 0, 1], ['fire_resistance', 300, 0, 1]] },
  golden_carrot: { nutrition: 6, saturation: 14.4 },
  mushroom_stew: { nutrition: 6, saturation: 7.2, remainder: 'bowl' },
  rabbit_stew: { nutrition: 10, saturation: 12, remainder: 'bowl' },
  pumpkin_pie: { nutrition: 8, saturation: 4.8 },
  dried_kelp: { nutrition: 1, saturation: 0.6, seconds: 0.8 },
  glowcap_skewer: { nutrition: 4, saturation: 4.8, effects: [['night_vision', 30, 0, 1]] },
  milk_bucket: { nutrition: 0, saturation: 0, always: true, clears: true, remainder: 'bucket' },
};

function food(name: string, displayName: string, shape: NonNullable<ItemDef['icon']>['shape'], colors: Hex[], extra: Partial<ItemDef> = {}): ItemDef {
  return { name, displayName, icon: { shape, colors }, group: 'food', ...extra };
}

export const FOOD_ITEMS: ItemDef[] = [
  food('cooked_beef', 'Steak', 'steak', ['#8a4a2a', '#5a2a14', '#c87a4a']),
  food('cooked_mutton', 'Cooked Mutton', 'meat', ['#a85a3a', '#6a3a1f', '#e8c8a8']),
  food('cooked_chicken', 'Cooked Chicken', 'drumstick', ['#c8884a', '#8a5a2a', '#f0e0c8']),
  food('cooked_rabbit', 'Cooked Rabbit', 'meat', ['#b87a4a', '#7a4a2a', '#f0d0b0']),
  food('carrot', 'Carrot', 'carrot', ['#f08a1a', '#b85a0a', '#4a9a2a']),
  food('potato', 'Potato', 'potato', ['#d8b878', '#a88848', '#8a6a3a']),
  food('baked_potato', 'Baked Potato', 'potato', ['#e8c060', '#a8803a', '#fff0a0']),
  food('poisonous_potato', 'Poisonous Potato', 'potato', ['#b8c060', '#7a8a3a', '#6aaa2a']),
  food('beetroot', 'Beetroot', 'beetroot', ['#a8203a', '#6a1020', '#4a9a2a']),
  food('beetroot_soup', 'Beetroot Soup', 'stew', ['#8a5a3a', '#5a3a20', '#b82a3a'], { maxStack: 1 }),
  food('melon_slice', 'Melon Slice', 'slice', ['#e8402a', '#3a8a2a', '#2a1a1a']),
  food('sweet_berries', 'Sweet Berries', 'berries', ['#c8202a', '#7a1018', '#3a6a2a']),
  food('strawberries', 'Strawberries', 'berries', ['#f0302a', '#a01a18', '#5aaa3a']),
  food('golden_apple', 'Golden Apple', 'apple', ['#f4d03f', '#c9a227', '#6b5130']),
  food('enchanted_golden_apple', 'Enchanted Golden Apple', 'apple', ['#ffe86a', '#d8a827', '#c86aff'], { maxStack: 64, tags: ['glint'] }),
  food('golden_carrot', 'Golden Carrot', 'carrot', ['#f4d03f', '#c9a227', '#fff6b0']),
  food('mushroom_stew', 'Mushroom Stew', 'stew', ['#8a5a3a', '#5a3a20', '#c8a080'], { maxStack: 1 }),
  food('rabbit_stew', 'Rabbit Stew', 'stew', ['#8a5a3a', '#5a3a20', '#c8784a'], { maxStack: 1 }),
  food('pumpkin_pie', 'Pumpkin Pie', 'pie', ['#e8902a', '#a8601a', '#f0d0a0']),
  food('dried_kelp', 'Dried Kelp', 'flint', ['#3a4a2a', '#2a3a1f', '#5a6a3a']),
  food('glowcap_skewer', 'Glowcap Skewer', 'stick', ['#3fffb0', '#1a9a6a', '#8a6a3c']),
  { name: 'bowl', displayName: 'Bowl', icon: { shape: 'bowl', colors: ['#8a6a3c', '#5f4828', '#a8864f'] }, group: 'materials', fuel: 5 },
  { name: 'milk_bucket', displayName: 'Milk Bucket', maxStack: 1, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#f8f8f4'] }, group: 'food' },
];

const SMOKE = ['furnace', 'smoker'] as const;
export const FOOD_RECIPES: RecipeDef[] = [
  ...[
    ['raw_beef', 'cooked_beef'],
    ['raw_mutton', 'cooked_mutton'],
    ['raw_chicken', 'cooked_chicken'],
    ['raw_rabbit', 'cooked_rabbit'],
    ['potato', 'baked_potato'],
    ['kelp', 'dried_kelp'],
  ].map(([input, result]): RecipeDef => ({ type: 'smelting', input: input!, result: result!, furnaces: [...SMOKE], xp: 0.35 })),
  { type: 'shaped', pattern: ['p p', ' p '], key: { p: '#planks' }, result: 'bowl', count: 4 },
  { type: 'shapeless', ingredients: ['brown_mushroom', 'red_mushroom', 'bowl'], result: 'mushroom_stew' },
  { type: 'shapeless', ingredients: ['cooked_rabbit', 'carrot', 'baked_potato', 'brown_mushroom', 'bowl'], result: 'rabbit_stew' },
  { type: 'shapeless', ingredients: ['beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'bowl'], result: 'beetroot_soup' },
  { type: 'shaped', pattern: ['ggg', 'gag', 'ggg'], key: { g: 'gold_ingot', a: 'apple' }, result: 'golden_apple' },
  { type: 'shaped', pattern: ['ggg', 'gcg', 'ggg'], key: { g: 'gold_nugget', c: 'carrot' }, result: 'golden_carrot' },
  { type: 'shapeless', ingredients: ['glowcap', 'glowcap', 'stick'], result: 'glowcap_skewer' },
];
