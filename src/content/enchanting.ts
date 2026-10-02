// Enchanting rules (Phase 7), Minecraft's: what goes on what, the enchanting table's three
// offers (bookshelves and item enchantability), random enchantments for loot, the anvil
// (combine, repair, rename, prior-work penalty) and the grindstone. Pure functions of the item
// registry and a random source, so generation workers can enchant chest loot too.

import { IREG, TOOL_KINDS } from './itemRegistry';
import { ENCHANTMENTS, ENCHANT_BY_NAME, anvilMultiplier, type EnchantDef } from './enchantments';
import type { ItemStack, ItemTag } from '../game/items/ItemStack';

const kind = (id: number): string | null => {
  const k = IREG.toolKind[id]!;
  return k > 0 ? TOOL_KINDS[k - 1]! : null;
};

const isBook = (id: number) => {
  const n = IREG.name(id);
  return n === 'book' || n === 'enchanted_book';
};

/** Does enchantment `e` belong on item `id`? Books take anything. */
export function canApply(e: EnchantDef, id: number): boolean {
  if (isBook(id)) return true;
  const name = IREG.name(id);
  if (name === '4d_glasses') return false; // the glasses are their own 4D vision
  const slot = IREG.armorSlot[id]!;
  const k = kind(id);
  const tags = IREG.tags[id]!;
  const durable = IREG.durability[id]! > 0;
  switch (e.target) {
    case 'armor':
      return slot >= 0 && durable;
    case 'head':
      return slot === 0;
    case 'chest':
      return slot === 1;
    case 'legs':
      return slot === 2;
    case 'feet':
      return slot === 3;
    case 'sword':
      return k === 'sword' || tags.has('weapon');
    case 'weapon':
      return k === 'sword' || k === 'axe' || tags.has('weapon');
    case 'tool':
      return k === 'pickaxe' || k === 'axe' || k === 'shovel' || k === 'hoe' || (k === 'shears' && (e.name === 'efficiency' || e.name === 'unbreaking'));
    case 'pickaxe':
      return k === 'pickaxe';
    case 'bow':
      return IREG.def(id).use === 'bow';
    case 'durable':
      return durable;
    case 'reach':
      return k !== null && k !== 'shears';
  }
}

/** Can `n` sit next to `m` on one item? */
export function compatible(n: string, m: string): boolean {
  if (n === m) return true;
  const a = ENCHANT_BY_NAME.get(n), b = ENCHANT_BY_NAME.get(m);
  if (!a || !b) return true;
  return !(a.conflicts?.includes(m) || b.conflicts?.includes(n));
}

/** Minimum table power for level k. */
export function minPower(e: EnchantDef, k: number): number {
  return e.base + e.step * (k - 1);
}

/** The enchanting table's three level requirements for `bookshelves` nearby shelves. */
export function offerLevels(bookshelves: number, rand: () => number): [number, number, number] {
  const b = Math.min(15, Math.max(0, bookshelves));
  const base = 1 + Math.floor(rand() * 8) + Math.floor(b / 2) + Math.floor(rand() * (b + 1));
  return [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3) + 1, Math.max(base, b * 2)];
}

/** Table enchantability: books are easy to enchant but weak. */
export function enchantabilityOf(id: number): number {
  return isBook(id) ? 1 : IREG.enchantability[id]!;
}

/**
 * Roll the enchantments a table (or loot "enchant with levels") puts on item `id` at
 * `level`. Returns [] when nothing applies.
 */
export function rollEnchantments(id: number, level: number, rand: () => number, treasure = false): [string, number][] {
  const ench = enchantabilityOf(id);
  if (ench <= 0) return [];
  const q = Math.floor(ench / 4) + 1;
  let L = level + 1 + Math.floor(rand() * q) + Math.floor(rand() * q);
  L = Math.max(1, Math.round(L * (1 + (rand() + rand() - 1) * 0.15)));
  const out: [string, number][] = [];
  const pick = (): boolean => {
    let total = 0;
    const cands: [EnchantDef, number][] = [];
    for (const e of ENCHANTMENTS) {
      if ((e.treasure && !treasure) || e.curse || !canApply(e, id)) continue;
      if (out.some(([n]) => !compatible(n, e.name) || n === e.name)) continue;
      let lv = 0;
      for (let k = e.maxLevel; k >= 1; k--) {
        const lo = minPower(e, k);
        if (L >= lo && L <= lo + e.span) {
          lv = k;
          break;
        }
      }
      if (lv === 0) continue;
      cands.push([e, lv]);
      total += e.weight;
    }
    if (total <= 0) return false;
    let r = rand() * total;
    for (const [e, lv] of cands) {
      r -= e.weight;
      if (r < 0) {
        out.push([e.name, lv]);
        return true;
      }
    }
    const [e, lv] = cands[cands.length - 1]!;
    out.push([e.name, lv]);
    return true;
  };
  if (!pick()) return out;
  while (rand() < (L + 1) / 50) {
    L = Math.floor(L / 2);
    if (!pick()) break;
  }
  return out;
}

/** One random applicable enchantment at a random level (loot books; treasure included). */
export function randomEnchantment(id: number, rand: () => number): [string, number] | null {
  const list = ENCHANTMENTS.filter((e) => !e.curse && canApply(e, id));
  if (!list.length) return null;
  const e = list[Math.floor(rand() * list.length)]!;
  return [e.name, 1 + Math.floor(rand() * e.maxLevel)];
}

/** Total Minecraft enchanting "power" of a level offer, for the table's hint. */
export function describeEnchant([n, l]: [string, number]): string {
  const e = ENCHANT_BY_NAME.get(n);
  const roman = ['', 'I', 'II', 'III', 'IV', 'V'][l] ?? String(l);
  return `${e?.displayName ?? n}${e && e.maxLevel > 1 ? ' ' + roman : ''}`;
}

// ------------------------------------------------------------------ anvil

export interface AnvilResult {
  out: ItemStack;
  /** Experience levels. */
  cost: number;
  /** Items used from the right slot. */
  used: number;
}

/** Repair material of an item (armour or tool tier), or null. */
export function repairMaterial(id: number): string | null {
  const a = IREG.armor[id];
  if (a?.repair) return a.repair;
  return IREG.tier(id)?.material ?? null;
}

const copyTag = (t: ItemTag | undefined): ItemTag => (t ? (JSON.parse(JSON.stringify(t)) as ItemTag) : {});
const work = (rc: number | undefined) => (1 << Math.min(10, rc ?? 0)) - 1;

/**
 * What an anvil makes of `left` (+ `right`), renamed to `name` (null = keep): repairing with
 * the material, combining two of the same item or applying a book, renaming. Null when nothing
 * would change.
 */
export function anvil(left: ItemStack | null, right: ItemStack | null, name: string | null): AnvilResult | null {
  if (!left) return null;
  const max = IREG.durability[left.id]!;
  const tag = copyTag(left.tag);
  let damage = left.damage;
  let cost = 0;
  let used = 0;
  let changed = false;
  if (right) {
    if (left.count !== 1) return null;
    const mat = repairMaterial(left.id);
    const book = IREG.name(right.id) === 'enchanted_book';
    if (mat && max > 0 && IREG.matches(right.id, mat) && !book) {
      // Each material restores a quarter of the durability.
      const quarter = Math.max(1, Math.floor(max / 4));
      const need = Math.ceil(damage / quarter);
      used = Math.min(right.count, need);
      if (used <= 0) return null;
      damage = Math.max(0, damage - used * quarter);
      cost += used;
      changed = true;
    } else if (right.id === left.id || book) {
      if (!book && right.count !== 1) return null;
      if (!book && max > 0 && (damage > 0 || right.damage > 0)) {
        const remaining = max - damage + (max - right.damage) + Math.floor(max * 0.12);
        const nd = Math.max(0, max - remaining);
        if (nd < damage) {
          damage = nd;
          cost += 2;
          changed = true;
        }
      }
      const ench = tag.ench ? tag.ench.map((e) => [...e] as [string, number]) : [];
      for (const [n, lv] of right.tag?.ench ?? []) {
        const e = ENCHANT_BY_NAME.get(n);
        if (!e) continue;
        if (!canApply(e, left.id)) continue;
        if (ench.some(([m]) => m !== n && !compatible(m, n))) {
          cost += 1;
          continue;
        }
        const cur = ench.find(([m]) => m === n);
        const nl = cur ? (cur[1] === lv ? Math.min(e.maxLevel, lv + 1) : Math.max(cur[1], lv)) : lv;
        if (cur) {
          if (cur[1] !== nl) changed = true;
          cur[1] = nl;
        } else {
          ench.push([n, nl]);
          changed = true;
        }
        const m = anvilMultiplier(e);
        cost += nl * (book ? Math.max(1, m / 2) : m);
      }
      if (ench.length) tag.ench = ench;
      used = 1;
    } else return null;
  }
  if (name !== null) {
    const trimmed = name.trim().slice(0, 40);
    const cur = left.tag?.name ?? '';
    if (trimmed !== cur) {
      if (trimmed) tag.name = trimmed;
      else delete tag.name;
      cost += 1;
      changed = true;
    }
  }
  if (!changed) return null;
  cost += work(left.tag?.rc) + (right ? work(right.tag?.rc) : 0);
  if (right) tag.rc = Math.max(left.tag?.rc ?? 0, right.tag?.rc ?? 0) + 1;
  const out: ItemStack = { id: left.id, count: left.count, damage };
  if (Object.keys(tag).length) out.tag = tag;
  return { out, cost, used };
}

// ------------------------------------------------------------------ grindstone

/**
 * The grindstone: strips enchantments (curses stay) and returns some experience; two of the
 * same item combine durability (+5%). Enchanted books become plain books.
 */
export function grindstone(a: ItemStack | null, b: ItemStack | null): { out: ItemStack; xp: number } | null {
  const items = [a, b].filter((s): s is ItemStack => !!s);
  if (!items.length) return null;
  if (items.length === 2 && (items[0]!.id !== items[1]!.id || IREG.durability[items[0]!.id] === 0 || items[0]!.count !== 1 || items[1]!.count !== 1)) return null;
  const first = items[0]!;
  const max = IREG.durability[first.id]!;
  let damage = first.damage;
  if (items.length === 2) damage = Math.max(0, max - (max - items[0]!.damage + (max - items[1]!.damage) + Math.floor(max * 0.05)));
  let xpSum = 0;
  const keep: [string, number][] = [];
  for (const s of items)
    for (const [n, lv] of s.tag?.ench ?? []) {
      const e = ENCHANT_BY_NAME.get(n);
      if (e?.curse) {
        if (!keep.some(([m]) => m === n)) keep.push([n, lv]);
      } else if (e) xpSum += minPower(e, lv);
    }
  if (items.length === 1 && xpSum === 0) return null;
  let id = first.id;
  if (IREG.name(id) === 'enchanted_book') {
    if (keep.length) return null;
    id = IREG.id('book');
  }
  const tag = copyTag(first.tag);
  delete tag.rc;
  if (keep.length) tag.ench = keep;
  else delete tag.ench;
  const out: ItemStack = { id, count: items.length === 2 ? 1 : first.count, damage };
  if (Object.keys(tag).length) out.tag = tag;
  return { out, xp: Math.ceil(xpSum / 2) + Math.floor(Math.random() * (Math.floor(xpSum / 2) + 1)) };
}
