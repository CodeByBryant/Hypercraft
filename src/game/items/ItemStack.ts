// Item stacks and containers. Stacks are small plain objects (UI-rate code, not per-frame);
// saves use item names so they survive registry changes.

import { IREG } from '../../content/itemRegistry';

/**
 * Per-stack data (Minecraft's item NBT): enchantments, an anvil name, an armour trim, the
 * anvil's prior-work count, a W-Anchor's mark. Plain JSON, saved with the stack.
 */
export interface ItemTag {
  /** Enchantments as [name, level] pairs (enchanted books store theirs here too). */
  ench?: [string, number][];
  /** Custom name given at an anvil. */
  name?: string;
  /** Armour trim: [pattern, material item]. */
  trim?: [string, string];
  /** Anvil prior-work count (each use doubles the next cost). */
  rc?: number;
  /** W-Anchor: the marked spot [realm, x, y, z, w]. */
  mark?: [string, number, number, number, number];
  /** Crossbow: the arrow it is loaded with. */
  ammo?: string;
}

export interface ItemStack {
  id: number;
  count: number;
  /** Durability used (tools); 0 for everything else. */
  damage: number;
  tag?: ItemTag;
}

/** [item name, count, damage?, tag?] */
export type SavedStack = [string, number, number?, ItemTag?];

export function stack(id: number, count = 1, damage = 0): ItemStack {
  return { id, count, damage };
}

export function stackOf(name: string, count = 1): ItemStack {
  return { id: IREG.id(name), count, damage: 0 };
}

/** A deep copy of a tag (undefined stays undefined; empty tags are dropped). */
export function copyTag(t: ItemTag | undefined): ItemTag | undefined {
  if (!t) return undefined;
  const out = JSON.parse(JSON.stringify(t)) as ItemTag;
  return Object.keys(out).length ? out : undefined;
}

/** `n` items of `s` (same item, damage and tag). */
export function withCount(s: ItemStack, n: number): ItemStack {
  const out: ItemStack = { id: s.id, count: n, damage: s.damage };
  const t = copyTag(s.tag);
  if (t) out.tag = t;
  return out;
}

export function copyStack(s: ItemStack | null): ItemStack | null {
  return s ? withCount(s, s.count) : null;
}

export function maxStackOf(s: ItemStack): number {
  return IREG.maxStack[s.id]!;
}

export function sameTag(a: ItemTag | undefined, b: ItemTag | undefined): boolean {
  if (!a || !b) return !a === !b || JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Can `b` be merged into `a` (same item, stackable, same damage and data)? */
export function canMerge(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && a.damage === b.damage && IREG.maxStack[a.id]! > 1 && sameTag(a.tag, b.tag);
}

export function saveStack(s: ItemStack | null): SavedStack | null {
  if (!s || s.count <= 0) return null;
  const t = copyTag(s.tag);
  if (t) return [IREG.name(s.id), s.count, s.damage, t];
  return s.damage ? [IREG.name(s.id), s.count, s.damage] : [IREG.name(s.id), s.count];
}

/** Unknown names (content removed since the save) load as empty. */
export function loadStack(v: unknown): ItemStack | null {
  if (!Array.isArray(v) || typeof v[0] !== 'string' || !IREG.has(v[0])) return null;
  const count = Math.max(0, Math.min(64, Number(v[1]) | 0));
  if (count <= 0) return null;
  const out: ItemStack = { id: IREG.id(v[0]), count, damage: Math.max(0, Number(v[2] ?? 0) | 0) };
  if (v[3] && typeof v[3] === 'object' && !Array.isArray(v[3])) {
    const t = copyTag(v[3] as ItemTag);
    if (t) out.tag = t;
  }
  return out;
}

/** Enchantment level of `name` on a stack (0 = none). */
export function enchLevel(s: ItemStack | null | undefined, name: string): number {
  const e = s?.tag?.ench;
  if (!e) return 0;
  for (const [n, l] of e) if (n === name) return l;
  return 0;
}

/** Does the stack carry any enchantment (books included)? */
export function isEnchanted(s: ItemStack | null | undefined): boolean {
  return !!s?.tag?.ench?.length;
}

/** Anything with numbered slots: the player inventory, a chest, a furnace, a crafting grid. */
export interface Container {
  readonly size: number;
  get(i: number): ItemStack | null;
  set(i: number, s: ItemStack | null): void;
  /** Whether slot `i` accepts `s` (output slots, armour slots...). */
  accepts?(i: number, s: ItemStack): boolean;
  /** Items were taken out of output slot `i` (furnace experience). */
  taken?(i: number): void;
}

/** A plain array-backed container. `version` increments on every change (UI refresh). */
export class SlotContainer implements Container {
  readonly slots: (ItemStack | null)[];
  version = 0;
  onChange: (() => void) | null = null;

  constructor(readonly size: number) {
    this.slots = new Array(size).fill(null);
  }

  get(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }

  set(i: number, s: ItemStack | null): void {
    this.slots[i] = s && s.count > 0 ? s : null;
    this.version++;
    this.onChange?.();
  }

  clear(): void {
    this.slots.fill(null);
    this.version++;
    this.onChange?.();
  }

  save(): (SavedStack | null)[] {
    return this.slots.map(saveStack);
  }

  load(data: unknown): void {
    this.slots.fill(null);
    if (Array.isArray(data)) for (let i = 0; i < Math.min(this.size, data.length); i++) this.slots[i] = loadStack(data[i]);
    this.version++;
  }
}

/**
 * Insert `s` into slots [from, to) of `c`: first merge into matching stacks, then fill empty
 * slots. Mutates `s.count`; returns what is left (0 = all inserted).
 */
export function insertInto(c: Container, s: ItemStack, from = 0, to = c.size): number {
  const max = IREG.maxStack[s.id]!;
  if (max > 1) {
    for (let i = from; i < to && s.count > 0; i++) {
      const cur = c.get(i);
      if (!cur || !canMerge(cur, s) || cur.count >= max) continue;
      if (c.accepts && !c.accepts(i, s)) continue;
      const n = Math.min(max - cur.count, s.count);
      cur.count += n;
      s.count -= n;
      c.set(i, cur);
    }
  }
  for (let i = from; i < to && s.count > 0; i++) {
    if (c.get(i)) continue;
    if (c.accepts && !c.accepts(i, s)) continue;
    const n = Math.min(max, s.count);
    c.set(i, withCount(s, n));
    s.count -= n;
  }
  return s.count;
}

/** Count items with id `id` in slots [from, to). */
export function countIn(c: Container, id: number, from = 0, to = c.size): number {
  let n = 0;
  for (let i = from; i < to; i++) {
    const s = c.get(i);
    if (s && s.id === id) n += s.count;
  }
  return n;
}

/** Remove up to `count` items matching `pred`; returns how many were removed. */
export function removeFrom(c: Container, pred: (s: ItemStack) => boolean, count: number, from = 0, to = c.size): number {
  let left = count;
  for (let i = from; i < to && left > 0; i++) {
    const s = c.get(i);
    if (!s || !pred(s)) continue;
    const n = Math.min(left, s.count);
    s.count -= n;
    left -= n;
    c.set(i, s.count > 0 ? s : null);
  }
  return count - left;
}
