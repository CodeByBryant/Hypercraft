// Block entities: per-block state for chests and furnaces. Stored as plain JSON in the owning
// column's `extra.be` (keyed by local x,y,z,w), so saves need no extra machinery: the column
// codec already persists `extra`. Furnaces in loaded columns tick with the world.

import { REG, makeVoxel, voxelMeta, FLUID_LAVA } from '../../content/registry';
import { IREG } from '../../content/itemRegistry';
import type { FurnaceKind } from '../../content/types';
import type { Column, World } from '../../world/World';
import { CRAFTING } from './Crafting';
import { BREWING, BREW_FUEL, BREW_INGREDIENTS, BREW_TIME } from '../../content/potions';
import { loadStack, saveStack, type Container, type ItemStack, type SavedStack } from './ItemStack';


/** Hypercinder makes furnaces cook twice as fast. */
const HYPERCINDER = IREG.has('hypercinder') ? IREG.id('hypercinder') : -1;
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
  /** Cooking speed of the current fuel (hypercinder: 2x). */
  boost?: number;
  /** Experience stored by smelting, paid out when the output is taken. */
  xp?: number;
}

/** Mob spawner (dungeons, outposts...): spawns its mob near itself while a player is close. */
export interface SpawnerData {
  type: 'spawner';
  mob: string;
  /** Seconds until the next spawn attempt. */
  delay: number;
}

/** Brewing stand (Phase 7): three bottles, an ingredient, Cinder Powder fuel. */
export interface BrewingData {
  type: 'brewing';
  /** [bottle, bottle, bottle, ingredient, fuel] */
  slots: (SavedStack | null)[];
  /** Brews left from the last fuel item. */
  fuel: number;
  /** Seconds into the current brew. */
  brew: number;
}

/** A grave: the whole inventory (slot for slot) and the experience of someone who died. */
export interface GraveData {
  type: 'grave';
  slots: (SavedStack | null)[];
  xp: number;
}

export type BlockEntityData = ChestData | FurnaceData | SpawnerData | BrewingData | GraveData;

/** Can a brewing stand brew these three bottles with this ingredient? */
export function brewable(slots: (SavedStack | null)[]): boolean {
  const ing = slots[3];
  if (!ing) return false;
  for (let i = 0; i < 3; i++) {
    const b = slots[i];
    if (b && BREWING.has(`${b[0]}|${ing[0]}`)) return true;
  }
  return false;
}

/** Spawner rules (Minecraft-like): player within 16 blocks, up to 6 of the mob within 8. */
const SPAWNER_RANGE = 16;
const SPAWNER_CAP = 6;

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
  /** Loaded spawners by world key. */
  private readonly spawners = new Map<string, [number, number, number, number]>();
  private readonly spawnerId: number;
  private readonly brewingId: number;
  private readonly graveId: number;
  /** A broken grave's experience: set by the game (orbs at the grave). */
  onGraveXp: ((x: number, y: number, z: number, w: number, points: number) => void) | null = null;
  /** Loaded mob spawners (F3, tests). */
  get spawnerCount(): number {
    return this.spawners.size;
  }
  /** Where the player is (spawners only run near them). */
  playerPos: ArrayLike<number> | null = null;
  /** Spawn a mob at a point; returns false if it could not. Set by the game. */
  spawnMob: ((name: string, x: number, y: number, z: number, w: number) => boolean) | null = null;
  /** How many mobs of a kind are within a radius of a point. Set by the game. */
  countNear: ((name: string, x: number, y: number, z: number, w: number, r: number) => number) | null = null;
  /** Positions whose lit state swap is in progress (so the swap keeps the entity). */
  private swapping = false;
  /** Smelting experience paid out (the player took a furnace's output). Set by the game. */
  onXp: ((points: number) => void) | null = null;

  constructor(private readonly world: World) {
    this.chestId = REG.id('chest');
    this.spawnerId = REG.id('mob_spawner');
    this.brewingId = REG.id('brewing_stand');
    this.graveId = REG.id('grave');
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

  isGrave(id: number): boolean {
    return id === this.graveId;
  }

  /** Put a grave at a cell holding `slots` and `xp` (the cell must be free). */
  placeGrave(x: number, y: number, z: number, w: number, slots: (SavedStack | null)[], xp: number): boolean {
    if (!this.world.setBlock(x, y, z, w, this.graveId)) return false;
    const col = this.col(x, z, w);
    if (!col) return false;
    this.map(col)[this.localKey(x, y, z, w)] = { type: 'grave', slots, xp };
    this.touch(col);
    return true;
  }

  /** Take what a grave holds (and forget it); the block stays for the caller to remove. */
  takeGrave(x: number, y: number, z: number, w: number): GraveData | null {
    const col = this.col(x, z, w);
    if (!col) return null;
    const m = this.map(col);
    const k = this.localKey(x, y, z, w);
    const d = m[k];
    if (!d || d.type !== 'grave') return null;
    delete m[k];
    this.touch(col);
    return d;
  }

  /** Does this block id carry an entity? */
  hasEntity(id: number): boolean {
    return id === this.chestId || this.furnaceBlocks.has(id) || id === this.brewingId;
  }

  isBrewing(id: number): boolean {
    return id === this.brewingId;
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
      d =
        id === this.chestId
          ? { type: 'chest', slots: new Array(CHEST_SLOTS).fill(null) }
          : id === this.brewingId
            ? { type: 'brewing', slots: [null, null, null, null, null], fuel: 0, brew: 0 }
            : { type: 'furnace', kind: this.furnaceBlocks.get(id)!.kind, slots: [null, null, null], burn: 0, burnMax: 0, cook: 0, cookMax: 10 };
      m[k] = d;
      this.touch(col);
    }
    if (d?.type === 'furnace' || d?.type === 'brewing') this.active.set(`${x},${y},${z},${w}`, [x, y, z, w]);
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
    if (o === this.spawnerId && n !== o) {
      // A broken spawner stops spawning (and forgets its entity).
      this.spawners.delete(`${x},${y},${z},${w}`);
      const col = this.col(x, z, w);
      if (col) {
        delete this.map(col)[this.localKey(x, y, z, w)];
        this.touch(col);
      }
      return [];
    }
    if (o === this.graveId && n !== o) {
      // A broken grave spills everything it held (and its experience).
      const g = this.takeGrave(x, y, z, w);
      if (!g) return [];
      if (g.xp > 0) this.onGraveXp?.(x + 0.5, y + 0.5, z + 0.5, w + 0.5, g.xp);
      const out: ItemStack[] = [];
      for (const s of g.slots) {
        const st = loadStack(s);
        if (st) out.push(st);
      }
      return out;
    }
    if (n !== o && (this.furnaceBlocks.has(n) || n === this.brewingId)) this.active.set(`${x},${y},${z},${w}`, [x, y, z, w]);
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
    if (d.type === 'spawner') return out;
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
      if (d.type !== 'furnace' && d.type !== 'spawner' && d.type !== 'brewing') continue;
      const [lx, y, lz, lw] = k.split(',').map(Number) as [number, number, number, number];
      const x = col.cx * 16 + lx, z = col.cz * 16 + lz, w = col.cw * 16 + lw;
      (d.type === 'spawner' ? this.spawners : this.active).set(`${x},${y},${z},${w}`, [x, y, z, w]);
    }
  }

  onColumnRemoved(col: Column): void {
    for (const map of [this.active, this.spawners]) for (const [k, p] of map) if (p[0] >> 4 === col.cx && p[2] >> 4 === col.cz && p[3] >> 4 === col.cw) map.delete(k);
  }

  get activeSpawners(): number {
    return this.spawners.size;
  }

  /** Spawners near the player count down and release mobs around themselves. */
  private tickSpawners(dt: number): void {
    const p = this.playerPos;
    if (!p || !this.spawnMob) return;
    for (const [key, s] of this.spawners) {
      const [x, y, z, w] = s;
      if (Math.hypot(x + 0.5 - p[0]!, y - p[1]!, z + 0.5 - p[2]!, w + 0.5 - p[3]!) > SPAWNER_RANGE) continue;
      const col = this.col(x, z, w);
      const d = col ? this.map(col)[this.localKey(x, y, z, w)] : undefined;
      if (!col || !d || d.type !== 'spawner' || (this.world.getBlock(x, y, z, w) & 0xfff) !== this.spawnerId) {
        this.spawners.delete(key);
        continue;
      }
      d.delay -= dt;
      if (d.delay > 0) continue;
      d.delay = 10 + Math.random() * 30;
      if ((this.countNear?.(d.mob, x, y, z, w, 8) ?? 0) >= SPAWNER_CAP) continue;
      const n = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        // A free cell (with room for the body) within 3 blocks in x, z and w; mostly on the
        // spawner's own level (dungeon floors), sometimes one up or down.
        for (let tries = 0; tries < 12; tries++) {
          const sx = x + Math.floor(Math.random() * 7) - 3, sz = z + Math.floor(Math.random() * 7) - 3, sw = w + Math.floor(Math.random() * 7) - 3;
          const sy = y + [0, 0, -1, 1][tries & 3]!;
          const g = this.world.getBlock(sx, sy - 1, sz, sw) & 0xfff;
          const a = this.world.getBlock(sx, sy, sz, sw) & 0xfff, b = this.world.getBlock(sx, sy + 1, sz, sw) & 0xfff;
          if (!REG.solid[g] || REG.solid[a] || REG.solid[b] || REG.fluid[a] === FLUID_LAVA) continue;
          if (this.spawnMob(d.mob, sx + 0.5, sy, sz + 0.5, sw + 0.5)) break;
        }
      }
    }
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
    if (d.type === 'spawner') return null;
    if (d.type === 'chest')
      return {
        size: CHEST_SLOTS,
        get: (i) => loadStack(d.slots[i]),
        set: (i, s) => {
          d.slots[i] = saveStack(s);
          touch();
        },
      };
    if (d.type === 'brewing')
      return {
        size: 5,
        get: (i) => loadStack(d.slots[i]),
        set: (i, s) => {
          d.slots[i] = saveStack(s);
          touch();
        },
        accepts: (i, s) => {
          const n = IREG.name(s.id);
          if (i < 3) return IREG.tags[s.id]!.has('potion') && s.count === 1;
          if (i === 3) return BREW_INGREDIENTS.has(n);
          return BREW_FUEL[n] !== undefined;
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
      taken: (i) => {
        if (i !== 2 || !d.xp) return;
        const pts = Math.floor(d.xp) + (Math.random() < d.xp - Math.floor(d.xp) ? 1 : 0);
        d.xp = 0;
        touch();
        if (pts > 0) this.onXp?.(pts);
      },
    };
  }

  /** Advance every loaded furnace and spawner by `dt` seconds. */
  tick(dt: number): void {
    this.tickSpawners(dt);
    for (const [key, p] of this.active) {
      const [x, y, z, w] = p;
      const col = this.col(x, z, w);
      const v = this.world.getBlock(x, y, z, w);
      const fb = this.furnaceBlocks.get(v & 0xfff);
      if (!col || (!fb && (v & 0xfff) !== this.brewingId)) {
        this.active.delete(key);
        continue;
      }
      const d = this.map(col)[this.localKey(x, y, z, w)];
      if (d?.type === 'brewing') {
        if (this.tickBrewing(d, dt)) this.touch(col);
        continue;
      }
      if (!d || d.type !== 'furnace' || !fb) {
        if (!fb?.lit) this.active.delete(key);
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

  /** One brewing stand step; true if anything changed. */
  private tickBrewing(d: BrewingData, dt: number): boolean {
    if (!brewable(d.slots)) {
      const was = d.brew;
      d.brew = 0;
      return was !== 0;
    }
    if (d.brew <= 0) {
      // Each brew burns one charge of fuel when it starts.
      if (d.fuel <= 0) {
        const f = loadStack(d.slots[4]);
        const per = f ? BREW_FUEL[IREG.name(f.id)] : undefined;
        if (!f || !per) return false;
        f.count--;
        d.slots[4] = f.count > 0 ? saveStack(f) : null;
        d.fuel = per;
      }
      d.fuel--;
    }
    d.brew += dt;
    if (d.brew < BREW_TIME) return true;
    d.brew = 0;
    const ing = loadStack(d.slots[3])!;
    for (let i = 0; i < 3; i++) {
      const b = d.slots[i];
      const out = b ? BREWING.get(`${b[0]}|${IREG.name(ing.id)}`) : undefined;
      if (out) d.slots[i] = [out, 1];
    }
    ing.count--;
    d.slots[3] = ing.count > 0 ? saveStack(ing) : null;
    return true;
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
      d.boost = fuel.id === HYPERCINDER ? 2 : 1;
      const rem = IREG.def(fuel.id).fuelRemainder;
      fuel.count--;
      d.slots[1] = fuel.count > 0 ? saveStack(fuel) : rem ? [rem, 1] : null;
    }
    if (d.burn > 0 && canOut && recipe && input) {
      d.cookMax = recipe.time * (fast ? 0.5 : 1);
      d.cook += dt * (d.boost ?? 1);
      if (d.cook >= d.cookMax) {
        d.cook = 0;
        input.count--;
        d.slots[0] = saveStack(input);
        if (out) out.count += recipe.count;
        else out = { id: recipe.result, count: recipe.count, damage: 0 };
        d.slots[2] = saveStack(out);
        d.xp = Math.min(500, (d.xp ?? 0) + recipe.xp);
      }
    } else if (d.cook > 0) d.cook = Math.max(0, d.cook - 2 * dt);
    if (d.burn < 0) d.burn = 0;
  }
}
