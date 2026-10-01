// Ember Depths generator (Phase 6; rebuilt vertical in the playtest fixes). Deterministic from
// the seed; runs in workers.
//
// An enclosed realm 128 blocks tall: bedrock at the bottom and top, a lava sea at y 32, and
// between them terrain that fills the whole height, like Minecraft's Nether. A 4D density field
// (solid where positive) makes masses, overhangs, ledges, arches, pillars and floating islands
// at every height, so there is always something to climb between the lava sea and the roof.
//
//  1. A lattice every 4 blocks along x, z, w and y. At each lattice point:
//     * climate: heat, vapour and soul vary over (x, z, w); altitude is the height itself plus a
//       little noise. Biomes are picked from all four, so they change as you climb: lava-shore
//       biomes low down, others on the ledges and islands above (biomeAt3 answers anywhere, on
//       the same 4-block grid, like Minecraft's 1.18 biomes).
//     * terrain: each biome's EmberTerrain (fill, verticality, shelves, floor and roof heights,
//       dunes, canyons, islands) is blended across biome borders and shapes the density.
//  2. Density is interpolated to every cell. Air at or below y 32 is lava; lava tubes become
//     tunnels above it.
//  3. Blocks: the top of every mass gets the biome's surface over its subsurface, the underside
//     its ceiling block, stone inside, cinder deep down; soul-glass strata in canyons; basalt
//     prism tops hashed per W layer.
//  4. Ore blobs (4D balls). 5. Emberglass under overhangs (the realm's light), trees, fungi,
//     crystal trees on surfaces at any height, floating tesseract frames. 6. Plants, vents.
//  7. Structures (on the lowest floor above the lava, or on the lava sea).
//
// Basalt Prisms: column tops are hexagon-ish cells in (x, z) whose heights are hashed per W
// layer. In an axis-aligned slice (hidden axis W) you see whole columns; in a slice tilted
// through W, neighbouring cells come from different W layers and the columns break into shards.

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { B, REG, hexToRgb } from '../../content/registry';
import type { BiomeDef, EmberStyle, EmberTerrain, RealmDef, TreeDef } from '../../content/types';
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
const SALT_FRAME = 0xe7f1;

/** Lattice spacing (blocks) along every axis. */
const S = 4;
/** Lattice points per horizontal axis for one column, padded by one lattice cell each side. */
const NL = 16 / S + 3;
/** Weight of altitude in the biome distance. */
const ALT_W = 0.6;
/** Lattice columns kept per generator (LRU): neighbouring columns and samples share them. */
const CACHE_MAX = 8192;

const DEFAULT_TERRAIN: EmberTerrain = { fill: -0.15, vertical: 0.3, shelves: 0.4, floor: 40, roof: 108, rough: 0.4 };

interface EB {
  index: number;
  def: BiomeDef;
  style: EmberStyle;
  /** Climate point: heat, vapour, soul, altitude. */
  c: [number, number, number, number];
  t: Required<EmberTerrain>;
  surface: number;
  sub: number;
  under: number;
  stone: number;
  ceil: number;
  rgb: [number, number, number];
  trees: { def: TreeDef; log: number; leaves: number; density: number }[];
  plants: { id: number; density: number }[];
  /** Plants hanging from the underside of masses (vines, glowing pods). */
  hanging: { id: number; density: number }[];
  vents: { id: number; density: number }[];
}

interface OreCfg {
  id: number;
  p: number;
  r: [number, number];
  y: [number, number];
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
  /** Every Ember biome (lattice biome values index this), the land ones and the Magma Sea. */
  readonly all: EB[];
  readonly land: EB[];
  readonly seaBiome: EB;
  private readonly seaIdx: number;
  private readonly landIdx: Int32Array;
  private readonly nHeat: SimplexNoise;
  private readonly nVapor: SimplexNoise;
  private readonly nSoul: SimplexNoise;
  private readonly nSea: SimplexNoise;
  private readonly nAlt: SimplexNoise;
  private readonly nMassA: SimplexNoise;
  private readonly nMassV: SimplexNoise;
  private readonly nDetail: SimplexNoise;
  private readonly nTube: SimplexNoise;
  private readonly nCanyon: SimplexNoise;
  private readonly nDune: SimplexNoise;
  private readonly ores: OreCfg[];
  private readonly host = new Uint8Array(4096);
  private readonly wts: Float64Array;
  private readonly base: Float64Array;
  /** Lattice levels along y (0, 4, ..., height). */
  private readonly LY: number;
  /** Lattice columns: [density x LY, tube x LY, biome x LY], keyed by lattice (x, z, w). */
  private readonly cache = new Map<string, Float32Array>();
  /** The padded lattice of the column being generated (NL^3 references into the cache). */
  private readonly grid: Float32Array[] = new Array(NL * NL * NL);
  // Climate of the lattice column being computed.
  private cHeat = 0;
  private cVapor = 0;
  private cSoul = 0;
  private cSea = 0;
  private cCanyon = 0;
  private cDune = 0;
  private cPhase = 0;
  // Scratch (generate() is not re-entrant; each worker owns one generator).
  private readonly colD: Float32Array;
  private readonly colT: Float32Array;
  private readonly solid: Uint8Array;
  private readonly pts: Float32Array[] = new Array(8);

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
    this.nAlt = new SimplexNoise(s ^ 0xe505);
    this.nMassA = new SimplexNoise(s ^ 0xe606);
    this.nMassV = new SimplexNoise(s ^ 0xe707);
    this.nDetail = new SimplexNoise(s ^ 0xe808);
    this.nTube = new SimplexNoise(s ^ 0xe909);
    this.nCanyon = new SimplexNoise(s ^ 0xea0a);
    this.nDune = new SimplexNoise(s ^ 0xeb0b);
    const id = (n: string) => REG.id(n);
    const all: EB[] = [];
    REG.biomes.forEach((def, index) => {
      if (def.realm !== realm.name || !def.ember) return;
      const t = { dunes: 0, canyons: 0, islands: 0, ...DEFAULT_TERRAIN, ...(def.emberTerrain ?? {}) };
      all.push({
        index,
        def,
        style: def.ember,
        c: [def.climate[0], def.climate[1], def.climate[2], def.climate[3]],
        t,
        surface: id(def.surface),
        sub: id(def.subsurface),
        under: id(def.underwater),
        stone: def.stone ? id(def.stone) : id('cinder'),
        ceil: def.ceiling ? id(def.ceiling) : id('cinder'),
        rgb: hexToRgb(def.grassColor),
        trees: def.trees.map((tr) => {
          const td = REG.tree(tr.tree);
          return { def: td, log: id(td.log), leaves: td.leaves ? id(td.leaves) : 0, density: tr.density };
        }),
        plants: def.plants.filter((p) => p.placement !== 'ceiling').map((p) => ({ id: id(p.block), density: p.density })),
        hanging: def.plants.filter((p) => p.placement === 'ceiling').map((p) => ({ id: id(p.block), density: p.density })),
        vents: (def.vents ?? []).map((v) => ({ id: id(v.block), density: v.density })),
      });
    });
    const sea = all.find((b) => b.style === 'sea');
    if (!sea || all.length < 2) throw new Error(`realm "${realm.name}": needs ember biomes including a sea`);
    if (all.length > 255) throw new Error(`realm "${realm.name}": too many biomes`);
    this.all = all;
    this.seaBiome = sea;
    this.seaIdx = all.indexOf(sea);
    this.land = all.filter((b) => b !== sea);
    this.landIdx = Int32Array.from(this.land.map((b) => all.indexOf(b)));
    this.wts = new Float64Array(this.land.length);
    this.base = new Float64Array(this.land.length);
    this.ores = [
      { id: id('ember_quartz_ore'), p: 0.55, r: [1.1, 1.8], y: [10, 118] },
      { id: id('gilded_cinder'), p: 0.3, r: [1.0, 1.5], y: [10, 118] },
      { id: id('hypercinder_ore'), p: 0.16, r: [0.9, 1.4], y: [10, 80] },
      { id: id('ancient_slag'), p: 0.07, r: [0.6, 1.0], y: [8, 26] },
    ];
    for (const b of all) {
      this.host[b.stone] = 1;
      this.host[b.ceil] = REG.solid[b.ceil] && REG.render[b.ceil] === REG.render[id('cinder')] ? 1 : 0;
    }
    for (const n of ['cinder', 'smoldering_cinder', 'prism_basalt', 'glowing_basalt', 'columnar_basalt', 'sulfur_block', 'scorched_stone', 'ashstone', 'soul_stone', 'fractured_voidstone', 'pumice'])
      this.host[id(n)] = 1;
    this.LY = this.height / S + 1;
    this.colD = new Float32Array(this.LY);
    this.colT = new Float32Array(this.LY);
    this.solid = new Uint8Array(this.height + 1);
  }

  // ------------------------------------------------------------------ the lattice

  /** Climate of a lattice column into the c* fields. */
  private climate(X: number, Z: number, W: number): void {
    this.cHeat = 0.5 + 0.5 * Math.tanh(2.2 * this.nHeat.fbm3(X / 260, Z / 260, W / 260, 2));
    this.cVapor = 0.5 + 0.5 * Math.tanh(2.2 * this.nVapor.fbm3(X / 230, Z / 230, W / 230, 2));
    this.cSoul = 0.5 + 0.5 * Math.tanh(2.4 * this.nSoul.fbm3(X / 300, Z / 300, W / 300, 2));
    this.cSea = this.nSea.fbm3(X / 340, Z / 340, W / 340, 2);
    this.cCanyon = Math.abs(this.nCanyon.n3(X / 100, Z / 100, W / 100));
    this.cDune = (0.55 * X + 0.3 * Z + 0.45 * W) / 4.2 + 2.5 * this.nDune.n3(X / 13, Z / 13, W / 13);
    this.cPhase = 22 * this.nDune.n3(X / 150 + 31.7, Z / 150, W / 150);
    // The horizontal part of every land biome's climate distance (pick() adds altitude).
    const land = this.land, base = this.base;
    for (let k = 0; k < land.length; k++) {
      const c = land[k]!.c;
      const dh = this.cHeat - c[0], dv = this.cVapor - c[1], ds = this.cSoul - c[2];
      base[k] = dh * dh + dv * dv + ds * ds * 0.8;
    }
  }

  private altitude(X: number, Y: number, Z: number, W: number): number {
    return Math.max(0, Math.min(1, (Y - 30) / 84)) + 0.1 * this.nAlt.n4(X / 48, Y / 32, Z / 48, W / 48);
  }

  /** How much of the Magma Sea there is at this altitude, for the current climate. */
  private seaShare(alt: number): number {
    return smooth(-0.12, -0.3, this.cSea) * (1 - smooth(0.12, 0.3, alt));
  }

  /**
   * Biome at a lattice point (index into `all`), for the current climate; also leaves the
   * normalised soft weights of the land biomes in `wts` (for the terrain blend).
   */
  private pick(alt: number): number {
    const land = this.land, wts = this.wts, base = this.base;
    let best = 0, bestW = -1, sum = 0;
    for (let k = 0; k < land.length; k++) {
      const da = alt - land[k]!.c[3];
      const d2 = base[k]! + da * da * ALT_W;
      const sharp = 1 / (d2 * d2 + 1e-6);
      if (sharp > bestW) {
        bestW = sharp;
        best = k;
      }
      const soft = 1 / ((d2 + 0.012) * (d2 + 0.012));
      wts[k] = soft;
      sum += soft;
    }
    for (let k = 0; k < land.length; k++) wts[k] = wts[k]! / sum;
    return this.seaShare(alt) > 0.5 ? this.seaIdx : this.landIdx[best]!;
  }

  /** A lattice column (density, tube, biome per level), computed or from the cache. */
  private latticeColumn(X: number, Z: number, W: number): Float32Array {
    const key = `${X},${Z},${W}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const LY = this.LY, H = this.height;
    const out = new Float32Array(LY * 3);
    this.climate(X, Z, W);
    const land = this.land, wts = this.wts, seaT = this.seaBiome.t;
    for (let ly = 0; ly < LY; ly++) {
      const Y = ly * S;
      const alt = this.altitude(X, Y, Z, W);
      out[2 * LY + ly] = this.pick(alt);
      if (Y <= 8 || Y >= H - 4) {
        out[ly] = 3; // bedrock layers: always solid
        continue;
      }
      // Terrain parameters blended across biomes (and toward the Magma Sea where it is).
      let fill = 0, vert = 0, shelves = 0, floor = 0, roof = 0, rough = 0, dunes = 0, canyons = 0, islands = 0;
      for (let k = 0; k < land.length; k++) {
        const wk = wts[k]!;
        if (wk < 0.004) continue;
        const t = land[k]!.t;
        fill += wk * t.fill;
        vert += wk * t.vertical;
        shelves += wk * t.shelves;
        floor += wk * t.floor;
        roof += wk * t.roof;
        rough += wk * t.rough;
        dunes += wk * t.dunes;
        canyons += wk * t.canyons;
        islands += wk * t.islands;
      }
      const ss = this.seaShare(alt);
      if (ss > 0) {
        const k = 1 - ss;
        fill = fill * k + seaT.fill * ss;
        vert = vert * k + seaT.vertical * ss;
        shelves = shelves * k + seaT.shelves * ss;
        floor = floor * k + seaT.floor * ss;
        roof = roof * k + seaT.roof * ss;
        rough = rough * k + seaT.rough * ss;
        dunes = dunes * k + seaT.dunes * ss;
        canyons = canyons * k + seaT.canyons * ss;
        islands = islands * k + seaT.islands * ss;
      }
      const nA = this.nMassA.fbm4(X / 44, Y / 19, Z / 44, W / 44, 2);
      const nV = this.nMassV.fbm4(X / 28, Y / 80, Z / 28, W / 28, 2);
      const nD = this.nDetail.n4(X / 12, Y / 9, Z / 12, W / 12);
      let d = 1.15 * (nA + (nV - nA) * vert) + fill + 0.1 + rough * 0.4 * nD;
      // Ledges: a soft layering whose phase drifts across the realm, so no two places stack
      // their ledges at the same heights.
      d += shelves * 0.2 * Math.cos((2 * Math.PI * (Y + 8 * nA + this.cPhase)) / 22);
      if (islands > 0) d += islands * (0.9 * nD - 0.25);
      d += 2.2 * smooth(floor + 4, floor - 14, Y);
      // The roof: a ragged underside with stalactites (the vertical noise, near the roof).
      d += 2.2 * smooth(roof, roof + 16, Y) + 0.55 * Math.max(0, nV) * smooth(roof - 26, roof - 2, Y);
      if (dunes > 0) d += dunes * 0.5 * Math.sin(this.cDune) * smooth(floor + 14, floor + 2, Y);
      if (canyons > 0) d -= canyons * 3 * smooth(0.16, 0.05, this.cCanyon) * smooth(floor - 4, floor + 6, Y) * (1 - smooth(roof - 12, roof - 2, Y));
      out[ly] = d;
      out[LY + ly] = this.nTube.n4(X / 22, Y / 30, Z / 22, W / 22);
    }
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, out);
    return out;
  }

  /**
   * Density and tube values for every lattice level at a block column (x, z, w), interpolated
   * from the 8 lattice columns around it, into colD / colT.
   */
  private densityColumn(x: number, z: number, w: number, corners?: Float32Array[]): void {
    const X0 = Math.floor(x / S) * S, Z0 = Math.floor(z / S) * S, W0 = Math.floor(w / S) * S;
    const tx = (x - X0) / S, tz = (z - Z0) / S, tw = (w - W0) / S;
    const pts = corners ?? this.pts;
    if (!corners) for (let c = 0; c < 8; c++) pts[c] = this.latticeColumn(X0 + (c & 1) * S, Z0 + ((c >> 1) & 1) * S, W0 + ((c >> 2) & 1) * S);
    const LY = this.LY, D = this.colD, T = this.colT;
    const w0 = (1 - tx) * (1 - tz) * (1 - tw), w1 = tx * (1 - tz) * (1 - tw), w2 = (1 - tx) * tz * (1 - tw), w3 = tx * tz * (1 - tw);
    const w4 = (1 - tx) * (1 - tz) * tw, w5 = tx * (1 - tz) * tw, w6 = (1 - tx) * tz * tw, w7 = tx * tz * tw;
    const p0 = pts[0]!, p1 = pts[1]!, p2 = pts[2]!, p3 = pts[3]!, p4 = pts[4]!, p5 = pts[5]!, p6 = pts[6]!, p7 = pts[7]!;
    for (let i = 0; i < 2 * LY; i++) {
      const v = w0 * p0[i]! + w1 * p1[i]! + w2 * p2[i]! + w3 * p3[i]! + w4 * p4[i]! + w5 * p5[i]! + w6 * p6[i]! + w7 * p7[i]!;
      if (i < LY) D[i] = v;
      else T[i - LY] = v;
    }
  }

  /** Density at a cell of the current density column. */
  private dens(y: number): number {
    const D = this.colD, l = y >> 2;
    return D[l]! + (D[l + 1]! - D[l]!) * (y & 3) * 0.25;
  }

  /** Solid flags for every y of the current density column (with prism tops), into `solid`. */
  private solidColumn(X: number, Z: number, W: number, biomeOf: (y: number) => EB): void {
    const H = this.height, sol = this.solid;
    for (let y = 0; y < H; y++) sol[y] = this.dens(y) > 0 ? 1 : 0;
    sol[H] = 1;
    // Basalt prism tops: raise or lower each top surface by a hashed amount per hexagon cell
    // and W layer.
    for (let y = H - 6; y > this.sea + 1; y--) {
      if (!sol[y] || sol[y + 1]) continue;
      if (biomeOf(y + 1).style !== 'prisms') continue;
      const row = Math.floor(Z / 3);
      const col = Math.floor((X + (row & 1) * 1.5) / 3);
      const off = Math.floor(hash4f(col, row, W, 0, this.seed ^ SALT_PRISM) * 5) - 2;
      if (off > 0) {
        for (let k = 1; k <= off && y + k < H - 6 && !sol[y + k + 1]; k++) sol[y + k] = 1;
      } else if (off < 0) {
        for (let k = 0; k < -off && y - k > this.sea + 1; k++) sol[y - k] = 0;
        y += off;
      }
    }
  }

  /** The biome at a lattice point (x, y, z, w all multiples of 4). */
  private latticeBiome(X: number, Y: number, Z: number, W: number): EB {
    const col = this.latticeColumn(X, Z, W);
    return this.all[col[2 * this.LY + Math.max(0, Math.min(this.LY - 1, Y / S))]!]!;
  }

  /** The biome at any position: the nearest lattice point's (the same answer generate() uses). */
  biomeAt3(x: number, y: number, z: number, w: number): number {
    const r = (v: number) => Math.round(v / S) * S;
    return this.latticeBiome(r(Math.floor(x)), r(Math.floor(y)), r(Math.floor(z)), r(Math.floor(w))).index;
  }

  /** Enclosed realm: the "cave" biome is the 3D biome wherever you are. */
  caveBiomeAt(x: number, y: number, z: number, w: number): number {
    return this.biomeAt3(x, y, z, w);
  }

  // ------------------------------------------------------------------ terrain answers

  /**
   * The floor of a column: the top of the first mass above the lava sea (or the bottom of the
   * lava sea where it is open above it), the ceiling over it, and the biome you stand in there.
   */
  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.densityColumn(X, Z, W);
    const r = (v: number) => Math.round(v / S) * S;
    this.solidColumn(X, Z, W, (y) => this.latticeBiome(r(X), r(y), r(Z), r(W)));
    const { floor, ocean } = this.floorOf();
    const sol = this.solid;
    let ceil = floor + 1;
    while (ceil < this.height - 1 && !sol[ceil]) ceil++;
    const eb = this.latticeBiome(r(X), r(floor + 1), r(Z), r(W));
    out.height = floor;
    out.biome = eb.index;
    out.ocean = ocean;
    out.river = false;
    out.ceiling = ceil;
    out.grass = eb.rgb;
    return out;
  }

  /** The floor of the current solid column (see sample()). */
  private floorOf(): { floor: number; ocean: boolean } {
    const sol = this.solid, H = this.height, sea = this.sea;
    let y = sea + 1;
    if (sol[y]) {
      while (y < H - 6 && sol[y]) y++;
      return { floor: y - 1, ocean: false };
    }
    let f = sea;
    while (f > 1 && !sol[f]) f--;
    return { floor: f, ocean: true };
  }

  /** Every surface you can stand on in a column, with its biome and head room (low to high). */
  surfaces(x: number, z: number, w: number): { y: number; biome: number; room: number }[] {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.densityColumn(X, Z, W);
    const r = (v: number) => Math.round(v / S) * S;
    this.solidColumn(X, Z, W, (y) => this.latticeBiome(r(X), r(y), r(Z), r(W)));
    const out: { y: number; biome: number; room: number }[] = [];
    const sol = this.solid;
    for (let y = this.sea; y < this.height - 6; y++) {
      if (!sol[y] || sol[y + 1] || sol[y + 2]) continue;
      let room = 1;
      while (y + room < this.height && !sol[y + room]) room++;
      out.push({ y, biome: this.latticeBiome(r(X), r(y + 1), r(Z), r(W)).index, room: room - 1 });
    }
    return out;
  }

  /** A dry spot near the origin, clear of the lava sea, with head room. */
  spawnPoint(): [number, number, number, number] {
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let r = 0; r < 2000; r += 8)
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(t) * r), w = Math.round(Math.sin(t) * r), z = (a * 7) % 5;
        this.sample(x, z, w, s);
        if (!s.ocean && s.height >= this.sea + 2 && REG.biomes[s.biome]!.ember !== 'sea' && (s.ceiling ?? 0) - s.height > 10) return [x + 0.5, s.height + 1, z + 0.5, w + 0.5];
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
    const H = this.height, sea = this.sea, L = COLUMN_LAYER, seed = this.seed, LY = this.LY;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    blocks.fill(0);
    const BEDROCK = B.bedrock, LAVA = B.lava;
    const CINDER = REG.id('cinder'), SOUL_GLASS = REG.id('soul_glass');
    const all = this.all;

    // 1. The padded lattice (one lattice cell beyond the column on every side).
    const grid = this.grid;
    for (let lw = 0; lw < NL; lw++)
      for (let lz = 0; lz < NL; lz++)
        for (let lx = 0; lx < NL; lx++) grid[lx + NL * (lz + NL * lw)] = this.latticeColumn(X0 + (lx - 1) * S, Z0 + (lz - 1) * S, W0 + (lw - 1) * S);
    // Biome at a block in padded coordinates (px = x + 4 for the column's own cells).
    const biomeAt = (px: number, y: number, pz: number, pw: number): EB =>
      all[grid[((px + 2) >> 2) + NL * (((pz + 2) >> 2) + NL * ((pw + 2) >> 2))]![2 * LY + ((y + 2) >> 2)]!]!;
    const corners = this.pts;
    // Density column at a block in padded coordinates.
    const column = (px: number, pz: number, pw: number) => {
      const ix = Math.min(NL - 2, px >> 2), iz = Math.min(NL - 2, pz >> 2), iw = Math.min(NL - 2, pw >> 2);
      for (let c = 0; c < 8; c++) corners[c] = grid[ix + (c & 1) + NL * (iz + ((c >> 1) & 1) + NL * (iw + ((c >> 2) & 1)))]!;
      this.densityColumn(X0 - S + px, Z0 - S + pz, W0 - S + pw, corners);
    };

    // 2. Fill.
    const sol = this.solid, T = this.colT;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const px = x + 4, pz = z + 4, pw = w + 4;
          column(px, pz, pw);
          this.solidColumn(X, Z, W, (y) => biomeAt(px, y, pz, pw));
          // The column's biome on the map: where you would stand on its floor.
          const main = biomeAt(px, this.floorOf().floor + 1, pz, pw);
          surface[i * 4] = Math.round(main.rgb[0] * 255);
          surface[i * 4 + 1] = Math.round(main.rgb[1] * 255);
          surface[i * 4 + 2] = Math.round(main.rgb[2] * 255);
          surface[i * 4 + 3] = main.index;
          let depth = -1;
          // The biome only changes every 4 cells up (its lattice band): look it up per band.
          const bcol = grid[((px + 2) >> 2) + NL * (((pz + 2) >> 2) + NL * ((pw + 2) >> 2))]!;
          for (let y = H - 1; y >= 0; y--) {
            let v: number;
            if (y === 0 || y >= H - 1) v = BEDROCK;
            else if (y <= 3 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - y * 0.15) v = BEDROCK;
            else if (y >= H - 5 && hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.6 - (H - 1 - y) * 0.15) v = BEDROCK;
            else if (sol[y]) {
              depth = depth < 0 ? 0 : depth + 1;
              const eb = all[bcol[2 * LY + ((y + 2) >> 2)]!]!;
              const wet = y < sea;
              const soil = eb.style === 'ash' ? 5 : 3;
              if (depth === 0) v = wet ? eb.under : eb.surface;
              else if (!sol[y - 1] && y > sea) v = eb.ceil; // the underside of a mass
              else if (depth <= soil) v = wet ? eb.under : eb.sub;
              else if (depth <= 12) v = eb.stone;
              else v = CINDER;
              // Soul-glass strata in canyon walls.
              if (eb.style === 'canyons' && depth > 0 && y > sea + 4 && y % 5 === 0) v = SOUL_GLASS;
              // Lava tubes through the rock: tunnels above the sea, lava below it.
              if (depth > 3 && y > 5) {
                const l = y >> 2;
                const tube = T[l]! + (T[l + 1]! - T[l]!) * (y & 3) * 0.25;
                if (tube < -0.6) v = y <= sea ? LAVA : 0;
              }
            } else {
              depth = -1;
              v = y <= sea ? LAVA : 0;
            }
            blocks[i + y * L] = v;
          }
        }

    // 3. Ores.
    this.oreBlobs(X0, Z0, W0, blocks);

    // 4. Features: emberglass under overhangs, trees and fungi on surfaces, tesseract frames.
    this.features(X0, Z0, W0, blocks, biomeAt, column);

    // 5. Plants and vents on every surface above the lava; hanging plants and molten
    // cascades under every overhang.
    const CASCADE = REG.id('molten_cascade');
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          for (let y = sea + 1; y < H - 6; y++) {
            const cur = blocks[i + y * L]!;
            if (cur === 0 && y > sea + 2) {
              // Under an overhang?
              const roof = blocks[i + (y + 1) * L]!;
              if (roof === 0 || !REG.solid[roof & 0xfff]) continue;
              const eb = biomeAt(x + 4, y, z + 4, w + 4);
              if (eb.style === 'falls' && hash4f(X, y, Z, W, seed ^ SALT_VENT) < 0.004) {
                // A molten cascade pours down to whatever is below.
                for (let k = y; k > 1 && blocks[i + k * L] === 0; k--) blocks[i + k * L] = CASCADE;
                continue;
              }
              if (!eb.hanging.length) continue;
              const pr = hash4f(X, y + 5, Z, W, seed ^ SALT_PLANT);
              let acc = 0;
              for (const pl of eb.hanging) {
                acc += pl.density;
                if (pr >= acc) continue;
                const len = 1 + (hash4(X, y, Z, W, seed ^ SALT_PLANT) % 6);
                for (let k = 0; k < len && y - k > sea + 1 && blocks[i + (y - k) * L] === 0; k++) blocks[i + (y - k) * L] = pl.id;
                break;
              }
              continue;
            }
            const top = cur;
            if (top === 0 || blocks[i + (y + 1) * L] !== 0 || !REG.solid[top & 0xfff]) continue;
            const eb = biomeAt(x + 4, y + 1, z + 4, w + 4);
            if (top !== eb.surface) continue;
            let vented = false;
            if (eb.vents.length) {
              const vr = hash4f(X, y, Z, W, seed ^ SALT_VENT);
              let acc = 0;
              for (const v of eb.vents) {
                acc += v.density;
                if (vr >= acc) continue;
                blocks[i + y * L] = v.id;
                vented = true;
                break;
              }
            }
            if (vented) continue;
            const pr = hash4f(X, y + 2, Z, W, seed ^ SALT_PLANT);
            let acc = 0;
            for (const pl of eb.plants) {
              acc += pl.density;
              if (pr >= acc) continue;
              blocks[i + (y + 1) * L] = pl.id;
              break;
            }
          }
        }

    // 6. Structures (citadels, forges, bridges...).
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});
  }

  /** Ore blobs: one chance per 8^4 cell per ore, a jittered 4D ball in host rock. */
  private oreBlobs(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const S8 = 8, M = 2;
    const seed = this.seed, host = this.host, L = COLUMN_LAYER;
    for (let k = 0; k < this.ores.length; k++) {
      const o = this.ores[k]!;
      for (let cw = Math.floor((W0 - M) / S8); cw <= Math.floor((W0 + 15 + M) / S8); cw++)
        for (let cz = Math.floor((Z0 - M) / S8); cz <= Math.floor((Z0 + 15 + M) / S8); cz++)
          for (let cx = Math.floor((X0 - M) / S8); cx <= Math.floor((X0 + 15 + M) / S8); cx++)
            for (let cy = Math.floor(o.y[0] / S8); cy <= Math.floor(o.y[1] / S8); cy++) {
              const h = hash4(cx, cy, cz, cw, seed ^ (SALT_ORE + k * 977));
              if (h / 4294967296 >= o.p) continue;
              const px = cx * S8 + ((h >>> 3) & 7) + 0.5, py = cy * S8 + ((h >>> 6) & 7) + 0.5, pz = cz * S8 + ((h >>> 9) & 7) + 0.5, pw = cw * S8 + ((h >>> 12) & 7) + 0.5;
              if (py < o.y[0] || py > o.y[1]) continue;
              const r = o.r[0] + (((h >>> 16) & 255) / 255) * (o.r[1] - o.r[0]);
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

  /**
   * Features that may cross column borders, anchored within 4 blocks of the column (one
   * lattice cell, so their terrain is known): emberglass clusters under overhangs, and trees,
   * fungi and crystal trees on surfaces at any height. Tesseract frames float in open air and
   * reach 8 blocks: their anchors use point queries.
   */
  private features(
    X0: number,
    Z0: number,
    W0: number,
    blocks: Uint16Array,
    biomeAt: (px: number, y: number, pz: number, pw: number) => EB,
    column: (px: number, pz: number, pw: number) => void,
  ): void {
    const M = 4, H = this.height, sea = this.sea, seed = this.seed;
    const glow = REG.id('emberglass');
    const sol = this.solid;
    for (let w = -M; w < 16 + M; w++)
      for (let z = -M; z < 16 + M; z++)
        for (let x = -M; x < 16 + M; x++) {
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const glowHere = hash4f(X, 9, Z, W, seed ^ SALT_CEIL) < 0.006;
          const r = hash4f(X, 0, Z, W, seed ^ SALT_FEATURE);
          const treeHere = r < 0.012;
          if (!glowHere && !treeHere) continue;
          const px = x + 4, pz = z + 4, pw = w + 4;
          column(px, pz, pw);
          this.solidColumn(X, Z, W, (y) => biomeAt(px, y, pz, pw));
          if (glowHere) {
            // Emberglass clusters hanging under overhangs (about every other one).
            for (let y = sea + 2; y < H - 8; y++) {
              if (sol[y] || !sol[y + 1] || hash4f(X, y, Z, W, seed ^ SALT_CEIL) >= 0.45) continue;
              const rr = 1.2 + hash4f(X, y + 1, Z, W, seed ^ SALT_CEIL) * 1.1;
              this.ball(blocks, X0, Z0, W0, X + 0.5, y + 0.8, Z + 0.5, W + 0.5, rr, (old) => (old === 0 || REG.fluid[old & 0xfff] ? old : glow), true);
            }
          }
          if (!treeHere) continue;
          for (let y = sea + 1; y < H - 8; y++) {
            if (!sol[y] || sol[y + 1] || sol[y + 2]) continue;
            const eb = biomeAt(px, y + 1, pz, pw);
            let acc = 0;
            for (const t of eb.trees) {
              acc += t.density;
              if (r >= acc) continue;
              if (t.def.shape !== 'tesseract') {
                let ceil = y + 2;
                while (ceil < H - 1 && !sol[ceil]) ceil++;
                this.grow(blocks, X0, Z0, W0, X, y + 1, Z, W, t, ceil);
              }
              break;
            }
          }
        }
    this.frames(X0, Z0, W0, blocks);
  }

  /**
   * Floating tesseract frames (Shattered Tesseracts): sparse anchors within 8 blocks of the
   * column, in open air in that biome.
   */
  private frames(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const M = 8, seed = this.seed;
    const r = (v: number) => Math.round(v / S) * S;
    for (let w = -M; w < 16; w++)
      for (let z = -M; z < 16; z++)
        for (let x = -M; x < 16; x++) {
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const h = hash4(X, 3, Z, W, seed ^ SALT_FRAME);
          if (h / 4294967296 >= 0.0012) continue;
          const y = this.sea + 12 + ((h >>> 4) % Math.max(1, this.height - this.sea - 30));
          const eb = this.latticeBiome(r(X), r(y), r(Z), r(W));
          const t = eb.trees.find((tr) => tr.def.shape === 'tesseract');
          if (!t) continue;
          this.densityColumn(X, Z, W);
          if (this.dens(y) > -0.2) continue; // only in open air
          this.grow(blocks, X0, Z0, W0, X, y, Z, W, t, this.height - 6);
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
    if (def.shape !== 'tesseract' && top - y < 2) return; // no room under the overhang
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
      case 'spire': {
        // A tapering 4D spike: shrinking balls of the log up to a glowing tip.
        for (let k = 0; k < Hh && y + k < ceil - 1; k++) {
          const rr = r * (1 - k / Hh) + 0.35;
          this.ball(blocks, X0, Z0, W0, X + 0.5, y + k + 0.5, Z + 0.5, W + 0.5, rr, (old) => (air(old) ? log : old), true);
        }
        put(X, Math.min(ceil - 2, y + Hh), Z, W, leaf);
        break;
      }
      case 'tesseract': {
        // A floating hypercube frame: 32 edges (log) between 16 glowing vertices (leaves).
        const e = Hh;
        for (let v = 0; v < 16; v++) {
          const px = X + (v & 1 ? e : 0), py = y + (v & 2 ? e : 0), pz = Z + (v & 4 ? e : 0), pw = W + (v & 8 ? e : 0);
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
