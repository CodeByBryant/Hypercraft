// 4D cave fields for one column, sampled on a 4-block lattice and interpolated.
//
//  cheese    big 4D blobs          -> hyper-caverns (3D blobs in any slice: walkable caves)
//  worm1..3  three zero sets       -> worm tunnels: 1D curves in 4D, thickened (a slice
//                                     crosses them as pockets that drift as you move kata/ana)
//  fissure   one zero set          -> thin 3D sheets in 4D (cracks/crawlways in a slice)
//
// Ana Sheets, ravines, rivers and sinkholes are analytic (see SurfaceGen).

import { SimplexNoise } from '../../../math/noise';

export const NF = 5; // fields
export const F_CHEESE = 0;
export const F_W1 = 1;
export const F_W2 = 2;
export const F_W3 = 3;
export const F_FISSURE = 4;

export class CaveFields {
  readonly LY: number;
  private readonly lat: Float32Array;
  /** Per-position column of lattice values after xzw interpolation (LY x NF, y-major). */
  readonly colv: Float32Array;
  private readonly nCheese: SimplexNoise;
  private readonly nCheese2: SimplexNoise;
  private readonly nW1: SimplexNoise;
  private readonly nW2: SimplexNoise;
  private readonly nW3: SimplexNoise;
  private readonly nFis: SimplexNoise;

  constructor(seed: number, height: number) {
    this.LY = (height >> 2) + 1;
    this.lat = new Float32Array(125 * this.LY * NF);
    this.colv = new Float32Array(this.LY * NF);
    this.rowv = new Float32Array(5 * this.LY * NF);
    this.nCheese = new SimplexNoise(seed ^ 0xc001);
    this.nCheese2 = new SimplexNoise(seed ^ 0xc002);
    this.nW1 = new SimplexNoise(seed ^ 0xc003);
    this.nW2 = new SimplexNoise(seed ^ 0xc004);
    this.nW3 = new SimplexNoise(seed ^ 0xc005);
    this.nFis = new SimplexNoise(seed ^ 0xc006);
  }

  fill(X0: number, Z0: number, W0: number): void {
    const lat = this.lat;
    const LY = this.LY;
    for (let ly = 0; ly < LY; ly++) {
      const Y = ly * 4;
      for (let iw = 0; iw < 5; iw++)
        for (let iz = 0; iz < 5; iz++)
          for (let ix = 0; ix < 5; ix++) {
            const X = X0 + ix * 4, Z = Z0 + iz * 4, W = W0 + iw * 4;
            const o = ((ix + 5 * (iz + 5 * iw)) * LY + ly) * NF;
            lat[o] = this.nCheese.n4(X / 38, Y / 24, Z / 38, W / 38) + 0.45 * this.nCheese2.n4(X / 16, Y / 11, Z / 16, W / 16);
            lat[o + 1] = this.nW1.n4(X / 46, Y / 30, Z / 46, W / 46);
            lat[o + 2] = this.nW2.n4(X / 46, Y / 30, Z / 46, W / 46);
            lat[o + 3] = this.nW3.n4(X / 46, Y / 30, Z / 46, W / 46);
            lat[o + 4] = this.nFis.n4(X / 60, Y / 40, Z / 60, W / 60);
          }
    }
  }

  /** z/w-interpolated profiles of the 5 x-lattice planes for the current row (5 x LY x NF). */
  private readonly rowv: Float32Array;
  private rowN = 0;

  /**
   * Prepare a row of columns at column-local (z, w), up to height yMax: interpolates the
   * lattice over z and w once for the 5 x planes, so column() only has to lerp in x.
   */
  row(z: number, w: number, yMax: number): void {
    const fz = z / 4, fw = w / 4;
    const iz = Math.min(3, fz | 0), iw = Math.min(3, fw | 0);
    const tz = fz - iz, tw = fw - iw;
    const LY = this.LY;
    const n = Math.min(LY, (Math.max(0, yMax) >> 2) + 2) * NF;
    this.rowN = n;
    const lat = this.lat;
    const rv = this.rowv;
    const w00 = (1 - tz) * (1 - tw), w10 = tz * (1 - tw), w01 = (1 - tz) * tw, w11 = tz * tw;
    for (let ix = 0; ix < 5; ix++) {
      const b00 = (ix + 5 * (iz + 5 * iw)) * LY * NF;
      const b10 = (ix + 5 * (iz + 1 + 5 * iw)) * LY * NF;
      const b01 = (ix + 5 * (iz + 5 * (iw + 1))) * LY * NF;
      const b11 = (ix + 5 * (iz + 1 + 5 * (iw + 1))) * LY * NF;
      const o = ix * LY * NF;
      for (let k = 0; k < n; k++) rv[o + k] = w00 * lat[b00 + k]! + w10 * lat[b10 + k]! + w01 * lat[b01 + k]! + w11 * lat[b11 + k]!;
    }
  }

  /** Prepare the y-profile (colv) for column-local x in the current row. */
  column(x: number): void {
    const fx = x / 4;
    const ix = Math.min(3, fx | 0);
    const tx = fx - ix;
    const LY = this.LY;
    const a = ix * LY * NF, b = a + LY * NF;
    const rv = this.rowv;
    const cv = this.colv;
    const n = this.rowN;
    for (let k = 0; k < n; k++) cv[k] = rv[a + k]! + (rv[b + k]! - rv[a + k]!) * tx;
  }

  /** Field value at height y for the prepared column. */
  at(y: number, f: number): number {
    const fy = y / 4;
    const iy = Math.min(this.LY - 2, fy | 0);
    const t = fy - iy;
    const a = this.colv[iy * NF + f]!;
    const b = this.colv[(iy + 1) * NF + f]!;
    return a + (b - a) * t;
  }
}
