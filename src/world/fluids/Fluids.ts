// Cellular 4D fluids. Water and lava are one block id each; the voxel meta nibble holds the
// state: 0 = source, 1..7 = flowing level (distance from a source), 8 = falling.
//
// Rule per update (on a fixed tick budget):
//   1. A non-source cell re-derives its level: falling if the same fluid is above, else
//      1 + the lowest level among its six horizontal neighbours (±X, ±Z, ±W); it dries up if
//      that exceeds the fluid's range. Water with two or more horizontal sources and solid
//      ground (or a source) below becomes a source (infinite water, like Minecraft).
//   2. It then flows down (−Y) if possible, otherwise spreads to the six horizontal 4D
//      neighbours — so fluids spread along W exactly like along X and Z.
//   3. Water touching lava turns lava sources into obsidian and flowing lava into cobblestone.
//
// Work is scheduled by block changes (any change schedules the cell and its 8 neighbours), so
// untouched generated oceans cost nothing.

import { B, REG, FLUID_LAVA, FLUID_NONE, FLUID_WATER, makeVoxel } from '../../content/registry';
import { VOID_VOXEL } from '../constants';
import type { World } from '../World';

const HX = [1, -1, 0, 0, 0, 0];
const HZ = [0, 0, 1, -1, 0, 0];
const HW = [0, 0, 0, 0, 1, -1];
const FALLING = 8;

/** Packs a position into a 53-bit key (x/z/w mod 32768, y mod 256) for de-duplication. */
function posKey(x: number, y: number, z: number, w: number): number {
  return (((x & 32767) * 32768 + (z & 32767)) * 32768 + (w & 32767)) * 256 + (y & 255);
}

class PosQueue {
  data = new Int32Array(4 * 4096);
  n = 0;
  readonly seen = new Set<number>();
  /** Push unless already queued. */
  add(x: number, y: number, z: number, w: number): void {
    const k = posKey(x, y, z, w);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.push(x, y, z, w);
  }
  reset(): void {
    this.n = 0;
    if (this.seen.size > 0) this.seen.clear(); // clear() reallocates the table; skip when empty
  }
  push(x: number, y: number, z: number, w: number): void {
    if ((this.n + 1) * 4 > this.data.length) {
      const g = new Int32Array(this.data.length * 2);
      g.set(this.data);
      this.data = g;
    }
    const o = this.n * 4;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = z;
    this.data[o + 3] = w;
    this.n++;
  }
}

export interface FluidStats {
  updates: number;
  pendingWater: number;
  pendingLava: number;
}

export class FluidSim {
  private readonly world: World;
  private water = new PosQueue();
  private waterNext = new PosQueue();
  private lava = new PosQueue();
  private lavaNext = new PosQueue();
  private tickCount = 0;
  budget = 6000;
  readonly waterInterval = 5;
  readonly lavaInterval = 30;
  readonly stats: FluidStats = { updates: 0, pendingWater: 0, pendingLava: 0 };
  enabled = true;

  constructor(world: World) {
    this.world = world;
  }

  /** World listener: schedule the changed cell and its 8 neighbours if fluids are involved. */
  onBlockChanged(x: number, y: number, z: number, w: number, oldV: number, newV: number): void {
    this.scheduleAround(x, y, z, w, oldV, newV);
  }

  private scheduleAround(x: number, y: number, z: number, w: number, oldV: number, newV: number): void {
    const f = REG.fluid;
    const any = f[oldV & 0xfff] !== FLUID_NONE || f[newV & 0xfff] !== FLUID_NONE;
    this.scheduleCell(x, y, z, w, any);
    this.scheduleCell(x, y + 1, z, w, false);
    this.scheduleCell(x, y - 1, z, w, false);
    for (let i = 0; i < 6; i++) this.scheduleCell(x + HX[i]!, y, z + HZ[i]!, w + HW[i]!, false);
  }

  private scheduleCell(x: number, y: number, z: number, w: number, force: boolean): void {
    if (y < 0 || y >= this.world.height) return;
    const v = this.world.getBlock(x, y, z, w);
    const fl = REG.fluid[v & 0xfff]!;
    if (fl === FLUID_WATER) this.waterNext.add(x, y, z, w);
    else if (fl === FLUID_LAVA) this.lavaNext.add(x, y, z, w);
    else if (force) this.waterNext.add(x, y, z, w);
  }

  /** Called at 20 Hz. */
  tick(): void {
    if (!this.enabled) return;
    this.tickCount++;
    this.stats.updates = 0;
    if (this.tickCount % this.waterInterval === 0) {
      const q = this.waterNext;
      this.waterNext = this.water;
      this.water = q;
      this.waterNext.reset();
      this.run(this.water, B.water, 7, 1);
      // Anything left over (budget) carries to the next update.
      for (let i = this.stats.updates; i < this.water.n; i++) {
        const o = i * 4;
        this.waterNext.add(this.water.data[o]!, this.water.data[o + 1]!, this.water.data[o + 2]!, this.water.data[o + 3]!);
      }
      this.water.reset();
    }
    if (this.tickCount % this.lavaInterval === 0) {
      const q = this.lavaNext;
      this.lavaNext = this.lava;
      this.lava = q;
      this.lavaNext.reset();
      const before = this.stats.updates;
      this.run(this.lava, B.lava, 3, 1);
      const done = this.stats.updates - before;
      for (let i = done; i < this.lava.n; i++) {
        const o = i * 4;
        this.lavaNext.add(this.lava.data[o]!, this.lava.data[o + 1]!, this.lava.data[o + 2]!, this.lava.data[o + 3]!);
      }
      this.lava.reset();
    }
    this.stats.pendingWater = this.waterNext.n;
    this.stats.pendingLava = this.lavaNext.n;
  }

  private run(q: PosQueue, fluid: number, range: number, stepCost: number): void {
    const world = this.world;
    const n = q.n;
    for (let i = 0; i < n; i++) {
      if (this.stats.updates >= this.budget) return;
      this.stats.updates++;
      const o = i * 4;
      const x = q.data[o]!, y = q.data[o + 1]!, z = q.data[o + 2]!, w = q.data[o + 3]!;
      this.update(world, x, y, z, w, fluid, range, stepCost);
    }
  }

  private isFluid(v: number, fluid: number): boolean {
    return (v & 0xfff) === fluid;
  }

  private levelOf(v: number): number {
    const m = (v >>> 12) & 15;
    return m >= FALLING ? 0 : m;
  }

  private canFlowInto(v: number): boolean {
    if (v === VOID_VOXEL) return false;
    const id = v & 0xfff;
    return id === 0 || (REG.replaceable[id] === 1 && REG.fluid[id] === FLUID_NONE);
  }

  update(world: World, x: number, y: number, z: number, w: number, fluid: number, range: number, stepCost: number): void {
    let v = world.getBlock(x, y, z, w);
    if (!this.isFluid(v, fluid)) return;
    let meta = (v >>> 12) & 15;

    // Lava/water interaction.
    if (this.react(world, x, y, z, w, v, fluid)) return;

    if (meta !== 0) {
      let newMeta: number;
      const above = world.getBlock(x, y + 1, z, w);
      if (this.isFluid(above, fluid)) newMeta = FALLING;
      else {
        let best = 99;
        let sources = 0;
        for (let i = 0; i < 6; i++) {
          const nv = world.getBlock(x + HX[i]!, y, z + HZ[i]!, w + HW[i]!);
          if (!this.isFluid(nv, fluid)) continue;
          const lv = this.levelOf(nv);
          if (((nv >>> 12) & 15) === 0) sources++;
          if (lv < best) best = lv;
        }
        newMeta = best + stepCost;
        if (fluid === B.water && sources >= 2) {
          const below = world.getBlock(x, y - 1, z, w);
          if (REG.solid[below & 0xfff] || (this.isFluid(below, fluid) && ((below >>> 12) & 15) === 0)) newMeta = 0;
        }
        if (newMeta > range) newMeta = -1;
      }
      if (newMeta !== meta) {
        if (newMeta < 0) {
          world.setBlock(x, y, z, w, 0);
          return;
        }
        world.setBlock(x, y, z, w, makeVoxel(fluid, newMeta));
        meta = newMeta;
        v = makeVoxel(fluid, newMeta);
      }
    }

    // Flow down first.
    const below = world.getBlock(x, y - 1, z, w);
    if (y > 0 && this.canFlowInto(below)) {
      world.setBlock(x, y - 1, z, w, makeVoxel(fluid, FALLING));
      return;
    }
    if (y > 0 && this.isFluid(below, fluid)) {
      // Resting on the same fluid: only sources spread sideways (like still water surfaces).
      if (meta !== 0) return;
    }
    // Spread horizontally in 4D.
    const level = meta >= FALLING ? 0 : meta;
    if (level + stepCost > range) return;
    const nm = level + stepCost;
    for (let i = 0; i < 6; i++) {
      const nx = x + HX[i]!, nz = z + HZ[i]!, nw = w + HW[i]!;
      const nv = world.getBlock(nx, y, nz, nw);
      if (this.canFlowInto(nv)) world.setBlock(nx, y, nz, nw, makeVoxel(fluid, nm));
      else if (this.isFluid(nv, fluid) && ((nv >>> 12) & 15) !== 0 && this.levelOf(nv) > nm) {
        world.setBlock(nx, y, nz, nw, makeVoxel(fluid, nm));
      }
    }
  }

  /** Water meets lava. Returns true if this cell changed into a solid. */
  private react(world: World, x: number, y: number, z: number, w: number, v: number, fluid: number): boolean {
    const other = fluid === B.water ? B.lava : B.water;
    for (let i = 0; i < 8; i++) {
      const nx = i < 6 ? x + HX[i]! : x;
      const ny = i === 6 ? y + 1 : i === 7 ? y - 1 : y;
      const nz = i < 6 ? z + HZ[i]! : z;
      const nw = i < 6 ? w + HW[i]! : w;
      const nv = world.getBlock(nx, ny, nz, nw);
      if ((nv & 0xfff) !== other) continue;
      if (fluid === B.lava) {
        // This lava cell is touched by water.
        world.setBlock(x, y, z, w, ((v >>> 12) & 15) === 0 ? B.obsidian : B.cobblestone);
        return true;
      } else {
        const lavaSource = ((nv >>> 12) & 15) === 0;
        world.setBlock(nx, ny, nz, nw, lavaSource ? B.obsidian : B.cobblestone);
      }
    }
    return false;
  }
}
