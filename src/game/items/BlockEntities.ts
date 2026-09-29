// Block entities: per-block state for chests and furnaces. Stored as plain JSON in the owning
// column's `extra.be` (keyed by local x,y,z,w), so saves need no extra machinery: the column
// codec already persists `extra`. Furnaces in loaded columns tick with the world.

import { REG, makeVoxel, voxelMeta } from '../../content/registry';
import { IREG } from '../../content/itemRegistry';
import type { FurnaceKind } from '../../content/types';
import type { Column, World } from '../../world/World';
import { CRAFTING } from './Crafting';
import { loadStack, saveStack, type Container, type ItemStack, type SavedStack } from './ItemStack';

export interface ChestData {
  type: 'chest';
  slots: (SavedStack | null)[];
}

export interface FurnaceData {
  type: 'furnace';
  kind: FurnaceKind;
  /** [input, fuel, output] */
  slots: (SavedStack | null)[];
  /** Seconds of fuel left / total for the current fuel item. */
  burn: number;
  burnMax: number;
  /** Seconds cooked of the current item / needed. */
  cook: number;
  cookMax: number;
}

export type BlockEntityData = ChestData | FurnaceData;

export const CHEST_SLOTS = 27;

interface FurnaceBlock {
  kind: FurnaceKind;
  lit: boolean;
  /** The other state's block id (unlit <-> lit). */
  swap: number;
}

export class BlockEntities {
  private readonly furnaceBlocks = new Map<number, FurnaceBlock>();
  private readonly chestId: number;
  /** Loaded furnaces by world key. */
  private readonly active = new Map<string, [number, number, number, number]>();
  /** Positions whose lit state swap is in progress (so the swap keeps the entity). */
  private swapping = false;

  constructor(private readonly world: World) {
    this.chestId = REG.id('chest');
    for (const [kind, unlit, lit] of [
      ['furnace', 'furnace', 'lit_furnace'],
      ['blast_furnace', 'blast_furnace', 'lit_blast_furnace'],
      ['smoker', 'smoker', 'lit_smoker'],
    ] as [FurnaceKind, string, string][]) {
      const u = REG.id(unlit), l = REG.id(lit);
      this.furnaceBlocks.set(u, { kind, lit: false, swap: l });
      this.furnaceBlocks.set(l, { kind, lit: true, swap: u });
    }
  }

  /** Does this block id carry an entity? */
  hasEntity(id: number): boolean {
    return id === this.chestId || this.furnaceBlocks.has(id);
  }

  furnaceKind(id: number): FurnaceKind | null {
    return this.furnaceBlocks.get(id)?.kind ?? null;
  }

  private col(x: number, z: number, w: number): Column | null {
    return this.world.column(x >> 4, z >> 4, w >> 4);
  }

  private map(col: Column): Record<string, BlockEntityData> {
    return ((col.extra.be as Record<string, BlockEntityData> | undefined) ??= {}) as Record<string, BlockEntityData>;
  }

  private localKey(x: number, y: number, z: number, w: number): string {
    return `${x & 15},${y},${z & 15},${w & 15}`;
  }

  /** Entity data at a position (created on demand for chest/furnace blocks). */
  get(x: number, y: number, z: number, w: number): BlockEntityData | null {
    const col = this.col(x, z, w);
    if (!col) return null;
    const id = this.world.getBlock(x, y, z, w) & 0xfff;
    const m = this.map(col);
    const k = this.localKey(x, y, z, w);
    let d = m[k];
    if (!d && this.hasEntity(id)) {
      d = id === this.chestId ? { type: 'chest', slots: new Array(CHEST_SLOTS).fill(null) } : { type: 'furnace', kind: this.furnaceBlocks.get(id)!.kind, slots: [null, null, null], burn: 0, burnMax: 0, cook: 0, cookMax: 10 };
      m[k] = d;
      this.touch(col);
    }
    if (d?.type === 'furnace') this.active.set(`${x},${y},${z},${w}`, [x, y, z, w]);
    return d ?? null;
  }

  private touch(col: Column): void {
    col.edited = true;
    col.dirty = true;
  }

  /**
   * Block changed: when an entity block is removed (not a lit/unlit swap), delete its entity
   * and return the contents so the caller can drop them.
   */
  onBlockChanged(x: number, y: number, z: number, w: number, oldV: number, newV: number): ItemStack[] {
    if (this.swapping) return [];
    const o = oldV & 0xfff, n = newV & 0xfff;
    if (n !== o && this.furnaceBlocks.has(n)) this.active.set(`${x},${y},${z},${w}`, [x, y, z, w]);
    if (!this.hasEntity(o) || this.hasEntity(n)) return [];
    const col = this.col(x, z, w);
    if (!col) return [];
    const m = this.map(col);
    const k = this.localKey(x, y, z, w);
    const d = m[k];
    this.active.delete(`${x},${y},${z},${w}`);
    if (!d) return [];
    delete m[k];
    this.touch(col);
    const out: ItemStack[] = [];
    for (const s of d.slots) {
      const st = loadStack(s);
      if (st) out.push(st);
    }
    return out;
  }

  onColumnAdded(col: Column): void {
    const m = col.extra.be as Record<string, BlockEntityData> | undefined;
    if (!m) return;
    for (const [k, d] of Object.entries(m)) {
      if (d.type !== 'furnace') continue;
      const [lx, y, lz, lw] = k.split(',').map(Number) as [number, number, number, number];
      const x = col.cx * 16 + lx, z = col.cz * 16 + lz, w = col.cw * 16 + lw;
      this.active.set(`${x},${y},${z},${w}`, [x, y, z, w]);
    }
  }

  onColumnRemoved(col: Column): void {
    for (const [k, p] of this.active) if (p[0] >> 4 === col.cx && p[2] >> 4 === col.cz && p[3] >> 4 === col.cw) this.active.delete(k);
  }

  get activeFurnaces(): number {
    return this.active.size;
  }

  /** A slot view of an entity for the UI. */
  container(x: number, y: number, z: number, w: number): Container | null {
    const d = this.get(x, y, z, w);
    if (!d) return null;
    const col = this.col(x, z, w)!;
    const touch = () => this.touch(col);
    if (d.type === 'chest')
      return {
        size: CHEST_SLOTS,
        get: (i) => loadStack(d.slots[i]),
        set: (i, s) => {
          d.slots[i] = saveStack(s);
          touch();
        },
      };
    return {
      size: 3,
      get: (i) => loadStack(d.slots[i]),
      set: (i, s) => {
        d.slots[i] = saveStack(s);
        touch();
      },
      accepts: (i, s) => (i === 0 ? true : i === 1 ? CRAFTING.fuel(s.id) > 0 || IREG.name(s.id) === 'bucket' : false),
    };
  }

  /** Advance every loaded furnace by `dt` seconds. */
  tick(dt: number): void {
    for (const [key, p] of this.active) {
      const [x, y, z, w] = p;
      const col = this.col(x, z, w);
      const v = this.world.getBlock(x, y, z, w);
      const fb = this.furnaceBlocks.get(v & 0xfff);
      if (!col || !fb) {
        this.active.delete(key);
        continue;
      }
      const d = this.map(col)[this.localKey(x, y, z, w)];
      if (!d || d.type !== 'furnace') {
        if (!fb.lit) this.active.delete(key);
        continue;
      }
      // Idle furnaces cost one check.
      if (d.burn <= 0 && d.cook <= 0 && (!d.slots[0] || !d.slots[1])) {
        if (fb.lit) this.swap(x, y, z, w, v, fb);
        continue;
      }
      this.tickFurnace(d, dt);
      this.touch(col);
      if (d.burn > 0 !== fb.lit) this.swap(x, y, z, w, v, fb);
    }
  }

  private swap(x: number, y: number, z: number, w: number, v: number, fb: FurnaceBlock): void {
    this.swapping = true;
    this.world.setBlock(x, y, z, w, makeVoxel(fb.swap, voxelMeta(v)));
    this.swapping = false;
  }

  private tickFurnace(d: FurnaceData, dt: number): void {
    const fast = d.kind !== 'furnace';
    const input = loadStack(d.slots[0]);
    const fuel = loadStack(d.slots[1]);
    let out = loadStack(d.slots[2]);
    const recipe = input ? CRAFTING.smelt(input.id, d.kind) : null;
    const canOut = recipe !== null && (!out || (out.id === recipe.result && out.count + recipe.count <= IREG.maxStack[out.id]!));
    if (d.burn > 0) d.burn -= dt;
    if (d.burn <= 0 && canOut && fuel && CRAFTING.fuel(fuel.id) > 0) {
      d.burnMax = d.burn = CRAFTING.fuel(fuel.id) * (fast ? 0.5 : 1);
      const rem = IREG.def(fuel.id).fuelRemainder;
      fuel.count--;
      d.slots[1] = fuel.count > 0 ? saveStack(fuel) : rem ? [rem, 1] : null;
    }
    if (d.burn > 0 && canOut && recipe && input) {
      d.cookMax = recipe.time * (fast ? 0.5 : 1);
      d.cook += dt;
      if (d.cook >= d.cookMax) {
        d.cook = 0;
        input.count--;
        d.slots[0] = saveStack(input);
        if (out) out.count += recipe.count;
        else out = { id: recipe.result, count: recipe.count, damage: 0 };
        d.slots[2] = saveStack(out);
      }
    } else if (d.cook > 0) d.cook = Math.max(0, d.cook - 2 * dt);
    if (d.burn < 0) d.burn = 0;
  }
}
