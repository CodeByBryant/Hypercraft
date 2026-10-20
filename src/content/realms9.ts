// Phase 9 content in one place: the Mirror Realm, the Crystal Abyss and the Cloud Archipelago
// each have their own module; this file gathers their blocks, textures, items, recipes, mining
// rules, food, loot, biomes and mobs so the registries wire in one import.

import { MIRROR_BIOMES, MIRROR_BLOCKS, MIRROR_ITEMS, MIRROR_LOOT, MIRROR_MINING, MIRROR_RECIPES, MIRROR_TEXTURES } from './mirror';
import { MIRROR_MOBS } from './mirrorMobs';
import type { BiomeDef, BlockDef, ItemDef, LootTable, MiningDef, MobDef, RecipeDef, TextureDef } from './types';

export const P9_BLOCKS: BlockDef[] = [...MIRROR_BLOCKS];
export const P9_TEXTURES: TextureDef[] = [...MIRROR_TEXTURES];
export const P9_ITEMS: ItemDef[] = [...MIRROR_ITEMS];
export const P9_RECIPES: RecipeDef[] = [...MIRROR_RECIPES];
export const P9_MINING: Record<string, MiningDef> = { ...MIRROR_MINING };
export const P9_FOOD: Record<string, { nutrition: number; saturation: number; always?: boolean }> = {};
export const P9_LOOT: Record<string, LootTable> = { ...MIRROR_LOOT };
export const P9_MOBS: MobDef[] = [...MIRROR_MOBS];
export const P9_BIOMES: BiomeDef[] = [...MIRROR_BIOMES];
