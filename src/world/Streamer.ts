// Decides which columns should be resident and feeds the worker pool.
//
// Priority is a 4D-aware distance from the eye: in-slice distance plus the distance along
// the current hidden axis h, stretched by `hiddenStretch`. Rays never leave the view
// hyperplane, so columns far out along h are useless until the player moves kata/ana or
// rotates the slice; the stretch keeps a thick shell around the slice without paying for a
// full 4D ball. Nearest-first ordering keeps the area around the player filling in first.

import { Chunk } from './Chunk';
import { Column, type World } from './World';
import { columnKey } from './constants';
import type { WorkerPool } from './gen/WorkerPool';
import type { ColumnMsg } from './gen/protocol';
import type { LightEngine } from './light/LightEngine';

/** Where previously saved columns come from (IndexedDB in normal play). */
export interface ColumnSource {
  has(cx: number, cz: number, cw: number): boolean;
  load(cx: number, cz: number, cw: number): Promise<Column | null>;
}

export class Streamer {
  readonly world: World;
  readonly pool: WorkerPool;
  readonly light: LightEngine;
  hiddenStretch = 2;
  /** Columns wanted but not yet resident (after the last plan). */
  backlog = 0;
  loadedTotal = 0;
  unloadedTotal = 0;
  private readonly pending = new Map<number, number>();
  private cand = new Float64Array(0);
  private lastPlan = -1e9;
  private dirtyPlan = true;
  private readonly lastEye = new Float64Array(4);
  private readonly lastHidden = new Float64Array(4);
  private readonly toUnload: Column[] = [];
  /** Called after a column becomes resident (before seams are seeded). */
  onColumnAdded: ((c: Column) => void) | null = null;
  source: ColumnSource | null = null;
  /** Columns being loaded from the save store. */
  private readonly loading = new Set<number>();
  loadedFromSave = 0;

  constructor(world: World, pool: WorkerPool, light: LightEngine) {
    this.world = world;
    this.pool = pool;
    this.light = light;
    pool.onColumn = (m) => this.receive(m);
  }

  get pendingCount(): number {
    return this.pending.size + this.loading.size;
  }

  loadRadius(): number {
    return this.world.radius * 16 + 8;
  }

  private metric(cx: number, cz: number, cw: number, eye: ArrayLike<number>, h: ArrayLike<number>): number {
    const dx = cx * 16 + 8 - eye[0]!;
    const dz = cz * 16 + 8 - eye[2]!;
    const dw = cw * 16 + 8 - eye[3]!;
    const dh = dx * h[0]! + dz * h[2]! + dw * h[3]!;
    const d2 = dx * dx + dz * dz + dw * dw;
    const k = this.hiddenStretch;
    return Math.sqrt(Math.max(0, d2 - dh * dh) + k * k * dh * dh);
  }

  /** Force a re-plan on the next update (settings change, teleport). */
  invalidate(): void {
    this.dirtyPlan = true;
  }

  update(now: number, eye: ArrayLike<number>, hidden: ArrayLike<number>): void {
    const w = this.world;
    const R = w.radius;
    const ox = Math.floor(eye[0]! / 16) - R;
    const oz = Math.floor(eye[2]! / 16) - R;
    const ow = Math.floor(eye[3]! / 16) - R;
    if (ox !== w.ox || oz !== w.oz || ow !== w.ow) {
      const removed = w.moveWindow(ox, oz, ow);
      this.unloadedTotal += removed.length;
      this.dirtyPlan = true;
    }
    let moved = 0;
    let turned = 0;
    for (let i = 0; i < 4; i++) {
      moved += Math.abs(eye[i]! - this.lastEye[i]!);
      turned += Math.abs(hidden[i]! - this.lastHidden[i]!);
    }
    if (this.dirtyPlan || now - this.lastPlan > 250 || moved > 4 || turned > 0.05) {
      this.plan(eye, hidden);
      this.lastPlan = now;
      this.dirtyPlan = false;
      for (let i = 0; i < 4; i++) {
        this.lastEye[i] = eye[i]!;
        this.lastHidden[i] = hidden[i]!;
      }
    }
  }

  private plan(eye: ArrayLike<number>, hidden: ArrayLike<number>): void {
    const w = this.world;
    const N = w.N;
    const lr = this.loadRadius();
    const ur = lr + 24;
    // Unload columns that drifted far from the slice.
    this.toUnload.length = 0;
    for (const c of w.columns.values()) {
      if (this.metric(c.cx, c.cz, c.cw, eye, hidden) > ur) this.toUnload.push(c);
    }
    for (const c of this.toUnload) {
      w.removeColumn(c);
      this.unloadedTotal++;
    }
    // Candidates, nearest first.
    const total = N * N * N;
    if (this.cand.length !== total) this.cand = new Float64Array(total);
    let count = 0;
    for (let i = 0; i < total; i++) {
      const cx = w.ox + (i % N);
      const cz = w.oz + (Math.floor(i / N) % N);
      const cw = w.ow + Math.floor(i / (N * N));
      if (w.column(cx, cz, cw) !== null) continue;
      const key = columnKey(cx, cz, cw);
      if (this.pending.has(key) || this.loading.has(key)) continue;
      const m = this.metric(cx, cz, cw, eye, hidden);
      if (m > lr) continue;
      this.cand[count++] = Math.floor(m * 16) * 65536 + i;
    }
    // Pad with +Infinity and sort the whole (reused) array: no subarray view allocation.
    this.cand.fill(Infinity, count);
    this.cand.sort();
    this.backlog = count + this.pending.size;
    for (let k = 0; k < count; k++) {
      const i = this.cand[k]! % 65536;
      const cx = w.ox + (i % N);
      const cz = w.oz + (Math.floor(i / N) % N);
      const cw = w.ow + Math.floor(i / (N * N));
      const kept = w.takeRetained(cx, cz, cw);
      if (kept) {
        this.addColumn(kept);
        continue;
      }
      if (this.source && this.source.has(cx, cz, cw)) {
        const key = columnKey(cx, cz, cw);
        this.loading.add(key);
        this.source
          .load(cx, cz, cw)
          .then((col) => {
            this.loading.delete(key);
            this.dirtyPlan = true;
            if (!col || !w.inWindow(cx, cz, cw) || w.column(cx, cz, cw) !== null) return;
            this.loadedFromSave++;
            this.addColumn(col);
          })
          .catch((err) => {
            this.loading.delete(key);
            console.error('failed to load saved column', cx, cz, cw, err);
          });
        continue;
      }
      if (this.pool.capacity() <= 0) break;
      const id = this.pool.submit(cx, cz, cw);
      if (id < 0) break;
      this.pending.set(columnKey(cx, cz, cw), id);
    }
  }

  private receive(m: ColumnMsg): void {
    const key = columnKey(m.cx, m.cz, m.cw);
    this.pending.delete(key);
    this.dirtyPlan = true; // keep the pipeline full
    const w = this.world;
    if (!w.inWindow(m.cx, m.cz, m.cw) || w.column(m.cx, m.cz, m.cw) !== null) return;
    const chunks = m.chunks.map((p) => new Chunk(p));
    const col = new Column(m.cx, m.cz, m.cw, chunks, m.heightmap, m.surface);
    if (m.extra) col.extra = m.extra;
    this.addColumn(col);
  }

  private addColumn(c: Column): void {
    const w = this.world;
    w.addColumn(c);
    this.loadedTotal++;
    this.onColumnAdded?.(c);
    // Seed light seams with resident face neighbours (±x, ±z, ±w).
    const L = this.light;
    let n = w.column(c.cx - 1, c.cz, c.cw);
    if (n) L.seedSeam(n, c, 0);
    n = w.column(c.cx + 1, c.cz, c.cw);
    if (n) L.seedSeam(c, n, 0);
    n = w.column(c.cx, c.cz - 1, c.cw);
    if (n) L.seedSeam(n, c, 2);
    n = w.column(c.cx, c.cz + 1, c.cw);
    if (n) L.seedSeam(c, n, 2);
    n = w.column(c.cx, c.cz, c.cw - 1);
    if (n) L.seedSeam(n, c, 3);
    n = w.column(c.cx, c.cz, c.cw + 1);
    if (n) L.seedSeam(c, n, 3);
  }
}
