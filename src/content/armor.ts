// Armour (Phase 7): helmet, chestplate, leggings and boots for every material, plus a few
// one-off pieces. Numbers follow Minecraft 1.9+: armour points per piece, toughness that
// softens big hits, durability = per-slot base x the material's multiplier.
//
// In 4D your body is a hyper-capsule, so a set covers it along all four axes; nothing about the
// formulas changes. Two sets have bonuses (all four pieces worn):
//   * Ancient Slag (from the Ember Depths, upgraded at a smithing table): fire immunity, and you
//     swim through lava like water.
//   * Reefshell (helmet only, like a turtle shell): breathe for 10 s after you dive.
// The 4D Glasses sit in the helmet slot: no armour, but every mob near you is drawn as a 4D
// wireframe whether or not your slice passes through it.

import type { ArmorSlot, Hex, ItemDef, RecipeDef } from './types';

export interface ArmorMaterial {
  name: string;
  displayName: string;
  /** Armour points: helmet, chestplate, leggings, boots. */
  points: [number, number, number, number];
  toughness: number;
  knockback?: number;
  /** Durability multiplier (x 11, 16, 15, 13 per slot). */
  durability: number;
  enchantability: number;
  /** Repair / crafting material (item or #tag). */
  material: string;
  color: Hex;
  shade: Hex;
  /** Crafted from `material` (false: smithing upgrade only). */
  craftable: boolean;
  set?: string;
}

export const ARMOR_SLOTS: ArmorSlot[] = ['head', 'chest', 'legs', 'feet'];
const SLOT_NAMES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
const SLOT_LABELS = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
const SLOT_BASE = [11, 16, 15, 13];

export const ARMOR_MATERIALS: ArmorMaterial[] = [
  { name: 'leather', displayName: 'Leather', points: [1, 3, 2, 1], toughness: 0, durability: 5, enchantability: 15, material: 'leather', color: '#a0603a', shade: '#6a3a1f', craftable: true },
  { name: 'copper', displayName: 'Copper', points: [2, 4, 3, 1], toughness: 0, durability: 11, enchantability: 12, material: 'copper_ingot', color: '#d8804a', shade: '#9a5436', craftable: true },
  { name: 'gold', displayName: 'Golden', points: [2, 5, 3, 1], toughness: 0, durability: 7, enchantability: 25, material: 'gold_ingot', color: '#f4d03f', shade: '#c9a227', craftable: true },
  { name: 'iron', displayName: 'Iron', points: [2, 6, 5, 2], toughness: 0, durability: 15, enchantability: 9, material: 'iron_ingot', color: '#dcdcdc', shade: '#9a9a9a', craftable: true },
  { name: 'azurite', displayName: 'Azurite', points: [3, 6, 5, 2], toughness: 1, durability: 22, enchantability: 20, material: 'azurite', color: '#3f6ff0', shade: '#1f45b0', craftable: true },
  { name: 'verdant', displayName: 'Verdant', points: [3, 7, 6, 3], toughness: 1.5, durability: 28, enchantability: 16, material: 'verdant', color: '#3fe880', shade: '#1fa850', craftable: true },
  { name: 'hyperite', displayName: 'Hyperite', points: [3, 8, 6, 3], toughness: 2, durability: 33, enchantability: 10, material: 'hyperite', color: '#6ff8ff', shade: '#2fb4c8', craftable: true },
  { name: 'slag', displayName: 'Ancient Slag', points: [3, 8, 6, 3], toughness: 3, knockback: 0.1, durability: 37, enchantability: 15, material: 'ancient_slag_ingot', color: '#6a4430', shade: '#3a2418', craftable: false, set: 'slag' },
];

export const ARMOR_ITEMS: ItemDef[] = [];
export const ARMOR_RECIPES: RecipeDef[] = [];

const PATTERNS = [['MMM', 'M M'], ['M M', 'MMM', 'MMM'], ['MMM', 'M M', 'M M'], ['M M', 'M M']];

for (const m of ARMOR_MATERIALS) {
  SLOT_NAMES.forEach((slotName, k) => {
    const name = `${m.name}_${slotName}`;
    ARMOR_ITEMS.push({
      name,
      displayName: `${m.displayName} ${SLOT_LABELS[k]}`,
      maxStack: 1,
      durability: SLOT_BASE[k]! * m.durability,
      enchantability: m.enchantability,
      armor: { slot: ARMOR_SLOTS[k]!, points: m.points[k]!, toughness: m.toughness, knockback: m.knockback, set: m.set, repair: m.material },
      icon: { shape: slotName, colors: [m.color, m.shade, '#ffffff'] },
      group: 'combat',
      tags: ['armor', `armor_${ARMOR_SLOTS[k]}`, `${m.name}_armor`],
    });
    if (m.craftable) ARMOR_RECIPES.push({ type: 'shaped', pattern: PATTERNS[k]!, key: { M: m.material }, result: name });
  });
}

// One-offs.
ARMOR_ITEMS.push(
  {
    name: 'reefshell_helmet',
    displayName: 'Reefshell Helmet',
    maxStack: 1,
    durability: 275,
    enchantability: 9,
    armor: { slot: 'head', points: 2, toughness: 0, set: 'reefshell', repair: 'glow_scale' },
    icon: { shape: 'turtle', colors: ['#3a9a7a', '#1f6a52', '#5ff4ff'] },
    group: 'combat',
    tags: ['armor', 'armor_head'],
  },
  {
    // The user's 4D Glasses: helmet slot, no protection, shows every nearby mob in 4D wireframe.
    name: '4d_glasses',
    displayName: '4D Glasses',
    maxStack: 1,
    durability: 0,
    enchantability: 0,
    armor: { slot: 'head', points: 0, toughness: 0 },
    icon: { shape: 'glasses', colors: ['#2a2a34', '#ff5cf0', '#5ff4ff'] },
    group: 'tools',
    tags: ['armor', 'armor_head', 'glasses'],
  },
);
ARMOR_RECIPES.push(
  { type: 'shaped', pattern: ['GGG', 'G G'], key: { G: 'glow_scale' }, result: 'reefshell_helmet' },
  // Two lenses (glass) on an iron frame, tuned with phase dust.
  { type: 'shaped', pattern: ['IPI', 'G G'], key: { I: 'iron_ingot', P: 'phase_dust', G: 'glass' }, result: '4d_glasses' },
);
