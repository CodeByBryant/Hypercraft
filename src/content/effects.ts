// Status effects (Phase 7): what potions, food, beacons-to-come and mobs apply to the player
// and to mobs. The behaviour lives in the engine (game/Effects.ts and its users); this is the
// data: names, colours for the HUD and particles, and whether an effect is good for you.

import type { Hex } from './types';

export interface EffectDef {
  name: string;
  displayName: string;
  /** HUD badge and particle colour. */
  color: Hex;
  /** Beneficial (blue-ish HUD frame) or harmful (red). */
  good: boolean;
  /** Applied once, no duration (instant health / damage, saturation). */
  instant?: boolean;
  /** A short glyph for the HUD badge. */
  glyph: string;
  description: string;
}

export const EFFECTS: EffectDef[] = [
  { name: 'speed', displayName: 'Speed', color: '#7cafc6', good: true, glyph: '»', description: '+20% walking speed per level' },
  { name: 'slowness', displayName: 'Slowness', color: '#5a6c81', good: false, glyph: '«', description: '-15% walking speed per level' },
  { name: 'haste', displayName: 'Haste', color: '#d9c043', good: true, glyph: '⛏', description: '+20% mining and attack speed per level' },
  { name: 'mining_fatigue', displayName: 'Mining Fatigue', color: '#4a4217', good: false, glyph: '⛏', description: 'Mining is much slower' },
  { name: 'strength', displayName: 'Strength', color: '#932423', good: true, glyph: '⚔', description: '+3 melee damage per level' },
  { name: 'weakness', displayName: 'Weakness', color: '#484d48', good: false, glyph: '⚔', description: '-4 melee damage' },
  { name: 'instant_health', displayName: 'Instant Health', color: '#f82423', good: true, instant: true, glyph: '♥', description: 'Heals 4 per level (hurts the undead)' },
  { name: 'instant_damage', displayName: 'Instant Damage', color: '#430a09', good: false, instant: true, glyph: '☠', description: 'Deals 6 per level (heals the undead)' },
  { name: 'jump_boost', displayName: 'Jump Boost', color: '#22ff4c', good: true, glyph: '⤒', description: 'Jump higher; less fall damage' },
  { name: 'regeneration', displayName: 'Regeneration', color: '#cd5cab', good: true, glyph: '✚', description: 'Heals over time' },
  { name: 'resistance', displayName: 'Resistance', color: '#99453a', good: true, glyph: '⛨', description: '-20% damage taken per level' },
  { name: 'fire_resistance', displayName: 'Fire Resistance', color: '#e49a3a', good: true, glyph: '🔥', description: 'Immune to fire and lava' },
  { name: 'water_breathing', displayName: 'Water Breathing', color: '#2e5299', good: true, glyph: '≈', description: 'Breathe underwater' },
  { name: 'night_vision', displayName: 'Night Vision', color: '#1f1fa1', good: true, glyph: '👁', description: 'See in the dark' },
  { name: 'invisibility', displayName: 'Invisibility', color: '#7f8392', good: true, glyph: '◌', description: 'Mobs only notice you up close' },
  { name: 'slow_falling', displayName: 'Slow Falling', color: '#f3cfb9', good: true, glyph: '❀', description: 'Fall gently; no fall damage' },
  { name: 'poison', displayName: 'Poison', color: '#4e9331', good: false, glyph: '☣', description: 'Damage over time (never kills)' },
  { name: 'wither', displayName: 'Wither', color: '#352a27', good: false, glyph: '☠', description: 'Damage over time (can kill)' },
  { name: 'hunger', displayName: 'Hunger', color: '#587653', good: false, glyph: '🍖', description: 'You get hungry faster' },
  { name: 'saturation', displayName: 'Saturation', color: '#f82423', good: true, instant: true, glyph: '🍖', description: 'Fills hunger and saturation' },
  { name: 'absorption', displayName: 'Absorption', color: '#2552a5', good: true, glyph: '♥', description: '+4 golden health per level' },
  { name: 'blindness', displayName: 'Blindness', color: '#1f1f23', good: false, glyph: '◐', description: 'The fog closes in' },
  // 4D effects.
  { name: 'phase_sight', displayName: 'Phase Sight', color: '#c86aff', good: true, glyph: '◈', description: 'See the slices kata and ana of yours, and mobs anywhere near' },
  { name: 'anchor', displayName: 'Anchor', color: '#6a8aa8', good: true, glyph: '⚓', description: 'Nothing can shift you kata or ana' },
];

export const EFFECT_BY_NAME = new Map(EFFECTS.map((e) => [e.name, e]));

/** Roman numerals for effect and enchantment levels. */
export function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
