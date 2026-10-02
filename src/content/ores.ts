// More ores with uses (playtest: "ores practically nonexistent", "add more ores with uses").
//
//  * Silver (y 6-90): silver ingots and nuggets. Silver arrows hit harder, twice as hard on
//    the undead; a trim material; Mirror Glass (silver-backed glass, the Mirror Realm's
//    portal frame in Phase 9).
//  * Sulfur (deep, y 2-60): sulfur for TNT, fire charges and splash potions.
//  * Lumenite (y 10-110, glows in the dark): lumen dust for Lumen Blocks, spectral arrows
//    (the mob you hit shows through walls, and off your slice, for 10 s) and enhanced potions.
//  * Tesserite (deep, y 2-40, rare, a faint violet glow): tesserite shards, the 4D tools'
//    material (Phase 7.7), Tesseract Blocks and phase dust.
//
// Deep variants sit in deepstone. TNT is sulfur and sand: light it (flint and steel, a fire
// charge, fire, another blast) and it blows after 4 seconds.

import type { BlockDef, Hex, ItemDef, MiningDef, RecipeDef, TextureDef } from './types';

export const ORE_TEXTURES: TextureDef[] = [];
export const ORE_BLOCKS: BlockDef[] = [];

const stone = ['#808080', '#6c6c6c'] as const, deep = ['#4a4a52', '#3d3d45'] as const;

function ore(name: string, displayName: string, fleck: Hex, o: Partial<BlockDef> = {}, density = 0.15): void {
  for (const [n, base, hard] of [[name, stone, 3], [`deep_${name}`, deep, 4.5]] as const) {
    ORE_TEXTURES.push({ name: n, pattern: 'ore', colors: [base[0], base[1], fleck], density });
    ORE_BLOCKS.push({ name: n, displayName: n === name ? displayName : `Deep ${displayName}`, render: 'opaque', solid: true, textures: { all: n }, hardness: hard, tags: ['ore'], ...o });
  }
}

ore('silver_ore', 'Silver Ore', '#eef2f8');
ore('sulfur_ore', 'Sulfur Ore', '#e8d83a', {}, 0.2);
ore('lumenite_ore', 'Lumenite Ore', '#fff0a0', { emission: 7 }, 0.18);
ore('tesserite_ore', 'Tesserite Ore', '#c86aff', { emission: 4 }, 0.12);

ORE_TEXTURES.push(
  { name: 'silver_block', pattern: 'metal', colors: ['#d8dee6', '#a8b0bc', '#ffffff'] },
  { name: 'tesseract_block', pattern: 'glow', colors: ['#9a4ae0', '#6a2ab0', '#e8c8ff'] },
  { name: 'mirror_glass', pattern: 'glass', colors: ['#c8d4e0', '#ffffff'], alpha: 0.45 },
  { name: 'tnt_side', pattern: 'stripes', colors: ['#c8302a', '#e8e0d0', '#8a1a14'] },
  { name: 'tnt_top', pattern: 'cells', colors: ['#c8302a', '#8a1a14', '#e8e0d0'] },
  { name: 'tnt_lit_side', pattern: 'stripes', colors: ['#ffe0d8', '#ffffff', '#ff8a6a'] },
);
ORE_BLOCKS.push(
  { name: 'silver_block', displayName: 'Block of Silver', render: 'opaque', solid: true, textures: { all: 'silver_block' }, hardness: 5, tags: ['storage'] },
  { name: 'tesseract_block', displayName: 'Tesseract Block', render: 'opaque', solid: true, textures: { all: 'tesseract_block' }, hardness: 5, emission: 10, tags: ['storage'] },
  { name: 'mirror_glass', displayName: 'Mirror Glass', render: 'translucent', solid: true, textures: { all: 'mirror_glass' }, tint: '#dfe8f2', alpha: 0.45, hardness: 0.5 },
  { name: 'tnt', displayName: 'TNT', render: 'opaque', solid: true, textures: { top: 'tnt_top', bottom: 'tnt_top', side: 'tnt_side' }, hardness: 0, tags: ['tnt'] },
  { name: 'tnt_lit', displayName: 'Lit TNT', render: 'opaque', solid: true, textures: { top: 'tnt_top', bottom: 'tnt_top', side: 'tnt_lit_side' }, hardness: 0, emission: 8, tags: ['tnt'] },
);

const mat = (name: string, displayName: string, shape: NonNullable<ItemDef['icon']>['shape'], colors: Hex[], extra: Partial<ItemDef> = {}): ItemDef => ({ name, displayName, icon: { shape, colors }, group: 'materials', ...extra });

export const ORE_ITEMS: ItemDef[] = [
  mat('raw_silver', 'Raw Silver', 'raw', ['#d8dee6', '#9aa2ae', '#ffffff']),
  mat('silver_ingot', 'Silver Ingot', 'ingot', ['#e4e8ee', '#a8b0bc', '#ffffff']),
  mat('silver_nugget', 'Silver Nugget', 'nugget', ['#e4e8ee', '#a8b0bc', '#ffffff']),
  mat('lumen_dust', 'Lumen Dust', 'dust', ['#ffe9a3', '#ffc84a', '#fff6d6']),
  mat('tesserite_shard', 'Tesserite Shard', 'gem', ['#c86aff', '#7a2ab0', '#f0d8ff']),
  { name: 'silver_arrow', displayName: 'Silver Arrow', icon: { shape: 'arrow', colors: ['#eef2f8', '#9aa2ae', '#ffffff'] }, group: 'combat', tags: ['arrow'] },
  { name: 'spectral_arrow', displayName: 'Spectral Arrow', icon: { shape: 'arrow', colors: ['#ffe060', '#c8a020', '#fff8c0'] }, group: 'combat', tags: ['arrow'] },
];

/** Arrow kinds: damage multiplier, multiplier on the undead, seconds a hit mob glows. */
export const ARROWS: Record<string, { damage: number; undead: number; glow: number }> = {
  arrow: { damage: 1, undead: 1, glow: 0 },
  silver_arrow: { damage: 1.25, undead: 2, glow: 0 },
  spectral_arrow: { damage: 1, undead: 1, glow: 10 },
};

const one = (item: string, count: [number, number] = [1, 1]) => [{ item, count }];
export const ORE_MINING: Record<string, MiningDef> = {
  silver_ore: { tool: 'pickaxe', tier: 1, drops: one('raw_silver') },
  deep_silver_ore: { tool: 'pickaxe', tier: 1, drops: one('raw_silver') },
  sulfur_ore: { tool: 'pickaxe', tier: 0, drops: one('sulfur', [2, 4]), xp: [0, 2] },
  deep_sulfur_ore: { tool: 'pickaxe', tier: 0, drops: one('sulfur', [2, 4]), xp: [0, 2] },
  lumenite_ore: { tool: 'pickaxe', tier: 1, drops: one('lumen_dust', [2, 4]), xp: [1, 3] },
  deep_lumenite_ore: { tool: 'pickaxe', tier: 1, drops: one('lumen_dust', [2, 4]), xp: [1, 3] },
  tesserite_ore: { tool: 'pickaxe', tier: 2, drops: one('tesserite_shard'), xp: [3, 7] },
  deep_tesserite_ore: { tool: 'pickaxe', tier: 2, drops: one('tesserite_shard'), xp: [3, 7] },
  silver_block: { tool: 'pickaxe', tier: 1 },
  tesseract_block: { tool: 'pickaxe', tier: 2 },
  lumen: { drops: one('lumen_dust', [2, 4]) },
  tnt_lit: { drops: one('tnt') },
};

const smelt = (input: string, result: string, xp = 0.7): RecipeDef => ({ type: 'smelting', input, result, furnaces: ['furnace', 'blast_furnace'], xp });

export const ORE_RECIPES: RecipeDef[] = [
  smelt('raw_silver', 'silver_ingot'),
  smelt('silver_ore', 'silver_ingot'),
  smelt('deep_silver_ore', 'silver_ingot'),
  { type: 'shapeless', ingredients: ['silver_ingot'], result: 'silver_nugget', count: 9 },
  { type: 'shaped', pattern: ['nnn', 'nnn', 'nnn'], key: { n: 'silver_nugget' }, result: 'silver_ingot' },
  { type: 'shaped', pattern: ['iii', 'iii', 'iii'], key: { i: 'silver_ingot' }, result: 'silver_block' },
  { type: 'shapeless', ingredients: ['silver_block'], result: 'silver_ingot', count: 9 },
  { type: 'shaped', pattern: ['aaa', 'asa', 'aaa'], key: { a: 'arrow', s: 'silver_ingot' }, result: 'silver_arrow', count: 8 },
  { type: 'shaped', pattern: [' d ', 'dad', ' d '], key: { d: 'lumen_dust', a: 'arrow' }, result: 'spectral_arrow', count: 2 },
  { type: 'shaped', pattern: ['ggg', 'gsg', 'ggg'], key: { g: 'glass', s: 'silver_ingot' }, result: 'mirror_glass', count: 8 },
  { type: 'shaped', pattern: ['dd', 'dd'], key: { d: 'lumen_dust' }, result: 'lumen' },
  { type: 'shaped', pattern: ['sas', 'asa', 'sas'], key: { s: 'sulfur', a: '#sand' }, result: 'tnt' },
  { type: 'shaped', pattern: ['ttt', 'ttt', 'ttt'], key: { t: 'tesserite_shard' }, result: 'tesseract_block' },
  { type: 'shapeless', ingredients: ['tesseract_block'], result: 'tesserite_shard', count: 9 },
  { type: 'shapeless', ingredients: ['tesserite_shard'], result: 'phase_dust', count: 2 },
  { type: 'shapeless', ingredients: ['sulfur', 'cinder_powder', '#coal'], result: 'fire_charge', count: 3 },
];
