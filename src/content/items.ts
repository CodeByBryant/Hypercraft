// Non-block items. Every block also gets a block item automatically (same name) unless it is
// listed in NO_ITEM_BLOCKS; see registry.ts.

import type { Hex, ItemDef, ToolKind } from './types';
import { TIERS } from './tiers';
import { ARMOR_ITEMS } from './armor';
import { FOOD_ITEMS } from './food';

const HANDLE: Hex = '#8a6a3c';

function material(name: string, displayName: string, shape: NonNullable<ItemDef['icon']>['shape'], colors: Hex[], extra: Partial<ItemDef> = {}): ItemDef {
  return { name, displayName, icon: { shape, colors }, group: 'materials', ...extra };
}

export const ITEMS: ItemDef[] = [
  material('stick', 'Stick', 'stick', ['#8a6a3c', '#5f4828'], { fuel: 5 }),
  material('coal', 'Coal', 'lump', ['#2a2a2a', '#111111', '#4a4a4a'], { fuel: 80, tags: ['coal'] }),
  material('charcoal', 'Charcoal', 'lump', ['#3a3028', '#1f1a14', '#5a4a3a'], { fuel: 80, tags: ['coal'] }),
  material('raw_copper', 'Raw Copper', 'raw', ['#c8714a', '#8a4a2c', '#e89a74']),
  material('raw_iron', 'Raw Iron', 'raw', ['#c8a88f', '#8a6f5c', '#e8ceb8']),
  material('raw_gold', 'Raw Gold', 'raw', ['#e8c040', '#a8861f', '#fff08a']),
  material('copper_ingot', 'Copper Ingot', 'ingot', ['#d8804a', '#9a5436', '#f4b08a']),
  material('iron_ingot', 'Iron Ingot', 'ingot', ['#dcdcdc', '#9a9a9a', '#ffffff']),
  material('gold_ingot', 'Gold Ingot', 'ingot', ['#f4d03f', '#c9a227', '#fff6b0']),
  material('iron_nugget', 'Iron Nugget', 'nugget', ['#dcdcdc', '#9a9a9a', '#ffffff']),
  material('gold_nugget', 'Gold Nugget', 'nugget', ['#f4d03f', '#c9a227', '#fff6b0']),
  material('azurite', 'Azurite', 'gem', ['#2f5fe0', '#1f3fa0', '#8ab0ff']),
  material('fluxite_dust', 'Fluxite Dust', 'dust', ['#ff3030', '#a01818', '#ff9a9a']),
  material('verdant', 'Verdant', 'gem', ['#2fd870', '#1a9a48', '#aaffcc']),
  material('hyperite', 'Hyperite', 'gem', ['#5ff4ff', '#1fa8c0', '#e8ffff']),
  material('flint', 'Flint', 'flint', ['#3a3a3e', '#1e1e22', '#6a6a70']),
  material('clay_ball', 'Clay Ball', 'ball', ['#a1a7b4', '#7a808c', '#c8ccd6']),
  material('brick', 'Brick', 'brick', ['#b3624d', '#7a3a2c', '#d88a74']),
  material('amethyst_shard', 'Amethyst Shard', 'shard', ['#9a5cd6', '#6a3aa0', '#e2b8ff']),
  material('bone', 'Bone', 'bone', ['#ece6d2', '#b8b09a', '#ffffff']),
  material('raw_mutton', 'Raw Mutton', 'raw', ['#d8605a', '#a8403a', '#f0d0c8'], { group: 'food' }),
  material('raw_beef', 'Raw Beef', 'raw', ['#c8403a', '#8a2a24', '#f0b0a8'], { group: 'food' }),
  material('raw_chicken', 'Raw Chicken', 'raw', ['#f0c0b0', '#d0a090', '#ffffff'], { group: 'food' }),
  material('raw_rabbit', 'Raw Rabbit', 'raw', ['#e0a090', '#b87a6a', '#ffffff'], { group: 'food' }),
  material('rotten_flesh', 'Rotten Flesh', 'raw', ['#8a7a4a', '#5a4a2a', '#b0a060'], { group: 'food' }),
  material('egg', 'Egg', 'ball', ['#f0e4c8', '#c8b898', '#ffffff'], { maxStack: 16, group: 'food' }),
  material('leather', 'Leather', 'flint', ['#a0603a', '#6a3a1f', '#c8845a']),
  material('rabbit_hide', 'Rabbit Hide', 'flint', ['#c8a878', '#9a7c50', '#e0c8a0']),
  material('feather', 'Feather', 'feather', ['#f4f4f4', '#b0b0b0', '#d8d8d8']),
  material('string', 'String', 'string', ['#f0f0f0', '#c0c0c0']),
  material('slime_ball', 'Slime Ball', 'ball', ['#7ad85a', '#4a9a3a', '#c8ffb0']),
  material('magma_cream', 'Magma Cream', 'ball', ['#ff8a2a', '#b8401a', '#ffe06a']),
  material('phase_dust', 'Phase Dust', 'dust', ['#c86aff', '#7a2ab0', '#f0c8ff']),
  material('ink_sac', 'Ink Sac', 'ball', ['#2a2a3a', '#101018', '#5a5a7a']),
  material('glow_scale', 'Glow Scale', 'shard', ['#5ff4ff', '#1fa8c0', '#e8ffff']),
  material('wraith_essence', 'Wraith Essence', 'dust', ['#b8e8ff', '#6aa8d8', '#ffffff']),
  material('echo_shard', 'Echo Shard', 'shard', ['#0f5a64', '#083a44', '#35f0e0']),
  { name: 'arrow', displayName: 'Arrow', icon: { shape: 'arrow', colors: ['#dcdcdc', '#8a8a8a', '#f4f4f4'] }, group: 'combat' },
  { name: 'bow', displayName: 'Bow', maxStack: 1, durability: 384, icon: { shape: 'bow', colors: ['#8a6a3c', '#5f4828', '#e8e8e8'] }, use: 'bow', group: 'combat' },
  { name: 'apple', displayName: 'Apple', icon: { shape: 'apple', colors: ['#d8302a', '#8a1a14', '#6b5130'] }, group: 'food' },
  { name: 'bucket', displayName: 'Bucket', maxStack: 16, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a'] }, use: 'bucket', group: 'tools' },
  { name: 'water_bucket', displayName: 'Water Bucket', maxStack: 1, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#3f76e4'] }, use: 'water_bucket', group: 'tools' },
  { name: 'lava_bucket', displayName: 'Lava Bucket', maxStack: 1, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#ff7a1a'] }, use: 'lava_bucket', fuel: 1000, fuelRemainder: 'bucket', group: 'tools' },
  { name: 'flint_and_steel', displayName: 'Flint and Steel', maxStack: 1, durability: 64, icon: { shape: 'flint_steel', colors: ['#c8c8c8', '#3a3a3e', '#8a8a8a'] }, use: 'flint_and_steel', group: 'tools' },
  { name: 'shears', displayName: 'Shears', maxStack: 1, durability: 238, tool: { kind: 'shears', tier: 'iron' }, icon: { shape: 'shears', colors: ['#dcdcdc', '#8a8a8a'] }, group: 'tools' },
  { name: 'compass', displayName: 'Hypercompass', maxStack: 1, icon: { shape: 'compass', colors: ['#9a9a9a', '#5a5a5a', '#ff3030'] }, readout: 'compass', group: 'tools' },
  { name: 'clock', displayName: 'Clock', maxStack: 1, icon: { shape: 'clock', colors: ['#f4d03f', '#a8861f', '#3f6ff0'] }, readout: 'clock', group: 'tools' },
  // Phase 5: paper and books (librarians), wheat and bread (farmers), atlases (cartographers).
  material('paper', 'Paper', 'paper', ['#f4f0e4', '#c8c0a8']),
  material('book', 'Book', 'book', ['#8a4a2a', '#5a2a14', '#f4e8c8'], { enchantability: 1 }),
  material('wheat', 'Wheat', 'wheat', ['#e0c060', '#8a7a2a']),
  { name: 'bread', displayName: 'Bread', icon: { shape: 'bread', colors: ['#c8904a', '#8a5a2a', '#e8c080'] }, group: 'food' },
  // Atlases point to the nearest structure of their kind, in your slice and kata/ana of it.
  { name: 'village_atlas', displayName: 'Village Atlas', maxStack: 1, icon: { shape: 'map', colors: ['#e8dcb8', '#a89870', '#3a8a3a'] }, readout: 'atlas', atlas: ['village_meadow', 'village_orchard', 'village_marsh', 'village_taiga', 'village_snow', 'village_savanna', 'village_desert'], group: 'tools' },
  { name: 'temple_atlas', displayName: 'Temple Atlas', maxStack: 1, icon: { shape: 'map', colors: ['#e8dcb8', '#a89870', '#c8902a'] }, readout: 'atlas', atlas: ['desert_temple', 'jungle_shrine', 'tesseract_grove_temple', 'sunken_monument'], group: 'tools' },
  { name: 'vault_atlas', displayName: 'Vault Atlas', maxStack: 1, icon: { shape: 'map', colors: ['#e8dcb8', '#a89870', '#8a4ad8'] }, readout: 'atlas', atlas: ['ana_vault', 'deep_silent_vault', 'library_ruins'], group: 'tools' },
  { name: 'ruins_atlas', displayName: 'Ruins Atlas', maxStack: 1, icon: { shape: 'map', colors: ['#e8dcb8', '#a89870', '#7a7a7a'] }, readout: 'atlas', atlas: ['ancient_ruins', 'ruined_portal', 'dungeon', 'hypermine'], group: 'tools' },
  // Phase 6: the Ember Depths.
  material('ember_quartz', 'Ember Quartz', 'gem', ['#f4e0d8', '#c8a8a0', '#ffffff']),
  // Hypercinder burns twice as long as coal and makes furnaces smelt twice as fast.
  material('hypercinder', 'Hypercinder', 'lump', ['#ff3aa8', '#8a1a5a', '#ffb0e0'], { fuel: 160 }),
  material('slag_scrap', 'Slag Scrap', 'raw', ['#6a4a3a', '#3a2418', '#9a6a3a']),
  material('ancient_slag_ingot', 'Ancient Slag Ingot', 'ingot', ['#5a3a2a', '#2a1810', '#b8845a']),
  material('cinder_brick', 'Cinder Brick', 'brick', ['#5a1e1e', '#3a1212', '#7a2a24']),
  material('sulfur', 'Sulfur', 'dust', ['#e8d83a', '#a89a1a', '#fff8a0']),
  material('wisp_essence', 'Wisp Essence', 'dust', ['#8affff', '#2ab8c8', '#ffffff']),
  material('drake_scale', 'Drake Scale', 'shard', ['#c8401a', '#6a1a0a', '#ffb050']),
  material('hound_fang', 'Hound Fang', 'bone', ['#f0e0c8', '#a8906a', '#ff8a2a']),
  material('brute_tusk', 'Brute Tusk', 'bone', ['#e8d8b8', '#9a8a6a', '#ffffff']),
  material('magma_core', 'Magma Core', 'ball', ['#ff6a1a', '#8a2a0a', '#ffe06a']),
  // Dropped by the Magma Regent (Phase 7 uses it for Slag Armor).
  material('regent_heart', 'Regent Heart', 'gem', ['#ff4a1a', '#8a0a0a', '#ffe8a0'], { maxStack: 1, group: 'combat' }),
  { name: 'ember_atlas', displayName: 'Ember Atlas', maxStack: 1, icon: { shape: 'map', colors: ['#d8b8a0', '#8a5a4a', '#ff5a1a'] }, readout: 'atlas', atlas: ['citadel', 'regent_caldera', 'forge', 'basalt_ziggurat'], group: 'tools' },
  // Fire charges light portals and fires like flint and steel (one use each). Drakes spit them.
  { name: 'fire_charge', displayName: 'Fire Charge', icon: { shape: 'ball', colors: ['#3a1a0a', '#ff6a1a', '#ffe06a'] }, use: 'flint_and_steel', group: 'tools' },
];

// Tools: every tier x (pickaxe, axe, shovel, hoe, sword).
const KINDS: [ToolKind, string][] = [
  ['pickaxe', 'Pickaxe'],
  ['axe', 'Axe'],
  ['shovel', 'Shovel'],
  ['hoe', 'Hoe'],
  ['sword', 'Sword'],
];
for (const t of TIERS) {
  for (const [kind, label] of KINDS) {
    ITEMS.push({
      name: `${t.name}_${kind}`,
      displayName: `${t.displayName} ${label}`,
      maxStack: 1,
      tool: { kind, tier: t.name },
      icon: { shape: kind, colors: [t.color, t.shade, HANDLE] },
      fuel: t.name === 'wood' ? 10 : undefined,
      enchantability: t.enchantability,
      group: kind === 'sword' ? 'combat' : 'tools',
    });
  }
}

// Phase 7.
ITEMS.push(...ARMOR_ITEMS, ...FOOD_ITEMS);
ITEMS.push({ name: 'enchanted_book', displayName: 'Enchanted Book', maxStack: 1, icon: { shape: 'book', colors: ['#6a3aa8', '#3a1a6a', '#ffd86a'] }, group: 'tools', tags: ['glint'] });

/** Blocks without an item (fluids, portals, technical and "lit" state blocks). */
export const NO_ITEM_BLOCKS = new Set(['air', 'water', 'lava', 'portal', 'lit_furnace', 'lit_blast_furnace', 'lit_smoker', 'mob_spawner', 'red_bed_head', 'blue_bed_head', 'white_bed_head', 'frosted_ice']);

/** Extra item properties for block items (fuel values, stack sizes, groups). */
export const BLOCK_ITEM_EXTRAS: Record<string, Partial<ItemDef>> = {
  crafting_table: { fuel: 15, group: 'functional' },
  chest: { fuel: 15, group: 'functional' },
  furnace: { group: 'functional' },
  blast_furnace: { group: 'functional' },
  smoker: { group: 'functional' },
  ladder: { fuel: 15 },
  coal_block: { fuel: 800 },
  bamboo_block: { fuel: 2.5 },
  dead_bush: { fuel: 5 },
  torch: { group: 'functional', icon: { shape: 'torch', colors: ['#8a6a3c', '#ffb02a', '#fff4b0'] } },
  bookshelf: { fuel: 15, group: 'functional' },
  enchanting_table: { group: 'functional' },
  anvil: { group: 'functional' },
  grindstone: { group: 'functional' },
  brewing_stand: { group: 'functional' },
  smithing_table: { group: 'functional' },
  oak_fence: { fuel: 15, icon: { shape: 'fence', colors: ['#b08a50', '#8a6a3c'] } },
  lantern: { group: 'functional', icon: { shape: 'lantern', colors: ['#4a4c56', '#ffc85a', '#fff6d0'] } },
  campfire: { group: 'functional', icon: { shape: 'campfire', colors: ['#7a5a32', '#ff8a2a', '#ffe08a'] } },
  cobweb: { icon: { shape: 'web', colors: ['#f0f0f6', '#c8c8d6'] } },
  hay_bale: { fuel: 5 },
  emberwood_log: { fuel: 15 },
  charred_log: { fuel: 30 },
  sulfur_stem: { fuel: 10 },
  hypercinder_ore: { group: 'materials' },
  red_bed: { maxStack: 1, group: 'functional', icon: { shape: 'bed', colors: ['#c83a3a', '#8e2424', '#8a6a3c'] } },
  blue_bed: { maxStack: 1, group: 'functional', icon: { shape: 'bed', colors: ['#4a5ed0', '#2a3a96', '#8a6a3c'] } },
  white_bed: { maxStack: 1, group: 'functional', icon: { shape: 'bed', colors: ['#ecece6', '#b8b8b0', '#8a6a3c'] } },
};

/** Furnace fuel for block items by block tag (seconds). */
export const TAG_FUEL: Record<string, number> = { log: 15, planks: 15 };
