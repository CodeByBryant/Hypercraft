// Survival QOL (0.7.1): the grave you leave when you die, and the sleeping bag.

import type { BlockDef, ItemDef, RecipeDef, TextureDef } from './types';

export const SURVIVAL_TEXTURES: TextureDef[] = [{ name: 'gravestone', pattern: 'cells', colors: ['#8a8e94', '#62666c', '#b8bcc2'] }];

export const SURVIVAL_BLOCKS: BlockDef[] = [
  // Where your things wait after a death. Breaking it spills them; use it to take them back.
  { name: 'grave', displayName: 'Grave', render: 'opaque', solid: true, shape: 'chest', opaque: false, textures: { all: 'gravestone' }, hardness: 1.5, tags: ['grave'] },
];

export const SURVIVAL_ITEMS: ItemDef[] = [
  { name: 'sleeping_bag', displayName: 'Sleeping Bag', maxStack: 1, durability: 16, icon: { shape: 'bed', colors: ['#6a8a4a', '#3a5a2a', '#c8b080'] }, use: 'sleeping_bag', group: 'functional' },
];

export const SURVIVAL_RECIPES: RecipeDef[] = [
  { type: 'shaped', pattern: ['fff', 'fff'], key: { f: 'plant_fibre' }, result: 'sleeping_bag' },
  { type: 'shaped', pattern: ['lll', 'fff'], key: { l: 'leather', f: 'plant_fibre' }, result: 'sleeping_bag' },
];

/** What a new survival world starts with. */
export const STARTER_KIT: [string, number][] = [
  ['torch', 8],
  ['bread', 4],
  ['crafting_table', 1],
  ['sleeping_bag', 1],
];

/** The most graves remembered (the oldest is forgotten, its block stays). */
export const MAX_GRAVES = 5;
