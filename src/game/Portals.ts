// 4D portals (Phase 6).
//
// In 3D a Nether portal is a flat rectangle of portal blocks framed by obsidian, and you walk
// through it along the rectangle's normal. In 4D a wall is 3D, so a portal is a 3D box of
// portal cells that lies in one of the three "vertical hyperplanes" of 4D space: the one
// spanned by y and two of x, z, w. The remaining horizontal axis (x, z or w) is the portal's
// normal: the direction you walk through it. The frame is the box's boundary within its
// hyperplane: every face cell (outside the box along exactly one in-plane axis) must be
// obsidian or voidstone. Edge and corner cells are optional, like Minecraft's corners.
//
// The smallest portal has a 1 x 2 x 1 interior (horizontal, y, horizontal) and a 10-block frame,
// the same count as Minecraft's smallest frame. Interiors can be up to 12 cells along each axis.
//
// Travel scales x, z and w by the realms' coordinate scales (Surface 1, Ember Depths 8): a trip
// through the Ember Depths shortens horizontal distances 8x along all three horizontal axes.
// y is not scaled (it is clamped into the destination's height).

import type { RealmDef } from '../content/types';

export const PORTAL_MAX = 12;

export interface PortalBox {
  /** Normal axis: 0 (x), 2 (z) or 3 (w). */
  axis: number;
  /** Interior cells, inclusive; min[axis] === max[axis]. */
  min: [number, number, number, number];
  max: [number, number, number, number];
}

/** A lit portal the world knows about (saved in the world state for arrivals). */
export interface PortalRecord extends PortalBox {
  realm: string;
}

/** The two in-plane horizontal axes of a portal with normal `axis`, then y. */
export function planeAxes(axis: number): [number, number, number] {
  const h = [0, 2, 3].filter((a) => a !== axis) as [number, number];
  return [h[0], 1, h[1]];
}

/**
 * Find a valid portal frame whose interior contains the open cell (x, y, z, w). `open(v)` is
 * true for cells a portal can fill (air, fire); `frame(v)` for frame blocks. Tries the three
 * normal axes (x, z, w) and returns the first valid box, or null.
 */
export function findPortal(
  get: (x: number, y: number, z: number, w: number) => number,
  x: number,
  y: number,
  z: number,
  w: number,
  open: (v: number) => boolean,
  frame: (v: number) => boolean,
): PortalBox | null {
  if (!open(get(x, y, z, w))) return null;
  const p = [x, y, z, w];
  // From p, walk along axis `a` in direction `dir` over open cells; the first closed cell must
  // be a frame block. Returns the last open coordinate, or null.
  const extend = (a: number, dir: number): number | null => {
    const q = [...p];
    for (let n = 1; n <= PORTAL_MAX + 1; n++) {
      q[a] = p[a]! + dir * n;
      const v = get(q[0]!, q[1]!, q[2]!, q[3]!);
      if (!open(v)) return frame(v) ? p[a]! + dir * (n - 1) : null;
    }
    return null;
  };
  for (const axis of [0, 2, 3]) {
    const lo = [...p], hi = [...p];
    let ok = true;
    for (const a of planeAxes(axis)) {
      const l = extend(a, -1), h = extend(a, 1);
      if (l === null || h === null || h - l + 1 > PORTAL_MAX) {
        ok = false;
        break;
      }
      lo[a] = l;
      hi[a] = h;
    }
    if (!ok || hi[1]! - lo[1]! + 1 < 2) continue; // at least two tall
    const box: PortalBox = { axis, min: lo as PortalBox['min'], max: hi as PortalBox['max'] };
    if (validBox(get, box, open, frame)) return box;
  }
  return null;
}

/** Every interior cell open and every face cell a frame block. */
export function validBox(get: (x: number, y: number, z: number, w: number) => number, box: PortalBox, open: (v: number) => boolean, frame: (v: number) => boolean): boolean {
  for (const c of interiorCells(box)) if (!open(get(c[0]!, c[1]!, c[2]!, c[3]!))) return false;
  for (const c of frameCells(box)) if (!frame(get(c[0]!, c[1]!, c[2]!, c[3]!))) return false;
  return true;
}

export function* interiorCells(box: PortalBox): Generator<number[]> {
  const [a, b, c] = planeAxes(box.axis);
  const q = [...box.min];
  for (let i = box.min[a]; i <= box.max[a]; i++)
    for (let j = box.min[b]; j <= box.max[b]; j++)
      for (let k = box.min[c]; k <= box.max[c]; k++) {
        q[a] = i;
        q[b] = j;
        q[c] = k;
        yield [...q];
      }
}

/** Face cells of the frame: outside the interior along exactly one in-plane axis. */
export function* frameCells(box: PortalBox): Generator<number[]> {
  const axes = planeAxes(box.axis);
  const q = [...box.min];
  const lo = axes.map((a) => box.min[a]! - 1), hi = axes.map((a) => box.max[a]! + 1);
  for (let i = lo[0]!; i <= hi[0]!; i++)
    for (let j = lo[1]!; j <= hi[1]!; j++)
      for (let k = lo[2]!; k <= hi[2]!; k++) {
        const out = [i, j, k].filter((v, n) => v < lo[n]! + 1 || v > hi[n]! - 1).length;
        if (out !== 1) continue;
        q[axes[0]] = i;
        q[axes[1]] = j;
        q[axes[2]] = k;
        yield [...q];
      }
}

/** Centre of a portal box (where an arriving player stands). */
export function portalCenter(box: PortalBox): [number, number, number, number] {
  return [(box.min[0] + box.max[0] + 1) / 2, box.min[1], (box.min[2] + box.max[2] + 1) / 2, (box.min[3] + box.max[3] + 1) / 2];
}

/** Where a trip from realm `from` at `pos` arrives in realm `to` (x, z, w scaled; y clamped). */
export function scalePosition(pos: ArrayLike<number>, from: RealmDef, to: RealmDef): [number, number, number, number] {
  const k = from.coordinateScale / to.coordinateScale;
  const top = to.heightChunks * 16 - 12;
  return [pos[0]! * k, Math.max(8, Math.min(top, pos[1]!)), pos[2]! * k, pos[3]! * k];
}

/** The other end of the Surface <-> Ember Depths link. */
export function portalDestination(realm: string): string {
  return realm === 'surface' ? 'ember' : 'surface';
}
