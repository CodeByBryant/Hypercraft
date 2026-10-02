// Compiles items (block items + ITEMS), tool tiers and mining rules into lookup tables.
// Main thread only (workers never need items). Validation errors are collected and thrown
// together, like the block registry.

import { REG, type Registry, MAX_BLOCK_IDS } from './registry';
import { ITEMS, NO_ITEM_BLOCKS, BLOCK_ITEM_EXTRAS, TAG_FUEL } from './items';
import { TIERS } from './tiers';
import { MINING } from './mining';
import { FOOD } from './food';
import { ARMOR_SLOTS } from './armor';
import type { ArmorStats, FoodDef, ItemDef, MiningDef, ToolKind, ToolTierDef } from './types';

export const TOOL_NONE = 0;
export const TOOL_KINDS: ToolKind[] = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'shears'];
export const toolCode = (k: ToolKind): number => TOOL_KINDS.indexOf(k) + 1;

/** A compiled drop: item id, count range, chance. */
export interface Drop {
  item: number;
  min: number;
  max: number;
  chance: number;
}

export class ItemRegistry {
  readonly items: ItemDef[] = [];
  readonly tiers: ToolTierDef[];
  private readonly byName = new Map<string, number>();
  private readonly tierByName = new Map<string, number>();
  /** Item id -> block id (-1 = not a block item). */
  readonly itemBlock: Int16Array;
  /** Block id -> item id (-1 = no item). */
  readonly blockItem = new Int16Array(MAX_BLOCK_IDS).fill(-1);
  readonly maxStack: Uint8Array;
  /** Tool kind code (0 none, then TOOL_KINDS order + 1). */
  readonly toolKind: Uint8Array;
  /** Tier index into `tiers` (-1 none). */
  readonly toolTier: Int8Array;
  readonly durability: Uint16Array;
  readonly fuel: Float32Array;
  readonly tags: Set<string>[];
  /** Armour slot index (0 head .. 3 feet; -1 not armour). */
  readonly armorSlot: Int8Array;
  readonly armor: (ArmorStats | null)[] = [];
  readonly food: (FoodDef | null)[] = [];
  /** Enchanting affinity (0 = cannot be enchanted at a table). */
  readonly enchantability: Uint8Array;
  /** XP dropped when the block is mined, [min, max] (per block id). */
  readonly mineXp: ([number, number] | null)[] = [];
  // Per block id.
  readonly mineTool = new Uint8Array(MAX_BLOCK_IDS);
  /** Minimum harvest level (-1 = none needed). */
  readonly mineTier = new Int8Array(MAX_BLOCK_IDS).fill(-1);
  readonly shearsDrop = new Uint8Array(MAX_BLOCK_IDS);
  /** null = drops its own item. */
  readonly drops: (Drop[] | null)[] = [];
  readonly count: number;

  constructor(blocks: Registry, itemDefs: ItemDef[], tiers: ToolTierDef[], mining: Record<string, MiningDef>) {
    const errors: string[] = [];
    this.tiers = tiers;
    tiers.forEach((t, i) => {
      if (this.tierByName.has(t.name)) errors.push(`duplicate tier "${t.name}"`);
      this.tierByName.set(t.name, i);
    });

    // Block items first (same names as their blocks).
    for (const b of blocks.blocks) {
      if (NO_ITEM_BLOCKS.has(b.name)) continue;
      this.items.push({ name: b.name, displayName: b.displayName, block: b.name, tags: b.tags, group: b.tags?.includes('plant') ? 'natural' : 'building', ...BLOCK_ITEM_EXTRAS[b.name] });
    }
    for (const d of itemDefs) this.items.push(d);
    const n = this.items.length;
    this.count = n;
    this.itemBlock = new Int16Array(n).fill(-1);
    this.maxStack = new Uint8Array(n);
    this.toolKind = new Uint8Array(n);
    this.toolTier = new Int8Array(n).fill(-1);
    this.durability = new Uint16Array(n);
    this.fuel = new Float32Array(n);
    this.tags = [];
    this.armorSlot = new Int8Array(n).fill(-1);
    this.enchantability = new Uint8Array(n);

    this.items.forEach((it, i) => {
      if (this.byName.has(it.name)) errors.push(`duplicate item "${it.name}"`);
      this.byName.set(it.name, i);
      const tags = new Set(it.tags ?? []);
      if (it.block !== undefined) {
        if (!blocks.has(it.block)) errors.push(`item "${it.name}": unknown block "${it.block}"`);
        else {
          const bid = blocks.id(it.block);
          this.itemBlock[i] = bid;
          if (this.blockItem[bid] === -1) this.blockItem[bid] = i;
          for (const t of blocks.blocks[bid]!.tags ?? []) tags.add(t);
        }
      } else if (!it.icon) errors.push(`item "${it.name}": needs an icon or a block`);
      this.tags.push(tags);
      let fuel = it.fuel ?? 0;
      for (const t of tags) fuel = Math.max(fuel, TAG_FUEL[t] ?? 0);
      this.fuel[i] = fuel;
      if (it.tool) {
        this.toolKind[i] = toolCode(it.tool.kind);
        const ti = this.tierByName.get(it.tool.tier);
        if (ti === undefined) errors.push(`item "${it.name}": unknown tier "${it.tool.tier}"`);
        else {
          this.toolTier[i] = ti;
          this.durability[i] = it.durability ?? tiers[ti]!.durability;
        }
      } else if (it.durability) this.durability[i] = it.durability;
      this.maxStack[i] = Math.max(1, Math.min(64, it.maxStack ?? (it.tool || it.durability ? 1 : 64)));
      this.armor.push(it.armor ?? null);
      if (it.armor) {
        this.armorSlot[i] = ARMOR_SLOTS.indexOf(it.armor.slot);
        this.maxStack[i] = 1;
      }
      const food = it.food ?? FOOD[it.name] ?? null;
      this.food.push(food);
      if (food && !it.food) it.food = food;
      this.enchantability[i] = it.enchantability ?? 0;
    });
    for (const [name] of Object.entries(FOOD)) if (!this.byName.has(name)) errors.push(`food: unknown item "${name}"`);
    for (const it of this.items) if (it.food?.remainder && !this.byName.has(it.food.remainder)) errors.push(`item "${it.name}": unknown food remainder "${it.food.remainder}"`);
    for (const it of this.items) if (it.fuelRemainder && !this.byName.has(it.fuelRemainder)) errors.push(`item "${it.name}": unknown fuel remainder "${it.fuelRemainder}"`);

    // Mining rules.
    for (const [name, def] of Object.entries(mining)) {
      if (!blocks.has(name)) {
        errors.push(`mining: unknown block "${name}"`);
        continue;
      }
      const bid = blocks.id(name);
      if (def.tool) this.mineTool[bid] = toolCode(def.tool);
      if (def.tier !== undefined) this.mineTier[bid] = def.tier;
      if (def.shears) this.shearsDrop[bid] = 1;
      if (def.xp) this.mineXp[bid] = def.xp;
      if (def.drops === 'none') this.drops[bid] = [];
      else if (def.drops) {
        const list: Drop[] = [];
        for (const d of def.drops) {
          const id = this.byName.get(d.item);
          if (id === undefined) errors.push(`mining "${name}": unknown drop "${d.item}"`);
          else list.push({ item: id, min: d.count?.[0] ?? 1, max: d.count?.[1] ?? d.count?.[0] ?? 1, chance: d.chance ?? 1 });
        }
        this.drops[bid] = list;
      }
    }
    for (let b = 0; b < blocks.count; b++) {
      if (this.drops[b] === undefined) this.drops[b] = null;
      if (this.mineXp[b] === undefined) this.mineXp[b] = null;
    }

    if (errors.length) throw new Error('Item registry errors:\n  ' + errors.join('\n  '));
  }

  id(name: string): number {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`unknown item "${name}"`);
    return i;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  def(id: number): ItemDef {
    return this.items[id]!;
  }

  name(id: number): string {
    return this.items[id]?.name ?? `#${id}`;
  }

  displayName(id: number): string {
    const it = this.items[id];
    if (!it) return '?';
    return it.displayName ?? titleCase(it.name);
  }

  /** Does item `id` match an ingredient (item name or #tag)? */
  matches(id: number, ingredient: string): boolean {
    if (ingredient.startsWith('#')) return this.tags[id]!.has(ingredient.slice(1));
    return this.items[id]!.name === ingredient;
  }

  /** All items matching an ingredient (for the recipe book and validation). */
  itemsFor(ingredient: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) if (this.matches(i, ingredient)) out.push(i);
    return out;
  }

  tier(id: number): ToolTierDef | null {
    const t = this.toolTier[id]!;
    return t >= 0 ? this.tiers[t]! : null;
  }
}

export function titleCase(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const IREG = new ItemRegistry(REG, ITEMS, TIERS, MINING);
