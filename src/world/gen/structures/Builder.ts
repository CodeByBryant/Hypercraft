// Structure building toolkit. Pieces are authored in a local frame:
//   a = right, y = up, b = forward (toward the door / road), c = the piece's own "ana" axis
// and placed with one of the 48 horizontal orientations of 4D space (every permutation of the
// world axes x, z, w with every sign). So a house can face +z, -w, +x..., and its "ana" side
// can lie along any other horizontal axis: in 4D a room has six walls, and doors on the ±c
// walls are only reachable by moving kata/ana.

import { REG, makeVoxel, VARIANT_HORIZONTAL6 } from '../../../content/registry';
import { Rng } from '../../../math/rng';
import { IF_SOFT, REPLACE, type StructurePlan } from './Plan';

export interface Orient {
  /** World axis (0 = x, 2 = z, 3 = w) for local a, b, c. */
  axes: [number, number, number];
  signs: [number, number, number];
}

const PERMS: [number, number, number][] = [
  [0, 2, 3],
  [0, 3, 2],
  [2, 0, 3],
  [2, 3, 0],
  [3, 0, 2],
  [3, 2, 0],
];

/** All 48 horizontal orientations; index 0 is the identity (a = x, b = z, c = w). */
export const ORIENTS: Orient[] = PERMS.flatMap((axes) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((s) => ({ axes, signs: [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1] as [number, number, number] })),
);

/** Local horizontal axis ids. */
export const A = 0;
export const Bf = 1;
export const C = 2;

export class Builder {
  readonly plan: StructurePlan;
  readonly rng: Rng;
  readonly sea: number;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private ow = 0;
  private o: Orient = ORIENTS[0]!;
  private readonly frames: [number, number, number, number, Orient][] = [];
  private readonly groundFn: (x: number, z: number, w: number) => number;
  private readonly groundCache = new Map<string, number>();
  private readonly p = [0, 0, 0, 0];

  constructor(plan: StructurePlan, rng: Rng, ground: (x: number, z: number, w: number) => number, sea: number) {
    this.plan = plan;
    this.rng = rng;
    this.groundFn = ground;
    this.sea = sea;
  }

  /** Put the local origin at a world point with an orientation. */
  frame(x: number, y: number, z: number, w: number, o: Orient): void {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.ow = w;
    this.o = o;
  }

  push(): void {
    this.frames.push([this.ox, this.oy, this.oz, this.ow, this.o]);
  }

  pop(): void {
    const f = this.frames.pop();
    if (!f) return;
    [this.ox, this.oy, this.oz, this.ow, this.o] = f;
  }

  /** Move the origin by a local offset (keeps the orientation). */
  shift(a: number, y: number, b: number, c: number): void {
    const q = this.world(a, y, b, c);
    this.ox = q[0]!;
    this.oy = q[1]!;
    this.oz = q[2]!;
    this.ow = q[3]!;
  }

  /** Change orientation around the current origin. */
  orient(o: Orient): void {
    this.o = o;
  }

  get orientation(): Orient {
    return this.o;
  }

  get originY(): number {
    return this.oy;
  }

  /** World coordinates of a local point (shared scratch array). */
  world(a: number, y: number, b: number, c: number): number[] {
    const p = this.p;
    p[0] = this.ox;
    p[1] = this.oy + y;
    p[2] = this.oz;
    p[3] = this.ow;
    const ax = this.o.axes, sg = this.o.signs;
    p[ax[0]] = p[ax[0]]! + a * sg[0];
    p[ax[1]] = p[ax[1]]! + b * sg[1];
    p[ax[2]] = p[ax[2]]! + c * sg[2];
    return p;
  }

  set(a: number, y: number, b: number, c: number, v: number, mode = REPLACE): void {
    const p = this.world(a, y, b, c);
    this.plan.set(p[0]!, p[1]!, p[2]!, p[3]!, v, mode);
  }

  /** Fill a local box (inclusive corners, any order). */
  box(a0: number, y0: number, b0: number, c0: number, a1: number, y1: number, b1: number, c1: number, v: number, mode = REPLACE): void {
    const [ai, aj] = a0 <= a1 ? [a0, a1] : [a1, a0];
    const [yi, yj] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [bi, bj] = b0 <= b1 ? [b0, b1] : [b1, b0];
    const [ci, cj] = c0 <= c1 ? [c0, c1] : [c1, c0];
    for (let c = ci; c <= cj; c++) for (let b = bi; b <= bj; b++) for (let y = yi; y <= yj; y++) for (let a = ai; a <= aj; a++) this.set(a, y, b, c, v, mode);
  }

  /**
   * A 4D room: walls on all six horizontal faces (±a, ±b, ±c), a floor and a roof, air
   * inside. Corners are inclusive; `floor` / `roof` default to the wall block.
   */
  room(a0: number, y0: number, b0: number, c0: number, a1: number, y1: number, b1: number, c1: number, wall: number, floor = wall, roof = wall, inside = 0): void {
    for (let c = c0; c <= c1; c++)
      for (let b = b0; b <= b1; b++)
        for (let y = y0; y <= y1; y++)
          for (let a = a0; a <= a1; a++) {
            const edge = a === a0 || a === a1 || b === b0 || b === b1 || c === c0 || c === c1;
            const v = y === y0 ? floor : y === y1 ? roof : edge ? wall : inside;
            this.set(a, y, b, c, v);
          }
  }

  /** Terrain height (top solid block) at a local horizontal point, never below sea level. */
  ground(a: number, b: number, c: number): number {
    const p = this.world(a, 0, b, c);
    const key = `${p[0]},${p[2]},${p[3]}`;
    let h = this.groundCache.get(key);
    if (h === undefined) {
      h = this.groundFn(p[0]!, p[2]!, p[3]!);
      this.groundCache.set(key, h);
    }
    return h;
  }

  /** Support a floor at local height y over a footprint: fill down to the ground (soft cells only). */
  foundation(a0: number, b0: number, c0: number, a1: number, b1: number, c1: number, y: number, v: number, maxDepth = 14): void {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
      for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++)
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) {
          const g = this.ground(a, b, c) - this.oy;
          for (let yy = y - 1; yy > g && yy >= y - maxDepth; yy--) this.set(a, yy, b, c, v, IF_SOFT);
        }
  }

  /** Clear terrain above a footprint (hills cut back so doors are not buried). */
  clearAbove(a0: number, b0: number, c0: number, a1: number, b1: number, c1: number, y: number, h = 8): void {
    this.box(a0, y, b0, c0, a1, y + h, b1, c1, 0);
  }

  /** Meta for a horizontal6-facing block pointing along local axis (0 a, 1 b, 2 c) and sign. */
  facing(axis: number, sign: number): number {
    const wa = this.o.axes[axis]!;
    const ws = sign * this.o.signs[axis]!;
    return (wa === 0 ? 0 : wa === 2 ? 2 : 4) + (ws > 0 ? 0 : 1);
  }

  /** A facing block (stairs, ladder) placed along a local direction. */
  faced(a: number, y: number, b: number, c: number, id: number, axis: number, sign: number, mode = REPLACE): void {
    const meta = REG.variantMode[id] === VARIANT_HORIZONTAL6 ? this.facing(axis, sign) : 0;
    this.set(a, y, b, c, makeVoxel(id, meta), mode);
  }

  /**
   * A two-cell bed: the foot at (a, y, b, c) and the head one cell along local `axis` / `sign`
   * (both halves carry the same facing, like a bed placed by a player walking that way).
   */
  bed(a: number, y: number, b: number, c: number, name: string, axis: number, sign: number): void {
    const meta = this.facing(axis, sign);
    this.set(a, y, b, c, makeVoxel(REG.id(name), meta));
    const d = [0, 0, 0];
    d[axis] = sign;
    this.set(a + d[0]!, y, b + d[1]!, c + d[2]!, makeVoxel(REG.id(`${name}_head`), meta));
  }

  chest(a: number, y: number, b: number, c: number, loot: string): void {
    const p = this.world(a, y, b, c);
    this.plan.set(p[0]!, p[1]!, p[2]!, p[3]!, REG.id('chest'));
    this.plan.mark({ kind: 'chest', x: p[0]!, y: p[1]!, z: p[2]!, w: p[3]!, loot });
  }

  spawner(a: number, y: number, b: number, c: number, mob: string): void {
    const p = this.world(a, y, b, c);
    this.plan.set(p[0]!, p[1]!, p[2]!, p[3]!, REG.id('mob_spawner'));
    this.plan.mark({ kind: 'spawner', x: p[0]!, y: p[1]!, z: p[2]!, w: p[3]!, mob });
  }

  npc(a: number, y: number, b: number, c: number, mob: string, data: Record<string, unknown> = {}): void {
    const p = this.world(a, y, b, c);
    this.plan.mark({ kind: 'npc', x: p[0]!, y: p[1]!, z: p[2]!, w: p[3]!, mob, data });
  }

  /** Random integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + this.rng.int(hi - lo + 1);
  }

  chance(p: number): boolean {
    return this.rng.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    return list[this.rng.int(list.length)]!;
  }
}

/** Block id by name (throws on typos at build time, caught by the structure tests). */
export const id = (name: string): number => REG.id(name);
