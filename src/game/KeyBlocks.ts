// Index of "key" blocks per loaded column (Phase 7, for the 4D Vision enchantment): crafting
// tables, furnaces, chests, the Phase 7 stations, beds, spawners. Columns are scanned lazily
// (only non-uniform bricks are looked at, a few columns per frame) and dropped from the cache
// when a key block in them changes.

import { REG } from '../content/registry';
import type { Column, World } from '../world/World';

export class KeyBlocks {
  readonly isKey = new Uint8Array(REG.count);
  private readonly cache = new Map<Column, Int32Array>();
  private readonly world: World;
  /** Cells found near the player last query (F3). */
  found = 0;
  private readonly order: number[] = [];

  constructor(world: World) {
    this.world = world;
    REG.blocks.forEach((b, i) => {
      const t = b.tags ?? [];
      if (t.includes('station') || t.includes('container') || t.includes('furnace') || (t.includes('bed') && !t.includes('bed_head')) || b.name === 'mob_spawner') this.isKey[i] = 1;
    });
  }

  /** A block changed: forget the column's list if a key block appeared or vanished. */
  blockChanged(x: number, z: number, w: number, o: number, n: number): void {
    if (!this.isKey[o & 0xfff] && !this.isKey[n & 0xfff]) return;
    const c = this.world.column(x >> 4, z >> 4, w >> 4);
    if (c) this.cache.delete(c);
  }

  columnRemoved(c: Column): void {
    this.cache.delete(c);
  }

  private scan(col: Column): Int32Array {
    const out: number[] = [];
    const key = this.isKey;
    const X0 = col.cx * 16, Z0 = col.cz * 16, W0 = col.cw * 16;
    for (let cy = 0; cy < col.chunks.length; cy++) {
      const ch = col.chunks[cy]!;
      for (let b = 0; b < 256; b++) {
        const e = ch.bIdx[b]!;
        if (e < 0) continue; // uniform bricks are never stations
        const bx = (b & 3) * 4, by = ((b >> 2) & 3) * 4, bz = ((b >> 4) & 3) * 4, bw = ((b >> 6) & 3) * 4;
        const base = e << 8;
        for (let v = 0; v < 256; v++) {
          if (!key[ch.bData[base | v]! & 0xfff]) continue;
          out.push(X0 + bx + (v & 3), cy * 16 + by + ((v >> 2) & 3), Z0 + bz + ((v >> 4) & 3), W0 + bw + ((v >> 6) & 3));
        }
      }
    }
    return Int32Array.from(out);
  }

  /**
   * Key blocks within `radius` (max-norm in x, z, w; any height within `dy`) of a point.
   * Scans at most `budget` new columns per call. Calls `fn` with world coordinates.
   */
  near(x: number, y: number, z: number, w: number, radius: number, dy: number, budget: number, fn: (x: number, y: number, z: number, w: number, id: number) => void): void {
    let n = 0;
    const c0x = (x - radius) >> 4, c1x = (x + radius) >> 4, c0z = (z - radius) >> 4, c1z = (z + radius) >> 4, c0w = (w - radius) >> 4, c1w = (w + radius) >> 4;
    // Nearest columns first, so the ones around you are indexed before the far ones.
    const order = this.order;
    order.length = 0;
    for (let cw = c0w; cw <= c1w; cw++) for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) order.push(cx, cz, cw);
    const ccx = x >> 4, ccz = z >> 4, ccw = w >> 4;
    const dist = (i: number) => Math.abs(order[i * 3]! - ccx) + Math.abs(order[i * 3 + 1]! - ccz) + Math.abs(order[i * 3 + 2]! - ccw);
    const idx = Array.from({ length: order.length / 3 }, (_, i) => i).sort((a, b) => dist(a) - dist(b));
    for (const i of idx) {
      const col = this.world.column(order[i * 3]!, order[i * 3 + 1]!, order[i * 3 + 2]!);
      if (!col) continue;
      let list = this.cache.get(col);
      if (!list) {
        if (budget <= 0) continue;
        budget--;
        list = this.scan(col);
        this.cache.set(col, list);
      }
      for (let k = 0; k < list.length; k += 4) {
        const bx = list[k]!, by = list[k + 1]!, bz = list[k + 2]!, bw = list[k + 3]!;
        if (Math.abs(bx - x) > radius || Math.abs(bz - z) > radius || Math.abs(bw - w) > radius || Math.abs(by - y) > dy) continue;
        fn(bx, by, bz, bw, this.world.getBlock(bx, by, bz, bw) & 0xfff);
        n++;
      }
    }
    this.found = n;
  }
}
