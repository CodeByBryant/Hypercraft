// Binary column codec for saves and world export.
//
//  u8   compression (0 raw, 1 gzip) — everything after this byte is (optionally) gzipped
//  u32  magic 'HCC1'
//  u16  version, u8 heightChunks, u8 reserved
//  per chunk: u32 bSlots, u32 lSlots, i32[256] bIdx, u16[bSlots*256] bData,
//             i32[256] lIdx, u8[lSlots*256] lData
//  u8[4096] heightmap, u8[16384] surface
//  u32 extraLen, utf8 JSON extra (block entities and other per-column data)
//
// Voxel ids are remapped on load through the world's saved palette (block names), so a save
// survives content additions/reordering.

import { Chunk } from '../world/Chunk';
import { Column } from '../world/World';
import { COLUMN_LAYER } from '../world/constants';

const MAGIC = 0x31434348; // 'HCC1'

export function gzipAvailable(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipe(bytes: Uint8Array, ts: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ts);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  if (!gzipAvailable()) {
    const out = new Uint8Array(bytes.length + 1);
    out[0] = 0;
    out.set(bytes, 1);
    return out;
  }
  const z = await pipe(bytes, new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const out = new Uint8Array(z.length + 1);
  out[0] = 1;
  out.set(z, 1);
  return out;
}

export async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const body = bytes.subarray(1);
  if (bytes[0] === 0) return body.slice();
  return pipe(body, new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
}

class Writer {
  buf = new Uint8Array(1 << 16);
  n = 0;
  private ensure(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.n + k) cap *= 2;
    const g = new Uint8Array(cap);
    g.set(this.buf.subarray(0, this.n));
    this.buf = g;
  }
  u8(v: number): void {
    this.ensure(1);
    this.buf[this.n++] = v;
  }
  u16(v: number): void {
    this.ensure(2);
    this.buf[this.n++] = v & 255;
    this.buf[this.n++] = (v >>> 8) & 255;
  }
  u32(v: number): void {
    this.ensure(4);
    new DataView(this.buf.buffer).setUint32(this.n, v >>> 0, true);
    this.n += 4;
  }
  bytes(b: ArrayBufferView): void {
    const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    this.ensure(u.length);
    this.buf.set(u, this.n);
    this.n += u.length;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  n = 0;
  private readonly dv: DataView;
  constructor(readonly buf: Uint8Array) {
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8(): number {
    return this.buf[this.n++]!;
  }
  u16(): number {
    const v = this.dv.getUint16(this.n, true);
    this.n += 2;
    return v;
  }
  u32(): number {
    const v = this.dv.getUint32(this.n, true);
    this.n += 4;
    return v;
  }
  /** Copy `len` bytes out (aligned, owned). */
  take(len: number): Uint8Array {
    const out = this.buf.slice(this.n, this.n + len);
    this.n += len;
    return out;
  }
}

/** Serialize a column (uncompressed bytes). Only the used part of each chunk's data is written. */
export function serializeColumn(col: Column): Uint8Array {
  const w = new Writer();
  w.u32(MAGIC);
  w.u16(1);
  w.u8(col.chunks.length);
  w.u8(0);
  for (const ch of col.chunks) {
    w.u32(ch.bSlots);
    w.u32(ch.lSlots);
    w.bytes(ch.bIdx);
    w.bytes(ch.bData.subarray(0, ch.bSlots * 256));
    w.bytes(ch.lIdx);
    w.bytes(ch.lData.subarray(0, ch.lSlots * 256));
  }
  w.bytes(col.heightmap);
  w.bytes(col.surface);
  const extra = new TextEncoder().encode(JSON.stringify(col.extra ?? {}));
  w.u32(extra.length);
  w.bytes(extra);
  return w.done();
}

/**
 * Deserialize a column. `remap` maps saved block ids to current ids (null = identity).
 */
export function deserializeColumn(bytes: Uint8Array, cx: number, cz: number, cw: number, remap: Int32Array | null): Column {
  const r = new Reader(bytes);
  if (r.u32() !== MAGIC) throw new Error('bad column magic');
  const version = r.u16();
  if (version !== 1) throw new Error(`unsupported column version ${version}`);
  const hc = r.u8();
  r.u8();
  const chunks: Chunk[] = [];
  for (let c = 0; c < hc; c++) {
    const bSlots = r.u32();
    const lSlots = r.u32();
    const bIdx = new Int32Array(r.take(1024).buffer);
    const bData = new Uint16Array(r.take(bSlots * 512).buffer);
    const lIdx = new Int32Array(r.take(1024).buffer);
    const lData = new Uint8Array(r.take(lSlots * 256).buffer);
    if (remap) {
      for (let i = 0; i < 256; i++) {
        const e = bIdx[i]!;
        if (e < 0) {
          const v = ~e;
          bIdx[i] = ~(((remap[v & 0xfff] ?? 0) & 0xfff) | (v & 0xf000));
        }
      }
      for (let i = 0; i < bData.length; i++) {
        const v = bData[i]!;
        bData[i] = ((remap[v & 0xfff] ?? 0) & 0xfff) | (v & 0xf000);
      }
    }
    chunks.push(new Chunk({ bIdx, bData, bSlots, lIdx, lData, lSlots }));
  }
  const heightmap = r.take(COLUMN_LAYER);
  const surface = r.take(COLUMN_LAYER * 4);
  const extraLen = r.u32();
  const extra = extraLen > 0 ? (JSON.parse(new TextDecoder().decode(r.take(extraLen))) as Record<string, unknown>) : {};
  const col = new Column(cx, cz, cw, chunks, heightmap, surface);
  col.extra = extra;
  col.edited = true;
  return col;
}

/** Build an id remap table from a saved palette, or null when it matches the current one. */
export function buildRemap(saved: string[], current: string[], idOf: (name: string) => number): Int32Array | null {
  let same = saved.length <= current.length;
  if (same) for (let i = 0; i < saved.length; i++) if (saved[i] !== current[i]) same = false;
  if (same) return null;
  const m = new Int32Array(4096);
  for (let i = 0; i < 4096; i++) m[i] = i;
  saved.forEach((name, i) => {
    let id = 0;
    try {
      id = idOf(name);
    } catch {
      id = 0; // removed block -> air
    }
    m[i] = id;
  });
  return m;
}
