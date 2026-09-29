// Item stacks and containers. Stacks are small plain objects (UI-rate code, not per-frame);
// saves use item names so they survive registry changes.

import { IREG } from '../../content/itemRegistry';

export interface ItemStack {
  id: number;
  count: number;
  /** Durability used (tools); 0 for everything else. */
  damage: number;
}

/** [item name, count, damage?] */
export type SavedStack = [string, number, number?];

export function stack(id: number, count = 1, damage = 0): ItemStack {
  return { id, count, damage };
}

export function stackOf(name: string, count = 1): ItemStack {
  return { id: IREG.id(name), count, damage: 0 };
}

export function copyStack(s: ItemStack | null): ItemStack | null {
  return s ? { id: s.id, count: s.count, damage: s.damage } : null;
}

export function maxStackOf(s: ItemStack): number {
  return IREG.maxStack[s.id]!;
}

/** Can `b` be merged into `a` (same item, stackable, same damage)? */
export function canMerge(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && a.damage === b.damage && IREG.maxStack[a.id]! > 1;
}

export function saveStack(s: ItemStack | null): SavedStack | null {
  if (!s || s.count <= 0) return null;
  return s.damage ? [IREG.name(s.id), s.count, s.damage] : [IREG.name(s.id), s.count];
}

/** Unknown names (content removed since the save) load as empty. */
export function loadStack(v: unknown): ItemStack | null {
  if (!Array.isArray(v) || typeof v[0] !== 'string' || !IREG.has(v[0])) return null;
  const count = Math.max(0, Math.min(64, Number(v[1]) | 0));
  if (count <= 0) return null;
  return { id: IREG.id(v[0]), count, damage: Math.max(0, Number(v[2] ?? 0) | 0) };
}

/** Anything with numbered slots: the player inventory, a chest, a furnace, a crafting grid. */
export interface Container {
  readonly size: number;
  get(i: number): ItemStack | null;
  set(i: number, s: ItemStack | null): void;
  /** Whether slot `i` accepts `s` (output slots, armour slots...). */
  accepts?(i: number, s: ItemStack): boolean;
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
    c.set(i, { id: s.id, count: n, damage: s.damage });
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
