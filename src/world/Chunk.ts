// Brick-sparse 16^4 chunk storage (CPU side). Mirrors the GPU layout 1:1:
// each of the 256 bricks is either uniform (one voxel value / light value stored in the
// index array as a negative number, ~value) or points at a 256-entry slot in a packed
// data array. Uniform air/stone bricks cost 4 bytes; only surface/cave bricks carry data.

import { BRICKS_PER_CHUNK, VOXELS_PER_BRICK } from './constants';

export interface PackedChunk {
  bIdx: Int32Array;
  bData: Uint16Array;
  bSlots: number;
  lIdx: Int32Array;
  lData: Uint8Array;
  lSlots: number;
}

export class Chunk {
  /** Block bricks: >= 0 slot index into bData, < 0 uniform voxel ~value. */
  bIdx: Int32Array;
  bData: Uint16Array;
  bSlots: number;
  /** Light bricks: same encoding over lData (packed sky<<4 | block). */
  lIdx: Int32Array;
  lData: Uint8Array;
  lSlots: number;

  /** Bricks whose block data changed since the last GPU sync (256-bit set). */
  readonly dirtyB = new Uint32Array(8);
  readonly dirtyL = new Uint32Array(8);
  /** Brick table entries changed (uniform <-> non-uniform). */
  structDirty = true;
  /** Queued in World.dirtyChunks. */
  queued = false;
  /** Opaque GPU bookkeeping owned by the renderer. */
  gpu: unknown = null;
  /** Chunk y index inside its column and the owning column (set by Column). */
  cy = 0;
  column: { cx: number; cz: number; cw: number } | null = null;

  constructor(p: PackedChunk) {
    this.bIdx = p.bIdx;
    this.bData = p.bData;
    this.bSlots = p.bSlots;
    this.lIdx = p.lIdx;
    this.lData = p.lData;
    this.lSlots = p.lSlots;
  }

  static uniform(voxel: number, light: number): Chunk {
    const bIdx = new Int32Array(BRICKS_PER_CHUNK).fill(~voxel);
    const lIdx = new Int32Array(BRICKS_PER_CHUNK).fill(~light);
    return new Chunk({ bIdx, bData: new Uint16Array(0), bSlots: 0, lIdx, lData: new Uint8Array(0), lSlots: 0 });
  }

  getBlock(lx: number, ly: number, lz: number, lw: number): number {
    const e = this.bIdx[(lx >> 2) | ((ly >> 2) << 2) | ((lz >> 2) << 4) | ((lw >> 2) << 6)]!;
    if (e < 0) return ~e;
    return this.bData[(e << 8) | (lx & 3) | ((ly & 3) << 2) | ((lz & 3) << 4) | ((lw & 3) << 6)]!;
  }

  getLight(lx: number, ly: number, lz: number, lw: number): number {
    const e = this.lIdx[(lx >> 2) | ((ly >> 2) << 2) | ((lz >> 2) << 4) | ((lw >> 2) << 6)]!;
    if (e < 0) return ~e;
    return this.lData[(e << 8) | (lx & 3) | ((ly & 3) << 2) | ((lz & 3) << 4) | ((lw & 3) << 6)]!;
  }

  /** Returns true if the voxel changed. */
  setBlock(lx: number, ly: number, lz: number, lw: number, v: number): boolean {
    const bi = (lx >> 2) | ((ly >> 2) << 2) | ((lz >> 2) << 4) | ((lw >> 2) << 6);
    let e = this.bIdx[bi]!;
    if (e < 0) {
      const u = ~e;
      if (u === v) return false;
      e = this.allocBlockSlot();
      this.bData.fill(u, e << 8, (e + 1) << 8);
      this.bIdx[bi] = e;
      this.structDirty = true;
    }
    const idx = (e << 8) | (lx & 3) | ((ly & 3) << 2) | ((lz & 3) << 4) | ((lw & 3) << 6);
    if (this.bData[idx] === v) return false;
    this.bData[idx] = v;
    this.dirtyB[bi >> 5] = this.dirtyB[bi >> 5]! | (1 << (bi & 31));
    return true;
  }

  setLight(lx: number, ly: number, lz: number, lw: number, v: number): boolean {
    const bi = (lx >> 2) | ((ly >> 2) << 2) | ((lz >> 2) << 4) | ((lw >> 2) << 6);
    let e = this.lIdx[bi]!;
    if (e < 0) {
      const u = ~e;
      if (u === v) return false;
      e = this.allocLightSlot();
      this.lData.fill(u, e << 8, (e + 1) << 8);
      this.lIdx[bi] = e;
      this.structDirty = true;
    }
    const idx = (e << 8) | (lx & 3) | ((ly & 3) << 2) | ((lz & 3) << 4) | ((lw & 3) << 6);
    if (this.lData[idx] === v) return false;
    this.lData[idx] = v;
    this.dirtyL[bi >> 5] = this.dirtyL[bi >> 5]! | (1 << (bi & 31));
    return true;
  }

  private allocBlockSlot(): number {
    const slot = this.bSlots++;
    if ((slot + 1) * VOXELS_PER_BRICK > this.bData.length) {
      const grown = new Uint16Array(Math.max(8, this.bSlots * 2) * VOXELS_PER_BRICK);
      grown.set(this.bData);
      this.bData = grown;
    }
    return slot;
  }

  private allocLightSlot(): number {
    const slot = this.lSlots++;
    if ((slot + 1) * VOXELS_PER_BRICK > this.lData.length) {
      const grown = new Uint8Array(Math.max(8, this.lSlots * 2) * VOXELS_PER_BRICK);
      grown.set(this.lData);
      this.lData = grown;
    }
    return slot;
  }

  /** The single voxel value if every brick is the same uniform value, else -1. */
  uniformBlock(): number {
    const first = this.bIdx[0]!;
    if (first >= 0) return -1;
    for (let i = 1; i < BRICKS_PER_CHUNK; i++) if (this.bIdx[i] !== first) return -1;
    return ~first;
  }

  uniformLight(): number {
    const first = this.lIdx[0]!;
    if (first >= 0) return -1;
    for (let i = 1; i < BRICKS_PER_CHUNK; i++) if (this.lIdx[i] !== first) return -1;
    return ~first;
  }

  hasDirty(): boolean {
    for (let i = 0; i < 8; i++) if (this.dirtyB[i] !== 0 || this.dirtyL[i] !== 0) return true;
    return this.structDirty;
  }

  clearDirty(): void {
    this.dirtyB.fill(0);
    this.dirtyL.fill(0);
    this.structDirty = false;
  }

  /** Approximate memory used by this chunk's CPU data, in bytes. */
  bytes(): number {
    return 2048 + this.bSlots * 512 + this.lSlots * 256;
  }
}

/**
 * Packs one chunk (y in [y0, y0 + 16)) of a dense column (index x + 16z + 256w + 4096y)
 * into brick-sparse arrays. Used by the worker after generation; buffers are transferable.
 */
export function packChunkFromDense(blocks: Uint16Array, light: Uint8Array, y0: number): PackedChunk {
  const bIdx = new Int32Array(BRICKS_PER_CHUNK);
  const lIdx = new Int32Array(BRICKS_PER_CHUNK);
  const tmpB = new Uint16Array(VOXELS_PER_BRICK);
  const tmpL = new Uint8Array(VOXELS_PER_BRICK);
  const bList: Uint16Array[] = [];
  const lList: Uint8Array[] = [];
  for (let bi = 0; bi < BRICKS_PER_CHUNK; bi++) {
    const bx = (bi & 3) << 2;
    const by = y0 + (((bi >> 2) & 3) << 2);
    const bz = ((bi >> 4) & 3) << 2;
    const bw = ((bi >> 6) & 3) << 2;
    let uniB = true;
    let uniL = true;
    const b0 = blocks[bx + (bz << 4) + (bw << 8) + (by << 12)]!;
    const l0 = light[bx + (bz << 4) + (bw << 8) + (by << 12)]!;
    for (let vi = 0; vi < VOXELS_PER_BRICK; vi++) {
      const d = bx + (vi & 3) + ((bz + ((vi >> 4) & 3)) << 4) + ((bw + ((vi >> 6) & 3)) << 8) + ((by + ((vi >> 2) & 3)) << 12);
      const b = blocks[d]!;
      const l = light[d]!;
      tmpB[vi] = b;
      tmpL[vi] = l;
      if (b !== b0) uniB = false;
      if (l !== l0) uniL = false;
    }
    if (uniB) bIdx[bi] = ~b0;
    else {
      bIdx[bi] = bList.length;
      bList.push(tmpB.slice());
    }
    if (uniL) lIdx[bi] = ~l0;
    else {
      lIdx[bi] = lList.length;
      lList.push(tmpL.slice());
    }
  }
  const bData = new Uint16Array(bList.length * VOXELS_PER_BRICK);
  bList.forEach((b, i) => bData.set(b, i * VOXELS_PER_BRICK));
  const lData = new Uint8Array(lList.length * VOXELS_PER_BRICK);
  lList.forEach((l, i) => lData.set(l, i * VOXELS_PER_BRICK));
  return { bIdx, bData, bSlots: bList.length, lIdx, lData, lSlots: lList.length };
}
