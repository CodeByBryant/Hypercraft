// Farming simulation (Phase 7). Crops, young berry bushes, saplings and farmland are tracked
// per column (saved in the column's `extra.grow` as dense cell indices, so nothing has to be
// scanned when a column loads) and get random growth ticks while their column is loaded:
//
//  * crops grow a stage when lit (light 9+; ember wart needs none), faster on moist farmland;
//    a mature stem grows its melon or pumpkin onto a free neighbour along +-x, +-z or +-w;
//  * farmland is moist with water within 4 blocks along x, z AND w (a 9x9x9 hyper-area) at its
//    level or one up, or in the rain; dry, bare farmland turns back to dirt;
//  * berry bushes regrow their berries; saplings grow into their tree (the terrain generator's
//    own tree builder) when there is room.
// Bone meal speeds all of it up.

import { REG } from '../content/registry';
import { BUSHES, CROPS, SAPLINGS, isGrowable } from '../content/farming';
import { COLUMN_LAYER, VOID_VOXEL } from '../world/constants';
import type { Column, World } from '../world/World';
import type { ItemStack } from './items/ItemStack';
import { IREG } from '../content/itemRegistry';
import { rollDrops } from './items/Mining';

/** Random growth attempts: each tracked block gets one with this chance per 20 Hz tick (~every 25 s). */
const TICK_CHANCE = 1 / 512;

export interface FarmHost {
  world: World;
  drop(x: number, y: number, z: number, w: number, st: ItemStack): void;
  raining(x: number, y: number, z: number, w: number): boolean;
  /** Grow a named tree into a column-shaped buffer; false if this realm cannot. */
  growTree?(blocks: Uint16Array, x: number, y: number, z: number, w: number, name: string, X: number, Z: number, W: number): boolean;
  height: number;
}

const enum Kind {
  None = 0,
  Crop = 1,
  Bush = 2,
  Farmland = 3,
  Sapling = 4,
}

export class Farming {
  private readonly kind = new Uint8Array(REG.count);
  /** Crop stage -> next stage block (-1: last). */
  private readonly next = new Int16Array(REG.count).fill(-1);
  /** Block -> crop index (stages). */
  private readonly cropOf = new Int16Array(REG.count).fill(-1);
  private readonly stage = new Uint8Array(REG.count);
  private readonly bushNext = new Int16Array(REG.count).fill(-1);
  private readonly saplingTree: (string | null)[] = [];
  readonly growable = new Uint8Array(REG.count);
  private readonly soil = new Uint8Array(REG.count);
  private readonly cols = new Map<Column, Set<number>>();
  private readonly farmland: number;
  private readonly moist: number;
  private readonly dirt: number;
  private readonly water: number;
  private treeBuf: Uint16Array | null = null;
  private treeOld: Uint16Array | null = null;
  /** Growth steps so far (F3, tests). */
  grown = 0;

  constructor(private readonly host: FarmHost) {
    const id = (n: string) => REG.id(n);
    this.farmland = id('farmland');
    this.moist = id('farmland_moist');
    this.dirt = id('dirt');
    this.water = id('water');
    CROPS.forEach((c, ci) => {
      for (let k = 0; k < c.stages; k++) {
        const b = id(`${c.name}_${k}`);
        this.kind[b] = Kind.Crop;
        this.cropOf[b] = ci;
        this.stage[b] = k;
        if (k + 1 < c.stages) this.next[b] = id(`${c.name}_${k + 1}`);
      }
    });
    for (const b of BUSHES) {
      this.kind[id(b.young)] = Kind.Bush;
      this.bushNext[id(b.young)] = id(b.mature);
    }
    this.kind[this.farmland] = Kind.Farmland;
    this.kind[this.moist] = Kind.Farmland;
    for (let i = 0; i < REG.count; i++) this.saplingTree.push(null);
    for (const [s, t] of Object.entries(SAPLINGS)) {
      this.kind[id(s)] = Kind.Sapling;
      this.saplingTree[id(s)] = t;
    }
    REG.blocks.forEach((b, i) => {
      if (isGrowable(b)) this.growable[i] = 1;
      // Soil for saplings and bushes: dirt-like blocks and every grassy turf.
      const tex = REG.textures[REG.texTop[i]!];
      if (['dirt', 'coarse_dirt', 'podzol', 'mycelium', 'farmland', 'farmland_moist', 'forest_loam', 'mud'].includes(b.name) || tex?.pattern === 'grass_top') this.soil[i] = 1;
    });
  }

  isSoil(id: number): boolean {
    return this.soil[id] === 1;
  }

  /** Tracked growables (F3). */
  get count(): number {
    let n = 0;
    for (const s of this.cols.values()) n += s.size;
    return n;
  }

  columnAdded(col: Column): void {
    const g = col.extra.grow as number[] | undefined;
    if (!g?.length) return;
    const set = new Set<number>();
    for (const i of g) set.add(i);
    this.cols.set(col, set);
  }

  columnRemoved(col: Column): void {
    this.cols.delete(col);
  }

  /** Keep the tracked set (and the column's saved list) in step with world edits. */
  blockChanged(x: number, y: number, z: number, w: number, o: number, n: number): void {
    const oi = o & 0xfff, ni = n & 0xfff;
    if (this.growable[ni] === this.growable[oi] && this.growable[ni] === 0) {
      if (oi !== ni) this.supportChanged(x, y, z, w, ni);
      return;
    }
    const col = this.host.world.column(x >> 4, z >> 4, w >> 4);
    if (!col) return;
    const idx = (x & 15) + ((z & 15) << 4) + ((w & 15) << 8) + y * COLUMN_LAYER;
    let set = this.cols.get(col);
    if (this.growable[ni]) {
      if (!set) this.cols.set(col, (set = new Set()));
      set.add(idx);
    } else set?.delete(idx);
    col.extra.grow = set ? [...set] : [];
    if (oi !== ni) this.supportChanged(x, y, z, w, ni);
  }

  /** A block under a crop or bush changed: crops need their soil (they pop off otherwise). */
  private supportChanged(x: number, y: number, z: number, w: number, below: number): void {
    const wd = this.host.world;
    const above = wd.getBlock(x, y + 1, z, w) & 0xfff;
    const k = this.kind[above]!;
    if (k !== Kind.Crop && k !== Kind.Sapling && k !== Kind.Bush) return;
    if (this.canStay(above, below)) return;
    for (const st of rollDrops(above, -1, Math.random)) this.host.drop(x, y + 1, z, w, st);
    wd.setBlock(x, y + 1, z, w, 0);
  }

  private canStay(id: number, below: number): boolean {
    const c = this.cropOf[id]!;
    if (c >= 0) return CROPS[c]!.soil.some((s) => REG.id(s) === below);
    return this.soil[below] === 1;
  }

  /** Random growth ticks for everything tracked in loaded columns. */
  tick(): void {
    for (const [col, set] of this.cols) {
      if (!set.size) continue;
      for (const idx of set) {
        if (Math.random() >= TICK_CHANCE) continue;
        const x = col.cx * 16 + (idx & 15), z = col.cz * 16 + ((idx >> 4) & 15), w = col.cw * 16 + ((idx >> 8) & 15), y = Math.floor(idx / COLUMN_LAYER);
        this.randomTick(x, y, z, w);
      }
    }
  }

  /** One growth attempt at a cell. */
  randomTick(x: number, y: number, z: number, w: number): void {
    const wd = this.host.world;
    const v = wd.getBlock(x, y, z, w);
    if (v === VOID_VOXEL) return;
    const id = v & 0xfff;
    switch (this.kind[id]) {
      case Kind.Crop: {
        const crop = CROPS[this.cropOf[id]!]!;
        if (crop.light > 0 && this.lightAt(x, y, z, w) < crop.light) return;
        const below = wd.getBlock(x, y - 1, z, w) & 0xfff;
        const odds = below === this.moist ? 0.5 : crop.light === 0 ? 0.35 : 0.25;
        if (Math.random() >= odds) return;
        const nx = this.next[id]!;
        if (nx >= 0) {
          wd.setBlock(x, y, z, w, nx);
          this.grown++;
        } else if (crop.fruit) this.growFruit(x, y, z, w, REG.id(crop.fruit));
        return;
      }
      case Kind.Bush:
        if (Math.random() < 0.2 && this.lightAt(x, y, z, w) >= 9) {
          wd.setBlock(x, y, z, w, this.bushNext[id]!);
          this.grown++;
        }
        return;
      case Kind.Farmland: {
        const wet = this.hydrated(x, y, z, w);
        if (wet && id !== this.moist) wd.setBlock(x, y, z, w, this.moist);
        else if (!wet && id === this.moist) wd.setBlock(x, y, z, w, this.farmland);
        else if (!wet && this.kind[wd.getBlock(x, y + 1, z, w) & 0xfff] !== Kind.Crop && Math.random() < 0.3) wd.setBlock(x, y, z, w, this.dirt);
        return;
      }
      case Kind.Sapling:
        if (this.lightAt(x, y, z, w) >= 9 && Math.random() < 1 / 7) this.growSapling(x, y, z, w);
        return;
    }
  }

  private lightAt(x: number, y: number, z: number, w: number): number {
    const l = this.host.world.getLight(x, y, z, w);
    return Math.max(l >> 4, l & 15);
  }

  /** Water within 4 blocks along x, z and w, at this level or one up (or rain). */
  hydrated(x: number, y: number, z: number, w: number): boolean {
    const wd = this.host.world;
    if (this.host.raining(x, y + 1, z, w)) return true;
    for (let dy = 0; dy <= 1; dy++)
      for (let dw = -4; dw <= 4; dw++)
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++) if ((wd.getBlock(x + dx, y + dy, z + dz, w + dw) & 0xfff) === this.water) return true;
    return false;
  }

  /** A mature stem grows its fruit onto a free neighbour (6 in 4D). */
  private growFruit(x: number, y: number, z: number, w: number, fruit: number): void {
    const wd = this.host.world;
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const d of dirs) if ((wd.getBlock(x + d[0]!, y, z + d[1]!, w + d[2]!) & 0xfff) === fruit) return; // one at a time
    const d = dirs[Math.floor(Math.random() * 6)]!;
    const fx = x + d[0]!, fz = z + d[1]!, fw = w + d[2]!;
    if (wd.getBlock(fx, y, fz, fw) !== 0) return;
    const below = wd.getBlock(fx, y - 1, fz, fw) & 0xfff;
    if (!this.soil[below]) return;
    wd.setBlock(fx, y, fz, fw, fruit);
    this.grown++;
  }

  /** Grow a sapling into its tree if there is room for the trunk. */
  growSapling(x: number, y: number, z: number, w: number): boolean {
    const wd = this.host.world;
    const tree = this.saplingTree[wd.getBlock(x, y, z, w) & 0xfff];
    const grow = this.host.growTree;
    if (!tree || !grow) return false;
    const def = REG.tree(tree);
    const H = this.host.height;
    if (y + def.height[1] + 4 >= H) return false;
    for (let k = 1; k <= def.height[0]; k++) {
      const v = wd.getBlock(x, y + k, z, w) & 0xfff;
      if (v !== 0 && !REG.replaceable[v] && !REG.blocks[v]!.tags?.includes('leaves')) return false;
    }
    // A column-shaped scratch buffer centred on the sapling: copy the world in, let the
    // terrain generator grow the tree, copy back what changed.
    const buf = (this.treeBuf ??= new Uint16Array(COLUMN_LAYER * H));
    const old = (this.treeOld ??= new Uint16Array(COLUMN_LAYER * H));
    const X0 = x - 8, Z0 = z - 8, W0 = w - 8;
    const y0 = Math.max(0, y - 2), y1 = Math.min(H - 1, y + def.height[1] + Math.ceil(def.radius[1]) + 3);
    for (let yy = y0; yy <= y1; yy++)
      for (let lw = 0; lw < 16; lw++)
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) {
            const v = wd.getBlock(X0 + lx, yy, Z0 + lz, W0 + lw);
            if (v === VOID_VOXEL) return false; // not all loaded yet
            const i = lx + (lz << 4) + (lw << 8) + yy * COLUMN_LAYER;
            buf[i] = v;
            old[i] = v;
          }
    buf[8 + (8 << 4) + (8 << 8) + y * COLUMN_LAYER] = 0; // the sapling becomes the trunk
    if (!grow(buf, 8, y, 8, 8, tree, x, z, w)) return false;
    for (let yy = y0; yy <= y1; yy++)
      for (let lw = 0; lw < 16; lw++)
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) {
            const i = lx + (lz << 4) + (lw << 8) + yy * COLUMN_LAYER;
            if (buf[i] !== old[i]) wd.setBlock(X0 + lx, yy, Z0 + lz, W0 + lw, buf[i]!);
          }
    this.grown++;
    return true;
  }

  /**
   * Bone meal on a block: crops jump 2-5 stages (stems may fruit), bushes ripen, saplings may
   * grow, grass sprouts plants around (in 4D). Returns true if it did something.
   */
  boneMeal(x: number, y: number, z: number, w: number, plants: number[]): boolean {
    const wd = this.host.world;
    const id = wd.getBlock(x, y, z, w) & 0xfff;
    switch (this.kind[id]) {
      case Kind.Crop: {
        const crop = CROPS[this.cropOf[id]!]!;
        const last = crop.stages - 1;
        if (this.stage[id]! >= last) {
          if (!crop.fruit) return false;
          this.growFruit(x, y, z, w, REG.id(crop.fruit));
          return true;
        }
        const to = Math.min(last, this.stage[id]! + 2 + Math.floor(Math.random() * 4));
        wd.setBlock(x, y, z, w, REG.id(`${crop.name}_${to}`));
        return true;
      }
      case Kind.Bush:
        wd.setBlock(x, y, z, w, this.bushNext[id]!);
        return true;
      case Kind.Sapling:
        if (Math.random() < 0.45) this.growSapling(x, y, z, w);
        return true;
    }
    // Grass: sprout tall grass and flowers on grass around it (a 4D patch).
    if (!this.soil[id] || wd.getBlock(x, y + 1, z, w) !== 0 || !plants.length) return false;
    for (let k = 0; k < 24; k++) {
      const px = x + Math.floor(Math.random() * 7) - 3, pz = z + Math.floor(Math.random() * 7) - 3, pw = w + Math.floor(Math.random() * 7) - 3;
      for (let dy = 1; dy >= -1; dy--) {
        const g = wd.getBlock(px, y + dy, pz, pw) & 0xfff;
        if (!this.soil[g] || REG.blocks[g]!.tags?.includes('farmland')) continue;
        if (wd.getBlock(px, y + dy + 1, pz, pw) !== 0) continue;
        wd.setBlock(px, y + dy + 1, pz, pw, plants[Math.floor(Math.random() * plants.length)]!);
        break;
      }
    }
    return true;
  }

  /** Planting: the block an item puts on `below` (crops on farmland, bushes and saplings on soil). */
  plantFor(item: number, below: number): number {
    const name = IREG.name(item);
    for (const c of CROPS) if (c.seed === name) return c.soil.some((s) => REG.id(s) === below) ? REG.id(`${c.name}_0`) : -1;
    for (const b of BUSHES) if (b.berry === name) return this.soil[below] ? REG.id(b.young) : -1;
    return -1;
  }
}
