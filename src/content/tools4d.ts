// Special 4D tools and weapons (Phase 7.7). Tesserite (deep, violet) is their material.
//
//  * Slicer Compass: reads your slice's orientation (the hidden axis and its tilt); use it to
//    snap the view axis-aligned, again to centre yourself in your hidden-axis cell.
//  * Phase Lens (wear it or hold it): faint outlines of nearby mobs kata and ana of you, and of
//    the walls in the neighbouring slices (what you would bump into stepping ana or kata).
//    The Phase Sight potion does the same.
//  * W-Anchor: sneak-use marks where you stand (in 4D); use it to come back (30 s cooldown).
//    Held, it shows the mark's outline wherever it is in 4D, and the HUD points to it.
//  * Hyper Rope: hold use to climb ana (sneak: kata) along the hidden axis, a block every
//    third of a second, hanging on it like a ladder.
//  * Ana Pick: a pickaxe that breaks a 3x3 sheet in the plane of up and the hidden axis
//    (through the slices next to yours).
//  * Spears reach farther, and off your slice (a mob kata or ana of you within reach).
//  * 4D Whip: a swing hits everything in a small hypersphere ahead (off-slice too).
//  * Hyper-Chakram: thrown, it flies out, comes back, and cuts every mob near its path,
//    kata and ana of it too.
//  * Throwing Daggers: thrown straight, stack to 16, pick them up again.
//  * Crossbow: hold use to load an arrow, use again to shoot: a hard, flat bolt.

import type { Hex, ItemDef, RecipeDef } from './types';

const V = ['#c86aff', '#7a2ab0', '#f0d8ff'] as Hex[];

export const TOOLS4D_ITEMS: ItemDef[] = [
  { name: 'slicer_compass', displayName: 'Slicer Compass', maxStack: 1, icon: { shape: 'compass', colors: ['#7a2ab0', '#3a1a6a', '#f0d8ff'] }, use: 'slicer_compass', readout: 'slicer', group: 'tools' },
  { name: 'phase_lens', displayName: 'Phase Lens', maxStack: 1, icon: { shape: 'lens', colors: V }, armor: { slot: 'head', points: 0, toughness: 0 }, group: 'tools', tags: ['armor', 'armor_head', 'lens'] },
  { name: 'w_anchor', displayName: 'W-Anchor', maxStack: 1, durability: 64, icon: { shape: 'anchor', colors: ['#8a8aa8', '#4a4a6a', '#c86aff'] }, use: 'w_anchor', readout: 'anchor', group: 'tools' },
  { name: 'hyper_rope', displayName: 'Hyper Rope', maxStack: 1, durability: 256, icon: { shape: 'rope', colors: ['#c8a878', '#8a6a48', '#c86aff'] }, use: 'hyper_rope', group: 'tools' },
  { name: 'ana_pick', displayName: 'Ana Pick', maxStack: 1, durability: 900, tool: { kind: 'pickaxe', tier: 'iron' }, icon: { shape: 'pickaxe', colors: V }, group: 'tools', tags: ['ana_pick'] },
  { name: 'spear', displayName: 'Iron Spear', maxStack: 1, durability: 300, enchantability: 14, icon: { shape: 'spear', colors: ['#e0e0e0', '#8a6a3c', '#ffffff'] }, weapon: { damage: 7, cooldown: 1.1, reach: 6, hiddenReach: 1.5 }, group: 'combat', tags: ['weapon', 'spear'] },
  { name: 'tesserite_spear', displayName: 'Tesserite Spear', maxStack: 1, durability: 900, enchantability: 16, icon: { shape: 'spear', colors: V }, weapon: { damage: 9, cooldown: 1.0, reach: 7, hiddenReach: 3 }, group: 'combat', tags: ['weapon', 'spear'] },
  { name: 'hyper_whip', displayName: '4D Whip', maxStack: 1, durability: 350, enchantability: 15, icon: { shape: 'whip', colors: ['#8a5a3a', '#5a3a24', '#c86aff'] }, weapon: { damage: 4, cooldown: 0.9, area: 2.6 }, group: 'combat', tags: ['weapon', 'whip'] },
  { name: 'hyper_chakram', displayName: 'Hyper-Chakram', maxStack: 1, durability: 250, enchantability: 15, icon: { shape: 'chakram', colors: V }, use: 'chakram', group: 'combat', tags: ['weapon'] },
  { name: 'throwing_dagger', displayName: 'Throwing Dagger', maxStack: 16, icon: { shape: 'dagger', colors: ['#e0e0e0', '#5a4a3a', '#ffffff'] }, use: 'dagger', group: 'combat' },
  { name: 'crossbow', displayName: 'Crossbow', maxStack: 1, durability: 465, enchantability: 1, icon: { shape: 'bow', colors: ['#5a4028', '#3a2818', '#c8c8c8'] }, use: 'crossbow', group: 'combat' },
];

/** Thrown weapons: damage, speed (blocks/s), gravity, reach off the slice. */
export const THROWN = {
  chakram: { damage: 6, speed: 22, out: 0.55, hidden: 2 },
  dagger: { damage: 5, speed: 26, gravity: 8 },
  /** Crossbow bolt: damage before the arrow kind's multiplier, speed, load seconds. */
  bolt: { damage: 9, speed: 48, load: 1.0 },
};

/** W-Anchor recall cooldown (seconds); Hyper Rope speed (blocks/s). */
export const ANCHOR_COOLDOWN = 30;
export const ROPE_SPEED = 3;

export const TOOLS4D_RECIPES: RecipeDef[] = [
  { type: 'shaped', pattern: [' t ', 'tct', ' t '], key: { t: 'tesserite_shard', c: 'compass' }, result: 'slicer_compass' },
  { type: 'shaped', pattern: [' i ', 'gtg', ' i '], key: { i: 'iron_ingot', g: 'glass', t: 'tesserite_shard' }, result: 'phase_lens' },
  { type: 'shaped', pattern: [' t ', ' i ', 'iii'], key: { t: 'tesserite_shard', i: 'iron_ingot' }, result: 'w_anchor' },
  { type: 'shapeless', ingredients: ['string', 'string', 'string', 'tesserite_shard'], result: 'hyper_rope' },
  { type: 'shaped', pattern: ['ttt', ' s ', ' s '], key: { t: 'tesserite_shard', s: 'stick' }, result: 'ana_pick' },
  { type: 'shaped', pattern: ['  i', ' s ', 's  '], key: { i: 'iron_ingot', s: 'stick' }, result: 'spear' },
  { type: 'shaped', pattern: ['  t', ' s ', 's  '], key: { t: 'tesserite_shard', s: 'stick' }, result: 'tesserite_spear' },
  { type: 'shaped', pattern: ['  t', ' l ', 's  '], key: { t: 'tesserite_shard', l: 'leather', s: 'stick' }, result: 'hyper_whip' },
  { type: 'shaped', pattern: ['iti', 't t', 'iti'], key: { i: 'iron_ingot', t: 'tesserite_shard' }, result: 'hyper_chakram' },
  { type: 'shaped', pattern: ['i', 's'], key: { i: 'iron_ingot', s: 'stick' }, result: 'throwing_dagger', count: 4 },
  { type: 'shaped', pattern: ['sis', 'tit', ' s '], key: { s: 'stick', i: 'iron_ingot', t: 'string' }, result: 'crossbow' },
];
