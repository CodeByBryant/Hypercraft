// 4D portals (Phase 6).
//
// Two shapes of portal work, both framed with obsidian (or voidstone) and lit with flint and
// steel or a fire charge:
//
//  * Flat portals, exactly like Minecraft's: a rectangle of portal cells in the vertical plane
//    of y and one horizontal axis (x, z or w), framed within that plane (corners optional).
//    The interior is at least 2 wide and 3 tall, so the smallest frame is 10 blocks (14 with
//    corners). In 4D a rectangle has two normals, so you can walk into it along either of
//    the two other horizontal axes. This is the portal you build in your slice without
//    thinking about W.
//  * Hyper-portals: in 4D a wall is 3D, so the true analogue of a Nether portal is a 3D box of
//    portal cells in one of the three "vertical hyperplanes" (y plus two of x, z, w). The
//    remaining horizontal axis is its normal. Every face cell of the box's boundary within
//    the hyperplane (outside the box along exactly one in-plane axis) must be a frame block;
//    edge and corner cells are optional. The smallest is a 1 x 2 x 1 interior with a 10-block
//    frame. Hyper-portals need building kata/ana, so they are the 4D player's version.
//
// Interiors can be up to 12 cells along each framed axis.
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
  /**
   * Flat (Minecraft-style) portals only: the second normal axis. The box is one cell thick
   * along it and is not framed along it. Absent for hyper-portals.
   */
  thin?: number;
}

/** A lit portal the world knows about (saved in the world state for arrivals). */
export interface PortalRecord extends PortalBox {
  realm: string;
}

/** The shape of a portal without its position (what an arrival portal copies). */
export interface PortalShape {
  axis: number;
  thin?: number;
}

/** The two in-plane horizontal axes of a portal with normal `axis`, then y. */
export function planeAxes(axis: number): [number, number, number] {
  const h = [0, 2, 3].filter((a) => a !== axis) as [number, number];
  return [h[0], 1, h[1]];
}

/** The axes a portal's frame closes: its in-plane axes, minus a flat portal's thin axis. */
export function framedAxes(box: PortalShape): number[] {
  return planeAxes(box.axis).filter((a) => a !== box.thin);
}

/** The horizontal axis a flat portal is wide along (undefined for hyper-portals). */
export function widthAxis(box: PortalShape): number | undefined {
  return box.thin === undefined ? undefined : [0, 2, 3].find((a) => a !== box.axis && a !== box.thin);
}

/**
 * Find a valid portal whose interior contains the open cell (x, y, z, w). `open(v)` is true
 * for cells a portal can fill (air, fire); `frame(v)` for frame blocks. Tries hyper-portals
 * along the three normals (x, z, w), then flat portals in the three vertical planes, and
 * returns the first valid box, or null.
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
  const shapes: PortalShape[] = [{ axis: 0 }, { axis: 2 }, { axis: 3 }];
  // Flat portals: wide along x, z or w (the first remaining axis is the normal, the other thin).
  for (const width of [0, 2, 3]) {
    const [n, t] = [0, 2, 3].filter((a) => a !== width) as [number, number];
    shapes.push({ axis: n, thin: t });
  }
  for (const shape of shapes) {
    const lo = [...p], hi = [...p];
    let ok = true;
    for (const a of framedAxes(shape)) {
      const l = extend(a, -1), h = extend(a, 1);
      if (l === null || h === null || h - l + 1 > PORTAL_MAX) {
        ok = false;
        break;
      }
      lo[a] = l;
      hi[a] = h;
    }
    if (!ok) continue;
    const height = hi[1]! - lo[1]! + 1;
    if (shape.thin === undefined ? height < 2 : height < 3 || hi[widthAxis(shape)!]! - lo[widthAxis(shape)!]! + 1 < 2) continue;
    const box: PortalBox = { axis: shape.axis, min: lo as PortalBox['min'], max: hi as PortalBox['max'] };
    if (shape.thin !== undefined) box.thin = shape.thin;
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
  for (let x = box.min[0]; x <= box.max[0]; x++)
    for (let y = box.min[1]; y <= box.max[1]; y++)
      for (let z = box.min[2]; z <= box.max[2]; z++) for (let w = box.min[3]; w <= box.max[3]; w++) yield [x, y, z, w];
}

/**
 * Cells of the frame: face cells (outside the interior along exactly one framed axis), plus
 * edges and corners (outside along two or more) when `corners` is set.
 */
export function* frameCells(box: PortalBox, corners = false): Generator<number[]> {
  const axes = framedAxes(box);
  const lo = axes.map((a) => box.min[a]! - 1), hi = axes.map((a) => box.max[a]! + 1);
  const idx = [...lo];
  const q = [...box.min];
  for (;;) {
    let out = 0;
    for (let n = 0; n < axes.length; n++) if (idx[n] === lo[n] || idx[n] === hi[n]) out++;
    if (out === 1 || (corners && out > 1)) {
      for (let n = 0; n < axes.length; n++) q[axes[n]!] = idx[n]!;
      yield [...q];
    }
    // Odometer, last axis fastest.
    let n = axes.length - 1;
    while (n >= 0 && idx[n] === hi[n]) {
      idx[n] = lo[n]!;
      n--;
    }
    if (n < 0) return;
    idx[n]!++;
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
