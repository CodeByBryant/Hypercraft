// The Cloud Archipelago generator (Phase 9.6). Deterministic from the seed; runs in workers.
//
// An open sky over a sea of cloud, 128 tall, no bedrock (dig through the cloud and you fall):
//
//  1. THE CLOUD SEA: everywhere, a soft floor of cloud about eight blocks thick whose top wanders
//     between y 24 and y 36 with a slow 3D noise (so it rolls in x, z and w). It is walkable and
//     diggable. Its biome is the Nimbus Sea.
//  2. ISLANDS: one lens-shaped island in 85% of the cells of a 4D lattice (88 blocks along x, z AND
//     w), jittered inside its cell: a ball in the three horizontal axes (radius 26 to 46) with a
//     domed top and a cone-shaped underside 12 to 28 deep, at 54 to 104 up. In a slice you see a
//     disc of that ball, and it grows and shrinks as you walk kata and ana. Islands may overlap.
//  3. BIOMES: one per island, from noise at its centre and its height: the Aurora Ridge on the
//     highest, the Storm Reef where the storm noise is high, Sunbreak Gardens, Zephyr Terraces and
//     the Cirrus Meadow otherwise. Every column of an island has its island's biome.
//  4. Blocks: the top of every island takes its biome's surface over its subsurface, rock below, a
//     crust on the underside; plants on every surface.
//
// `sample()` answers from the same shapes: the highest floor of the column (an island top, else the
// cloud sea) so spawning, structures and atlases agree with the blocks.

import { SimplexNoise } from '../../math/noise';
import { hash4f } from '../../math/rng';
import { REG, hexToRgb } from '../../content/registry';
import type { RealmDef } from '../../content/types';
import { COLUMN_LAYER } from '../constants';
import type { ColumnSample, GenOptions } from './SurfaceGen';
import { StructureGen, type GenExtra } from './structures/StructureGen';

const SALT_ISLAND = 0xc1a1;
const SALT_PLANT = 0xc2b2;

/** Edge of a lattice cell (an island per cell, in x, z and w). */
export const CLOUD_CELL = 88;
/** The cloud sea: its base level, how far its top wanders, and its thickness. */
export const CLOUD_BASE = 30;
export const CLOUD_WANDER = 6;
export const CLOUD_THICK = 8;

interface CB {
  index: number;
  name: string;
  surface: number;
  sub: number;
  under: number;
  stone: number;
  ceil: number;
  rgb: [number, number, number];
  plants: { id: number; density: number }[];
}

export interface Island {
  x: number;
  y: number;
  z: number;
  w: number;
  /** Radius in the three horizontal axes. */
  r: number;
  /** How far the underside hangs below the centre, and how much the top domes above it. */
  depth: number;
  dome: number;
  biome: CB;
}

export class CloudGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  readonly options: GenOptions;
  garden = false;
  gardenOrigin: [number, number, number, number] = [0, 0, 0, 0];
  readonly byName = new Map<string, CB>();
  private readonly seaB: CB;
  private readonly nSea: SimplexNoise;
  private readonly nShapeTop: SimplexNoise;
  private readonly nShapeBot: SimplexNoise;
  private readonly nT: SimplexNoise;
  private readonly nH: SimplexNoise;
  private readonly cells = new Map<string, Island | null>();
  /** The islands around the column being generated (scratch). */
  private readonly near: Island[] = [];

  constructor(seed: number, realm: RealmDef, options: GenOptions = {}) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.options = options;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    const s = this.seed;
    this.nSea = new SimplexNoise(s ^ 0xc101);
    this.nShapeTop = new SimplexNoise(s ^ 0xc102);
    this.nShapeBot = new SimplexNoise(s ^ 0xc103);
    this.nT = new SimplexNoise(s ^ 0xc104);
    this.nH = new SimplexNoise(s ^ 0xc105);
    const id = (n: string) => REG.id(n);
    REG.biomes.forEach((def, index) => {
      if (def.realm !== realm.name) return;
      this.byName.set(def.name, {
        index,
        name: def.name,
        surface: id(def.surface),
        sub: id(def.subsurface),
        under: id(def.underwater),
        stone: id(def.stone!),
        ceil: id(def.ceiling!),
        rgb: hexToRgb(def.grassColor) as [number, number, number],
        plants: def.plants.map((p) => ({ id: id(p.block), density: p.density })),
      });
    });
    const sea = this.byName.get('nimbus_sea');
    if (!sea) throw new Error(`realm "${realm.name}": missing biome "nimbus_sea"`);
    this.seaB = sea;
  }

  // ------------------------------------------------------------------ the cloud sea

  /** The top of the cloud sea at a column. */
  cloudTop(X: number, Z: number, W: number): number {
    return CLOUD_BASE + Math.round(this.nSea.n3(X / 80, Z / 80, W / 80) * CLOUD_WANDER);
  }

  // ------------------------------------------------------------------ islands

  private biomeFor(cx: number, cy: number, cz: number, cw: number): CB {
    const g = (n: string) => this.byName.get(n)!;
    if (cy > 98) return g('aurora_ridge');
    const t = this.nT.n3(cx / 160, cz / 160, cw / 160), h = this.nH.n3(cx / 140 + 20, cz / 140, cw / 140);
    if (t < -0.22) return g('storm_reef');
    if (h < -0.22) return g('zephyr_terraces');
    if (t > 0.2 && h > 0) return g('sunbreak_gardens');
    return g('cirrus_meadow');
  }

  /** The island of lattice cell (gx, gz, gw), or null. */
  islandOf(gx: number, gz: number, gw: number): Island | null {
    const key = `${gx},${gz},${gw}`;
    let isl = this.cells.get(key);
    if (isl !== undefined) return isl;
    const s = this.seed ^ SALT_ISLAND;
    if (hash4f(gx, 0, gz, gw, s) > 0.85) isl = null;
    else {
      const r = 26 + hash4f(gx, 1, gz, gw, s) * 20;
      const span = CLOUD_CELL - 1.2 * r;
      const x = gx * CLOUD_CELL + r * 0.6 + hash4f(gx, 2, gz, gw, s) * span;
      const z = gz * CLOUD_CELL + r * 0.6 + hash4f(gx, 3, gz, gw, s) * span;
      const w = gw * CLOUD_CELL + r * 0.6 + hash4f(gx, 4, gz, gw, s) * span;
      const y = 54 + hash4f(gx, 5, gz, gw, s) * 50;
      isl = { x, y, z, w, r, depth: 12 + hash4f(gx, 6, gz, gw, s) * 16, dome: 3 + hash4f(gx, 7, gz, gw, s) * 5, biome: this.biomeFor(x, y, z, w) };
    }
    if (this.cells.size > 4096) this.cells.clear();
    this.cells.set(key, isl);
    return isl;
  }

  /** The islands whose ball can reach the column (x, z, w): those of the 27 cells around it. */
  private gather(X: number, Z: number, W: number, out: Island[]): void {
    out.length = 0;
    const gx = Math.floor(X / CLOUD_CELL), gz = Math.floor(Z / CLOUD_CELL), gw = Math.floor(W / CLOUD_CELL);
    for (let dw = -1; dw <= 1; dw++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const isl = this.islandOf(gx + dx, gz + dz, gw + dw);
          if (isl) out.push(isl);
        }
  }

  /** The extent of an island at a column: [bottom, top] cells (inclusive), or null if the column is outside it. */
  shape(isl: Island, X: number, Z: number, W: number): { bottom: number; top: number } | null {
    const d = Math.hypot(X + 0.5 - isl.x, Z + 0.5 - isl.z, W + 0.5 - isl.w);
    if (d >= isl.r) return null;
    const u = d / isl.r;
    const top = Math.floor(isl.y + isl.dome * (1 - u * u) + this.nShapeTop.n3(X / 14, Z / 14, W / 14) * 1.2);
    const bottom = Math.ceil(isl.y - isl.depth * Math.pow(1 - u, 1.15) - 1.5 + this.nShapeBot.n3(X / 9 + 50, Z / 9, W / 9) * 2);
    return top - bottom >= 2 ? { bottom, top } : null;
  }

  /** The island the column belongs to (the one with the highest top) and its extent. */
  private islandAtCol(X: number, Z: number, W: number, near: Island[]): { isl: Island; bottom: number; top: number } | null {
    let best: { isl: Island; bottom: number; top: number } | null = null;
    for (const isl of near) {
      const s = this.shape(isl, X, Z, W);
      if (s && (!best || s.top > best.top)) best = { isl, bottom: s.bottom, top: s.top };
    }
    return best;
  }

  /** Which island (and biome) a column is in and where its top is, for the tests: null over the open cloud sea. */
  islandAt(x: number, z: number, w: number): { top: number; bottom: number; biome: string } | null {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.gather(X, Z, W, this.near);
    const b = this.islandAtCol(X, Z, W, this.near);
    return b ? { top: b.top, bottom: b.bottom, biome: b.isl.biome.name } : null;
  }

  // ------------------------------------------------------------------ terrain answers

  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    this.gather(X, Z, W, this.near);
    const b = this.islandAtCol(X, Z, W, this.near);
    const ct = this.cloudTop(X, Z, W);
    const onIsland = b !== null && b.top > ct;
    const biome = onIsland ? b!.isl.biome : this.seaB;
    out.height = onIsland ? b!.top : ct;
    out.biome = biome.index;
    out.ocean = false;
    out.river = false;
    out.grass = biome.rgb;
    return out;
  }

  /** A meadow near the origin, well inside its island. */
  spawnPoint(): [number, number, number, number] {
    for (let r = 0; r < 1500; r += 10)
      for (let a = 0; a < 16; a++)
        for (let k = 0; k < 4; k++) {
          const t = (a / 16) * Math.PI * 2;
          const x = Math.round(Math.cos(t) * r), w = Math.round(Math.sin(t) * r), z = 10 + k * 20;
          this.gather(x, z, w, this.near);
          const b = this.islandAtCol(x, z, w, this.near);
          if (!b || b.isl.biome.name === 'storm_reef' || b.isl.biome.name === 'aurora_ridge') continue;
          if (Math.hypot(x + 0.5 - b.isl.x, z + 0.5 - b.isl.z, w + 0.5 - b.isl.w) > b.isl.r * 0.55) continue;
          return [x + 0.5, b.top + 1, z + 0.5, w + 0.5];
        }
    const ct = this.cloudTop(0, 0, 0);
    return [0.5, ct + 1, 0.5, 0.5];
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
    const L = COLUMN_LAYER, seed = this.seed;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    blocks.fill(0);
    const near = this.near;
    // The islands that can reach this chunk column (the 27 cells around its middle: a column is at most
    // 16 wide and an island at most 46 in radius, a cell 88).
    const islands: Island[] = [];
    const gx0 = Math.floor(X0 / CLOUD_CELL), gz0 = Math.floor(Z0 / CLOUD_CELL), gw0 = Math.floor(W0 / CLOUD_CELL);
    for (let gw = gw0 - 1; gw <= gw0 + 1; gw++)
      for (let gz = gz0 - 1; gz <= gz0 + 1; gz++)
        for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
          const isl = this.islandOf(gx, gz, gw);
          if (!isl) continue;
          const dx = Math.max(X0 - isl.x, 0, isl.x - (X0 + 15)), dz = Math.max(Z0 - isl.z, 0, isl.z - (Z0 + 15)), dw = Math.max(W0 - isl.w, 0, isl.w - (W0 + 15));
          if (dx * dx + dz * dz + dw * dw < isl.r * isl.r) islands.push(isl);
        }
    near.length = 0;
    near.push(...islands);
    const sea = this.seaB;
    const CLOUD = sea.surface, MIST = sea.sub, CORE = sea.stone, UNDER = sea.ceil;
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = x + (z << 4) + (w << 8);
          const X = X0 + x, Z = Z0 + z, W = W0 + w;
          const ct = this.cloudTop(X, Z, W);
          const b = this.islandAtCol(X, Z, W, near);
          // The cloud sea.
          for (let y = ct - CLOUD_THICK; y <= ct; y++) {
            const dep = ct - y;
            blocks[i + y * L] = dep === 0 ? CLOUD : dep <= 3 ? MIST : dep === CLOUD_THICK ? UNDER : CORE;
          }
          const onIsland = b !== null && b.top > ct;
          const main = onIsland ? b!.isl.biome : sea;
          surface[i * 4] = Math.round(main.rgb[0] * 255);
          surface[i * 4 + 1] = Math.round(main.rgb[1] * 255);
          surface[i * 4 + 2] = Math.round(main.rgb[2] * 255);
          surface[i * 4 + 3] = main.index;
          // The island (over the cloud where they overlap).
          if (b) {
            const eb = b.isl.biome;
            for (let y = b.top; y >= b.bottom; y--) {
              const dep = b.top - y;
              blocks[i + y * L] = dep === 0 ? eb.surface : dep <= 3 ? eb.sub : y - b.bottom < 2 ? eb.ceil : eb.stone;
            }
          }
          // Plants on whatever the floor is.
          const top = onIsland ? b!.top : ct;
          const pr = hash4f(X, top, Z, W, seed ^ SALT_PLANT);
          let acc = 0;
          for (const pl of main.plants) {
            acc += pl.density;
            if (pr >= acc) continue;
            if (blocks[i + (top + 1) * L] === 0) blocks[i + (top + 1) * L] = pl.id;
            break;
          }
        }
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});
  }
}

