// Enchantments (Phase 7): Minecraft's set (weights, level ranges, conflicts) plus five 4D ones.
// The rules live in content/enchanting.ts (applicability, the enchanting table's rolls, the
// anvil and grindstone); the effects in the engine (Game, Survival, MobManager).
//
// Power ranges: an enchantment level k can be rolled when the table's modified level lies in
// [min(k), min(k) + span], with min(k) = base + step * (k - 1) (Minecraft's numbers).

/** What an enchantment goes on. */
export type EnchantTarget = 'armor' | 'head' | 'chest' | 'legs' | 'feet' | 'sword' | 'weapon' | 'tool' | 'pickaxe' | 'bow' | 'durable' | 'reach';

export interface EnchantDef {
  name: string;
  displayName: string;
  maxLevel: number;
  /** Rarity weight: common 10, uncommon 5, rare 2, very rare 1. */
  weight: number;
  target: EnchantTarget;
  /** Enchanting-table power for level k: base + step (k - 1), up to + span. */
  base: number;
  step: number;
  span: number;
  /** Mutually exclusive with these. */
  conflicts?: string[];
  /** Never from the enchanting table (loot, trades and books only). */
  treasure?: boolean;
  curse?: boolean;
  description: string;
}

const PROT = ['protection', 'fire_protection', 'blast_protection', 'projectile_protection'];
const DMG = ['sharpness', 'smite', 'bane_of_arthropods'];

export const ENCHANTMENTS: EnchantDef[] = [
  // Armour.
  { name: 'protection', displayName: 'Protection', maxLevel: 4, weight: 10, target: 'armor', base: 1, step: 11, span: 11, conflicts: PROT, description: 'Reduces most damage' },
  { name: 'fire_protection', displayName: 'Fire Protection', maxLevel: 4, weight: 5, target: 'armor', base: 10, step: 8, span: 8, conflicts: PROT, description: 'Reduces fire damage and burn time' },
  { name: 'blast_protection', displayName: 'Blast Protection', maxLevel: 4, weight: 2, target: 'armor', base: 5, step: 8, span: 8, conflicts: PROT, description: 'Reduces explosion damage' },
  { name: 'projectile_protection', displayName: 'Projectile Protection', maxLevel: 4, weight: 5, target: 'armor', base: 3, step: 6, span: 6, conflicts: PROT, description: 'Reduces arrow and fireball damage' },
  { name: 'feather_falling', displayName: 'Feather Falling', maxLevel: 4, weight: 5, target: 'feet', base: 5, step: 6, span: 6, description: 'Reduces fall damage' },
  { name: 'respiration', displayName: 'Respiration', maxLevel: 3, weight: 2, target: 'head', base: 10, step: 10, span: 30, description: 'Breathe longer underwater' },
  { name: 'aqua_affinity', displayName: 'Aqua Affinity', maxLevel: 1, weight: 2, target: 'head', base: 1, step: 0, span: 40, description: 'Mine at full speed underwater' },
  { name: 'thorns', displayName: 'Thorns', maxLevel: 3, weight: 1, target: 'chest', base: 10, step: 20, span: 50, description: 'Hurts what hits you' },
  { name: 'depth_strider', displayName: 'Depth Strider', maxLevel: 3, weight: 2, target: 'feet', base: 10, step: 10, span: 15, conflicts: ['frost_walker'], description: 'Walk faster underwater' },
  { name: 'frost_walker', displayName: 'Frost Walker', maxLevel: 2, weight: 2, target: 'feet', base: 10, step: 10, span: 15, conflicts: ['depth_strider'], treasure: true, description: 'Freezes water under your feet (in all four dimensions)' },
  // Weapons.
  { name: 'sharpness', displayName: 'Sharpness', maxLevel: 5, weight: 10, target: 'weapon', base: 1, step: 11, span: 20, conflicts: DMG, description: 'Extra melee damage' },
  { name: 'smite', displayName: 'Smite', maxLevel: 5, weight: 5, target: 'weapon', base: 5, step: 8, span: 20, conflicts: DMG, description: 'Extra damage to the undead' },
  { name: 'bane_of_arthropods', displayName: 'Bane of Arthropods', maxLevel: 5, weight: 5, target: 'weapon', base: 5, step: 8, span: 20, conflicts: DMG, description: 'Extra damage to crawlers and weavers; slows them' },
  { name: 'knockback', displayName: 'Knockback', maxLevel: 2, weight: 5, target: 'sword', base: 5, step: 20, span: 50, description: 'Knocks mobs further' },
  { name: 'fire_aspect', displayName: 'Fire Aspect', maxLevel: 2, weight: 2, target: 'sword', base: 10, step: 20, span: 50, description: 'Sets what you hit on fire' },
  { name: 'looting', displayName: 'Looting', maxLevel: 3, weight: 2, target: 'sword', base: 15, step: 9, span: 50, description: 'More drops from mobs' },
  { name: 'sweeping', displayName: 'Sweeping Edge', maxLevel: 3, weight: 2, target: 'sword', base: 5, step: 9, span: 15, description: 'Sweeps hit everything around your target, in 4D' },
  // Tools.
  { name: 'efficiency', displayName: 'Efficiency', maxLevel: 5, weight: 10, target: 'tool', base: 1, step: 10, span: 50, description: 'Mine faster' },
  { name: 'silk_touch', displayName: 'Silk Touch', maxLevel: 1, weight: 1, target: 'tool', base: 15, step: 0, span: 50, conflicts: ['fortune'], description: 'Blocks drop themselves' },
  { name: 'fortune', displayName: 'Fortune', maxLevel: 3, weight: 2, target: 'tool', base: 15, step: 9, span: 50, conflicts: ['silk_touch'], description: 'More drops from ores' },
  { name: 'unbreaking', displayName: 'Unbreaking', maxLevel: 3, weight: 5, target: 'durable', base: 5, step: 8, span: 50, description: 'Lasts longer' },
  { name: 'mending', displayName: 'Mending', maxLevel: 1, weight: 2, target: 'durable', base: 25, step: 25, span: 50, conflicts: ['infinity'], treasure: true, description: 'Experience repairs it' },
  // Bows.
  { name: 'power', displayName: 'Power', maxLevel: 5, weight: 10, target: 'bow', base: 1, step: 10, span: 15, description: 'Arrows hit harder' },
  { name: 'punch', displayName: 'Punch', maxLevel: 2, weight: 2, target: 'bow', base: 12, step: 20, span: 25, description: 'Arrows knock back' },
  { name: 'flame', displayName: 'Flame', maxLevel: 1, weight: 2, target: 'bow', base: 20, step: 0, span: 30, description: 'Arrows set targets on fire' },
  { name: 'infinity', displayName: 'Infinity', maxLevel: 1, weight: 1, target: 'bow', base: 20, step: 0, span: 30, conflicts: ['mending'], description: 'One arrow is enough' },
  // Curses.
  { name: 'curse_of_vanishing', displayName: 'Curse of Vanishing', maxLevel: 1, weight: 1, target: 'durable', base: 25, step: 0, span: 25, treasure: true, curse: true, description: 'Vanishes when you die' },
  // 4D enchantments.
  { name: '4d_vision', displayName: '4D Vision', maxLevel: 1, weight: 1, target: 'head', base: 15, step: 0, span: 45, description: 'See mobs and key blocks (stations, chests, beds, spawners) as 4D wireframes, wherever your slice is' },
  { name: 'slice_sense', displayName: 'Slice Sense', maxLevel: 3, weight: 2, target: 'pickaxe', base: 10, step: 10, span: 30, description: 'Ores in the slices kata and ana of yours glow through the rock' },
  { name: 'phase_strike', displayName: 'Phase Strike', maxLevel: 2, weight: 1, target: 'sword', base: 20, step: 15, span: 40, description: 'Once a second, hit a mob kata or ana of your slice under your crosshair' },
  { name: 'kata_grip', displayName: 'Kata Grip', maxLevel: 3, weight: 2, target: 'feet', base: 8, step: 8, span: 30, description: 'Resist being shoved kata or ana (stalkers, phase storms)' },
  { name: 'reach_through', displayName: 'Reach Through', maxLevel: 3, weight: 2, target: 'reach', base: 12, step: 10, span: 30, description: 'Mine and place blocks up to 1 slice per level kata or ana of yours' },
];

export const ENCHANT_BY_NAME = new Map(ENCHANTMENTS.map((e) => [e.name, e]));

/** Anvil cost multiplier per level by rarity (books halve it). */
export function anvilMultiplier(e: EnchantDef): number {
  return e.weight >= 10 ? 1 : e.weight >= 5 ? 2 : e.weight >= 2 ? 4 : 8;
}
