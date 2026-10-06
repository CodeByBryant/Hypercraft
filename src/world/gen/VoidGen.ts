// Hollow Void generator (Phase 8). Deterministic from the seed; runs in workers.
//
// Floating islands in black space. An island is a lens in the three horizontal axes (a 3-ball
// in x, z and w, so a slice through it is a disc that grows and shrinks as you move kata/ana),
// flat on top with a wobbling shore, tapering underneath into hanging spikes. Every (x, z, w)
// column holds at most one island span, so heights, biomes, mob spawning and structure
// placement work like on the Surface.
//
//  * The central island (radius 56, top at y 64) sits at the middle: the arrival platform with
//    the return gate, six Gateway Spires (one per horizontal direction) and the Void
//    Sovereign's arena (an inlaid ring and a throne disc; the pylons and the boss come with
//    the fight).
//  * Beyond a 300-block gap, islands on a jittered 128-block lattice (radius 14-40, 58% of the
//    cells). Their biome follows two smooth noise fields (fertility and height).
//  * Six landing islands 1024 blocks out along +-x, +-z and +-w, each with a return spire.
//
// sample() and generate() share island(), shape() and top(), so structures and spawning agree
// with the blocks exactly.

import { SimplexNoise } from '../../math/noise';
import { hash4, hash4f } from '../../math/rng';
import { REG, hexToRgb } from '../../content/registry';
import type { BiomeDef, RealmDef } from '../../content/types';
import { ARENA_R, BEAM_HEIGHT, CENTRAL_R, ARRIVAL_GATE, ARRIVAL_POS, DIRS, ISLAND_GAP, LANDING_R, LANDING_TOP, VOID_TOP, landingXZW, spireXZW } from '../../content/void';
import { COLUMN_LAYER } from '../constants';
import type { ColumnSample, GenOptions } from './SurfaceGen';
import { StructureGen, type GenExtra } from './structures/StructureGen';

const SALT_ISLAND = 0x7a01;
const SALT_PLANT = 0x7a02;
const SALT_ORE = 0x7a03;

/** Lattice cell of the random islands. */
const CELL = 128;
/** The widest an island reaches past its radius (shore wobble). */
const REACH = 1.2;

const enum Kind {
  Lattice,
  Central,
  Landing,
}

interface VB {
  /** Index into REG.biomes. */
  index: number;
  def: BiomeDef;
  /** Climate point [fertility, height]. */
  c: [number, number];
  surface: number;
  rgb: [number, number, number];
  plants: { id: number; density: number; name: string }[];
  /** Extra starlight ore per cell below the surface. */
  ore: number;
}

export interface Island {
  kind: Kind;
  cx: number;
  cz: number;
  cw: number;
  R: number;
  top: number;
  thick: number;
  /** Index into the generator's biome list. */
  biome: number;
  /** Landing islands: which of the six. */
  k: number;
}

export class VoidGenerator {
  readonly seed: number;
  readonly realm: RealmDef;
  readonly height: number;
  readonly sea: number;
  readonly options: GenOptions;
  garden = false;
  gardenOrigin: [number, number, number, number] = [0, 0, 0, 0];
  readonly vb: VB[];
  private readonly nShape: SimplexNoise;
  private readonly nBump: SimplexNoise;
  private readonly nUnder: SimplexNoise;
  private readonly nFert: SimplexNoise;
  private readonly nElev: SimplexNoise;
  private readonly cache = new Map<string, Island | null>();
  private readonly central: Island;
  private readonly landings: Island[];
  private readonly ids: Record<string, number> = {};

  constructor(seed: number, realm: RealmDef, options: GenOptions = {}) {
    this.seed = seed >>> 0;
    this.realm = realm;
    this.options = options;
    this.height = realm.heightChunks * 16;
    this.sea = realm.seaLevel;
    const s = this.seed;
    this.nShape = new SimplexNoise(s ^ 0x7b01);
    this.nBump = new SimplexNoise(s ^ 0x7b02);
    this.nUnder = new SimplexNoise(s ^ 0x7b03);
    this.nFert = new SimplexNoise(s ^ 0x7b04);
    this.nElev = new SimplexNoise(s ^ 0x7b05);
    const id = (n: string) => REG.id(n);
    this.vb = [];
    REG.biomes.forEach((def, index) => {
      if (def.realm !== realm.name) return;
      this.vb.push({
        index,
        def,
        c: [def.climate[0], def.climate[1]],
        surface: id(def.surface),
        rgb: hexToRgb(def.grassColor),
        plants: def.plants.map((p) => ({ id: id(p.block), density: p.density, name: p.block })),
        ore: def.name === 'starlight_crags' ? 0.012 : 0.0025,
      });
    });
    if (this.vb.length < 2) throw new Error(`realm "${realm.name}": needs void biomes`);
    for (const n of ['void_rock', 'voidstone', 'voidstone_bricks', 'sovereign_stone', 'starlight_crystal', 'void_gate', 'void_gate_frame_eye', 'gateway_beam', 'whisper_vine', 'whisper_blossom']) this.ids[n] = id(n);
    const plateau = this.vb.findIndex((b) => b.def.name === 'hollow_plateau');
    this.central = { kind: Kind.Central, cx: 0, cz: 0, cw: 0, R: CENTRAL_R, top: VOID_TOP, thick: 38, biome: plateau, k: -1 };
    // The landings: a different biome each.
    const names = ['whisper_gardens', 'starlight_crags', 'glimmer_meadows', 'void_spires', 'shattered_reach', 'hollow_plateau'];
    this.landings = DIRS.map((_, k) => {
      const c = landingXZW(k);
      return { kind: Kind.Landing, cx: c[0], cz: c[1], cw: c[2], R: LANDING_R, top: LANDING_TOP, thick: 22, biome: this.vb.findIndex((b) => b.def.name === names[k]), k };
    });
  }

  // ------------------------------------------------------------------ islands

  /** The lattice island of cell (i, j, k), or null. */
  private lattice(i: number, j: number, k: number): Island | null {
    const key = `${i},${j},${k}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const isl = this.makeLattice(i, j, k);
    if (this.cache.size > 4096) this.cache.clear();
    this.cache.set(key, isl);
    return isl;
  }

  private makeLattice(i: number, j: number, k: number): Island | null {
    const seed = this.seed;
    const h = hash4(i, j, k, SALT_ISLAND, seed);
    if (((h & 0xffff) / 65536) >= 0.58) return null;
    const R = 14 + (((h >>> 16) & 255) / 255) * 26;
    const cx = i * CELL + 40 + (hash4(i, j, k, SALT_ISLAND + 1, seed) % 48);
    const cz = j * CELL + 40 + (hash4(i, j, k, SALT_ISLAND + 2, seed) % 48);
    const cw = k * CELL + 40 + (hash4(i, j, k, SALT_ISLAND + 3, seed) % 48);
    if (Math.hypot(cx, cz, cw) < ISLAND_GAP + R * REACH) return null;
    // Keep clear of the landings (they are islands of their own).
    for (const l of this.landings) if (Math.hypot(cx - l.cx, cz - l.cz, cw - l.cw) < R * REACH + l.R * REACH + 16) return null;
    const top = 52 + (hash4(i, j, k, SALT_ISLAND + 4, seed) % 34);
    const thick = 8 + R * 0.5 + (hash4(i, j, k, SALT_ISLAND + 5, seed) % 8);
    // Biome: nearest climate point to two smooth fields at the island's centre.
    const a = 0.5 + 0.5 * Math.tanh(1.8 * this.nFert.fbm3(cx / 620, cz / 620, cw / 620, 2));
    const b = 0.5 + 0.5 * Math.tanh(1.8 * this.nElev.fbm3(cx / 540, cz / 540, cw / 540, 2));
    let best = 0, bd = 1e9;
    this.vb.forEach((v, n) => {
      const d = (v.c[0] - a) ** 2 + (v.c[1] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    });
    return { kind: Kind.Lattice, cx, cz, cw, R, top, thick, biome: best, k: -1 };
  }

  /** Every island whose reach overlaps the box [x0, x1] x [z0, z1] x [w0, w1] (inclusive cells). */
  islandsIn(x0: number, z0: number, w0: number, x1: number, z1: number, w1: number, out: Island[]): Island[] {
    out.length = 0;
    const R = 40 * REACH + 1;
    if (this.reaches(this.central, x0, z0, w0, x1, z1, w1)) out.push(this.central);
    for (const l of this.landings) if (this.reaches(l, x0, z0, w0, x1, z1, w1)) out.push(l);
    // Lattice cells whose islands (centre in [40, 88] of the cell, radius <= R) can reach in.
    for (let i = Math.floor((x0 - R - 88) / CELL); i <= Math.floor((x1 + R - 40) / CELL); i++)
      for (let j = Math.floor((z0 - R - 88) / CELL); j <= Math.floor((z1 + R - 40) / CELL); j++)
        for (let k = Math.floor((w0 - R - 88) / CELL); k <= Math.floor((w1 + R - 40) / CELL); k++) {
          const isl = this.lattice(i, j, k);
          if (isl && this.reaches(isl, x0, z0, w0, x1, z1, w1)) out.push(isl);
        }
    return out;
  }

  private reaches(isl: Island, x0: number, z0: number, w0: number, x1: number, z1: number, w1: number): boolean {
    const r = isl.R * REACH;
    return isl.cx + r >= x0 && isl.cx - r <= x1 + 1 && isl.cz + r >= z0 && isl.cz - r <= z1 + 1 && isl.cw + r >= w0 && isl.cw - r <= w1 + 1;
  }

  /**
   * The span of an island in the column (x, z, w): its top and bottom cells, or null when the
   * column is off its shore.
   */
  shape(isl: Island, x: number, z: number, w: number, out: { top: number; bottom: number; d: number }): boolean {
    const dx = x + 0.5 - isl.cx, dz = z + 0.5 - isl.cz, dw = w + 0.5 - isl.cw;
    const dist = Math.hypot(dx, dz, dw);
    const wob = 1 + 0.16 * this.nShape.n3(x / 21 + isl.cx * 0.0137, z / 21 + isl.cz * 0.0171, w / 21 + isl.cw * 0.0113);
    const d = dist / (isl.R * wob);
    if (d >= 1) return false;
    let bump = 1.8 * this.nBump.n3(x / 26, z / 26, w / 26);
    if (isl.kind === Kind.Central) bump *= smooth(44, 54, dist); // flat out to the spires (38) and their plinths
    else if (isl.kind === Kind.Landing) bump *= smooth(0.15, 0.5, d);
    const top = isl.top + Math.round(bump);
    const sp = Math.max(0, this.nUnder.n3(x / 9, z / 9, w / 9));
    const t = isl.thick * Math.pow(1 - d * d, 1.1) + isl.thick * 0.9 * sp * sp * (1 - d);
    out.top = top;
    out.bottom = Math.max(3, top - Math.floor(t));
    out.d = d;
    return true;
  }

  private readonly sh = { top: 0, bottom: 0, d: 0 };
  private readonly near: Island[] = [];

  // ------------------------------------------------------------------ answers

  /** Surface height and biome at a column: the top of the island there, or open void. */
  sample(x: number, z: number, w: number, out: ColumnSample): ColumnSample {
    const X = Math.floor(x), Z = Math.floor(z), W = Math.floor(w);
    const near = this.islandsIn(X, Z, W, X, Z, W, this.near);
    let best: Island | null = null, top = -1;
    for (const isl of near) if (this.shape(isl, X, Z, W, this.sh) && this.sh.top > top) {
      top = this.sh.top;
      best = isl;
    }
    if (!best) {
      const v = this.vb[0]!;
      out.height = 0;
      out.biome = v.index;
      out.ocean = true;
      out.river = false;
      out.grass = v.rgb;
      return out;
    }
    const v = this.vb[best.biome]!;
    out.height = top;
    out.biome = v.index;
    out.ocean = false;
    out.river = false;
    out.grass = v.rgb;
    return out;
  }

  /** The arrival platform's standing spot. */
  spawnPoint(): [number, number, number, number] {
    return [ARRIVAL_POS[0], ARRIVAL_POS[1], ARRIVAL_POS[2], ARRIVAL_POS[3]];
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
    const H = this.height, L = COLUMN_LAYER, seed = this.seed;
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    blocks.fill(0);
    const I = this.ids;
    const ROCK = I.void_rock!, ARENA = I.sovereign_stone!, CRYSTAL = I.starlight_crystal!;
    const dflt = this.vb[0]!;
    for (let i = 0; i < COLUMN_LAYER; i++) {
      surface[i * 4] = Math.round(dflt.rgb[0] * 255);
      surface[i * 4 + 1] = Math.round(dflt.rgb[1] * 255);
      surface[i * 4 + 2] = Math.round(dflt.rgb[2] * 255);
      surface[i * 4 + 3] = dflt.index;
    }
    const near = this.islandsIn(X0, Z0, W0, X0 + 15, Z0 + 15, W0 + 15, this.near);
    const sh = this.sh;
    if (near.length) {
      for (let w = 0; w < 16; w++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) {
            const X = X0 + x, Z = Z0 + z, W = W0 + w;
            let best: Island | null = null, bt = -1, bb = 0;
            for (const isl of near) if (this.shape(isl, X, Z, W, sh) && sh.top > bt) {
              best = isl;
              bt = sh.top;
              bb = sh.bottom;
            }
            if (!best) continue;
            const i = x + (z << 4) + (w << 8);
            const v = this.vb[best.biome]!;
            surface[i * 4] = Math.round(v.rgb[0] * 255);
            surface[i * 4 + 1] = Math.round(v.rgb[1] * 255);
            surface[i * 4 + 2] = Math.round(v.rgb[2] * 255);
            surface[i * 4 + 3] = v.index;
            const top = Math.min(H - 2, bt);
            for (let y = bb; y <= top; y++) {
              let b = ROCK;
              if (y === top) b = v.surface;
              else if (y > bt - 3) b = ROCK;
              else if (y > bb + 1 && hash4f(X, y, Z, W, seed ^ SALT_ORE) < v.ore) b = CRYSTAL;
              blocks[i + y * L] = b;
            }
            // The arena: an inlaid ring and the throne disc on the central island.
            if (best.kind === Kind.Central) {
              const dist = Math.hypot(X + 0.5, Z + 0.5, W + 0.5);
              if (bt === VOID_TOP && ((dist > ARENA_R - 1.3 && dist < ARENA_R + 0.4) || dist < 6.5)) {
                blocks[i + top * L] = ARENA;
                continue;
              }
            }
            this.plants(blocks, i, X, Z, W, top, v, best);
          }
    }
    this.stamp(blocks, X0, Z0, W0);
    this.structures.apply(cx, cz, cw, blocks, extra ?? {});
  }

  /** Plants on an island top (vines grow tall, with a blossom on top now and then). */
  private plants(blocks: Uint16Array, i: number, X: number, Z: number, W: number, top: number, v: VB, isl: Island): void {
    if (top + 8 >= this.height) return;
    const L = COLUMN_LAYER;
    // Nothing on the landings' centre pads and the central island's inner area.
    if (isl.kind !== Kind.Lattice && Math.hypot(X + 0.5 - isl.cx, Z + 0.5 - isl.cz, W + 0.5 - isl.cw) < 7) return;
    const r = hash4f(X, 2, Z, W, this.seed ^ SALT_PLANT);
    let acc = 0;
    for (const p of v.plants) {
      acc += p.density;
      if (r >= acc) continue;
      if (p.name === 'whisper_vine') {
        const n = 1 + (hash4(X, 3, Z, W, this.seed ^ SALT_PLANT) % 5);
        for (let k = 1; k <= n; k++) blocks[i + (top + k) * L] = p.id;
        if (n >= 3) blocks[i + (top + n + 1) * L] = this.ids.whisper_blossom!;
      } else blocks[i + (top + 1) * L] = p.id;
      return;
    }
  }

  /** Write one cell of the fixed features if it lies in this column. */
  private put(blocks: Uint16Array, X0: number, Z0: number, W0: number, x: number, y: number, z: number, w: number, id: number): void {
    const lx = x - X0, lz = z - Z0, lw = w - W0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || lw < 0 || lw > 15 || y < 1 || y >= this.height) return;
    blocks[lx + (lz << 4) + (lw << 8) + y * COLUMN_LAYER] = id;
  }

  /** The central island's arrival platform, return gate and spires, and the landings' spires. */
  private stamp(blocks: Uint16Array, X0: number, Z0: number, W0: number): void {
    const I = this.ids;
    const put = (x: number, y: number, z: number, w: number, id: number) => this.put(blocks, X0, Z0, W0, x, y, z, w, id);
    const near = (x: number, z: number, w: number, r: number) => x + r >= X0 && x - r <= X0 + 15 && z + r >= Z0 && z - r <= Z0 + 15 && w + r >= W0 && w - r <= W0 + 15;
    // Arrival platform: 7 x 7 x 5 of voidstone bricks, and the return gate (a lit cell inside
    // six frames holding eyes) in its middle. Air above.
    const [ax, ay, az, aw] = ARRIVAL_GATE;
    if (near(ax, az, aw, 4)) {
      for (let x = ax - 3; x <= ax + 3; x++)
        for (let z = az - 3; z <= az + 3; z++)
          for (let w = aw - 2; w <= aw + 2; w++) {
            put(x, VOID_TOP, z, w, I.voidstone_bricks!);
            for (let y = VOID_TOP + 1; y <= VOID_TOP + 6; y++) put(x, y, z, w, 0);
          }
      for (const d of DIRS) put(ax + d[0], ay, az + d[1], aw + d[2], I.void_gate_frame_eye!);
      put(ax, ay, az, aw, I.void_gate!);
    }
    // The six central spires: a 3 x 3 x 3 plinth of bricks, a dormant (solid) centre.
    for (let k = 0; k < 6; k++) {
      const [sx, sz, sw] = spireXZW(k);
      if (near(sx, sz, sw, 2)) this.spire(put, sx, VOID_TOP, sz, sw, false);
    }
    // The landings: a flat pad and an active return spire.
    for (let k = 0; k < 6; k++) {
      const [lx, lz, lw] = landingXZW(k);
      if (near(lx, lz, lw, 2)) this.spire(put, lx, LANDING_TOP, lz, lw, true);
    }
  }

  private spire(put: (x: number, y: number, z: number, w: number, id: number) => void, sx: number, top: number, sz: number, sw: number, active: boolean): void {
    const I = this.ids;
    for (let x = sx - 1; x <= sx + 1; x++)
      for (let z = sz - 1; z <= sz + 1; z++)
        for (let w = sw - 1; w <= sw + 1; w++) {
          put(x, top, z, w, I.voidstone_bricks!);
          put(x, top + 1, z, w, x === sx && z === sz && w === sw ? (active ? I.gateway_beam! : I.voidstone!) : I.voidstone_bricks!);
          for (let y = top + 2; y <= top + 1 + BEAM_HEIGHT; y++) put(x, y, z, w, x === sx && z === sz && w === sw && active ? I.gateway_beam! : 0);
        }
  }

  /** The beam cells of central spire k (used to wake it when the Sovereign falls). */
  static beamCells(k: number): [number, number, number, number][] {
    const [sx, sz, sw] = spireXZW(k);
    const out: [number, number, number, number][] = [];
    for (let y = VOID_TOP + 1; y <= VOID_TOP + BEAM_HEIGHT; y++) out.push([sx, y, sz, sw]);
    return out;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
