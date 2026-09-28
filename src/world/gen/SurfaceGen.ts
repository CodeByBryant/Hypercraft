// Phase 1 Surface generator ("surface_phase1"). Deterministic from the seed; runs in
// workers. It is intentionally modest (Phase 2 replaces it with the full 24-biome,
// worm/cavern/ana-sheet terrain) but already fully 4D: height, climate, caves, ores and
// trees all vary along W, so walking kata/ana changes the landscape.
//
// Output is a dense column: index = x + 16 z + 256 w + 4096 y (see denseIndex()).

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { B, REG, hexToRgb, makeVoxel } from '../../content/registry';
import type { BiomeDef, RealmDef } from '../../content/types';
import { COLUMN_LAYER } from '../constants';

const SALT_TREE = 0x7ee5;
const SALT_GRASS = 0x62a5;
const SALT_ORE = 0x03e5;
const SALT_BEDROCK = 0xbed0;

export interface ColumnSample {
  height: number;
  biome: number;
  temperature?: number;
  humidity?: number;
  /** Blended grass colour (0..1 rgb). */
  grass: [number, number, number];
}

export interface BiomeSelection {
  biome: number;
  heightBias: number;
  heightScale: number;
  grass: [number, number, number];
}

/**
 * Biome selection from climate: the nearest biome in (temperature, humidity) space wins;
 * height parameters and grass colour are blended with weights 1 / d^4 so borders are
 * continuous. Pure function (unit-tested).
 */
export function selectBiome(
  temp: number,
  hum: number,
  biomes: readonly BiomeDef[],
  grass: readonly (readonly [number, number, number])[],
  out: BiomeSelection,
): BiomeSelection {
  let wsum = 0;
  let bias = 0;
  let scale = 0;
  let gr = 0, gg = 0, gb = 0;
  let best = 0;
  let bestW = -1;
  for (let i = 0; i < biomes.length; i++) {
    const b = biomes[i]!;
    const dt = temp - b.temperature;
    const dh = hum - b.humidity;
    const d2 = dt * dt + dh * dh;
    const wt = 1 / (d2 * d2 + 1e-5);
    wsum += wt;
    bias += wt * b.heightBias;
    scale += wt * b.heightScale;
    const g = grass[i]!;
    gr += wt * g[0];
    gg += wt * g[1];
    gb += wt * g[2];
    if (wt > bestW) {
      bestW = wt;
      best = i;
    }
  }
  out.biome = best;
  out.heightBias = bias / wsum;
  out.heightScale = scale / wsum;
  out.grass[0] = gr / wsum;
  out.grass[1] = gg / wsum;
  out.grass[2] = gb / wsum;
  return out;
}

interface OreDef {
  id: number;
  salt: number;
  maxY: number;
  chance: number;
  radius: number;
}

export class SurfaceGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  private readonly nHeight: SimplexNoise;
  private readonly nHills: SimplexNoise;
  private readonly nDetail: SimplexNoise;
  private readonly nTemp: SimplexNoise;
  private readonly nHum: SimplexNoise;
  private readonly nCave: SimplexNoise;
  private readonly nCave2: SimplexNoise;
  private readonly biomes: BiomeDef[];
  private readonly biomeGrass: [number, number, number][];
  private readonly surfaceIds: Uint16Array;
  private readonly subsurfaceIds: Uint16Array;
  private readonly underwaterIds: Uint16Array;
  private readonly ores: OreDef[];
  /** Include the engine test garden near the origin (Phase 1 showcase for R6 screenshots). */
  testGarden = true;
  private readonly selection: BiomeSelection = { biome: 0, heightBias: 0, heightScale: 1, grass: [0, 0, 0] };

  constructor(seed: number, realm: RealmDef) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    this.nHeight = new SimplexNoise(seed ^ 0x1001);
    this.nHills = new SimplexNoise(seed ^ 0x2002);
    this.nDetail = new SimplexNoise(seed ^ 0x3003);
    this.nTemp = new SimplexNoise(seed ^ 0x4004);
    this.nHum = new SimplexNoise(seed ^ 0x5005);
    this.nCave = new SimplexNoise(seed ^ 0x6006);
    this.nCave2 = new SimplexNoise(seed ^ 0x7007);
    this.biomes = REG.biomes;
    this.biomeGrass = this.biomes.map((b) => hexToRgb(b.grassColor));
    this.surfaceIds = Uint16Array.from(this.biomes.map((b) => REG.id(b.surface)));
    this.subsurfaceIds = Uint16Array.from(this.biomes.map((b) => REG.id(b.subsurface)));
    this.underwaterIds = Uint16Array.from(this.biomes.map((b) => REG.id(b.underwater)));
    this.ores = [
      { id: B.coal_ore, salt: 1, maxY: 110, chance: 0.03, radius: 1.8 },
      { id: B.iron_ore, salt: 2, maxY: 64, chance: 0.018, radius: 1.5 },
      { id: B.hyperite_ore, salt: 3, maxY: 22, chance: 0.006, radius: 1.3 },
    ];
  }

  /** Climate + terrain height at an integer world (x, z, w). Pure function of the seed. */
  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const temp = 0.5 + 0.62 * this.nTemp.fbm3(x / 700, z / 700, w / 700, 3);
    const hum = 0.5 + 0.62 * this.nHum.fbm3(x / 560 + 31.7, z / 560, w / 560, 3);
    const sel = selectBiome(temp, hum, this.biomes, this.biomeGrass, this.selection);
    const cont = this.nHeight.fbm3(x / 360, z / 360, w / 360, 3);
    const hills = this.nHills.fbm3(x / 92, z / 92, w / 92, 4);
    const detail = this.nDetail.n3(x / 23, z / 23, w / 23);
    const h = this.sea + 5 + 20 * cont + 15 * hills * sel.heightScale + 2.5 * detail + sel.heightBias;
    out.height = Math.max(6, Math.min(this.height - 20, Math.floor(h)));
    out.biome = sel.biome;
    out.temperature = temp;
    out.humidity = hum;
    out.grass[0] = sel.grass[0];
    out.grass[1] = sel.grass[1];
    out.grass[2] = sel.grass[2];
    return out;
  }

  /** Terrain height including the test-garden plateau. */
  heightAt(x: number, z: number, w: number, s: ColumnSample): number {
    this.sample(x, z, w, s);
    if (this.testGarden && inGarden(x, z, w)) return this.gardenFloor();
    return s.height;
  }

  private gardenFloorY = -1;
  gardenFloor(): number {
    if (this.gardenFloorY < 0) {
      const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
      this.sample(0, 16, 0, s);
      this.gardenFloorY = Math.max(this.sea + 3, Math.min(this.sea + 18, s.height));
    }
    return this.gardenFloorY;
  }

  /** Spawn position (feet) for a world: on top of the terrain at the origin. */
  spawnPoint(): [number, number, number, number] {
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    const h = this.heightAt(0, 0, 0, s);
    return [0.5, Math.max(h, this.sea) + 1.01, 0.5, 0.5];
  }

  /**
   * Generate one column into `blocks` (dense, length 4096 * height).
   * `surface` receives RGBA per (x, z, w): grass colour + biome index.
   */
  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array): void {
    const H = this.height;
    const sea = this.sea;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    const heights = new Int16Array(COLUMN_LAYER);
    const biomeOf = new Uint8Array(COLUMN_LAYER);
    const s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
    blocks.fill(0);

    // 1. Heights, climate, surface colour.
    for (let w = 0; w < 16; w++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const h = this.heightAt(X0 + x, Z0 + z, W0 + w, s);
          heights[i] = h;
          biomeOf[i] = s.biome;
          surface[i * 4] = Math.round(s.grass[0] * 255);
          surface[i * 4 + 1] = Math.round(s.grass[1] * 255);
          surface[i * 4 + 2] = Math.round(s.grass[2] * 255);
          surface[i * 4 + 3] = s.biome;
        }
      }
    }

    // 2. Coarse 4D cave density on a 4-voxel lattice (quadrilinear interpolation).
    const LY = (H >> 2) + 1;
    const cave = new Float32Array(5 * 5 * 5 * LY);
    for (let ly = 0; ly < LY; ly++) {
      for (let lw = 0; lw < 5; lw++) {
        for (let lz = 0; lz < 5; lz++) {
          for (let lx = 0; lx < 5; lx++) {
            const X = X0 + lx * 4, Y = ly * 4, Z = Z0 + lz * 4, W = W0 + lw * 4;
            const d = this.nCave.n4(X / 34, Y / 22, Z / 34, W / 34) + 0.5 * this.nCave2.n4(X / 15, Y / 11, Z / 15, W / 15 + 40);
            cave[lx + 5 * (lz + 5 * (lw + 5 * ly))] = d;
          }
        }
      }
    }
    const caveAt = (x: number, y: number, z: number, w: number): number => {
      const fx = x / 4, fy = y / 4, fz = z / 4, fw = w / 4;
      const ix = Math.min(3, fx | 0), iy = Math.min(LY - 2, fy | 0), iz = Math.min(3, fz | 0), iw = Math.min(3, fw | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz, tw = fw - iw;
      let acc = 0;
      for (let c = 0; c < 16; c++) {
        const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1, dw = (c >> 3) & 1;
        const wt = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz) * (dw ? tw : 1 - tw);
        acc += wt * cave[ix + dx + 5 * (iz + dz + 5 * (iw + dw + 5 * (iy + dy)))]!;
      }
      return acc;
    };

    // 3. Fill terrain.
    const stone = B.stone, water = B.water, ice = B.ice, lava = B.lava, bedrock = B.bedrock;
    for (let w = 0; w < 16; w++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const h = heights[i]!;
          const bi = biomeOf[i]!;
          const biome = this.biomes[bi]!;
          const underwater = h < sea;
          const top = underwater ? this.underwaterIds[bi]! : this.surfaceIds[bi]!;
          const sub = underwater ? this.underwaterIds[bi]! : this.subsurfaceIds[bi]!;
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const garden = this.testGarden && inGarden(X, Z, W);
          const maxY = Math.max(h, sea);
          for (let y = 0; y <= maxY && y < H; y++) {
            let v = 0;
            if (y === 0) v = bedrock;
            else if (y <= 3 && hash4f(X, y, Z, W, this.seed ^ SALT_BEDROCK) < 0.55 - y * 0.15) v = bedrock;
            else if (y <= h) {
              if (y === h) v = garden ? B.smooth_stone : top;
              else if (y > h - 4) v = garden ? stone : sub;
              else v = stone;
              // Caves: carve below the surface (keep a roof under water / in the garden).
              const roof = underwater || garden ? 7 : 1;
              if (y < h - roof + 1 && y > 0) {
                const d = caveAt(x, y, z, w);
                if (d > 0.52) v = y <= 10 ? lava : 0;
              }
            } else if (y <= sea) {
              v = y === sea && biome.frozenWater ? ice : water;
            }
            if (v !== 0) blocks[i + y * COLUMN_LAYER] = v;
          }
        }
      }
    }

    // 4. Ore blobs (hyperspheres) seeded per 4^4 brick, including a 1-brick margin so
    //    blobs crossing column borders are continuous.
    for (const ore of this.ores) {
      for (let bw = -1; bw <= 4; bw++) {
        for (let bz = -1; bz <= 4; bz++) {
          for (let bx = -1; bx <= 4; bx++) {
            for (let by = 0; by < ore.maxY >> 2; by++) {
              const gx = (X0 >> 2) + bx, gz = (Z0 >> 2) + bz, gw = (W0 >> 2) + bw;
              const hsh = hash4(gx, by, gz, gw, this.seed ^ (SALT_ORE + ore.salt * 977));
              if (hsh / 4294967296 >= ore.chance) continue;
              const r = ore.radius;
              const ccx = gx * 4 + ((hsh >>> 8) & 3) + 0.5 - X0;
              const ccy = by * 4 + ((hsh >>> 10) & 3) + 0.5;
              const ccz = gz * 4 + ((hsh >>> 12) & 3) + 0.5 - Z0;
              const ccw = gw * 4 + ((hsh >>> 14) & 3) + 0.5 - W0;
              stampBall(blocks, ccx, ccy, ccz, ccw, r, H, (old) => (old === stone ? ore.id : old));
            }
          }
        }
      }
    }

    // 5. Trees (4D-ball canopies) and tall grass, with a margin so canopies cross borders.
    const M = 3;
    for (let w = -M; w < 16 + M; w++) {
      for (let z = -M; z < 16 + M; z++) {
        for (let x = -M; x < 16 + M; x++) {
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const inside = x >= 0 && x < 16 && z >= 0 && z < 16 && w >= 0 && w < 16;
          const r = hash4f(X, 0, Z, W, this.seed ^ SALT_TREE);
          if (r > 0.02) {
            // Cheap reject before evaluating the biome (max tree density is 0.012).
            if (inside) this.maybeGrass(blocks, x, z, w, heights, biomeOf, X, Z, W);
            continue;
          }
          let h: number;
          let biome: BiomeDef;
          if (inside) {
            const i = x + (z << 4) + (w << 8);
            h = heights[i]!;
            biome = this.biomes[biomeOf[i]!]!;
          } else {
            h = this.heightAt(X, Z, W, s);
            biome = this.biomes[s.biome]!;
          }
          if (this.testGarden && inGardenMargin(X, Z, W)) {
            if (inside) this.maybeGrass(blocks, x, z, w, heights, biomeOf, X, Z, W);
            continue;
          }
          if (r >= biome.treeDensity || h <= sea || REG.id(biome.surface) !== B.grass) {
            if (inside) this.maybeGrass(blocks, x, z, w, heights, biomeOf, X, Z, W);
            continue;
          }
          this.placeTree(blocks, x, h + 1, z, w, hash4(X, 1, Z, W, this.seed ^ SALT_TREE));
        }
      }
    }

    if (this.testGarden) stampGarden(blocks, X0, Z0, W0, this.gardenFloor(), H);
  }

  private maybeGrass(blocks: Uint16Array, x: number, z: number, w: number, heights: Int16Array, biomeOf: Uint8Array, X: number, Z: number, W: number): void {
    const i = x + (z << 4) + (w << 8);
    const h = heights[i]!;
    const biome = this.biomes[biomeOf[i]!]!;
    if (h + 1 >= this.height || h < this.sea) return;
    if (blocks[i + h * COLUMN_LAYER] !== B.grass) return;
    if (hash4f(X, 2, Z, W, this.seed ^ SALT_GRASS) >= biome.grassDensity) return;
    const above = i + (h + 1) * COLUMN_LAYER;
    if (blocks[above] === 0) blocks[above] = B.tall_grass;
  }

  private placeTree(blocks: Uint16Array, x: number, y: number, z: number, w: number, h: number): void {
    const H = this.height;
    const trunk = 4 + (h & 3);
    const r = 2.2 + ((h >>> 4) & 7) * 0.1;
    const top = y + trunk;
    // Canopy: a 4D ball centred just below the trunk top.
    stampBall(blocks, x + 0.5, top - 0.5, z + 0.5, w + 0.5, r, H, (old) => (old === 0 || old === B.tall_grass ? B.leaves : old));
    for (let t = 0; t < trunk; t++) setIfInside(blocks, x, y + t, z, w, H, B.log, true);
  }
}

function setIfInside(blocks: Uint16Array, x: number, y: number, z: number, w: number, H: number, v: number, force: boolean): void {
  if (x < 0 || x > 15 || z < 0 || z > 15 || w < 0 || w > 15 || y < 0 || y >= H) return;
  const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
  if (force || blocks[i] === 0) blocks[i] = v;
}

/** Writes a 4D ball (column-local coordinates, may extend outside) through `f(old) -> new`. */
function stampBall(blocks: Uint16Array, cx: number, cy: number, cz: number, cw: number, r: number, H: number, f: (old: number) => number): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(15, Math.floor(cx + r));
  const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(15, Math.floor(cz + r));
  const w0 = Math.max(0, Math.floor(cw - r)), w1 = Math.min(15, Math.floor(cw + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let w = w0; w <= w1; w++) {
      const dw = w + 0.5 - cw;
      for (let z = z0; z <= z1; z++) {
        const dz = z + 0.5 - cz;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          if (dx * dx + dy * dy + dz * dz + dw * dw > r2) continue;
          const i = x + (z << 4) + (w << 8) + y * COLUMN_LAYER;
          blocks[i] = f(blocks[i]!);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Engine test garden: a flat plateau near spawn with every Phase 1 rendering feature, laid
// out so the R6 screenshot views (axis-aligned, XW 30°, XW+ZW 45°) have something to show.
//   x in [-12, 12], z in [4, 28], w in [-4, 4] (all inclusive), floor at gardenFloor().

export const GARDEN = { x0: -12, x1: 12, z0: 4, z1: 28, w0: -4, w1: 4 };

export function inGarden(x: number, z: number, w: number): boolean {
  return x >= GARDEN.x0 && x <= GARDEN.x1 && z >= GARDEN.z0 && z <= GARDEN.z1 && w >= GARDEN.w0 && w <= GARDEN.w1;
}

function inGardenMargin(x: number, z: number, w: number): boolean {
  return x >= GARDEN.x0 - 4 && x <= GARDEN.x1 + 4 && z >= GARDEN.z0 - 4 && z <= GARDEN.z1 + 4 && w >= GARDEN.w0 - 4 && w <= GARDEN.w1 + 4;
}

/** Garden contents as a list of [x, y(relative to floor+1), z, w, voxel] (built once). */
let gardenCells: Int32Array | null = null;

function buildGarden(): Int32Array {
  const cells: number[] = [];
  const put = (x: number, y: number, z: number, w: number, v: number) => cells.push(x, y, z, w, v);
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, w0: number, w1: number, v: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let w = w0; w <= w1; w++) put(x, y, z, w, v);
  };
  // A solid 3x3x3x3 tesseract sculpture of alternating markers: reads as cubes when
  // axis-aligned and as prisms when the slice is tilted.
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++)
        for (let w = 0; w < 3; w++) {
          const v = [B.marker_x, B.marker_z, B.marker_w, B.marker_y][(x + y + z + w) & 3]!;
          put(-1 + x, y, 14 + z, -1 + w, v);
        }
  // Axis marker posts, 4 tall, at +X (red), +Z (blue), +W (magenta, only visible ana).
  box(9, 9, 0, 3, 10, 10, 0, 0, B.marker_x);
  box(0, 0, 0, 3, 26, 26, 0, 0, B.marker_z);
  box(0, 0, 0, 3, 10, 10, 3, 3, B.marker_w);
  box(-9, -9, 0, 5, 10, 10, 0, 0, B.marker_y);
  // Glass wall (translucency), with a lumen lamp behind it.
  box(-8, -4, 0, 2, 20, 20, -2, 2, B.glass);
  box(-6, -6, 0, 0, 22, 22, 0, 0, B.lumen);
  // Slabs and stairs (analytic sub-voxel shapes).
  box(3, 3, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_slab, 0));
  box(4, 4, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_slab, 1));
  box(5, 5, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_stairs, 0));
  box(6, 6, 0, 0, 12, 12, -2, 2, makeVoxel(B.stone_stairs, 2));
  // Ladder on a pillar (climbing).
  box(6, 6, 0, 5, 18, 18, 0, 0, B.planks);
  box(6, 6, 0, 5, 17, 17, 0, 0, makeVoxel(B.ladder, 2)); // hugs +Z (the pillar)
  // Water pool (sources) and a separate lava pool with a glass rim.
  box(6, 9, -1, -1, 5, 8, -2, 2, B.water);
  box(-10, -8, -1, -1, 5, 7, -1, 1, B.lava);
  // Torches and a lumen post (block light).
  put(-3, 0, 8, 0, B.torch);
  put(3, 0, 8, 0, B.torch);
  box(10, 10, 0, 2, 24, 24, -3, -3, B.lumen);
  // An ice block and portal membrane (translucent variants).
  put(-2, 0, 24, 0, B.ice);
  box(2, 2, 0, 2, 24, 24, 0, 0, B.portal);
  // Leaves (cutout) cluster.
  box(8, 10, 0, 2, 26, 27, 1, 3, B.leaves);
  return Int32Array.from(cells);
}

function stampGarden(blocks: Uint16Array, X0: number, Z0: number, W0: number, floor: number, H: number): void {
  if (!gardenCells) gardenCells = buildGarden();
  const cells = gardenCells;
  // Clear the air above the plateau first (trees/grass from outside must not intrude).
  for (let w = 0; w < 16; w++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        if (!inGarden(X0 + x, Z0 + z, W0 + w)) continue;
        const i = x + (z << 4) + (w << 8);
        for (let y = floor + 1; y < H; y++) blocks[i + y * COLUMN_LAYER] = 0;
      }
  for (let k = 0; k < cells.length; k += 5) {
    const x = cells[k]! - X0, y = floor + 1 + cells[k + 1]!, z = cells[k + 2]! - Z0, w = cells[k + 3]! - W0;
    if (x < 0 || x > 15 || z < 0 || z > 15 || w < 0 || w > 15 || y < 0 || y >= H) continue;
    blocks[x + (z << 4) + (w << 8) + y * COLUMN_LAYER] = cells[k + 4]!;
  }
}
