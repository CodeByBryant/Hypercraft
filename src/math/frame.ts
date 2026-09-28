// 4D camera orientation.
//
// The player stays upright with respect to the realm's gravity ("up") axis, so the
// orientation is: an orthonormal frame {F, R, H} spanning the 3D "horizontal" space
// orthogonal to up, plus a pitch angle. From that we derive the camera basis:
//
//   fwd    = cos(pitch) F + sin(pitch) U
//   up     = -sin(pitch) F + cos(pitch) U
//   right  = R
//   hidden = H          (normal of the view hyperplane: the axis you cannot see)
//
// Every pixel's ray is a combination of fwd/right/up, so it lies in the 3D hyperplane
// through the eye with normal `hidden`. Moving kata/ana means moving along -H/+H.
//
// Rotations:
//   yaw      rotates F toward R        (mouse x)
//   pitch    tilts fwd toward U        (mouse y)
//   tiltFH   rotates F toward H        (slice rotation: forward mixes with hidden)
//   tiltRH   rotates R toward H        (slice rotation: right mixes with hidden)
//   rotateWorldPlane(a, b, θ) rotates the whole frame in the world plane (a, b)
//   e.g. an "XW tilt of 30°" is rotateWorldPlane(X, W, 30°) from the base frame.

import { type Vec4, vec4, dot4, normalize4, det4, set4 } from './vec4';

const tmpF = vec4();
const tmpR = vec4();
const tmpH = vec4();
const tgtF = vec4();
const tgtR = vec4();
const tgtH = vec4();

/** Horizontal axis with the largest |v[i]|, skipping the up axis and two exclusions. */
function pickAxis(v: Vec4, up: number, ex1: number, ex2: number): number {
  let best = -1;
  let bv = -1;
  for (let i = 0; i < 4; i++) {
    if (i === up || i === ex1 || i === ex2) continue;
    const m = Math.abs(v[i]!);
    if (m > bv) {
      bv = m;
      best = i;
    }
  }
  return best;
}

function rotatePair(a: Vec4, b: Vec4, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < 4; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    a[i] = c * ai + s * bi;
    b[i] = -s * ai + c * bi;
  }
}

export const MAX_PITCH = (89.5 * Math.PI) / 180;

export class Frame4 {
  readonly F = vec4();
  readonly R = vec4();
  readonly H = vec4();
  /** Unit vector along the world up axis. */
  readonly U = vec4();
  pitch = 0;
  upAxis: number;

  // Derived camera basis (call update()).
  readonly fwd = vec4();
  readonly up = vec4();
  readonly right = vec4();
  readonly hidden = vec4();

  constructor(upAxis = 1) {
    this.upAxis = upAxis;
    this.reset();
  }

  /** The three world axes orthogonal to `up`, in ascending order. */
  horizontalAxes(): [number, number, number] {
    const h: number[] = [];
    for (let i = 0; i < 4; i++) if (i !== this.upAxis) h.push(i);
    return [h[0]!, h[1]!, h[2]!];
  }

  /**
   * Base orientation. For up = Y: forward = +Z, right = +X, hidden = +W.
   * In general forward/right/hidden are the three horizontal axes (with the order
   * chosen so the frame keeps a positive orientation).
   */
  reset(): void {
    const up = this.upAxis;
    set4(this.U, 0, 0, 0, 0);
    this.U[up] = 1;
    const [a, b, c] = this.horizontalAxes();
    // For Y-up: a = X, b = Z, c = W -> R = X, F = Z, H = W.
    set4(this.R, 0, 0, 0, 0);
    set4(this.F, 0, 0, 0, 0);
    set4(this.H, 0, 0, 0, 0);
    this.R[a] = 1;
    this.F[b] = 1;
    this.H[c] = 1;
    if (det4(this.R, this.U, this.F, this.H) < 0) this.H[c] = -1;
    this.pitch = 0;
    this.update();
  }

  yaw(angle: number): void {
    rotatePair(this.F, this.R, angle);
    this.orthonormalize();
  }

  addPitch(angle: number): void {
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + angle));
    this.update();
  }

  setPitch(angle: number): void {
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, angle));
    this.update();
  }

  tiltFH(angle: number): void {
    rotatePair(this.F, this.H, angle);
    this.orthonormalize();
  }

  tiltRH(angle: number): void {
    rotatePair(this.R, this.H, angle);
    this.orthonormalize();
  }

  /** Rotate every frame vector in the world plane spanned by axes a and b (a toward b). */
  rotateWorldPlane(a: number, b: number, angle: number): void {
    if (a === this.upAxis || b === this.upAxis) return; // keep the player upright
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    rotateComponents(this.F, a, b, c, s);
    rotateComponents(this.R, a, b, c, s);
    rotateComponents(this.H, a, b, c, s);
    this.orthonormalize();
  }

  /** Gram-Schmidt on F, R, H inside the horizontal subspace, keeping orientation. */
  orthonormalize(): void {
    const up = this.upAxis;
    this.F[up] = 0;
    normalize4(this.F);
    this.R[up] = 0;
    let d = dot4(this.R, this.F);
    for (let i = 0; i < 4; i++) this.R[i] = this.R[i]! - d * this.F[i]!;
    normalize4(this.R);
    this.H[up] = 0;
    d = dot4(this.H, this.F);
    const e = dot4(this.H, this.R);
    for (let i = 0; i < 4; i++) this.H[i] = this.H[i]! - d * this.F[i]! - e * this.R[i]!;
    normalize4(this.H);
    if (det4(this.R, this.U, this.F, this.H) < 0) {
      for (let i = 0; i < 4; i++) this.H[i] = -this.H[i]!;
    }
    this.update();
  }

  /** Recompute the derived camera basis. */
  update(): void {
    const c = Math.cos(this.pitch);
    const s = Math.sin(this.pitch);
    for (let i = 0; i < 4; i++) {
      this.fwd[i] = c * this.F[i]! + s * this.U[i]!;
      this.up[i] = -s * this.F[i]! + c * this.U[i]!;
      this.right[i] = this.R[i]!;
      this.hidden[i] = this.H[i]!;
    }
  }

  /**
   * Snap the horizontal frame to the nearest axis-aligned orientation (hidden axis first,
   * then forward; right is chosen to keep the frame's orientation).
   */
  snapToAxes(): void {
    const up = this.upAxis;
    const ha = pickAxis(this.H, up, -1, -1);
    const hs = this.H[ha]! >= 0 ? 1 : -1;
    const fa = pickAxis(this.F, up, ha, -1);
    const fs = this.F[fa]! >= 0 ? 1 : -1;
    const ra = pickAxis(this.R, up, ha, fa);
    const rs = this.R[ra]! >= 0 ? 1 : -1;
    set4(this.H, 0, 0, 0, 0);
    set4(this.F, 0, 0, 0, 0);
    set4(this.R, 0, 0, 0, 0);
    this.H[ha] = hs;
    this.F[fa] = fs;
    this.R[ra] = rs;
    if (det4(this.R, this.U, this.F, this.H) < 0) this.R[ra] = -rs;
    this.update();
  }

  /**
   * Smoothly move the frame toward the snapped orientation by fraction k (0..1).
   * Returns true when (numerically) aligned.
   */
  approachSnap(k: number): boolean {
    copyInto(tmpF, this.F);
    copyInto(tmpR, this.R);
    copyInto(tmpH, this.H);
    this.snapToAxes();
    copyInto(tgtF, this.F);
    copyInto(tgtR, this.R);
    copyInto(tgtH, this.H);
    let err = 0;
    for (let i = 0; i < 4; i++) {
      this.F[i] = tmpF[i]! + (tgtF[i]! - tmpF[i]!) * k;
      this.R[i] = tmpR[i]! + (tgtR[i]! - tmpR[i]!) * k;
      this.H[i] = tmpH[i]! + (tgtH[i]! - tmpH[i]!) * k;
      err += Math.abs(tgtH[i]! - tmpH[i]!) + Math.abs(tgtF[i]! - tmpF[i]!);
    }
    this.orthonormalize();
    return err < 1e-4;
  }

  /** How far (radians) the hidden axis is from the nearest world axis. */
  hiddenAxisTilt(): number {
    let m = 0;
    for (let i = 0; i < 4; i++) m = Math.max(m, Math.abs(this.H[i]!));
    return Math.acos(Math.min(1, m));
  }

  /** Copy state from another frame. */
  copyFrom(o: Frame4): void {
    this.upAxis = o.upAxis;
    copyInto(this.F, o.F);
    copyInto(this.R, o.R);
    copyInto(this.H, o.H);
    copyInto(this.U, o.U);
    this.pitch = o.pitch;
    this.update();
  }
}

function rotateComponents(v: Vec4, a: number, b: number, c: number, s: number): void {
  const va = v[a]!;
  const vb = v[b]!;
  v[a] = c * va - s * vb;
  v[b] = s * va + c * vb;
}

function copyInto(out: Vec4, a: Vec4): void {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  out[3] = a[3]!;
}

/** Build the frame used by the R6 screenshot views: base frame, then world-plane tilts. */
export function makeTiltedFrame(opts: { yawDeg?: number; pitchDeg?: number; xwDeg?: number; zwDeg?: number; upAxis?: number }): Frame4 {
  const f = new Frame4(opts.upAxis ?? 1);
  const deg = Math.PI / 180;
  if (opts.xwDeg) f.rotateWorldPlane(0, 3, opts.xwDeg * deg);
  if (opts.zwDeg) f.rotateWorldPlane(2, 3, opts.zwDeg * deg);
  if (opts.yawDeg) f.yaw(opts.yawDeg * deg);
  if (opts.pitchDeg) f.setPitch(opts.pitchDeg * deg);
  return f;
}
