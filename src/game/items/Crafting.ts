// Recipe matching: shaped (any position in the grid, optionally mirrored), shapeless (multiset
// with tags), smelting and fuel. Built once from the recipe data and validated.

import { IREG, type ItemRegistry } from '../../content/itemRegistry';
import { RECIPES } from '../../content/recipes';
import type { FurnaceKind, RecipeDef } from '../../content/types';
import type { ItemStack } from './ItemStack';

export interface CompiledRecipe {
  index: number;
  def: RecipeDef;
  kind: 'shaped' | 'shapeless';
  /** Shaped: width/height and row-major ingredient per cell (null = empty). */
  w: number;
  h: number;
  cells: (string | null)[];
  /** Shapeless ingredients. */
  ingredients: string[];
  result: number;
  count: number;
  /** Fits the 2x2 inventory grid. */
  small: boolean;
}

export interface SmeltRecipe {
  input: string;
  result: number;
  count: number;
  time: number;
  furnaces: FurnaceKind[];
  /** Experience per item smelted. */
  xp: number;
}

export class Crafting {
  readonly recipes: CompiledRecipe[] = [];
  readonly smelting: SmeltRecipe[] = [];
  private readonly ir: ItemRegistry;

  constructor(ir: ItemRegistry, defs: RecipeDef[]) {
    this.ir = ir;
    const errors: string[] = [];
    const checkIng = (where: string, ing: string) => {
      if (ir.itemsFor(ing).length === 0) errors.push(`${where}: ingredient "${ing}" matches no item`);
    };
    defs.forEach((d, index) => {
      const where = `recipe #${index} (${d.result})`;
      if (!ir.has(d.result)) {
        errors.push(`${where}: unknown result`);
        return;
      }
      const result = ir.id(d.result);
      const count = d.count ?? 1;
      if (d.type === 'smelting') {
        checkIng(where, d.input);
        // Ores give the most experience (Minecraft: 0.7 for iron, 1 for gold).
        const ore = /ore|raw_/.test(d.input);
        this.smelting.push({ input: d.input, result, count, time: d.time ?? 10, furnaces: d.furnaces ?? ['furnace'], xp: d.xp ?? (ore ? 0.7 : 0.1) });
      } else if (d.type === 'shaped') {
        const h = d.pattern.length;
        const w = Math.max(...d.pattern.map((r) => r.length));
        if (h < 1 || h > 3 || w < 1 || w > 3) errors.push(`${where}: pattern must be 1..3 x 1..3`);
        const cells: (string | null)[] = [];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const ch = d.pattern[y]![x] ?? ' ';
            if (ch === ' ') cells.push(null);
            else {
              const ing = d.key[ch];
              if (!ing) errors.push(`${where}: key "${ch}" undefined`);
              else checkIng(where, ing);
              cells.push(ing ?? null);
            }
          }
        this.recipes.push({ index, def: d, kind: 'shaped', w, h, cells, ingredients: [], result, count, small: w <= 2 && h <= 2 });
      } else {
        if (d.ingredients.length < 1 || d.ingredients.length > 9) errors.push(`${where}: 1..9 ingredients`);
        for (const ing of d.ingredients) checkIng(where, ing);
        this.recipes.push({ index, def: d, kind: 'shapeless', w: 0, h: 0, cells: [], ingredients: d.ingredients, result, count, small: d.ingredients.length <= 4 });
      }
    });
    if (errors.length) throw new Error('Recipe errors:\n  ' + errors.join('\n  '));
  }

  /** Match a size x size grid (row-major). Returns the recipe or null. */
  match(grid: (ItemStack | null)[], size: number): CompiledRecipe | null {
    // Bounding box of non-empty cells.
    let x0 = size, y0 = size, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (grid[y * size + x]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          n++;
        }
    if (n === 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    for (const r of this.recipes) {
      if (r.kind === 'shaped') {
        if (r.w !== bw || r.h !== bh) continue;
        if (this.shapedAt(r, grid, size, x0, y0, false) || this.shapedAt(r, grid, size, x0, y0, true)) return r;
      } else if (r.ingredients.length === n) {
        const items: number[] = [];
        for (const s of grid) if (s) items.push(s.id);
        if (this.shapeless(r.ingredients, items)) return r;
      }
    }
    return null;
  }

  private shapedAt(r: CompiledRecipe, grid: (ItemStack | null)[], size: number, x0: number, y0: number, mirror: boolean): boolean {
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const ing = r.cells[y * r.w + (mirror ? r.w - 1 - x : x)] ?? null;
        const s = grid[(y0 + y) * size + x0 + x] ?? null;
        if (ing === null) {
          if (s) return false;
        } else if (!s || !this.ir.matches(s.id, ing)) return false;
      }
    return true;
  }

  /** Multiset match with tags (backtracking; at most 9 items). */
  private shapeless(ings: string[], items: number[]): boolean {
    const used = new Array(items.length).fill(false);
    const go = (k: number): boolean => {
      if (k === ings.length) return true;
      for (let i = 0; i < items.length; i++) {
        if (used[i] || !this.ir.matches(items[i]!, ings[k]!)) continue;
        used[i] = true;
        if (go(k + 1)) return true;
        used[i] = false;
      }
      return false;
    };
    return go(0);
  }

  /** Smelting recipe for an item in a given furnace kind. */
  smelt(item: number, kind: FurnaceKind): SmeltRecipe | null {
    for (const s of this.smelting) if (s.furnaces.includes(kind) && this.ir.matches(item, s.input)) return s;
    return null;
  }

  /** Seconds of burn time (0 = not a fuel). */
  fuel(item: number): number {
    return this.ir.fuel[item]!;
  }

  /** Recipes producing `item`. */
  recipesFor(item: number): CompiledRecipe[] {
    return this.recipes.filter((r) => r.result === item);
  }
}

export const CRAFTING = new Crafting(IREG, RECIPES);
