// The player's inventory: 9 hotbar slots, 27 main slots, 4 armour slots, 1 off-hand slot.

import { SlotContainer, insertInto, type ItemStack } from './ItemStack';
import { IREG } from '../../content/itemRegistry';

export const HOTBAR_SIZE = 9;
export const MAIN_START = 9;
export const MAIN_END = 36;
export const ARMOR_START = 36;
export const OFFHAND = 40;
export const INVENTORY_SIZE = 41;

export class Inventory extends SlotContainer {
  constructor() {
    super(INVENTORY_SIZE);
  }

  accepts(i: number, s: ItemStack): boolean {
    // Armour slots take only armour for that slot (Phase 7).
    if (i >= ARMOR_START && i < OFFHAND) return IREG.armorSlot[s.id] === i - ARMOR_START;
    return true;
  }

  /** Add to hotbar + main (merging first); mutates `s.count`, returns the leftover count. */
  add(s: ItemStack): number {
    return insertInto(this, s, 0, MAIN_END);
  }

  hotbar(i: number): ItemStack | null {
    return this.get(i);
  }
}
