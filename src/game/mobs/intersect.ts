// Ray vs mob primitives in 4D (CPU twin of the shader code in raymarch.frag.glsl, used for
// attack picking). All functions take the ray in the mob's local frame.

/** Ray vs 4-ball. Returns the entry distance or Infinity. */
export function rayBall(o: ArrayLike<number>, d: ArrayLike<number>, c: ArrayLike<number>, r: number): number {
  let b = 0, cc = 0, dd = 0;
  for (let i = 0; i < 4; i++) {
    const oc = o[i]! - c[i]!;
    b += oc * d[i]!;
    cc += oc * oc;
    dd += d[i]! * d[i]!;
  }
  cc -= r * r;
  const disc = b * b - dd * cc;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / dd;
  if (t0 >= 0) return t0;
  const t1 = (-b + s) / dd;
  return t1 >= 0 ? 0 : Infinity;
}

/** Ray vs axis-aligned 4D box (centre c, half extents h). */
export function rayBox(o: ArrayLike<number>, d: ArrayLike<number>, c: ArrayLike<number>, h: ArrayLike<number>): number {
  let tn = -Infinity, tf = Infinity;
  for (let i = 0; i < 4; i++) {
    const lo = c[i]! - h[i]!, hi = c[i]! + h[i]!;
    const di = d[i]!;
    if (Math.abs(di) < 1e-12) {
      if (o[i]! < lo || o[i]! > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o[i]!) / di, t2 = (hi - o[i]!) / di;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tn) tn = t1;
    if (t2 < tf) tf = t2;
    if (tn > tf) return Infinity;
  }
  if (tf < 0) return Infinity;
  return Math.max(0, tn);
}

/** Ray vs capsule (segment a-b, radius r) in 4D. */
export function rayCapsule(o: ArrayLike<number>, d: ArrayLike<number>, a: ArrayLike<number>, b: ArrayLike<number>, r: number): number {
  // Closest approach between the ray and the segment, refined with the two end balls.
  let best = Math.min(rayBall(o, d, a, r), rayBall(o, d, b, r));
  let baba = 0, bard = 0, baoa = 0, rdoa = 0, oaoa = 0, rdrd = 0;
  for (let i = 0; i < 4; i++) {
    const ba = b[i]! - a[i]!, oa = o[i]! - a[i]!;
    baba += ba * ba;
    bard += ba * d[i]!;
    baoa += ba * oa;
    rdoa += d[i]! * oa;
    oaoa += oa * oa;
    rdrd += d[i]! * d[i]!;
  }
  const A = baba * rdrd - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-12) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (t >= 0 && y > 0 && y < baba) best = Math.min(best, t);
  }
  return best;
}
