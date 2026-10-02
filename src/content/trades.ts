// Villager professions and their trades (Phase 5). Currency is Verdant. Each level offers two
// of its trades (chosen per villager); a villager levels up from trade experience
// (thresholds in TRADE_LEVEL_XP) and unlocks the next level's offers.

import type { ProfessionDef, TradeDef } from './types';

const t = (cost: [string, number][], result: [string, number], maxUses: number, xp: number, enchant?: TradeDef['enchant']): TradeDef => (enchant ? { cost, result, maxUses, xp, enchant } : { cost, result, maxUses, xp });
const V = 'verdant';

/** Experience needed to reach each level (index = level). */
export const TRADE_LEVEL_XP = [0, 10, 70, 150, 250];
export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];

export const PROFESSIONS: ProfessionDef[] = [
  {
    name: 'farmer',
    displayName: 'Farmer',
    robe: '#8a6a3a',
    trim: '#c8a85a',
    levels: [
      [t([['wheat', 20]], [V, 1], 16, 2), t([['apple', 12]], [V, 1], 16, 2), t([[V, 1]], ['bread', 6], 16, 1)],
      [t([['egg', 16]], [V, 1], 16, 5), t([[V, 1]], ['apple', 4], 12, 5), t([['raw_beef', 10]], [V, 1], 16, 5)],
      [t([['raw_mutton', 10]], [V, 1], 16, 10), t([[V, 2]], ['hay_bale', 3], 12, 10)],
      [t([['raw_chicken', 10]], [V, 1], 16, 15), t([[V, 3]], ['glow_berries', 6], 12, 15)],
      [t([[V, 4]], ['sweet_berry_bush', 4], 12, 30), t([[V, 6]], ['cherry_log', 8], 12, 30)],
    ],
  },
  {
    name: 'smith',
    displayName: 'Smith',
    robe: '#3a3a42',
    trim: '#a8a8b0',
    levels: [
      [t([['coal', 15]], [V, 1], 16, 2), t([['iron_ingot', 4]], [V, 1], 12, 2), t([['silver_ingot', 4]], [V, 1], 12, 2), t([[V, 5]], ['iron_helmet', 1], 3, 2), t([[V, 4]], ['iron_boots', 1], 3, 2)],
      [t([[V, 2]], ['iron_sword', 1], 3, 5), t([[V, 3]], ['spear', 1], 3, 5), t([[V, 3]], ['iron_pickaxe', 1], 3, 5), t([[V, 3]], ['iron_axe', 1], 3, 5), t([[V, 9]], ['iron_chestplate', 1], 3, 5), t([[V, 7]], ['iron_leggings', 1], 3, 5)],
      [t([['gold_ingot', 3]], [V, 1], 12, 10), t([[V, 2]], ['shears', 1], 3, 10), t([[V, 6]], ['iron_sword', 1], 3, 10, [5, 19]), t([[V, 1]], ['anvil', 1], 3, 10)],
      [t([[V, 8], ['azurite', 1]], ['azurite_pickaxe', 1], 3, 15), t([[V, 8], ['azurite', 1]], ['azurite_sword', 1], 3, 15), t([[V, 14], ['azurite', 2]], ['azurite_chestplate', 1], 3, 15, [8, 20])],
      [t([[V, 20], ['hyperite', 1]], ['hyperite_pickaxe', 1], 3, 30, [10, 25]), t([[V, 16], ['hyperite', 1]], ['hyperite_sword', 1], 3, 30, [10, 25]), t([[V, 24], ['hyperite', 1]], ['hyperite_helmet', 1], 3, 30, [10, 25])],
    ],
  },
  {
    name: 'librarian',
    displayName: 'Librarian',
    robe: '#e8e0c8',
    trim: '#8a3a2a',
    levels: [
      [t([['paper', 24]], [V, 1], 16, 2), t([[V, 3]], ['bookshelf', 1], 12, 1), t([[V, 5], ['book', 1]], ['enchanted_book', 1], 12, 1, 'random')],
      [t([['book', 4]], [V, 1], 12, 5), t([[V, 1]], ['lantern', 1], 12, 5), t([[V, 6], ['book', 1]], ['enchanted_book', 1], 12, 5, 'random')],
      [t([[V, 2]], ['compass', 1], 12, 10), t([[V, 3]], ['clock', 1], 12, 10), t([[V, 8], ['book', 1]], ['enchanted_book', 1], 12, 10, 'random')],
      [t([[V, 4]], ['ruins_atlas', 1], 12, 15), t([['book', 8]], [V, 2], 12, 15), t([[V, 10], ['book', 1]], ['enchanted_book', 1], 12, 15, 'random')],
      [t([[V, 12]], ['vault_atlas', 1], 12, 30), t([[V, 20]], ['enchanting_table', 1], 4, 30)],
    ],
  },
  {
    name: 'cartographer',
    displayName: 'Cartographer',
    robe: '#e8e8f0',
    trim: '#3a5aa8',
    levels: [
      [t([['paper', 24]], [V, 1], 16, 2), t([[V, 3]], ['village_atlas', 1], 12, 1)],
      [t([['glass', 11]], [V, 1], 16, 5), t([[V, 6]], ['ruins_atlas', 1], 12, 5)],
      [t([['compass', 1]], [V, 1], 12, 10), t([[V, 10]], ['temple_atlas', 1], 12, 10)],
      [t([[V, 14]], ['vault_atlas', 1], 12, 15), t([[V, 1]], ['paper', 8], 12, 15)],
      [t([[V, 8]], ['compass', 2], 12, 30)],
    ],
  },
  {
    name: 'cleric',
    displayName: 'Cleric',
    robe: '#6a2a8a',
    trim: '#e8c85a',
    levels: [
      [t([['rotten_flesh', 32]], [V, 1], 16, 2), t([[V, 1]], ['phase_dust', 2], 12, 1)],
      [t([['bone', 16]], [V, 1], 16, 5), t([[V, 1]], ['lumen', 1], 12, 5), t([[V, 1]], ['lumen_dust', 4], 12, 5)],
      [t([['slime_ball', 8]], [V, 1], 16, 10), t([[V, 4]], ['glow_scale', 2], 12, 10), t([['sulfur', 12]], [V, 1], 16, 10)],
      [t([['amethyst_shard', 6]], [V, 1], 12, 15), t([[V, 5]], ['echo_shard', 1], 12, 15)],
      [t([[V, 12]], ['hyperite', 1], 12, 30)],
    ],
  },
  {
    name: 'mason',
    displayName: 'Mason',
    robe: '#8a8a8a',
    trim: '#5a3a2a',
    levels: [
      [t([['clay_ball', 10]], [V, 1], 16, 2), t([[V, 1]], ['bricks', 10], 16, 1)],
      [t([['stone', 20]], [V, 1], 16, 5), t([[V, 1]], ['stone_bricks', 8], 16, 5)],
      [t([[V, 1]], ['chiseled_stone_bricks', 4], 16, 10), t([['granite', 16]], [V, 1], 16, 10)],
      [t([[V, 1]], ['calcite', 4], 12, 15), t([[V, 1]], ['terracotta_red', 2], 12, 15)],
      [t([[V, 2]], ['gilded_bricks', 2], 12, 30)],
    ],
  },
  {
    name: 'fletcher',
    displayName: 'Fletcher',
    robe: '#4a6a3a',
    trim: '#c8b890',
    levels: [
      [t([['stick', 32]], [V, 1], 16, 2), t([[V, 1]], ['arrow', 16], 12, 1)],
      [t([['flint', 26]], [V, 1], 12, 5), t([[V, 2]], ['bow', 1], 12, 5), t([[V, 3]], ['crossbow', 1], 6, 5), t([[V, 1]], ['throwing_dagger', 4], 12, 5)],
      [t([['string', 14]], [V, 1], 16, 10), t([[V, 3]], ['arrow', 32], 12, 10), t([[V, 2]], ['silver_arrow', 8], 12, 10)],
      [t([['feather', 24]], [V, 1], 16, 15), t([[V, 2]], ['oak_fence', 8], 12, 15), t([[V, 2]], ['spectral_arrow', 6], 12, 15)],
      [t([[V, 6]], ['bow', 2], 12, 30)],
    ],
  },
  {
    // Sells what a 4D traveller needs: portal materials and slice-sense items.
    name: 'w_walker',
    displayName: 'W-Walker',
    robe: '#2a1a4a',
    trim: '#c86aff',
    levels: [
      [t([['phase_dust', 8]], [V, 1], 16, 2), t([[V, 2]], ['phase_dust', 4], 12, 1)],
      [t([[V, 4]], ['obsidian', 2], 12, 5), t([[V, 2]], ['flint_and_steel', 1], 12, 5), t([[V, 6], ['tesserite_shard', 1]], ['slicer_compass', 1], 6, 5)],
      [t([['echo_shard', 2]], [V, 3], 12, 10), t([[V, 6]], ['tesseract_bricks', 4], 12, 10), t([[V, 3]], ['fire_charge', 4], 12, 10)],
      [t([[V, 8]], ['vault_atlas', 1], 12, 15), t([[V, 3]], ['amethyst', 2], 12, 15), t([[V, 10]], ['ember_atlas', 1], 12, 15), t([[V, 6]], ['tesserite_shard', 1], 12, 15)],
      [t([[V, 16]], ['hyperite', 1], 12, 30), t([[V, 14]], ['phase_lens', 1], 4, 30), t([[V, 18]], ['w_anchor', 1], 4, 30)],
    ],
  },
];

/** The Wandering Merchant sells a random handful of these (no levels, no restock). */
export const MERCHANT_TRADES: TradeDef[] = [
  t([[V, 1]], ['glow_berries', 4], 6, 1),
  t([[V, 1]], ['sweet_berry_bush', 2], 6, 1),
  t([[V, 2]], ['cactus', 4], 6, 1),
  t([[V, 1]], ['bamboo_block', 6], 6, 1),
  t([[V, 3]], ['blue_ice', 4], 6, 1),
  t([[V, 2]], ['coral_blue', 4], 6, 1),
  t([[V, 2]], ['coral_pink', 4], 6, 1),
  t([[V, 3]], ['amethyst_cluster', 2], 6, 1),
  t([[V, 4]], ['sea_lantern', 2], 6, 1),
  t([[V, 5]], ['echo_shard', 1], 4, 1),
  t([[V, 2]], ['pink_petals', 6], 6, 1),
  t([[V, 3]], ['lavender', 6], 6, 1),
  t([[V, 6]], ['temple_atlas', 1], 2, 1),
  t([[V, 1]], ['clay_ball', 12], 6, 1),
  t([['phase_dust', 4]], [V, 1], 8, 1),
];
