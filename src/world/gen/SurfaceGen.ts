// Surface generator (Phase 2, "surface_v2"). Deterministic from the seed; runs in workers.
//
//  1. Climate (lattice) -> biome + height per (x, z, w); rivers, volcano cones, dune ripples,
//     mesa terraces, marsh flats.
//  2. Fill: bedrock, deepstone, stone / biome stone, mesa bands (shift with W), soil layers,
//     water / ice.
//  3. Carvers (4D): hyper-caverns, worm tunnels, fissures, Ana Sheets, ravines, sinkholes,
//     lava below y 10, flooded humid caves.
//  4. Ore veins (4D capsules), geodes, fossils, frost spires, floating islands.
//  5. Cave biomes (Lush, Dripstone, Silent Layer) decorate floors and ceilings.
//  6. Trees, plants, corals, kelp (with a margin so features cross column borders).
//
// Output is a dense column: index = x + 16 z + 256 w + 4096 y (see denseIndex()).

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { B, REG, makeVoxel } from '../../content/registry';
import type { BiomeDef, RealmDef, TreeDef } from '../../content/types';
import { COLUMN_LAYER } from '../constants';
import { Climate, ClimateLattice, type BiomePick, type ClimateSample } from './surface/Climate';
import { CaveFields, NF } from './surface/Caves';
import { StructureGen, type GenExtra } from './structures/StructureGen';

export interface GenOptions {
  /** Stamp the engine test garden next to spawn (test worlds / R6 reference views). */
  garden?: boolean;
}

export interface ColumnSample {
  height: number;
  biome: number;
  temperature?: number;
  humidity?: number;
  grass: [number, number, number];
  ocean?: boolean;
  river?: boolean;
  /** Enclosed realms: the lowest cell of the cavern ceiling above `height`. */
  ceiling?: number;
}

interface OreCfg {
  id: number;
  /** The deepstone variant. */
  deep: number;
  minY: number;
  maxY: number;
  /** Fraction of the host rock in [minY, maxY] that becomes this ore. */
  share: number;
  /** Ball radius range; a vein is 1-3 balls. */
  r: [number, number];
  /** Mean vein volume (cells). */
  veinVolume: number;
  mountains?: boolean;
  salt: number;
}

interface ResolvedTree {
  def: TreeDef;
  log: number;
  leaves: number;
  density: number;
}

/** The deepstone layer (Minecraft's deepslate): below DEEP_LO, dithered up to DEEP_HI. */
const DEEP_LO = 40;
const DEEP_HI = 48;
/** Caves at or below this are lava (Minecraft's lava aquifers). */
const LAVA_Y = 12;
/** Water tables of flooded regions. */
const AQUIFER_LO = 30;
const AQUIFER_HI = 80;
/** Ana Sheets (huge 2D cavities, one per 96-block W cell) start at this height. */
const SHEET_Y = 40;

const SALT_TREE = 0x7ee5;
const SALT_PLANT = 0x62a5;
const SALT_VEIN = 0x03e5;
const SALT_BEDROCK = 0xbed0;
const SALT_GEODE = 0x9e0d;
const SALT_SPIRE = 0x5b1e;
const SALT_VOLC = 0x0c0e;
const SALT_SINK = 0x51c4;
const SALT_FOSSIL = 0xf055;
const SALT_SHEET = 0x5ee7;
const SALT_LAKE = 0x1a4e;

export class SurfaceGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  readonly climate: Climate;
  private readonly lattice = new ClimateLattice();
  private readonly caves: CaveFields;
  private readonly biomes: BiomeDef[];
  private readonly nRiver: SimplexNoise;
  /** River width along its course, the stream network, river islets, cave mouths. */
  private readonly nRiverW: SimplexNoise;
  private readonly nStream: SimplexNoise;
  private readonly nIslet: SimplexNoise;
  private readonly nEntrance: SimplexNoise;
  private readonly nRavine: SimplexNoise;
  private readonly nRavMask: SimplexNoise;
  private readonly nSheet: SimplexNoise;
  private readonly nSheetMask: SimplexNoise;
  private readonly nBand: SimplexNoise;
  private readonly nCaveHum: SimplexNoise;
  private readonly nCaveWeird: SimplexNoise;
  private readonly nIsland: SimplexNoise;
  // per-biome resolved ids
  private readonly surf: Uint16Array;
  private readonly sub: Uint16Array;
  private readonly under: Uint16Array;
  private readonly stoneOf: Uint16Array;
  private readonly treesOf: ResolvedTree[][];
  private readonly plantsOf: { id: number; density: number; placement: string }[][];
  private readonly ventsOf: { id: number; density: number }[][];
  /** Underground biomes: [humidity, weirdness, depth, biome index] each. */
  private readonly caveClimate: Float64Array;
  /** Underground biomes: floor block, ceiling block (0 = keep stone), [floor, ceiling] plant tables. */
  private readonly caveFloor: Uint16Array;
  private readonly caveCeil: Uint16Array;
  private readonly cavePlants: Float64Array[];
  private readonly ores: OreCfg[];
  private readonly host: Uint8Array;
  private readonly ids: Record<string, number>;
  private readonly idx: Record<string, number>;
  readonly options: GenOptions;
  garden = false;
  gardenOrigin: [number, number, number, number] = [0, 0, 0, 0];

  // scratch (generate() is not re-entrant; each worker owns one generator)
  private readonly sHeights = new Int16Array(COLUMN_LAYER);
  private readonly sBiome = new Uint8Array(COLUMN_LAYER);
  private readonly sShare = new Float32Array(COLUMN_LAYER);
  private readonly sRiver = new Uint8Array(COLUMN_LAYER);
  private readonly sOcean = new Uint8Array(COLUMN_LAYER);
  private readonly sMount = new Float32Array(COLUMN_LAYER);
  private readonly sCrater = new Int16Array(COLUMN_LAYER);
  private readonly sHas = new Set<number>();
  private readonly cs: ClimateSample = { cont: 0, temp: 0, hum: 0, weird: 0, mountains: 0, erosion: 0, relief: 0 };
  private readonly bp: BiomePick = { biome: 0, share: 1, heightBias: 0, heightScale: 1, grass: [0, 0, 0], ocean: false, depth: 0 };

  constructor(seed: number, realm: RealmDef, options: GenOptions = {}) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.options = options;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    this.biomes = REG.biomes;
    this.climate = new Climate(this.seed, this.biomes, this.sea, this.height);
    this.caves = new CaveFields(this.seed, this.height);
    this.nRiver = new SimplexNoise(this.seed ^ 0xa101);
    this.nRiverW = new SimplexNoise(this.seed ^ 0xb101);
    this.nStream = new SimplexNoise(this.seed ^ 0xb202);
    this.nIslet = new SimplexNoise(this.seed ^ 0xb303);
    this.nEntrance = new SimplexNoise(this.seed ^ 0xb404);
    this.nRavine = new SimplexNoise(this.seed ^ 0xa202);
    this.nRavMask = new SimplexNoise(this.seed ^ 0xa303);
    this.nSheet = new SimplexNoise(this.seed ^ 0xa404);
    this.nSheetMask = new SimplexNoise(this.seed ^ 0xa505);
    this.nBand = new SimplexNoise(this.seed ^ 0xa606);
    this.nCaveHum = new SimplexNoise(this.seed ^ 0xa707);
    this.nCaveWeird = new SimplexNoise(this.seed ^ 0xa808);
    this.nIsland = new SimplexNoise(this.seed ^ 0xa909);
    const id = (n: string) => REG.id(n);
    this.surf = Uint16Array.from(this.biomes.map((b) => id(b.surface)));
    this.sub = Uint16Array.from(this.biomes.map((b) => id(b.subsurface)));
    this.under = Uint16Array.from(this.biomes.map((b) => id(b.underwater)));
    this.stoneOf = Uint16Array.from(this.biomes.map((b) => (b.stone ? id(b.stone) : B.stone)));
    this.treesOf = this.biomes.map((b) =>
      b.trees.map((t) => {
        const def = REG.tree(t.tree);
        return { def, log: id(def.log), leaves: def.leaves ? id(def.leaves) : 0, density: t.density };
      }),
    );
    this.plantsOf = this.biomes.map((b) => b.plants.map((p) => ({ id: id(p.block), density: p.density, placement: p.placement ?? 'surface' })));
    this.ventsOf = this.biomes.map((b) => (b.vents ?? []).map((v) => ({ id: id(v.block), density: v.density })));
    this.caveClimate = Float64Array.from(this.biomes.flatMap((b, i) => (b.kind === 'underground' && (b.realm ?? 'surface') === 'surface' ? [b.climate[0], b.climate[1], b.climate[2], i] : [])));
    this.caveFloor = Uint16Array.from(this.biomes.map((b) => (b.kind === 'underground' ? id(b.surface) : 0)));
    this.caveCeil = Uint16Array.from(this.biomes.map((b) => (b.kind === 'underground' && b.ceiling ? id(b.ceiling) : 0)));
    this.cavePlants = [];
    for (const b of this.biomes)
      for (const where of ['floor', 'ceiling'])
        this.cavePlants.push(Float64Array.from(b.kind === 'underground' ? b.plants.filter((p) => p.placement === where).flatMap((p) => [id(p.block), p.density]) : []));
    const names = [
      'deepstone', 'terracotta_white', 'terracotta_orange', 'terracotta_yellow', 'terracotta_red', 'terracotta_brown', 'terracotta_tan',
      'packed_ice', 'blue_ice', 'frost_stone', 'packed_snow', 'skystone', 'cloud_moss', 'hollow_stone', 'basalt', 'scoria', 'magma_block',
      'moss_block', 'dripstone_block', 'echo_moss', 'hush_stone', 'pointed_dripstone', 'cave_fern', 'glow_berries', 'spore_blossom',
      'hanging_vine', 'echo_sprout', 'geode_shell', 'calcite', 'amethyst', 'amethyst_cluster', 'bone_block', 'luminous_moss',
      'limestone', 'savanna_stone', 'weathered_stone', 'fossil_stone', 'silent_shale', 'tidestone', 'dune_sand', 'red_sand',
      'bleached_sand', 'mycelium', 'podzol', 'snowy_turf', 'dry_turf', 'steppe_turf', 'petal_turf', 'glass_turf', 'orchard_turf',
      'forest_turf', 'loam', 'jungle_soil', 'fen_mud', 'marsh_mud', 'sea_sand', 'dark_gravel', 'ash_soil', 'mud', 'kelp', 'frost_kelp',
      'seagrass', 'reeds',
    ];
    this.ids = {};
    for (const n of names) this.ids[n] = id(n);
    this.idx = { lush: REG.biomeIndex('lush_caves'), drip: REG.biomeIndex('dripstone_caves'), silent: REG.biomeIndex('silent_layer'), frost: REG.biomeIndex('frost_spires'), hollow: REG.biomeIndex('hollow_peaks'), volcanic: REG.biomeIndex('volcanic_highlands'), bone: REG.biomeIndex('bone_desert'), mesa: REG.biomeIndex('sunscar_mesa') };
    const I = this.ids;
    this.host = new Uint8Array(4096);
    for (const n of ['stone', 'limestone', 'savanna_stone', 'weathered_stone', 'fossil_stone', 'frost_stone', 'silent_shale', 'tidestone', 'deepstone', 'basalt', 'hollow_stone', 'sandstone']) this.host[REG.id(n)] = 1;
    // Every Surface biome's own stone holds ores too.
    for (const b of this.biomes) if (b.stone && (b.realm ?? 'surface') === 'surface' && REG.solid[REG.id(b.stone)]) this.host[REG.id(b.stone)] = 1;
    // share: fraction of the host rock in [minY, maxY] aimed for (veins landing in air or
    // overlapping lose some: the realised share is about a half to two thirds of it). About
    // 2.5x Minecraft's density: ores show on most cave walls, and veins are fat enough that
    // their 3D cross-sections read as veins (a 4D ball's slice is smaller than the ball).
    const ore = (name: string, deep: string | null, minY: number, maxY: number, share: number, r: [number, number], salt: number, mountains = false): OreCfg => {
      const rm = (r[0] + r[1]) / 2;
      return { id: id(name), deep: deep ? id(deep) : id(name), minY, maxY, share, r, salt, mountains, veinVolume: 2 * ((Math.PI * Math.PI) / 2) * rm ** 4 };
    };
    this.ores = [
      ore('coal_ore', null, 24, 150, 0.032, [1.3, 2.1], 1),
      ore('copper_ore', null, 30, 125, 0.016, [1.2, 2.0], 2),
      ore('iron_ore', 'deep_iron_ore', 6, 135, 0.016, [1.2, 1.9], 3),
      ore('gold_ore', 'deep_gold_ore', 4, 70, 0.005, [1.0, 1.6], 4),
      ore('azurite_ore', 'deep_azurite_ore', 4, 80, 0.0045, [1.0, 1.6], 5),
      ore('fluxite_ore', 'deep_fluxite_ore', 2, 50, 0.01, [1.0, 1.7], 6),
      ore('verdant_ore', null, 100, 180, 0.004, [0.8, 1.2], 7, true),
      ore('hyperite_ore', 'deep_hyperite_ore', 2, 36, 0.0024, [0.9, 1.4], 8),
      ore('silver_ore', 'deep_silver_ore', 6, 90, 0.0055, [1.0, 1.6], 9),
      ore('sulfur_ore', 'deep_sulfur_ore', 2, 60, 0.008, [1.1, 1.9], 10),
      ore('lumenite_ore', 'deep_lumenite_ore', 10, 110, 0.0035, [0.9, 1.4], 11),
      ore('tesserite_ore', 'deep_tesserite_ore', 2, 40, 0.0018, [0.9, 1.3], 12),
    ];
    void I;
    this.garden = options.garden ?? false;
    if (this.garden) {
      const sp = this.findFlat();
      this.gardenOrigin = [sp[0], 0, sp[2], sp[3]];
      this.gardenFloorY = sp[1];
    }
  }

  // ------------------------------------------------------------------ sampling

  private riverMask(x: number, z: number, w: number): number {
    return Math.abs(this.nRiver.fbm3(x / 540, z / 540, w / 540, 2));
  }

  /** Climate, biome and final height at a world position (direct evaluation, no lattice). */
  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const c = this.climate.sample(x, z, w, this.cs);
    const p = this.climate.pick(c, this.bp);
    let h = this.climate.heightAt(x, z, w, c, p);
    const rv = this.applyRiver(h, x, z, w, p, c);
    h = rv.h;
    out.height = h;
    out.biome = p.biome;
    out.temperature = c.temp;
    out.humidity = c.hum;
    out.grass[0] = p.grass[0];
    out.grass[1] = p.grass[1];
    out.grass[2] = p.grass[2];
    out.ocean = p.ocean;
    out.river = rv.river;
    return out;
  }

  private readonly rvOut = { h: 0, river: false };
  /**
   * Rivers: the near-zero set of a 3D noise over (x, z, w), i.e. a 2D surface in the
   * horizontal 3-space (a 3D hypersurface in 4D), so a slice shows it as a winding channel
   * that shifts as you move kata/ana. Playtest (0.7.1): the width varies along the course
   * (a creek here, a wide river there), a second, finer network of streams runs through the
   * lowlands, rivers cut gorges with steep walls through mountains instead of fading out, and
   * wide stretches have islets. The bed sits below sea level; banks rise smoothly.
   */
  private applyRiver(h: number, x: number, z: number, w: number, p: BiomePick, c: ClimateSample): { h: number; river: boolean } {
    const o = this.rvOut;
    o.h = h;
    o.river = false;
    if (p.ocean) return o;
    const sea = this.sea;
    const mount = c.mountains;
    // Rivers cut through everything but the very highest peaks.
    const strength = Math.min(1, Math.max(0, (1.02 - mount) / 0.12));
    if (strength > 0) {
      const r = this.riverMask(x, z, w);
      const wn = 0.5 + 0.5 * this.nRiverW.n3(x / 280, z / 280, w / 280);
      const gorge = Math.min(1, Math.max(0, (mount - 0.35) / 0.3));
      // Half widths in mask units (about 160 blocks of terrain per unit...): bed, then bank.
      const half = (0.014 + 0.05 * wn * wn) * (1 - 0.4 * gorge);
      const bank = half + (0.03 + 0.03 * wn) * (1 - 0.65 * gorge);
      if (r < bank) {
        let target: number;
        if (r < half) {
          const t = r / half;
          target = sea - 2 - Math.round(1 + 3 * wn) * (1 - t * t);
          // Islets in the wide stretches.
          if (wn > 0.6 && t < 0.8 && this.nIslet.n3(x / 15, z / 15, w / 15) > 0.5 - 0.3 * (wn - 0.6)) target = sea + 1;
        } else {
          const t = (r - half) / (bank - half);
          target = sea + t * t * Math.max(0, h - sea);
        }
        const nh = Math.min(h, Math.floor(h + (target - h) * strength));
        if (nh < o.h) {
          o.h = nh;
          o.river = r < half && nh < sea;
        }
      }
    }
    // Streams: thin channels through the lowlands (they never leave the sea-level plain).
    if (!o.river && h - sea < 14 && h > sea && mount < 0.3) {
      const sr = Math.abs(this.nStream.fbm3(x / 230, z / 230, w / 230, 2));
      if (sr < 0.034) {
        const t = sr < 0.011 ? 0 : (sr - 0.011) / 0.023;
        const target = t === 0 ? sea - 1 : sea + t * t * Math.max(0, h - sea);
        const nh = Math.min(h, Math.floor(target));
        if (nh < o.h) {
          o.h = nh;
          o.river = t === 0;
        }
      }
    }
    return o;
  }

  /** Terrain height including the garden plateau (used by spawn and tests). */
  heightAt(x: number, z: number, w: number, s: ColumnSample): number {
    this.sample(x, z, w, s);
    if (this.garden && this.inGardenAbs(x, z, w)) return this.gardenFloor();
    return s.height;
  }

  /** Nearest dry land to the origin (spiral search in X/Z at w = 0). */
  private findLand(): [number, number, number, number] {
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let r = 0; r <= 2048; r += 24) {
      const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 24));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        this.sample(x, z, 0, s);
        if (!s.ocean && !s.river && s.height >= this.sea + 1 && s.height < this.sea + 40) return [x, s.height, z, 0];
      }
    }
    return [0, this.sea + 1, 0, 0];
  }

  /**
   * Test garden site: the nearest dry spot whose whole footprint (plus a margin) is within a
   * few blocks of one height, so the plateau neither sits in a pit nor on a cliff. Returns
   * [x, floorY, z, w]. Test worlds only.
   */
  private findFlat(): [number, number, number, number] {
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    let best: [number, number, number, number] | null = null;
    let bestSpread = 1e9;
    for (let r = 0; r <= 3072; r += 32) {
      const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 32));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        this.sample(x, z + 10, 0, s);
        if (s.ocean || s.river || s.height < this.sea + 3 || s.height > this.sea + 24) continue;
        let lo = 1e9, hi = -1e9, sum = 0, n = 0, wet = false;
        for (let dw = GARDEN.w0 - 4; dw <= GARDEN.w1 + 4 && !wet; dw += 4)
          for (let dz = GARDEN.z0 - 4; dz <= GARDEN.z1 + 4 && !wet; dz += 6)
            for (let dx = GARDEN.x0 - 4; dx <= GARDEN.x1 + 4; dx += 6) {
              this.sample(x + dx, z + dz, dw, s);
              if (s.ocean || s.river || s.height <= this.sea) {
                wet = true;
                break;
              }
              lo = Math.min(lo, s.height);
              hi = Math.max(hi, s.height);
              sum += s.height;
              n++;
            }
        if (wet) continue;
        const spread = hi - lo;
        if (spread < bestSpread) {
          bestSpread = spread;
          best = [x, Math.round(sum / n), z, 0];
        }
        if (spread <= 5) return best!;
      }
      if (best && r >= 1024) return best;
    }
    return best ?? [0, this.sea + 3, 0, 0];
  }

  spawnPoint(): [number, number, number, number] {
    const [x, , z, w] = this.garden ? [this.gardenOrigin[0], 0, this.gardenOrigin[2], this.gardenOrigin[3]] : this.findLand();
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    const h = this.heightAt(x, z - (this.garden ? 4 : 0), w, s);
    return [x + 0.5, Math.max(h, this.sea) + 1.01, z - (this.garden ? 4 : 0) + 0.5, w + 0.5];
  }

  /**
   * The Ana Sheet of the 96-block W cell containing `w`, at (x, z): its centre w and y, or
   * null where the sheet is masked out. (Structures use it to put vaults beside a sheet.)
   */
  sheetAt(x: number, z: number, w: number): { w: number; y: number } | null {
    const cell = Math.floor(w / 96);
    const sh = hash4(cell, 0, 0, 0, this.seed ^ SALT_SHEET);
    const wc = cell * 96 + 48 + 20 * this.nSheet.n2(x / 150 + cell * 7.3, z / 150);
    if (this.nSheetMask.n3(x / 300, z / 300, wc / 300) <= -0.15) return null;
    return { w: wc, y: SHEET_Y + (sh % 44) + 5 * this.nSheet.n2(x / 90, z / 90 + 50) };
  }

  /** Underground (cave) biome index at a position, or -1 for plain caves. */
  caveBiomeAt(x: number, y: number, z: number, w: number): number {
    return this.caveBiome(this.nCaveHum.n3(x / 170, z / 170, w / 170), this.nCaveWeird.n3(x / 220, z / 220, w / 220), y);
  }

  /**
   * The cave biome nearest to (humidity, weirdness, depth) among the underground biomes'
   * climate points, or -1 (plain stone caves) when none is close.
   */
  private caveBiome(hum: number, weird: number, y: number): number {
    // Spread the noise over 0..1 (it clusters around 0), like the surface climate.
    const h = 0.5 + 0.5 * Math.tanh(2.6 * hum), wd = 0.5 + 0.5 * Math.tanh(2.6 * weird);
    const depth = Math.max(0, Math.min(1, (this.sea - y) / Math.max(1, this.sea - 4)));
    const cl = this.caveClimate;
    let best = -1, bd = 0.075;
    for (let k = 0; k < cl.length; k += 4) {
      const a = h - cl[k]!, b = wd - cl[k + 1]!, c = depth - cl[k + 2]!;
      const d2 = a * a + b * b + c * c * 0.6;
      if (d2 < bd) {
        bd = d2;
        best = cl[k + 3]!;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ generate

  /** Structures (built lazily: the main thread only needs them for atlases and tests). */
  private structGen: StructureGen | null = null;
  get structures(): StructureGen {
    return (this.structGen ??= new StructureGen(this));
  }

  /** Nearest start of any of the named structures (atlas items, tests). */
  nearestStructure(names: string[], x: number, z: number, w: number, maxDist = 1200): { name: string; x: number; y: number; z: number; w: number } | null {
    const st = this.structures.placer.nearest(names, x, z, w, maxDist);
    return st ? { name: st.def.name, x: st.x, y: st.y, z: st.z, w: st.w } : null;
  }

  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array, extra?: GenExtra): void {
    const H = this.height;
    const sea = this.sea;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    const I = this.ids;
    const heights = this.sHeights;
    const biomeOf = this.sBiome;
    const shareOf = this.sShare;
    const riverOf = this.sRiver;
    const oceanOf = this.sOcean;
    const mountOf = this.sMount;
    const craterLava = this.sCrater.fill(-1);
    blocks.fill(0);
    const has = this.sHas;
    has.clear();

    // 1. Climate lattice -> biome, height, surface colour.
    this.lattice.fill(this.climate, X0, Z0, W0);
    const c = this.cs;
    const p = this.bp;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          this.lattice.at(x, z, w, c);
          this.climate.pick(c, p);
          let h = this.climate.heightAt(X, Z, W, c, p);
          const rv = this.applyRiver(h, X, Z, W, p, c);
          h = rv.h;
          heights[i] = h;
          biomeOf[i] = p.biome;
          shareOf[i] = p.share;
          riverOf[i] = rv.river ? 1 : 0;
          oceanOf[i] = p.ocean ? 1 : 0;
          mountOf[i] = c.mountains;
          has.add(p.biome);
          surface[i * 4] = Math.round(p.grass[0] * 255);
          surface[i * 4 + 1] = Math.round(p.grass[1] * 255);
          surface[i * 4 + 2] = Math.round(p.grass[2] * 255);
          surface[i * 4 + 3] = p.biome;
        }
    if (has.has(this.idx.volcanic!)) this.volcanoes(X0, Z0, W0, heights, biomeOf, craterLava);

    // 2 + 3. Fill and carve.
    this.caves.fill(X0, Z0, W0);
    const cv = this.caves.colv;
    const L = COLUMN_LAYER;
    const seed = this.seed;
    const deepstone = I.deepstone!;
    // Hoisted ids: property loads (through module bindings) are measurable in the voxel loops.
    const STONE = B.stone, BEDROCK = B.bedrock, WATER = B.water, LAVA = B.lava, ICE = B.ice, SAND = B.sand, SMOOTH = B.smooth_stone;
    const nf = NF;
    const sheetCell = 96;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++) {
        let rowTop = 0;
        for (let x = 0; x < 16; x++) rowTop = Math.max(rowTop, heights[x + (z << 4) + (w << 8)]!);
        this.caves.row(z, w, rowTop);
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const h = heights[i]!;
          const bi = biomeOf[i]!;
          const biome = this.biomes[bi]!;
          const isOcean = oceanOf[i] === 1;
          const underwater = h < sea;
          const garden = this.garden && this.inGardenAbs(X, Z, W);
          const topY = Math.min(H - 1, garden ? this.gardenFloor() : h);
          const beach = !underwater && !isOcean && h <= sea + 1 && biome.precipitation !== 'snow' && bi !== this.idx.mesa && riverOf[i] === 0;
          const topBlock = garden ? SMOOTH : beach ? SAND : underwater ? this.under[bi]! : this.surf[bi]!;
          const subBlock = beach ? SAND : garden ? STONE : underwater ? this.under[bi]! : this.sub[bi]!;
          const stoneB = this.stoneOf[bi]!;
          const mesa = bi === this.idx.mesa && shareOf[i]! > 0.45;
          const bandShift = mesa ? 3 * this.nBand.n2(X / 40, Z / 40) + 0.35 * W : 0;

          // Solid fill, bottom to top, in segments.
          blocks[i] = BEDROCK;
          for (let y = 1; y <= 3 && y <= topY; y++) blocks[i + y * L] = hash4f(X, y, Z, W, seed ^ SALT_BEDROCK) < 0.55 - y * 0.15 ? BEDROCK : deepstone;
          const soil = topY - 3; // topY-3 .. topY-1 soil, topY top block
          const bandLo = mesa ? sea - 5 : 1e9;
          const biomeStoneLo = topY - 15;
          for (let y = 4; y < soil; y++) {
            let v: number;
            if (y < DEEP_LO || (y < DEEP_HI && hash4f(X, y, Z, W, seed) < (DEEP_HI - y) / (DEEP_HI - DEEP_LO))) v = deepstone;
            else if (y >= bandLo) v = this.mesaBand(y, bandShift);
            else if (y >= biomeStoneLo) v = stoneB;
            else v = STONE;
            blocks[i + y * L] = v;
          }
          for (let y = Math.max(4, soil); y < topY; y++) blocks[i + y * L] = subBlock;
          if (topY >= 4) blocks[i + topY * L] = topBlock;
          for (let y = topY + 1; y <= sea; y++) blocks[i + y * L] = y === sea && biome.frozenWater ? ICE : WATER;

          if (craterLava[i]! > 0) {
            for (let y = topY + 1; y <= craterLava[i]!; y++) blocks[i + y * L] = LAVA;
          }

          // Carvers (4D): only below the roof.
          // Cave mouths: in some zones the roof is open and the tunnels near the surface are wide,
          // so caves daylight in hillsides and fields (0.7.1: you could only enter by digging).
          const dry = !underwater && !garden && !riverOf[i];
          const mouth = dry ? Math.max(0, Math.min(1, (this.nEntrance.n3(X / 110, Z / 110, W / 110) - 0.56) / 0.18)) : 0;
          const roof = !dry ? 7 : mouth > 0 ? 0 : mountOf[i]! > 0.5 ? 3 : 1;
          const carveTop = topY - roof; // inclusive
          // Under the sea, ravines cut through the floor and fill with water; on land they open to the sky.
          const wetRavine = underwater && !garden;
          const yEnd = wetRavine || dry ? topY : carveTop;
          if (yEnd < 4) continue;
          this.caves.column(x);
          // Ana Sheet: a huge 2D cavity {w ~ wc(x,z), y ~ yc(x,z)} per 96-block W cell.
          const cell = Math.floor(W / sheetCell);
          const sh = hash4(cell, 0, 0, 0, seed ^ SALT_SHEET);
          const wc = cell * sheetCell + 48 + 20 * this.nSheet.n2(X / 150 + cell * 7.3, Z / 150);
          const inSheetW = Math.abs(W + 0.5 - wc) < 1.0 && this.nSheetMask.n3(X / 300, Z / 300, W / 300) > -0.15;
          const yc = SHEET_Y + (sh % 44) + 5 * this.nSheet.n2(X / 90, Z / 90 + 50);
          const sheetLo = inSheetW ? Math.ceil(yc - 2) : 1e9, sheetHi = inSheetW ? Math.min(topY - 5, Math.floor(yc + 1)) : -1;
          // Ravine: a thin 2D sheet in (x, z, w), cut vertically.
          const ravMask = this.nRavMask.n3(X / 360, Z / 360, W / 360);
          const rav = ravMask > 0.3 ? Math.abs(this.nRavine.n3(X / 120, Z / 120, W / 120)) : 1;
          const ravFloor = h - 14 - Math.floor(26 * Math.min(1, (ravMask - 0.3) * 3));
          // Aquifers: in wet regions, caves below the region's water table are flooded.
          const wet = this.nCaveHum.n3(X / 170, Z / 170, W / 170) > 0.3;
          const table = wet ? AQUIFER_LO + Math.floor((AQUIFER_HI - AQUIFER_LO) * (0.5 + 0.5 * this.nCaveWeird.n3(X / 300 + 17, Z / 300, W / 300))) : -1;
          const noodleTop = sea - 8;
          const yTop = H - 1;
          for (let y = 4; y <= yEnd && y < yTop; y++) {
            if (y > carveTop) {
              if (y > ravFloor && rav < 0.022 * Math.min(1, (y - ravFloor) / 8)) blocks[i + y * L] = wetRavine ? WATER : 0;
              continue;
            }
            // Cave fields, linearly interpolated between 4-block lattice levels.
            const ly = y >> 2, t = (y & 3) * 0.25;
            const o = ly * nf, o2 = o + nf;
            const cheese = cv[o]! + (cv[o2]! - cv[o]!) * t;
            // Caverns open up the deeper you go (and close in toward the surface).
            const depth01 = y < sea ? (sea - y) / sea : 0;
            let carve = cheese > 0.62 - 0.26 * depth01;
            if (!carve) {
              // Spaghetti tunnels, wider in the deep.
              const r = (0.055 + 0.035 * depth01 + 0.02 * (cheese * 0.5 + 0.5)) * (1 + 0.6 * mouth * Math.max(0, 1 - (topY - y) / 20));
              const s1 = cv[o + 1]! + (cv[o2 + 1]! - cv[o + 1]!) * t;
              if (s1 < r && s1 > -r) {
                const s2 = cv[o + 2]! + (cv[o2 + 2]! - cv[o + 2]!) * t;
                carve = s2 < r && s2 > -r;
              }
              // Noodle passages, below the near-surface rock.
              if (!carve && y <= noodleTop) {
                const n1 = cv[o + 3]! + (cv[o2 + 3]! - cv[o + 3]!) * t;
                if (n1 < 0.04 && n1 > -0.04) {
                  const n2 = cv[o + 4]! + (cv[o2 + 4]! - cv[o + 4]!) * t;
                  carve = n2 < 0.04 && n2 > -0.04;
                }
              }
              if (!carve) carve = y >= sheetLo && y <= sheetHi && Math.abs(y + 0.5 - yc) < 1.5;
              if (!carve && y > ravFloor && rav < 0.022 * Math.min(1, (y - ravFloor) / 8)) {
                if (wetRavine) {
                  blocks[i + y * L] = WATER;
                  continue;
                }
                carve = true;
              }
            }
            if (carve) blocks[i + y * L] = y <= LAVA_Y ? LAVA : y < table ? WATER : 0;
          }
        }
      }

    // 4. Lakes, sinkholes, ore veins, geodes, fossils, spires, floating islands.
    this.lakes(X0, Z0, W0, heights, blocks);
    this.sinkholes(X0, Z0, W0, heights, blocks);
    this.oreVeins(cx, cz, cw, blocks, mountOf);
    this.geodes(X0, Z0, W0, blocks);
    if (has.has(this.idx.bone!)) this.fossils(X0, Z0, W0, heights, biomeOf, blocks);
    if (has.has(this.idx.frost!)) this.spires(X0, Z0, W0, heights, biomeOf, shareOf, blocks);
    if (has.has(this.idx.hollow!)) this.islands(X0, Z0, W0, heights, biomeOf, shareOf, blocks);

    // 5. Cave biomes.
    this.decorateCaves(X0, Z0, W0, heights, blocks);

    // 6. Trees and plants.
    this.vegetation(X0, Z0, W0, heights, biomeOf, blocks);

    // 7. Structures (villages, temples, dungeons...), with chests, spawners and villagers.
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});

    if (this.garden) stampGarden(blocks, X0 - this.gardenOrigin[0], Z0 - this.gardenOrigin[2], W0 - this.gardenOrigin[3], this.gardenFloor(), H);
  }

  private bandOrder: Uint16Array | null = null;
  private mesaBand(y: number, shift: number): number {
    const I = this.ids;
    const order = (this.bandOrder ??= Uint16Array.from([I.terracotta_orange!, I.terracotta_white!, I.terracotta_yellow!, I.terracotta_red!, I.terracotta_tan!, I.terracotta_brown!, I.terracotta_orange!, I.terracotta_red!]));
    const k = Math.floor((y + shift) / 2);
    return order[((k % 8) + 8) % 8]!;
  }

  // ------------------------------------------------------------------ features

  private readonly lakeS: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
  /** Lake grid cell size and maximum radius. */
  static readonly LAKE_CELL = 64;
  static readonly LAKE_RMAX = 26;
  /** Lakes are this much longer along W than across: a lake stays in view over many slices. */
  static readonly LAKE_WSTRETCH = 2;

  /**
   * The lake of 4D grid cell (a, b, d), or null: centre, radius, water level, depth and biome.
   * Deterministic; used by generation and tests.
   */
  lakeAt(a: number, b: number, d: number): { x: number; z: number; w: number; r: number; level: number; depth: number; biome: number; lava: boolean } | null {
    const S = SurfaceGenerator.LAKE_CELL;
    const hsh = hash4(a, b, d, 6, this.seed ^ SALT_LAKE);
    if ((hsh & 255) > 140) return null;
    // Mostly ponds, sometimes real lakes.
    const q = ((hsh >>> 26) % 19) / 18;
    const R = Math.round(8 + 18 * q * q);
    const cx = a * S + 14 + ((hsh >>> 8) % (S - 28)), cz = b * S + 14 + ((hsh >>> 14) % (S - 28)), cw = d * S + 14 + (((hsh >>> 20) * 7) % (S - 28));
    if (this.garden && this.inGardenAbs(cx, cz, cw, R + 3)) return null;
    const s = this.lakeS;
    this.sample(cx, cz, cw, s);
    if (s.ocean || s.river) return null;
    const biome = this.biomes[s.biome]!;
    const lava = s.biome === this.idx.volcanic;
    if ((biome.precipitation === 'none' && !lava) || s.biome === this.idx.hollow || s.biome === this.idx.frost) return null;
    const bi = s.biome;
    let lo = s.height, hi = s.height;
    for (let k = 0; k < 6; k++) {
      const r = R * 0.85 * (k & 1 ? 1 : -1);
      const ax = k >> 1;
      this.sample(cx + (ax === 0 ? r : 0), cz + (ax === 1 ? r : 0), cw + (ax === 2 ? r * SurfaceGenerator.LAKE_WSTRETCH : 0), s);
      if (s.ocean || s.river) return null;
      lo = Math.min(lo, s.height);
      hi = Math.max(hi, s.height);
    }
    // Ponds in the lowlands sit at sea level (a flooded hollow); on hills the lowest rim sets it.
    const level = Math.max(lo - 1, this.sea);
    if (hi - lo > 12 || lo < this.sea + 1 || level > this.height - 20) return null;
    return { x: cx, z: cz, w: cw, r: R, level, depth: 3 + ((hsh >>> 4) & 3) + (R > 14 ? 2 : 0), biome: bi, lava };
  }

  /**
   * Inland lakes: 4D bowls (balls in x, z, w) dug into the terrain and filled to one level just
   * below the lowest rim sample, so they are contained. A slice through a lake shows a pond
   * whose shape changes as you move kata/ana.
   */
  private lakes(X0: number, Z0: number, W0: number, heights: Int16Array, blocks: Uint16Array): void {
    const S = SurfaceGenerator.LAKE_CELL, RMAX = Math.ceil(SurfaceGenerator.LAKE_RMAX * 1.5);
    const L = COLUMN_LAYER;
    const WS = SurfaceGenerator.LAKE_WSTRETCH, RW = RMAX * WS;
    for (let a = Math.floor((X0 - RMAX) / S); a <= Math.floor((X0 + 15 + RMAX) / S); a++)
      for (let b = Math.floor((Z0 - RMAX) / S); b <= Math.floor((Z0 + 15 + RMAX) / S); b++)
        for (let d = Math.floor((W0 - RW) / S); d <= Math.floor((W0 + 15 + RW) / S); d++) {
          const lake = this.lakeAt(a, b, d);
          if (!lake) continue;
          const { x: cx, z: cz, w: cw, r: R0, level, depth } = lake;
          // A wobbly shore: the radius varies with direction.
          const R = R0 * 1.5;
          const RWk = R * WS;
          if (cx + R < X0 || cx - R > X0 + 16 || cz + R < Z0 || cz - R > Z0 + 16 || cw + RWk < W0 || cw - RWk > W0 + 16) continue;
          const bed = lake.lava ? B.stone : this.under[lake.biome]!;
          const fluid = lake.lava ? B.lava : B.water;
          const top = lake.lava ? B.lava : this.biomes[lake.biome]!.frozenWater ? B.ice : B.water;
          for (let w = Math.max(0, Math.floor(cw - RWk) - W0); w <= Math.min(15, Math.ceil(cw + RWk) - W0); w++)
            for (let z = Math.max(0, Math.floor(cz - R) - Z0); z <= Math.min(15, Math.ceil(cz + R) - Z0); z++)
              for (let x = Math.max(0, Math.floor(cx - R) - X0); x <= Math.min(15, Math.ceil(cx + R) - X0); x++) {
                const X = x + X0, Z = z + Z0, W = w + W0;
                const wob = 1 + 0.16 * this.nIslet.n3(X / 17 + a * 5.1, Z / 17 + b * 5.1, W / 17 + d * 5.1);
                const dd = Math.hypot(X + 0.5 - cx, Z + 0.5 - cz, (W + 0.5 - cw) / WS) / (R0 * wob);
                const i = x + (z << 4) + (w << 8);
                if (dd >= 1) {
                  // The shore: sand and gravel (grass stays under the trees), reeds at the water.
                  if (dd < 1.22 && !lake.lava && heights[i]! >= level - 1 && heights[i]! <= level + 2) {
                    const hh = heights[i]!;
                    const t = blocks[i + hh * COLUMN_LAYER]!;
                    if (REG.solid[t] === 1 && REG.fluid[t] === 0) {
                      const r1 = hash4f(X, 3, Z, W, this.seed ^ SALT_LAKE);
                      if (r1 < 0.55) blocks[i + hh * COLUMN_LAYER] = r1 < 0.12 ? B.gravel : r1 < 0.2 ? B.clay : B.sand;
                      if (dd < 1.08 && r1 > 0.86 && blocks[i + (hh + 1) * COLUMN_LAYER] === 0) blocks[i + (hh + 1) * COLUMN_LAYER] = this.ids.reeds!;
                    }
                  }
                  continue;
                }
                const floorY = level - Math.max(1, Math.round(depth * (1 - dd * dd)));
                const h = heights[i]!;
                // Seal the bed so caves below cannot drain the lake.
                for (let y = floorY - 3; y < floorY; y++) if (y > 0 && REG.solid[blocks[i + y * L]!] === 0) blocks[i + y * L] = B.stone;
                blocks[i + floorY * L] = bed;
                for (let y = floorY + 1; y <= level; y++) blocks[i + y * L] = y === level ? top : fluid;
                for (let y = level + 1; y <= h; y++) blocks[i + y * L] = 0;
                heights[i] = floorY;
              }
        }
  }

  private sinkholes(X0: number, Z0: number, W0: number, heights: Int16Array, blocks: Uint16Array): void {
    const S = 64;
    for (let a = Math.floor((X0 - 8) / S); a <= Math.floor((X0 + 24) / S); a++)
      for (let b = Math.floor((Z0 - 8) / S); b <= Math.floor((Z0 + 24) / S); b++)
        for (let d = Math.floor((W0 - 8) / S); d <= Math.floor((W0 + 24) / S); d++) {
          const hsh = hash4(a, b, d, 1, this.seed ^ SALT_SINK);
          if ((hsh & 255) > 40) continue;
          const cx = a * S + ((hsh >>> 8) & 63), cz = b * S + ((hsh >>> 14) & 63), cw = d * S + ((hsh >>> 20) & 63);
          const r = 3 + ((hsh >>> 26) & 3);
          const depth = 14 + ((hsh >>> 28) & 15);
          for (let w = Math.max(0, cw - r - W0); w <= Math.min(15, cw + r - W0); w++)
            for (let z = Math.max(0, cz - r - Z0); z <= Math.min(15, cz + r - Z0); z++)
              for (let x = Math.max(0, cx - r - X0); x <= Math.min(15, cx + r - X0); x++) {
                const dd = (x + X0 - cx) ** 2 + (z + Z0 - cz) ** 2 + (w + W0 - cw) ** 2;
                if (dd > r * r) continue;
                const i = x + (z << 4) + (w << 8);
                const h = heights[i]!;
                if (h < this.sea + 2) continue;
                for (let y = h; y > h - depth && y > 4; y--) blocks[i + y * COLUMN_LAYER] = 0;
              }
        }
  }

  /**
   * Ores at Minecraft-like densities. Each ore places clusters of 1-3 small 4D balls (a vein)
   * per 16^4 cell, enough to make `share` of the host rock in its height range ore. Heights
   * follow a triangle between minY and maxY (peaking in the middle, like Minecraft's).
   */
  private oreVeins(cx: number, cz: number, cw: number, blocks: Uint16Array, mountOf: Float32Array): void {
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    const host = this.host, deepstone = this.ids.deepstone!;
    const H = this.height;
    for (const ore of this.ores) {
      // Veins per 16^4 cell: share of the range's volume over the mean vein volume.
      const per = (ore.share * 4096 * (ore.maxY - ore.minY)) / ore.veinVolume;
      for (let a = cx - 1; a <= cx + 1; a++)
        for (let b = cz - 1; b <= cz + 1; b++)
          for (let d = cw - 1; d <= cw + 1; d++) {
            const n0 = hash4(a, b, d, ore.salt, this.seed ^ SALT_VEIN);
            const count = Math.floor(per + (n0 & 1023) / 1024);
            for (let k = 0; k < count; k++) {
              const hh = hash4(a, b, d, ore.salt * 4099 + k, this.seed ^ SALT_VEIN);
              // Position from the hash bits (cheap): 16^3 in x, z, w and a triangle in y.
              const px = a * 16 + (hh & 15) + 0.5, pz = b * 16 + ((hh >>> 4) & 15) + 0.5, pw = d * 16 + ((hh >>> 8) & 15) + 0.5;
              if (px < X0 - 4 || px > X0 + 20 || pz < Z0 - 4 || pz > Z0 + 20 || pw < W0 - 4 || pw > W0 + 20) continue;
              const tri = (((hh >>> 12) & 255) + ((hh >>> 20) & 255)) / 510;
              const py = ore.minY + tri * (ore.maxY - ore.minY);
              if (ore.mountains) {
                const li = Math.floor(px - X0), lz = Math.floor(pz - Z0), lw = Math.floor(pw - W0);
                if (li < 0 || li > 15 || lz < 0 || lz > 15 || lw < 0 || lw > 15 || mountOf[li + (lz << 4) + (lw << 8)]! < 0.5) continue;
              }
              const h2 = hash4(a, b, d, ore.salt * 8191 + k, this.seed ^ SALT_VEIN);
              const balls = 1 + (h2 % 3);
              // The vein runs along one of the four axes, a ball every 1.5 blocks.
              const ax = (h2 >>> 2) & 3;
              for (let j = 0; j < balls; j++) {
                const off = (j - (balls - 1) / 2) * 1.5;
                const bx = px + (ax === 0 ? off : 0), by = py + (ax === 1 ? off : 0), bz = pz + (ax === 2 ? off : 0), bw = pw + (ax === 3 ? off : 0);
                const r = ore.r[0] + (((h2 >>> (4 + j * 6)) & 63) / 63) * (ore.r[1] - ore.r[0]);
                const r2 = r * r;
                const x0 = Math.max(0, Math.floor(bx - r - X0)), x1 = Math.min(15, Math.floor(bx + r - X0));
                const z0 = Math.max(0, Math.floor(bz - r - Z0)), z1 = Math.min(15, Math.floor(bz + r - Z0));
                const w0 = Math.max(0, Math.floor(bw - r - W0)), w1 = Math.min(15, Math.floor(bw + r - W0));
                const y0 = Math.max(1, Math.floor(by - r)), y1 = Math.min(H - 1, Math.floor(by + r));
                for (let y = y0; y <= y1; y++)
                  for (let w = w0; w <= w1; w++)
                    for (let z = z0; z <= z1; z++)
                      for (let x = x0; x <= x1; x++) {
                        const qx = x + X0 + 0.5 - bx, qy = y + 0.5 - by, qz = z + Z0 + 0.5 - bz, qw = w + W0 + 0.5 - bw;
                        if (qx * qx + qy * qy + qz * qz + qw * qw > r2) continue;
                        const idx = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
                        const old = blocks[idx]!;
                        if (host[old]) blocks[idx] = old === deepstone ? ore.deep : ore.id;
                      }
              }
            }
          }
    }
  }

  private geodes(X0: number, Z0: number, W0: number, blocks: Uint16Array): void {
    const I = this.ids;
    const S = 40;
    const R = 5.4;
    for (let a = Math.floor((X0 - R) / S); a <= Math.floor((X0 + 16 + R) / S); a++)
      for (let b = Math.floor((Z0 - R) / S); b <= Math.floor((Z0 + 16 + R) / S); b++)
        for (let d = Math.floor((W0 - R) / S); d <= Math.floor((W0 + 16 + R) / S); d++) {
          const hsh = hash4(a, b, d, 2, this.seed ^ SALT_GEODE);
          if ((hsh & 255) > 34) continue;
          const cx = a * S + 6 + ((hsh >>> 8) & 31) * 0.9, cz = b * S + 6 + ((hsh >>> 13) & 31) * 0.9, cw = d * S + 6 + ((hsh >>> 18) & 31) * 0.9;
          const cy = 20 + ((hsh >>> 23) & 63);
          this.ball(blocks, X0, Z0, W0, cx, cy, cz, cw, R, (old, dist, x, y, z, w) => {
            if (!this.host[old] && old !== I.deepstone) return old;
            if (dist > 4.6) return I.geode_shell!;
            if (dist > 3.8) return I.calcite!;
            if (dist > 3.0) return I.amethyst!;
            // hollow core with clusters on the inner wall
            if (dist > 2.3 && hash4f(x, y, z, w, this.seed ^ SALT_GEODE) < 0.35) return I.amethyst_cluster!;
            return 0;
          });
        }
  }

  private fossils(X0: number, Z0: number, W0: number, heights: Int16Array, biomeOf: Uint8Array, blocks: Uint16Array): void {
    const I = this.ids;
    const S = 40;
    for (let a = Math.floor((X0 - 14) / S); a <= Math.floor((X0 + 30) / S); a++)
      for (let b = Math.floor((Z0 - 14) / S); b <= Math.floor((Z0 + 30) / S); b++)
        for (let d = Math.floor((W0 - 14) / S); d <= Math.floor((W0 + 30) / S); d++) {
          const hsh = hash4(a, b, d, 3, this.seed ^ SALT_FOSSIL);
          if ((hsh & 255) > 90) continue;
          const ox = a * S + ((hsh >>> 8) & 31), oz = b * S + ((hsh >>> 13) & 31), ow = d * S + ((hsh >>> 18) & 31);
          const li = ox - X0, lz = oz - Z0, lw = ow - W0;
          let base = this.sea - 4;
          if (li >= 0 && li < 16 && lz >= 0 && lz < 16 && lw >= 0 && lw < 16) {
            const i = li + (lz << 4) + (lw << 8);
            if (biomeOf[i] !== this.idx.bone) continue;
            base = heights[i]! - 8 - ((hsh >>> 23) & 3);
          } else continue;
          const axis = [0, 2, 3][(hsh >>> 25) % 3]!;
          const side = axis === 0 ? 2 : 0;
          const len = 9 + ((hsh >>> 27) & 3);
          for (let t = 0; t < len; t++) {
            const p = [ox, base, oz, ow];
            p[axis] = p[axis]! + t;
            this.setIn(blocks, X0, Z0, W0, p[0]!, p[1]!, p[2]!, p[3]!, I.bone_block!);
            if (t % 2 === 0 && t > 1 && t < len - 1) {
              for (let k = -3; k <= 3; k++) {
                const q = [p[0]!, p[1]!, p[2]!, p[3]!];
                q[side] = q[side]! + k;
                q[1] = base + Math.round(Math.sqrt(Math.max(0, 9 - k * k)));
                this.setIn(blocks, X0, Z0, W0, q[0]!, q[1]!, q[2]!, q[3]!, I.bone_block!);
              }
            }
          }
        }
  }

  private spires(X0: number, Z0: number, W0: number, heights: Int16Array, biomeOf: Uint8Array, shareOf: Float32Array, blocks: Uint16Array): void {
    const I = this.ids;
    const S = 11;
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let a = Math.floor((X0 - 6) / S); a <= Math.floor((X0 + 22) / S); a++)
      for (let b = Math.floor((Z0 - 6) / S); b <= Math.floor((Z0 + 22) / S); b++)
        for (let d = Math.floor((W0 - 6) / S); d <= Math.floor((W0 + 22) / S); d++) {
          const hsh = hash4(a, b, d, 4, this.seed ^ SALT_SPIRE);
          if ((hsh & 7) > 3) continue;
          const cx = a * S + 2 + ((hsh >>> 4) % 7), cz = b * S + 2 + ((hsh >>> 8) % 7), cw = d * S + 2 + ((hsh >>> 12) % 7);
          const li = cx - X0, lz = cz - Z0, lw = cw - W0;
          let base: number;
          let bio: number;
          let share: number;
          if (li >= 0 && li < 16 && lz >= 0 && lz < 16 && lw >= 0 && lw < 16) {
            const i = li + (lz << 4) + (lw << 8);
            base = heights[i]!;
            bio = biomeOf[i]!;
            share = shareOf[i]!;
          } else {
            this.sample(cx, cz, cw, s);
            base = s.height;
            bio = s.biome;
            share = 1;
          }
          if (bio !== this.idx.frost || share < 0.4) continue;
          const tall = 18 + ((hsh >>> 16) & 31);
          const r0 = 2.2 + ((hsh >>> 21) & 3) * 0.6;
          for (let y = base - 2; y < base + tall && y < this.height - 1; y++) {
            const t = (y - base) / tall;
            const r = Math.max(0.6, r0 * (1 - t));
            const cap = y > base + tall - 4;
            for (let w = Math.max(0, Math.floor(cw - r) - W0); w <= Math.min(15, Math.ceil(cw + r) - W0); w++)
              for (let z = Math.max(0, Math.floor(cz - r) - Z0); z <= Math.min(15, Math.ceil(cz + r) - Z0); z++)
                for (let x = Math.max(0, Math.floor(cx - r) - X0); x <= Math.min(15, Math.ceil(cx + r) - X0); x++) {
                  const dd = Math.hypot(x + X0 + 0.5 - cx - 0.5, z + Z0 + 0.5 - cz - 0.5, w + W0 + 0.5 - cw - 0.5);
                  if (dd > r) continue;
                  const v = cap ? I.packed_snow! : dd > r - 0.9 ? (hash4f(x, y, z, w, this.seed) < 0.3 ? I.blue_ice! : I.packed_ice!) : I.frost_stone!;
                  blocks[x + (z << 4) + (w << 8) + y * COLUMN_LAYER] = v;
                }
          }
        }
  }

  /** Hollow Peaks: floating islands that exist only in some W bands (they connect through W). */
  private islands(X0: number, Z0: number, W0: number, heights: Int16Array, biomeOf: Uint8Array, shareOf: Float32Array, blocks: Uint16Array): void {
    const I = this.ids;
    const n = this.nIsland;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          if (biomeOf[i] !== this.idx.hollow || shareOf[i]! < 0.35) continue;
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const band = Math.cos((W * Math.PI * 2) / 44 + 1.7 * n.n2(X / 90, Z / 90));
          if (band < -0.1) continue;
          const h = heights[i]!;
          const lo = Math.max(h + 12, 72), hi = Math.min(this.height - 6, lo + 34);
          let above = false;
          for (let y = hi; y >= lo; y--) {
            const mid = (lo + hi) / 2;
            const fall = Math.abs(y - mid) / ((hi - lo) / 2);
            const d = n.n4(X / 34, y / 13, Z / 34, W / 30) + 0.35 * band - fall * 0.9;
            const idx = i + y * COLUMN_LAYER;
            if (d > 0.18) {
              blocks[idx] = above ? (d > 0.4 ? I.hollow_stone! : I.skystone!) : I.cloud_moss!;
              above = true;
            } else above = false;
          }
        }
  }

  private volcanoes(X0: number, Z0: number, W0: number, heights: Int16Array, biomeOf: Uint8Array, craterLava: Int16Array): void {
    const S = 60;
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let a = Math.floor((X0 - 32) / S); a <= Math.floor((X0 + 48) / S); a++)
      for (let b = Math.floor((Z0 - 32) / S); b <= Math.floor((Z0 + 48) / S); b++)
        for (let d = Math.floor((W0 - 32) / S); d <= Math.floor((W0 + 48) / S); d++) {
          const hsh = hash4(a, b, d, 5, this.seed ^ SALT_VOLC);
          const cx = a * S + 12 + ((hsh >>> 4) % 36), cz = b * S + 12 + ((hsh >>> 10) % 36), cw = d * S + 12 + ((hsh >>> 16) % 36);
          this.sample(cx, cz, cw, s);
          if (s.biome !== this.idx.volcanic) continue;
          const R = 20 + ((hsh >>> 22) & 7);
          const Hv = 20 + ((hsh >>> 25) & 15);
          const top = Math.min(this.height - 16, s.height + Hv);
          for (let w = 0; w < 16; w++)
            for (let z = 0; z < 16; z++)
              for (let x = 0; x < 16; x++) {
                const dd = Math.hypot(x + X0 - cx, z + Z0 - cz, w + W0 - cw);
                if (dd >= R) continue;
                const i = x + (z << 4) + (w << 8);
                if (biomeOf[i] !== this.idx.volcanic) continue;
                const cone = Math.round(top - (top - heights[i]!) * Math.pow(dd / R, 0.8));
                if (dd < 4.5) {
                  heights[i] = top - 6;
                  craterLava[i] = top - 3;
                } else if (cone > heights[i]!) heights[i] = cone;
              }
        }
  }

  private decorateCaves(X0: number, Z0: number, W0: number, heights: Int16Array, blocks: Uint16Array): void {
    const I = this.ids;
    const L = COLUMN_LAYER;
    const DEEPSTONE = I.deepstone!, POINTED_DRIPSTONE = I.pointed_dripstone!, LUMINOUS_MOSS = I.luminous_moss!;
    const host = this.host;
    const floorOf = this.caveFloor, ceilOf = this.caveCeil;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const top = heights[i]! - 3;
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          let hum = NaN, weird = 0;
          for (let y = 5; y < top; y++) {
            const idx = i + y * L;
            if (blocks[idx] !== 0) continue;
            const below = blocks[idx - L]!;
            const above = blocks[idx + L]!;
            const floor = host[below] === 1 || below === DEEPSTONE;
            const ceil = host[above] === 1 || above === DEEPSTONE;
            if (!floor && !ceil) continue;
            if (hum !== hum) {
              hum = this.nCaveHum.n3(X / 170, Z / 170, W / 170);
              weird = this.nCaveWeird.n3(X / 220, Z / 220, W / 220);
            }
            const cb = this.caveBiome(hum, weird, y);
            const r = hash4f(X, y, Z, W, this.seed ^ 0xdec0);
            if (cb >= 0) {
              // Data-driven cave biome: floor/ceiling blocks and floor/ceiling plants.
              if (floor) {
                blocks[idx - L] = floorOf[cb]!;
                const trees = this.treesOf[cb]!;
                if (trees.length && x >= 2 && x <= 13 && z >= 2 && z <= 13 && w >= 2 && w <= 13 && r < trees[0]!.density) {
                  this.growTree(blocks, x, y, z, w, trees[0]!, X, Z, W);
                  continue;
                }
                const v = pickPlant(this.cavePlants[cb * 2]!, r);
                if (v) blocks[idx] = v;
              } else {
                if (ceilOf[cb]) blocks[idx + L] = ceilOf[cb]!;
                const v = pickPlant(this.cavePlants[cb * 2 + 1]!, r);
                if (v) blocks[idx] = v;
              }
            } else if (floor && r < 0.012) {
              blocks[idx] = POINTED_DRIPSTONE; // plain stalagmites
            } else if (ceil && r < 0.014) {
              blocks[idx] = POINTED_DRIPSTONE; // plain stalactites
            } else if (floor && y < this.sea - 30 && r > 0.995) {
              blocks[idx - L] = LUMINOUS_MOSS;
            }
          }
        }
  }

  private vegetation(X0: number, Z0: number, W0: number, heights: Int16Array, biomeOf: Uint8Array, blocks: Uint16Array): void {
    // Trees anchored up to 6 blocks outside the column reach in (redwood crowns, palm fronds).
    const M = 6;
    const L = COLUMN_LAYER;
    const sea = this.sea;
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    for (let w = -M; w < 16 + M; w++)
      for (let z = -M; z < 16 + M; z++)
        for (let x = -M; x < 16 + M; x++) {
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          if (this.garden && this.inGardenAbs(X, Z, W, 5)) continue;
          const inside = x >= 0 && x < 16 && z >= 0 && z < 16 && w >= 0 && w < 16;
          const r = hash4f(X, 0, Z, W, this.seed ^ SALT_TREE);
          if (r < 0.06) {
            let h: number, bi: number;
            if (inside) {
              const i = x + (z << 4) + (w << 8);
              h = heights[i]!;
              bi = biomeOf[i]!;
            } else {
              this.sample(X, Z, W, s);
              h = s.height;
              bi = s.biome;
            }
            const list = this.treesOf[bi]!;
            let acc = 0;
            for (const t of list) {
              acc += t.density;
              if (r >= acc) continue;
              const shape = t.def.shape;
              if (shape === 'kelp') {
                if (h < sea - 3) this.growTree(blocks, x, h + 1, z, w, t, X, Z, W);
              } else if (h >= sea) {
                if (inside) {
                  const top = blocks[x + (z << 4) + (w << 8) + h * L]!;
                  const ok = shape === 'cactus' ? top === B.sand || top === this.ids.dune_sand : shape === 'mushroom' ? top === this.ids.mycelium : REG.solid[top] === 1 && REG.fluid[top] === 0;
                  if (!ok || blocks[x + (z << 4) + (w << 8) + (h + 1) * L] !== 0) break;
                }
                this.growTree(blocks, x, h + 1, z, w, t, X, Z, W);
              }
              break;
            }
          }
          if (!inside) continue;
          // Plants.
          const i = x + (z << 4) + (w << 8);
          const h = heights[i]!;
          if (h + 1 >= this.height) continue;
          // Vents (geysers) replace some of the surface.
          const vents = this.ventsOf[biomeOf[i]!]!;
          if (vents.length && h >= sea && blocks[i + (h + 1) * L] === 0 && REG.solid[blocks[i + h * L]!]) {
            const vr = hash4f(X, 7, Z, W, this.seed ^ SALT_PLANT);
            let va = 0, vented = false;
            for (const v of vents) {
              va += v.density;
              if (vr >= va) continue;
              blocks[i + h * L] = v.id;
              vented = true;
              break;
            }
            if (vented) continue;
          }
          const plants = this.plantsOf[biomeOf[i]!]!;
          if (!plants.length) continue;
          const pr = hash4f(X, 2, Z, W, this.seed ^ SALT_PLANT);
          let acc = 0;
          for (const pl of plants) {
            acc += pl.density;
            if (pr >= acc) continue;
            const above = blocks[i + (h + 1) * L]!;
            const ground = blocks[i + h * L]!;
            if (!REG.solid[ground]) break;
            if (pl.placement === 'underwater') {
              if (above === B.water && h < sea - 1) blocks[i + (h + 1) * L] = pl.id;
            } else if (pl.placement === 'surface' || pl.placement === 'floor') {
              if (above === 0 && h >= sea) blocks[i + (h + 1) * L] = pl.id;
            }
            break;
          }
        }
  }

  /**
   * Grow the named tree with its base at local (x, y, z, w) of a column-shaped buffer (a
   * sapling growing in the world, Phase 7). `X, Z, W` seed its size and shape.
   */
  growTreeAt(blocks: Uint16Array, x: number, y: number, z: number, w: number, name: string, X: number, Z: number, W: number): void {
    const def = REG.tree(name);
    this.growTree(blocks, x, y, z, w, { def, log: REG.id(def.log), leaves: def.leaves ? REG.id(def.leaves) : 0, density: 0 }, X, Z, W);
  }

  private growTree(blocks: Uint16Array, x: number, y: number, z: number, w: number, t: ResolvedTree, X: number, Z: number, W: number): void {
    const h = hash4(X, 1, Z, W, this.seed ^ SALT_TREE);
    const def = t.def;
    const H = def.height[0] + (h % (def.height[1] - def.height[0] + 1));
    const r = def.radius[0] + ((h >>> 8) & 255) / 255 * (def.radius[1] - def.radius[0]);
    const HH = this.height;
    const leaf = t.leaves;
    const putLeaf = (old: number) => (old === 0 || REG.replaceable[old] === 1 && REG.fluid[old] === 0 ? leaf : old);
    switch (def.shape) {
      case 'ball':
        this.ballLocal(blocks, x + 0.5, y + H - 0.5, z + 0.5, w + 0.5, r, putLeaf);
        this.trunk(blocks, x, y, z, w, H, t.log);
        break;
      case 'birch':
        this.ballLocal(blocks, x + 0.5, y + H, z + 0.5, w + 0.5, r, putLeaf);
        this.trunk(blocks, x, y, z, w, H, t.log);
        break;
      case 'wide':
        this.ellipsoid(blocks, x + 0.5, y + H, z + 0.5, w + 0.5, r, 1.7, putLeaf);
        this.trunk(blocks, x, y, z, w, H, t.log);
        break;
      case 'cone': {
        for (let yy = y + 2; yy <= y + H + 1 && yy < HH; yy++) {
          const k = 1 - (yy - y - 2) / (H);
          const rr = Math.max(0.6, r * k * (0.75 + 0.25 * (((yy - y) & 1) === 0 ? 1 : 0.7)));
          this.ballLocal(blocks, x + 0.5, yy + 0.5, z + 0.5, w + 0.5, rr, putLeaf, true);
        }
        this.trunk(blocks, x, y, z, w, H, t.log);
        break;
      }
      case 'acacia': {
        const dirs = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];
        const dv = dirs[(h >>> 4) % 6]!;
        let px = x, pz = z, pw = w, py = y;
        for (let k = 0; k < H; k++) {
          this.setLocal(blocks, px, py, pz, pw, t.log, true);
          if (k >= 2) {
            px += dv[0]!;
            pz += dv[1]!;
            pw += dv[2]!;
          }
          py++;
        }
        this.ellipsoid(blocks, px + 0.5, py, pz + 0.5, pw + 0.5, r, 1.2, putLeaf);
        break;
      }
      case 'bamboo':
        for (let k = 0; k < H && y + k < HH; k++) this.setLocal(blocks, x, y + k, z, w, t.log, false);
        this.ballLocal(blocks, x + 0.5, y + H, z + 0.5, w + 0.5, 1.2, putLeaf);
        break;
      case 'mushroom': {
        this.trunk(blocks, x, y, z, w, H, t.log);
        const cy = y + H;
        const rr = r;
        for (let dy = 0; dy <= Math.ceil(rr); dy++) {
          const rad = Math.sqrt(Math.max(0, rr * rr - dy * dy));
          this.ballLocal(blocks, x + 0.5, cy + dy + 0.5, z + 0.5, w + 0.5, rad, (old) => (old === 0 || REG.replaceable[old] === 1 ? leaf : old), true, dy === 0 ? 0 : Math.max(0, rad - 1.3));
        }
        break;
      }
      case 'dead': {
        this.trunk(blocks, x, y, z, w, H, t.log);
        for (let k = 0; k < 3; k++) {
          const by = y + 1 + ((h >>> (6 + k * 3)) % Math.max(1, H - 1));
          const ax = (h >>> (12 + k * 2)) % 3;
          const sg = (h >>> (20 + k)) & 1 ? 1 : -1;
          this.setLocal(blocks, x + (ax === 0 ? sg : 0), by, z + (ax === 1 ? sg : 0), w + (ax === 2 ? sg : 0), t.log, false);
        }
        break;
      }
      case 'cactus':
        for (let k = 0; k < H && y + k < HH; k++) this.setLocal(blocks, x, y + k, z, w, t.log, false);
        break;
      case 'giant': {
        // Redwood: a 2 x 2 x 2 trunk (8 columns in x, z, w), a root flare, and a narrow
        // conical crown over its upper half.
        for (let d = 0; d < 8; d++) this.trunk(blocks, x + (d & 1), y, z + ((d >> 1) & 1), w + ((d >> 2) & 1), H, t.log);
        for (const [a, b, c] of [[-1, 0, 0], [2, 0, 0], [0, -1, 0], [0, 2, 0], [0, 0, -1], [0, 0, 2]] as const)
          for (let k = 0; k < 2; k++) this.setLocal(blocks, x + a, y + k, z + b, w + c, t.log, false);
        const c0 = y + Math.floor(H * 0.45);
        for (let yy = c0; yy <= y + H + 2 && yy < HH; yy++) {
          const kk = (yy - c0) / (y + H + 2 - c0);
          this.ballLocal(blocks, x + 1, yy + 0.5, z + 1, w + 1, Math.max(0.9, r * (1 - kk) * (((yy - y) & 1) === 0 ? 1 : 0.8)), putLeaf, true);
        }
        break;
      }
      case 'mangrove': {
        // Raised on prop roots arching down along +-x, +-z and +-w.
        for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
          this.setLocal(blocks, x + a, y + 2, z + b, w + c, t.log, false);
          this.setLocal(blocks, x + 2 * a, y + 1, z + 2 * b, w + 2 * c, t.log, false);
          this.setLocal(blocks, x + 2 * a, y, z + 2 * b, w + 2 * c, t.log, false);
          this.setLocal(blocks, x + 2 * a, y - 1, z + 2 * b, w + 2 * c, t.log, false);
        }
        this.trunk(blocks, x, y + 2, z, w, H, t.log);
        this.ballLocal(blocks, x + 0.5, y + H + 1.5, z + 0.5, w + 0.5, r, putLeaf);
        break;
      }
      case 'baobab': {
        // A fat bottle trunk and a small flat crown.
        for (let k = 0; k < H && y + k < HH; k++) this.ballLocal(blocks, x + 0.5, y + k + 0.5, z + 0.5, w + 0.5, 1.7 - 0.25 * Math.abs(k / H - 0.4), (old) => (old === 0 || REG.replaceable[old] === 1 ? t.log : old), true);
        this.ellipsoid(blocks, x + 0.5, y + H + 1, z + 0.5, w + 0.5, r, 1.4, putLeaf);
        break;
      }
      case 'pine': {
        // A tall bare trunk with a small cone of needles at the top.
        const c0 = y + Math.floor(H * 0.6);
        for (let yy = c0; yy <= y + H + 1 && yy < HH; yy++) {
          const kk = (yy - c0) / (y + H + 1 - c0);
          this.ballLocal(blocks, x + 0.5, yy + 0.5, z + 0.5, w + 0.5, Math.max(0.7, r * (1 - kk)), putLeaf, true);
        }
        this.trunk(blocks, x, y, z, w, H, t.log);
        break;
      }
      case 'palm': {
        // A trunk leaning along one horizontal axis, and drooping fronds along +-x, +-z, +-w.
        const ax = (h >>> 4) % 3, sg = (h >>> 6) & 1 ? 1 : -1;
        let px = x, pz = z, pw = w;
        for (let k = 0; k < H; k++) {
          const lean = Math.round(((k / H) * (k / H)) * 3) * sg;
          px = x + (ax === 0 ? lean : 0);
          pz = z + (ax === 1 ? lean : 0);
          pw = w + (ax === 2 ? lean : 0);
          this.setLocal(blocks, px, y + k, pz, pw, t.log, true);
        }
        const top = y + H;
        this.setLocal(blocks, px, top, pz, pw, leaf, false);
        const L = Math.round(r);
        for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const)
          for (let s = 1; s <= L; s++) this.setLocal(blocks, px + a * s, top - (s >> 1), pz + b * s, pw + c * s, leaf, false);
        break;
      }
      case 'weeping': {
        // A round crown with curtains hanging from its rim (wisteria).
        this.ballLocal(blocks, x + 0.5, y + H - 0.5, z + 0.5, w + 0.5, r, putLeaf);
        this.trunk(blocks, x, y, z, w, H, t.log);
        for (let k = 0; k < 12; k++) {
          const hh = hash4(X, 30 + k, Z, W, this.seed ^ SALT_TREE);
          const a = ((hh & 255) / 255) * Math.PI * 2, b = (((hh >>> 8) & 255) / 255) * Math.PI;
          const dx = Math.round(Math.cos(a) * Math.sin(b) * r), dz = Math.round(Math.sin(a) * Math.sin(b) * r), dw = Math.round(Math.cos(b) * r * 0.9);
          const len = 2 + ((hh >>> 16) % 4);
          for (let s = 0; s < len; s++) this.setLocal(blocks, x + dx, y + H - 2 - s, z + dz, w + dw, leaf, false);
        }
        break;
      }
      case 'spire': {
        // A tapering 4D crystal spike with a glowing tip.
        for (let k = 0; k < H && y + k < HH; k++) this.ballLocal(blocks, x + 0.5, y + k + 0.5, z + 0.5, w + 0.5, r * (1 - k / H) + 0.35, (old) => (old === 0 || REG.replaceable[old] === 1 ? t.log : old), true);
        this.setLocal(blocks, x, y + H, z, w, leaf, false);
        break;
      }
      case 'kelp':
        for (let k = 0; k < H && y + k < this.sea - 1; k++) {
          const i = x >= 0 && x < 16 && z >= 0 && z < 16 && w >= 0 && w < 16 ? x + (z << 4) + (w << 8) + (y + k) * COLUMN_LAYER : -1;
          if (i < 0) break;
          if (blocks[i] !== B.water) break;
          blocks[i] = t.log;
        }
        break;
    }
    void X;
  }

  private trunk(blocks: Uint16Array, x: number, y: number, z: number, w: number, H: number, log: number): void {
    for (let k = 0; k < H; k++) this.setLocal(blocks, x, y + k, z, w, log, true);
  }

  private setLocal(blocks: Uint16Array, x: number, y: number, z: number, w: number, v: number, force: boolean): void {
    if (x < 0 || x > 15 || z < 0 || z > 15 || w < 0 || w > 15 || y < 0 || y >= this.height) return;
    const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
    const old = blocks[i]!;
    if (force || old === 0 || (REG.replaceable[old] === 1 && REG.fluid[old] === 0)) blocks[i] = v;
  }

  private setIn(blocks: Uint16Array, X0: number, Z0: number, W0: number, X: number, y: number, Z: number, W: number, v: number): void {
    this.setLocal(blocks, X - X0, y, Z - Z0, W - W0, v, true);
  }

  /** 4D ball in column-local coordinates. `flat` limits it to a single y layer. `inner` = hollow radius. */
  private ballLocal(blocks: Uint16Array, cx: number, cy: number, cz: number, cw: number, r: number, f: (old: number) => number, flat = false, inner = 0): void {
    const r2 = r * r;
    const i2 = inner * inner;
    const y0 = flat ? Math.floor(cy) : Math.max(0, Math.floor(cy - r)), y1 = flat ? Math.floor(cy) : Math.min(this.height - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= this.height) continue;
      const dy = flat ? 0 : y + 0.5 - cy;
      for (let w = Math.max(0, Math.floor(cw - r)); w <= Math.min(15, Math.floor(cw + r)); w++) {
        const dw = w + 0.5 - cw;
        for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(15, Math.floor(cz + r)); z++) {
          const dz = z + 0.5 - cz;
          for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(15, Math.floor(cx + r)); x++) {
            const dx = x + 0.5 - cx;
            const d2 = dx * dx + dy * dy + dz * dz + dw * dw;
            if (d2 > r2 || d2 < i2) continue;
            const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
            blocks[i] = f(blocks[i]!);
          }
        }
      }
    }
  }

  private ellipsoid(blocks: Uint16Array, cx: number, cy: number, cz: number, cw: number, r: number, ry: number, f: (old: number) => number): void {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.height - 1, Math.floor(cy + ry)); y++) {
      const dy = (y + 0.5 - cy) / ry;
      for (let w = Math.max(0, Math.floor(cw - r)); w <= Math.min(15, Math.floor(cw + r)); w++)
        for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(15, Math.floor(cz + r)); z++)
          for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(15, Math.floor(cx + r)); x++) {
            const dx = (x + 0.5 - cx) / r, dz = (z + 0.5 - cz) / r, dw = (w + 0.5 - cw) / r;
            if (dx * dx + dy * dy + dz * dz + dw * dw > 1) continue;
            const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
            blocks[i] = f(blocks[i]!);
          }
    }
  }

  /** 4D ball in world coordinates (clipped to the column), with a distance-aware writer. */
  private ball(
    blocks: Uint16Array,
    X0: number,
    Z0: number,
    W0: number,
    cx: number,
    cy: number,
    cz: number,
    cw: number,
    r: number,
    f: (old: number, dist: number, x: number, y: number, z: number, w: number) => number,
  ): void {
    for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(this.height - 1, Math.floor(cy + r)); y++)
      for (let w = Math.max(0, Math.floor(cw - r - W0)); w <= Math.min(15, Math.floor(cw + r - W0)); w++)
        for (let z = Math.max(0, Math.floor(cz - r - Z0)); z <= Math.min(15, Math.floor(cz + r - Z0)); z++)
          for (let x = Math.max(0, Math.floor(cx - r - X0)); x <= Math.min(15, Math.floor(cx + r - X0)); x++) {
            const d = Math.hypot(x + X0 + 0.5 - cx, y + 0.5 - cy, z + Z0 + 0.5 - cz, w + W0 + 0.5 - cw);
            if (d > r) continue;
            const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
            blocks[i] = f(blocks[i]!, d, x + X0, y, z + Z0, w + W0);
          }
  }

  // ------------------------------------------------------------------ test garden

  inGardenAbs(x: number, z: number, w: number, margin = 0): boolean {
    const o = this.gardenOrigin;
    return inGarden(x - o[0], z - o[2], w - o[3], margin);
  }

  private gardenFloorY = -1;
  gardenFloor(): number {
    return this.gardenFloorY;
  }
}

/** Pick from a flat [id, density, id, density, ...] table with a uniform roll; 0 = nothing. */
function pickPlant(table: Float64Array, r: number): number {
  let acc = 0;
  for (let k = 0; k < table.length; k += 2) {
    acc += table[k + 1]!;
    if (r < acc) return table[k]!;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------
// Engine test garden (test worlds only): a flat plateau around spawn with every rendering
// feature, used for the R6 reference screenshots and the e2e walk/mine/place test.
// Coordinates are relative to the garden origin: x in [-12, 12], z in [-8, 28], w in [-4, 4];
// spawn is at z = -3.5, looking at the showcase (z >= 5).

export const GARDEN = { x0: -12, x1: 12, z0: -8, z1: 28, w0: -4, w1: 4 };

export function inGarden(x: number, z: number, w: number, margin = 0): boolean {
  return x >= GARDEN.x0 - margin && x <= GARDEN.x1 + margin && z >= GARDEN.z0 - margin && z <= GARDEN.z1 + margin && w >= GARDEN.w0 - margin && w <= GARDEN.w1 + margin;
}

let gardenCells: Int32Array | null = null;

function buildGarden(): Int32Array {
  const cells: number[] = [];
  const put = (x: number, y: number, z: number, w: number, v: number) => cells.push(x, y, z, w, v);
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, w0: number, w1: number, v: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let w = w0; w <= w1; w++) put(x, y, z, w, v);
  };
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++)
        for (let w = 0; w < 3; w++) {
          const v = [B.marker_x, B.marker_z, B.marker_w, B.marker_y][(x + y + z + w) & 3]!;
          put(-1 + x, y, 14 + z, -1 + w, v);
        }
  box(9, 9, 0, 3, 10, 10, 0, 0, B.marker_x);
  box(0, 0, 0, 3, 26, 26, 0, 0, B.marker_z);
  box(0, 0, 0, 3, 10, 10, 3, 3, B.marker_w);
  box(-9, -9, 0, 5, 10, 10, 0, 0, B.marker_y);
  box(-8, -4, 0, 2, 20, 20, -2, 2, B.glass);
  box(-6, -6, 0, 0, 22, 22, 0, 0, B.lumen);
  box(3, 3, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_slab, 0));
  box(4, 4, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_slab, 1));
  box(5, 5, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_stairs, 0));
  box(6, 6, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_stairs, 2));
  box(6, 6, 0, 5, 18, 18, 0, 0, B.planks);
  box(6, 6, 0, 5, 17, 17, 0, 0, makeVoxel(B.ladder, 2));
  box(6, 9, -1, -1, 5, 8, -2, 2, B.water);
  box(-10, -8, -1, -1, 5, 7, -1, 1, B.lava);
  put(-3, 0, 8, 0, B.torch);
  put(3, 0, 8, 0, B.torch);
  box(10, 10, 0, 2, 24, 24, -3, -3, B.lumen);
  put(-2, 0, 24, 0, B.ice);
  box(2, 2, 0, 2, 24, 24, 0, 0, B.portal);
  box(8, 10, 0, 2, 26, 27, 1, 3, B.leaves);
  return Int32Array.from(cells);
}

function stampGarden(blocks: Uint16Array, X0: number, Z0: number, W0: number, floor: number, H: number): void {
  if (!gardenCells) gardenCells = buildGarden();
  const cells = gardenCells;
  for (let w = 0; w < 16; w++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        if (!inGarden(X0 + x, Z0 + z, W0 + w)) continue;
        const i = x + (z << 4) + (w << 8);
        for (let y = floor + 1; y < H; y++) blocks[i + y * COLUMN_LAYER] = 0;
        blocks[i + floor * COLUMN_LAYER] = B.smooth_stone;
        for (let y = floor - 3; y < floor; y++) blocks[i + y * COLUMN_LAYER] = B.stone;
      }
  for (let k = 0; k < cells.length; k += 5) {
    const x = cells[k]! - X0, y = floor + 1 + cells[k + 1]!, z = cells[k + 2]! - Z0, w = cells[k + 3]! - W0;
    if (x < 0 || x > 15 || z < 0 || z > 15 || w < 0 || w > 15 || y < 0 || y >= H) continue;
    blocks[x + (z << 4) + (w << 8) + y * COLUMN_LAYER] = cells[k + 4]!;
  }
}
