// Where structures start: one attempt per grid cell (spacing³ in x, z, w), jittered inside
// the cell, then checked against the biome's structure list and the terrain (dry land, sea
// floor, beach, underground, beside an Ana Sheet). Deterministic from the world seed, and
// cached, since neighbouring columns ask about the same cells.

import { REG } from '../../../content/registry';
import { STRUCTURES } from '../../../content/structures';
import type { RealmDef, StructureDef } from '../../../content/types';
import { hash4 } from '../../../math/rng';
import type { ColumnSample } from '../SurfaceGen';
import { GARDEN } from '../SurfaceGen';

/**
 * What structure placement needs from a realm's generator: its seed and height, the sea level,
 * a terrain sample (floor height, biome, sea flag, cavern ceiling) and, on the Surface, Ana
 * Sheets and the test garden.
 */
export interface StructureTerrain {
  readonly seed: number;
  readonly height: number;
  readonly sea: number;
  readonly realm: RealmDef;
  garden: boolean;
  gardenOrigin: [number, number, number, number];
  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample;
  sheetAt?(x: number, z: number, w: number): { w: number; y: number } | null;
}

/** The structures of one realm. */
export const structuresOf = (realm: string): StructureDef[] => STRUCTURES.filter((s) => (s.realm ?? 'surface') === realm);

export interface Start {
  def: StructureDef;
  /** Start point (the builder's origin) in world coordinates. */
  x: number;
  y: number;
  z: number;
  w: number;
  /** Orientation index (0..47) and a per-structure seed. */
  orient: number;
  seed: number;
  /** Grid cell. */
  i: number;
  j: number;
  k: number;
}

export class StructurePlacer {
  readonly defs: StructureDef[];
  private readonly gen: StructureTerrain;
  private readonly seed: number;
  private readonly cache = new Map<string, Start | null>();
  private readonly s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };

  constructor(gen: StructureTerrain, defs: StructureDef[] = structuresOf(gen.realm.name)) {
    this.gen = gen;
    this.seed = gen.seed;
    this.defs = defs;
  }

  /** The start in one grid cell, or null. */
  startIn(def: StructureDef, i: number, j: number, k: number): Start | null {
    const key = `${def.salt},${i},${j},${k}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const st = this.compute(def, i, j, k);
    if (this.cache.size > 4096) this.cache.clear();
    this.cache.set(key, st);
    return st;
  }

  private compute(def: StructureDef, i: number, j: number, k: number): Start | null {
    const seed = this.seed;
    const h = hash4(i, j, k, def.salt, seed);
    if (h / 4294967296 >= def.chance) return null;
    const S = def.spacing;
    const margin = Math.min(def.radius + 2, Math.floor(S / 4));
    const span = Math.max(1, S - 2 * margin);
    let x = i * S + margin + (hash4(i, j, k, def.salt + 1, seed) % span);
    let z = j * S + margin + (hash4(i, j, k, def.salt + 2, seed) % span);
    let w = k * S + margin + (hash4(i, j, k, def.salt + 3, seed) % span);
    const g = this.gen;
    // Never over the engine test garden (test worlds).
    if (g.garden) {
      const o = g.gardenOrigin, r = def.radius + 12;
      if (x + r >= o[0] + GARDEN.x0 && x - r <= o[0] + GARDEN.x1 && z + r >= o[2] + GARDEN.z0 && z - r <= o[2] + GARDEN.z1 && w + r >= o[3] + GARDEN.w0 && w - r <= o[3] + GARDEN.w1) return null;
    }
    const s = g.sample(x, z, w, this.s);
    const biome = REG.biomes[s.biome];
    if (!biome?.structures?.includes(def.name)) return null;
    const sea = g.sea;
    let y: number;
    switch (def.placement) {
      case 'surface':
        if (s.ocean || s.river || s.height <= sea + 1) return null;
        y = s.height + 1;
        break;
      case 'beach':
        if (s.river || s.height < sea - 2 || s.height > sea + 2) return null;
        y = s.height + 1;
        break;
      case 'underwater':
        if (!s.ocean || s.height > sea - 5) return null;
        y = s.height + 1;
        break;
      case 'underground': {
        const [lo, hi] = def.y ?? [12, 40];
        y = lo + (hash4(i, j, k, def.salt + 4, seed) % Math.max(1, hi - lo + 1));
        if (y > s.height - 8) return null;
        break;
      }
      case 'sheet': {
        const sh = g.sheetAt?.(x, z, w);
        if (!sh || sh.y + 8 > s.height - 6) return null;
        w = Math.floor(sh.w) + 2;
        y = Math.floor(sh.y) - 1;
        break;
      }
      case 'lava':
        // On the lava sea (Ember Depths): the deck sits one above the lava surface.
        if (!s.ocean) return null;
        y = sea + 1;
        break;
      case 'cavern': {
        // Hanging in the open air of an enclosed realm, between floor and ceiling.
        const ceil = s.ceiling ?? g.height - 8;
        const room = ceil - Math.max(s.height, sea) - 14;
        if (room < 4) return null;
        y = Math.max(s.height, sea) + 6 + (hash4(i, j, k, def.salt + 4, seed) % room);
        break;
      }
      default:
        return null;
    }
    const orient = hash4(i, j, k, def.salt + 5, seed) % 48;
    x = Math.floor(x);
    z = Math.floor(z);
    return { def, x, y, z, w, orient, seed: hash4(i, j, k, def.salt + 6, seed), i, j, k };
  }

  /** Every start whose structure may reach the horizontal box [x0, x1] × [z0, z1] × [w0, w1]. */
  startsNear(def: StructureDef, x0: number, z0: number, w0: number, x1: number, z1: number, w1: number, out: Start[]): void {
    const S = def.spacing, r = def.radius;
    const i0 = Math.floor((x0 - r) / S), i1 = Math.floor((x1 + r) / S);
    const j0 = Math.floor((z0 - r) / S), j1 = Math.floor((z1 + r) / S);
    const k0 = Math.floor((w0 - r - 3) / S), k1 = Math.floor((w1 + r + 3) / S);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const st = this.startIn(def, i, j, k);
          if (!st) continue;
          if (st.x + r < x0 || st.x - r > x1 || st.z + r < z0 || st.z - r > z1 || st.w + r + 3 < w0 || st.w - r - 3 > w1) continue;
          out.push(st);
        }
  }

  /**
   * Nearest start of any of `names` to a point, searching grid shells outward up to
   * `maxDist` blocks (4D distance in x, z, w). Used by atlases and tests.
   */
  nearest(names: string[], x: number, z: number, w: number, maxDist = 1200): Start | null {
    let best: Start | null = null;
    let bestD = maxDist;
    for (const def of this.defs) {
      if (!names.includes(def.name)) continue;
      const S = def.spacing;
      const ci = Math.floor(x / S), cj = Math.floor(z / S), ck = Math.floor(w / S);
      const maxR = Math.ceil(maxDist / S) + 1;
      for (let r = 0; r <= maxR; r++) {
        // Cells whose nearest point is beyond the best found cannot win.
        if ((r - 1) * S > bestD) break;
        for (let dk = -r; dk <= r; dk++)
          for (let dj = -r; dj <= r; dj++)
            for (let di = -r; di <= r; di++) {
              if (Math.max(Math.abs(di), Math.abs(dj), Math.abs(dk)) !== r) continue;
              const st = this.startIn(def, ci + di, cj + dj, ck + dk);
              if (!st) continue;
              const d = Math.hypot(st.x - x, st.z - z, st.w - w);
              if (d < bestD) {
                bestD = d;
                best = st;
              }
            }
      }
    }
    return best;
  }
}
