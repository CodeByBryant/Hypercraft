// The Crystal Abyss generator (Phase 9). Deterministic from the seed; runs in workers.
//
// An enclosed realm 128 tall: bedrock at both ends, a dark water line at y 24, and between them a
// geode world of caverns lit only by what grows in them.
//
//  1. A lattice every 4 blocks along x, y, z and w holds two values: a DENSITY (solid where
//     positive: big chambers where a slow noise is high, tunnels where two noises are both near
//     zero, so they are curves in a slice) and a WALL MASK. Density is interpolated to every cell.
//  2. Blocks: the floor of every mass takes its biome's surface over its subsurface, the underside
//     its crust (with prism ore showing in it), rock inside, abyss rock deep down. Air at or under
//     the water line is water; floors under it are the Echo Lakes' own.
//  3. Shifting crystal walls: inside the wall mask, thin slabs of translucent crystal cut the
//     caverns along planes whose normals lean into W, so as you step kata and ana the wall slides
//     past you sideways: in one slice it stands in front of you, in the next beside you.
//  4. Hyper-geodes: hollow 4-balls (radius 8 to 14) on a 64-block lattice, a husk and calcite
//     layer around a glowing lining, resonance clusters budding inside and prism crystals at the
//     heart. In a slice the hollow breathes as you move along W (the cross-section of a ball).
//  5. Crystal pillars in the Prism Forest, plants on the floors and under the overhangs.
//  6. Structures.
//
// The biome is picked per (x, z, w) column from two slow noises (five land biomes), and is the Echo
// Lakes wherever you are under the water line. `sample()` answers from the density alone (walls and
// geodes are features, like trees: they do not move the floor the way structures see it).

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { B, REG, hexToRgb } from '../../content/registry';
import { ABYSS_STYLE } from '../../content/abyss';
import type { RealmDef } from '../../content/types';
import { COLUMN_LAYER } from '../constants';
import type { ColumnSample, GenOptions } from './SurfaceGen';
import { StructureGen, type GenExtra } from './structures/StructureGen';

const SALT_BEDROCK = 0xa0b1;
const SALT_ORE = 0xa1c2;
const SALT_PLANT = 0xa2d3;
const SALT_PILLAR = 0xa3e4;
const SALT_GEODE = 0xa4f5;
const SALT_CLUSTER = 0xa506;

/** Lattice spacing, and the width of the padded lattice of one column (5 points each way). */
const S = 4;
const NL = 16 / S + 1;
const CACHE_MAX = 8192;
const GEODE_CELL = 64;

/** Wall planes: normals leaning into W (and x, z), their spacing, and the half-thickness (as a fraction of it). */
const WALLS: { n: [number, number, number, number]; spacing: number; half: number; off: number }[] = (
  [
    { n: [0.62, 0.25, 0.18, 0.72], spacing: 19, half: 0.05, off: 0.13 },
    { n: [0.2, 0.3, 0.84, -0.42], spacing: 23, half: 0.045, off: 0.41 },
    { n: [-0.55, 0.15, 0.35, 0.74], spacing: 27, half: 0.04, off: 0.77 },
  ] as const
).map((w) => {
  const l = Math.hypot(...w.n);
  return { ...w, n: w.n.map((v) => v / l) as [number, number, number, number] };
});
/** Wall mask above which walls may stand. */
const WALL_MASK = 0.45;
/** Chambers open where the slow noise exceeds -CHAMBER (tuned: about 40% of the realm is air). */
const CHAMBER = 0;

interface AB {
  index: number;
  name: string;
  surface: number;
  sub: number;
  under: number;
  stone: number;
  ceil: number;
  rgb: [number, number, number];
  plants: { id: number; density: number; under: boolean }[];
  hanging: { id: number; density: number }[];
  pillars: number;
}

export class AbyssGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  readonly options: GenOptions;
  garden = false;
  gardenOrigin: [number, number, number, number] = [0, 0, 0, 0];
  /** Every Abyss biome by name, the five land biomes in climate order, and the lake. */
  readonly byName = new Map<string, AB>();
  private readonly lakeB: AB;
  private readonly forest: AB;
  private readonly hollows: AB;
  private readonly caverns: AB;
  private readonly grotto: AB;
  private readonly barrens: AB;
  private readonly nBig: SimplexNoise;
  private readonly nTunA: SimplexNoise;
  private readonly nTunB: SimplexNoise;
  private readonly nMask: SimplexNoise;
  private readonly nT: SimplexNoise;
  private readonly nH: SimplexNoise;
  private readonly LY: number;
  /** Lattice columns [density x LY, wall mask x LY] keyed by lattice (x, z, w). */
  private readonly cache = new Map<string, Float32Array>();
  private readonly grid: Float32Array[] = new Array(NL * NL * NL);
  // Scratch (generate() is not re-entrant; each worker owns one generator).
  private readonly colD: Float32Array;
  private readonly colM: Float32Array;
  private readonly solid: Uint8Array;
  private readonly corners: Float32Array[] = new Array(8);

  constructor(seed: number, realm: RealmDef, options: GenOptions = {}) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.options = options;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    const s = this.seed;
    this.nBig = new SimplexNoise(s ^ 0xab01);
    this.nTunA = new SimplexNoise(s ^ 0xab02);
    this.nTunB = new SimplexNoise(s ^ 0xab03);
    this.nMask = new SimplexNoise(s ^ 0xab04);
    this.nT = new SimplexNoise(s ^ 0xab05);
    this.nH = new SimplexNoise(s ^ 0xab06);
    const id = (n: string) => REG.id(n);
    REG.biomes.forEach((def, index) => {
      if (def.realm !== realm.name) return;
      const style = ABYSS_STYLE[def.name]!;
      this.byName.set(def.name, {
        index,
        name: def.name,
        surface: id(def.surface),
        sub: id(def.subsurface),
        under: id(def.underwater),
        stone: id(def.stone!),
        ceil: id(def.ceiling!),
        rgb: hexToRgb(def.grassColor) as [number, number, number],
        plants: def.plants.map((p) => ({ id: id(p.block), density: p.density, under: p.placement === 'underwater' })),
        hanging: style.hanging.map(([n, d]) => ({ id: id(n), density: d })),
        pillars: style.pillars,
      });
    });
    const get = (n: string): AB => {
      const b = this.byName.get(n);
      if (!b) throw new Error(`realm "${realm.name}": missing biome "${n}"`);
      return b;
    };
    this.lakeB = get('echo_lakes');
    this.forest = get('prism_forest');
    this.hollows = get('geode_hollows');
    this.caverns = get('resonance_caverns');
    this.grotto = get('lumen_grotto');
    this.barrens = get('shard_barrens');
    this.LY = this.height / S + 1;
    this.colD = new Float32Array(this.LY);
    this.colM = new Float32Array(this.LY);
    this.solid = new Uint8Array(this.height + 1);
  }

  // ------------------------------------------------------------------ the lattice

  /** Density at a lattice point: positive is rock. */
  private density(X: number, Y: number, Z: number, W: number): number {
    const big = this.nBig.fbm4(X / 62, Y / 34, Z / 62, W / 62, 2);
    const ta = this.nTunA.n4(X / 38, Y / 26, Z / 38, W / 38);
    const tb = this.nTunB.n4(X / 38 + 31, Y / 26, Z / 38 + 17, W / 38 + 9);
    const chamber = CHAMBER - big;
    const tunnel = Math.max(Math.abs(ta) - 0.09, Math.abs(tb) - 0.11) * 4;
    let d = Math.min(chamber, tunnel);
    const H = this.height;
    // Solid at the very bottom and top (under the bedrock), and a little more rock under the lakes.
    if (Y < 14) d += (14 - Y) * 0.08;
    if (Y > H - 16) d += (Y - (H - 16)) * 0.08;
    return d;
  }

  private lattice(lx: number, lz: number, lw: number): Float32Array {
    const key = `${lx},${lz},${lw}`;
    let c = this.cache.get(key);
    if (c) return c;
    const LY = this.LY;
    c = new Float32Array(2 * LY);
    const X = lx * S, Z = lz * S, W = lw * S;
    for (let k = 0; k < LY; k++) {
      const Y = k * S;
      c[k] = this.density(X, Y, Z, W);
      c[LY + k] = this.nMask.n4(X / 70 + 13, Y / 50, Z / 70, W / 70);
    }
    if (this.cache.size >= CACHE_MAX) {
      let n = CACHE_MAX >> 2;
      for (const k of this.cache.keys()) {
        this.cache.delete(k);
        if (--n <= 0) break;
      }
    }
    this.cache.set(key, c);
    return c;
  }

  /** Interpolate the 8 surrounding lattice columns to the column at fractions (fx, fz, fw). */
  private interpolate(fx: number, fz: number, fw: number): void {
    const c = this.corners, LY = this.LY, D = this.colD, M = this.colM;
    const gx0 = 1 - fx, gz0 = 1 - fz, gw0 = 1 - fw;
    const w0 = gx0 * gz0 * gw0, w1 = fx * gz0 * gw0, w2 = gx0 * fz * gw0, w3 = fx * fz * gw0;
    const w4 = gx0 * gz0 * fw, w5 = fx * gz0 * fw, w6 = gx0 * fz * fw, w7 = fx * fz * fw;
    const a = c[0]!, b = c[1]!, cc = c[2]!, d = c[3]!, e = c[4]!, f = c[5]!, g = c[6]!, h = c[7]!;
    for (let k = 0; k < LY; k++) {
      D[k] = a[k]! * w0 + b[k]! * w1 + cc[k]! * w2 + d[k]! * w3 + e[k]! * w4 + f[k]! * w5 + g[k]! * w6 + h[k]! * w7;
      const j = LY + k;
      M[k] = a[j]! * w0 + b[j]! * w1 + cc[j]! * w2 + d[j]! * w3 + e[j]! * w4 + f[j]! * w5 + g[j]! * w6 + h[j]! * w7;
    }
  }

  /** Fill `solid` from the interpolated density (bedrock bands included). */
  private solidFromDensity(): void {
    const D = this.colD, sol = this.solid, H = this.height;
    for (let y = 0; y < H; y++) {
      const k = y >> 2, f = (y & 3) * 0.25;
      sol[y] = y <= 2 || y >= H - 3 || D[k]! * (1 - f) + D[k + 1]! * f > 0 ? 1 : 0;
    }
    sol[H] = 1;
  }

  /** The density column at any (x, z, w), from the lattice cache (for the single-point answers). */
  private column(X: number, Z: number, W: number): void {
    const lx = X >> 2, lz = Z >> 2, lw = W >> 2;
    const c = this.corners;
    for (let k = 0; k < 8; k++) c[k] = this.lattice(lx + (k & 1), lz + ((k >> 1) & 1), lw + ((k >> 2) & 1));
    this.interpolate((X & 3) * 0.25, (Z & 3) * 0.25, (W & 3) * 0.25);
    this.solidFromDensity();
  }

  // ------------------------------------------------------------------ biomes

  /** The land biome of a column. */
  private landAt(X: number, Z: number, W: number): AB {
    const t = this.nT.n3(X / 190, Z / 190, W / 190);
    const h = this.nH.n3(X / 170 + 40, Z / 170, W / 170);
    if (t < -0.13) return h < 0 ? this.barrens : this.grotto;
    if (t > 0.13) return h < 0 ? this.caverns : this.forest;
    return this.hollows;
  }

  biomeAt3(x: number, y: number, z: number, w: number): number {
    return this.biomeOf(Math.floor(x), Math.floor(y), Math.floor(z), Math.floor(w)).index;
  }

  private biomeOf(X: number, Y: number, Z: number, W: number): AB {
    return Y < this.sea ? this.lakeB : this.landAt(X, Z, W);
  }

  /** Enclosed realm: the "cave" biome is the 3D biome wherever you are. */
  caveBiomeAt(x: number, y: number, z: number, w: number): number {
    return this.biomeAt3(x, y, z, w);
  }

  // ------------------------------------------------------------------ walls

  /** Is the cell part of a shifting crystal wall (given the interpolated mask there)? */
  private wall(X: number, Y: number, Z: number, W: number, mask: number): boolean {
    if (mask < WALL_MASK) return false;
    for (const p of WALLS) {
      const s = (p.n[0] * X + p.n[1] * Y + p.n[2] * Z + p.n[3] * W) / p.spacing + p.off;
      if (Math.abs(s - Math.round(s)) < p.half) return true;
    }
    return false;
  }

  /** Is this cell a crystal wall (a feature; for the spawn point and the tests)? */
  wallAt(x: number, y: number, z: number, w: number): boolean {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), W = Math.floor(w);
    if (Y <= this.sea) return false;
    this.column(X, Z, W);
    const k = Y >> 2, f = (Y & 3) * 0.25;
    return this.wall(X, Y, Z, W, this.colM[k]! * (1 - f) + this.colM[k + 1]! * f);
  }

  // ------------------------------------------------------------------ terrain answers

  /** The floor of the current solid column: the top of the first mass above the water line, or the lakebed. */
  private floorOf(): { floor: number; ocean: boolean } {
    const sol = this.solid, H = this.height, sea = this.sea;
    let y = sea + 1;
    if (sol[y]) {
      while (y < H - 6 && sol[y]) y++;
      return { floor: y - 1, ocean: false };
    }
    let f = sea;
    while (f > 1 && !sol[f]) f--;
    // A floor at the water line itself is a dry shore (water fills only the air at or below it).
    return { floor: f, ocean: f < sea };
  }

  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.column(X, Z, W);
    const { floor, ocean } = this.floorOf();
    const sol = this.solid;
    let ceil = floor + 1;
    while (ceil < this.height - 1 && !sol[ceil]) ceil++;
    const b = this.biomeOf(X, floor + 1, Z, W);
    out.height = floor;
    out.biome = b.index;
    out.ocean = ocean;
    out.river = false;
    out.ceiling = ceil;
    out.grass = b.rgb;
    return out;
  }

  /** Every surface you can stand on in a column, with its biome and head room (low to high). */
  surfaces(x: number, z: number, w: number): { y: number; biome: number; room: number }[] {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.column(X, Z, W);
    const out: { y: number; biome: number; room: number }[] = [];
    const sol = this.solid;
    for (let y = this.sea; y < this.height - 6; y++) {
      if (!sol[y] || sol[y + 1] || sol[y + 2]) continue;
      let room = 1;
      while (y + room < this.height && !sol[y + room]) room++;
      out.push({ y, biome: this.biomeOf(X, y + 1, Z, W).index, room: room - 1 });
    }
    return out;
  }

  /** A dry floor near the origin with head room and no crystal wall within reach. */
  spawnPoint(): [number, number, number, number] {
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let r = 0; r < 2000; r += 8)
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(t) * r), w = Math.round(Math.sin(t) * r), z = (a * 7) % 5;
        this.sample(x, z, w, s);
        if (s.ocean || s.height < this.sea + 2 || (s.ceiling ?? 0) - s.height < 8) continue;
        let clear = true;
        for (const [dx, dz, dw] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as number[][])
          for (let dy = 1; dy <= 3 && clear; dy++) if (this.wallAt(x + dx!, s.height + dy, z + dz!, w + dw!)) clear = false;
        if (clear) return [x + 0.5, s.height + 1, z + 0.5, w + 0.5];
        if (r === 0) break;
      }
    return [0.5, this.sea + 20, 0.5, 0.5];
  }

  // ------------------------------------------------------------------ structures

  private structGen: StructureGen | null = null;
  get structures(): StructureGen {
    return (this.structGen ??= new StructureGen(this));
  }

  nearestStructure(names: string[], x: number, z: number, w: number, maxDist = 1200): { name: string; x: number; y: number; z: number; w: number } | null {
    const st = this.structures.placer.nearest(names, x, z, w, maxDist);
    return st ? { name: st.def.name, x: st.x, y: st.y, z: st.z, w: st.w } : null;
  }

  // ------------------------------------------------------------------ generate

  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array, extra?: GenExtra): void {
    const H = this.height, sea = this.sea, L = COLUMN_LAYER, seed = this.seed;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    blocks.fill(0);
    const BEDROCK = B.bedrock, WATER = B.water;
    const ROCK = REG.id('abyss_rock'), WALL = REG.id('shifting_crystal'), ORE = REG.id('prism_ore');

    // 1. The lattice of this column (5 x 5 x 5 columns of values).
    const grid = this.grid;
    for (let lw = 0; lw < NL; lw++) for (let lz = 0; lz < NL; lz++) for (let lx = 0; lx < NL; lx++) grid[lx + NL * (lz + NL * lw)] = this.lattice(cx * 4 + lx, cz * 4 + lz, cw * 4 + lw);

    // 2. Fill: density, then blocks top-down.
    const sol = this.solid, M = this.colM, c = this.corners;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const ix = x >> 2, iz = z >> 2, iw = w >> 2;
          for (let k = 0; k < 8; k++) c[k] = grid[ix + (k & 1) + NL * (iz + ((k >> 1) & 1) + NL * (iw + ((k >> 2) & 1)))]!;
          this.interpolate((x & 3) * 0.25, (z & 3) * 0.25, (w & 3) * 0.25);
          this.solidFromDensity();
          const land = this.landAt(X, Z, W);
          // The column's biome on the map: where you would stand on its floor.
          const fl = this.floorOf();
          const main = fl.ocean ? this.lakeB : land;
          surface[i * 4] = Math.round(main.rgb[0] * 255);
          surface[i * 4 + 1] = Math.round(main.rgb[1] * 255);
          surface[i * 4 + 2] = Math.round(main.rgb[2] * 255);
          surface[i * 4 + 3] = main.index;
          let depth = -1;
          for (let y = H - 1; y >= 0; y--) {
            let v: number;
            if (y === 0 || y >= H - 1) v = BEDROCK;
            else if (y <= 3 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - y * 0.15) v = BEDROCK;
            else if (y >= H - 5 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - (H - 1 - y) * 0.15) v = BEDROCK;
            else if (sol[y]) {
              depth = depth < 0 ? 0 : depth + 1;
              const eb = y < sea ? this.lakeB : land;
              if (depth === 0) v = eb.surface;
              else if (!sol[y - 1] && y > sea) v = hash4f(X, y, Z, W, seed ^ SALT_ORE) < 0.014 ? ORE : eb.ceil; // the underside of a mass
              else if (depth <= 3) v = eb.sub;
              else if (depth <= 12) v = eb.stone;
              else v = ROCK;
              // Prism crystal buried in the deep rock.
              if (depth > 4 && y > 8 && hash4f(X, y, Z, W, seed ^ SALT_ORE) > 0.9985) v = ORE;
            } else {
              depth = -1;
              if (y <= sea) v = WATER;
              else {
                // Shifting crystal walls cut the open air.
                const k = y >> 2, f = (y & 3) * 0.25;
                v = this.wall(X, y, Z, W, M[k]! * (1 - f) + M[k + 1]! * f) ? WALL : 0;
              }
            }
            blocks[i + y * L] = v;
          }
        }

    // 3. Hyper-geodes (they overwrite what they cross).
    this.geodes(X0, Z0, W0, blocks);

    // 4. Pillars, plants on every floor, growth under every overhang.
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const land = this.landAt(X, Z, W);
          for (let y = 4; y < H - 6; y++) {
            const cur = blocks[i + y * L]!;
            const above = blocks[i + (y + 1) * L]!;
            if (cur === 0 && y > sea + 2) {
              // Under an overhang?
              const roof = blocks[i + (y + 1) * L]!;
              if (roof === 0 || !REG.solid[roof & 0xfff] || land.hanging.length === 0) continue;
              const pr = hash4f(X, y + 5, Z, W, seed ^ SALT_PLANT);
              let acc = 0;
              for (const pl of land.hanging) {
                acc += pl.density;
                if (pr >= acc) continue;
                const len = 1 + (hash4(X, y, Z, W, seed ^ SALT_PLANT) % 4);
                for (let k = 0; k < len && y - k > sea + 1 && blocks[i + (y - k) * L] === 0; k++) blocks[i + (y - k) * L] = pl.id;
                break;
              }
              continue;
            }
            if (cur === 0 || !REG.solid[cur & 0xfff]) continue;
            // A floor: land above the water line (air above), or a lakebed (water above).
            if (y >= sea && above === 0) {
              if (cur !== land.surface) continue;
              if (land.pillars > 0 && hash4f(X, y, Z, W, seed ^ SALT_PILLAR) < land.pillars / 1000) {
                const h = 4 + (hash4(X, y, Z, W, seed ^ SALT_PILLAR) % 7);
                const glass = REG.id('prism_glass');
                for (let k = 1; k <= h && blocks[i + (y + k) * L] === 0; k++) blocks[i + (y + k) * L] = glass;
                continue;
              }
              const pr = hash4f(X, y + 2, Z, W, seed ^ SALT_PLANT);
              let acc = 0;
              for (const pl of land.plants) {
                if (pl.under) continue;
                acc += pl.density;
                if (pr >= acc) continue;
                blocks[i + (y + 1) * L] = pl.id;
                break;
              }
            } else if (y < sea && above === WATER && cur === this.lakeB.surface) {
              const pr = hash4f(X, y + 2, Z, W, seed ^ SALT_PLANT);
              let acc = 0;
              for (const pl of this.lakeB.plants) {
                acc += pl.density;
                if (pr >= acc) continue;
                blocks[i + (y + 1) * L] = pl.id;
                break;
              }
            }
          }
        }

    // 5. Structures.
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});
  }

  // ------------------------------------------------------------------ hyper-geodes

  /** The hyper-geode of lattice cell (gx, gz, gw), or null: its centre and radius. */
  geodeOf(gx: number, gz: number, gw: number): { x: number; y: number; z: number; w: number; r: number } | null {
    const s = this.seed ^ SALT_GEODE;
    if (hash4f(gx, 0, gz, gw, s) > 0.5) return null;
    const H = this.height;
    const r = 8 + hash4f(gx, 5, gz, gw, s) * 6;
    return {
      x: gx * GEODE_CELL + 16 + hash4f(gx, 1, gz, gw, s) * (GEODE_CELL - 32),
      y: Math.max(r + 8, Math.min(H - r - 8, 28 + hash4f(gx, 2, gz, gw, s) * (H - 56))),
      z: gz * GEODE_CELL + 16 + hash4f(gx, 3, gz, gw, s) * (GEODE_CELL - 32),
      w: gw * GEODE_CELL + 16 + hash4f(gx, 4, gz, gw, s) * (GEODE_CELL - 32),
      r,
    };
  }

  private geodes(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const L = COLUMN_LAYER, H = this.height, seed = this.seed;
    const gx0 = Math.floor(X0 / GEODE_CELL), gz0 = Math.floor(Z0 / GEODE_CELL), gw0 = Math.floor(W0 / GEODE_CELL);
    const HUSK = REG.id('geode_husk'), CALC = REG.id('calcite_layer'), LINING = REG.id('geode_lining'), ORE = REG.id('prism_ore'), CLUSTER = REG.id('resonance_cluster');
    for (let gw = gw0 - 1; gw <= gw0 + 1; gw++)
      for (let gz = gz0 - 1; gz <= gz0 + 1; gz++)
        for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
          const g = this.geodeOf(gx, gz, gw);
          if (!g) continue;
          const r = g.r;
          const dx = Math.max(X0 - g.x, 0, g.x - (X0 + 15)), dz = Math.max(Z0 - g.z, 0, g.z - (Z0 + 15)), dw = Math.max(W0 - g.w, 0, g.w - (W0 + 15));
          if (dx * dx + dz * dz + dw * dw > (r + 1) * (r + 1)) continue;
          const xa = Math.max(X0, Math.floor(g.x - r)), xb = Math.min(X0 + 15, Math.ceil(g.x + r));
          const za = Math.max(Z0, Math.floor(g.z - r)), zb = Math.min(Z0 + 15, Math.ceil(g.z + r));
          const wa = Math.max(W0, Math.floor(g.w - r)), wb = Math.min(W0 + 15, Math.ceil(g.w + r));
          const ya = Math.max(5, Math.floor(g.y - r)), yb = Math.min(H - 6, Math.ceil(g.y + r));
          for (let W = wa; W <= wb; W++)
            for (let Z = za; Z <= zb; Z++)
              for (let X = xa; X <= xb; X++) {
                const i = X - X0 + ((Z - Z0) << 4) + ((W - W0) << 8);
                for (let Y = ya; Y <= yb; Y++) {
                  const d = Math.hypot(X + 0.5 - g.x, Y + 0.5 - g.y, Z + 0.5 - g.z, W + 0.5 - g.w);
                  if (d > r) continue;
                  let v: number;
                  if (d > r - 1) v = HUSK;
                  else if (d > r - 2) v = CALC;
                  else if (d > r - 3) v = hash4f(X, Y, Z, W, seed ^ SALT_ORE) < 0.07 ? ORE : LINING;
                  else if (d < 1.6) v = ORE; // the geode's heart
                  else v = d > r - 4.4 && hash4f(X, Y, Z, W, seed ^ SALT_CLUSTER) < 0.05 ? CLUSTER : 0;
                  blocks[i + Y * L] = v;
                }
              }
        }
  }
}
