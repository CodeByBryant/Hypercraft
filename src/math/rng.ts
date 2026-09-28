// Deterministic hashing and PRNG utilities. Everything in world generation must be
// derived from these (never Math.random) so that a seed always yields the same world.

/** 32-bit integer mix (murmur3 finalizer). */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash up to four integer coordinates plus a seed into a uint32. */
export function hash4(x: number, y: number, z: number, w: number, seed: number): number {
  let h = mix32(seed ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = mix32(h ^ Math.imul(y | 0, 0x165667b1));
  h = mix32(h ^ Math.imul(z | 0, 0xd3a2646c));
  h = mix32(h ^ Math.imul(w | 0, 0xfd7046c5));
  return h;
}

/** Hash to a float in [0, 1). */
export function hash4f(x: number, y: number, z: number, w: number, seed: number): number {
  return hash4(x, y, z, w, seed) / 4294967296;
}

/** Hash a string (e.g. a user-entered seed) to a uint32 (FNV-1a + mix). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Small fast deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** uint32 */
  nextU32(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** float in [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }
  /** integer in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
