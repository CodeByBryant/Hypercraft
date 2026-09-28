// Minimal allocation-free 4D vector helpers. Vectors are Float64Array(4) on the
// CPU side; axis order is always [x, y, z, w].

export type Vec4 = Float64Array;

export const AXIS_NAMES = ['x', 'y', 'z', 'w'] as const;
export const AXIS_X = 0;
export const AXIS_Y = 1;
export const AXIS_Z = 2;
export const AXIS_W = 3;

export function vec4(x = 0, y = 0, z = 0, w = 0): Vec4 {
  const v = new Float64Array(4);
  v[0] = x;
  v[1] = y;
  v[2] = z;
  v[3] = w;
  return v;
}

export function set4(out: Vec4, x: number, y: number, z: number, w: number): Vec4 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function copy4(out: Vec4, a: ArrayLike<number>): Vec4 {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  out[3] = a[3]!;
  return out;
}

export function dot4(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!;
}

export function len4(a: ArrayLike<number>): number {
  return Math.sqrt(dot4(a, a));
}

/** Normalises in place; returns the original length. */
export function normalize4(a: Vec4): number {
  const l = len4(a);
  if (l > 1e-12) {
    const s = 1 / l;
    a[0] = a[0]! * s;
    a[1] = a[1]! * s;
    a[2] = a[2]! * s;
    a[3] = a[3]! * s;
  }
  return l;
}

/** out = a + b * s */
export function scaleAdd4(out: Vec4, a: ArrayLike<number>, b: ArrayLike<number>, s: number): Vec4 {
  out[0] = a[0]! + b[0]! * s;
  out[1] = a[1]! + b[1]! * s;
  out[2] = a[2]! + b[2]! * s;
  out[3] = a[3]! + b[3]! * s;
  return out;
}

/** out = a - b */
export function sub4(out: Vec4, a: ArrayLike<number>, b: ArrayLike<number>): Vec4 {
  out[0] = a[0]! - b[0]!;
  out[1] = a[1]! - b[1]!;
  out[2] = a[2]! - b[2]!;
  out[3] = a[3]! - b[3]!;
  return out;
}

/** Determinant of the 4x4 matrix whose columns are a, b, c, d. */
export function det4(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, d: ArrayLike<number>): number {
  // Laplace expansion via 2x2 minors of the first two columns.
  const s0 = a[0]! * b[1]! - a[1]! * b[0]!;
  const s1 = a[0]! * b[2]! - a[2]! * b[0]!;
  const s2 = a[0]! * b[3]! - a[3]! * b[0]!;
  const s3 = a[1]! * b[2]! - a[2]! * b[1]!;
  const s4 = a[1]! * b[3]! - a[3]! * b[1]!;
  const s5 = a[2]! * b[3]! - a[3]! * b[2]!;
  const c5 = c[2]! * d[3]! - c[3]! * d[2]!;
  const c4 = c[1]! * d[3]! - c[3]! * d[1]!;
  const c3 = c[1]! * d[2]! - c[2]! * d[1]!;
  const c2 = c[0]! * d[3]! - c[3]! * d[0]!;
  const c1 = c[0]! * d[2]! - c[2]! * d[0]!;
  const c0 = c[0]! * d[1]! - c[1]! * d[0]!;
  return s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
}

/** Index of the component with the largest magnitude. */
export function dominantAxis(a: ArrayLike<number>): number {
  let best = 0;
  let bv = Math.abs(a[0]!);
  for (let i = 1; i < 4; i++) {
    const v = Math.abs(a[i]!);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}
