// Shared helpers for structure builders.

import type { Builder, Orient } from '../Builder';
import { IF_AIR, IF_SOFT, REPLACE } from '../Plan';
import type { Start } from '../Placement';

export type BuilderFn = (b: Builder, st: Start) => void;

export { IF_AIR, IF_SOFT, REPLACE };

/**
 * Orientation of a sub-piece whose local axes are given in the parent's local terms:
 * [parent axis (0 a, 1 b, 2 c), sign] for the piece's a, b and c.
 */
export function subOrient(parent: Orient, a: [number, number], b: [number, number], c: [number, number]): Orient {
  const out: Orient = { axes: [0, 0, 0], signs: [1, 1, 1] };
  [a, b, c].forEach(([pa, s], k) => {
    out.axes[k] = parent.axes[pa]!;
    out.signs[k] = parent.signs[pa]! * s;
  });
  return out;
}

/** Fill a 4D ball (or a shell of thickness `shell`) around a local point. */
export function ball(b: Builder, a0: number, y0: number, b0: number, c0: number, r: number, v: number, shell = 0, mode = REPLACE, yMin = -Infinity): void {
  const R = Math.ceil(r);
  for (let c = -R; c <= R; c++)
    for (let bb = -R; bb <= R; bb++)
      for (let y = -R; y <= R; y++)
        for (let a = -R; a <= R; a++) {
          if (y < yMin) continue;
          const d = Math.sqrt(a * a + y * y + bb * bb + c * c);
          if (d > r || (shell > 0 && d < r - shell)) continue;
          b.set(a0 + a, y0 + y, b0 + bb, c0 + c, v, mode);
        }
}

/** A vertical column from y0 to y1 (inclusive). */
export function pillar(b: Builder, a: number, y0: number, bb: number, c: number, y1: number, v: number, mode = REPLACE): void {
  for (let y = y0; y <= y1; y++) b.set(a, y, bb, c, v, mode);
}

/** Pick an item of a weighted list [value, weight][] with the builder's RNG. */
export function weighted<T>(b: Builder, list: [T, number][]): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = b.rng.next() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r < 0) return v;
  }
  return list[list.length - 1]![0];
}
