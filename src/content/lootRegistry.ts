// Compiles the loot tables (validation: known items, positive weights, sane counts) and rolls
// them into chest slots. Pure and deterministic given the random source, so generation
// workers can fill structure chests reproducibly from the world seed.

import { IREG } from './itemRegistry';
import { LOOT_TABLES } from './loot';
import { randomEnchantment, rollEnchantments } from './enchanting';
import type { LootTable } from './types';
import type { ItemTag } from '../game/items/ItemStack';

/** A rolled stack in save format: [item name, count, damage?, tag?]. */
export type LootStack = [string, number, number?, ItemTag?];

interface Entry {
  item: number;
  weight: number;
  min: number;
  max: number;
  wearLo: number;
  wearHi: number;
  enchant: 'random' | [number, number] | null;
}

interface Pool {
  rollsMin: number;
  rollsMax: number;
  total: number;
  entries: Entry[];
}

export class LootRegistry {
  private readonly tables = new Map<string, Pool[]>();

  constructor(defs: Record<string, LootTable>) {
    const errors: string[] = [];
    for (const [name, t] of Object.entries(defs)) {
      const pools: Pool[] = [];
      for (const p of t.pools) {
        const entries: Entry[] = [];
        let total = 0;
        for (const e of p.entries) {
          if (!IREG.has(e.item)) {
            errors.push(`loot "${name}": unknown item "${e.item}"`);
            continue;
          }
          if (!(e.weight > 0)) errors.push(`loot "${name}": entry "${e.item}" needs a positive weight`);
          const [min, max] = e.count ?? [1, 1];
          if (min < 1 || max < min) errors.push(`loot "${name}": bad count for "${e.item}"`);
          const id = IREG.id(e.item);
          if (e.wear && IREG.durability[id] === 0) errors.push(`loot "${name}": "${e.item}" has no durability to wear`);
          entries.push({ item: id, weight: e.weight, min, max, wearLo: e.wear?.[0] ?? 0, wearHi: e.wear?.[1] ?? 0, enchant: e.enchant ?? null });
          total += e.weight;
        }
        if (p.rolls[0] < 0 || p.rolls[1] < p.rolls[0]) errors.push(`loot "${name}": bad rolls`);
        pools.push({ rollsMin: p.rolls[0], rollsMax: p.rolls[1], total, entries });
      }
      this.tables.set(name, pools);
    }
    if (errors.length) throw new Error('Loot table errors:\n  ' + errors.join('\n  '));
  }

  has(name: string): boolean {
    return this.tables.has(name);
  }

  get names(): string[] {
    return [...this.tables.keys()];
  }

  /**
   * Roll a table into `slots` chest slots (Minecraft-style: results land in random empty
   * slots, not packed at the front). `rand` returns [0, 1).
   */
  roll(name: string, rand: () => number, slots = 27): (LootStack | null)[] {
    const pools = this.tables.get(name);
    if (!pools) throw new Error(`unknown loot table "${name}"`);
    const out: (LootStack | null)[] = new Array(slots).fill(null);
    for (const p of pools) {
      const n = p.rollsMin + Math.floor(rand() * (p.rollsMax - p.rollsMin + 1));
      for (let i = 0; i < n && p.total > 0; i++) {
        let r = rand() * p.total;
        let e = p.entries[p.entries.length - 1]!;
        for (const c of p.entries) {
          r -= c.weight;
          if (r < 0) {
            e = c;
            break;
          }
        }
        const count = Math.min(IREG.maxStack[e.item]!, e.min + Math.floor(rand() * (e.max - e.min + 1)));
        const dura = IREG.durability[e.item]!;
        const damage = dura > 0 && e.wearHi > 0 ? Math.min(dura - 1, Math.floor(dura * (e.wearLo + rand() * (e.wearHi - e.wearLo)))) : 0;
        let st: LootStack = damage > 0 ? [IREG.name(e.item), count, damage] : [IREG.name(e.item), count];
        if (e.enchant) {
          let id = e.item;
          let ench: [string, number][] = [];
          if (e.enchant === 'random') {
            const one = randomEnchantment(id, rand);
            if (one) ench = [one];
          } else ench = rollEnchantments(id, e.enchant[0] + Math.floor(rand() * (e.enchant[1] - e.enchant[0] + 1)), rand, true);
          if (ench.length) {
            if (IREG.name(id) === 'book') id = IREG.id('enchanted_book');
            st = [IREG.name(id), 1, damage, { ench }];
          }
        }
        let slot = -1;
        for (let t = 0; t < 12 && slot < 0; t++) {
          const k = Math.floor(rand() * slots);
          if (!out[k]) slot = k;
        }
        if (slot < 0) slot = out.indexOf(null);
        if (slot < 0) return out; // chest full
        out[slot] = st;
      }
    }
    return out;
  }
}

export const LOOT = new LootRegistry(LOOT_TABLES);
