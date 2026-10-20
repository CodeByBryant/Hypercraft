// The Mirror Twin (Phase 9): the boss of the Mirror Palace. Its movement is the 'twin' AI in
// MobManager (it stands where you would stand if the palace were a mirror: the point reflection of
// you through the altar); this module runs everything around it:
//
//  * Waking: hold a Hand Mirror up to the Mirror Altar. Once; a defeated world never sees it again
//    (SavedState.data.bossFights.mirror).
//  * The reflection: it wears your armour and what you hold (rebuilt every frame from your pose, in
//    silver), and copies what you DO a moment late: a swing, a shot, a raised shield. Its copy of a
//    swing only lands when you are within reach of it, so you fight it at the altar, where the two
//    of you meet; its shield takes three quarters off your hits, so do not raise yours.
//  * Phase II (below 66%): two Mirror Stalkers join. Phase III (below 33%): it copies faster and
//    mirror beams come down along W, announced on the radar first, like the Sovereign's lances.
//  * Arena rules: while it lives nothing within 28 blocks of the altar may be broken or placed.
//  * Defeat: its core drops (mob drops), the world remembers.

import { IREG } from '../content/itemRegistry';
import { REG } from '../content/registry';
import { TWIN_PALETTE } from '../content/mirrorMobs';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';
import type { Mob, MobManager } from './mobs/MobManager';
import type { ItemStack } from './items/ItemStack';
import { dollParts, newDollState, type DollState } from './PlayerModel';
import { pillarLine } from './Boss';
import type { BossFight, Mark, PlayerAction } from './BossFight';
import { LanceField } from './Lances';
import { phaseFor } from './VoidBoss';

export const TWIN = 'mirror_twin';
/** Radius of the arena around the altar (protected while the Twin lives). */
export const MIRROR_ARENA_R = 28;
/** Seconds the Twin is behind you, by phase. */
export const COPY_DELAY = [0, 0.7, 0.5, 0.3] as const;
const BEAM_HEIGHT = 6;

export interface MirrorBossHost {
  world: World;
  mobs: MobManager;
  playerPos: Float64Array;
  playerRight: Float64Array;
  playerHidden: Float64Array;
  playerTargetable: () => boolean;
  /** 0 peaceful .. 3 hard. */
  difficulty: () => number;
  shoot(from: Float64Array, vel: Float64Array, damage: number, item: number, byPlayer: boolean): void;
  glow(x: number, y: number, z: number, w: number, color: string, n?: number): void;
  message(text: string): void;
  dropItem(x: number, y: number, z: number, w: number, st: ItemStack): void;
  /** Your pose and colours right now (what the Twin wears). */
  doll(): DollState;
  /** The Twin strikes you (shields and armour apply). */
  hurt(amount: number, attacker: Mob, cause: string): void;
}

interface Queued {
  at: number;
  kind: PlayerAction;
}

export class MirrorBoss implements BossFight {
  readonly realm = 'mirror';
  readonly mobName = TWIN;
  readonly lockMessage = 'The palace stone is bound to the glass · the Mirror Twin must fall first';
  defeated = false;
  warning = '';
  private twin: Mob | null = null;
  private clock = 0;
  private readonly queue: Queued[] = [];
  private readonly pose: DollState = newDollState();
  /** Seconds since the Twin began a swing (< 0.3: mid-swing), and its bow draw for show. */
  private swingT = 99;
  private beamTimer = 6;
  private readonly field: LanceField;
  private readonly arena = new Float64Array(4);
  private arenaSet = false;

  constructor(private readonly host: MirrorBossHost) {
    this.field = new LanceField(host, { block: REG.id('mirror_beam'), warning: 1.5, burn: 2, height: BEAM_HEIGHT, color: '#cfe0ff' });
  }

  get lances() {
    return this.field.list;
  }

  save(): { defeated: boolean } {
    return { defeated: this.defeated };
  }

  load(d: unknown): void {
    this.defeated = typeof d === 'object' && d !== null && (d as { defeated?: unknown }).defeated === true;
  }

  find(): Mob | null {
    const m = this.twin;
    if (m && this.host.mobs.list.includes(m)) return m;
    this.twin = this.host.mobs.list.find((x) => x.def.name === TWIN) ?? null;
    if (this.twin?.home) {
      this.arena.set(this.twin.home);
      this.arenaSet = true;
    }
    return this.twin;
  }

  // ------------------------------------------------------------------ arena rules

  protects(x: number, y: number, z: number, w: number, _id = 0): boolean {
    if (this.defeated || !this.arenaSet || !this.find()) return false;
    const a = this.arena;
    return Math.hypot(x + 0.5 - a[0]!, z + 0.5 - a[2]!, w + 0.5 - a[3]!) <= MIRROR_ARENA_R && Math.abs(y - a[1]!) <= 24;
  }

  blockChanged(): void {}

  projectileHit(): boolean {
    return false;
  }

  // ------------------------------------------------------------------ waking

  /** Hold a Hand Mirror up to the altar at cell (x, y, z, w). True if the Twin woke. */
  summon(x: number, y: number, z: number, w: number): boolean {
    const h = this.host;
    if (this.defeated) {
      h.message('The altar is dark: its reflection is gone for good');
      return false;
    }
    if (this.find()) {
      h.message('The Twin is already here');
      return false;
    }
    if (h.difficulty() === 0) {
      h.message('Nothing answers the mirror in peaceful');
      return false;
    }
    const p = h.playerPos;
    const home = Float64Array.from([x + 0.5, y, z + 0.5, w + 0.5]);
    // Its spot: where you would be in a mirror (opposite you across the altar), else around the altar.
    const world = h.world;
    const free = (px: number, pz: number, pw: number): boolean => {
      const fx = Math.floor(px), fz = Math.floor(pz), fw = Math.floor(pw);
      for (const dy of [0, 1]) {
        const v = world.getBlock(fx, y + dy, fz, fw);
        if (v === VOID_VOXEL || REG.solid[v & 0xfff]) return false;
      }
      return true;
    };
    const cands: number[][] = [[2 * home[0]! - p[0]!, 2 * home[2]! - p[2]!, 2 * home[3]! - p[3]!]];
    for (const d of [2, -2]) cands.push([home[0]! + d, home[2]!, home[3]!], [home[0]!, home[2]! + d, home[3]!], [home[0]!, home[2]!, home[3]! + d]);
    const c = cands.find((k) => free(k[0]!, k[1]!, k[2]!));
    if (!c) {
      h.message('The air around the altar is too cramped for a reflection');
      return false;
    }
    const m = h.mobs.spawn(TWIN, c[0]!, y, c[1]!, c[2]!);
    if (!m) return false;
    m.home = home;
    m.phase = 1;
    this.twin = m;
    this.arena.set(home);
    this.arenaSet = true;
    this.queue.length = 0;
    this.beamTimer = 6;
    h.message('The Mirror Twin steps out of the glass · it copies you, late · fight it at the altar');
    h.glow(c[0]!, y + 1, c[1]!, c[2]!, '#e6eeff', 40);
    return true;
  }

  // ------------------------------------------------------------------ the fight

  onPlayerAction(kind: PlayerAction): void {
    const m = this.twin;
    if (!m || this.defeated) return;
    this.queue.push({ at: this.clock + COPY_DELAY[m.phase as 1 | 2 | 3]!, kind });
  }

  update(dt: number): void {
    const h = this.host;
    this.clock += dt;
    this.field.update(dt);
    const m = this.find();
    if (this.defeated || !m) {
      this.warning = '';
      this.queue.length = 0;
      return;
    }
    const ph = Math.max(m.phase, phaseFor(m.health, m.def.health));
    if (ph !== m.phase) {
      m.phase = ph;
      h.glow(m.pos[0]!, m.pos[1]! + 1, m.pos[2]!, m.pos[3]!, '#e6eeff', 30);
      if (ph === 2) {
        h.message('The glass cracks · Mirror Stalkers step out to join it');
        this.stalkers(2);
      } else h.message('The Twin moves faster than your reflection should · mirror beams');
    }
    // Wear your colours, in silver, and pose with its own walk.
    const src = h.doll(), ts = this.pose;
    this.swingT += dt;
    ts.walk = m.walk;
    ts.moving = Math.min(1, Math.hypot(m.vel[0]!, m.vel[2]!, m.vel[3]!) / Math.max(0.5, m.def.speed));
    ts.swing = this.swingT < 0.3 ? this.swingT / 0.3 : -1;
    ts.sneak = src.sneak;
    ts.glide = false;
    ts.wingSpread = 0;
    ts.blocking = m.shielded;
    ts.draw = 0;
    for (let k = 0; k < 4; k++) ts.armor[k] = src.armor[k] ?? null;
    ts.wings = src.wings;
    ts.held = src.held;
    m.dyn = dollParts(ts, m.dyn ?? [], TWIN_PALETTE);
    if (m.mode !== 'chase' || !h.playerTargetable()) {
      // Out of the arena or you are down: no copying, and the shield drops.
      this.queue.length = 0;
      m.shielded = false;
      this.updateWarning(m);
      return;
    }
    // Replay your actions.
    while (this.queue.length && this.queue[0]!.at <= this.clock) this.copy(m, this.queue.shift()!.kind);
    if (m.phase >= 3) {
      this.beamTimer -= dt;
      if (this.beamTimer <= 0) {
        this.beamTimer = 7;
        const p = h.playerPos;
        for (const [x, z, w] of pillarLine(p, h.playerRight, 2)) this.field.announce(x!, z!, w!, p[1]!);
      }
    }
    this.updateWarning(m);
  }

  /** The Twin does what you did. */
  private copy(m: Mob, kind: PlayerAction): void {
    const h = this.host, p = h.playerPos;
    const mult = h.difficulty() === 1 ? 0.5 : h.difficulty() === 3 ? 1.5 : 1;
    if (kind === 'block') m.shielded = true;
    else if (kind === 'unblock') m.shielded = false;
    else if (kind === 'swing') {
      this.swingT = 0;
      const d = Math.hypot(p[0]! - m.pos[0]!, p[2]! - m.pos[2]!, p[3]! - m.pos[3]!);
      if (d < 3.4 && Math.abs(p[1]! - m.pos[1]!) < 2.2) h.hurt((m.phase === 3 ? 7 : 6) * mult, m, 'The Mirror Twin');
      h.glow(m.pos[0]!, m.pos[1]! + 1.2, m.pos[2]!, m.pos[3]!, '#e6eeff', 3);
    } else if (kind === 'shoot') {
      this.swingT = 0;
      const from = Float64Array.from([m.pos[0]!, m.pos[1]! + 1.4, m.pos[2]!, m.pos[3]!]);
      const v = new Float64Array(4);
      let l = 0;
      for (let k = 0; k < 4; k++) {
        v[k] = p[k]! + (k === 1 ? 1.2 : 0) - from[k]!;
        l += v[k]! * v[k]!;
      }
      l = Math.sqrt(l) || 1;
      for (let k = 0; k < 4; k++) v[k] = (v[k]! / l) * 18;
      h.shoot(from, v, 4 * mult, IREG.id('arrow'), false);
    }
  }

  private stalkers(n: number): void {
    const h = this.host, p = h.playerPos;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      h.mobs.spawn('mirror_stalker', p[0]! + h.playerRight[0]! * 7 * side, p[1]! + 0.5, p[2]! + h.playerRight[2]! * 7 * side, p[3]! + h.playerRight[3]! * 7 * side);
    }
  }

  private updateWarning(m: Mob): void {
    const h = this.host;
    const { pending, inSlice } = this.field.pending(h.playerPos, h.playerHidden);
    const parts: string[] = [`The Twin copies you ${COPY_DELAY[m.phase as 1 | 2 | 3]!.toFixed(1)} s late${m.shielded ? ' · shield up' : ''}`];
    if (pending) parts.unshift(`⚠ Mirror beams: ${inSlice} in your slice, ${pending - inSlice} kata/ana along W · sidestep!`);
    this.warning = parts.join(' · ');
  }

  marks(): Mark[] {
    const out: Mark[] = [];
    this.field.marks(out);
    return out;
  }

  // ------------------------------------------------------------------ defeat

  onDefeat(m: Mob): void {
    this.defeated = true;
    this.twin = null;
    this.field.clear();
    this.queue.length = 0;
    this.warning = '';
    this.host.glow(m.pos[0]!, m.pos[1]! + 1.2, m.pos[2]!, m.pos[3]!, '#e6eeff', 80);
    this.host.message('The Mirror Twin shatters · the glass is only glass again');
  }
}
