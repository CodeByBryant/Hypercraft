// Non-block items. Every block also gets a block item automatically (same name) unless it is
// listed in NO_ITEM_BLOCKS; see registry.ts.

import type { Hex, ItemDef, ToolKind } from './types';
import { TIERS } from './tiers';

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
  { name: 'apple', displayName: 'Apple', icon: { shape: 'apple', colors: ['#d8302a', '#8a1a14', '#6b5130'] }, group: 'food' },
  { name: 'bucket', displayName: 'Bucket', maxStack: 16, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a'] }, use: 'bucket', group: 'tools' },
  { name: 'water_bucket', displayName: 'Water Bucket', maxStack: 1, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#3f76e4'] }, use: 'water_bucket', group: 'tools' },
  { name: 'lava_bucket', displayName: 'Lava Bucket', maxStack: 1, icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#ff7a1a'] }, use: 'lava_bucket', fuel: 1000, fuelRemainder: 'bucket', group: 'tools' },
  { name: 'flint_and_steel', displayName: 'Flint and Steel', maxStack: 1, durability: 64, icon: { shape: 'flint_steel', colors: ['#c8c8c8', '#3a3a3e', '#8a8a8a'] }, use: 'flint_and_steel', group: 'tools' },
  { name: 'shears', displayName: 'Shears', maxStack: 1, durability: 238, tool: { kind: 'shears', tier: 'iron' }, icon: { shape: 'shears', colors: ['#dcdcdc', '#8a8a8a'] }, group: 'tools' },
  { name: 'compass', displayName: 'Hypercompass', maxStack: 1, icon: { shape: 'compass', colors: ['#9a9a9a', '#5a5a5a', '#ff3030'] }, readout: 'compass', group: 'tools' },
  { name: 'clock', displayName: 'Clock', maxStack: 1, icon: { shape: 'clock', colors: ['#f4d03f', '#a8861f', '#3f6ff0'] }, readout: 'clock', group: 'tools' },
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
      group: kind === 'sword' ? 'combat' : 'tools',
    });
  }
}

/** Blocks without an item (fluids, portals, technical and "lit" state blocks). */
export const NO_ITEM_BLOCKS = new Set(['air', 'water', 'lava', 'portal', 'lit_furnace', 'lit_blast_furnace', 'lit_smoker']);

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
  torch: { group: 'functional' },
};

/** Furnace fuel for block items by block tag (seconds). */
export const TAG_FUEL: Record<string, number> = { log: 15, planks: 15 };
