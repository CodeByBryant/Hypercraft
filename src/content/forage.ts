// Foraging and fishing (0.7.1 playtest: every plant that looks like food gives food).
//
//  * Fruit trees drop their fruit from their leaves (like apple leaves do).
//  * Cacti and sunflowers give fruit and seeds; long grass and ferns give plant fibre (string
//    from 3, and the sleeping bag), so the first night does not need a spider.
//  * The fishing table: what a fishing rod pulls out of the water.

import type { DropDef, LootTable, MiningDef } from './types';

/** Leaves block -> [fruit item, chance per leaf broken]. */
export const LEAF_FRUIT: Record<string, [string, number]> = {
  cherry_leaves: ['cherries', 0.1],
  olive_leaves: ['olives', 0.12],
  palm_fronds: ['coconut', 0.1],
  baobab_leaves: ['baobab_fruit', 0.08],
};

/** Plants that give plant fibre (bare-handed, or with shears besides the plant itself). */
export const FIBRE_PLANTS = [
  'tall_grass', 'fern', 'tall_fern', 'snow_grass', 'dune_grass', 'tall_dry_grass', 'feather_grass', 'jungle_fern', 'cave_fern',
  'lattice_fern', 'frost_fern', 'bracken', 'savanna_shrub', 'wild_wheat',
];
export const FIBRE_CHANCE = 0.3;

/** Mining overrides for fruiting plants. */
export const FORAGE_MINING: Record<string, MiningDef> = {
  barrel_cactus: { drops: [{ item: 'cactus_fruit', count: [1, 2] }, { item: 'barrel_cactus', chance: 0.5 }] },
  sunflower: { drops: [{ item: 'sunflower', chance: 0.6 }, { item: 'sunflower_seeds', count: [1, 3] }] },
  puffball: { drops: [{ item: 'puffball' }] },
};

export function addDrop(cur: MiningDef['drops'] | undefined, d: DropDef): DropDef[] {
  return [...(Array.isArray(cur) ? cur : []), d];
}

/** Fishing: 85% fish, 10% junk, 5% treasure (see Game.reelIn). */
export const FISHING_LOOT: LootTable = {
  pools: [
    {
      rolls: [1, 1],
      entries: [
        { item: 'raw_fish', weight: 60 },
        { item: 'raw_salmon', weight: 25 },
        { item: 'stick', weight: 3, count: [1, 2] },
        { item: 'string', weight: 2 },
        { item: 'bowl', weight: 2 },
        { item: 'bone', weight: 2 },
        { item: 'leather', weight: 1 },
        { item: 'name_tag', weight: 2 },
        { item: 'golden_apple', weight: 1 },
        { item: 'book', weight: 2, enchant: [8, 24] },
      ],
    },
  ],
};
