// Fire (playtest fix: fire used to sit still and never burn anything). Fire spreads to
// flammable blocks, burns them away, burns out on ordinary ground and in the rain, and burns
// forever on 'infiniburn' blocks (cinder, ember moss, magma). The rules are Minecraft's
// FireBlock, in 4D:
//
//  * A fire acts every 30-40 world ticks (1.5-2 s). Its age (the voxel's meta nibble, 0..15)
//    creeps up as it burns.
//  * It needs fuel. A fire with no flammable neighbour among its 8 face neighbours (±x, ±y,
//    ±z, ±w) dies once it is older than 3, or at once with nothing solid under it. At age 15
//    it may die even next to fuel, unless the block under it is fuel itself.
//  * It eats its neighbours: each flammable face neighbour may burn away (its burn odds) and
//    may become fire itself.
//  * It jumps: an air cell within one block along x, z and w, from one below to four above,
//    that touches fuel may catch (the fuel's ignite odds, less the older the fire and the
//    higher the cell). 4D has three times as many such cells as 3D, so 4D fire is fiercer.
//  * Rain puts out fires open to the sky (not on infiniburn blocks).
//  * Lava sets fire to flammable blocks near it as it flows or is poured.
//
// Generated fires (eternal fire in the Ember Depths) are only ticked once a block next to
// them changes; fires that players light or that spread are always ticked.

import { REG } from '../content/registry';
import type { World } from '../world/World';
import { VOID_VOXEL } from '../world/constants';

export interface FireHost {
  world: World;
  /** Uniform random number in [0, 1). */
  random(): number;
  /** Rain is falling on this cell (it is raining, and the cell is open to the sky). */
  rainingAt(x: number, y: number, z: number, w: number): boolean;
  /** 0 peaceful .. 3 hard: fire spreads a little faster on harder difficulties. */
  difficulty(): number;
  /** A new fire appeared (a portal frame around it lights). */
  ignited?(x: number, y: number, z: number, w: number): void;
  /** Fire reached TNT: light it instead of burning it (true if it was TNT). */
  primeTnt?(x: number, y: number, z: number, w: number): boolean;
}

interface Fire {
  x: number;
  y: number;
  z: number;
  w: number;
  /** World ticks until it acts. */
  wait: number;
}

const N8 = [
  [1, 0, 0, 0],
  [-1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, -1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, -1, 0],
  [0, 0, 0, 1],
  [0, 0, 0, -1],
] as const;

export class FireSystem {
  private readonly active = new Map<string, Fire>();
  private readonly fireId = REG.id('fire');
  private readonly lavaId = REG.id('lava');

  constructor(private readonly host: FireHost) {}

  /** Fires being ticked. */
  get count(): number {
    return this.active.size;
  }

  /** The fires being ticked (positions). */
  cells(): IterableIterator<{ readonly x: number; readonly y: number; readonly z: number; readonly w: number }> {
    return this.active.values();
  }

  /** Start ticking the fire at a cell (no-op if there is none). */
  wake(x: number, y: number, z: number, w: number): void {
    const k = `${x},${y},${z},${w}`;
    if (this.active.has(k)) return;
    if ((this.host.world.getBlock(x, y, z, w) & 0xfff) !== this.fireId) return;
    this.active.set(k, { x, y, z, w, wait: 30 + Math.floor(this.host.random() * 10) });
  }

  /** World block-change hook. */
  blockChanged(x: number, y: number, z: number, w: number, o: number, n: number): void {
    const nid = n & 0xfff;
    if (nid === this.fireId) {
      this.wake(x, y, z, w);
      return;
    }
    if ((o & 0xfff) === this.fireId) this.active.delete(`${x},${y},${z},${w}`);
    // A fire next to a change may have lost its footing, or gained fuel.
    const world = this.host.world;
    for (const d of N8) if ((world.getBlock(x + d[0], y + d[1], z + d[2], w + d[3]) & 0xfff) === this.fireId) this.wake(x + d[0], y + d[1], z + d[2], w + d[3]);
    // New fuel: fires that could jump to the air around it wake up.
    if (REG.ignite[nid]! > 0)
      for (let dy = -4; dy <= 1; dy++)
        for (let dw = -1; dw <= 1; dw++)
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) if ((world.getBlock(x + dx, y + dy, z + dz, w + dw) & 0xfff) === this.fireId) this.wake(x + dx, y + dy, z + dz, w + dw);
    if (nid === this.lavaId && this.host.random() < 0.3) this.lavaIgnite(x, y, z, w);
  }

  /** One world tick (20 per second). */
  tick(): void {
    if (!this.active.size) return;
    const due: Fire[] = [];
    for (const f of this.active.values()) if (--f.wait <= 0) due.push(f);
    for (const f of due) {
      f.wait = 30 + Math.floor(this.host.random() * 10);
      if (!this.act(f)) this.active.delete(`${f.x},${f.y},${f.z},${f.w}`);
    }
  }

  /** Forget every fire (realm change). */
  clear(): void {
    this.active.clear();
  }

  /** One fire's turn. Returns false when it is gone (or out of the loaded world). */
  private act(f: Fire): boolean {
    const h = this.host, world = h.world;
    const { x, y, z, w } = f;
    const v = world.getBlock(x, y, z, w);
    if (v === VOID_VOXEL || (v & 0xfff) !== this.fireId) return false;
    const age = v >>> 12;
    const below = world.getBlock(x, y - 1, z, w) & 0xfff;
    const eternal = REG.infiniburn[below] === 1;
    if (!eternal && h.rainingAt(x, y, z, w) && h.random() < 0.2 + age * 0.03) return this.out(f);
    const next = Math.min(15, age + (h.random() < 1 / 3 ? 1 : 0));
    if (next !== age) world.setBlock(x, y, z, w, this.fireId | (next << 12));
    if (!eternal) {
      if (!this.fuelNear(x, y, z, w)) {
        if (!REG.solid[below] || age > 3) return this.out(f);
      } else if (age === 15 && h.random() < 0.25 && REG.burn[below] === 0) return this.out(f);
    }
    // Burn the neighbours (up and down a little more readily, as in Minecraft).
    for (const d of N8) this.tryBurn(x + d[0], y + d[1], z + d[2], w + d[3], d[1] !== 0 ? 250 : 300, next);
    // Jump to air cells that touch fuel.
    const diff = h.difficulty();
    for (let dy = -1; dy <= 4; dy++)
      for (let dw = -1; dw <= 1; dw++)
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0 && dz === 0 && dw === 0) continue;
            const cx = x + dx, cy = y + dy, cz = z + dz, cw = w + dw;
            if (world.getBlock(cx, cy, cz, cw) !== 0) continue;
            const odds = this.igniteOdds(cx, cy, cz, cw);
            if (odds <= 0) continue;
            const k = 150 + (dy > 1 ? (dy - 1) * 150 : 0);
            const l = (odds + 40 + diff * 7) / (next + 30);
            if (h.random() * k <= l && !h.rainingAt(cx, cy, cz, cw)) this.setFire(cx, cy, cz, cw, Math.min(15, next + (h.random() < 0.2 ? 1 : 0)));
          }
    return true;
  }

  private out(f: Fire): boolean {
    this.host.world.setBlock(f.x, f.y, f.z, f.w, 0);
    return false;
  }

  /** A flammable block may burn away, and may turn into fire itself. */
  private tryBurn(x: number, y: number, z: number, w: number, chance: number, age: number): void {
    const h = this.host;
    const v = h.world.getBlock(x, y, z, w);
    if (v === VOID_VOXEL) return;
    const odds = REG.burn[v & 0xfff]!;
    if (odds === 0 || h.random() * chance >= odds) return;
    if (h.primeTnt?.(x, y, z, w)) return;
    if (h.random() * (age + 10) < 5 && !h.rainingAt(x, y, z, w)) this.setFire(x, y, z, w, Math.min(15, age + (h.random() < 0.2 ? 1 : 0)));
    else h.world.setBlock(x, y, z, w, 0);
  }

  /** Does any face neighbour burn? */
  private fuelNear(x: number, y: number, z: number, w: number): boolean {
    const world = this.host.world;
    for (const d of N8) {
      const v = world.getBlock(x + d[0], y + d[1], z + d[2], w + d[3]);
      if (v !== VOID_VOXEL && REG.ignite[v & 0xfff]! > 0) return true;
    }
    return false;
  }

  /** How readily an air cell catches: the best ignite odds among its face neighbours. */
  private igniteOdds(x: number, y: number, z: number, w: number): number {
    const world = this.host.world;
    let best = 0;
    for (const d of N8) {
      const v = world.getBlock(x + d[0], y + d[1], z + d[2], w + d[3]);
      if (v !== VOID_VOXEL) best = Math.max(best, REG.ignite[v & 0xfff]!);
    }
    return best;
  }

  /** Light a fire (spread, lava). */
  setFire(x: number, y: number, z: number, w: number, age = 0): boolean {
    if (!this.host.world.setBlock(x, y, z, w, this.fireId | (age << 12))) return false;
    this.host.ignited?.(x, y, z, w);
    return true;
  }

  /**
   * Lava next to fuel: like Minecraft's lava, wander up to three cells up and sideways (in x,
   * z and w) from it and light the first air cell that touches fuel.
   */
  private lavaIgnite(x: number, y: number, z: number, w: number): void {
    const h = this.host, world = h.world;
    let cx = x, cy = y, cz = z, cw = w;
    for (let i = 0; i < 3; i++) {
      cx += Math.floor(h.random() * 3) - 1;
      cy += 1;
      cz += Math.floor(h.random() * 3) - 1;
      cw += Math.floor(h.random() * 3) - 1;
      const v = world.getBlock(cx, cy, cz, cw);
      if (v === 0) {
        if (this.igniteOdds(cx, cy, cz, cw) > 0) {
          this.setFire(cx, cy, cz, cw);
          return;
        }
      } else if (v === VOID_VOXEL || REG.solid[v & 0xfff]) return;
    }
  }
}
