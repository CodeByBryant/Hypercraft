import type { ToolTierDef } from './types';

// Tool material tiers. `level` gates which ores drop (see mining.ts); `speed` multiplies mining
// speed with the matching tool kind. Realm tiers (Ancient Slag, Starlight, Prism) arrive with
// their realms.
export const TIERS: ToolTierDef[] = [
  { name: 'wood', displayName: 'Wooden', level: 0, speed: 2, durability: 59, damage: 0, enchantability: 15, material: '#planks', color: '#a8864f', shade: '#77603a' },
  { name: 'stone', displayName: 'Stone', level: 1, speed: 4, durability: 131, damage: 1, enchantability: 5, material: '#stone_crafting', color: '#8a8a8a', shade: '#5a5a5a' },
  { name: 'copper', displayName: 'Copper', level: 1, speed: 5, durability: 190, damage: 1, enchantability: 12, material: 'copper_ingot', color: '#d8804a', shade: '#9a5436' },
  { name: 'gold', displayName: 'Golden', level: 0, speed: 12, durability: 32, damage: 0, enchantability: 22, material: 'gold_ingot', color: '#f4d03f', shade: '#c9a227' },
  { name: 'iron', displayName: 'Iron', level: 2, speed: 6, durability: 250, damage: 2, enchantability: 14, material: 'iron_ingot', color: '#e0e0e0', shade: '#9a9a9a' },
  { name: 'azurite', displayName: 'Azurite', level: 2, speed: 7, durability: 500, damage: 2, enchantability: 25, material: 'azurite', color: '#3f6ff0', shade: '#1f45b0' },
  { name: 'verdant', displayName: 'Verdant', level: 3, speed: 7.5, durability: 900, damage: 3, enchantability: 18, material: 'verdant', color: '#3fe880', shade: '#1fa850' },
  { name: 'hyperite', displayName: 'Hyperite', level: 3, speed: 8, durability: 1561, damage: 3, enchantability: 10, material: 'hyperite', color: '#6ff8ff', shade: '#2fb4c8' },
  // Ember Depths (Phase 6): the strongest tier. Slag ingots come from Ancient Slag.
  { name: 'slag', displayName: 'Ancient Slag', level: 4, speed: 9, durability: 2031, damage: 4, enchantability: 15, material: 'ancient_slag_ingot', color: '#6a4430', shade: '#3a2418' },
  // Hollow Void (Phase 8): the top tier. Ingots are smelted from Starlight Shards.
  { name: 'starlight', displayName: 'Starlight', level: 4, speed: 10, durability: 2400, damage: 5, enchantability: 22, material: 'starlight_ingot', color: '#9ad8ff', shade: '#4a78c0' },
];
