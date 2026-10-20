// Phase 9 content in one place: the Mirror Realm, the Crystal Abyss and the Cloud Archipelago
// each have their own module; this file gathers their blocks, textures, items, recipes, mining
// rules, food, loot, biomes and mobs so the registries wire in one import.

import { ABYSS_BIOMES, ABYSS_BLOCKS, ABYSS_ITEMS, ABYSS_LOOT, ABYSS_MINING, ABYSS_RECIPES, ABYSS_TEXTURES } from './abyss';
import { CLOUD_BIOMES, CLOUD_BLOCKS, CLOUD_ITEMS, CLOUD_LOOT, CLOUD_MINING, CLOUD_RECIPES, CLOUD_TEXTURES } from './cloud';
import { MIRROR_BIOMES, MIRROR_BLOCKS, MIRROR_ITEMS, MIRROR_LOOT, MIRROR_MINING, MIRROR_RECIPES, MIRROR_TEXTURES } from './mirror';
import { MIRROR_MOBS } from './mirrorMobs';
import { ABYSS_MOBS } from './abyssMobs';
import { BIOMES } from './biomes';
import { WILDS_BIOMES } from './wilds';
import type { BiomeDef, BlockDef, ItemDef, LootTable, MiningDef, MobDef, RecipeDef, TextureDef } from './types';

export const P9_BLOCKS: BlockDef[] = [...MIRROR_BLOCKS, ...ABYSS_BLOCKS, ...CLOUD_BLOCKS];
export const P9_TEXTURES: TextureDef[] = [...MIRROR_TEXTURES, ...ABYSS_TEXTURES, ...CLOUD_TEXTURES];
export const P9_ITEMS: ItemDef[] = [...MIRROR_ITEMS, ...ABYSS_ITEMS, ...CLOUD_ITEMS];
export const P9_RECIPES: RecipeDef[] = [...MIRROR_RECIPES, ...ABYSS_RECIPES, ...CLOUD_RECIPES];
export const P9_MINING: Record<string, MiningDef> = { ...MIRROR_MINING, ...ABYSS_MINING, ...CLOUD_MINING };
export const P9_FOOD: Record<string, { nutrition: number; saturation: number; always?: boolean }> = {};
export const P9_LOOT: Record<string, LootTable> = { ...MIRROR_LOOT, ...ABYSS_LOOT, ...CLOUD_LOOT };
export const P9_MOBS: MobDef[] = [...MIRROR_MOBS, ...ABYSS_MOBS];
export const P9_BIOMES: BiomeDef[] = [...MIRROR_BIOMES, ...ABYSS_BIOMES, ...CLOUD_BIOMES];

/** The Surface biomes a Sky Gate may stand in: the peaks. */
export const SKY_GATE_HOSTS = ['hollow_peaks', 'frost_spires', 'stony_peaks', 'volcanic_highlands'];

// The Geode Gate (a deep geode on the Surface, the way to the Abyss) may lie under any biome above
// ground, and the Silver Arch (the way to the Mirror Realm) on any dry land: the wilds biomes too.
for (const b of [...BIOMES, ...WILDS_BIOMES]) {
  if (b.kind !== 'underground' && !b.structures?.includes('geode_gate')) b.structures = [...(b.structures ?? []), 'geode_gate'];
  if (b.kind === 'land' && !b.structures?.includes('silver_arch')) b.structures = [...(b.structures ?? []), 'silver_arch'];
  // The Sky Gate stands on the high peaks only.
  if (SKY_GATE_HOSTS.includes(b.name) && !b.structures?.includes('sky_gate')) b.structures = [...(b.structures ?? []), 'sky_gate'];
}
