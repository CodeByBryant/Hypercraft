// Dropped items: small 4D bodies (a 4-ball of radius R) that fall along the realm's gravity
// axis, rest on blocks, merge with identical neighbours, get pulled toward a nearby player and
// despawn after five minutes. Drawn as icon sprites of their slice: an item only shows when
// the view hyperplane passes through it, like everything else in the world.

import { REG, COLLISION_NONE } from '../../content/registry';
import { IREG } from '../../content/itemRegistry';
import type { Frame4 } from '../../math/frame';
import type { SpriteBatch } from '../../render/SpriteBatch';
import type { World } from '../../world/World';
import { canMerge, type ItemStack } from './ItemStack';

const R = 0.22;
const MAX = 512;
const DESPAWN = 300;
const PICKUP_RADIUS = 1.6;
const GRAB_RADIUS = 0.7;

export interface ItemEntity {
  pos: Float64Array;
  vel: Float64Array;
  stack: ItemStack;
  age: number;
  /** Seconds before it can be picked up (thrown items). */
  delay: number;
  phase: number;
}

export class ItemEntities {
  readonly list: ItemEntity[] = [];
  private mergeTimer = 0;
  /** Icon sheet cell origin (UV) per item id. */
  iconU: Float32Array | null = null;
  iconV: Float32Array | null = null;
  visible = 0;
  private readonly c = new Float64Array(4);

  spawn(x: number, y: number, z: number, w: number, stack: ItemStack, vel?: ArrayLike<number>, delay = 0.5): ItemEntity | null {
    if (stack.count <= 0) return null;
    if (this.list.length >= MAX) this.list.shift();
    const e: ItemEntity = {
      pos: Float64Array.from([x, y, z, w]),
      vel: vel ? Float64Array.from(vel) : Float64Array.from([(Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, 0]),
      stack,
      age: 0,
      delay,
      phase: Math.random() * 6.28,
    };
    this.list.push(e);
    return e;
  }

  /**
   * Physics and pickup. `collect` receives stacks that reach the player and returns the
   * number of items it could not take.
   */
  update(dt: number, world: World, up: number, gravity: number, player: Float64Array | null, playerHeight: number, collect: (s: ItemStack) => number): void {
    dt = Math.min(dt, 0.1);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      e.age += dt;
      e.delay -= dt;
      if (e.age > DESPAWN || e.stack.count <= 0) {
        list.splice(i, 1);
        continue;
      }
      const p = e.pos, v = e.vel;
      // Magnet toward the player's centre (4D distance), then pickup.
      let pulled = false;
      if (player && e.delay <= 0) {
        let d2 = 0;
        const c = this.c;
        for (let k = 0; k < 4; k++) {
          c[k] = player[k]! + (k === up ? playerHeight * 0.45 : 0) - p[k]!;
          d2 += c[k]! * c[k]!;
        }
        if (d2 < GRAB_RADIUS * GRAB_RADIUS) {
          const left = collect(e.stack);
          if (left <= 0) {
            list.splice(i, 1);
            continue;
          }
          e.stack.count = left;
        } else if (d2 < PICKUP_RADIUS * PICKUP_RADIUS) {
          const d = Math.sqrt(d2);
          for (let k = 0; k < 4; k++) v[k] = (c[k]! / d) * 8;
          pulled = true;
        }
      }
      if (!pulled) {
        v[up] = v[up]! - gravity * 0.75 * dt;
        if (v[up]! < -30) v[up] = -30;
      }
      // Move axis by axis; stop on solid blocks (the item is a point with radius R).
      for (let k = 0; k < 4; k++) {
        const step = v[k]! * dt;
        if (step === 0) continue;
        const old = p[k]!;
        p[k] = old + step;
        if (!pulled && this.solidAt(world, p, k, step > 0 ? R : -R)) {
          p[k] = old;
          if (k === up && v[k]! < 0) {
            // Landed: friction on the other axes.
            for (let j = 0; j < 4; j++) if (j !== up) v[j] = v[j]! * Math.max(0, 1 - dt * 8);
          }
          v[k] = 0;
        }
      }
      if (!pulled && this.solidAt(world, p, up, 0)) p[up] = Math.floor(p[up]!) + 1 + R; // pushed out of a block
    }
    // Merge identical stacks lying close together (every half second).
    this.mergeTimer -= dt;
    if (this.mergeTimer <= 0) {
      this.mergeTimer = 0.5;
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        const max = IREG.maxStack[a.stack.id]!;
        if (a.stack.count >= max) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j]!;
          if (!canMerge(a.stack, b.stack)) continue;
          let d2 = 0;
          for (let k = 0; k < 4; k++) d2 += (a.pos[k]! - b.pos[k]!) ** 2;
          if (d2 > 1) continue;
          const n = Math.min(max - a.stack.count, b.stack.count);
          a.stack.count += n;
          b.stack.count -= n;
          a.age = Math.min(a.age, b.age);
        }
      }
    }
  }

  private solidAt(world: World, p: Float64Array, axis: number, off: number): boolean {
    const x = Math.floor(p[0]! + (axis === 0 ? off : 0));
    const y = Math.floor(p[1]! + (axis === 1 ? off : 0));
    const z = Math.floor(p[2]! + (axis === 2 ? off : 0));
    const w = Math.floor(p[3]! + (axis === 3 ? off : 0));
    const v = world.getBlock(x, y, z, w) & 0xfff;
    return REG.collision[v] !== COLLISION_NONE;
  }

  /** Emit sprites for items whose 4-ball crosses the view hyperplane. */
  draw(out: SpriteBatch, eye: Float64Array, cam: Frame4, world: World): void {
    const iu = this.iconU, iv = this.iconV;
    if (!iu || !iv) return;
    const H = cam.hidden, Rt = cam.right, U = cam.up, F = cam.fwd;
    let vis = 0;
    for (const e of this.list) {
      const p = e.pos;
      const bob = 0.08 * Math.sin(e.age * 2.5 + e.phase);
      const rx = p[0]! - eye[0]!, ry = p[1]! + R + bob - eye[1]!, rz = p[2]! - eye[2]!, rw = p[3]! - eye[3]!;
      const d = rx * H[0]! + ry * H[1]! + rz * H[2]! + rw * H[3]!;
      if (d >= R || d <= -R) continue;
      const rr = Math.sqrt(R * R - d * d);
      const x = rx * Rt[0]! + ry * Rt[1]! + rz * Rt[2]! + rw * Rt[3]!;
      const y = rx * U[0]! + ry * U[1]! + rz * U[2]! + rw * U[3]!;
      const z = rx * F[0]! + ry * F[1]! + rz * F[2]! + rw * F[3]!;
      if (z < 0.1) continue;
      const l = world.getLight(Math.floor(p[0]!), Math.floor(p[1]! + 0.3), Math.floor(p[2]!), Math.floor(p[3]!));
      const bright = Math.max(0.25, (l >> 4) / 15, (l & 15) / 15);
      out.addItem(x, y, z, rr, bright, iu[e.stack.id]!, iv[e.stack.id]!);
      vis++;
    }
    this.visible = vis;
  }

  clear(): void {
    this.list.length = 0;
  }
}
