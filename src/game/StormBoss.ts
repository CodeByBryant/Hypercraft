// The Storm Sovereign (Phase 9.7): the boss of the Cloud Citadel. Its movement is the 'tempest' AI in
// MobManager (it circles the Citadel at about twelve blocks, five above you, and goes home to heal if
// you leave); this module runs everything around it:
//
//  * Waking: sound a Storm Horn at the Storm Beacon on the keep's roof. Once; a defeated world never
//    sees it again (SavedState.data.bossFights.cloud).
//  * Lightning: it calls bolts down on you. Each is announced on the ground (sparks, and on the
//    hidden-axis radar, like the other bosses' lines), strikes a moment later as a column of lightning
//    and burns for a second. Phase I one bolt, phase II two, phase III a line of them across your slice.
//  * Gales: every so often it calls a gale along W. You get a warning, then for two and a half seconds
//    the wind shoves you hard kata or ana (`Game.gale`): crouch to grip the cloud (a quarter of the
//    push), or glide into it. The arena protects its blocks (nothing within 30 blocks of the Beacon
//    can be broken or placed), so there is no pillaring up or tunnelling under it.
//  * Phase II (below 66%): Thunder Hawks and Wind Sprites join. Phase III (below 33%): it charges
//    for four seconds at a time, taking a quarter of the damage, while bolts fall faster.

import { REG } from '../content/registry';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';
import type { Mob, MobManager } from './mobs/MobManager';
import type { ItemStack } from './items/ItemStack';
import { pillarLine } from './Boss';
import type { BossFight, Mark } from './BossFight';
import { LanceField } from './Lances';
import { phaseFor } from './VoidBoss';

export const SOVEREIGN = 'storm_sovereign';
/** Radius of the arena around the Beacon (protected while the Sovereign lives). */
export const STORM_ARENA_R = 30;
/** Seconds between bolts, and between gales, by phase. */
export const BOLT_EVERY = [0, 5.5, 4, 3] as const;
export const GALE_EVERY = [0, 13, 10, 8] as const;
/** The gale: seconds of warning, seconds it blows and its speed along W. */
export const GALE_WARN = 1.3;
export const GALE_TIME = 2.5;
export const GALE_SPEED = 14;
/** Phase III: seconds it charges (a quarter of the damage), and between charges. */
export const CHARGE_TIME = 4;
export const CHARGE_EVERY = 12;

export interface StormHost {
  world: World;
  mobs: MobManager;
  playerPos: Float64Array;
  playerRight: Float64Array;
  playerHidden: Float64Array;
  playerTargetable: () => boolean;
  /** 0 peaceful .. 3 hard. */
  difficulty: () => number;
  glow(x: number, y: number, z: number, w: number, color: string, n?: number): void;
  message(text: string): void;
  dropItem(x: number, y: number, z: number, w: number, st: ItemStack): void;
  /** Blow a gale along W: `dir` +1 (ana) or -1 (kata), for `seconds`. */
  gale(dir: number, seconds: number): void;
}

export class StormBoss implements BossFight {
  readonly realm = 'cloud';
  readonly mobName = SOVEREIGN;
  readonly lockMessage = 'The citadel stone is held by the storm · the Storm Sovereign must fall first';
  defeated = false;
  warning = '';
  /** A gale announced: its direction (+1 ana, -1 kata) and seconds until it blows (0: none). */
  galeDir = 0;
  galeIn = 0;
  /** Seconds of charge left (phase III). */
  charge = 0;
  private sovereign: Mob | null = null;
  private boltTimer = 4;
  private galeTimer = 9;
  private chargeTimer = CHARGE_EVERY;
  private readonly field: LanceField;
  private readonly arena = new Float64Array(4);
  private arenaSet = false;

  constructor(private readonly host: StormHost) {
    this.field = new LanceField(host, { block: REG.id('lightning_bolt'), warning: 1.2, burn: 0.9, height: 16, color: '#fff4a0' });
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
    const m = this.sovereign;
    if (m && this.host.mobs.list.includes(m)) return m;
    this.sovereign = this.host.mobs.list.find((x) => x.def.name === SOVEREIGN) ?? null;
    if (this.sovereign?.home) {
      this.arena.set(this.sovereign.home);
      this.arenaSet = true;
    }
    return this.sovereign;
  }

  protects(x: number, y: number, z: number, w: number, _id = 0): boolean {
    if (this.defeated || !this.arenaSet || !this.find()) return false;
    const a = this.arena;
    return Math.hypot(x + 0.5 - a[0]!, z + 0.5 - a[2]!, w + 0.5 - a[3]!) <= STORM_ARENA_R && Math.abs(y - a[1]!) <= 30;
  }

  blockChanged(): void {}

  projectileHit(): boolean {
    return false;
  }

  // ------------------------------------------------------------------ waking

  /** A Storm Horn sounded at the Beacon at cell (x, y, z, w). True if the Sovereign woke. */
  summon(x: number, y: number, z: number, w: number): boolean {
    const h = this.host;
    if (this.defeated) {
      h.message('The Beacon is dark: the storm is spent for good');
      return false;
    }
    if (this.find()) {
      h.message('The Storm Sovereign is already here');
      return false;
    }
    if (h.difficulty() === 0) {
      h.message('Nothing answers the horn in peaceful');
      return false;
    }
    const home = Float64Array.from([x + 0.5, y, z + 0.5, w + 0.5]);
    const world = h.world;
    // Above the Beacon, in open air: up to 14 blocks.
    let sy = y + 5;
    for (; sy < y + 14; sy++) {
      const v = world.getBlock(x, sy, z, w);
      if (v !== VOID_VOXEL && !REG.solid[v & 0xfff]) break;
    }
    const m = h.mobs.spawn(SOVEREIGN, x + 0.5, sy, z + 0.5, w + 0.5);
    if (!m) return false;
    m.home = home;
    m.phase = 1;
    this.sovereign = m;
    this.arena.set(home);
    this.arenaSet = true;
    this.boltTimer = 4;
    this.galeTimer = 9;
    this.chargeTimer = CHARGE_EVERY;
    this.galeDir = 0;
    this.galeIn = 0;
    this.charge = 0;
    h.message('The Storm Sovereign answers the horn · bolts come down where you stand: move! · crouch against the gales');
    h.glow(x + 0.5, sy + 2, z + 0.5, w + 0.5, '#fff4a0', 50);
    return true;
  }

  // ------------------------------------------------------------------ the fight

  update(dt: number): void {
    const h = this.host;
    this.field.update(dt);
    const m = this.find();
    if (this.defeated || !m) {
      this.warning = '';
      this.galeIn = 0;
      return;
    }
    const ph = Math.max(m.phase, phaseFor(m.health, m.def.health));
    if (ph !== m.phase) {
      m.phase = ph;
      h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#fff4a0', 40);
      if (ph === 2) {
        h.message('The storm gathers · Thunder Hawks and Wind Sprites answer its call');
        this.minions();
      } else h.message('The eye of the storm · it charges between volleys, and the bolts come faster');
    }
    if (m.mode !== 'chase' || !h.playerTargetable()) {
      this.galeIn = 0;
      this.charge = 0;
      m.shielded = false;
      this.updateWarning(m);
      return;
    }
    // Phase III charge: a quarter of the damage for a few seconds.
    if (m.phase >= 3) {
      if (this.charge > 0) {
        this.charge -= dt;
        if (this.charge <= 0) {
          this.charge = 0;
          m.shielded = false;
        }
      } else {
        this.chargeTimer -= dt;
        if (this.chargeTimer <= 0) {
          this.chargeTimer = CHARGE_EVERY;
          this.charge = CHARGE_TIME;
          m.shielded = true;
          h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#fff4a0', 30);
          h.message('The Sovereign gathers its charge · hold off: it takes a quarter of the damage');
        }
      }
    }
    // Bolts.
    this.boltTimer -= dt;
    if (this.boltTimer <= 0) {
      this.boltTimer = BOLT_EVERY[m.phase as 1 | 2 | 3]!;
      this.bolts(m);
    }
    // Gales: a warning, then the wind.
    if (this.galeIn > 0) {
      this.galeIn -= dt;
      if (this.galeIn <= 0) {
        this.galeIn = 0;
        h.gale(this.galeDir, GALE_TIME);
        h.message(`The gale blows ${this.galeDir > 0 ? 'ana' : 'kata'} · crouch!`);
      }
    } else {
      this.galeTimer -= dt;
      if (this.galeTimer <= 0) {
        this.galeTimer = GALE_EVERY[m.phase as 1 | 2 | 3]!;
        this.galeDir = Math.random() < 0.5 ? -1 : 1;
        this.galeIn = GALE_WARN;
      }
    }
    this.updateWarning(m);
  }

  /** Call bolts down on you: one, two (phase II), or a line across your slice (phase III). */
  private bolts(m: Mob): void {
    const h = this.host, p = h.playerPos;
    const count = m.phase === 1 ? 1 : m.phase === 2 ? 2 : 3;
    // Always one where you stand; the rest around you, along your right (so in your slice) and W.
    this.field.announce(Math.floor(p[0]!), Math.floor(p[2]!), Math.floor(p[3]!), p[1]!);
    if (count > 1) {
      for (const [x, z, w] of pillarLine(p, h.playerRight, count - 1)) {
        if (x === Math.floor(p[0]!) && z === Math.floor(p[2]!) && w === Math.floor(p[3]!)) continue;
        this.field.announce(x!, z!, w!, p[1]!);
      }
    }
  }

  private minions(): void {
    const h = this.host, p = h.playerPos;
    for (let i = 0; i < 2; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      h.mobs.spawn('thunder_hawk', p[0]! + h.playerRight[0]! * 9 * side, p[1]! + 6, p[2]! + h.playerRight[2]! * 9 * side, p[3]! + h.playerRight[3]! * 9 * side);
      h.mobs.spawn('wind_sprite', p[0]! + h.playerRight[0]! * 6 * side, p[1]! + 2, p[2]! + h.playerRight[2]! * 6 * side, p[3]! + h.playerRight[3]! * 6 * side);
    }
  }

  private updateWarning(m: Mob): void {
    const h = this.host;
    const parts: string[] = [];
    const { pending, inSlice } = this.field.pending(h.playerPos, h.playerHidden);
    if (pending) parts.push(`⚠ Lightning: ${inSlice} in your slice, ${pending - inSlice} kata/ana along W · move!`);
    if (this.galeIn > 0) parts.push(`⚠ GALE ${this.galeDir > 0 ? 'ANA' : 'KATA'} in ${this.galeIn.toFixed(1)} s · crouch to grip the cloud`);
    if (this.charge > 0) parts.push(`The Sovereign is charging (${this.charge.toFixed(0)} s): a quarter damage`);
    this.warning = parts.join(' · ');
    void m;
  }

  marks(): Mark[] {
    const out: Mark[] = [];
    this.field.marks(out);
    return out;
  }

  // ------------------------------------------------------------------ defeat

  onDefeat(m: Mob): void {
    this.defeated = true;
    this.sovereign = null;
    this.field.clear();
    this.warning = '';
    this.galeIn = 0;
    this.charge = 0;
    this.host.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#fff4a0', 90);
    this.host.message('The Storm Sovereign breaks apart · the sky clears');
  }
}
