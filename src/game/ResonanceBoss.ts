// The Resonance Titan (Phase 9.5): the boss of the Crystal Cathedral. Its walking is the 'titan' AI
// in MobManager (it keeps about six blocks off, stamps when you are close, goes home and heals if
// you leave); this module runs everything around it:
//
//  * Waking: ring any Tuning Fork at the Resonance Bell on the dais. Once; a defeated world never
//    sees it again (SavedState.data.bossFights.abyss).
//  * Crystal armour: four plates, one per tone (Low, Mid, High, Shrill), soak nine tenths of every
//    blow (`Mob.guard`). Each plate that shatters thins the armour.
//  * Calls: every few seconds the Titan SINGS one tone: a sound pulse (an expanding 4D shell, drawn as
//    a ring in your slice) heads for you. Ring the Tuning Fork of the SAME tone before it reaches you
//    and the pulse is cancelled and that plate takes a crack (two, then three in later phases, shatter
//    it). Ring the wrong fork and you are hurt for it; do nothing and the pulse hits you.
//  * Exposed: when all four plates are gone its heart shows for fourteen seconds and every blow
//    lands. Then the plates re-form.
//  * Phase II (below 66%): calls come in pairs and faster, Geode Slimes join. Phase III (below 33%):
//    triple calls and crystal spikes that stab up along W, announced on the radar first.
//  * Arena rules: while it lives nothing within 30 blocks of the Bell may be broken or placed.

import { REG } from '../content/registry';
import { TONES, titanParts } from '../content/titanBody';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';
import type { Mob, MobManager } from './mobs/MobManager';
import type { Pulse, Pulses } from './mobs/Pulses';
import type { ItemStack } from './items/ItemStack';
import { pillarLine } from './Boss';
import type { BossFight, Mark } from './BossFight';
import { LanceField } from './Lances';
import { phaseFor } from './VoidBoss';

export const TITAN = 'resonance_titan';
/** Radius of the arena around the Bell (protected while the Titan lives). */
export const TITAN_ARENA_R = 30;
/** Cracks a plate takes before it shatters, by phase. */
export const PLATE_HITS = [0, 2, 3, 3] as const;
/** Seconds its heart stays exposed once every plate is gone. */
export const EXPOSED_TIME = 14;
/** Seconds between calls, by phase, and calls sung at once. */
export const CALL_EVERY = [0, 8, 6.5, 5.5] as const;
export const CALLS_AT_ONCE = [0, 1, 2, 3] as const;
/** The share of every blow its plates soak up with all four standing, and what each broken plate gives back. */
export const GUARD = 0.9;
export const GUARD_STEP = 0.15;

export interface ResonanceHost {
  world: World;
  mobs: MobManager;
  pulses: Pulses;
  playerPos: Float64Array;
  playerRight: Float64Array;
  playerHidden: Float64Array;
  playerTargetable: () => boolean;
  /** 0 peaceful .. 3 hard. */
  difficulty: () => number;
  glow(x: number, y: number, z: number, w: number, color: string, n?: number): void;
  message(text: string): void;
  dropItem(x: number, y: number, z: number, w: number, st: ItemStack): void;
  /** The Titan hurts you (off-key answers): shields and armour apply. */
  hurt(amount: number, attacker: Mob, cause: string): void;
}

interface Call {
  tone: number;
  pulse: Pulse;
}

export class ResonanceBoss implements BossFight {
  readonly realm = 'abyss';
  readonly mobName = TITAN;
  readonly lockMessage = 'The cathedral stone rings and holds · the Resonance Titan must fall first';
  defeated = false;
  warning = '';
  /** Which plates still stand, and the cracks on each. */
  readonly plates = [true, true, true, true];
  readonly cracks = [0, 0, 0, 0];
  /** Seconds of exposure left (0: armoured). */
  exposed = 0;
  /** Calls whose pulse is still on its way. */
  calls: Call[] = [];
  private titan: Mob | null = null;
  private clock = 0;
  private callTimer = 6;
  private spikeTimer = 7;
  private readonly queued: { at: number; tone: number }[] = [];
  private readonly field: LanceField;
  private readonly arena = new Float64Array(4);
  private arenaSet = false;

  constructor(private readonly host: ResonanceHost) {
    this.field = new LanceField(host, { block: REG.id('resonance_spike'), warning: 1.6, burn: 2.2, height: 7, color: '#a8e0ff' });
  }

  get lances() {
    return this.field.list;
  }

  /** How many plates have shattered. */
  get broken(): number {
    return this.plates.filter((p) => !p).length;
  }

  save(): { defeated: boolean } {
    return { defeated: this.defeated };
  }

  load(d: unknown): void {
    this.defeated = typeof d === 'object' && d !== null && (d as { defeated?: unknown }).defeated === true;
  }

  find(): Mob | null {
    const m = this.titan;
    if (m && this.host.mobs.list.includes(m)) return m;
    this.titan = this.host.mobs.list.find((x) => x.def.name === TITAN) ?? null;
    if (this.titan?.home) {
      this.arena.set(this.titan.home);
      this.arenaSet = true;
    }
    return this.titan;
  }

  // ------------------------------------------------------------------ arena rules

  protects(x: number, y: number, z: number, w: number, _id = 0): boolean {
    if (this.defeated || !this.arenaSet || !this.find()) return false;
    const a = this.arena;
    return Math.hypot(x + 0.5 - a[0]!, z + 0.5 - a[2]!, w + 0.5 - a[3]!) <= TITAN_ARENA_R && Math.abs(y - a[1]!) <= 24;
  }

  blockChanged(): void {}

  projectileHit(): boolean {
    return false;
  }

  // ------------------------------------------------------------------ waking

  /** A Tuning Fork rung at the Bell at cell (x, y, z, w). True if the Titan woke. */
  summon(x: number, y: number, z: number, w: number): boolean {
    const h = this.host;
    if (this.defeated) {
      h.message('The Bell is silent: the Titan is gone for good');
      return false;
    }
    if (this.find()) {
      h.message('The Titan is already here');
      return false;
    }
    if (h.difficulty() === 0) {
      h.message('Nothing answers the Bell in peaceful');
      return false;
    }
    const home = Float64Array.from([x + 0.5, y, z + 0.5, w + 0.5]);
    const world = h.world;
    // A spot in the nave with room for its bulk: a 3 x 3 footprint, six high.
    const free = (px: number, pz: number, pw: number): boolean => {
      for (let dw = -1; dw <= 1; dw++)
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = 0; dy <= 5; dy++) {
              const v = world.getBlock(Math.floor(px) + dx, Math.floor(y) + dy, Math.floor(pz) + dz, Math.floor(pw) + dw);
              if (v === VOID_VOXEL || REG.solid[v & 0xfff]) return false;
            }
      return true;
    };
    const cands: number[][] = [];
    for (const d of [7, -7, 9, -9, 5, -5]) cands.push([home[0]! - Math.abs(d), home[2]! + (d > 0 ? d / 2 : 0), home[3]!], [home[0]! - 6, home[2]! + d, home[3]!], [home[0]! - 6, home[2]!, home[3]! + d / 3]);
    const c = cands.find((k) => free(k[0]!, k[1]!, k[2]!));
    if (!c) {
      h.message('The Bell rings, but the dais is too cramped for the Titan');
      return false;
    }
    const m = h.mobs.spawn(TITAN, c[0]!, y, c[1]!, c[2]!);
    if (!m) return false;
    m.home = home;
    m.phase = 1;
    m.guard = GUARD;
    this.titan = m;
    this.arena.set(home);
    this.arenaSet = true;
    this.reset();
    h.message('The Resonance Titan wakes · it sings, and you must answer: ring the fork of the same tone');
    h.glow(c[0]!, y + 3, c[1]!, c[2]!, '#a8e0ff', 50);
    return true;
  }

  private reset(): void {
    this.plates.fill(true);
    this.cracks.fill(0);
    this.exposed = 0;
    this.calls = [];
    this.queued.length = 0;
    this.callTimer = 6;
    this.spikeTimer = 7;
  }

  // ------------------------------------------------------------------ the fight

  update(dt: number): void {
    const h = this.host;
    this.clock += dt;
    this.field.update(dt);
    const m = this.find();
    if (this.defeated || !m) {
      this.warning = '';
      return;
    }
    const ph = Math.max(m.phase, phaseFor(m.health, m.def.health));
    if (ph !== m.phase) {
      m.phase = ph;
      h.glow(m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!, '#a8e0ff', 40);
      if (ph === 2) {
        h.message('The Titan sings in pairs · Geode Slimes crack out of the walls');
        this.slimes(2);
      } else {
        h.message('Three voices at once · crystal spikes stab up through the floor');
        this.slimes(2);
      }
    }
    // Calls whose pulse is gone (answered, struck you, or passed) are over.
    this.calls = this.calls.filter((c) => h.pulses.list.includes(c.pulse) && !c.pulse.spent);
    // Exposure runs out: the plates re-form.
    if (this.exposed > 0) {
      this.exposed -= dt;
      if (this.exposed <= 0) {
        this.exposed = 0;
        this.plates.fill(true);
        this.cracks.fill(0);
        this.callTimer = 3;
        h.message('The plates re-form');
        h.glow(m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!, '#a8e0ff', 30);
      }
    }
    m.guard = this.exposed > 0 ? 0 : Math.max(0.1, GUARD - GUARD_STEP * this.broken);
    // Its body, rebuilt from its plates.
    m.dyn = titanParts(this.plates, this.exposed > 0, Math.sin(this.clock * 2) * 0.06, m.dyn ?? []);
    if (m.mode !== 'chase' || !h.playerTargetable()) {
      this.calls = [];
      this.queued.length = 0;
      this.updateWarning(m);
      return;
    }
    // Sing.
    while (this.queued.length && this.queued[0]!.at <= this.clock) this.sing(m, this.queued.shift()!.tone);
    if (this.exposed <= 0) {
      this.callTimer -= dt;
      if (this.callTimer <= 0) {
        this.callTimer = CALL_EVERY[m.phase as 1 | 2 | 3]!;
        this.callVoices(m);
      }
    }
    // Phase III: spikes along W.
    if (m.phase >= 3) {
      this.spikeTimer -= dt;
      if (this.spikeTimer <= 0) {
        this.spikeTimer = 7;
        const p = h.playerPos;
        for (const [x, z, w] of pillarLine(p, h.playerRight, 2)) this.field.announce(x!, z!, w!, p[1]!);
      }
    }
    this.updateWarning(m);
  }

  /** Choose the tones of this call (among the plates that still stand) and sing them, a beat apart. */
  private callVoices(m: Mob): void {
    const standing = [0, 1, 2, 3].filter((k) => this.plates[k]);
    if (standing.length === 0) return;
    for (let i = standing.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [standing[i], standing[j]] = [standing[j]!, standing[i]!];
    }
    const n = Math.min(standing.length, CALLS_AT_ONCE[m.phase as 1 | 2 | 3]!);
    for (let i = 0; i < n; i++) this.queued.push({ at: this.clock + i * 1.3, tone: standing[i]! });
  }

  private sing(m: Mob, tone: number): void {
    const h = this.host;
    const mult = h.difficulty() === 1 ? 0.5 : h.difficulty() === 3 ? 1.5 : 1;
    const from = Float64Array.from([m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!]);
    const pulse = h.pulses.spawn(from, tone, 9 * mult, TITAN, { speed: 6.5 + m.phase * 0.6, reach: 40, thick: 1.7 });
    this.calls.push({ tone, pulse });
    h.glow(from[0]!, from[1]!, from[2]!, from[3]!, TONES[tone]!.color, 14);
  }

  private slimes(n: number): void {
    const h = this.host, p = h.playerPos;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      h.mobs.spawn('geode_slime', p[0]! + h.playerRight[0]! * 6 * side, p[1]! + 0.5, p[2]! + h.playerRight[2]! * 6 * side, p[3]! + h.playerRight[3]! * 6 * side);
    }
  }

  // ------------------------------------------------------------------ answers

  /**
   * A Tuning Fork was rung at `tone` and `cancelled` are the hostile pulses it silenced. Answers to the
   * Titan's calls crack its plates; a fork rung while a call is on its way and matching none of them is off-key.
   */
  forkRung(tone: number, cancelled: Pulse[]): void {
    const m = this.find();
    if (!m || this.defeated) return;
    const mine = cancelled.filter((p) => p.owner === TITAN);
    for (const p of mine) this.answered(m, p.tone);
    if (mine.length === 0 && this.calls.length > 0) {
      const h = this.host;
      const mult = h.difficulty() === 1 ? 0.5 : h.difficulty() === 3 ? 1.5 : 1;
      h.hurt(3 * mult, m, 'Dissonance');
      h.message(`Off key: the Titan is singing ${this.calls.map((c) => TONES[c.tone]!.name).join(' and ')}, not ${TONES[tone]!.name}`);
    }
  }

  private answered(m: Mob, tone: number): void {
    const h = this.host;
    if (this.exposed > 0 || !this.plates[tone]) return;
    this.cracks[tone] = this.cracks[tone]! + 1;
    const need = PLATE_HITS[m.phase as 1 | 2 | 3]!;
    h.glow(m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!, TONES[tone]!.color, 10);
    if (this.cracks[tone]! < need) {
      h.message(`${TONES[tone]!.name} answered · the plate cracks (${this.cracks[tone]}/${need})`);
      return;
    }
    this.plates[tone] = false;
    h.glow(m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!, TONES[tone]!.color, 40);
    if (this.broken < 4) {
      h.message(`The ${TONES[tone]!.name} plate shatters · ${4 - this.broken} left`);
      return;
    }
    this.exposed = EXPOSED_TIME;
    this.calls = [];
    this.queued.length = 0;
    h.message('The last plate shatters · its heart is exposed: strike now!');
  }

  private updateWarning(m: Mob): void {
    const h = this.host;
    const parts: string[] = [];
    const { pending, inSlice } = this.field.pending(h.playerPos, h.playerHidden);
    if (pending) parts.push(`⚠ Crystal spikes: ${inSlice} in your slice, ${pending - inSlice} kata/ana along W · sidestep!`);
    if (this.exposed > 0) parts.push(`HEART EXPOSED ${Math.ceil(this.exposed)} s · every blow lands`);
    else {
      if (this.calls.length) parts.push(`The Titan sings ${this.calls.map((c) => TONES[c.tone]!.name.toUpperCase()).join(' + ')} · ring the matching fork!`);
      parts.push(`Plates: ${TONES.map((t, k) => (this.plates[k] ? `${t.name}${this.cracks[k] ? ` ${this.cracks[k]}/${PLATE_HITS[m.phase as 1 | 2 | 3]}` : ''}` : `${t.name} ✗`)).join(' · ')}`);
    }
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
    this.titan = null;
    this.field.clear();
    this.calls = [];
    this.queued.length = 0;
    this.warning = '';
    this.host.glow(m.pos[0]!, m.pos[1]! + 3, m.pos[2]!, m.pos[3]!, '#a8e0ff', 90);
    this.host.message('The Resonance Titan shatters · the Cathedral falls silent');
  }
}
