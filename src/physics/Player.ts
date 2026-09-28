// Player physics: a 4D hyperbox (0.6 wide in all three horizontal axes, 1.8 tall along the
// realm's up axis) with axis-separated collision against voxel collision boxes, gravity,
// jumping, swimming, climbing, sprinting, sneaking (no falling off edges), step-up for
// slabs/stairs, and flying in creative/spectator.
//
// Horizontal movement is expressed in the camera's horizontal frame {F, R, H}: forward,
// strafe, and kata/ana along the CURRENT hidden axis H (never a fixed world axis).

import { REG, COLLISION_FULL, COLLISION_SHAPE, FLUID_LAVA, FLUID_WATER } from '../content/registry';
import { Frame4 } from '../math/frame';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';

export type GameMode = 'survival' | 'creative' | 'spectator';

export interface MoveInput {
  forward: number;
  strafe: number;
  ana: number;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
const SNEAK_HEIGHT = 1.5;
const EYE = 1.62;
const SNEAK_EYE = 1.27;
const STEP = 0.6;
const EPS = 1e-4;

export class Player {
  readonly pos = new Float64Array(4);
  readonly vel = new Float64Array(4);
  readonly cam: Frame4;
  mode: GameMode = 'creative';
  flying = false;
  onGround = false;
  inWater = false;
  inLava = false;
  eyeInWater = false;
  eyeInLava = false;
  onClimbable = false;
  sneaking = false;
  sprinting = false;
  frozen = true;
  /** Horizontal collision happened this frame (used for climbing and step-up). */
  hitWall = false;
  fallStart = 0;
  /** Height of the most recent fall (set on landing; Phase 4 turns it into damage). */
  lastFall = 0;
  private wasGrounded = false;
  readonly up: number;
  readonly gravity: number;

  private readonly bmin = new Float64Array(4);
  private readonly bmax = new Float64Array(4);
  private readonly wish = new Float64Array(4);
  private readonly saved = new Float64Array(4);
  private readonly pre = new Float64Array(4);

  constructor(realmGravityAxis: number, gravity: number) {
    this.up = realmGravityAxis;
    this.gravity = gravity;
    this.cam = new Frame4(realmGravityAxis);
  }

  get height(): number {
    return this.sneaking && !this.flying ? SNEAK_HEIGHT : HEIGHT;
  }

  eyeHeight(): number {
    return this.sneaking && !this.flying ? SNEAK_EYE : EYE;
  }

  /** Eye position in world coordinates. */
  eye(out: Float64Array): Float64Array {
    for (let i = 0; i < 4; i++) out[i] = this.pos[i]!;
    out[this.up] = out[this.up]! + this.eyeHeight();
    return out;
  }

  setPosition(x: number, y: number, z: number, w: number): void {
    this.pos[0] = x;
    this.pos[1] = y;
    this.pos[2] = z;
    this.pos[3] = w;
    this.vel.fill(0);
    this.fallStart = this.pos[this.up]!;
  }

  private box(p: Float64Array, h: number): void {
    for (let i = 0; i < 4; i++) {
      if (i === this.up) {
        this.bmin[i] = p[i]!;
        this.bmax[i] = p[i]! + h;
      } else {
        this.bmin[i] = p[i]! - HALF_WIDTH;
        this.bmax[i] = p[i]! + HALF_WIDTH;
      }
    }
  }

  /**
   * Largest overlap-resolving position along `axis` for the current box, or NaN if the box
   * is free. `dir` is the sign of the motion that caused the overlap.
   */
  private collide(world: World, axis: number, dir: number): number {
    const bmin = this.bmin, bmax = this.bmax;
    const x0 = Math.floor(bmin[0]! + EPS), x1 = Math.floor(bmax[0]! - EPS);
    const y0 = Math.floor(bmin[1]! + EPS), y1 = Math.floor(bmax[1]! - EPS);
    const z0 = Math.floor(bmin[2]! + EPS), z1 = Math.floor(bmax[2]! - EPS);
    const w0 = Math.floor(bmin[3]! + EPS), w1 = Math.floor(bmax[3]! - EPS);
    let result = NaN;
    for (let y = y0; y <= y1; y++) {
      for (let w = w0; w <= w1; w++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const v = world.getBlock(x, y, z, w);
            const id = v & 0xfff;
            const c = v === VOID_VOXEL ? COLLISION_FULL : REG.collision[id]!;
            if (c === 0) continue;
            if (c === COLLISION_FULL) {
              result = this.resolve(axis, dir, x, y, z, w, 0, 0, 0, 0, 1, 1, 1, 1, result);
            } else if (c === COLLISION_SHAPE) {
              const sh = REG.shapes[REG.shapeIndex(v)]!;
              const b = sh.boxes;
              for (let k = 0; k < sh.boxCount; k++) {
                const o = k * 8;
                result = this.resolve(axis, dir, x, y, z, w, b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!, b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!, result);
              }
            }
          }
        }
      }
    }
    return result;
  }

  private resolve(
    axis: number,
    dir: number,
    x: number,
    y: number,
    z: number,
    w: number,
    ax: number,
    ay: number,
    az: number,
    aw: number,
    bx: number,
    by: number,
    bz: number,
    bw: number,
    prev: number,
  ): number {
    const mn0 = x + ax, mn1 = y + ay, mn2 = z + az, mn3 = w + aw;
    const mx0 = x + bx, mx1 = y + by, mx2 = z + bz, mx3 = w + bw;
    const b0 = this.bmin, b1 = this.bmax;
    if (b1[0]! <= mn0 + EPS || b0[0]! >= mx0 - EPS) return prev;
    if (b1[1]! <= mn1 + EPS || b0[1]! >= mx1 - EPS) return prev;
    if (b1[2]! <= mn2 + EPS || b0[2]! >= mx2 - EPS) return prev;
    if (b1[3]! <= mn3 + EPS || b0[3]! >= mx3 - EPS) return prev;
    const mn = axis === 0 ? mn0 : axis === 1 ? mn1 : axis === 2 ? mn2 : mn3;
    const mx = axis === 0 ? mx0 : axis === 1 ? mx1 : axis === 2 ? mx2 : mx3;
    // Target position of the box's reference point (pos) that removes the overlap.
    const ext = axis === this.up ? 0 : HALF_WIDTH;
    const h = axis === this.up ? this.height : HALF_WIDTH;
    let target: number;
    if (dir > 0) target = mn - h - EPS * 0.5;
    else target = mx + ext + EPS * 0.5;
    if (Number.isNaN(prev)) return target;
    return dir > 0 ? Math.min(prev, target) : Math.max(prev, target);
  }

  private overlaps(world: World, p: Float64Array, h: number): boolean {
    this.box(p, h);
    return !Number.isNaN(this.collide(world, 0, 1));
  }

  /** Move along one axis with collision. Returns true if blocked. */
  private moveAxis(world: World, axis: number, delta: number): boolean {
    if (delta === 0) return false;
    const p = this.pos;
    p[axis] = p[axis]! + delta;
    if (this.mode === 'spectator') return false;
    this.box(p, this.height);
    const r = this.collide(world, axis, delta > 0 ? 1 : -1);
    if (Number.isNaN(r)) return false;
    p[axis] = r;
    return true;
  }

  private hasSupport(world: World, p: Float64Array): boolean {
    const up = this.up;
    const y = p[up]!;
    p[up] = y - STEP;
    this.box(p, STEP);
    const hit = !Number.isNaN(this.collide(world, 0, 1));
    p[up] = y;
    return hit;
  }

  private sampleFluids(world: World): void {
    this.inWater = false;
    this.inLava = false;
    this.onClimbable = false;
    const p = this.pos;
    this.box(p, this.height);
    const bmin = this.bmin, bmax = this.bmax;
    for (let y = Math.floor(bmin[1]!); y <= Math.floor(bmax[1]! - EPS); y++)
      for (let w = Math.floor(bmin[3]!); w <= Math.floor(bmax[3]! - EPS); w++)
        for (let z = Math.floor(bmin[2]!); z <= Math.floor(bmax[2]! - EPS); z++)
          for (let x = Math.floor(bmin[0]!); x <= Math.floor(bmax[0]! - EPS); x++) {
            const v = world.getBlock(x, y, z, w);
            const id = v & 0xfff;
            const f = REG.fluid[id]!;
            if (f === FLUID_WATER) this.inWater = true;
            else if (f === FLUID_LAVA) this.inLava = true;
            if (REG.climbable[id]) this.onClimbable = true;
          }
    // Also count a ladder right next to us (touching) as climbable.
    if (!this.onClimbable) {
      for (let i = 0; i < 4; i++) {
        if (i === this.up) continue;
        this.bmin[i] = this.bmin[i]! - 0.05;
        this.bmax[i] = this.bmax[i]! + 0.05;
      }
      const x0 = Math.floor(this.bmin[0]!), x1 = Math.floor(this.bmax[0]!);
      const z0 = Math.floor(this.bmin[2]!), z1 = Math.floor(this.bmax[2]!);
      const w0 = Math.floor(this.bmin[3]!), w1 = Math.floor(this.bmax[3]!);
      const y0 = Math.floor(this.bmin[1]!), y1 = Math.floor(this.bmax[1]! - EPS);
      for (let y = y0; y <= y1 && !this.onClimbable; y++)
        for (let w = w0; w <= w1 && !this.onClimbable; w++)
          for (let z = z0; z <= z1 && !this.onClimbable; z++)
            for (let x = x0; x <= x1; x++) {
              if (REG.climbable[world.getBlock(x, y, z, w) & 0xfff]) {
                this.onClimbable = true;
                break;
              }
            }
    }
    const e = this.eye(this.saved);
    const ev = world.getBlock(Math.floor(e[0]!), Math.floor(e[1]!), Math.floor(e[2]!), Math.floor(e[3]!));
    const ef = REG.fluid[ev & 0xfff]!;
    this.eyeInWater = ef === FLUID_WATER;
    this.eyeInLava = ef === FLUID_LAVA;
  }

  update(world: World, input: MoveInput, dt: number): void {
    if (this.frozen) return;
    const up = this.up;
    const creative = this.mode !== 'survival';
    if (!creative) this.flying = false;
    if (this.mode === 'spectator') this.flying = true;
    this.sneaking = input.sneak && !this.flying;
    this.sprinting = input.sprint && input.forward > 0 && !this.sneaking;
    this.sampleFluids(world);

    // Wish direction in the horizontal frame (F forward, R right, H ana).
    const cam = this.cam;
    const wish = this.wish;
    for (let i = 0; i < 4; i++) wish[i] = cam.F[i]! * input.forward + cam.R[i]! * input.strafe + cam.H[i]! * input.ana;
    wish[up] = 0;
    let wl = Math.hypot(wish[0]!, wish[1]!, wish[2]!, wish[3]!);
    if (wl > 1) {
      for (let i = 0; i < 4; i++) wish[i] = wish[i]! / wl;
      wl = 1;
    }
    let speed = 4.317;
    if (this.flying) speed = this.sprinting ? 21.6 : 10.9;
    else if (this.sneaking) speed = 1.31;
    else if (this.sprinting) speed = 5.61;
    if (!this.flying && (this.inWater || this.inLava)) speed = this.inLava ? 1.2 : 2.2;

    // Horizontal velocity: accelerate toward the wish velocity.
    const accel = this.flying ? 12 : this.onGround ? 22 : this.inWater || this.inLava ? 8 : 5;
    const k = Math.min(1, accel * dt);
    for (let i = 0; i < 4; i++) {
      if (i === up) continue;
      const target = wish[i]! * speed;
      this.vel[i] = this.vel[i]! + (target - this.vel[i]!) * k;
    }

    // Vertical.
    let vy = this.vel[up]!;
    if (this.flying) {
      const vt = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
      vy += (vt * (this.sprinting ? 16 : 9) - vy) * Math.min(1, 10 * dt);
    } else if (this.inWater || this.inLava) {
      const drag = this.inLava ? 3.5 : 2.2;
      vy -= this.gravity * 0.18 * dt;
      if (input.jump) vy += (this.inLava ? 14 : 22) * dt;
      vy *= Math.exp(-drag * dt);
      if (input.jump && this.hitWall) vy = Math.max(vy, 3.5); // climb out of pools
    } else {
      vy -= this.gravity * dt;
      if (vy < -78) vy = -78;
      if (input.jump && this.onGround) vy = 9.0;
    }
    if (this.onClimbable && !this.flying) {
      if (vy < -3) vy = -3;
      if (this.sneaking && vy < 0) vy = 0;
      if (input.jump || (this.hitWall && wl > 0.1)) vy = Math.max(vy, 2.8);
    }
    this.vel[up] = vy;

    // Integrate with axis-separated collision in substeps (no tunnelling).
    let maxd = 0;
    for (let i = 0; i < 4; i++) maxd = Math.max(maxd, Math.abs(this.vel[i]! * dt));
    const steps = Math.max(1, Math.ceil(maxd / 0.4));
    const sdt = dt / steps;
    const wasGround = this.onGround;
    this.onGround = false;
    this.hitWall = false;
    for (let s = 0; s < steps; s++) {
      // Up axis first.
      const dy = this.vel[up]! * sdt;
      if (this.moveAxis(world, up, dy)) {
        if (dy < 0) this.onGround = true;
        this.vel[up] = 0;
      }
      for (let a = 0; a < 4; a++) {
        if (a === up) continue;
        let d = this.vel[a]! * sdt;
        if (d === 0) continue;
        // Sneaking: never walk off an edge.
        if (this.sneaking && (this.onGround || wasGround) && this.mode !== 'spectator') {
          const p = this.pos;
          const orig = p[a]!;
          let tries = 0;
          while (tries < 8) {
            p[a] = orig + d;
            const ok = this.hasSupport(world, p);
            p[a] = orig;
            if (ok) break;
            d *= 0.5;
            tries++;
          }
          if (tries >= 8) {
            d = 0;
            this.vel[a] = 0;
          }
        }
        const pre = this.pre;
        for (let i = 0; i < 4; i++) pre[i] = this.pos[i]!;
        if (this.moveAxis(world, a, d)) {
          // Step up small ledges (slabs/stairs) when grounded.
          if ((this.onGround || wasGround) && !this.flying && this.mode !== 'spectator' && this.tryStep(world, a, d, pre)) continue;
          this.vel[a] = 0;
          this.hitWall = true;
        }
      }
    }
    // Fall tracking (used by Phase 4 damage; exposed in F3).
    const yNow = this.pos[up]!;
    const grounded = this.onGround || this.inWater || this.flying || this.onClimbable;
    if (grounded) {
      if (!this.wasGrounded) this.lastFall = Math.max(0, this.fallStart - yNow); // landing
      this.fallStart = yNow;
    } else if (this.vel[up]! > 0) this.fallStart = yNow;
    this.wasGrounded = grounded;
  }

  /** Blocked horizontally: retry the move raised by STEP (slabs/stairs), then settle down. */
  private tryStep(world: World, axis: number, d: number, pre: Float64Array): boolean {
    const p = this.pos;
    const up = this.up;
    const clamped = this.saved;
    for (let i = 0; i < 4; i++) clamped[i] = p[i]!;
    for (let i = 0; i < 4; i++) p[i] = pre[i]!;
    p[up] = p[up]! + STEP;
    if (this.overlaps(world, p, this.height)) {
      for (let i = 0; i < 4; i++) p[i] = clamped[i]!;
      return false;
    }
    this.moveAxis(world, axis, d);
    if (Math.abs(p[axis]! - pre[axis]!) <= Math.abs(clamped[axis]! - pre[axis]!) + 1e-4) {
      for (let i = 0; i < 4; i++) p[i] = clamped[i]!;
      return false;
    }
    this.moveAxis(world, up, -(STEP + 0.01));
    return true;
  }
}
