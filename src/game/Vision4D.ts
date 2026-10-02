// 4D vision overlays (Phase 7): things drawn as wireframes whether or not your slice passes
// through them. Each 4D shape is projected along the hidden axis onto your 3D view (its
// "shadow" in the slice), so a mob kata of you shows where it stands in x/y/z, with its
// full 4D body outlined, and a tilted slice shows the tesseract-like projection.
//
//  * 4D Glasses (helmet): every mob within 32 blocks.
//  * 4D Vision enchantment (any other helmet): mobs and key blocks (crafting tables,
//    furnaces, chests, stations, beds, spawners...).
//  * Slice Sense (pickaxes), the Phase Lens and Phase Sight build on the same primitives.
//
// Colours: hostile red, passive green, villagers gold, bosses violet; the further kata the
// bluer, the further ana the pinker.

import type { Frame4 } from '../math/frame';
import type { LineOverlay } from '../render/LineOverlay';
import type { Mob, MobManager } from './mobs/MobManager';

const CIRCLE = 12;
const COS = Float64Array.from({ length: CIRCLE + 1 }, (_, i) => Math.cos((i / CIRCLE) * Math.PI * 2));
const SIN = Float64Array.from({ length: CIRCLE + 1 }, (_, i) => Math.sin((i / CIRCLE) * Math.PI * 2));

export class Vision4D {
  private readonly a = new Float64Array(4);
  private readonly b = new Float64Array(4);
  private readonly w0 = new Float64Array(4);
  private readonly w1 = new Float64Array(4);
  private readonly corner = new Float64Array(64);
  private readonly order: Mob[] = [];
  /** Mobs drawn last frame (F3). */
  drawnMobs = 0;

  /** Colour for a hidden-axis offset `dh`: base mixed toward blue (kata) or pink (ana). */
  private tint(base: [number, number, number], dh: number, out: number[]): void {
    const k = Math.min(1, Math.abs(dh) / 16) * 0.55;
    const t = dh < 0 ? [0.35, 0.55, 1] : [1, 0.4, 0.95];
    out[0] = base[0] + (t[0]! - base[0]) * k;
    out[1] = base[1] + (t[1]! - base[1]) * k;
    out[2] = base[2] + (t[2]! - base[2]) * k;
  }

  /**
   * Every mob within `radius` (4D distance) as a projected wireframe of its body parts.
   * Mobs the slice already cuts are drawn faintly; the rest boldly (x-ray: visible through
   * walls).
   */
  mobs(lines: LineOverlay, eye: Float64Array, cam: Frame4, mobs: MobManager, radius: number, max = 24, maxDh = Infinity, faint = 1): void {
    const H = cam.hidden;
    const order = this.order;
    order.length = 0;
    for (const m of mobs.list) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) d2 += (m.pos[k]! - eye[k]!) ** 2;
      if (d2 < radius * radius) order.push(m);
    }
    const dist = (m: Mob) => (m.pos[0]! - eye[0]!) ** 2 + (m.pos[1]! - eye[1]!) ** 2 + (m.pos[2]! - eye[2]!) ** 2 + (m.pos[3]! - eye[3]!) ** 2;
    if (order.length > max) order.sort((x, y) => dist(x) - dist(y));
    const col = [0, 0, 0];
    let n = 0;
    for (const m of order) {
      if (n >= max || lines.full) break;
      let dh = 0;
      for (let k = 0; k < 4; k++) dh += (m.pos[k]! - eye[k]!) * H[k]!;
      if (Math.abs(dh) > maxDh) continue;
      const inSlice = Math.abs(dh) < m.cm.radius * m.scale;
      const base: [number, number, number] = m.def.boss ? [0.85, 0.35, 1] : m.def.profession ? [1, 0.85, 0.3] : m.def.hostile ? [1, 0.32, 0.25] : [0.4, 1, 0.5];
      this.tint(base, dh, col);
      const fade = Math.max(0.35, 1 - Math.sqrt(dist(m)) / (radius * 1.15));
      const alpha = (inSlice ? 0.4 : 0.95) * fade * faint + 1; // x-ray
      this.mob(lines, eye, cam, mobs, m, col[0]!, col[1]!, col[2]!, alpha);
      n++;
    }
    this.drawnMobs = n;
  }

  /** One mob, projected, in a given colour (alpha above 1: x-ray). */
  mobOne(lines: LineOverlay, eye: Float64Array, cam: Frame4, mobs: MobManager, m: Mob, r: number, g: number, b: number, alpha: number): void {
    this.mob(lines, eye, cam, mobs, m, r, g, b, alpha);
  }

  /** One mob's parts, projected. */
  private mob(lines: LineOverlay, eye: Float64Array, cam: Frame4, mobs: MobManager, m: Mob, r: number, g: number, b: number, alpha: number): void {
    const parts = m.def.parts;
    const a = this.a, bb = this.b;
    const s = m.scale;
    for (let i = 0; i < parts.length; i++) {
      const pt = parts[i]!;
      mobs.animate(m, i, a, bb);
      if (pt.kind === 'box') {
        const sz = pt.size!;
        if (Math.max(sz[0], sz[1], sz[2], sz[3]) * s < 0.05) continue; // eyes, beaks
        // 16 corners in world space (eye-relative), then the 32 edges.
        const c = this.corner;
        for (let k = 0; k < 16; k++) {
          const lx = a[0]! + (k & 1 ? sz[0] : -sz[0]), ly = a[1]! + (k & 2 ? sz[1] : -sz[1]);
          const lz = a[2]! + (k & 4 ? sz[2] : -sz[2]), lw = a[3]! + (k & 8 ? sz[3] : -sz[3]);
          this.toWorld(m, lx, ly, lz, lw, eye, c, k * 4);
        }
        for (let k = 0; k < 16; k++)
          for (let axis = 0; axis < 4; axis++) {
            const bit = 1 << axis;
            if (k & bit) continue;
            const j = k | bit;
            lines.addSegment4(c[k * 4]!, c[k * 4 + 1]!, c[k * 4 + 2]!, c[k * 4 + 3]!, c[j * 4]!, c[j * 4 + 1]!, c[j * 4 + 2]!, c[j * 4 + 3]!, cam, r, g, b, alpha);
          }
      } else {
        const rad = (pt.r ?? 0.1) * s;
        if (rad < 0.05) continue;
        this.toWorld(m, a[0]!, a[1]!, a[2]!, a[3]!, eye, this.w0, 0);
        if (pt.kind === 'ball') {
          this.circle(lines, cam, this.w0, rad, cam.right, cam.up, r, g, b, alpha);
          this.circle(lines, cam, this.w0, rad, cam.right, cam.fwd, r, g, b, alpha);
        } else {
          this.toWorld(m, bb[0]!, bb[1]!, bb[2]!, bb[3]!, eye, this.w1, 0);
          const p = this.w0, q = this.w1;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const dx = (cam.right[0]! * ox + cam.up[0]! * oy) * rad, dy = (cam.right[1]! * ox + cam.up[1]! * oy) * rad;
            const dz = (cam.right[2]! * ox + cam.up[2]! * oy) * rad, dw = (cam.right[3]! * ox + cam.up[3]! * oy) * rad;
            lines.addSegment4(p[0]! + dx, p[1]! + dy, p[2]! + dz, p[3]! + dw, q[0]! + dx, q[1]! + dy, q[2]! + dz, q[3]! + dw, cam, r, g, b, alpha);
          }
          this.circle(lines, cam, p, rad, cam.right, cam.up, r, g, b, alpha);
          this.circle(lines, cam, q, rad, cam.right, cam.up, r, g, b, alpha);
        }
      }
    }
  }

  /** Mob-local point -> eye-relative world coordinates into out[o..o+3]. */
  private toWorld(m: Mob, lx: number, ly: number, lz: number, lw: number, eye: Float64Array, out: Float64Array, o: number): void {
    const s = m.scale;
    for (let k = 0; k < 4; k++) out[o + k] = m.pos[k]! - eye[k]! + s * (lx * m.R[k]! + lz * m.F[k]! + lw * m.H[k]!) + (k === 1 ? s * ly : 0);
  }

  private circle(lines: LineOverlay, cam: Frame4, c: Float64Array, rad: number, u: Float64Array, v: Float64Array, r: number, g: number, b: number, a: number): void {
    for (let i = 0; i < CIRCLE; i++) {
      const c0 = COS[i]! * rad, s0 = SIN[i]! * rad, c1 = COS[i + 1]! * rad, s1 = SIN[i + 1]! * rad;
      lines.addSegment4(
        c[0]! + u[0]! * c0 + v[0]! * s0,
        c[1]! + u[1]! * c0 + v[1]! * s0,
        c[2]! + u[2]! * c0 + v[2]! * s0,
        c[3]! + u[3]! * c0 + v[3]! * s0,
        c[0]! + u[0]! * c1 + v[0]! * s1,
        c[1]! + u[1]! * c1 + v[1]! * s1,
        c[2]! + u[2]! * c1 + v[2]! * s1,
        c[3]! + u[3]! * c1 + v[3]! * s1,
        cam,
        r,
        g,
        b,
        a,
      );
    }
  }

  /**
   * A 4D box [min, max] (eye-relative) as its projection along the hidden axis: the 32
   * tesseract edges, minus those that collapse to points or overlap when the slice is
   * axis-aligned.
   */
  box(lines: LineOverlay, cam: Frame4, mn: ArrayLike<number>, mx: ArrayLike<number>, r: number, g: number, b: number, a: number): void {
    const H = cam.hidden;
    let along = -1;
    for (let k = 0; k < 4; k++) if (Math.abs(H[k]!) > 0.999) along = k;
    for (let axis = 0; axis < 4; axis++) {
      if (axis === along) continue; // collapses to a point
      for (let k = 0; k < 16; k++) {
        if (k & (1 << axis)) continue;
        if (along >= 0 && k & (1 << along)) continue; // the twin edge projects onto this one
        const p = (bitAxis: number, hi: boolean) => (hi ? mx[bitAxis]! : mn[bitAxis]!);
        const ax = p(0, axis === 0 ? false : !!(k & 1)), ay = p(1, axis === 1 ? false : !!(k & 2)), az = p(2, axis === 2 ? false : !!(k & 4)), aw = p(3, axis === 3 ? false : !!(k & 8));
        const bx = axis === 0 ? mx[0]! : ax, by = axis === 1 ? mx[1]! : ay, bz = axis === 2 ? mx[2]! : az, bw = axis === 3 ? mx[3]! : aw;
        lines.addSegment4(ax, ay, az, aw, bx, by, bz, bw, cam, r, g, b, a);
      }
    }
  }

  /** A block cell (world coordinates) as a projected tesseract. */
  cell(lines: LineOverlay, eye: Float64Array, cam: Frame4, x: number, y: number, z: number, w: number, r: number, g: number, b: number, a: number, inset = 0.04): void {
    const mn = this.w0, mx = this.w1;
    mn[0] = x + inset - eye[0]!;
    mn[1] = y + inset - eye[1]!;
    mn[2] = z + inset - eye[2]!;
    mn[3] = w + inset - eye[3]!;
    mx[0] = x + 1 - inset - eye[0]!;
    mx[1] = y + 1 - inset - eye[1]!;
    mx[2] = z + 1 - inset - eye[2]!;
    mx[3] = w + 1 - inset - eye[3]!;
    this.box(lines, cam, mn, mx, r, g, b, a);
  }

  /** Hidden-axis offset of a world point from the eye. */
  static dh(eye: ArrayLike<number>, cam: Frame4, x: number, y: number, z: number, w: number): number {
    const H = cam.hidden;
    return (x - eye[0]!) * H[0]! + (y - eye[1]!) * H[1]! + (z - eye[2]!) * H[2]! + (w - eye[3]!) * H[3]!;
  }
}
