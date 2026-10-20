// Sound pulses (Phase 9.5): expanding 4D shells. A Resonance Golem or the Resonance Titan sings; a
// pulse spreads from its chest at a few blocks a second as a 4-sphere, so in your slice you see a
// sphere growing around it (the host draws particles on that cross-section). When the shell passes
// you it hurts, once, unless stone stands between you and its source, or you cancelled it first by
// sounding the matching tone (a Tuning Fork of the pulse's tone).
//
// Pure logic with a small host; the world is only used to look for cover.

import { REG } from '../../content/registry';
import type { World } from '../../world/World';

export interface Pulse {
  /** Where it was sung (its centre, in 4D). */
  c: Float64Array;
  /** Radius now, and its growth in blocks per second, and where it fades. */
  r: number;
  speed: number;
  reach: number;
  /** Thickness of the shell: you are hit while |distance - r| is under half of it (plus your size). */
  thick: number;
  /** 0..3: which tone it is (colour, and which fork cancels it). */
  tone: number;
  damage: number;
  /** Who sang it ('resonance_golem', 'resonance_titan'). */
  owner: string;
  /** It has passed you (hit or blocked): it still spreads but cannot hurt again. */
  spent: boolean;
  /** Yours (a Tuning Fork's ring): drawn, but it hurts nobody and cannot be cancelled. */
  friendly: boolean;
  age: number;
}

export interface PulseHost {
  world: World;
  /** The player's feet and height (the shell is tested against their centre). */
  playerPos: Float64Array;
  playerHeight: number;
  /** The shell struck the player. */
  hurt(amount: number, from: Float64Array, owner: string): void;
}

export interface PulseOpts {
  friendly?: boolean;
  speed?: number;
  reach?: number;
  thick?: number;
}

const DEFAULTS = { speed: 8, reach: 26, thick: 1.4 };

export class Pulses {
  readonly list: Pulse[] = [];
  private readonly tmp = new Float64Array(4);

  /** Sing a pulse from `from` (4D). Returns it. */
  spawn(from: ArrayLike<number>, tone: number, damage: number, owner: string, o: PulseOpts = {}): Pulse {
    if (this.list.length > 24) this.list.shift();
    const p: Pulse = { c: Float64Array.from(from), r: 0.5, speed: o.speed ?? DEFAULTS.speed, reach: o.reach ?? DEFAULTS.reach, thick: o.thick ?? DEFAULTS.thick, tone, damage, owner, spent: o.friendly === true, friendly: o.friendly === true, age: 0 };
    this.list.push(p);
    return p;
  }

  /** The player's centre (waist). */
  private centre(h: PulseHost): Float64Array {
    const q = this.tmp, p = h.playerPos;
    q[0] = p[0]!;
    q[1] = p[1]! + h.playerHeight * 0.5;
    q[2] = p[2]!;
    q[3] = p[3]!;
    return q;
  }

  /** Is solid cover between the source and the target (sampled every block, not counting the first)? */
  covered(world: World, c: ArrayLike<number>, q: ArrayLike<number>): boolean {
    const d = Math.hypot(q[0]! - c[0]!, q[1]! - c[1]!, q[2]! - c[2]!, q[3]! - c[3]!);
    const n = Math.floor(d);
    for (let i = 2; i < n; i++) {
      const f = i / d;
      const v = world.getBlock(Math.floor(c[0]! + (q[0]! - c[0]!) * f), Math.floor(c[1]! + (q[1]! - c[1]!) * f), Math.floor(c[2]! + (q[2]! - c[2]!) * f), Math.floor(c[3]! + (q[3]! - c[3]!) * f)) & 0xfff;
      if (v !== 0 && REG.solid[v] && REG.opaque[v]) return true;
    }
    return false;
  }

  update(dt: number, h: PulseHost): void {
    const q = this.centre(h);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      p.r += p.speed * dt;
      if (p.r > p.reach) {
        this.list.splice(i, 1);
        continue;
      }
      if (p.spent) continue;
      const d = Math.hypot(q[0]! - p.c[0]!, q[1]! - p.c[1]!, q[2]! - p.c[2]!, q[3]! - p.c[3]!);
      // Passed: the shell is now beyond you.
      if (p.r > d + p.thick) {
        p.spent = true;
        continue;
      }
      if (Math.abs(d - p.r) > p.thick * 0.5 + 0.35) continue;
      p.spent = true;
      if (this.covered(h.world, p.c, q)) continue;
      h.hurt(p.damage, p.c, p.owner);
    }
  }

  /**
   * Sound a tone near `at`: every pulse of that tone still on its way to `at` within `range` is
   * cancelled. Returns the pulses cancelled.
   */
  cancel(tone: number, at: ArrayLike<number>, range = 30): Pulse[] {
    const out: Pulse[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      if (p.tone !== tone || p.spent || p.friendly) continue;
      const d = Math.hypot(at[0]! - p.c[0]!, at[1]! - p.c[1]!, at[2]! - p.c[2]!, at[3]! - p.c[3]!);
      if (d > range || p.r > d + p.thick) continue;
      out.push(p);
      this.list.splice(i, 1);
    }
    return out;
  }

  /** Is there an unspent pulse of any tone but `tone` on its way to `at`? (An off-key answer.) */
  incoming(at: ArrayLike<number>, range = 30): Pulse[] {
    return this.list.filter((p) => !p.spent && !p.friendly && Math.hypot(at[0]! - p.c[0]!, at[1]! - p.c[1]!, at[2]! - p.c[2]!, at[3]! - p.c[3]!) <= range && p.r <= Math.hypot(at[0]! - p.c[0]!, at[1]! - p.c[1]!, at[2]! - p.c[2]!, at[3]! - p.c[3]!) + p.thick);
  }

  clear(): void {
    this.list.length = 0;
  }
}
