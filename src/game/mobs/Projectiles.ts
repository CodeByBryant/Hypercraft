// Arrows and other projectiles: 4D points with gravity that stick into blocks, hit mobs (when
// shot by the player) or the player (when shot by mobs). Drawn like dropped items: the slice
// of a small 4-ball with the item's icon.

import { REG, COLLISION_NONE } from '../../content/registry';
import type { Frame4 } from '../../math/frame';
import type { SpriteBatch } from '../../render/SpriteBatch';
import type { World } from '../../world/World';
import type { Mob, MobManager } from './MobManager';
import type { ItemStack } from '../items/ItemStack';

const R = 0.14;

export interface Projectile {
  pos: Float64Array;
  vel: Float64Array;
  damage: number;
  item: number;
  byPlayer: boolean;
  age: number;
  stuck: boolean;
  /** Flame: sets what it hits on fire. */
  fire?: boolean;
  /** Punch: extra knockback level. */
  knock?: number;
  /** Thrown things that burst on impact (splash potions, bottles o' enchanting). */
  burst?: boolean;
  /** Damage multiplier on the undead (silver arrows). */
  undead?: number;
  /** Seconds a hit mob glows (spectral arrows: drawn through walls and off the slice). */
  glow?: number;
  /** Downward acceleration (default 20; 0: flies straight). */
  gravity?: number;
  /** Hyper-Chakram: flies out for `out` seconds, then back to the thrower, cutting every mob
   * near its path (kata and ana of it too, within `hidden`); never sticks. */
  boomerang?: { out: number; back: boolean; hidden: number; hit: Set<Mob> };
  /** The thrown stack itself (chakram, dagger): returned or dropped, wear and all. */
  stack?: ItemStack;
}

export interface ProjectileOpts {
  fire?: boolean;
  knock?: number;
  burst?: boolean;
  undead?: number;
  glow?: number;
  gravity?: number;
  boomerang?: { out: number; hidden: number };
  stack?: ItemStack;
}

export interface ProjectileHost {
  playerPos: Float64Array;
  playerHeight: number;
  hurtPlayer(amount: number, from: Float64Array, cause: string): void;
  /** A stuck player arrow was walked over; returns true if it was collected. */
  collect(item: number): boolean;
  /** A bursting projectile hit something (splash potion, experience bottle). */
  impact?(item: number, pos: Float64Array): void;
  /** A chakram came back: into the inventory (or at your feet). */
  returnStack?(st: ItemStack): void;
  /** A thrown dagger fell after a hit: drop it there. */
  dropStack?(pos: Float64Array, st: ItemStack): void;
  eye: Float64Array;
  hidden: Float64Array;
}

export class Projectiles {
  readonly list: Projectile[] = [];
  private readonly prev = new Float64Array(4);

  spawn(from: ArrayLike<number>, vel: ArrayLike<number>, damage: number, item: number, byPlayer: boolean, opts?: ProjectileOpts): void {
    if (this.list.length > 128) this.list.shift();
    this.list.push({
      pos: Float64Array.from(from),
      vel: Float64Array.from(vel),
      damage,
      item,
      byPlayer,
      age: 0,
      stuck: false,
      fire: opts?.fire,
      knock: opts?.knock,
      burst: opts?.burst,
      undead: opts?.undead,
      glow: opts?.glow,
      gravity: opts?.gravity,
      boomerang: opts?.boomerang ? { out: opts.boomerang.out, back: false, hidden: opts.boomerang.hidden, hit: new Set() } : undefined,
      stack: opts?.stack,
    });
  }

  /** Hyper-Chakram flight: out, then home on the thrower; cuts mobs near its path. */
  private boomerang(a: Projectile, dt: number, world: World, mobs: MobManager, h: ProjectileHost): boolean {
    const b = a.boomerang!;
    const p = h.playerPos;
    if (!b.back && a.age > b.out) b.back = true;
    if (b.back) {
      let d2 = 0;
      const to = this.prev;
      for (let k = 0; k < 4; k++) {
        to[k] = p[k]! + (k === 1 ? h.playerHeight * 0.6 : 0) - a.pos[k]!;
        d2 += to[k]! * to[k]!;
      }
      const d = Math.sqrt(d2);
      if (d < 1.2 || a.age > 8) {
        if (a.stack) h.returnStack?.(a.stack);
        return true;
      }
      const sp = Math.hypot(a.vel[0]!, a.vel[1]!, a.vel[2]!, a.vel[3]!) || 20;
      for (let k = 0; k < 4; k++) a.vel[k] = (to[k]! / d) * Math.max(sp, 20);
    }
    for (let k = 0; k < 4; k++) a.pos[k] = a.pos[k]! + a.vel[k]! * dt;
    // Going out, a wall turns it back; coming back, it passes through.
    if (!b.back) {
      const v = world.getBlock(Math.floor(a.pos[0]!), Math.floor(a.pos[1]!), Math.floor(a.pos[2]!), Math.floor(a.pos[3]!)) & 0xfff;
      if (REG.collision[v] !== COLLISION_NONE) b.back = true;
    }
    // Every mob near the path, kata and ana of it within `hidden`, once per throw.
    const H = h.hidden;
    for (const m of mobs.list) {
      if (b.hit.has(m) || m.def.profession) continue;
      let dh = 0, d2 = 0;
      for (let k = 0; k < 4; k++) {
        const dk = a.pos[k]! - m.pos[k]! - (k === 1 ? m.height * 0.5 : 0);
        dh += dk * H[k]!;
        d2 += dk * dk;
      }
      const inSlice = d2 - dh * dh;
      const r = m.width + 0.6;
      if (inSlice > r * r || Math.abs(dh) > b.hidden + m.width) continue;
      b.hit.add(m);
      mobs.damage(m, a.damage, a.pos, null, h.hidden, true, 1);
    }
    return false;
  }

  update(dt: number, world: World, mobs: MobManager, h: ProjectileHost): void {
    dt = Math.min(dt, 0.1);
    const p = h.playerPos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i]!;
      a.age += dt;
      if (a.stuck) {
        if (a.byPlayer && a.age > 0.5) {
          let d2 = 0;
          for (let k = 0; k < 4; k++) d2 += (a.pos[k]! - p[k]! - (k === 1 ? 0.8 : 0)) ** 2;
          if (d2 < 1.6 && h.collect(a.item)) {
            this.list.splice(i, 1);
            continue;
          }
        }
        if (a.age > 30) this.list.splice(i, 1);
        continue;
      }
      if (a.boomerang) {
        if (this.boomerang(a, dt, world, mobs, h)) this.list.splice(i, 1);
        continue;
      }
      if (a.age > 10) {
        this.list.splice(i, 1);
        continue;
      }
      a.vel[1] = a.vel[1]! - (a.gravity ?? 20) * dt;
      const speed = Math.hypot(a.vel[0]!, a.vel[1]!, a.vel[2]!, a.vel[3]!);
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
      let removed = false;
      for (let s = 0; s < steps && !removed; s++) {
        for (let k = 0; k < 4; k++) {
          this.prev[k] = a.pos[k]!;
          a.pos[k] = a.pos[k]! + (a.vel[k]! * dt) / steps;
        }
        const v = world.getBlock(Math.floor(a.pos[0]!), Math.floor(a.pos[1]!), Math.floor(a.pos[2]!), Math.floor(a.pos[3]!)) & 0xfff;
        if (REG.collision[v] !== COLLISION_NONE) {
          for (let k = 0; k < 4; k++) a.pos[k] = this.prev[k]!;
          if (a.burst) {
            h.impact?.(a.item, a.pos);
            this.list.splice(i, 1);
            removed = true;
            break;
          }
          a.stuck = true;
          a.age = 0;
          break;
        }
        if (a.burst && a.byPlayer && this.hitMob(mobs, a.pos)) {
          h.impact?.(a.item, a.pos);
          this.list.splice(i, 1);
          removed = true;
          break;
        }
        if (a.byPlayer) {
          const m = this.hitMob(mobs, a.pos);
          if (m) {
            const dmg = a.damage * (a.undead && m.def.undead ? a.undead : 1);
            if (mobs.damage(m, dmg, this.prev, h.eye, h.hidden, true, 1 + (a.knock ?? 0)) && a.fire && !m.def.fireproof) m.burning = Math.max(m.burning, 5);
            if (a.glow) m.glowing = Math.max(m.glowing, a.glow);
            // A thrown dagger falls where it hit.
            if (a.stack) h.dropStack?.(a.pos, a.stack);
            this.list.splice(i, 1);
            removed = true;
          }
        } else {
          const dx = a.pos[0]! - p[0]!, dy = a.pos[1]! - p[1]!, dz = a.pos[2]! - p[2]!, dw = a.pos[3]! - p[3]!;
          if (Math.abs(dx) < 0.4 && Math.abs(dz) < 0.4 && Math.abs(dw) < 0.4 && dy > 0 && dy < h.playerHeight) {
            h.hurtPlayer(a.damage, this.prev, 'Arrow');
            this.list.splice(i, 1);
            removed = true;
          }
        }
      }
    }
  }

  private hitMob(mobs: MobManager, q: Float64Array): Mob | null {
    for (const m of mobs.list) {
      const hw = m.width + R, top = m.height;
      const dx = q[0]! - m.pos[0]!, dy = q[1]! - m.pos[1]!, dz = q[2]! - m.pos[2]!, dw = q[3]! - m.pos[3]!;
      if (Math.abs(dx) < hw && Math.abs(dz) < hw && Math.abs(dw) < hw && dy > -R && dy < top + R) return m;
    }
    return null;
  }

  draw(out: SpriteBatch, eye: Float64Array, cam: Frame4, iconU: Float32Array | null, iconV: Float32Array | null): void {
    if (!iconU || !iconV) return;
    const H = cam.hidden, Rt = cam.right, U = cam.up, F = cam.fwd;
    for (const a of this.list) {
      const rx = a.pos[0]! - eye[0]!, ry = a.pos[1]! - eye[1]!, rz = a.pos[2]! - eye[2]!, rw = a.pos[3]! - eye[3]!;
      const d = rx * H[0]! + ry * H[1]! + rz * H[2]! + rw * H[3]!;
      if (d >= R || d <= -R) continue;
      const x = rx * Rt[0]! + ry * Rt[1]! + rz * Rt[2]! + rw * Rt[3]!;
      const y = rx * U[0]! + ry * U[1]! + rz * U[2]! + rw * U[3]!;
      const z = rx * F[0]! + ry * F[1]! + rz * F[2]! + rw * F[3]!;
      if (z < 0.1) continue;
      out.addItem(x, y, z, Math.sqrt(R * R - d * d) * 1.6, 1, iconU[a.item]!, iconV[a.item]!);
    }
  }
}
