// The Void Sovereign (Phase 8): the final boss of the Hollow Void. Its movement is the
// 'sovereign' AI in MobManager (it hovers near you, keeps to your slice, blinks about and goes
// home to heal if you leave); this module runs everything around it:
//
//  * Waking: it appears on its throne when you come within SUMMON_R of it, once. A defeated world
//    never sees it again (SavedState.data.voidSovereign).
//  * Pylons: eight crystals around the arena heal it while they stand. Four are in the throne's own
//    slice (w = 0), four kata and ana of it (w = +-11): you find them with the hidden-axis radar.
//    Break them with a pickaxe or hand, or shoot them.
//  * Phase I (above 66%): fans of starlight; it blinks about. Phase II (below 66%): it also PHASE
//    SHIFTS: it steps off your slice along the hidden axis (out of sight and out of reach), sends
//    Whisper Swarms at you, then steps back and fires. It calls void lances down along W through
//    you (telegraphed on the radar, like the Regent's pillars). Phase III (below 33%): it drains
//    the light (torches and lanterns near you go out, you are blinded for a few seconds), lances
//    come faster and across your slice too.
//  * Arena rules: while it lives nothing in the arena may be broken or placed, and explosions leave
//    it alone, so there is no pillaring up or tunnelling under it. Only the pylons yield.
//  * Defeat: the pylons crumble, a gate opens on the throne (home), the six Gateway Spires wake and
//    the world remembers. Dropped: its heart, starlight, phase dust, 12000 experience.

import { REG } from '../content/registry';
import { IREG } from '../content/itemRegistry';
import { BEAM_HEIGHT, DIRS, PYLONS, PYLON_CRYSTALS, SUMMON_R, VOID_TOP, inArena, spireXZW } from '../content/void';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';
import type { Mob, MobManager } from './mobs/MobManager';
import type { ItemStack } from './items/ItemStack';
import { pillarLine } from './Boss';

export const SOVEREIGN = 'void_sovereign';
/** Health a standing pylon gives back per second. */
export const PYLON_HEAL = 1.2;
/** Seconds a phase shift lasts, and how long a lance is announced and burns. */
export const SHIFT_TIME = 4.5;
export const LANCE_WARNING = 1.5;
export const LANCE_BURN = 2.5;
const LANCE_HEIGHT = 7;
/** Where the throne's gate cell is (home: the exit gate). */
export const THRONE_GATE: [number, number, number, number] = [0, VOID_TOP + 1, 0, 0];

/** The phase for a health fraction: I above 66%, II above 33%, else III. */
export function phaseFor(health: number, max: number): number {
  const f = health / max;
  return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
}

export interface Lance {
  x: number;
  y: number;
  z: number;
  w: number;
  /** Seconds until it strikes (<= 0: struck). */
  erupt: number;
  burn: number;
  cells: number[][];
}

export interface Mark {
  x: number;
  y: number;
  z: number;
  w: number;
  kind: 'pylon' | 'lance' | 'boss';
  /** Blinks (announced, not yet struck). */
  pending: boolean;
}

export interface VoidBossHost {
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
  /** Blind the player for a few seconds. */
  blind(seconds: number): void;
}

export class VoidBoss {
  defeated = false;
  readonly lances: Lance[] = [];
  /** HUD line: lances announced, the Sovereign off your slice, pylons standing ('' when idle). */
  warning = '';
  /** Pylons standing at the last count. */
  standing = 0;
  private sovereign: Mob | null = null;
  private wakeTimer = 0;
  private countTimer = 0;
  private houseTimer = 0;
  private readonly t = { bolt: 3, shift: 9, lance: 7, drain: 8 };
  private wasShifted = false;

  constructor(private readonly host: VoidBossHost) {}

  // ------------------------------------------------------------------ saving

  save(): { defeated: boolean } {
    return { defeated: this.defeated };
  }

  load(d: unknown): void {
    this.defeated = typeof d === 'object' && d !== null && (d as { defeated?: unknown }).defeated === true;
  }

  // ------------------------------------------------------------------ arena rules

  /** May this cell not be broken or built in right now (the arena while the Sovereign lives)? */
  protects(x: number, y: number, z: number, w: number, id = 0): boolean {
    if (this.defeated) return false;
    if (id === PYLON_ID) return false;
    return inArena(x, y, z, w);
  }

  /** An arrow hit a block: pylons shatter. True if the arrow was used up. */
  projectileHit(x: number, _y: number, z: number, w: number, id: number, byPlayer: boolean): boolean {
    if (id !== PYLON_ID || !byPlayer || this.defeated) return false;
    const i = PYLONS.findIndex((p) => p[0] === x && p[1] === z && p[2] === w);
    if (i < 0) return false;
    this.breakPylon(i);
    return true;
  }

  /** A block changed: breaking any crystal of a pylon shatters the whole pylon (like an arrow hit). */
  blockChanged(x: number, y: number, z: number, w: number, o: number, n: number): void {
    if (this.breaking || this.defeated || (o & 0xfff) !== PYLON_ID || (n & 0xfff) === PYLON_ID) return;
    const i = PYLONS.findIndex((p) => p[0] === x && p[1] === z && p[2] === w);
    if (i < 0 || y < VOID_TOP + 2 || y >= VOID_TOP + 2 + PYLON_CRYSTALS) return;
    this.breaking = true;
    this.breakPylon(i);
    this.breaking = false;
  }
  private breaking = false;

  private pylonCell(i: number, k: number): [number, number, number, number] {
    const p = PYLONS[i]!;
    return [p[0], VOID_TOP + 2 + k, p[1], p[2]];
  }

  private breakPylon(i: number): void {
    const w = this.host.world;
    for (let k = 0; k < PYLON_CRYSTALS; k++) {
      const c = this.pylonCell(i, k);
      if ((w.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) === PYLON_ID) {
        w.setBlock(c[0], c[1], c[2], c[3], 0);
        this.host.glow(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5, c[3] + 0.5, '#ff9af0', 8);
      }
    }
  }

  /** How many pylons still stand (any of a pylon's crystals left). */
  countPylons(): number {
    const w = this.host.world;
    let n = 0;
    for (let i = 0; i < PYLONS.length; i++) {
      for (let k = 0; k < PYLON_CRYSTALS; k++) {
        const c = this.pylonCell(i, k);
        if ((w.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) === PYLON_ID) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ the fight

  /** The Sovereign alive right now (in the mob list), or null. */
  find(): Mob | null {
    const m = this.sovereign;
    if (m && this.host.mobs.list.includes(m)) return m;
    this.sovereign = this.host.mobs.list.find((x) => x.def.name === SOVEREIGN) ?? null;
    return this.sovereign;
  }

  update(dt: number): void {
    const h = this.host;
    this.houseTimer -= dt;
    if (this.defeated) {
      if (this.houseTimer <= 0) {
        this.houseTimer = 1;
        this.afterDefeat();
      }
      this.updateLances(dt);
      return;
    }
    const m = this.find();
    if (!m) {
      this.wakeTimer -= dt;
      if (this.wakeTimer <= 0) {
        this.wakeTimer = 0.5;
        this.maybeWake();
      }
      this.warning = '';
      return;
    }
    // Phases only go up (a healed Sovereign keeps its fury).
    const ph = Math.max(m.phase, phaseFor(m.health, m.def.health));
    if (ph !== m.phase) {
      m.phase = ph;
      h.message(ph === 2 ? 'The Void Sovereign tears loose from your slice!' : 'The lights gutter… the Sovereign drinks the dark!');
      h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#c8a0ff', 30);
    }
    // Pylons heal it, one beam of light each.
    this.countTimer -= dt;
    if (this.countTimer <= 0) {
      this.countTimer = 0.25;
      const n = this.countPylons();
      if (n < this.standing) h.message(n === 0 ? 'The last pylon shatters: nothing heals the Sovereign now' : `A pylon shatters · ${n} left`);
      this.standing = n;
      for (let i = 0; i < PYLONS.length && n > 0; i++) {
        const c = this.pylonCell(i, 1);
        if ((h.world.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) !== PYLON_ID) continue;
        const f = 0.15 + Math.random() * 0.75;
        h.glow(c[0] + 0.5 + (m.pos[0]! - c[0] - 0.5) * f, c[1] + 0.5 + (m.pos[1]! + 2 - c[1] - 0.5) * f, c[2] + 0.5 + (m.pos[2]! - c[2] - 0.5) * f, c[3] + 0.5 + (m.pos[3]! - c[3] - 0.5) * f, '#ff9af0', 1);
      }
    }
    if (this.standing > 0 && m.health < m.def.health) m.health = Math.min(m.def.health, m.health + PYLON_HEAL * this.standing * dt);
    // Stepping back into your slice.
    if (this.wasShifted && m.shift <= 0) this.shiftIn(m);
    this.wasShifted = m.shift > 0;
    if (m.mode !== 'chase' || !h.playerTargetable()) {
      this.updateLances(dt);
      this.updateWarning(m);
      return;
    }
    const t = this.t;
    if (m.shift <= 0) {
      t.bolt -= dt;
      if (t.bolt <= 0) {
        t.bolt = m.phase === 1 ? 3.6 : m.phase === 2 ? 2.8 : 2.2;
        this.volley(m, m.phase === 1 ? 5 : 7);
      }
      if (m.phase >= 2) {
        t.shift -= dt;
        if (t.shift <= 0) {
          t.shift = m.phase === 2 ? 14 : 11;
          this.shiftOut(m);
        }
        t.lance -= dt;
        if (t.lance <= 0) {
          t.lance = m.phase === 2 ? 10 : 6;
          this.summonLances(m);
        }
      }
      if (m.phase >= 3) {
        t.drain -= dt;
        if (t.drain <= 0) {
          t.drain = 9;
          this.drain();
        }
      }
    }
    this.updateLances(dt);
    this.updateWarning(m);
  }

  private maybeWake(): void {
    const h = this.host;
    if (!h.playerTargetable() || h.difficulty() === 0) return;
    const p = h.playerPos;
    if (Math.hypot(p[0]! - 0.5, p[2]! - 0.5, p[3]! - 0.5) > SUMMON_R || Math.abs(p[1]! - VOID_TOP) > 40) return;
    // Only once the throne's column is here (a saved Sovereign comes back with it).
    if (h.world.getBlock(0, VOID_TOP + 1, 0, 0) === VOID_VOXEL) return;
    const m = h.mobs.spawn(SOVEREIGN, 0.5, VOID_TOP + 4, 0.5, 0.5);
    if (!m) return;
    m.home = Float64Array.from([0.5, VOID_TOP + 2.5, 0.5, 0.5]);
    m.phase = 1;
    this.sovereign = m;
    Object.assign(this.t, { bolt: 3, shift: 9, lance: 7, drain: 8 });
    this.standing = this.countPylons();
    h.message('The Void Sovereign wakes · break its pylons, and fight it in your slice');
    h.glow(0.5, VOID_TOP + 4, 0.5, 0.5, '#c8a0ff', 40);
  }

  /** A fan of `n` starlight bolts, spread along your right. */
  private volley(m: Mob, n: number): void {
    const h = this.host, p = h.playerPos;
    const from = Float64Array.from([m.pos[0]!, m.pos[1]! + m.height * 0.7, m.pos[2]!, m.pos[3]!]);
    const dmg = (m.phase === 1 ? 5 : m.phase === 2 ? 6 : 7) * (h.difficulty() === 1 ? 0.5 : h.difficulty() === 3 ? 1.5 : 1);
    for (let i = 0; i < n; i++) {
      const v = new Float64Array(4);
      let l = 0;
      for (let k = 0; k < 4; k++) {
        v[k] = p[k]! + (k === 1 ? 1 : 0) - from[k]! + h.playerRight[k]! * (i - (n - 1) / 2) * 1.3;
        l += v[k]! * v[k]!;
      }
      l = Math.sqrt(l) || 1;
      for (let k = 0; k < 4; k++) v[k] = (v[k]! / l) * 14;
      h.shoot(from, v, dmg, IREG.id('starlight_shard'), false);
    }
    h.glow(from[0]!, from[1]!, from[2]!, from[3]!, '#c8a0ff', 6);
  }

  /** Phase shift: step off your slice along the hidden axis and send swarms. */
  private shiftOut(m: Mob): void {
    const h = this.host, p = h.playerPos, H = h.playerHidden;
    m.shift = SHIFT_TIME;
    m.shiftOff = (Math.random() < 0.5 ? -1 : 1) * (5.5 + Math.random() * 1.5);
    let dh = 0;
    for (let k = 0; k < 4; k++) dh += (m.pos[k]! - p[k]!) * H[k]!;
    h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#c8a0ff', 20);
    for (const k of [0, 2, 3]) m.pos[k] = m.pos[k]! + (m.shiftOff - dh) * H[k]!;
    m.vel.fill(0);
    h.message(`The Sovereign slips ${m.shiftOff > 0 ? 'ana' : 'kata'} of your slice: nothing can hurt it there`);
    const swarms = m.phase === 3 ? 3 : 2;
    for (let k = 0; k < swarms; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const d = 6 + Math.random() * 3;
      h.mobs.spawn('whisper_swarm', p[0]! + h.playerRight[0]! * d * side, p[1]! + 1.5, p[2]! + h.playerRight[2]! * d * side, p[3]! + h.playerRight[3]! * d * side);
    }
  }

  /** The shift ends: back into your slice, to one side, firing. */
  private shiftIn(m: Mob): void {
    const h = this.host, p = h.playerPos;
    const side = Math.random() < 0.5 ? -1 : 1;
    h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#c8a0ff', 12);
    for (const k of [0, 2, 3]) m.pos[k] = p[k]! + h.playerRight[k]! * side * 8;
    m.pos[1] = p[1]! + 3;
    m.vel.fill(0);
    m.shift = 0;
    h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#c8a0ff', 20);
    this.volley(m, 9);
    this.t.bolt = 2.5;
  }

  /** Void lances down along W through you (and, in phase III, across your slice), announced first. */
  private summonLances(m: Mob): void {
    const h = this.host, p = h.playerPos, world = h.world;
    for (const [x, z, w] of pillarLine(p, h.playerRight, m.phase >= 3 ? 2 : 1)) {
      let y = -1;
      for (let yy = Math.floor(p[1]! + 3); yy > Math.floor(p[1]!) - 12 && yy > 1; yy--) {
        const v = world.getBlock(x!, yy - 1, z!, w!);
        const a = world.getBlock(x!, yy, z!, w!);
        if (v === VOID_VOXEL || a === VOID_VOXEL) break;
        if (REG.solid[v & 0xfff] && !REG.solid[a & 0xfff]) {
          y = yy;
          break;
        }
      }
      if (y < 0) continue;
      this.lances.push({ x: x!, y, z: z!, w: w!, erupt: LANCE_WARNING, burn: LANCE_BURN, cells: [] });
    }
  }

  private updateLances(dt: number): void {
    const h = this.host, world = h.world;
    for (let i = this.lances.length - 1; i >= 0; i--) {
      const l = this.lances[i]!;
      if (l.erupt > 0) {
        l.erupt -= dt;
        if (Math.random() < dt * 8) h.glow(l.x + 0.5, l.y + 0.1, l.z + 0.5, l.w + 0.5, '#b890ff', 1);
        if (l.erupt <= 0) {
          for (let k = 0; k < LANCE_HEIGHT; k++) {
            const v = world.getBlock(l.x, l.y + k, l.z, l.w);
            if (v === VOID_VOXEL || (v !== 0 && !REG.replaceable[v & 0xfff])) break;
            world.setBlock(l.x, l.y + k, l.z, l.w, LANCE_ID);
            l.cells.push([l.x, l.y + k, l.z, l.w]);
          }
        }
        continue;
      }
      l.burn -= dt;
      if (l.burn > 0) continue;
      for (const c of l.cells) if ((world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === LANCE_ID) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
      this.lances.splice(i, 1);
    }
  }

  /** Remove every lance at once (the Sovereign fell, or the player left). */
  clearLances(): void {
    const world = this.host.world;
    for (const l of this.lances) for (const c of l.cells) if ((world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === LANCE_ID) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
    this.lances.length = 0;
  }

  /** Drain the light: torches and lanterns within 12 blocks of you go out (as items), and the dark closes in. */
  drain(): number {
    const h = this.host, world = h.world, p = h.playerPos;
    const torch = REG.id('torch'), lantern = REG.id('lantern');
    const cx = Math.floor(p[0]!), cy = Math.floor(p[1]!), cz = Math.floor(p[2]!), cw = Math.floor(p[3]!);
    let n = 0;
    for (let dw = -12; dw <= 12; dw++)
      for (let dz = -12; dz <= 12; dz++)
        for (let dx = -12; dx <= 12; dx++)
          for (let dy = -3; dy <= 6; dy++) {
            const id = world.getBlock(cx + dx, cy + dy, cz + dz, cw + dw) & 0xfff;
            if (id !== torch && id !== lantern) continue;
            world.setBlock(cx + dx, cy + dy, cz + dz, cw + dw, 0);
            h.dropItem(cx + dx, cy + dy, cz + dz, cw + dw, { id: IREG.id(id === torch ? 'torch' : 'lantern'), count: 1, damage: 0 });
            n++;
          }
    h.blind(4);
    h.message(n ? 'The Sovereign drinks the light: your torches go out' : 'The Sovereign drinks the light…');
    h.glow(p[0]!, p[1]! + 1.5, p[2]!, p[3]!, '#1a0a30', 20);
    return n;
  }

  private updateWarning(m: Mob): void {
    const h = this.host, p = h.playerPos, H = h.playerHidden;
    const parts: string[] = [];
    let pending = 0, inSlice = 0;
    for (const l of this.lances) {
      if (l.erupt <= 0) continue;
      pending++;
      const dh = (l.x + 0.5 - p[0]!) * H[0]! + (l.z + 0.5 - p[2]!) * H[2]! + (l.w + 0.5 - p[3]!) * H[3]!;
      if (Math.abs(dh) < 0.75) inSlice++;
    }
    if (pending) parts.push(`⚠ Void lances: ${inSlice} in your slice, ${pending - inSlice} kata/ana along W · sidestep!`);
    if (m.shift > 0) parts.push(`The Sovereign hangs ${Math.round(Math.abs(m.shiftOff))} m ${m.shiftOff > 0 ? 'ana' : 'kata'} of your slice: untouchable, deal with its swarms`);
    if (this.standing > 0) {
      let near = 0;
      for (let i = 0; i < PYLONS.length; i++) {
        const c = this.pylonCell(i, 1);
        if ((h.world.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) !== PYLON_ID) continue;
        const dh = (c[0] + 0.5 - p[0]!) * H[0]! + (c[2] + 0.5 - p[2]!) * H[2]! + (c[3] + 0.5 - p[3]!) * H[3]!;
        if (Math.abs(dh) < 0.75) near++;
      }
      parts.push(`Pylons heal it: ${this.standing} standing (${near} in your slice)`);
    }
    this.warning = parts.join(' · ');
  }

  /** What the hidden-axis radar shows: pylons, announced and struck lances, the Sovereign off your slice. */
  marks(): Mark[] {
    const out: Mark[] = [];
    if (this.defeated && this.lances.length === 0) return out;
    const w = this.host.world;
    if (!this.defeated)
      for (let i = 0; i < PYLONS.length; i++) {
        const c = this.pylonCell(i, 1);
        if ((w.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) === PYLON_ID) out.push({ x: c[0], y: c[1], z: c[2], w: c[3], kind: 'pylon', pending: false });
      }
    for (const l of this.lances) out.push({ x: l.x, y: l.y, z: l.z, w: l.w, kind: 'lance', pending: l.erupt > 0 });
    const m = this.sovereign;
    if (m && m.shift > 0) out.push({ x: Math.floor(m.pos[0]!), y: Math.floor(m.pos[1]!), z: Math.floor(m.pos[2]!), w: Math.floor(m.pos[3]!), kind: 'boss', pending: true });
    return out;
  }

  // ------------------------------------------------------------------ defeat

  /** The Sovereign died: the world is changed for good. */
  onDefeat(m: Mob): void {
    const h = this.host;
    this.defeated = true;
    this.sovereign = null;
    this.clearLances();
    this.warning = '';
    this.standing = 0;
    for (let i = 0; i < PYLONS.length; i++) this.breakPylon(i);
    this.afterDefeat();
    h.glow(m.pos[0]!, m.pos[1]! + 2, m.pos[2]!, m.pos[3]!, '#c8a0ff', 80);
    h.message('The Void Sovereign falls · a gate opens on the throne, and the gateway beams wake');
  }

  /** Idempotent: the exit gate on the throne, the six Gateway Spires lit, stray pylons gone. */
  afterDefeat(): void {
    const w = this.host.world;
    const [gx, gy, gz, gw] = THRONE_GATE;
    if (w.getBlock(gx, gy, gz, gw) !== VOID_VOXEL) {
      for (const d of DIRS) w.setBlock(gx + d[0], gy, gz + d[1], gw + d[2], EYE_FRAME_ID);
      w.setBlock(gx, gy, gz, gw, GATE_ID);
    }
    for (let k = 0; k < 6; k++) {
      const [sx, sz, sw] = spireXZW(k);
      if (w.getBlock(sx, VOID_TOP + 1, sz, sw) === VOID_VOXEL) continue; // not loaded here
      for (let y = VOID_TOP + 1; y <= VOID_TOP + BEAM_HEIGHT; y++) if ((w.getBlock(sx, y, sz, sw) & 0xfff) !== BEAM_ID && w.getBlock(sx, y, sz, sw) !== VOID_VOXEL) w.setBlock(sx, y, sz, sw, BEAM_ID);
    }
    for (let i = 0; i < PYLONS.length; i++) {
      const c = this.pylonCell(i, 0);
      if ((w.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) === PYLON_ID) this.breakPylon(i);
    }
  }
}

const PYLON_ID = REG.id('pylon_crystal');
const LANCE_ID = REG.id('void_lance');
const BEAM_ID = REG.id('gateway_beam');
const GATE_ID = REG.id('void_gate');
const EYE_FRAME_ID = REG.id('void_gate_frame_eye');
