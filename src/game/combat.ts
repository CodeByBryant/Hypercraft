// Player combat numbers (Phase 4): melee damage and cooldown per held item, bow charge,
// critical hits and tool wear. Pure functions over the item registry, so they are unit-tested
// and the balance lives in one place.

import { IREG, TOOL_KINDS } from '../content/itemRegistry';
import type { ToolKind } from '../content/types';

/** Base damage by tool kind (before the tier bonus). Fists and non-tools deal 1. */
const BASE: Record<ToolKind, number> = { sword: 4, axe: 4.5, pickaxe: 2, shovel: 2.5, hoe: 1, shears: 1 };
/** Seconds between full-strength swings. */
const COOLDOWN: Record<ToolKind, number> = { sword: 0.6, axe: 1.0, pickaxe: 0.8, shovel: 0.9, hoe: 0.5, shears: 0.5 };
export const FIST_COOLDOWN = 0.3;
/** Seconds to fully draw a bow. */
export const BOW_DRAW = 1;
export const ARROW_SPEED = 32;

function kindOf(itemId: number): ToolKind | null {
  if (itemId < 0) return null;
  const k = IREG.toolKind[itemId]!;
  return k > 0 ? TOOL_KINDS[k - 1]! : null;
}

/** Melee damage of a full-strength hit with `itemId` held (-1 = empty hand). */
export function attackDamage(itemId: number): number {
  const k = kindOf(itemId);
  if (!k) return 1;
  return BASE[k] + (IREG.tier(itemId)?.damage ?? 0);
}

export function attackCooldown(itemId: number): number {
  const k = kindOf(itemId);
  return k ? COOLDOWN[k] : FIST_COOLDOWN;
}

/**
 * Swinging before the cooldown recovers deals less (Minecraft 1.9 style):
 * 20% at 0, full strength once recovered.
 */
export function swingStrength(sinceLast: number, cooldown: number): number {
  const f = Math.max(0, Math.min(1, sinceLast / cooldown));
  return 0.2 + 0.8 * f * f;
}

/** Durability used by one hit: swords 1, other tools 2, non-tools 0. */
export function hitWear(itemId: number): number {
  const k = kindOf(itemId);
  if (!k || k === 'shears') return 0;
  return k === 'sword' ? 1 : 2;
}

/** Critical hit: a full-strength swing while falling. */
export const CRIT_MULTIPLIER = 1.5;

/** Bow power 0..1 from draw time in seconds (Minecraft's curve). */
export function bowPower(seconds: number): number {
  const t = Math.min(1, Math.max(0, seconds / BOW_DRAW));
  return Math.min(1, (t * t + 2 * t) / 3);
}

/** Arrow damage for a given bow power (a full draw deals 9, like a critical arrow). */
export function arrowDamage(power: number): number {
  return Math.max(1, Math.round(1 + 8 * power * power));
}
