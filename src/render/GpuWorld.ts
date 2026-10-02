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
//
// Buried bricks: a brick whose voxels are all solid (opaque, full) and whose ray-reachable
// voxels (those with an open face toward a neighbour) all hold one value looks uniform to
// every ray, so the GPU stores just that value: rock full of ores and veins behind a plain
// stone cave wall costs no pool memory, and x-ray rays cross it a brick (or a whole chunk)
// at a time. Unloaded neighbours count as solid (nothing renders there); when a column
// loads, the buried bricks facing it are looked at again, and so are the bricks next to an
// edited voxel.

import { REG, SHAPE_TEXELS, RENDER_OPAQUE } from '../content/registry';
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
  /** Pool groups (8 bricks each) holding the block bricks the GPU stores for this chunk. */
  bGroups: number[];
  /** Per brick: GPU brick index (group bGroups[i >> 3], lane i & 7), or -1: shown uniform. */
  bAddr: Int16Array;
  /** The value a brick without a GPU brick shows (uniform, or buried). */
  bUni: Uint16Array;
  /** Free GPU brick indices, and the next never-used one. */
  bFree: number[];
  bNext: number;
  lGroups: number[];
  gen: number;
}

/** Voxels a ray never sees past: opaque, full blocks. */
const SOLID = new Uint8Array(4096);
for (let id = 0; id < REG.count; id++) SOLID[id] = REG.render[id] === RENDER_OPAQUE && REG.isFullShape[id] && REG.opaque[id] ? 1 : 0;

/**
 * Brick faces: FACE_IN[a * 2 + s] lists the 64 voxels of a brick on its low (s = 0) or high
 * (s = 1) face along axis a (0 x, 1 y, 2 z, 3 w); FACE_OUT the touching voxels of the
 * neighbouring brick.
 */
const FACE_IN: Uint8Array[] = [];
const FACE_OUT: Uint8Array[] = [];
for (let a = 0; a < 4; a++)
  for (let side = 0; side < 2; side++) {
    const fin = new Uint8Array(64), fout = new Uint8Array(64);
    let n = 0;
    for (let vi = 0; vi < 256; vi++) {
      if (((vi >> (2 * a)) & 3) !== (side ? 3 : 0)) continue;
      fin[n] = vi;
      fout[n] = (vi & ~(3 << (2 * a))) | ((side ? 0 : 3) << (2 * a));
      n++;
    }
    FACE_IN.push(fin);
    FACE_OUT.push(fout);
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

  /**
   * Recreate with more layers, copying the old layers over on the GPU (a blit per layer), so
   * every allocation stays valid and nothing is re-uploaded.
   */
  grow(maxLayers: number): boolean {
    const nl = Math.min(maxLayers, Math.ceil(this.layers * 1.5) + 1);
    if (nl <= this.layers) return false;
    const gl = this.gl;
    const tex = createTextureArray(gl, this.internalFormat, POOL_SIZE, POOL_SIZE, nl);
    const rf = gl.createFramebuffer(), df = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rf);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, df);
    for (let l = 0; l < this.layers; l++) {
      gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex, 0, l);
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, l);
      gl.blitFramebuffer(0, 0, POOL_SIZE, POOL_SIZE, 0, 0, POOL_SIZE, POOL_SIZE, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.deleteFramebuffer(rf);
    gl.deleteFramebuffer(df);
    gl.deleteTexture(this.tex);
    this.tex = tex;
    this.layers = nl;
    return true;
  }

  reset(): void {
    this.free = [];
    this.next = 0;
    this.used = 0;
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
  /** CPU copy of the texture atlas (item icons are built from it). */
  readonly atlasData: Uint8Array;
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
  /** Both pools at the layer limit and full: fresh chunks wait until a column unloads. */
  private poolFull = false;
  /** Show buried bricks as one value (off: as stored; tests compare the two). */
  private collapse = true;
  private readonly fresh: Chunk[] = [];
  /** syncFresh scratch: CPU slot of each GPU brick. */
  private readonly srcSlots = new Int32Array(256);

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
    const est = this.estimateLayers(world.N, world.heightChunks);
    this.blockPool = new BrickPool(gl, gl.R16UI, est);
    this.lightPool = new BrickPool(gl, gl.R8UI, Math.max(2, Math.ceil(est * 0.8)));
    this.resize(world.N, world.heightChunks);

    // Static content tables.
    const info = REG.gpuBlockInfo();
    this.blockInfoTex = createTexture2D(gl, gl.RGBA32UI, 64, 64, gl.RGBA_INTEGER, gl.UNSIGNED_INT, info);
    const shapes = REG.gpuShapeTable();
    this.shapeTex = createTexture2D(gl, gl.RGBA32F, SHAPE_TEXELS, REG.shapes.length, gl.RGBA, gl.FLOAT, shapes);
    const atlas = buildAtlas(REG.textures);
    this.atlasTex = createTexture2D(gl, gl.RGBA8, atlas.width, atlas.height, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
    this.atlasSize = [atlas.width, atlas.height];
    this.atlasData = atlas.data;
  }

  private estimateLayers(N: number, heightChunks: number): number {
    // ~30% of the window's columns resident (slice-shaped shell), ~90 block bricks on the GPU
    // per chunk of height (measured ~1030 per 12-chunk Surface column once buried bricks are
    // collapsed, ~115 per chunk in the Ember Depths). Pools grow in place when short.
    const bricks = N * N * N * 0.3 * 90 * heightChunks;
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

  /** Tests: turn buried-brick collapsing on or off; everything re-uploads. */
  setCollapse(on: boolean): void {
    this.collapse = on;
    this.blockPool.reset();
    this.lightPool.reset();
    this.generation++;
    this.ctData.fill(0);
    this.ctDirty = true;
    this.poolFull = false;
    for (const c of this.world.columns.values())
      for (const ch of c.chunks) {
        ch.gpu = null;
        ch.structDirty = true;
        this.world.markChunkDirty(ch);
      }
  }

  chunkSlot(col: { cx: number; cz: number; cw: number }, cy: number): number {
    const N = this.N;
    return mod(col.cx, N) + N * (mod(col.cz, N) + N * mod(col.cw, N)) + N * N * N * cy;
  }

  onColumnAdded(c: Column): void {
    this.surfaceQueue.push(c);
    // Bricks of the neighbouring columns buried against this one (unloaded counted as solid)
    // may face open space now: look at them again.
    const w = this.world;
    for (let a = 0; a < 4; a++) {
      if (a === 1) continue;
      for (const dir of [-1, 1]) {
        const nb = w.column(c.cx + (a === 0 ? dir : 0), c.cz + (a === 2 ? dir : 0), c.cw + (a === 3 ? dir : 0));
        if (!nb) continue;
        const face = dir > 0 ? 0 : 3; // the neighbour's bricks touching c
        for (const ch of nb.chunks) {
          const g = ch.gpu as ChunkGpu | null;
          if (!g || g.gen !== this.generation) continue;
          let any = false;
          for (let bi = 0; bi < 256; bi++) {
            if (((bi >> (2 * a)) & 3) !== face || g.bAddr[bi]! >= 0 || ch.bIdx[bi]! < 0) continue;
            ch.dirtyB[bi >> 5] = ch.dirtyB[bi >> 5]! | (1 << (bi & 31));
            any = true;
          }
          if (any) w.markChunkDirty(ch);
        }
      }
    }
  }

  onColumnRemoved(c: Column): void {
    this.poolFull = false;
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

  /**
   * A pool ran out: grow it (contents kept). At the layer limit, new chunks wait (they show as
   * unloaded fog) until columns unload and free space.
   */
  private regrow(pool: BrickPool): void {
    if (!pool.grow(this.maxLayers)) {
      this.poolFull = true;
      return;
    }
    this.stats.regrows++;
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
      if (this.poolFull || this.pendingRegrow || (performance.now() - t0 > budgetMs && st.freshChunksThisFrame > 0)) {
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
    const g: ChunkGpu = { slot, bGroups: [], bAddr: new Int16Array(256).fill(-1), bUni: new Uint16Array(256), bFree: [], bNext: 0, lGroups: [], gen: this.generation };
    // Block bricks the GPU needs: non-uniform ones that are not buried.
    const src = this.srcSlots;
    for (let bi = 0; bi < 256; bi++) {
      const k = ch.bIdx[bi]!;
      const u = k < 0 ? ~k & 0xffff : this.buried(ch, bi, k);
      if (u >= 0) {
        g.bUni[bi] = u;
        continue;
      }
      const addr = g.bNext++;
      if ((addr & 7) === 0) {
        const grp = this.allocGroup(this.blockPool);
        if (grp < 0) return this.abandon(g);
        g.bGroups.push(grp);
      }
      g.bAddr[bi] = addr;
      src[addr] = k;
    }
    for (let k = 0; k < ch.lSlots; k += 8) {
      const grp = this.allocGroup(this.lightPool);
      if (grp < 0) return this.abandon(g);
      g.lGroups.push(grp);
    }
    for (let i = 0; i < g.bGroups.length; i++) this.uploadBlockGroup(ch, g.bGroups[i]!, src, i * 8, Math.min(8, g.bNext - i * 8));
    for (let i = 0; i < g.lGroups.length; i++) this.uploadLightGroup(ch, g.lGroups[i]!, i * 8);
    ch.gpu = g;
    this.writeTile(ch, g);
    ch.clearDirty();
    return true;
  }

  /**
   * The value a ray sees everywhere in CPU brick `k` (index `bi`) of a chunk if it is buried:
   * every voxel solid and every voxel with an open face (toward a non-solid neighbour, or the
   * sky above the world) holding the same value. -1 if the GPU needs the whole brick.
   */
  private buried(ch: Chunk, bi: number, k: number): number {
    if (!this.collapse) return -1;
    const data = ch.bData, base = k << 8;
    for (let v = 0; v < 256; v++) if (!SOLID[data[base + v]! & 0xfff]) return -1;
    const col = ch.column as Column | null;
    if (!col) return -1;
    let ex = -1;
    for (let a = 0; a < 4; a++)
      for (let side = 0; side < 2; side++) {
        const dir = side ? 1 : -1, sh = 2 * a;
        const nbc = ((bi >> sh) & 3) + dir;
        let nch: Chunk | null = ch;
        let open = false;
        if (nbc < 0 || nbc > 3) {
          if (a === 1) {
            const ncy = ch.cy + dir;
            if (ncy < 0) nch = null; // below the world: closed
            else if (ncy >= col.chunks.length) open = true; // the sky
            else nch = col.chunks[ncy]!;
          } else {
            const nc = this.world.column(col.cx + (a === 0 ? dir : 0), col.cz + (a === 2 ? dir : 0), col.cw + (a === 3 ? dir : 0));
            nch = nc ? nc.chunks[ch.cy]! : null; // unloaded: nothing renders there
          }
          if (!nch && !open) continue;
        }
        const fin = FACE_IN[a * 2 + side]!;
        if (!open) {
          const nbi = (bi & ~(3 << sh)) | ((nbc & 3) << sh);
          const nk = nch!.bIdx[nbi]!;
          if (nk < 0) {
            if (SOLID[~nk & 0xfff]) continue;
            open = true;
          } else {
            const fout = FACE_OUT[a * 2 + side]!, nd = nch!.bData, nb = nk << 8;
            for (let i = 0; i < 64; i++) {
              if (SOLID[nd[nb + fout[i]!]! & 0xfff]) continue;
              const v = data[base + fin[i]!]!;
              if (ex < 0) ex = v;
              else if (v !== ex) return -1;
            }
            continue;
          }
        }
        // The whole face is open.
        for (let i = 0; i < 64; i++) {
          const v = data[base + fin[i]!]!;
          if (ex < 0) ex = v;
          else if (v !== ex) return -1;
        }
      }
    if (ex >= 0) return ex;
    // Fully buried: show its commonest value (keeps solid chunks uniform for the ray).
    const c0 = data[base]!;
    let n0 = 0, c1 = -1;
    for (let v = 0; v < 256; v++) {
      const x = data[base + v]!;
      if (x === c0) n0++;
      else if (c1 < 0) c1 = x;
    }
    return n0 >= 128 || c1 < 0 ? c0 : c1;
  }

  private allocBrick(g: ChunkGpu): number {
    if (g.bFree.length) return g.bFree.pop()!;
    const addr = g.bNext;
    if (addr >= g.bGroups.length * 8) {
      const grp = this.allocGroup(this.blockPool);
      if (grp < 0) return -1;
      g.bGroups.push(grp);
    }
    g.bNext++;
    return addr;
  }

  /**
   * Bring brick `bi` up to date on the GPU. Returns 1 if its brick-table entry changed, 0 if
   * not, -1 if the pool is full (retry after the regrow).
   */
  private refreshBrick(ch: Chunk, g: ChunkGpu, bi: number): number {
    const k = ch.bIdx[bi]!;
    const u = k < 0 ? ~k & 0xffff : this.buried(ch, bi, k);
    const addr = g.bAddr[bi]!;
    if (u >= 0) {
      const changed = addr >= 0 || g.bUni[bi] !== u;
      if (addr >= 0) {
        g.bFree.push(addr);
        g.bAddr[bi] = -1;
      }
      g.bUni[bi] = u;
      return changed ? 1 : 0;
    }
    let a = addr;
    if (a < 0) {
      a = this.allocBrick(g);
      if (a < 0) return -1;
      g.bAddr[bi] = a;
    }
    this.uploadBlockBrick(ch, g, a, k);
    return addr < 0 ? 1 : 0;
  }

  private abandon(g: ChunkGpu): false {
    for (const x of g.bGroups) this.blockPool.release(x);
    for (const x of g.lGroups) this.lightPool.release(x);
    return false;
  }

  private syncIncremental(ch: Chunk, g: ChunkGpu): boolean {
    // Grow the light group list if the chunk materialised new light bricks.
    while (g.lGroups.length * 8 < ch.lSlots) {
      const grp = this.allocGroup(this.lightPool);
      if (grp < 0) return false;
      g.lGroups.push(grp);
    }
    let tile = ch.structDirty;
    for (let word = 0; word < 8; word++) {
      let bits = ch.dirtyB[word]!;
      while (bits !== 0) {
        const b = 31 - Math.clz32(bits);
        bits &= ~(1 << b);
        const r = this.refreshBrick(ch, g, word * 32 + b);
        if (r < 0) return false; // pool full: the regrow re-uploads everything
        if (r > 0) tile = true;
      }
    }
    for (let word = 0; word < 8; word++) {
      let bits = ch.dirtyL[word]!;
      while (bits !== 0) {
        const b = 31 - Math.clz32(bits);
        bits &= ~(1 << b);
        const bi = word * 32 + b;
        const k = ch.lIdx[bi]!;
        if (k >= 0) this.uploadLightBrick(ch, g, k);
      }
    }
    if (tile) this.writeTile(ch, g);
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

  /** Upload GPU bricks [a0, a0 + n) of a chunk (CPU slots in `src`) into a block pool group strip. */
  private uploadBlockGroup(ch: Chunk, grp: number, src: Int32Array, a0: number, n: number): void {
    const gl = this.gl;
    const org = this.groupOrigin(grp);
    const st = this.stagingB;
    const data = ch.bData;
    for (let i = 0; i < n; i++) {
      const so = src[a0 + i]! << 8;
      const dx = i * 16;
      for (let vi = 0; vi < 256; vi++) st[OFF128[vi]! + dx] = data[so + vi]!;
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockPool.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, org[0]!, org[1]!, org[2]!, 128, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_SHORT, st);
    this.stats.bytesThisFrame += 4096;
    this.stats.uploadsThisFrame++;
  }

  /** Upload CPU light bricks [k0, k0 + 8) into a light pool group strip. */
  private uploadLightGroup(ch: Chunk, grp: number, k0: number): void {
    const gl = this.gl;
    const org = this.groupOrigin(grp);
    const n = Math.min(8, ch.lSlots - k0);
    const st = this.stagingL;
    const src = ch.lData;
    for (let k = 0; k < n; k++) {
      const so = (k0 + k) << 8;
      const dx = k * 16;
      for (let vi = 0; vi < 256; vi++) st[OFF128[vi]! + dx] = src[so + vi]!;
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.lightPool.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, org[0]!, org[1]!, org[2]!, 128, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, st);
    this.stats.bytesThisFrame += 2048;
    this.stats.uploadsThisFrame++;
  }

  /** Upload CPU light brick `k` into its pool slot. */
  private uploadLightBrick(ch: Chunk, g: ChunkGpu, k: number): void {
    const gl = this.gl;
    const org = this.groupOrigin(g.lGroups[k >> 3]!);
    const st = this.brickL;
    const so = k << 8;
    for (let vi = 0; vi < 256; vi++) st[OFF16[vi]!] = ch.lData[so + vi]!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.lightPool.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, org[0]! + (k & 7) * 16, org[1]!, org[2]!, 16, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, st);
    this.stats.bytesThisFrame += 256;
    this.stats.uploadsThisFrame++;
  }

  /** Upload CPU block brick `k` into GPU brick `addr`. */
  private uploadBlockBrick(ch: Chunk, g: ChunkGpu, addr: number, k: number): void {
    const gl = this.gl;
    const org = this.groupOrigin(g.bGroups[addr >> 3]!);
    const st = this.brickB;
    const so = k << 8;
    for (let vi = 0; vi < 256; vi++) st[OFF16[vi]!] = ch.bData[so + vi]!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockPool.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, org[0]! + (addr & 7) * 16, org[1]!, org[2]!, 16, 16, 1, gl.RED_INTEGER, gl.UNSIGNED_SHORT, st);
    this.stats.bytesThisFrame += 512;
    this.stats.uploadsThisFrame++;
  }

  /** Write the chunk's 16x16 brick-table tile and its chunk-table entry. */
  private writeTile(ch: Chunk, g: ChunkGpu): void {
    const gl = this.gl;
    const tile = this.tile;
    // The chunk is one voxel for the ray if every brick shows the same uniform value.
    let uni = g.bAddr[0]! < 0 ? g.bUni[0]! : -1;
    for (let bi = 0; bi < 256; bi++) {
      const bx = bi & 3, by = (bi >> 2) & 3, bz = (bi >> 4) & 3, bw = (bi >> 6) & 3;
      const t = ((by + 4 * bz) * 16 + bx + 4 * bw) * 2;
      const ab = g.bAddr[bi]!;
      const kl = ch.lIdx[bi]!;
      tile[t] = ab >= 0 ? (NONUNI | (g.bGroups[ab >> 3]! * 8 + (ab & 7))) >>> 0 : g.bUni[bi]!;
      tile[t + 1] = kl >= 0 ? (NONUNI | (g.lGroups[kl >> 3]! * 8 + (kl & 7))) >>> 0 : ~kl & 0xff;
      if (uni >= 0 && (ab >= 0 || g.bUni[bi] !== uni)) uni = -1;
    }
    const s = g.slot;
    gl.bindTexture(gl.TEXTURE_2D, this.brickTable);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (s % BT_TILES_PER_ROW) * 16, Math.floor(s / BT_TILES_PER_ROW) * 16, 16, 16, gl.RG_INTEGER, gl.UNSIGNED_INT, tile);
    this.stats.uploadsThisFrame++;
    this.stats.bytesThisFrame += 2048;
    this.ctData[s] = (uni >= 0 ? (0xc0000000 | (uni & 0xffff)) : NONUNI) >>> 0;
    this.ctDirty = true;
  }
}
