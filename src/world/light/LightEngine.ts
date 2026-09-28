// Main-thread 4D light propagation: seams between independently generated columns and
// incremental updates after edits (removal + re-propagation, the classic two-queue BFS).
// Work is budgeted per frame; removals always drain before increases for correctness.

import { REG } from '../../content/registry';
import { VOID_VOXEL } from '../constants';
import type { Column, World } from '../World';

const INC_CAP = 1 << 20; // entries (x, y, z, w) -> 4 ints each
const REM_CAP = 1 << 19; // entries (x, y, z, w, oldSky, oldBlock) -> 6 ints each

// Neighbour offsets in 4D: +x -x +z -z +w -w +y -y. Index 7 (-y) is "down".
const DX = [1, -1, 0, 0, 0, 0, 0, 0];
const DY = [0, 0, 0, 0, 0, 0, 1, -1];
const DZ = [0, 0, 1, -1, 0, 0, 0, 0];
const DW = [0, 0, 0, 0, 1, -1, 0, 0];
const DOWN = 7;

export class LightEngine {
  private readonly world: World;
  private readonly inc = new Int32Array(INC_CAP * 4);
  private incHead = 0;
  private incTail = 0;
  private readonly rem = new Int32Array(REM_CAP * 6);
  private remHead = 0;
  private remTail = 0;
  /** Overflow counter (should stay 0; reported in F3). */
  overflows = 0;
  processedTotal = 0;

  constructor(world: World) {
    this.world = world;
  }

  pending(): number {
    const inc = (this.incTail - this.incHead + INC_CAP) % INC_CAP;
    const rem = (this.remTail - this.remHead + REM_CAP) % REM_CAP;
    return inc + rem;
  }

  enqueueIncrease(x: number, y: number, z: number, w: number): void {
    const next = (this.incTail + 1) % INC_CAP;
    if (next === this.incHead) {
      this.overflows++;
      return;
    }
    const o = this.incTail * 4;
    this.inc[o] = x;
    this.inc[o + 1] = y;
    this.inc[o + 2] = z;
    this.inc[o + 3] = w;
    this.incTail = next;
  }

  private enqueueRemoval(x: number, y: number, z: number, w: number, s: number, b: number): void {
    const next = (this.remTail + 1) % REM_CAP;
    if (next === this.remHead) {
      this.overflows++;
      return;
    }
    const o = this.remTail * 6;
    this.rem[o] = x;
    this.rem[o + 1] = y;
    this.rem[o + 2] = z;
    this.rem[o + 3] = w;
    this.rem[o + 4] = s;
    this.rem[o + 5] = b;
    this.remTail = next;
  }

  /** A block changed: remove light that depended on the old state, then re-propagate. */
  onBlockChanged(x: number, y: number, z: number, w: number, _oldV: number, newV: number): void {
    const world = this.world;
    const l = world.getLight(x, y, z, w);
    if (l !== 0) {
      world.setLight(x, y, z, w, 0);
      this.enqueueRemoval(x, y, z, w, l >> 4, l & 15);
    }
    const e = REG.emission[newV & 0xfff]!;
    if (e > 0) {
      world.setLight(x, y, z, w, e);
      this.enqueueIncrease(x, y, z, w);
    }
    for (let d = 0; d < 8; d++) this.enqueueIncrease(x + DX[d]!, y + DY[d]!, z + DZ[d]!, w + DW[d]!);
  }

  /**
   * Column `a` and its +axis neighbour `b` are both resident: enqueue every boundary voxel
   * whose light can cross the seam (in either direction). Uniform brick pairs are checked
   * once instead of per voxel.
   */
  seedSeam(a: Column, b: Column, axis: 0 | 2 | 3): void {
    const opacity = REG.lightOpacity;
    const hc = a.chunks.length;
    const ax0 = a.cx * 16, az0 = a.cz * 16, aw0 = a.cw * 16;
    const bx0 = b.cx * 16, bz0 = b.cz * 16, bw0 = b.cw * 16;
    for (let cy = 0; cy < hc; cy++) {
      const ca = a.chunks[cy]!;
      const cb = b.chunks[cy]!;
      const y0 = cy * 16;
      for (let p = 0; p < 4; p++) {
        for (let q = 0; q < 4; q++) {
          for (let by = 0; by < 4; by++) {
            // Brick coordinates of the pair: along `axis` a = 3, b = 0.
            let ai: number, bi: number;
            if (axis === 0) {
              ai = 3 | (by << 2) | (p << 4) | (q << 6);
              bi = 0 | (by << 2) | (p << 4) | (q << 6);
            } else if (axis === 2) {
              ai = p | (by << 2) | (3 << 4) | (q << 6);
              bi = p | (by << 2) | (0 << 4) | (q << 6);
            } else {
              ai = p | (by << 2) | (q << 4) | (3 << 6);
              bi = p | (by << 2) | (q << 4) | (0 << 6);
            }
            const la = ca.lIdx[ai]!, lb = cb.lIdx[bi]!, ba = ca.bIdx[ai]!, bb = cb.bIdx[bi]!;
            if (la < 0 && lb < 0 && ba < 0 && bb < 0) {
              const lva = ~la, lvb = ~lb;
              const opa = opacity[~ba & 0xfff]!, opb = opacity[~bb & 0xfff]!;
              const ab = opb < 15 && ((lva >> 4) - 1 - opb > lvb >> 4 || (lva & 15) - 1 - opb > (lvb & 15));
              const ba2 = opa < 15 && ((lvb >> 4) - 1 - opa > lva >> 4 || (lvb & 15) - 1 - opa > (lva & 15));
              if (!ab && !ba2) continue;
            }
            // Per-voxel check over the 4x4x4 face of this brick pair.
            for (let v1 = 0; v1 < 4; v1++) {
              for (let v2 = 0; v2 < 4; v2++) {
                for (let vy = 0; vy < 4; vy++) {
                  const ly = (by << 2) + vy;
                  const y = y0 + ly;
                  let axl: number, azl: number, awl: number, bxl: number, bzl: number, bwl: number;
                  if (axis === 0) {
                    axl = 15; bxl = 0;
                    azl = bzl = (p << 2) + v1;
                    awl = bwl = (q << 2) + v2;
                  } else if (axis === 2) {
                    azl = 15; bzl = 0;
                    axl = bxl = (p << 2) + v1;
                    awl = bwl = (q << 2) + v2;
                  } else {
                    awl = 15; bwl = 0;
                    axl = bxl = (p << 2) + v1;
                    azl = bzl = (q << 2) + v2;
                  }
                  const lA = ca.getLight(axl, ly, azl, awl);
                  const lB = cb.getLight(bxl, ly, bzl, bwl);
                  const opA = opacity[ca.getBlock(axl, ly, azl, awl) & 0xfff]!;
                  const opB = opacity[cb.getBlock(bxl, ly, bzl, bwl) & 0xfff]!;
                  if (opB < 15 && ((lA >> 4) - 1 - opB > lB >> 4 || (lA & 15) - 1 - opB > (lB & 15))) {
                    this.enqueueIncrease(ax0 + axl, y, az0 + azl, aw0 + awl);
                  }
                  if (opA < 15 && ((lB >> 4) - 1 - opA > lA >> 4 || (lB & 15) - 1 - opA > (lA & 15))) {
                    this.enqueueIncrease(bx0 + bxl, y, bz0 + bzl, bw0 + bwl);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /** Process queued work; returns the number of nodes processed. */
  process(budget: number): number {
    const world = this.world;
    const opacity = REG.lightOpacity;
    let n = 0;
    // Removals first.
    while (this.remHead !== this.remTail && n < budget) {
      const o = this.remHead * 6;
      const x = this.rem[o]!, y = this.rem[o + 1]!, z = this.rem[o + 2]!, w = this.rem[o + 3]!;
      const os = this.rem[o + 4]!, ob = this.rem[o + 5]!;
      this.remHead = (this.remHead + 1) % REM_CAP;
      n++;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d]!, ny = y + DY[d]!, nz = z + DZ[d]!, nw = w + DW[d]!;
        if (ny < 0 || ny >= world.height) continue;
        const ln = world.getLight(nx, ny, nz, nw);
        if (ln === 0) continue;
        const ns = ln >> 4, nb = ln & 15;
        let rs = 0, rb = 0;
        let keepS = ns, keepB = nb;
        let relight = false;
        if (os > 0 && ns > 0) {
          if (ns < os || (d === DOWN && os === 15 && ns === 15)) {
            rs = ns;
            keepS = 0;
          } else relight = true;
        }
        if (ob > 0 && nb > 0) {
          if (nb < ob) {
            rb = nb;
            keepB = 0;
          } else relight = true;
        }
        if (rs > 0 || rb > 0) {
          // Emitters keep their own block light.
          const e = REG.emission[world.getBlock(nx, ny, nz, nw) & 0xfff]!;
          if (e > 0 && keepB < e) {
            keepB = e;
            relight = true;
          }
          world.setLight(nx, ny, nz, nw, (keepS << 4) | keepB);
          this.enqueueRemoval(nx, ny, nz, nw, rs, rb);
        }
        if (relight) this.enqueueIncrease(nx, ny, nz, nw);
      }
    }
    if (this.remHead !== this.remTail) {
      this.processedTotal += n;
      return n;
    }
    // Then increases.
    while (this.incHead !== this.incTail && n < budget) {
      const o = this.incHead * 4;
      const x = this.inc[o]!, y = this.inc[o + 1]!, z = this.inc[o + 2]!, w = this.inc[o + 3]!;
      this.incHead = (this.incHead + 1) % INC_CAP;
      n++;
      if (y < 0 || y >= world.height) continue;
      const l = world.getLight(x, y, z, w);
      const s = l >> 4, b = l & 15;
      if (s <= 1 && b <= 1) continue;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d]!, ny = y + DY[d]!, nz = z + DZ[d]!, nw = w + DW[d]!;
        if (ny < 0 || ny >= world.height) continue;
        const v = world.getBlock(nx, ny, nz, nw);
        if (v === VOID_VOXEL) continue;
        const op = opacity[v & 0xfff]!;
        if (op >= 15) continue;
        const ns = d === DOWN && s === 15 && op === 0 ? 15 : s - 1 - op;
        const nb = b - 1 - op;
        const ln = world.getLight(nx, ny, nz, nw);
        const cs = ln >> 4, cb = ln & 15;
        if (ns > cs || nb > cb) {
          world.setLight(nx, ny, nz, nw, ((ns > cs ? ns : cs) << 4) | (nb > cb ? nb : cb));
          this.enqueueIncrease(nx, ny, nz, nw);
        }
      }
    }
    this.processedTotal += n;
    return n;
  }
}
