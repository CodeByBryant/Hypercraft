// Survival mining: break times, harvest rules and drops (Minecraft-style formula).
//   speed    = tool tier speed if the held tool is the block's tool kind, else 1
//              (shears on shears-blocks: 5); / 5 in the air; / 5 under water
//   progress = speed / hardness / (canHarvest ? 30 : 100) per tick (20 ticks/s)
// Hardness 0 breaks instantly; negative hardness is unbreakable.

import { IREG, TOOL_KINDS } from '../../content/itemRegistry';
import { REG } from '../../content/registry';
import type { ItemStack } from './ItemStack';

const SHEARS = TOOL_KINDS.indexOf('shears') + 1;
const SWORD = TOOL_KINDS.indexOf('sword') + 1;

export interface BreakInfo {
  /** Seconds to break (0 = instant, Infinity = unbreakable). */
  seconds: number;
  /** Whether the block drops anything with this tool. */
  canHarvest: boolean;
  /** Whether the held tool is the right kind (for durability use). */
  rightTool: boolean;
}

export function canHarvest(block: number, held: number): boolean {
  const need = IREG.mineTier[block]!;
  if (need < 0) return true;
  if (held < 0) return false;
  const kind = IREG.mineTool[block]!;
  if (IREG.toolKind[held] !== kind) return false;
  const t = IREG.tier(held);
  return t !== null && t.level >= need;
}

export function breakInfo(block: number, held: number, onGround = true, inWater = false): BreakInfo {
  const hardness = REG.hardness[block]!;
  if (hardness < 0) return { seconds: Infinity, canHarvest: false, rightTool: false };
  const harvest = canHarvest(block, held);
  const kind = IREG.mineTool[block]!;
  let speed = 1;
  let right = false;
  if (held >= 0 && kind !== 0 && IREG.toolKind[held] === kind) {
    right = true;
    speed = IREG.tier(held)?.speed ?? 1;
  } else if (held >= 0 && IREG.toolKind[held] === SHEARS && IREG.shearsDrop[block]) {
    right = true;
    speed = 5;
  }
  if (hardness === 0) return { seconds: 0, canHarvest: harvest, rightTool: right };
  if (!onGround) speed /= 5;
  if (inWater) speed /= 5;
  const perTick = speed / hardness / (harvest ? 30 : 100);
  const ticks = perTick >= 1 ? 0 : Math.ceil(1 / perTick);
  return { seconds: ticks / 20, canHarvest: harvest, rightTool: right };
}

/** Roll the drops for breaking `block` with `held` (-1 = hand). `rand` returns [0, 1). */
export function rollDrops(block: number, held: number, rand: () => number): ItemStack[] {
  if (!canHarvest(block, held)) return [];
  const self = IREG.blockItem[block]!;
  if (held >= 0 && IREG.toolKind[held] === SHEARS && IREG.shearsDrop[block]) return self >= 0 ? [{ id: self, count: 1, damage: 0 }] : [];
  const list = IREG.drops[block];
  if (list === null || list === undefined) return self >= 0 ? [{ id: self, count: 1, damage: 0 }] : [];
  const out: ItemStack[] = [];
  for (const d of list) {
    if (rand() >= d.chance) continue;
    const n = d.min + Math.floor(rand() * (d.max - d.min + 1));
    if (n > 0) out.push({ id: d.item, count: n, damage: 0 });
  }
  return out;
}

/** Durability cost of using `held` to break `block` (tools wear 1, swords 2; instant blocks 0). */
export function wearFor(block: number, held: number): number {
  if (held < 0 || IREG.toolKind[held] === 0 || IREG.durability[held] === 0) return 0;
  if (REG.hardness[block]! === 0) return 0;
  return IREG.toolKind[held] === SWORD ? 2 : 1;
}
