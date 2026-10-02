// Experience orbs (Phase 7): little glowing 4-balls that pop out of slain mobs, mined ores and
// furnaces, fall, rest on blocks and drift to a nearby player (along all four axes, so an orb
// kata of your slice swims into view as it comes to you). Drawn as glowing sprites where the
// view hyperplane cuts them, like dropped items.

import { REG, COLLISION_NONE } from '../content/registry';
import type { Frame4 } from '../math/frame';
import { SPRITE_GLOW, type SpriteBatch } from '../render/SpriteBatch';
import type { World } from '../world/World';
import { orbSizes } from './Survival';

const R = 0.16;
const MAX = 256;
const DESPAWN = 300;
const ATTRACT = 7.5;
const GRAB = 1.0;

export interface XpOrb {
  pos: Float64Array;
  vel: Float64Array;
  value: number;
  age: number;
  phase: number;
}

export class XpOrbs {
  readonly list: XpOrb[] = [];
  private readonly c = new Float64Array(4);

  /** Spill `points` of experience at a point as several orbs. */
  spawn(x: number, y: number, z: number, w: number, points: number): void {
    for (const v of orbSizes(points)) {
      if (this.list.length >= MAX) {
        // Merge into the oldest orb instead of dropping experience.
        this.list[0]!.value += v;
        continue;
      }
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 2;
      this.list.push({
        pos: Float64Array.from([x, y, z, w]),
        vel: Float64Array.from([Math.cos(a) * Math.cos(b) * 1.6, 3 + Math.random() * 1.5, Math.sin(a) * Math.cos(b) * 1.6, Math.sin(b) * 1.2]),
        value: v,
        age: 0,
        phase: Math.random() * 6.28,
      });
    }
  }

  /**
   * Physics and pickup. `collect` receives the points of each orb that reaches the player.
   * Returns the number of orbs collected.
   */
  update(dt: number, world: World, up: number, player: Float64Array | null, playerHeight: number, collect: (points: number) => void): number {
    dt = Math.min(dt, 0.1);
    let got = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]!;
      o.age += dt;
      if (o.age > DESPAWN) {
        this.list.splice(i, 1);
        continue;
      }
      const p = o.pos, v = o.vel;
      let pulled = false;
      if (player && o.age > 0.4) {
        let d2 = 0;
        const c = this.c;
        for (let k = 0; k < 4; k++) {
          c[k] = player[k]! + (k === up ? playerHeight * 0.4 : 0) - p[k]!;
          d2 += c[k]! * c[k]!;
        }
        if (d2 < GRAB * GRAB) {
          collect(o.value);
          got++;
          this.list.splice(i, 1);
          continue;
        }
        if (d2 < ATTRACT * ATTRACT) {
          const d = Math.sqrt(d2);
          const s = 3 + (1 - d / ATTRACT) * 9;
          for (let k = 0; k < 4; k++) v[k] = v[k]! + ((c[k]! / d) * s - v[k]!) * Math.min(1, dt * 6);
          pulled = true;
        }
      }
      if (!pulled) {
        v[up] = v[up]! - 14 * dt;
        if (v[up]! < -20) v[up] = -20;
      }
      for (let k = 0; k < 4; k++) {
        const step = v[k]! * dt;
        if (step === 0) continue;
        const old = p[k]!;
        p[k] = old + step;
        if (!pulled && this.solidAt(world, p)) {
          p[k] = old;
          if (k === up && v[k]! < 0) for (let j = 0; j < 4; j++) if (j !== up) v[j] = v[j]! * Math.max(0, 1 - dt * 6);
          v[k] = 0;
        }
      }
    }
    return got;
  }

  private solidAt(world: World, p: Float64Array): boolean {
    const v = world.getBlock(Math.floor(p[0]!), Math.floor(p[1]! - R), Math.floor(p[2]!), Math.floor(p[3]!)) & 0xfff;
    return REG.collision[v] !== COLLISION_NONE;
  }

  /** Glowing sprites for orbs the view hyperplane passes through. */
  draw(out: SpriteBatch, eye: Float64Array, cam: Frame4): void {
    const H = cam.hidden, Rt = cam.right, U = cam.up, F = cam.fwd;
    for (const o of this.list) {
      const size = R * (0.7 + Math.min(1, Math.log2(1 + o.value) / 8) * 0.8);
      const p = o.pos;
      const bob = 0.06 * Math.sin(o.age * 4 + o.phase);
      const rx = p[0]! - eye[0]!, ry = p[1]! + bob - eye[1]!, rz = p[2]! - eye[2]!, rw = p[3]! - eye[3]!;
      const d = rx * H[0]! + ry * H[1]! + rz * H[2]! + rw * H[3]!;
      if (d >= size || d <= -size) continue;
      const rr = Math.sqrt(size * size - d * d);
      const x = rx * Rt[0]! + ry * Rt[1]! + rz * Rt[2]! + rw * Rt[3]!;
      const y = rx * U[0]! + ry * U[1]! + rz * U[2]! + rw * U[3]!;
      const z = rx * F[0]! + ry * F[1]! + rz * F[2]! + rw * F[3]!;
      if (z < 0.1) continue;
      const t = 0.5 + 0.5 * Math.sin(o.age * 6 + o.phase);
      out.add(x, y, z, rr * 1.6, 0.55 + 0.35 * t, 1, 0.15 + 0.1 * t, 0.95, SPRITE_GLOW, 0);
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}
