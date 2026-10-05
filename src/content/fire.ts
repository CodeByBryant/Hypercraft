// Fire data (R4). How readily fire spreads next to a block ("ignite odds", 0..100) and how
// readily it burns the block away ("burn odds", 0..100), by tag, after Minecraft's FireBlock
// tables. A block's own `flammable` field wins over its tags; the 'fireproof' tag (the Ember
// Depths' wood and plants, like the Nether's) wins over both. Fire on top of an 'infiniburn'
// block (cinder, ember moss, magma) burns forever.

export const FLAMMABLE_TAGS: Record<string, [number, number]> = {
  planks: [5, 20],
  wooden: [5, 20],
  log: [5, 5],
  leaves: [30, 60],
  wool: [30, 60],
  plant: [60, 100],
};

/** Blocks with odds of their own (no tag covers them). */
export const FLAMMABLE_BLOCKS: Record<string, [number, number]> = {
  bookshelf: [30, 20],
  tnt: [15, 100],
  thatch: [60, 20],
  hay_bale: [60, 20],
  oak_fence: [5, 20],
  moss_block: [5, 100],
  peat: [5, 5],
  red_wool: [30, 60],
  blue_wool: [30, 60],
  bamboo_block: [60, 60],
};

/** Seconds a touch of fire (or lava) sets a player or mob burning. */
export const BURN_FIRE = 8;
export const BURN_LAVA = 15;
