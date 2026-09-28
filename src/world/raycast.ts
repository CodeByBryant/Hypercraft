// CPU 4D DDA for picking (targeting blocks). Mirrors the shader's traversal and its
// analytic sub-voxel shape tests, so what you target is exactly what you see: the ray stays
// in the view hyperplane and hits real 4D facets (a facet may be an X, Y, Z or W facet).

import { REG, RENDER_INVISIBLE, SHAPE_KIND_BOXES, FLUID_NONE } from '../content/registry';
import { VOID_VOXEL } from './constants';
import type { World } from './World';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  w: number;
  /** Facet normal axis and sign (the face points back toward the ray origin). */
  axis: number;
  sign: number;
  t: number;
  voxel: number;
  /** Hit point (world coordinates). */
  p: Float64Array;
  /** Sub-voxel box of the hit (cell-relative) for outlines. */
  bmin: Float64Array;
  bmax: Float64Array;
}

export function makeRayHit(): RayHit {
  return {
    x: 0,
    y: 0,
    z: 0,
    w: 0,
    axis: 0,
    sign: 1,
    t: 0,
    voxel: 0,
    p: new Float64Array(4),
    bmin: new Float64Array(4),
    bmax: new Float64Array(4),
  };
}

const cell = new Int32Array(4);
const stepI = new Int32Array(4);
const tMax = new Float64Array(4);
const tDelta = new Float64Array(4);

/**
 * Casts a ray from `o` along unit direction `d` (world coords). Fluids are skipped unless
 * `hitFluids`. Returns true and fills `out` on hit.
 */
export function raycast(world: World, o: ArrayLike<number>, d: ArrayLike<number>, maxDist: number, out: RayHit, hitFluids = false): boolean {
  for (let i = 0; i < 4; i++) {
    cell[i] = Math.floor(o[i]!);
    const di = d[i]!;
    if (di > 1e-12) {
      stepI[i] = 1;
      tDelta[i] = 1 / di;
      tMax[i] = (cell[i]! + 1 - o[i]!) / di;
    } else if (di < -1e-12) {
      stepI[i] = -1;
      tDelta[i] = -1 / di;
      tMax[i] = (cell[i]! - o[i]!) / di;
    } else {
      stepI[i] = 0;
      tDelta[i] = Infinity;
      tMax[i] = Infinity;
    }
  }
  let t = 0;
  let axis = -1;
  for (let iter = 0; iter < 256 && t <= maxDist; iter++) {
    const v = world.getBlock(cell[0]!, cell[1]!, cell[2]!, cell[3]!);
    const id = v & 0xfff;
    if (v !== VOID_VOXEL && id !== 0 && axis >= 0) {
      const render = REG.render[id]!;
      const fluid = REG.fluid[id]!;
      if (render !== RENDER_INVISIBLE && (fluid === FLUID_NONE || hitFluids)) {
        // exit time of this cell
        let tExit = Infinity;
        for (let i = 0; i < 4; i++) tExit = Math.min(tExit, tMax[i]!);
        if (testCell(v, o, d, t, tExit, axis, out)) return out.t <= maxDist;
      }
    }
    // step
    let a = 0;
    let m = tMax[0]!;
    for (let i = 1; i < 4; i++) {
      if (tMax[i]! < m) {
        m = tMax[i]!;
        a = i;
      }
    }
    t = m;
    cell[a] = cell[a]! + stepI[a]!;
    tMax[a] = tMax[a]! + tDelta[a]!;
    axis = a;
    if (cell[1]! < -1 || cell[1]! > world.height + 1) break;
  }
  return false;
}

function testCell(v: number, o: ArrayLike<number>, d: ArrayLike<number>, tEnter: number, tExit: number, enterAxis: number, out: RayHit): boolean {
  const id = v & 0xfff;
  if (REG.isFullShape[id] || REG.fluid[id] !== FLUID_NONE) {
    fill(out, v, o, d, tEnter, enterAxis, 0, 0, 0, 0, 1, 1, 1, 1);
    return true;
  }
  const sh = REG.shapes[REG.shapeIndex(v)]!;
  if (sh.kind !== SHAPE_KIND_BOXES) {
    // Plants: target the whole cell.
    fill(out, v, o, d, tEnter, enterAxis, 0, 0, 0, 0, 1, 1, 1, 1);
    return true;
  }
  let best = Infinity;
  let bestAxis = -1;
  let bi = -1;
  const b = sh.boxes;
  for (let k = 0; k < sh.boxCount; k++) {
    const q = k * 8;
    let tn = -Infinity;
    let tf = Infinity;
    let ax = -1;
    for (let i = 0; i < 4; i++) {
      const mn = cell[i]! + b[q + i]!;
      const mx = cell[i]! + b[q + 4 + i]!;
      const di = d[i]!;
      if (Math.abs(di) < 1e-12) {
        if (o[i]! < mn || o[i]! > mx) {
          tn = Infinity;
          break;
        }
        continue;
      }
      let t0 = (mn - o[i]!) / di;
      let t1 = (mx - o[i]!) / di;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t0 > tn) {
        tn = t0;
        ax = i;
      }
      tf = Math.min(tf, t1);
    }
    if (tn > tf || tf < tEnter || tn > tExit) continue;
    if (tn < tEnter + 1e-6) {
      tn = tEnter;
      ax = enterAxis;
    }
    if (tn < best) {
      best = tn;
      bestAxis = ax;
      bi = k;
    }
  }
  if (bi < 0) return false;
  const q = bi * 8;
  fill(out, v, o, d, best, bestAxis, b[q]!, b[q + 1]!, b[q + 2]!, b[q + 3]!, b[q + 4]!, b[q + 5]!, b[q + 6]!, b[q + 7]!);
  return true;
}

function fill(
  out: RayHit,
  v: number,
  o: ArrayLike<number>,
  d: ArrayLike<number>,
  t: number,
  axis: number,
  a0: number,
  a1: number,
  a2: number,
  a3: number,
  b0: number,
  b1: number,
  b2: number,
  b3: number,
): void {
  out.x = cell[0]!;
  out.y = cell[1]!;
  out.z = cell[2]!;
  out.w = cell[3]!;
  out.axis = axis;
  out.sign = d[axis]! > 0 ? -1 : 1;
  out.t = t;
  out.voxel = v;
  for (let i = 0; i < 4; i++) out.p[i] = o[i]! + d[i]! * t;
  out.bmin[0] = a0;
  out.bmin[1] = a1;
  out.bmin[2] = a2;
  out.bmin[3] = a3;
  out.bmax[0] = b0;
  out.bmax[1] = b1;
  out.bmax[2] = b2;
  out.bmax[3] = b3;
}
