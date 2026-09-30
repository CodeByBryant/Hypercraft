// Ember Depths generator (Phase 6). Deterministic from the seed; runs in workers.
//
// An enclosed realm: bedrock at the bottom and top, a lava sea at y 32, and one huge cavern
// between a floor surface and a ceiling surface. Both surfaces are 3D noise over (x, z, w), so
// walking kata/ana changes the land like walking in x or z does.
//
//  1. Climate: heat, vapour and soul (3D noise) pick the biome; a "sea" field makes the Magma
//     Sea. Each biome style has its own floor shape, blended across biome borders:
//       plains     gentle hills           prisms   columnar basalt (below)
//       fungal     low rolling ground     sea      below the lava, with pumice islands
//       ash        ash dunes rippling along a diagonal of (x, z, w)
//       canyons    a plateau cut by terraced canyons with soul-glass strata
//       grove      rolling ground         shattered  rugged, with floating tesseract frames
//  2. Fill: bedrock, cinder, biome stone and soil, the floor surface, the ceiling surface,
//     and 4D pillars / stalactites / lava tubes from a 4D noise lattice. Air below y 32 is lava.
//  3. Ore blobs (4D balls): ember quartz, gilded cinder, hypercinder, ancient slag.
//  4. Features that cross column borders (with a margin): emberglass clusters on the ceiling,
//     emberwood trees, sulfur fungi, charred trees, ember crystal trees, tesseract frames.
//  5. Plants, sulfur vents; 6. structures.
//
// Basalt Prisms: the columns are hexagon-ish cells in (x, z) whose heights are hashed per
// W layer. In an axis-aligned slice (hidden axis W) you see whole columns; in a slice tilted
// through W, neighbouring cells come from different W layers and the columns break into shards.
// They are only fully visible along one slice orientation.

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { B, REG, hexToRgb } from '../../content/registry';
import type { BiomeDef, EmberStyle, RealmDef, TreeDef } from '../../content/types';
import { COLUMN_LAYER } from '../constants';
import type { ColumnSample, GenOptions } from './SurfaceGen';
import { StructureGen, type GenExtra } from './structures/StructureGen';

const SALT_BEDROCK = 0xe0b0;
const SALT_PRISM = 0xe1a5;
const SALT_FEATURE = 0xe2f7;
const SALT_PLANT = 0xe3a1;
const SALT_CEIL = 0xe4c1;
const SALT_ORE = 0xe5d3;
const SALT_VENT = 0xe6e5;

interface EB {
  index: number;
  def: BiomeDef;
  style: EmberStyle;
  c: [number, number, number];
  surface: number;
  sub: number;
  under: number;
  stone: number;
  ceil: number;
  rgb: [number, number, number];
  trees: { def: TreeDef; log: number; leaves: number; density: number }[];
  plants: { id: number; density: number }[];
}

interface OreCfg {
  id: number;
  p: number;
  r: [number, number];
  y: [number, number];
}

/** The per-cell terrain answer (shared scratch; generate() and sample() fill it). */
interface Cell {
  floor: number;
  ceil: number;
  eb: EB;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class EmberGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  readonly options: GenOptions;
  garden = false;
  gardenOrigin: [number, number, number, number] = [0, 0, 0, 0];
  readonly land: EB[];
  readonly seaBiome: EB;
  private readonly nHeat: SimplexNoise;
  private readonly nVapor: SimplexNoise;
  private readonly nSoul: SimplexNoise;
  private readonly nSea: SimplexNoise;
  private readonly nHills: SimplexNoise;
  private readonly nDetail: SimplexNoise;
  private readonly nCanyon: SimplexNoise;
  private readonly nCeil: SimplexNoise;
  private readonly nPillar: SimplexNoise;
  private readonly nPillar2: SimplexNoise;
  private readonly ores: OreCfg[];
  private readonly host = new Uint8Array(4096);
  private readonly wts: Float64Array;
  private readonly cell: Cell;
  // Scratch (generate() is not re-entrant; each worker owns one generator).
  private readonly sFloor = new Int16Array(COLUMN_LAYER);
  private readonly sCeil = new Int16Array(COLUMN_LAYER);
  private readonly sBiome: EB[] = new Array(COLUMN_LAYER);
  private readonly LY: number;
  private readonly lat: Float32Array;
  private readonly colv: Float32Array;

  constructor(seed: number, realm: RealmDef, options: GenOptions = {}) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.options = options;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    const s = this.seed;
    this.nHeat = new SimplexNoise(s ^ 0xe101);
    this.nVapor = new SimplexNoise(s ^ 0xe202);
    this.nSoul = new SimplexNoise(s ^ 0xe303);
    this.nSea = new SimplexNoise(s ^ 0xe404);
    this.nHills = new SimplexNoise(s ^ 0xe505);
    this.nDetail = new SimplexNoise(s ^ 0xe606);
    this.nCanyon = new SimplexNoise(s ^ 0xe707);
    this.nCeil = new SimplexNoise(s ^ 0xe808);
    this.nPillar = new SimplexNoise(s ^ 0xe909);
    this.nPillar2 = new SimplexNoise(s ^ 0xea0a);
    const id = (n: string) => REG.id(n);
    const all: EB[] = [];
    REG.biomes.forEach((def, index) => {
      if (def.realm !== realm.name || !def.ember) return;
      all.push({
        index,
        def,
        style: def.ember,
        c: [def.climate[0], def.climate[1], def.climate[2]],
        surface: id(def.surface),
        sub: id(def.subsurface),
        under: id(def.underwater),
        stone: def.stone ? id(def.stone) : id('cinder'),
        ceil: def.ceiling ? id(def.ceiling) : id('cinder'),
        rgb: hexToRgb(def.grassColor),
        trees: def.trees.map((t) => {
          const td = REG.tree(t.tree);
          return { def: td, log: id(td.log), leaves: td.leaves ? id(td.leaves) : 0, density: t.density };
        }),
        plants: def.plants.map((p) => ({ id: id(p.block), density: p.density })),
      });
    });
    const sea = all.find((b) => b.style === 'sea');
    if (!sea || all.length < 2) throw new Error(`realm "${realm.name}": needs ember biomes including a sea`);
    this.seaBiome = sea;
    this.land = all.filter((b) => b !== sea);
    this.wts = new Float64Array(this.land.length);
    this.cell = { floor: 0, ceil: 0, eb: this.land[0]! };
    this.ores = [
      { id: id('ember_quartz_ore'), p: 0.55, r: [1.1, 1.8], y: [10, 118] },
      { id: id('gilded_cinder'), p: 0.3, r: [1.0, 1.5], y: [10, 118] },
      { id: id('hypercinder_ore'), p: 0.16, r: [0.9, 1.4], y: [10, 80] },
      { id: id('ancient_slag'), p: 0.07, r: [0.6, 1.0], y: [8, 26] },
    ];
    for (const n of ['cinder', 'smoldering_cinder', 'prism_basalt', 'glowing_basalt', 'columnar_basalt', 'sulfur_block', 'scorched_stone', 'ashstone', 'soul_stone', 'fractured_voidstone', 'pumice'])
      this.host[id(n)] = 1;
    this.LY = (this.height >> 3) + 1;
    this.lat = new Float32Array(125 * this.LY);
    this.colv = new Float32Array(this.LY);
  }

  // ------------------------------------------------------------------ terrain answers

  /** Style floor height from shared noise values. */
  private styleFloor(style: EmberStyle, X: number, Z: number, W: number, hills: number, detail: number): number {
    switch (style) {
      case 'plains':
        return 40 + 5 * hills + 1.5 * detail;
      case 'prisms': {
        // Hexagon-ish cells of three blocks in (x, z) (odd rows shifted), hashed per W layer.
        const row = Math.floor(Z / 3);
        const col = Math.floor((X + (row & 1) * 1.5) / 3);
        return 43 + 7 * hills + Math.floor(hash4f(col, row, W, 0, this.seed ^ SALT_PRISM) * 5);
      }
      case 'fungal':
        return 42 + 4 * hills + 2 * detail;
      case 'sea': {
        const island = hills * 0.7 + detail * 0.3;
        return island > 0.42 ? 33.5 + (island - 0.42) * 16 : 16 + 6 * hills;
      }
      case 'ash':
        return 41 + 4 * hills + 3.5 * Math.sin((0.55 * X + 0.3 * Z + 0.45 * W) / 4.2 + 2.5 * detail);
      case 'canyons': {
        const plateau = 58 + 3 * hills;
        const c = Math.abs(this.nCanyon.n3(X / 100, Z / 100, W / 100));
        const t = smooth(0.1, 0.035, c);
        const base = plateau + (35 + 2 * detail - plateau) * t;
        // Terraced walls.
        return t > 0.05 && t < 0.95 ? Math.floor(base / 4) * 4 + 1 : base;
      }
      case 'grove':
        return 43 + 5 * hills + 1.5 * detail;
      case 'shattered':
        return 44 + 9 * hills + 4 * detail;
    }
  }

  /** Biome, floor and ceiling at a point: exactly what generate() writes there. */
  private at(X: number, Z: number, W: number): Cell {
    const heat = 0.5 + 0.5 * Math.tanh(2.2 * this.nHeat.fbm3(X / 260, Z / 260, W / 260, 2));
    const vapor = 0.5 + 0.5 * Math.tanh(2.2 * this.nVapor.fbm3(X / 230, Z / 230, W / 230, 2));
    const soul = 0.5 + 0.5 * Math.tanh(2.4 * this.nSoul.fbm3(X / 300, Z / 300, W / 300, 2));
    const seaN = this.nSea.fbm3(X / 340, Z / 340, W / 340, 2);
    const hills = this.nHills.fbm3(X / 56, Z / 56, W / 56, 3);
    const detail = this.nDetail.n3(X / 13, Z / 13, W / 13);
    const land = this.land, wts = this.wts;
    let best = 0, bestW = -1, sum = 0;
    for (let k = 0; k < land.length; k++) {
      const c = land[k]!.c;
      const dh = heat - c[0], dv = vapor - c[1], ds = soul - c[2];
      const d2 = dh * dh + dv * dv + ds * ds * 0.8;
      // Sharp weights pick the biome; the height blend uses a softer kernel.
      const sharp = 1 / (d2 * d2 + 1e-6);
      if (sharp > bestW) {
        bestW = sharp;
        best = k;
      }
      const soft = 1 / ((d2 + 0.012) * (d2 + 0.012));
      wts[k] = soft;
      sum += soft;
    }
    let floor = 0;
    for (let k = 0; k < land.length; k++) {
      const wk = wts[k]! / sum;
      if (wk < 0.004) continue;
      floor += wk * this.styleFloor(land[k]!.style, X, Z, W, hills, detail);
    }
    const seaShare = smooth(-0.12, -0.3, seaN);
    if (seaShare > 0) floor = floor * (1 - seaShare) + this.styleFloor('sea', X, Z, W, hills, detail) * seaShare;
    const f = Math.floor(floor);
    let ceil = Math.floor(112 + 7 * this.nCeil.fbm3(X / 44, Z / 44, W / 44, 2) - 3 * Math.abs(detail));
    ceil = Math.min(this.height - 7, Math.max(ceil, f + 18));
    const c = this.cell;
    c.floor = f;
    c.ceil = ceil;
    c.eb = seaShare > 0.5 ? this.seaBiome : land[best]!;
    return c;
  }

  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const c = this.at(Math.floor(x), Math.floor(z), Math.floor(w));
    out.height = c.floor;
    out.biome = c.eb.index;
    out.ocean = c.floor < this.sea;
    out.river = false;
    out.ceiling = c.ceil;
    out.grass = c.eb.rgb;
    return out;
  }

  /** A dry spot near the origin, clear of the lava sea, with head room. */
  spawnPoint(): [number, number, number, number] {
    for (let r = 0; r < 2000; r += 8)
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(t) * r), w = Math.round(Math.sin(t) * r), z = (a * 7) % 5;
        const c = this.at(x, z, w);
        if (c.floor >= this.sea + 2 && c.eb.style !== 'sea' && c.ceil - c.floor > 10) return [x + 0.5, c.floor + 1, z + 0.5, w + 0.5];
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

  /** The 4D pillar field on a 4-block (x, z, w) x 8-block (y) lattice, for one column. */
  private fillLattice(X0: number, Z0: number, W0: number): void {
    const lat = this.lat, LY = this.LY;
    for (let iw = 0; iw < 5; iw++)
      for (let iz = 0; iz < 5; iz++)
        for (let ix = 0; ix < 5; ix++) {
          const X = X0 + ix * 4, Z = Z0 + iz * 4, W = W0 + iw * 4;
          const o = (ix + 5 * (iz + 5 * iw)) * LY;
          for (let ly = 0; ly < LY; ly++) {
            const Y = ly * 8;
            lat[o + ly] = 0.78 * this.nPillar.n4(X / 22, Y / 30, Z / 22, W / 22) + 0.22 * this.nPillar2.n4(X / 9, Y / 11, Z / 9, W / 9);
          }
        }
  }

  /** Interpolate the lattice at column-local (x, z, w) into colv (one value per y level). */
  private latColumn(x: number, z: number, w: number): void {
    const lat = this.lat, LY = this.LY, out = this.colv;
    const fx = x / 4, fz = z / 4, fw = w / 4;
    const ix = Math.min(3, Math.floor(fx)), iz = Math.min(3, Math.floor(fz)), iw = Math.min(3, Math.floor(fw));
    const tx = fx - ix, tz = fz - iz, tw = fw - iw;
    for (let ly = 0; ly < LY; ly++) {
      let v = 0;
      for (let c = 0; c < 8; c++) {
        const dx = c & 1, dz = (c >> 1) & 1, dw = (c >> 2) & 1;
        const wgt = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz) * (dw ? tw : 1 - tw);
        v += wgt * lat[(ix + dx + 5 * (iz + dz + 5 * (iw + dw))) * LY + ly]!;
      }
      out[ly] = v;
    }
  }

  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array, extra?: GenExtra): void {
    const H = this.height, sea = this.sea, L = COLUMN_LAYER, seed = this.seed;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    const floorOf = this.sFloor, ceilOf = this.sCeil, ebOf = this.sBiome;
    blocks.fill(0);
    const BEDROCK = B.bedrock, LAVA = B.lava;
    const CINDER = REG.id('cinder'), SOUL_GLASS = REG.id('soul_glass');

    // 1. Biomes, floor, ceiling.
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const c = this.at(X0 + x, Z0 + z, W0 + w);
          floorOf[i] = c.floor;
          ceilOf[i] = c.ceil;
          ebOf[i] = c.eb;
          surface[i * 4] = Math.round(c.eb.rgb[0] * 255);
          surface[i * 4 + 1] = Math.round(c.eb.rgb[1] * 255);
          surface[i * 4 + 2] = Math.round(c.eb.rgb[2] * 255);
          surface[i * 4 + 3] = c.eb.index;
        }

    // 2. Fill.
    this.fillLattice(X0, Z0, W0);
    const colv = this.colv;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const f = floorOf[i]!, ce = ceilOf[i]!, eb = ebOf[i]!;
          const wet = f < sea;
          const top = wet ? eb.under : eb.surface;
          const soilDepth = eb.style === 'ash' ? 5 : 3;
          const canyon = eb.style === 'canyons';
          this.latColumn(x, z, w);
          for (let y = 0; y < H; y++) {
            let v: number;
            if (y === 0 || y >= H - 1) v = BEDROCK;
            else if (y <= 3 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - y * 0.15) v = BEDROCK;
            else if (y >= H - 5 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - (H - 1 - y) * 0.15) v = BEDROCK;
            else if (y <= f) {
              const depth = f - y;
              if (depth === 0) v = top;
              else if (depth <= soilDepth) v = wet ? eb.under : eb.sub;
              else if (depth <= 12) v = eb.stone;
              else v = CINDER;
              // Soul-glass strata in canyon walls.
              if (canyon && depth > 0 && y > 36 && y % 5 === 0) v = SOUL_GLASS;
              // Lava tubes through the floor mass.
              if (depth > 3 && y > 5) {
                const ly = y >> 3, t = (y & 7) / 8;
                const p = colv[ly]! + (colv[ly + 1]! - colv[ly]!) * t;
                if (p < -0.6) v = y <= sea ? LAVA : 0;
              }
            } else if (y >= ce) {
              v = y - ce <= 1 ? eb.ceil : CINDER;
            } else {
              // The cavern: pillars and stalactites where the 4D field is high (easier near
              // the floor and the ceiling), else air; lava below the sea level.
              const ly = y >> 3, t = (y & 7) / 8;
              const p = colv[ly]! + (colv[ly + 1]! - colv[ly]!) * t;
              const thr = 0.64 - 0.34 * Math.max(0, 1 - (y - f) / 9) - 0.3 * Math.max(0, 1 - (ce - y) / 12);
              v = p > thr ? eb.stone : y <= sea ? LAVA : 0;
            }
            blocks[i + y * L] = v;
          }
        }

    // 3. Ores.
    this.oreBlobs(X0, Z0, W0, blocks);

    // 4. Features: ceiling emberglass, trees, fungi, crystals, tesseract frames.
    this.features(X0, Z0, W0, blocks);

    // 5. Plants and vents.
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const f = floorOf[i]!, eb = ebOf[i]!;
          if (f < sea || f + 1 >= H) continue;
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          if (eb.style === 'fungal' && hash4f(X, 5, Z, W, seed ^ SALT_VENT) < 0.004 && blocks[i + f * L] === eb.surface) {
            blocks[i + f * L] = REG.id('sulfur_vent');
            continue;
          }
          if (blocks[i + (f + 1) * L] !== 0 || !REG.solid[blocks[i + f * L]! & 0xfff]) continue;
          const pr = hash4f(X, 2, Z, W, seed ^ SALT_PLANT);
          let acc = 0;
          for (const pl of eb.plants) {
            acc += pl.density;
            if (pr >= acc) continue;
            blocks[i + (f + 1) * L] = pl.id;
            break;
          }
        }

    // 6. Structures (citadels, forges, bridges...).
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});
  }

  /** Ore blobs: one chance per 8^4 cell per ore, a jittered 4D ball in host rock. */
  private oreBlobs(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const S = 8, M = 2;
    const seed = this.seed, host = this.host, L = COLUMN_LAYER;
    for (let k = 0; k < this.ores.length; k++) {
      const o = this.ores[k]!;
      for (let cw = Math.floor((W0 - M) / S); cw <= Math.floor((W0 + 15 + M) / S); cw++)
        for (let cz = Math.floor((Z0 - M) / S); cz <= Math.floor((Z0 + 15 + M) / S); cz++)
          for (let cx = Math.floor((X0 - M) / S); cx <= Math.floor((X0 + 15 + M) / S); cx++)
            for (let cy = Math.floor(o.y[0] / S); cy <= Math.floor(o.y[1] / S); cy++) {
              const h = hash4(cx, cy, cz, cw, seed ^ (SALT_ORE + k * 977));
              if (h / 4294967296 >= o.p) continue;
              const px = cx * S + ((h >>> 3) & 7) + 0.5, py = cy * S + ((h >>> 6) & 7) + 0.5, pz = cz * S + ((h >>> 9) & 7) + 0.5, pw = cw * S + ((h >>> 12) & 7) + 0.5;
              if (py < o.y[0] || py > o.y[1]) continue;
              const r = o.r[0] + ((h >>> 16) & 255) / 255 * (o.r[1] - o.r[0]);
              const r2 = r * r;
              for (let w = Math.max(0, Math.floor(pw - r - W0)); w <= Math.min(15, Math.floor(pw + r - W0)); w++)
                for (let z = Math.max(0, Math.floor(pz - r - Z0)); z <= Math.min(15, Math.floor(pz + r - Z0)); z++)
                  for (let x = Math.max(0, Math.floor(px - r - X0)); x <= Math.min(15, Math.floor(px + r - X0)); x++)
                    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(this.height - 2, Math.floor(py + r)); y++) {
                      const dx = X0 + x + 0.5 - px, dy = y + 0.5 - py, dz = Z0 + z + 0.5 - pz, dw = W0 + w + 0.5 - pw;
                      if (dx * dx + dy * dy + dz * dz + dw * dw > r2) continue;
                      const i = x + (z << 4) + (w << 8) + y * L;
                      if (host[blocks[i]! & 0xfff]) blocks[i] = o.id;
                    }
            }
    }
  }

  // ------------------------------------------------------------------ features

  private features(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const M = 8;
    const seed = this.seed;
    const glow = REG.id('emberglass');
    for (let w = -M; w < 16 + M; w++)
      for (let z = -M; z < 16 + M; z++)
        for (let x = -M; x < 16 + M; x++) {
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          // Emberglass clusters on the ceiling (the realm's light), within 3 blocks.
          if (x >= -3 && x < 19 && z >= -3 && z < 19 && w >= -3 && w < 19 && hash4f(X, 9, Z, W, seed ^ SALT_CEIL) < 0.0035) {
            const c = this.at(X, Z, W);
            const r = 1.2 + hash4f(X, 10, Z, W, seed ^ SALT_CEIL) * 1.1;
            this.ball(blocks, X0, Z0, W0, X + 0.5, c.ceil - 0.2, Z + 0.5, W + 0.5, r, (old) => (old === 0 || REG.fluid[old & 0xfff] ? old : glow), true);
          }
          const r = hash4f(X, 0, Z, W, seed ^ SALT_FEATURE);
          if (r >= 0.012) continue;
          const c = this.at(X, Z, W);
          if (c.floor < this.sea) continue;
          let acc = 0;
          for (const t of c.eb.trees) {
            acc += t.density;
            if (r >= acc) continue;
            this.grow(blocks, X0, Z0, W0, X, c.floor + 1, Z, W, t, c.ceil);
            break;
          }
        }
  }

  private grow(blocks: Uint16Array, X0: number, Z0: number, W0: number, X: number, y: number, Z: number, W: number, t: { def: TreeDef; log: number; leaves: number }, ceil: number): void {
    const h = hash4(X, 1, Z, W, this.seed ^ SALT_FEATURE);
    const def = t.def;
    const Hh = def.height[0] + (h % (def.height[1] - def.height[0] + 1));
    const r = def.radius[0] + (((h >>> 8) & 255) / 255) * (def.radius[1] - def.radius[0]);
    const log = t.log, leaf = t.leaves;
    const air = (old: number) => old === 0 || (REG.replaceable[old & 0xfff] === 1 && REG.fluid[old & 0xfff] === 0);
    const put = (x: number, yy: number, z: number, w: number, v: number, force = false) => {
      const lx = x - X0, lz = z - Z0, lw = w - W0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || lw < 0 || lw > 15 || yy < 1 || yy >= ceil) return;
      const i = lx + (lz << 4) + (lw << 8) + yy * COLUMN_LAYER;
      if (force || air(blocks[i]!)) blocks[i] = v;
    };
    const top = Math.min(ceil - 2, y + Hh);
    switch (def.shape) {
      case 'ball':
        this.ball(blocks, X0, Z0, W0, X + 0.5, top - 0.5, Z + 0.5, W + 0.5, r, (old) => (air(old) ? leaf : old));
        for (let k = y; k < top; k++) put(X, k, Z, W, log, true);
        break;
      case 'dead': {
        for (let k = y; k < top; k++) put(X, k, Z, W, log, true);
        for (let k = 0; k < 4; k++) {
          const by = y + 1 + ((h >>> (6 + k * 3)) % Math.max(1, Hh - 1));
          const ax = (h >>> (12 + k * 2)) % 3;
          const sg = (h >>> (20 + k)) & 1 ? 1 : -1;
          for (let s = 1; s <= 2; s++) put(X + (ax === 0 ? sg * s : 0), by + (s - 1), Z + (ax === 1 ? sg * s : 0), W + (ax === 2 ? sg * s : 0), log);
        }
        break;
      }
      case 'fungus': {
        // A stem and a 4D dome cap (a hollow half-ball in x, z, w and up).
        for (let k = y; k < top; k++) put(X, k, Z, W, log, true);
        this.ball(blocks, X0, Z0, W0, X + 0.5, top - 0.5, Z + 0.5, W + 0.5, r, (old, d, _x, yy) => (yy >= top - 1 && d > r - 1.3 && air(old) ? leaf : old));
        break;
      }
      case 'crystal': {
        // A crystal trunk and a 4D star canopy: spikes along +-x, +-z, +-w and up.
        for (let k = y; k < top; k++) put(X, k, Z, W, log, true);
        const L = Math.round(r);
        for (let s = 1; s <= L; s++) {
          const up = s >> 1;
          put(X + s, top - 1 + up, Z, W, leaf);
          put(X - s, top - 1 + up, Z, W, leaf);
          put(X, top - 1 + up, Z + s, W, leaf);
          put(X, top - 1 + up, Z - s, W, leaf);
          put(X, top - 1 + up, Z, W + s, leaf);
          put(X, top - 1 + up, Z, W - s, leaf);
          put(X, top - 1 + s, Z, W, leaf);
        }
        this.ball(blocks, X0, Z0, W0, X + 0.5, top + 0.5, Z + 0.5, W + 0.5, 1.3, (old) => (air(old) ? leaf : old));
        break;
      }
      case 'tesseract': {
        // A floating hypercube frame: 32 edges (log) between 16 glowing vertices (leaves).
        const e = Hh;
        const by = Math.min(ceil - e - 3, y + 2 + ((h >>> 5) % 6));
        if (by < y) break;
        for (let v = 0; v < 16; v++) {
          const px = X + (v & 1 ? e : 0), py = by + (v & 2 ? e : 0), pz = Z + (v & 4 ? e : 0), pw = W + (v & 8 ? e : 0);
          put(px, py, pz, pw, leaf, true);
          for (let a = 0; a < 4; a++) {
            if (v & (1 << a)) continue; // each edge once: from the vertex with bit a clear
            for (let s = 1; s < e; s++) put(px + (a === 0 ? s : 0), py + (a === 1 ? s : 0), pz + (a === 2 ? s : 0), pw + (a === 3 ? s : 0), log, true);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** 4D ball clipped to the column; `f(old, dist, x, y)` decides each cell. */
  private ball(blocks: Uint16Array, X0: number, Z0: number, W0: number, cx: number, cy: number, cz: number, cw: number, r: number, f: (old: number, d: number, x: number, y: number) => number, flat = false): void {
    const y0 = flat ? Math.floor(cy - r * 0.6) : Math.floor(cy - r), y1 = flat ? Math.floor(cy + r * 0.6) : Math.floor(cy + r);
    for (let y = Math.max(1, y0); y <= Math.min(this.height - 2, y1); y++)
      for (let w = Math.max(0, Math.floor(cw - r - W0)); w <= Math.min(15, Math.floor(cw + r - W0)); w++)
        for (let z = Math.max(0, Math.floor(cz - r - Z0)); z <= Math.min(15, Math.floor(cz + r - Z0)); z++)
          for (let x = Math.max(0, Math.floor(cx - r - X0)); x <= Math.min(15, Math.floor(cx + r - X0)); x++) {
            const d = Math.hypot(x + X0 + 0.5 - cx, y + 0.5 - cy, z + Z0 + 0.5 - cz, w + W0 + 0.5 - cw);
            if (d > r) continue;
            const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
            blocks[i] = f(blocks[i]!, d, x + X0, y);
          }
  }
}
