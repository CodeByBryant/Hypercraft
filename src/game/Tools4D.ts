// Pure helpers for the 4D tools (Phase 7.7): which cells an Ana Pick breaks, what the
// Slicer Compass reads out. Kept out of Game so they are unit-tested.

/** The world axis (0 x, 2 z, 3 w; never `up`) closest to the hidden axis `H`. */
export function hiddenAxisIndex(H: ArrayLike<number>, up = 1): number {
  let best = -1, bv = -1;
  for (let k = 0; k < 4; k++) {
    if (k === up) continue;
    const v = Math.abs(H[k]!);
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

/**
 * The Ana Pick's sheet: the 8 cells around (x, y, z, w) in the plane of the up axis and the
 * world axis nearest the hidden axis (so it reaches into the slices kata and ana of yours).
 */
export function anaSheetCells(x: number, y: number, z: number, w: number, H: ArrayLike<number>, up = 1): [number, number, number, number][] {
  const h = hiddenAxisIndex(H, up);
  const out: [number, number, number, number][] = [];
  for (let du = -1; du <= 1; du++)
    for (let dv = -1; dv <= 1; dv++) {
      if (du === 0 && dv === 0) continue;
      const c: [number, number, number, number] = [x, y, z, w];
      c[up] = c[up]! + du;
      c[h] = c[h]! + dv;
      out.push(c);
    }
  return out;
}

const AXES = ['X', 'Y', 'Z', 'W'];

/** Slicer Compass text: the hidden axis, aligned or how far it is tilted, and toward what. */
export function slicerReadout(H: ArrayLike<number>, up = 1): string {
  const h = hiddenAxisIndex(H, up);
  const sgn = H[h]! >= 0 ? '+' : '−';
  const tilt = Math.round((Math.acos(Math.min(1, Math.abs(H[h]!))) * 180) / Math.PI);
  if (tilt <= 0) return `⟁ Hidden axis ${sgn}${AXES[h]} (aligned)  · use: snap`;
  // The axis it leans toward most.
  let o = -1, ov = -1;
  for (let k = 0; k < 4; k++) {
    if (k === h || k === up) continue;
    if (Math.abs(H[k]!) > ov) {
      ov = Math.abs(H[k]!);
      o = k;
    }
  }
  return `⟁ Hidden axis ${sgn}${AXES[h]}, tilted ${tilt}° toward ${H[o]! >= 0 ? '+' : '−'}${AXES[o]}  · use: snap`;
}
