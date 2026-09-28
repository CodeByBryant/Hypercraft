// Main-thread world store. Owns resident columns, the toroidal streaming window used by
// the GPU tables, and the authoritative voxel/light accessors used by physics, lighting,
// fluids and editing.

import { Chunk } from './Chunk';
import { CHUNK, FULL_SKY, VOID_VOXEL, columnKey, mod } from './constants';
import { REG } from '../content/registry';
import type { RealmDef } from '../content/types';

export class Column {
  readonly key: number;
  /** Highest (y + 1) of a light-attenuating block per (x, z, w); 0 = open to the void. */
  readonly heightmap: Uint8Array;
  /** Per (x, z, w): RGBA = blended grass colour + biome index. */
  readonly surface: Uint8Array;
  edited = false;
  /** Bitmask of the six face neighbours (±x, ±z, ±w) whose light seam was processed. */
  seams = 0;
  gpuSurfaceDirty = true;
  /** Opaque renderer bookkeeping. */
  gpu: unknown = null;

  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly cw: number,
    readonly chunks: Chunk[],
    heightmap: Uint8Array,
    surface: Uint8Array,
  ) {
    this.key = columnKey(cx, cz, cw);
    this.heightmap = heightmap;
    this.surface = surface;
    chunks.forEach((c, i) => {
      c.cy = i;
      c.column = this;
    });
  }

  bytes(): number {
    let b = 4096 * 5;
    for (const c of this.chunks) b += c.bytes();
    return b;
  }
}

export type BlockChangeListener = (x: number, y: number, z: number, w: number, oldV: number, newV: number) => void;

export class World {
  readonly realm: RealmDef;
  readonly heightChunks: number;
  readonly height: number;
  readonly columns = new Map<number, Column>();
  /** Edited columns that left the window keep their data here until they come back. */
  readonly retained = new Map<number, Column>();

  /** Window radius in chunks (xzw); the window spans N = 2r + 1 chunks per axis. */
  radius: number;
  N: number;
  /** Window minimum corner, in chunk coordinates. */
  ox = 0;
  oz = 0;
  ow = 0;
  private slots: (Column | null)[];

  readonly dirtyChunks: Chunk[] = [];
  readonly dirtyColumns: Column[] = [];
  private readonly blockListeners: BlockChangeListener[] = [];
  columnAdded: ((c: Column) => void) | null = null;
  columnRemoved: ((c: Column) => void) | null = null;

  constructor(realm: RealmDef, radius: number) {
    this.realm = realm;
    this.heightChunks = realm.heightChunks;
    this.height = realm.heightChunks * CHUNK;
    this.radius = radius;
    this.N = radius * 2 + 1;
    this.slots = new Array(this.N * this.N * this.N).fill(null);
  }

  onBlockChange(l: BlockChangeListener): void {
    this.blockListeners.push(l);
  }

  slotIndex(cx: number, cz: number, cw: number): number {
    const N = this.N;
    return mod(cx, N) + N * (mod(cz, N) + N * mod(cw, N));
  }

  inWindow(cx: number, cz: number, cw: number): boolean {
    return cx >= this.ox && cx < this.ox + this.N && cz >= this.oz && cz < this.oz + this.N && cw >= this.ow && cw < this.ow + this.N;
  }

  /** Move the window; returns the columns that fell out (already removed). */
  moveWindow(ox: number, oz: number, ow: number): Column[] {
    this.ox = ox;
    this.oz = oz;
    this.ow = ow;
    const removed: Column[] = [];
    for (const c of this.columns.values()) {
      if (!this.inWindow(c.cx, c.cz, c.cw)) removed.push(c);
    }
    for (const c of removed) this.removeColumn(c);
    return removed;
  }

  /** Change the window size (render distance). Drops every resident column. */
  resize(radius: number): void {
    for (const c of [...this.columns.values()]) this.removeColumn(c);
    this.radius = radius;
    this.N = radius * 2 + 1;
    this.slots = new Array(this.N * this.N * this.N).fill(null);
  }

  column(cx: number, cz: number, cw: number): Column | null {
    const N = this.N;
    const i = mod(cx, N) + N * (mod(cz, N) + N * mod(cw, N));
    const c = this.slots[i]!;
    if (c !== null && c.cx === cx && c.cz === cz && c.cw === cw) return c;
    return null;
  }

  addColumn(c: Column): void {
    if (!this.inWindow(c.cx, c.cz, c.cw)) throw new Error('column outside window');
    const i = this.slotIndex(c.cx, c.cz, c.cw);
    const prev = this.slots[i];
    if (prev) this.removeColumn(prev);
    this.slots[i] = c;
    this.columns.set(c.key, c);
    c.seams = 0;
    c.gpuSurfaceDirty = true;
    for (const ch of c.chunks) {
      ch.structDirty = true;
      this.markChunkDirty(ch);
    }
    this.columnAdded?.(c);
  }

  removeColumn(c: Column): void {
    const i = this.slotIndex(c.cx, c.cz, c.cw);
    if (this.slots[i] === c) this.slots[i] = null;
    this.columns.delete(c.key);
    if (c.edited) this.retained.set(c.key, c);
    this.columnRemoved?.(c);
  }

  takeRetained(cx: number, cz: number, cw: number): Column | null {
    const k = columnKey(cx, cz, cw);
    const c = this.retained.get(k);
    if (!c) return null;
    this.retained.delete(k);
    return c;
  }

  markChunkDirty(ch: Chunk): void {
    if (!ch.queued) {
      ch.queued = true;
      this.dirtyChunks.push(ch);
    }
  }

  /** Voxel at integer world coordinates. VOID_VOXEL below the world or in unloaded space. */
  getBlock(x: number, y: number, z: number, w: number): number {
    if (y < 0) return VOID_VOXEL;
    if (y >= this.height) return 0;
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (col === null) return VOID_VOXEL;
    return col.chunks[y >> 4]!.getBlock(x & 15, y & 15, z & 15, w & 15);
  }

  getLight(x: number, y: number, z: number, w: number): number {
    if (y < 0) return 0;
    if (y >= this.height) return FULL_SKY;
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (col === null) return 0;
    return col.chunks[y >> 4]!.getLight(x & 15, y & 15, z & 15, w & 15);
  }

  isLoaded(x: number, z: number, w: number): boolean {
    return this.column(x >> 4, z >> 4, w >> 4) !== null;
  }

  /** Sets a voxel, keeps the heightmap current and notifies listeners. Returns false if unchanged/unloaded. */
  setBlock(x: number, y: number, z: number, w: number, v: number): boolean {
    if (y < 0 || y >= this.height) return false;
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (col === null) return false;
    const ch = col.chunks[y >> 4]!;
    const lx = x & 15, ly = y & 15, lz = z & 15, lw = w & 15;
    const old = ch.getBlock(lx, ly, lz, lw);
    if (old === v) return false;
    ch.setBlock(lx, ly, lz, lw, v);
    col.edited = true;
    this.markChunkDirty(ch);
    this.updateHeightmap(col, lx, y, lz, lw, v);
    for (let i = 0; i < this.blockListeners.length; i++) this.blockListeners[i]!(x, y, z, w, old, v);
    return true;
  }

  /** Sets the packed light value (sky << 4 | block) of a voxel; marks the chunk for GPU upload. */
  setLight(x: number, y: number, z: number, w: number, v: number): boolean {
    if (y < 0 || y >= this.height) return false;
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (col === null) return false;
    const ch = col.chunks[y >> 4]!;
    if (ch.setLight(x & 15, y & 15, z & 15, w & 15, v)) {
      this.markChunkDirty(ch);
      return true;
    }
    return false;
  }

  private updateHeightmap(col: Column, lx: number, y: number, lz: number, lw: number, v: number): void {
    const i = lx + (lz << 4) + (lw << 8);
    const hm = col.heightmap[i]!;
    const blocks = REG.lightOpacity[v & 0xfff]! > 0;
    if (blocks) {
      if (y + 1 > hm) col.heightmap[i] = y + 1;
    } else if (y + 1 === hm) {
      let yy = y - 1;
      for (; yy >= 0; yy--) {
        const b = col.chunks[yy >> 4]!.getBlock(lx, yy & 15, lz, lw);
        if (REG.lightOpacity[b & 0xfff]! > 0) break;
      }
      col.heightmap[i] = yy + 1;
    }
  }

  /** Sky exposure height at a world (x, z, w): the lowest y that sees the sky. */
  skyHeight(x: number, z: number, w: number): number {
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (!col) return 0;
    return col.heightmap[(x & 15) + ((z & 15) << 4) + ((w & 15) << 8)]!;
  }

  /** Biome index at a world (x, z, w), or -1 if unloaded. */
  biomeAt(x: number, z: number, w: number): number {
    const col = this.column(x >> 4, z >> 4, w >> 4);
    if (!col) return -1;
    return col.surface[((x & 15) + ((z & 15) << 4) + ((w & 15) << 8)) * 4 + 3]!;
  }

  memoryBytes(): number {
    let b = 0;
    for (const c of this.columns.values()) b += c.bytes();
    return b;
  }
}
