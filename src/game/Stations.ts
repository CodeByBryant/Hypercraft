// Station logic shared by the game and the UI (Phase 7): the enchanting table's offers and
// bookshelves, applying an offer. The anvil and grindstone rules are pure (content/enchanting).

import { REG } from '../content/registry';
import { IREG } from '../content/itemRegistry';
import { offerLevels, rollEnchantments, enchantabilityOf } from '../content/enchanting';
import { Rng, mix32 } from '../math/rng';
import type { World } from '../world/World';
import type { ItemStack } from './items/ItemStack';

let BOOKSHELF = -1;

/**
 * Bookshelves powering an enchanting table at (x, y, z, w): Minecraft's ring two blocks out,
 * at the table's level and one above, in all three horizontal axes (a 4D table has a
 * hollow 5x5x5 shell of spots, not a 5x5 ring), with air between shelf and table. At most 15
 * count.
 */
export function countBookshelves(world: World, x: number, y: number, z: number, w: number): number {
  if (BOOKSHELF < 0) BOOKSHELF = REG.id('bookshelf');
  let n = 0;
  for (let dw = -2; dw <= 2; dw++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dw)) !== 2) continue;
        for (let dy = 0; dy <= 1; dy++) {
          if ((world.getBlock(x + dx, y + dy, z + dz, w + dw) & 0xfff) !== BOOKSHELF) continue;
          // The cell halfway must be open (Minecraft: integer half of the offset).
          const between = world.getBlock(x + Math.trunc(dx / 2), y + dy, z + Math.trunc(dz / 2), w + Math.trunc(dw / 2)) & 0xfff;
          if (REG.solid[between]) continue;
          if (++n >= 15) return 15;
        }
      }
  return n;
}

export interface EnchantOffer {
  /** Experience level required. */
  level: number;
  /** Levels (and azurite) it costs: 1, 2 or 3. */
  cost: number;
  ench: [string, number][];
}

/**
 * The table's three offers for `item` (deterministic per player seed, item and shelves, like
 * Minecraft's: the offers only change after you enchant something).
 */
export function enchantOffers(item: ItemStack | null, shelves: number, seed: number): (EnchantOffer | null)[] {
  if (!item || item.count !== 1 || item.tag?.ench?.length || enchantabilityOf(item.id) <= 0) return [null, null, null];
  const base = mix32(seed ^ Math.imul(item.id + 1, 0x9e3779b1) ^ (shelves * 0x85ebca6b));
  const r0 = new Rng(base);
  const lv = offerLevels(shelves, () => r0.next());
  return lv.map((level, i) => {
    const r = new Rng(mix32(base + i * 0x632be5ab));
    const ench = rollEnchantments(item.id, level, () => r.next());
    return ench.length ? { level, cost: i + 1, ench } : null;
  });
}

/** Apply an offer: books become enchanted books. Returns the new stack. */
export function applyOffer(item: ItemStack, offer: EnchantOffer): ItemStack {
  const book = IREG.name(item.id) === 'book';
  const out: ItemStack = { id: book ? IREG.id('enchanted_book') : item.id, count: 1, damage: item.damage };
  const tag = item.tag ? (JSON.parse(JSON.stringify(item.tag)) as NonNullable<ItemStack['tag']>) : {};
  tag.ench = offer.ench.map(([n, l]) => [n, l] as [string, number]);
  out.tag = tag;
  return out;
}
