// Boss fights (Phase 6: the Magma Regent). The Regent's movement is its 'regent' AI in
// MobManager (it hovers near you, follows you through W and heals if you flee its arena).
// This module runs the attacks that change the world:
//
//  * Lava pillars along W: a line of pillars spaced 3 blocks apart along world W through your
//    position. In phase 2 a second line runs along your slice's right axis (a cross). Each
//    pillar is announced 1.5 s before it erupts (R2): flame particles at its base, a mark on the
//    hidden-axis radar and a warning naming how many are in your slice and how many kata/ana.
//    The pillar that can hit you is always the one in your slice, so stepping kata or ana does
//    not dodge it; sidestepping inside the slice does. Pillars are erupting-magma columns that
//    burn whatever stands in them for 3 s, then sink back.
//  * Fire-charge volleys (three at once), faster in phase 2.
//  * Phase 2 (at half health): a roar, three Cinder Hounds, and quicker attacks.

import { REG, COLLISION_NONE } from '../content/registry';
import { IREG } from '../content/itemRegistry';
import { MOB_REG } from '../content/mobRegistry';
import type { Mob, MobManager } from './mobs/MobManager';
import type { World } from '../world/World';
import { VOID_VOXEL } from '../world/constants';

/** Seconds of warning before a pillar erupts, and how long it burns. */
export const PILLAR_WARNING = 1.5;
export const PILLAR_BURN = 3;
const PILLAR_HEIGHT = 7;

export interface Pillar {
  x: number;
  /** Lowest cell of the column (one above the floor). */
  y: number;
  z: number;
  w: number;
  /** Seconds until it erupts (<= 0: erupted). */
  erupt: number;
  /** Seconds it keeps burning after erupting. */
  burn: number;
  /** Cells turned into magma (restored to air when it sinks). */
  cells: number[][];
}

export interface BossHost {
  world: World;
  mobs: MobManager;
  playerPos: Float64Array;
  playerRight: Float64Array;
  playerHidden: Float64Array;
  playerTargetable: () => boolean;
  shoot(from: Float64Array, vel: Float64Array, damage: number, item: number, byPlayer: boolean): void;
  flame(x: number, y: number, z: number, w: number): void;
  message(text: string): void;
}

/**
 * Pillar positions for one eruption: along world W through `p` (k = -3..3, 3 blocks apart),
 * plus (phase 2) along `right` (the player's slice). Pure, for tests.
 */
export function pillarLine(p: ArrayLike<number>, right: ArrayLike<number>, phase: number): number[][] {
  const out: number[][] = [];
  for (let k = -3; k <= 3; k++) out.push([Math.floor(p[0]!), Math.floor(p[2]!), Math.floor(p[3]!) + k * 3]);
  if (phase >= 2)
    for (const k of [-6, -3, 3, 6]) out.push([Math.floor(p[0]! + right[0]! * k), Math.floor(p[2]! + right[2]! * k), Math.floor(p[3]! + right[3]! * k)]);
  return out;
}

interface Timers {
  pillar: number;
  volley: number;
}

export class BossDirector {
  readonly pillars: Pillar[] = [];
  /** The boss the HUD shows (nearest within 48 blocks), or null. */
  boss: Mob | null = null;
  /** R2 warning line for pending pillars ('' when none). */
  warning = '';
  private readonly timers = new Map<number, Timers>();
  private flameT = 0;

  constructor(private readonly host: BossHost) {}

  update(dt: number): void {
    const h = this.host;
    const p = h.playerPos;
    let best: Mob | null = null, bd = 48;
    for (const m of h.mobs.list) {
      if (!m.def.boss) continue;
      const d = Math.hypot(m.pos[0]! - p[0]!, m.pos[1]! - p[1]!, m.pos[2]! - p[2]!, m.pos[3]! - p[3]!);
      if (d < bd) {
        bd = d;
        best = m;
      }
      this.fight(m, dt);
    }
    this.boss = best;
    this.updatePillars(dt);
  }

  private fight(m: Mob, dt: number): void {
    const h = this.host;
    let t = this.timers.get(m.id);
    if (!t) {
      t = { pillar: 4, volley: 2.5 };
      this.timers.set(m.id, t);
    }
    if (m.phase === 1 && m.health <= m.def.health * 0.5) {
      m.phase = 2;
      h.message(`${m.def.displayName} erupts in fury!`);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const hound = h.mobs.spawn('cinder_hound', m.pos[0]! + Math.cos(a) * 3, m.pos[1]! - 1, m.pos[2]! + Math.sin(a) * 3, m.pos[3]!);
        if (hound) hound.vel[1] = 3;
      }
    }
    if (m.mode !== 'chase' || !h.playerTargetable()) return;
    t.pillar -= dt;
    t.volley -= dt;
    if (t.pillar <= 0) {
      t.pillar = m.phase === 2 ? 5 : 7.5;
      this.summonPillars(m);
    }
    if (t.volley <= 0) {
      t.volley = m.phase === 2 ? 2.2 : 3.5;
      this.volley(m);
    }
  }

  /** Three fire charges at the player, fanned a little. */
  private volley(m: Mob): void {
    const h = this.host, p = h.playerPos;
    const pr = MOB_REG.get('magma_drake').def.projectile!;
    const from = Float64Array.from([m.pos[0]!, m.pos[1]! + m.height * 0.6, m.pos[2]!, m.pos[3]!]);
    for (let k = -1; k <= 1; k++) {
      const v = new Float64Array(4);
      let l = 0;
      for (let i = 0; i < 4; i++) {
        v[i] = p[i]! + (i === 1 ? 1 : 0) - from[i]! + h.playerRight[i]! * k * 1.2;
        l += v[i]! * v[i]!;
      }
      l = Math.sqrt(l) || 1;
      for (let i = 0; i < 4; i++) v[i] = (v[i]! / l) * 13;
      h.shoot(from, v, pr.damage, IREG.id(pr.item), false);
    }
  }

  private summonPillars(m: Mob): void {
    const h = this.host, p = h.playerPos, world = h.world;
    for (const [x, z, w] of pillarLine(p, h.playerRight, m.phase)) {
      // Stand the pillar on the floor under (or near) the player's height.
      let y = -1;
      for (let yy = Math.floor(p[1]! + 3); yy > Math.floor(p[1]!) - 12 && yy > 1; yy--) {
        const v = world.getBlock(x!, yy - 1, z!, w!);
        const a = world.getBlock(x!, yy, z!, w!);
        if (v === VOID_VOXEL || a === VOID_VOXEL) break;
        if (REG.solid[v & 0xfff] && REG.collision[a & 0xfff] === COLLISION_NONE) {
          y = yy;
          break;
        }
      }
      if (y < 0) continue;
      this.pillars.push({ x: x!, y, z: z!, w: w!, erupt: PILLAR_WARNING, burn: PILLAR_BURN, cells: [] });
    }
  }

  private updatePillars(dt: number): void {
    const h = this.host, world = h.world;
    const magma = REG.id('erupting_magma');
    this.flameT -= dt;
    const flames = this.flameT <= 0;
    if (flames) this.flameT = 0.12;
    let pending = 0, inSlice = 0;
    const p = h.playerPos, H = h.playerHidden;
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pl = this.pillars[i]!;
      if (pl.erupt > 0) {
        pl.erupt -= dt;
        pending++;
        const dh = (pl.x + 0.5 - p[0]!) * H[0]! + (pl.z + 0.5 - p[2]!) * H[2]! + (pl.w + 0.5 - p[3]!) * H[3]!;
        if (Math.abs(dh) < 0.75) inSlice++;
        if (flames) h.flame(pl.x + 0.5, pl.y + 0.1, pl.z + 0.5, pl.w + 0.5);
        if (pl.erupt <= 0) {
          for (let k = 0; k < PILLAR_HEIGHT; k++) {
            const v = world.getBlock(pl.x, pl.y + k, pl.z, pl.w);
            if (v === VOID_VOXEL || (v !== 0 && !REG.replaceable[v & 0xfff])) break;
            world.setBlock(pl.x, pl.y + k, pl.z, pl.w, magma);
            pl.cells.push([pl.x, pl.y + k, pl.z, pl.w]);
          }
        }
        continue;
      }
      pl.burn -= dt;
      if (pl.burn > 0) continue;
      for (const c of pl.cells) if ((world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === magma) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
      this.pillars.splice(i, 1);
    }
    this.warning = pending ? `⚠ Lava pillars erupting: ${inSlice} in your slice, ${pending - inSlice} kata/ana along W · sidestep in your slice!` : '';
  }

  /** Remove every pillar at once (the boss died, or the player left). */
  clear(): void {
    const world = this.host.world, magma = REG.id('erupting_magma');
    for (const pl of this.pillars)
      for (const c of pl.cells) if ((world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === magma) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
    this.pillars.length = 0;
    this.warning = '';
  }
}
