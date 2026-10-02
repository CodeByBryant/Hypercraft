// Farming (Phase 7): farmland, crops with growth stages, stems that grow melons and pumpkins,
// berry bushes that regrow, ember wart on soul sand, saplings for every tree, bone meal.
// Growth is simulated in game/Farming.ts; this is the data.
//
// In 4D farmland is hydrated by water within 4 blocks along x, z AND w (a 9x9x9 hyper-area),
// stems grow their fruit onto any of six neighbours (+-x, +-z, +-w), and a field is a 3D
// grid of plots: walk kata and ana to see the rest of your farm.

import type { BlockDef, DropDef, Hex, ItemDef, MiningDef, RecipeDef, TextureDef } from './types';
import { TREES } from './trees';
import { WILDS_TREES } from './wilds';
import { CAVE_TREES } from './caves';

export interface CropDef {
  /** Block name prefix: stages are `${name}_0` .. `${name}_${stages - 1}`. */
  name: string;
  displayName: string;
  stages: number;
  /** Item that plants it. */
  seed: string;
  /** Blocks it is planted on. */
  soil: string[];
  /** Blade colours (low, high), grain at the tips, roots at the base when mature. */
  colors: [Hex, Hex, Hex?, Hex?];
  mature: DropDef[];
  young: DropDef[];
  /** Stems: the fruit block grown next to a mature stem. */
  fruit?: string;
  /** Minimum light to grow (0: ember wart grows in the dark). */
  light: number;
}

const FARMLAND = ['farmland', 'farmland_moist'];

export const CROPS: CropDef[] = [
  { name: 'wheat', displayName: 'Wheat', stages: 8, seed: 'wheat_seeds', soil: FARMLAND, colors: ['#3f8a2a', '#6aaa3a', '#d8b848'], mature: [{ item: 'wheat' }, { item: 'wheat_seeds', count: [0, 3] }], young: [{ item: 'wheat_seeds' }], light: 9 },
  { name: 'carrots', displayName: 'Carrots', stages: 4, seed: 'carrot', soil: FARMLAND, colors: ['#3a8a2a', '#5aaa3a', undefined, '#f08a1a'], mature: [{ item: 'carrot', count: [2, 5] }], young: [{ item: 'carrot' }], light: 9 },
  { name: 'potatoes', displayName: 'Potatoes', stages: 4, seed: 'potato', soil: FARMLAND, colors: ['#3a7a2a', '#5a9a3a', undefined, '#c8a868'], mature: [{ item: 'potato', count: [2, 5] }, { item: 'poisonous_potato', chance: 0.02 }], young: [{ item: 'potato' }], light: 9 },
  { name: 'beetroots', displayName: 'Beetroots', stages: 4, seed: 'beetroot_seeds', soil: FARMLAND, colors: ['#3a7a2a', '#7a3a3a', undefined, '#a8203a'], mature: [{ item: 'beetroot' }, { item: 'beetroot_seeds', count: [0, 3] }], young: [{ item: 'beetroot_seeds' }], light: 9 },
  { name: 'melon_stem', displayName: 'Melon Stem', stages: 8, seed: 'melon_seeds', soil: FARMLAND, colors: ['#5a9a3a', '#8aaa3a'], mature: [{ item: 'melon_seeds', count: [0, 2] }], young: [{ item: 'melon_seeds', chance: 0.5 }], fruit: 'melon', light: 9 },
  { name: 'pumpkin_stem', displayName: 'Pumpkin Stem', stages: 8, seed: 'pumpkin_seeds', soil: FARMLAND, colors: ['#5a9a3a', '#a8a83a'], mature: [{ item: 'pumpkin_seeds', count: [0, 2] }], young: [{ item: 'pumpkin_seeds', chance: 0.5 }], fruit: 'pumpkin', light: 9 },
  { name: 'ember_wart', displayName: 'Ember Wart', stages: 4, seed: 'ember_wart', soil: ['soul_sand', 'soul_soil'], colors: ['#7a1414', '#c8302a', '#ff7a4a'], mature: [{ item: 'ember_wart', count: [2, 4] }], young: [{ item: 'ember_wart' }], light: 0 },
];

/** Bushes picked with use: mature -> young (berries out) -> grows back. */
export interface BushDef {
  mature: string;
  young: string;
  berry: string;
}

export const BUSHES: BushDef[] = [
  { mature: 'sweet_berry_bush', young: 'sweet_berry_bush_young', berry: 'sweet_berries' },
  { mature: 'strawberry_bush', young: 'strawberry_bush_young', berry: 'strawberries' },
];

/** Sapling block -> tree it grows into. */
export const SAPLINGS: Record<string, string> = {};
/** Leaves block -> the sapling it drops. */
export const LEAF_SAPLING: Record<string, string> = {};

export const FARM_TEXTURES: TextureDef[] = [
  { name: 'farmland_top', pattern: 'furrows', colors: ['#6b4a2e', '#553a22'] },
  { name: 'farmland_moist_top', pattern: 'furrows', colors: ['#4a321e', '#3a2616'] },
  { name: 'melon_side', pattern: 'stripes', colors: ['#5aa83a', '#3a7a24'], amount: 0.08 },
  { name: 'melon_top', pattern: 'noise', colors: ['#6ab84a', '#5aa83a'], amount: 0.1 },
  { name: 'pumpkin_side', pattern: 'stripes', colors: ['#e8902a', '#c8701a'], amount: 0.08 },
  { name: 'pumpkin_top', pattern: 'noise', colors: ['#d8801a', '#c8701a'], amount: 0.1 },
  { name: 'sweet_berry_bush_young', pattern: 'plant', colors: ['#2f5a2a', '#3f6a2a'], density: 0.5 },
  { name: 'strawberry_bush_young', pattern: 'plant', colors: ['#3f6a2a', '#4f7a2a'], density: 0.5 },
];

export const FARM_BLOCKS: BlockDef[] = [
  { name: 'farmland', render: 'opaque', solid: true, shape: 'path', opaque: false, textures: { top: 'farmland_top', side: 'dirt', bottom: 'dirt' }, hardness: 0.6, tags: ['farmland'] },
  { name: 'farmland_moist', displayName: 'Farmland', render: 'opaque', solid: true, shape: 'path', opaque: false, textures: { top: 'farmland_moist_top', side: 'dirt', bottom: 'dirt' }, hardness: 0.6, tags: ['farmland'] },
  { name: 'melon', render: 'opaque', solid: true, textures: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' }, hardness: 1, tags: ['fruit'] },
  { name: 'pumpkin', render: 'opaque', solid: true, textures: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tags: ['fruit'] },
  { name: 'sweet_berry_bush_young', displayName: 'Sweet Berry Bush', render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: 'sweet_berry_bush_young' }, hardness: 0, tags: ['plant', 'bush'] },
  { name: 'strawberry_bush_young', displayName: 'Strawberry Bush', render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: 'strawberry_bush_young' }, hardness: 0, tags: ['plant', 'bush'] },
];

export const FARM_MINING: Record<string, MiningDef> = {
  farmland: { tool: 'shovel', drops: [{ item: 'dirt' }] },
  farmland_moist: { tool: 'shovel', drops: [{ item: 'dirt' }] },
  melon: { tool: 'axe', drops: [{ item: 'melon_slice', count: [3, 7] }] },
  pumpkin: { tool: 'axe' },
  sweet_berry_bush: { drops: [{ item: 'sweet_berries', count: [1, 2] }] },
  sweet_berry_bush_young: { drops: 'none' },
  strawberry_bush: { drops: [{ item: 'strawberries', count: [1, 2] }] },
  strawberry_bush_young: { drops: 'none' },
  tall_grass: { shears: true, drops: [{ item: 'wheat_seeds', chance: 0.125 }] },
  wild_wheat: { drops: [{ item: 'wheat', count: [1, 2] }, { item: 'wheat_seeds', count: [0, 2] }] },
};

for (const c of CROPS) {
  for (let k = 0; k < c.stages; k++) {
    const name = `${c.name}_${k}`;
    const growth = c.stages === 1 ? 1 : k / (c.stages - 1);
    const cols: Hex[] = [c.colors[0], c.colors[1]];
    if (c.colors[2] || c.colors[3]) cols.push(c.colors[2] ?? c.colors[1]);
    if (c.colors[3]) cols.push(c.colors[3]);
    FARM_TEXTURES.push({ name, pattern: 'crop', colors: cols, amount: growth, density: 0.35 + 0.3 * growth });
    FARM_BLOCKS.push({ name, displayName: c.displayName, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, hardness: 0, tags: ['plant', 'crop'] });
    FARM_MINING[name] = { drops: k === c.stages - 1 ? c.mature : c.young };
  }
}

// Saplings: one per tree that has leaves (and grows like a tree, not a mushroom or kelp).
const GROWS = new Set(['ball', 'birch', 'cone', 'acacia', 'wide', 'pine', 'palm', 'weeping', 'baobab', 'mangrove', 'giant']);
for (const t of [...TREES, ...WILDS_TREES, ...CAVE_TREES]) {
  if (!t.leaves || !GROWS.has(t.shape) || t.name.startsWith('big_') || t.name.startsWith('frost_')) continue;
  const name = `${t.name}_sapling`;
  if (SAPLINGS[name]) continue;
  SAPLINGS[name] = t.name;
  if (!LEAF_SAPLING[t.leaves]) LEAF_SAPLING[t.leaves] = name;
  FARM_TEXTURES.push({ name, pattern: 'flower', colors: ['#6b5130', '#6b5130', '#4f9a3a'] });
  FARM_BLOCKS.push({ name, displayName: `${t.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Sapling`, render: 'cutout', solid: false, shape: 'plant', opaque: false, textures: { all: name }, biomeTint: 2, hardness: 0, tags: ['plant', 'sapling'] });
}

const seed = (name: string, displayName: string, colors: Hex[], use: ItemDef['use'] = 'seeds'): ItemDef => ({ name, displayName, icon: { shape: 'seeds', colors }, use, group: 'natural' });

export const FARM_ITEMS: ItemDef[] = [
  seed('wheat_seeds', 'Wheat Seeds', ['#8aaa3a', '#5a7a2a']),
  seed('beetroot_seeds', 'Beetroot Seeds', ['#a8803a', '#7a5a2a']),
  seed('melon_seeds', 'Melon Seeds', ['#3a3a2a', '#1a1a10']),
  seed('pumpkin_seeds', 'Pumpkin Seeds', ['#f0e0a0', '#c8b070']),
  { name: 'bone_meal', displayName: 'Bone Meal', icon: { shape: 'dust', colors: ['#f0ece0', '#c8c4b8', '#ffffff'] }, use: 'bone_meal', group: 'natural' },
];

/** Items that plant something, by item name -> what they plant (crop stage 0, bush, ember wart). */
export const PLANTS: Record<string, { block: string; soil: string[] | 'soil' }> = {};
for (const c of CROPS) PLANTS[c.seed] = { block: `${c.name}_0`, soil: c.soil };
for (const b of BUSHES) PLANTS[b.berry] = { block: b.young, soil: 'soil' };

export const FARM_RECIPES: RecipeDef[] = [
  { type: 'shapeless', ingredients: ['bone'], result: 'bone_meal', count: 3 },
  { type: 'shapeless', ingredients: ['melon_slice'], result: 'melon_seeds' },
  { type: 'shapeless', ingredients: ['pumpkin'], result: 'pumpkin_seeds', count: 4 },
  { type: 'shaped', pattern: ['mmm', 'mmm', 'mmm'], key: { m: 'melon_slice' }, result: 'melon' },
  { type: 'shapeless', ingredients: ['pumpkin', 'sugar', 'egg'], result: 'pumpkin_pie' },
];

/** Blocks the farming simulation keeps track of (crops, young bushes, saplings, farmland). */
export function isGrowable(b: BlockDef): boolean {
  const t = b.tags ?? [];
  return t.includes('crop') || t.includes('sapling') || t.includes('farmland') || b.name.endsWith('_bush_young');
}
