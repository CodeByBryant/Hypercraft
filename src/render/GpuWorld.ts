// GPU-side world: chunk table + brick table + brick pools (see docs/gpu-layout.md).
//
//  chunk table  R32UI 2D (256 wide). One texel per chunk slot:
//               0 = not resident; bit31 = resident; bit30 = whole chunk is one voxel
//               (bits 0-15 hold it) so the ray can skip 16^4 at once.
//  brick table  RG32UI 2D. Each chunk slot owns a 16x16 tile (256 bricks); tile t sits at
//               ((t % 128) * 16, floor(t / 128) * 16); brick (bx,by,bz,bw) -> (bx + 4bw, by + 4bz).
//               .r bit31 = block brick is in the pool (bits 0-30 = pool brick) else bits 0-15 = uniform voxel
//               .g bit31 = light brick is in the pool (bits 0-30 = pool brick) else bits 0-7 = uniform light
//  block pool   R16UI 2D array, 2048 x 2048 x L. Pool brick p: layer p >> 14, tile
//               ((p & 16383) % 128, (p & 16383) / 128), voxel (vx,vy,vz,vw) -> (vx + 4vw, vy + 4vz).
//  light pool   R8UI with the same geometry, allocated independently.
//  surface map  RGBA8 3D texture (N*16)^3, toroidal in x/z/w: grass colour + biome index.
//
// Pool bricks are allocated in groups of 8 (a 128x16 texel strip) so a chunk uploads in
// ceil(n/8) calls; single edited bricks upload as one 16x16 tile.

import { REG, SHAPE_TEXELS } from '../content/registry';
import { buildAtlas } from '../content/textureGen';
import type { Chunk } from '../world/Chunk';
import type { Column, World } from '../world/World';
import { mod } from '../world/constants';
import { createTexture2D, createTextureArray } from './gl';

export const POOL_SIZE = 2048;
export const BRICKS_PER_LAYER = 16384;
export const GROUPS_PER_LAYER = 2048;
export const CT_WIDTH = 256;
export const BT_TILES_PER_ROW = 128;

const NONUNI = 0x80000000;

interface ChunkGpu {
  slot: number;
  bGroups: number[];
  lGroups: number[];
  gen: number;
}

// voxel-in-brick index -> texel offset inside a 16x16 tile, for row strides 128 and 16.
const OFF128 = new Int32Array(256);
const OFF16 = new Int32Array(256);
for (let vi = 0; vi < 256; vi++) {
  const vx = vi & 3, vy = (vi >> 2) & 3, vz = (vi >> 4) & 3, vw = (vi >> 6) & 3;
  OFF128[vi] = (vy + 4 * vz) * 128 + vx + 4 * vw;
  OFF16[vi] = (vy + 4 * vz) * 16 + vx + 4 * vw;
}

class BrickPool {
  tex: WebGLTexture;
  layers: number;
  private free: number[] = [];
  private next = 0;
  used = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly internalFormat: number,
    layers: number,
  ) {
    this.layers = layers;
    this.tex = createTextureArray(gl, internalFormat, POOL_SIZE, POOL_SIZE, layers);
  }

  get capacityGroups(): number {
    return this.layers * GROUPS_PER_LAYER;
  }

  alloc(): number {
    this.used++;
    if (this.free.length) return this.free.pop()!;
    if (this.next < this.capacityGroups) return this.next++;
    this.used--;
    return -1;
  }

  release(g: number): void {
    this.used--;
    this.free.push(g);
  }

  reset(): void {
    this.free = [];
    this.next = 0;
    this.used = 0;
  }

  /** Recreate with more layers; all contents are lost (caller re-uploads). */
  grow(maxLayers: number): boolean {
    const nl = Math.min(maxLayers, Math.ceil(this.layers * 1.5) + 1);
    if (nl <= this.layers) return false;
    this.gl.deleteTexture(this.tex);
    this.layers = nl;
    this.tex = createTextureArray(this.gl, this.internalFormat, POOL_SIZE, POOL_SIZE, nl);
    this.free = [];
    this.next = 0;
    this.used = 0;
    return true;
  }

  bytes(bytesPerTexel: number): number {
    return this.layers * POOL_SIZE * POOL_SIZE * bytesPerTexel;
  }
}

export interface GpuStats {
  uploadsThisFrame: number;
  bytesThisFrame: number;
  freshChunksThisFrame: number;
  blockGroups: number;
  lightGroups: number;
  poolBytes: number;
  regrows: number;
  queued: number;
}

export class GpuWorld {
  readonly gl: WebGL2RenderingContext;
  readonly world: World;
  N = 0;
  heightChunks = 0;
  slots = 0;
  chunkTable!: WebGLTexture;
  private ctData!: Uint32Array;
  private ctHeight = 1;
  private ctDirty = true;
  brickTable!: WebGLTexture;
  private btHeight = 1;
  surfaceTex!: WebGLTexture;
  surfaceSize = 0;
  readonly blockPool: BrickPool;
  readonly lightPool: BrickPool;
  readonly blockInfoTex: WebGLTexture;
  readonly shapeTex: WebGLTexture;
  readonly atlasTex: WebGLTexture;
  readonly atlasSize: [number, number];
  private readonly maxLayers: number;
  /** Bumped when the pools are recreated: every chunk must re-upload. */
  private generation = 0;

  private readonly stagingB = new Uint16Array(128 * 16);
  private readonly stagingL = new Uint8Array(128 * 16);
  private readonly brickB = new Uint16Array(256);
  private readonly brickL = new Uint8Array(256);
  private readonly tile = new Uint32Array(512);
  private readonly surfaceQueue: Column[] = [];
  private pendingRegrow: BrickPool | null = null;
  private readonly fresh: Chunk[] = [];

  readonly stats: GpuStats = {
    uploadsThisFrame: 0,
    bytesThisFrame: 0,
    freshChunksThisFrame: 0,
    blockGroups: 0,
    lightGroups: 0,
    poolBytes: 0,
    regrows: 0,
    queued: 0,
  };

  constructor(gl: WebGL2RenderingContext, world: World) {
    this.gl = gl;
    this.world = world;
    this.maxLayers = Math.min(64, gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const est = this.estimateLayers(world.N);
    this.blockPool = new BrickPool(gl, gl.R16UI, est);
    this.lightPool = new BrickPool(gl, gl.R8UI, Math.max(2, Math.ceil(est * 0.6)));
    this.resize(world.N, world.heightChunks);

    // Static content tables.
    const info = REG.gpuBlockInfo();
    this.blockInfoTex = createTexture2D(gl, gl.RGBA32UI, 64, 64, gl.RGBA_INTEGER, gl.UNSIGNED_INT, info);
    const shapes = REG.gpuShapeTable();
    this.shapeTex = createTexture2D(gl, gl.RGBA32F, SHAPE_TEXELS, REG.shapes.length, gl.RGBA, gl.FLOAT, shapes);
    const atlas = buildAtlas(REG.textures);
    this.atlasTex = createTexture2D(gl, gl.RGBA8, atlas.width, atlas.height, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
    this.atlasSize = [atlas.width, atlas.height];
  }

  private estimateLayers(N: number): number {
    // ~35% of the window's columns resident, ~500 non-uniform bricks each.
    const bricks = N * N * N * 0.35 * 500;
    return Math.max(2, Math.min(this.maxLayers, Math.ceil(bricks / BRICKS_PER_LAYER)));
  }

  /** (Re)create the window-sized tables. Call after World.resize(). */
  resize(N: number, heightChunks: number): void {
    const gl = this.gl;
    if (this.chunkTable) gl.deleteTexture(this.chunkTable);
    if (this.brickTable) gl.deleteTexture(this.brickTable);
    if (this.surfaceTex) gl.deleteTexture(this.surfaceTex);
    this.N = N;
    this.heightChunks = heightChunks;
    this.slots = N * N * N * heightChunks;
    this.ctHeight = Math.ceil(this.slots / CT_WIDTH);
    this.ctData = new Uint32Array(CT_WIDTH * this.ctHeight);
    this.chunkTable = createTexture2D(gl, gl.R32UI, CT_WIDTH, this.ctHeight, gl.RED_INTEGER, gl.UNSIGNED_INT, this.ctData);
    this.btHeight = Math.ceil(this.slots / BT_TILES_PER_ROW) * 16;
    this.brickTable = createTexture2D(gl, gl.RG32UI, BT_TILES_PER_ROW * 16, this.btHeight, gl.RG_INTEGER, gl.UNSIGNED_INT, null);
    this.surfaceSize = N * 16;
    const st = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, st);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, this.surfaceSize, this.surfaceSize, this.surfaceSize);
    this.surfaceTex = st;
    this.ctDirty = true;
    this.generation++;
  }

  chunkSlot(col: { cx: number; cz: number; cw: number }, cy: number): number {
    const N = this.N;
    return mod(col.cx, N) + N * (mod(col.cz, N) + N * mod(col.cw, N)) + N * N * N * cy;
  }

  onColumnAdded(c: Column): void {
    this.surfaceQueue.push(c);
  }

  onColumnRemoved(c: Column): void {
    for (const ch of c.chunks) {
      const g = ch.gpu as ChunkGpu | null;
      if (g) {
        if (g.gen === this.generation) {
          this.ctData[g.slot] = 0;
          for (const x of g.bGroups) this.blockPool.release(x);
          for (const x of g.lGroups) this.lightPool.release(x);
        }
        ch.gpu = null;
        this.ctDirty = true;
      }
    }
  }

  /** Allocate a pool group; on exhaustion schedule a regrow for the next sync and return -1. */
  private allocGroup(pool: BrickPool): number {
    const g = pool.alloc();
    if (g < 0) this.pendingRegrow = pool;
    return g;
  }

  /** A pool ran out: recreate it larger and schedule every resident chunk for re-upload. */
  private regrow(pool: BrickPool): void {
    if (!pool.grow(this.maxLayers)) throw new Error('GPU brick pool exhausted (max layers reached)');
    this.stats.regrows++;
    const other = pool === this.blockPool ? this.lightPool : this.blockPool;
    other.reset();
    this.generation++;
    this.ctData.fill(0);
    this.ctDirty = true;
    for (const c of this.world.columns.values()) {
      for (const ch of c.chunks) {
        ch.gpu = null;
        ch.structDirty = true;
        this.world.markChunkDirty(ch);
      }
    }
  }

  /**
   * Upload pending changes. Incremental brick updates always run (they are small); fresh
   * chunk uploads are limited by `budgetMs`.
   */
  sync(budgetMs: number): void {
    const t0 = performance.now();
    if (this.pendingRegrow) {
      const p = this.pendingRegrow;
      this.pendingRegrow = null;
      this.regrow(p);
    }
    const st = this.stats;
    st.uploadsThisFrame = 0;
    st.bytesThisFrame = 0;
    st.freshChunksThisFrame = 0;
    const world = this.world;
    const list = world.dirtyChunks;
    const fresh = this.fresh;
    fresh.length = 0;
    // Pass 1: incremental updates; collect fresh chunks.
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const ch = list[i]!;
      const col = ch.column as Column | null;
      if (!col || world.column(col.cx, col.cz, col.cw) !== col) {
        ch.queued = false;
        continue;
      }
      const g = ch.gpu as ChunkGpu | null;
      if (g && g.gen === this.generation) {
        if (this.syncIncremental(ch, g)) ch.queued = false;
        else list[w++] = ch; // pool full: retry after regrow
      } else {
        fresh.push(ch);
      }
    }
    // Pass 2: fresh chunks within budget (nearest-first order is preserved from the streamer).
    for (let i = 0; i < fresh.length; i++) {
      const ch = fresh[i]!;
      if (this.pendingRegrow || (performance.now() - t0 > budgetMs && st.freshChunksThisFrame > 0)) {
        list[w++] = ch;
        continue;
      }
      if (this.syncFresh(ch)) {
        ch.queued = false;
        st.freshChunksThisFrame++;
      } else list[w++] = ch;
    }
    list.length = w;
    // Surface map for new columns.
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.surfaceTex);
    let sq = 0;
    for (let i = 0; i < this.surfaceQueue.length; i++) {
      const c = this.surfaceQueue[i]!;
      if (world.column(c.cx, c.cz, c.cw) !== c) continue;
      if (performance.now() - t0 > budgetMs * 1.5 && sq > 0) {
        this.surfaceQueue[sq++] = c;
        continue;
      }
      const S = this.surfaceSize;
      gl.texSubImage3D(gl.TEXTURE_3D, 0, mod(c.cx * 16, S), mod(c.cz * 16, S), mod(c.cw * 16, S), 16, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, c.surface);
      st.uploadsThisFrame++;
      st.bytesThisFrame += 16384;
    }
    this.surfaceQueue.length = sq;
    if (this.ctDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.chunkTable);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CT_WIDTH, this.ctHeight, gl.RED_INTEGER, gl.UNSIGNED_INT, this.ctData);
      this.ctDirty = false;
      st.uploadsThisFrame++;
    }
    st.blockGroups = this.blockPool.used;
    st.lightGroups = this.lightPool.used;
    st.poolBytes = this.blockPool.bytes(2) + this.lightPool.bytes(1);
    st.queued = list.length + this.surfaceQueue.length;
  }

  /** Full upload of a chunk. Returns false (and leaves the chunk unmapped) if a pool is full. */
  private syncFresh(ch: Chunk): boolean {
    const col = ch.column!;
    const slot = this.chunkSlot(col, ch.cy);
    const old = ch.gpu as ChunkGpu | null;
    if (old && old.gen === this.generation) {
      for (const x of old.bGroups) this.blockPool.release(x);
      for (const x of old.lGroups) this.lightPool.release(x);
    }
    ch.gpu = null;
    const g: ChunkGpu = { slot, bGroups: [], lGroups: [], gen: this.generation };
    for (let k = 0; k < ch.bSlots; k += 8) {
      const grp = this.allocGroup(this.blockPool);
      if (grp < 0) return this.abandon(g);
      g.bGroups.push(grp);
    }
    for (let k = 0; k < ch.lSlots; k += 8) {
      const grp = this.allocGroup(this.lightPool);
      if (grp < 0) return this.abandon(g);
      g.lGroups.push(grp);
    }
    for (let i = 0; i < g.bGroups.length; i++) this.uploadGroup(ch, g.bGroups[i]!, i * 8, false);
    for (let i = 0; i < g.lGroups.length; i++) this.uploadGroup(ch, g.lGroups[i]!, i * 8, true);
    ch.gpu = g;
    this.writeTile(ch, g);
    ch.clearDirty();
    return true;
  }

  private abandon(g: ChunkGpu): false {
    for (const x of g.bGroups) this.blockPool.release(x);
    for (const x of g.lGroups) this.lightPool.release(x);
    return false;
  }

  private syncIncremental(ch: Chunk, g: ChunkGpu): boolean {
    // Grow group lists if the chunk materialised new bricks.
    while (g.bGroups.length * 8 < ch.bSlots) {
      const grp = this.allocGroup(this.blockPool);
      if (grp < 0) return false;
      g.bGroups.push(grp);
    }
    while (g.lGroups.length * 8 < ch.lSlots) {
      const grp = this.allocGroup(this.lightPool);
      if (grp < 0) return false;
      g.lGroups.push(grp);
    }
    for (let word = 0; word < 8; word++) {
      let bits = ch.dirtyB[word]!;
      while (bits !== 0) {
        const b = 31 - Math.clz32(bits);
        bits &= ~(1 << b);
        const bi = word * 32 + b;
        const k = ch.bIdx[bi]!;
        if (k >= 0) this.uploadBrick(ch, g, k, false);
      }
      bits = ch.dirtyL[word]!;
      while (bits !== 0) {
        const b = 31 - Math.clz32(bits);
        bits &= ~(1 << b);
        const bi = word * 32 + b;
        const k = ch.lIdx[bi]!;
        if (k >= 0) this.uploadBrick(ch, g, k, true);
      }
    }
    if (ch.structDirty) this.writeTile(ch, g);
    ch.clearDirty();
    return true;
  }

  private readonly origin = new Int32Array(3);
  /** Texel origin (x, y, layer) of a pool group strip, written into `this.origin`. */
  private groupOrigin(grp: number): Int32Array {
    const gi = grp & (GROUPS_PER_LAYER - 1);
    const o = this.origin;
    o[0] = (gi & 15) * 128;
    o[1] = (gi >> 4) * 16;
    o[2] = grp >> 11;
    return o;
  }

  /** Upload chunk bricks [k0, k0 + 8) into a pool group strip. */
  private uploadGroup(ch: Chunk, grp: number, k0: number, light: boolean): void {
    const gl = this.gl;
    const org = this.groupOrigin(grp);
    const x0 = org[0]!, y0 = org[1]!, layer = org[2]!;
    const n = Math.min(8, (light ? ch.lSlots : ch.bSlots) - k0);
    if (light) {
      const st = this.stagingL;
      const src = ch.lData;
      for (let k = 0; k < n; k++) {
        const so = (k0 + k) << 8;
        const dx = k * 16;
        for (let vi = 0; vi < 256; vi++) st[OFF128[vi]! + dx] = src[so + vi]!;
      }
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.lightPool.tex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, x0, y0, layer, 128, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, st);
      this.stats.bytesThisFrame += 2048;
    } else {
      const st = this.stagingB;
      const src = ch.bData;
      for (let k = 0; k < n; k++) {
        const so = (k0 + k) << 8;
        const dx = k * 16;
        for (let vi = 0; vi < 256; vi++) st[OFF128[vi]! + dx] = src[so + vi]!;
      }
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockPool.tex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, x0, y0, layer, 128, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_SHORT, st);
      this.stats.bytesThisFrame += 4096;
    }
    this.stats.uploadsThisFrame++;
  }

  private uploadBrick(ch: Chunk, g: ChunkGpu, k: number, light: boolean): void {
    const gl = this.gl;
    const grp = (light ? g.lGroups : g.bGroups)[k >> 3]!;
    const org = this.groupOrigin(grp);
    const x0 = org[0]! + (k & 7) * 16, y0 = org[1]!, layer = org[2]!;
    const so = k << 8;
    if (light) {
      const st = this.brickL;
      for (let vi = 0; vi < 256; vi++) st[OFF16[vi]!] = ch.lData[so + vi]!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.lightPool.tex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, x0, y0, layer, 16, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, st);
      this.stats.bytesThisFrame += 256;
    } else {
      const st = this.brickB;
      for (let vi = 0; vi < 256; vi++) st[OFF16[vi]!] = ch.bData[so + vi]!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockPool.tex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, x0, y0, layer, 16, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_SHORT, st);
      this.stats.bytesThisFrame += 512;
    }
    this.stats.uploadsThisFrame++;
  }

  /** Write the chunk's 16x16 brick-table tile and its chunk-table entry. */
  private writeTile(ch: Chunk, g: ChunkGpu): void {
    const gl = this.gl;
    const tile = this.tile;
    for (let bi = 0; bi < 256; bi++) {
      const bx = bi & 3, by = (bi >> 2) & 3, bz = (bi >> 4) & 3, bw = (bi >> 6) & 3;
      const t = ((by + 4 * bz) * 16 + bx + 4 * bw) * 2;
      const kb = ch.bIdx[bi]!;
      const kl = ch.lIdx[bi]!;
      tile[t] = kb >= 0 ? (NONUNI | (g.bGroups[kb >> 3]! * 8 + (kb & 7))) >>> 0 : ~kb & 0xffff;
      tile[t + 1] = kl >= 0 ? (NONUNI | (g.lGroups[kl >> 3]! * 8 + (kl & 7))) >>> 0 : ~kl & 0xff;
    }
    const s = g.slot;
    gl.bindTexture(gl.TEXTURE_2D, this.brickTable);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (s % BT_TILES_PER_ROW) * 16, Math.floor(s / BT_TILES_PER_ROW) * 16, 16, 16, gl.RG_INTEGER, gl.UNSIGNED_INT, tile);
    this.stats.uploadsThisFrame++;
    this.stats.bytesThisFrame += 2048;
    const u = ch.uniformBlock();
    this.ctData[s] = (u >= 0 ? (0xc0000000 | (u & 0xffff)) : NONUNI) >>> 0;
    this.ctDirty = true;
  }
}
