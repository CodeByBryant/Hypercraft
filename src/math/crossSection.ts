// Cross-section of an axis-aligned 4D box (a tesseract cell or a sub-voxel box) with
// the view hyperplane {p : (p - origin) · n = 0}.
//
// The cross-section is a convex 3D polytope. Its edges are exactly the intersections
// of the hyperplane with the box's 24 two-dimensional faces (squares), so we clip the
// hyperplane against each square: every square contributes at most one segment.
// For an axis-aligned slice this yields a cube (12 edges); for an XW tilt a box of
// varying length; for a compound XW+ZW tilt a triangular/quad/pentagonal/hexagonal prism.

const FREE_PAIRS: ReadonlyArray<readonly [number, number, number, number]> = [
  // [freeA, freeB, fixedC, fixedD]
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
  [1, 2, 0, 3],
  [1, 3, 0, 2],
  [2, 3, 0, 1],
];

// Scratch (module-level so the hot path does not allocate).
const cornerF = new Float64Array(4);
const cornerP = new Float64Array(16);
const hitP = new Float64Array(16);

/**
 * Writes the polytope edges as segments (8 numbers per segment: x0 y0 z0 w0 x1 y1 z1 w1)
 * into `out` starting at segment index `start`. Returns the number of segments written.
 */
export function sliceBoxEdges(
  min: ArrayLike<number>,
  max: ArrayLike<number>,
  origin: ArrayLike<number>,
  n: ArrayLike<number>,
  out: Float32Array | Float64Array,
  start: number,
  maxSegments: number,
): number {
  let count = 0;
  for (let pi = 0; pi < 6; pi++) {
    const pair = FREE_PAIRS[pi]!;
    const a = pair[0], b = pair[1], c = pair[2], d = pair[3];
    for (let fc = 0; fc < 2; fc++) {
      for (let fd = 0; fd < 2; fd++) {
        if (start + count >= maxSegments) return count;
        // Four corners of the square, in cyclic order: (lo,lo) (hi,lo) (hi,hi) (lo,hi).
        for (let k = 0; k < 4; k++) {
          const ha = k === 1 || k === 2;
          const hb = k >= 2;
          const base = k * 4;
          cornerP[base + a] = ha ? max[a]! : min[a]!;
          cornerP[base + b] = hb ? max[b]! : min[b]!;
          cornerP[base + c] = fc ? max[c]! : min[c]!;
          cornerP[base + d] = fd ? max[d]! : min[d]!;
          let f = 0;
          for (let i = 0; i < 4; i++) f += (cornerP[base + i]! - origin[i]!) * n[i]!;
          cornerF[k] = f;
        }
        // Zero counts as positive so a face lying exactly in the plane is not emitted
        // twice (its edges come from the adjacent faces instead).
        let hits = 0;
        for (let k = 0; k < 4 && hits < 2; k++) {
          const k2 = (k + 1) & 3;
          const f1 = cornerF[k]!;
          const f2 = cornerF[k2]!;
          const neg1 = f1 < 0;
          const neg2 = f2 < 0;
          if (neg1 === neg2) continue;
          const t = f1 / (f1 - f2);
          const b1 = k * 4;
          const b2 = k2 * 4;
          for (let i = 0; i < 4; i++) {
            hitP[hits * 4 + i] = cornerP[b1 + i]! + (cornerP[b2 + i]! - cornerP[b1 + i]!) * t;
          }
          hits++;
        }
        if (hits === 2) {
          const o = (start + count) * 8;
          for (let i = 0; i < 8; i++) out[o + i] = hitP[i]!;
          count++;
        }
      }
    }
  }
  return count;
}

/** Test helper: unique vertex count of the polytope described by a segment list. */
export function uniqueVertices(segs: ArrayLike<number>, nSegs: number, eps = 1e-6): number[][] {
  const verts: number[][] = [];
  for (let s = 0; s < nSegs; s++) {
    for (let e = 0; e < 2; e++) {
      const p = [0, 1, 2, 3].map((i) => segs[s * 8 + e * 4 + i]!);
      if (!verts.some((v) => v.every((x, i) => Math.abs(x - p[i]!) < eps))) verts.push(p);
    }
  }
  return verts;
}

/**
 * The shader draws polytope edges analytically. For a hit on the facet with normal axis i,
 * inside the face polygon (facet ∩ hyperplane), the coordinate x_j (j ≠ i) changes at rate
 * g_j = |P_T e_j| = sqrt(max(0, 1 - h_j² / (1 - h_i²))) per unit of in-face distance, where
 * T is the face plane's tangent space. The in-face distance to the edge x_j = b is
 * |x_j - b| / g_j. g_j = 0 means x_j is constant over the face: no edge from that axis.
 * This mirrors `edgeRate` in raymarch.frag.glsl and is unit-tested against sliceBoxEdges.
 */
export function edgeRate(h: ArrayLike<number>, i: number, j: number): number {
  const hi2 = h[i]! * h[i]!;
  if (hi2 >= 1 - 1e-9) return 0;
  const v = 1 - (h[j]! * h[j]!) / (1 - hi2);
  return Math.sqrt(Math.max(0, v));
}
