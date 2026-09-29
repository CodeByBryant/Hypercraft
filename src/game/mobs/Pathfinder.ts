// 4D A* on the voxel grid for walking mobs. A node is a standable cell (feet at y, `height`
// free cells above, something solid below). Moves: the six horizontal directions (±x, ±z,
// ±w), stepping up one block or dropping up to three. Expansions are capped; when the goal is
// not reached the path to the closest explored node is returned, so mobs still approach.

import { REG, COLLISION_NONE, FLUID_LAVA } from '../../content/registry';

export interface BlockSource {
  getBlock(x: number, y: number, z: number, w: number): number;
}

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

export class Pathfinder {
  /** Nodes expanded by the last search (tests, F3). */
  expanded = 0;
  private readonly heap: number[] = [];
  private readonly f = new Map<number, number>();
  private readonly g = new Map<number, number>();
  private readonly parent = new Map<number, number>();
  private ox = 0;
  private oz = 0;
  private ow = 0;

  constructor(private readonly world: BlockSource, private readonly maxNodes = 900) {}

  private blocked(x: number, y: number, z: number, w: number): boolean {
    const id = this.world.getBlock(x, y, z, w) & 0xfff;
    return REG.collision[id] !== COLLISION_NONE || REG.fluid[id] === FLUID_LAVA;
  }

  private floor(x: number, y: number, z: number, w: number): boolean {
    const id = this.world.getBlock(x, y, z, w) & 0xfff;
    return REG.collision[id] !== COLLISION_NONE && REG.fluid[id] !== FLUID_LAVA;
  }

  standable(x: number, y: number, z: number, w: number, h: number): boolean {
    for (let k = 0; k < h; k++) if (this.blocked(x, y + k, z, w)) return false;
    return this.floor(x, y - 1, z, w);
  }

  private key(x: number, y: number, z: number, w: number): number {
    return ((x - this.ox + 1024) * 256 + y) * 4194304 + (z - this.oz + 1024) * 2048 + (w - this.ow + 1024);
  }

  private unkey(k: number, out: number[]): void {
    const w = (k % 2048) - 1024 + this.ow;
    k = Math.floor(k / 2048);
    const z = (k % 2048) - 1024 + this.oz;
    k = Math.floor(k / 2048);
    const y = k % 256;
    const x = Math.floor(k / 256) - 1024 + this.ox;
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
  }

  private push(k: number, f: number): void {
    const h = this.heap;
    this.f.set(k, f);
    h.push(k);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f.get(h[p]!)! <= f) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = k;
  }

  private pop(): number {
    const h = this.heap;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      const fl = this.f.get(last)!;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        let fm = fl;
        if (l < h.length && this.f.get(h[l]!)! < fm) {
          m = l;
          fm = this.f.get(h[l]!)!;
        }
        if (r < h.length && this.f.get(h[r]!)! < fm) m = r;
        if (m === i) break;
        h[i] = h[m]!;
        i = m;
      }
      h[i] = last;
    }
    return top;
  }

  /**
   * Path from `start` to `goal` (integer cells, feet positions) for a mob `height` cells tall.
   * Returns the list of cells (start excluded, goal or closest reachable node last).
   */
  find(start: ArrayLike<number>, goal: ArrayLike<number>, height = 2): number[][] {
    this.heap.length = 0;
    this.f.clear();
    this.g.clear();
    this.parent.clear();
    this.expanded = 0;
    const [sx, sy, sz, sw] = [start[0]!, start[1]!, start[2]!, start[3]!];
    const [gx, gy, gz, gw] = [goal[0]!, goal[1]!, goal[2]!, goal[3]!];
    this.ox = sx;
    this.oz = sz;
    this.ow = sw;
    const hfun = (x: number, y: number, z: number, w: number) => Math.abs(x - gx) + Math.abs(y - gy) * 1.5 + Math.abs(z - gz) + Math.abs(w - gw);
    const sk = this.key(sx, sy, sz, sw);
    this.g.set(sk, 0);
    this.push(sk, hfun(sx, sy, sz, sw));
    let best = sk;
    let bestH = hfun(sx, sy, sz, sw);
    const cur = [0, 0, 0, 0];
    while (this.heap.length > 0 && this.expanded < this.maxNodes) {
      const k = this.pop();
      this.expanded++;
      this.unkey(k, cur);
      const [x, y, z, w] = cur as [number, number, number, number];
      const hk = hfun(x, y, z, w);
      if (hk < bestH) {
        bestH = hk;
        best = k;
      }
      if (x === gx && y === gy && z === gz && w === gw) {
        best = k;
        break;
      }
      const gk = this.g.get(k)!;
      for (const [dx, dz, dw] of DIRS) {
        const nx = x + dx, nz = z + dz, nw = w + dw;
        let ny = -1;
        let cost = 1;
        if (this.standable(nx, y, nz, nw, height)) ny = y;
        else if (!this.blocked(x, y + height, z, w) && this.standable(nx, y + 1, nz, nw, height)) {
          ny = y + 1;
          cost = 2;
        } else {
          for (let drop = 1; drop <= 3; drop++) {
            if (this.blocked(nx, y - drop + height, nz, nw)) break;
            if (this.standable(nx, y - drop, nz, nw, height)) {
              ny = y - drop;
              cost = 1 + drop * 0.5;
              break;
            }
          }
        }
        if (ny < 1 || ny > 250) continue;
        const nk = this.key(nx, ny, nz, nw);
        const ng = gk + cost;
        const old = this.g.get(nk);
        if (old !== undefined && old <= ng) continue;
        this.g.set(nk, ng);
        this.parent.set(nk, k);
        this.push(nk, ng + hfun(nx, ny, nz, nw));
      }
    }
    // Walk back from the goal (or the closest node).
    const path: number[][] = [];
    let k = best;
    while (k !== sk) {
      const c = [0, 0, 0, 0];
      this.unkey(k, c);
      path.push(c);
      const p = this.parent.get(k);
      if (p === undefined) break;
      k = p;
    }
    path.reverse();
    return path;
  }
}
