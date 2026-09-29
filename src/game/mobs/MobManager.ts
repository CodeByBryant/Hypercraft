// Mobs: spawning from biome tables, 4D bodies with world collision, AI behaviours, combat,
// drops, and packing their analytic primitives for the ray marcher.
//
// Every mob has its own orthonormal 4D frame: world up plus a horizontal basis (R, F, H) in
// the x/z/w 3-space. Its parts are defined in that frame, so a mob can face any direction in
// 4D (including "into" the hidden axis) and the slice cuts it like any other 4D object.

import { REG, COLLISION_NONE, FLUID_LAVA, FLUID_WATER } from '../../content/registry';
import { IREG } from '../../content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS, type CompiledMob } from '../../content/mobRegistry';
import type { BiomeDef, MobSpawn } from '../../content/types';
import type { Frame4 } from '../../math/frame';
import type { World } from '../../world/World';
import { Pathfinder } from './Pathfinder';
import { rayBall, rayBox, rayCapsule } from './intersect';
import type { ItemStack } from '../items/ItemStack';

export const MAX_GPU_MOBS = 48;
/** Texels per mob record and per part record in the entity texture. */
export const MOB_TEXELS = 6;
export const PART_TEXELS = 4;
export const PART_BASE = MAX_GPU_MOBS * MOB_TEXELS;
export const ENTITY_TEX_W = 256;
export const ENTITY_TEX_H = Math.ceil((PART_BASE + MAX_GPU_MOBS * MAX_MOB_PARTS * PART_TEXELS) / ENTITY_TEX_W);

const MAX_MOBS = 64;
const CAP_HOSTILE = 14;
const CAP_PASSIVE = 20;

export interface MobHost {
  world: World;
  /** Player feet position, hidden axis and whether the player can be targeted. */
  playerPos: Float64Array;
  playerHidden: Float64Array;
  playerTargetable: boolean;
  playerInWater: boolean;
  daylight: number;
  /** 0 peaceful, 1 easy, 2 normal, 3 hard. */
  difficulty: number;
  dropItem(x: number, y: number, z: number, w: number, st: ItemStack): void;
  hurtPlayer(amount: number, from: Float64Array, cause: string): void;
  explode(x: number, y: number, z: number, w: number, radius: number): void;
  shoot(from: Float64Array, vel: Float64Array, damage: number, item: number, byPlayer: boolean): void;
  /** A mob died (not by exploding): death effects. */
  mobDied?(m: Mob): void;
}

export class Mob {
  readonly id: number;
  readonly cm: CompiledMob;
  readonly pos = new Float64Array(4);
  readonly vel = new Float64Array(4);
  readonly R = Float64Array.from([1, 0, 0, 0]);
  readonly F = Float64Array.from([0, 0, 1, 0]);
  readonly H = Float64Array.from([0, 0, 0, 1]);
  health: number;
  scale: number;
  hurt = 0;
  attackCd = 0;
  age = 0;
  walk = 0;
  onGround = false;
  inWater = false;
  inLava = false;
  hitWall = false;
  // AI state
  mode: 'idle' | 'wander' | 'chase' | 'flee' | 'fuse' | 'strike' = 'idle';
  timer = 0;
  target = new Float64Array(4);
  path: number[][] = [];
  pathAge = 99;
  fuse = 0;
  /** Stalker: signed offset along the player's hidden axis. */
  lurkOffset = 0;
  awake = true;
  layTimer = 0;
  spinTimer = 4;
  burnTimer = 0;
  noiseAt: Float64Array | null = null;
  /** Within 32 blocks of the player this frame: faces and wanders relative to their slice. */
  near = false;
  constructor(id: number, cm: CompiledMob, scale: number) {
    this.id = id;
    this.cm = cm;
    this.scale = scale;
    this.health = cm.def.health * (scale < 1 ? scale : 1);
  }
  get def() {
    return this.cm.def;
  }
  get width(): number {
    return this.cm.def.width * this.scale;
  }
  get height(): number {
    return this.cm.def.height * this.scale;
  }

  /** Face horizontal direction (dx, dz, dw); keeps the frame orthonormal. */
  face(dx: number, dz: number, dw: number, hidden?: ArrayLike<number>): void {
    const l = Math.hypot(dx, dz, dw);
    if (l < 1e-6) return;
    dx /= l;
    dz /= l;
    dw /= l;
    const F = this.F, R = this.R, H = this.H;
    F[0] = dx;
    F[1] = 0;
    F[2] = dz;
    F[3] = dw;
    // H: the requested hidden axis (stalkers align with yours) or world W, made orthogonal to F.
    let hx = hidden ? hidden[0]! : 0, hz = hidden ? hidden[2]! : 0, hw = hidden ? hidden[3]! : 1;
    let dot = hx * dx + hz * dz + hw * dw;
    hx -= dot * dx;
    hz -= dot * dz;
    hw -= dot * dw;
    let hl = Math.hypot(hx, hz, hw);
    if (hl < 1e-3) {
      hx = 1;
      hz = 0;
      hw = 0;
      dot = dx;
      hx -= dot * dx;
      hz -= dot * dz;
      hw -= dot * dw;
      hl = Math.hypot(hx, hz, hw);
    }
    H[0] = hx / hl;
    H[1] = 0;
    H[2] = hz / hl;
    H[3] = hw / hl;
    // R = H x F in the (x, z, w) 3-space.
    R[0] = H[2]! * F[3]! - H[3]! * F[2]!;
    R[1] = 0;
    R[2] = H[3]! * F[0]! - H[0]! * F[3]!;
    R[3] = H[0]! * F[2]! - H[2]! * F[0]!;
  }
}

export class MobManager {
  readonly list: Mob[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private readonly pf: Pathfinder;
  private pathBudget = 0;
  /** Stats for F3. */
  packed = 0;
  kills = 0;
  private readonly gpu = new Float32Array(ENTITY_TEX_W * ENTITY_TEX_H * 4);
  private readonly lo = new Float64Array(4);
  private readonly ld = new Float64Array(4);
  private readonly pa = new Float64Array(4);
  private readonly pb = new Float64Array(4);
  private readonly tmp = new Float64Array(4);
  lastNoise: Float64Array | null = null;
  enabled = true;
  /** Host of the current update (steering reads the player's hidden axis from it). */
  private host: MobHost | null = null;

  constructor(private readonly world: World) {
    this.pf = new Pathfinder(world, 700);
  }

  get gpuData(): Float32Array {
    return this.gpu;
  }

  spawn(name: string, x: number, y: number, z: number, w: number, scale?: number): Mob | null {
    if (this.list.length >= MAX_MOBS) return null;
    const cm = MOB_REG.get(name);
    const sr = cm.def.scale;
    const sc = scale ?? (sr ? sr[0] + Math.random() * (sr[1] - sr[0]) : 1);
    const m = new Mob(this.nextId++, cm, sc);
    m.pos[0] = x;
    m.pos[1] = y;
    m.pos[2] = z;
    m.pos[3] = w;
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 2;
    m.face(Math.cos(a), Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b));
    if (cm.def.ai === 'mimic') {
      // Sit exactly in a cell, axis-aligned, like the ore block it imitates.
      m.pos[0] = Math.floor(x) + 0.5;
      m.pos[2] = Math.floor(z) + 0.5;
      m.pos[3] = Math.floor(w) + 0.5;
      m.pos[1] = Math.floor(y);
      m.face(0, 1, 0);
      m.awake = false;
    }
    if (cm.def.lays) m.layTimer = cm.def.lays.every[0] + Math.random() * (cm.def.lays.every[1] - cm.def.lays.every[0]);
    this.list.push(m);
    return m;
  }

  remove(m: Mob): void {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** A loud action (mining, fighting, sprinting): Lurkers hear it. */
  noise(pos: ArrayLike<number>): void {
    this.lastNoise = Float64Array.from([pos[0]!, pos[1]!, pos[2]!, pos[3]!]);
    for (const m of this.list) if (m.def.ai === 'lurker') m.noiseAt = this.lastNoise;
  }

  // ---------------------------------------------------------------- spawning

  private spawnCycle(h: MobHost, biomeAt: (x: number, z: number, w: number) => BiomeDef | null, caveBiomeAt: ((x: number, y: number, z: number, w: number) => number) | null): void {
    const p = h.playerPos;
    const H = h.playerHidden;
    let hostile = 0, passive = 0;
    for (const m of this.list) (m.def.hostile ? hostile++ : passive++);
    const dir = this.tmp;
    for (let attempt = 0; attempt < 8; attempt++) {
      // Half the attempts land in the player's slice (so there is something to see), the rest
      // anywhere on a 4D shell around the player (mobs live kata and ana of you too).
      const inSlice = attempt % 2 === 0;
      const d = inSlice ? 12 + Math.random() * 24 : 14 + Math.random() * 30;
      randomHorizontal(dir, inSlice ? H : null);
      const x = Math.floor(p[0]! + d * dir[0]!), z = Math.floor(p[2]! + d * dir[2]!), w = Math.floor(p[3]! + d * dir[3]!);
      const biome = biomeAt(x, z, w);
      if (!biome?.mobs) continue;
      const sky = this.world.skyHeight(x, z, w);
      const underground = Math.random() < (inSlice ? 0.25 : 0.45);
      let y = sky;
      let table: MobSpawn[] | undefined;
      if (underground) {
        y = 6 + Math.floor(Math.random() * Math.max(1, sky - 14));
        if (!this.findFloor(x, y, z, w)) continue;
        y = this.floorY;
        const light = this.world.getLight(x, y, z, w);
        if ((light & 15) > 0 || light >> 4 > 0) continue;
        const cb = caveBiomeAt?.(x, y, z, w) ?? -1;
        table = cb >= 0 ? REG.biomes[cb]!.mobs?.cave : biome.mobs.cave;
        if (!table) continue;
      } else {
        const top = this.world.getBlock(x, y, z, w) & 0xfff;
        const below = this.world.getBlock(x, y - 1, z, w) & 0xfff;
        if (REG.fluid[below] === FLUID_WATER) {
          table = biome.mobs.water;
          y = y - 1 - Math.floor(Math.random() * 3);
        } else {
          if (top !== 0 && REG.collision[top] !== COLLISION_NONE) continue;
          if (REG.collision[below] === COLLISION_NONE) continue;
          const light = this.world.getLight(x, y, z, w);
          const dark = (light & 15) < 1 && ((light >> 4) / 15) * h.daylight < 0.45;
          table = dark ? biome.mobs.night : biome.mobs.day;
        }
      }
      if (!table || table.length === 0) continue;
      const pick = this.weighted(table);
      const cm = MOB_REG.get(pick.mob);
      if (cm.def.hostile && (h.difficulty === 0 || hostile >= CAP_HOSTILE)) continue;
      if (!cm.def.hostile && passive >= CAP_PASSIVE) continue;
      const n = pick.group ? pick.group[0] + Math.floor(Math.random() * (pick.group[1] - pick.group[0] + 1)) : 1;
      for (let k = 0; k < n; k++) {
        // Herd members spread around the first one (inside the slice for in-slice spawns).
        const off = this.pa;
        if (k) randomHorizontal(off, inSlice ? H : null);
        const sp = k ? 0.6 + Math.random() * 1.4 : 0;
        const m = this.spawn(pick.mob, x + 0.5 + off[0]! * sp, y, z + 0.5 + off[2]! * sp, w + 0.5 + off[3]! * sp);
        if (!m) break;
        if (m.def.hostile) hostile++;
        else passive++;
        if (m.def.ai === 'stalker') m.lurkOffset = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
      }
    }
  }

  private floorY = 0;
  private findFloor(x: number, y: number, z: number, w: number): boolean {
    for (let yy = y; yy > 2 && yy > y - 12; yy--) {
      const a = this.world.getBlock(x, yy, z, w) & 0xfff;
      const a2 = this.world.getBlock(x, yy + 1, z, w) & 0xfff;
      const b = this.world.getBlock(x, yy - 1, z, w) & 0xfff;
      if (REG.collision[a] === COLLISION_NONE && REG.fluid[a] === 0 && REG.collision[a2] === COLLISION_NONE && REG.collision[b] !== COLLISION_NONE) {
        this.floorY = yy;
        return true;
      }
    }
    return false;
  }

  private weighted(list: MobSpawn[]): MobSpawn {
    let total = 0;
    for (const s of list) total += s.weight;
    let r = Math.random() * total;
    for (const s of list) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return list[list.length - 1]!;
  }

  // ---------------------------------------------------------------- update

  update(
    dt: number,
    h: MobHost,
    biomeAt: (x: number, z: number, w: number) => BiomeDef | null,
    caveBiomeAt: ((x: number, y: number, z: number, w: number) => number) | null,
  ): void {
    dt = Math.min(dt, 0.1);
    if (this.enabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.5;
        this.spawnCycle(h, biomeAt, caveBiomeAt);
      }
    }
    this.pathBudget = 2;
    this.host = h;
    const p = h.playerPos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i]!;
      m.age += dt;
      m.hurt = Math.max(0, m.hurt - dt);
      m.attackCd -= dt;
      const d4 = dist4(m.pos, p);
      m.near = d4 < 32;
      // Despawn far away (hostiles sooner), and hostiles on peaceful. Persistent mobs
      // (villagers) never despawn: the game saves them with their column instead.
      if (!m.def.persistent && ((m.def.hostile && (d4 > 80 || h.difficulty === 0)) || d4 > 96)) {
        this.list.splice(i, 1);
        continue;
      }
      this.think(m, dt, h, d4);
      this.physics(m, dt);
      this.environment(m, dt, h);
      if (m.health <= 0) {
        this.kill(m, h);
        continue;
      }
      if (m.pos[1]! < -20) this.list.splice(i, 1);
    }
  }

  private environment(m: Mob, dt: number, h: MobHost): void {
    const def = m.def;
    if (m.inLava && !def.fireproof) this.damage(m, 4 * dt * 2, null);
    if (def.burnsInDay && h.daylight > 0.6 && !m.inWater) {
      const top = Math.floor(m.pos[1]! + m.height);
      if (this.world.skyHeight(Math.floor(m.pos[0]!), Math.floor(m.pos[2]!), Math.floor(m.pos[3]!)) <= top) {
        m.burnTimer += dt;
        if (m.burnTimer > 1) {
          m.burnTimer = 0;
          this.damage(m, 1, null);
        }
      }
    }
    if (def.lays) {
      m.layTimer -= dt;
      if (m.layTimer <= 0) {
        m.layTimer = def.lays.every[0] + Math.random() * (def.lays.every[1] - def.lays.every[0]);
        h.dropItem(m.pos[0]!, m.pos[1]! + 0.3, m.pos[2]!, m.pos[3]!, { id: IREG.id(def.lays.item), count: 1, damage: 0 });
      }
    }
  }

  // ---------------------------------------------------------------- AI

  private steer(m: Mob, tx: number, tz: number, tw: number, speed: number, hidden?: ArrayLike<number>): void {
    const dx = tx - m.pos[0]!, dz = tz - m.pos[2]!, dw = tw - m.pos[3]!;
    const l = Math.hypot(dx, dz, dw);
    if (l < 0.05) {
      this.brake(m);
      return;
    }
    // Near the player, mobs keep their own w axis on the player's hidden axis, so the slice
    // shows their designed cross-section (legs, heads) instead of a random oblique cut.
    m.face(dx, dz, dw, hidden ?? (m.near && this.host ? this.host.playerHidden : undefined));
    const k = Math.min(1, l);
    m.vel[0] = (dx / l) * speed * k;
    m.vel[2] = (dz / l) * speed * k;
    m.vel[3] = (dw / l) * speed * k;
    m.walk += speed * 0.016 * 6;
    // Jump over one-block steps.
    if (m.hitWall && m.onGround && m.def.ai !== 'flyer' && m.def.ai !== 'swimmer') m.vel[1] = 7.8;
  }

  private brake(m: Mob): void {
    m.vel[0] = m.vel[0]! * 0.7;
    m.vel[2] = m.vel[2]! * 0.7;
    m.vel[3] = m.vel[3]! * 0.7;
  }

  private wander(m: Mob, dt: number, speed: number, fly = false): void {
    m.timer -= dt;
    if (m.timer <= 0 || m.mode !== 'wander') {
      m.mode = Math.random() < 0.35 ? 'idle' : 'wander';
      m.timer = 3 + Math.random() * 6;
      const r = 1.5 + Math.random() * 4.5;
      const dir = this.pb;
      const t = m.target;
      if (this.settles(m)) {
        // Near your slice: wander inside it (and drift into it), so animals you are looking
        // at do not keep slipping kata/ana out of view.
        randomHorizontal(dir, this.host!.playerHidden);
        this.toSlice(m, t);
        for (const k of [0, 2, 3]) t[k] = t[k]! + dir[k]! * r;
      } else {
        randomHorizontal(dir, null);
        for (const k of [0, 2, 3]) t[k] = m.pos[k]! + dir[k]! * r;
      }
      t[1] = m.pos[1]! + (fly ? (Math.random() * 2 - 1) * 2 : 0);
    }
    if (m.mode === 'idle') {
      this.brake(m);
      // Idle mobs near the slice still drift into it.
      if (this.settles(m)) {
        const t = this.pa;
        this.toSlice(m, t);
        const off = Math.hypot(t[0]! - m.pos[0]!, t[2]! - m.pos[2]!, t[3]! - m.pos[3]!);
        if (off > 0.15) this.steer(m, t[0]!, t[2]!, t[3]!, speed * 0.5);
      }
    } else this.steer(m, m.target[0]!, m.target[2]!, m.target[3]!, speed);
    if (fly) m.vel[1] = (m.target[1]! - m.pos[1]!) * 0.8;
  }

  /** Wanders relative to the player's slice: near the player and within 6 blocks of it. */
  private settles(m: Mob): boolean {
    const h = this.host;
    if (!h || !m.near || m.def.ai === 'stalker') return false;
    const H = h.playerHidden, p = h.playerPos;
    const along = (m.pos[0]! - p[0]!) * H[0]! + (m.pos[2]! - p[2]!) * H[2]! + (m.pos[3]! - p[3]!) * H[3]!;
    return Math.abs(along) < 6;
  }

  /** The mob's position moved onto the player's slice (along the hidden axis). */
  private toSlice(m: Mob, out: Float64Array): void {
    const h = this.host!;
    const H = h.playerHidden, p = h.playerPos;
    const along = (m.pos[0]! - p[0]!) * H[0]! + (m.pos[2]! - p[2]!) * H[2]! + (m.pos[3]! - p[3]!) * H[3]!;
    for (let k = 0; k < 4; k++) out[k] = m.pos[k]! - along * H[k]!;
  }

  /** Run away from the player; near their slice, inside it (so it stays in view). */
  private flee(m: Mob, p: Float64Array, speed: number): void {
    const d = this.pb;
    for (let k = 0; k < 4; k++) d[k] = k === 1 ? 0 : m.pos[k]! - p[k]!;
    const t = this.pa;
    if (this.settles(m)) {
      const H = this.host!.playerHidden;
      const a = d[0]! * H[0]! + d[2]! * H[2]! + d[3]! * H[3]!;
      for (const k of [0, 2, 3]) d[k] = d[k]! - a * H[k]!;
      this.toSlice(m, t);
    } else for (let k = 0; k < 4; k++) t[k] = m.pos[k]!;
    const l = Math.hypot(d[0]!, d[2]!, d[3]!) || 1;
    this.steer(m, t[0]! + (d[0]! / l) * 4, t[2]! + (d[2]! / l) * 4, t[3]! + (d[3]! / l) * 4, speed);
  }

  /** Walk toward the player using the 4D pathfinder (refreshed every ~1.2 s). */
  private chase(m: Mob, dt: number, p: Float64Array, speed: number): void {
    m.pathAge += dt;
    const direct = Math.hypot(p[0]! - m.pos[0]!, p[2]! - m.pos[2]!, p[3]! - m.pos[3]!) < 2.5;
    if (!direct && m.pathAge > 1.2 && this.pathBudget > 0) {
      this.pathBudget--;
      m.pathAge = Math.random() * 0.3;
      const start = [Math.floor(m.pos[0]!), Math.floor(m.pos[1]! + 0.1), Math.floor(m.pos[2]!), Math.floor(m.pos[3]!)];
      const goal = [Math.floor(p[0]!), Math.floor(p[1]! + 0.1), Math.floor(p[2]!), Math.floor(p[3]!)];
      m.path = this.pf.find(start, goal, Math.max(1, Math.ceil(m.height - 0.05)));
    }
    let tx = p[0]!, tz = p[2]!, tw = p[3]!;
    if (!direct && m.path.length) {
      const c = m.path[0]!;
      const cx = c[0]! + 0.5, cz = c[2]! + 0.5, cw = c[3]! + 0.5;
      if (Math.hypot(cx - m.pos[0]!, cz - m.pos[2]!, cw - m.pos[3]!) < 0.45) m.path.shift();
      else {
        tx = cx;
        tz = cz;
        tw = cw;
        if (c[1]! > Math.floor(m.pos[1]! + 0.1) && m.onGround) m.vel[1] = 7.8;
      }
    }
    this.steer(m, tx, tz, tw, speed);
  }

  private meleeReach(m: Mob, p: Float64Array, h: MobHost, damageScale = 1): void {
    const hd = Math.hypot(p[0]! - m.pos[0]!, p[2]! - m.pos[2]!, p[3]! - m.pos[3]!);
    const dy = p[1]! - m.pos[1]!;
    if (hd < m.width + 0.75 && dy > -m.height && dy < 1.6 && m.attackCd <= 0 && h.playerTargetable) {
      m.attackCd = 1;
      const mult = h.difficulty === 1 ? 0.5 : h.difficulty === 3 ? 1.5 : 1;
      h.hurtPlayer((m.def.damage ?? 2) * mult * damageScale * Math.max(0.5, m.scale), m.pos, m.def.displayName);
    }
  }

  /**
   * Spinners (Web Weavers) put a block 1.5 cells from the player on the line toward
   * themselves: when the weaver is kata or ana of you, the web lands off your slice too.
   */
  private spin(m: Mob, dt: number, h: MobHost, d4: number): void {
    const s = m.def.spins!;
    m.spinTimer -= dt;
    if (m.spinTimer > 0 || !h.playerTargetable || d4 > 10 || d4 < 2) return;
    m.spinTimer = s.every[0] + Math.random() * (s.every[1] - s.every[0]);
    const p = h.playerPos;
    const dx = m.pos[0]! - p[0]!, dz = m.pos[2]! - p[2]!, dw = m.pos[3]! - p[3]!;
    const l = Math.hypot(dx, dz, dw) || 1;
    const x = Math.floor(p[0]! + (dx / l) * 1.5), y = Math.floor(p[1]! + 0.2), z = Math.floor(p[2]! + (dz / l) * 1.5), w = Math.floor(p[3]! + (dw / l) * 1.5);
    const block = REG.id(s.block);
    for (let k = 0; k < 2; k++) if (this.world.getBlock(x, y + k, z, w) === 0) this.world.setBlock(x, y + k, z, w, block);
  }

  private think(m: Mob, dt: number, h: MobHost, d4: number): void {
    const def = m.def;
    const p = h.playerPos;
    const sp = def.speed;
    const seePlayer = h.playerTargetable && d4 < 18;
    if (def.spins && seePlayer) this.spin(m, dt, h, d4);
    switch (def.ai) {
      case 'passive': {
        if (m.mode === 'flee' && m.timer > 0) {
          m.timer -= dt;
          this.flee(m, p, sp * 1.5);
        } else this.wander(m, dt, sp);
        break;
      }
      case 'melee':
      case 'climber':
      case 'golem': {
        if (seePlayer && def.hostile) {
          this.chase(m, dt, p, sp);
          this.meleeReach(m, p, h);
        } else this.wander(m, dt, sp * 0.6);
        if (def.ai === 'climber' && m.hitWall) m.vel[1] = 3; // climbs walls
        if (def.ai === 'golem') {
          // Drifts slowly back and forth along W: it slips in and out of your slice.
          m.vel[3] = m.vel[3]! + Math.sin(m.age * 0.8) * 1.2;
        }
        break;
      }
      case 'ranged': {
        if (!seePlayer) {
          this.wander(m, dt, sp * 0.6);
          break;
        }
        if (d4 > 11) this.chase(m, dt, p, sp);
        else if (d4 < 5) this.steer(m, m.pos[0]! * 2 - p[0]!, m.pos[2]! * 2 - p[2]!, m.pos[3]! * 2 - p[3]!, sp);
        else {
          this.brake(m);
          m.face(p[0]! - m.pos[0]!, p[2]! - m.pos[2]!, p[3]! - m.pos[3]!);
        }
        const pr = def.projectile!;
        if (m.attackCd <= 0 && d4 < 16 && this.lineOfSight(m, p)) {
          m.attackCd = pr.cooldown;
          const from = Float64Array.from([m.pos[0]!, m.pos[1]! + m.height * 0.8, m.pos[2]!, m.pos[3]!]);
          const v = new Float64Array(4);
          let l = 0;
          for (let k = 0; k < 4; k++) {
            v[k] = p[k]! + (k === 1 ? 1.2 + d4 * 0.06 : 0) - from[k]!;
            l += v[k]! * v[k]!;
          }
          l = Math.sqrt(l);
          for (let k = 0; k < 4; k++) v[k] = (v[k]! / l) * 22 + (Math.random() - 0.5) * 0.8;
          h.shoot(from, v, pr.damage * (h.difficulty === 1 ? 0.5 : h.difficulty === 3 ? 1.5 : 1), IREG.id(pr.item), false);
        }
        break;
      }
      case 'exploder': {
        const bl = def.blast!;
        if (m.mode === 'fuse') {
          this.brake(m);
          m.fuse += dt;
          if (d4 > 5) {
            m.mode = 'chase';
            m.fuse = 0;
          } else if (m.fuse >= bl.fuse) {
            m.health = -1e9; // removed without drops by kill() below
            h.explode(m.pos[0]!, m.pos[1]! + 0.8, m.pos[2]!, m.pos[3]!, bl.radius);
            m.mode = 'idle';
          }
        } else if (seePlayer) {
          this.chase(m, dt, p, sp);
          if (d4 < 2.4) {
            m.mode = 'fuse';
            m.fuse = 0;
          } else m.mode = 'chase';
        } else this.wander(m, dt, sp * 0.6);
        break;
      }
      case 'stalker': {
        // Hides off your slice along YOUR hidden axis, closes in, then steps into the slice
        // to strike and retreats. Thin along its own w (aligned with your hidden axis), so it
        // is invisible until the strike; the proximity indicator warns you (R2).
        const H = h.playerHidden;
        if (!seePlayer) {
          this.wander(m, dt, sp * 0.5);
          break;
        }
        if (m.lurkOffset === 0) m.lurkOffset = (Math.random() < 0.5 ? -1 : 1) * 6;
        let inPlane = 0;
        const rel = this.tmp;
        for (let k = 0; k < 4; k++) rel[k] = m.pos[k]! - p[k]!;
        const along = rel[0]! * H[0]! + rel[2]! * H[2]! + rel[3]! * H[3]!;
        for (let k = 0; k < 4; k++) if (k !== 1) inPlane += (rel[k]! - along * H[k]!) ** 2;
        inPlane = Math.sqrt(inPlane);
        if (m.mode === 'strike') {
          m.timer -= dt;
          // Slide along H into the slice.
          const tx = p[0]! + H[0]! * 0, tz = p[2]!, tw = p[3]!;
          this.steer(m, tx, tz, tw, sp * 1.4, H);
          this.meleeReach(m, p, h);
          if (m.attackCd > 0.5 || m.timer <= 0) {
            m.mode = 'chase';
            m.lurkOffset = (along >= 0 ? 1 : -1) * (5 + Math.random() * 3);
          }
        } else {
          m.mode = 'chase';
          // Target: the player's position shifted along H by lurkOffset, approaching in-plane.
          const off = m.lurkOffset;
          const tx = p[0]! + H[0]! * off, tz = p[2]! + H[2]! * off, tw = p[3]! + H[3]! * off;
          this.steer(m, tx, tz, tw, sp, H);
          if (inPlane < 2.2 && Math.abs(along - off) < 1.5) {
            m.mode = 'strike';
            m.timer = 2.5;
          }
        }
        // Keep its thin axis aligned with the player's hidden axis.
        const f = m.F;
        m.face(f[0]!, f[2]!, f[3]!, H);
        break;
      }
      case 'hopper': {
        if (m.onGround) {
          this.brake(m);
          m.timer -= dt;
          if (m.timer <= 0) {
            m.timer = 0.6 + Math.random() * 1.2;
            let tx: number, tz: number, tw: number;
            if (def.hostile && seePlayer) {
              tx = p[0]!;
              tz = p[2]!;
              tw = p[3]!;
            } else {
              tx = m.pos[0]! + Math.random() * 8 - 4;
              tz = m.pos[2]! + Math.random() * 8 - 4;
              tw = m.pos[3]! + Math.random() * 8 - 4;
            }
            const dx = tx - m.pos[0]!, dz = tz - m.pos[2]!, dw = tw - m.pos[3]!;
            const l = Math.hypot(dx, dz, dw) || 1;
            m.face(dx, dz, dw);
            const s = sp * 1.6;
            m.vel[0] = (dx / l) * s;
            m.vel[2] = (dz / l) * s;
            m.vel[3] = (dw / l) * s;
            m.vel[1] = 6 + m.scale * 1.5;
          }
        }
        if (def.hostile) this.meleeReach(m, p, h);
        break;
      }
      case 'flyer': {
        if (def.hostile && seePlayer) {
          this.steer(m, p[0]!, p[2]!, p[3]!, sp);
          m.vel[1] = (p[1]! + 1 - m.pos[1]!) * 1.5;
          this.meleeReach(m, p, h);
        } else {
          this.wander(m, dt, sp, true);
          if (def.name === 'glass_moth') this.seekLight(m, dt);
        }
        break;
      }
      case 'swimmer': {
        if (m.inWater) {
          if (def.hostile && seePlayer && h.playerInWater) {
            this.steer(m, p[0]!, p[2]!, p[3]!, sp);
            m.vel[1] = (p[1]! - m.pos[1]!) * 1.2;
            this.meleeReach(m, p, h);
          } else this.wander(m, dt, sp, true);
        } else if (def.hostile && seePlayer) {
          this.chase(m, dt, p, sp * 0.7);
          this.meleeReach(m, p, h);
        } else this.brake(m);
        break;
      }
      case 'mimic': {
        if (!m.awake) {
          m.vel[0] = 0;
          m.vel[2] = 0;
          m.vel[3] = 0;
          if (d4 < 3 && h.playerTargetable) m.awake = true;
          break;
        }
        if (m.onGround) {
          m.timer -= dt;
          if (m.timer <= 0) {
            m.timer = 0.8;
            const dx = p[0]! - m.pos[0]!, dz = p[2]! - m.pos[2]!, dw = p[3]! - m.pos[3]!;
            const l = Math.hypot(dx, dz, dw) || 1;
            m.vel[0] = (dx / l) * sp * 2;
            m.vel[2] = (dz / l) * sp * 2;
            m.vel[3] = (dw / l) * sp * 2;
            m.vel[1] = 6;
          } else this.brake(m);
        }
        this.meleeReach(m, p, h);
        break;
      }
      case 'lurker': {
        const n = m.noiseAt;
        if (seePlayer && n && dist4(n, m.pos) < 20) {
          this.steer(m, n[0]!, n[2]!, n[3]!, sp);
          if (dist4(n, m.pos) < 1.5) m.noiseAt = null;
          this.meleeReach(m, p, h);
        } else this.wander(m, dt, sp * 0.3);
        break;
      }
    }
  }

  private seekLight(m: Mob, dt: number): void {
    m.timer -= dt * 0.2;
    // Every few seconds, look for a bright block nearby and flutter toward it.
    if (Math.random() < dt * 0.4) {
      for (let k = 0; k < 24; k++) {
        const x = Math.floor(m.pos[0]! + Math.random() * 16 - 8), y = Math.floor(m.pos[1]! + Math.random() * 8 - 4);
        const z = Math.floor(m.pos[2]! + Math.random() * 16 - 8), w = Math.floor(m.pos[3]! + Math.random() * 16 - 8);
        if (REG.emission[this.world.getBlock(x, y, z, w) & 0xfff]! >= 10) {
          m.target[0] = x + 0.5;
          m.target[1] = y + 1.2;
          m.target[2] = z + 0.5;
          m.target[3] = w + 0.5;
          m.mode = 'wander';
          m.timer = 6;
          break;
        }
      }
    }
  }

  private lineOfSight(m: Mob, p: Float64Array): boolean {
    const a = this.pa, b = this.pb;
    a[0] = m.pos[0]!;
    a[1] = m.pos[1]! + m.height * 0.85;
    a[2] = m.pos[2]!;
    a[3] = m.pos[3]!;
    b[0] = p[0]!;
    b[1] = p[1]! + 1.5;
    b[2] = p[2]!;
    b[3] = p[3]!;
    const d = dist4(a, b);
    const n = Math.ceil(d * 3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const v = this.world.getBlock(Math.floor(a[0]! + (b[0]! - a[0]!) * t), Math.floor(a[1]! + (b[1]! - a[1]!) * t), Math.floor(a[2]! + (b[2]! - a[2]!) * t), Math.floor(a[3]! + (b[3]! - a[3]!) * t));
      if (REG.opaque[v & 0xfff]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- physics

  private physics(m: Mob, dt: number): void {
    const flyer = m.def.ai === 'flyer';
    const swimmer = m.def.ai === 'swimmer';
    this.sampleFluids(m);
    if (flyer) {
      m.vel[1] = Math.max(-4, Math.min(4, m.vel[1]!));
    } else if (m.inWater && swimmer) {
      m.vel[1] = m.vel[1]! * Math.exp(-2 * dt);
    } else if (m.inWater || m.inLava) {
      m.vel[1] = m.vel[1]! - 6 * dt;
      m.vel[1] = Math.max(m.vel[1]!, -3);
      if (m.hitWall || m.vel[1]! < 0) m.vel[1] = m.vel[1]! + 10 * dt; // paddle up
    } else {
      m.vel[1] = Math.max(-40, m.vel[1]! - 28 * dt);
    }
    const steps = Math.max(1, Math.ceil((Math.hypot(m.vel[0]!, m.vel[1]!, m.vel[2]!, m.vel[3]!) * dt) / 0.3));
    const sdt = dt / steps;
    m.onGround = false;
    m.hitWall = false;
    for (let s = 0; s < steps; s++) {
      if (this.moveAxis(m, 1, m.vel[1]! * sdt)) {
        if (m.vel[1]! < 0) m.onGround = true;
        m.vel[1] = 0;
      }
      for (const a of [0, 2, 3]) {
        if (this.moveAxis(m, a, m.vel[a]! * sdt)) {
          m.vel[a] = 0;
          m.hitWall = true;
        }
      }
    }
  }

  private sampleFluids(m: Mob): void {
    const v = this.world.getBlock(Math.floor(m.pos[0]!), Math.floor(m.pos[1]! + Math.min(0.5, m.height * 0.5)), Math.floor(m.pos[2]!), Math.floor(m.pos[3]!)) & 0xfff;
    m.inWater = REG.fluid[v] === FLUID_WATER;
    m.inLava = REG.fluid[v] === FLUID_LAVA;
  }

  private overlaps(m: Mob): boolean {
    const hw = m.width, ht = m.height;
    const p = m.pos;
    const x0 = Math.floor(p[0]! - hw), x1 = Math.floor(p[0]! + hw - 1e-6);
    const y0 = Math.floor(p[1]!), y1 = Math.floor(p[1]! + ht - 1e-6);
    const z0 = Math.floor(p[2]! - hw), z1 = Math.floor(p[2]! + hw - 1e-6);
    const w0 = Math.floor(p[3]! - hw), w1 = Math.floor(p[3]! + hw - 1e-6);
    for (let y = y0; y <= y1; y++)
      for (let w = w0; w <= w1; w++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) if (REG.collision[this.world.getBlock(x, y, z, w) & 0xfff] !== COLLISION_NONE) return true;
    return false;
  }

  /** Move along one world axis; on collision back off to the contact point. */
  private moveAxis(m: Mob, axis: number, d: number): boolean {
    if (d === 0) return false;
    const p = m.pos;
    const old = p[axis]!;
    p[axis] = old + d;
    if (!this.overlaps(m)) return false;
    let lo = 0, hi = 1;
    for (let i = 0; i < 5; i++) {
      const mid = (lo + hi) / 2;
      p[axis] = old + d * mid;
      if (this.overlaps(m)) hi = mid;
      else lo = mid;
    }
    p[axis] = old + d * lo;
    return true;
  }

  // ---------------------------------------------------------------- combat

  /**
   * Damage a mob. `from` (a 4D point, e.g. the attacker) sets the knockback direction; null
   * for environmental damage. Returns false if the hit was ignored.
   */
  damage(m: Mob, amount: number, from: ArrayLike<number> | null, eye?: ArrayLike<number>, hidden?: ArrayLike<number>): boolean {
    if (m.hurt > 0 && from) return false;
    if (m.def.sliceBound && eye && hidden) {
      // Only while its cross-section is inside your slice.
      let d = 0;
      for (let k = 0; k < 4; k++) d += (m.pos[k]! - eye[k]!) * hidden[k]!;
      if (Math.abs(d) > 0.3 * m.scale) return false;
    }
    m.health -= amount;
    if (from) {
      m.hurt = 0.45;
      const dx = m.pos[0]! - from[0]!, dz = m.pos[2]! - from[2]!, dw = m.pos[3]! - from[3]!;
      const l = Math.hypot(dx, dz, dw) || 1;
      const kb = m.def.ai === 'golem' ? 1.2 : 3.6;
      m.vel[0] = (dx / l) * kb;
      m.vel[2] = (dz / l) * kb;
      m.vel[3] = (dw / l) * kb;
      m.vel[1] = 3.6;
      if (!m.def.hostile) {
        m.mode = 'flee';
        m.timer = 5;
      }
      m.awake = true;
    } else m.hurt = Math.max(m.hurt, 0.2);
    return true;
  }

  private kill(m: Mob, h: MobHost): void {
    this.remove(m);
    if (m.health < -1e8) return; // exploded
    this.kills++;
    h.mobDied?.(m);
    for (const d of m.cm.drops) {
      if (Math.random() >= d.chance) continue;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (n > 0) h.dropItem(m.pos[0]!, m.pos[1]! + 0.4, m.pos[2]!, m.pos[3]!, { id: d.item, count: n, damage: 0 });
    }
    const sp = m.def.splits;
    if (sp && m.scale > 0.45) {
      for (let k = 0; k < sp; k++) {
        const c = this.spawn(m.def.name, m.pos[0]! + Math.random() - 0.5, m.pos[1]! + 0.2, m.pos[2]! + Math.random() - 0.5, m.pos[3]! + Math.random() - 0.5, m.scale * 0.5);
        if (c) {
          c.vel[1] = 4;
          c.health = Math.max(1, m.def.health * m.scale * 0.5);
        }
      }
    }
  }

  // ---------------------------------------------------------------- picking and rendering

  /** Mob hit by a ray (world coords), nearest first; returns t or Infinity. */
  pick(o: ArrayLike<number>, d: ArrayLike<number>, maxT: number, out: { mob: Mob | null }): number {
    let best = maxT;
    out.mob = null;
    const lo = this.lo, ld = this.ld;
    for (const m of this.list) {
      const r = m.cm.radius * m.scale;
      if (rayBall(o, d, m.pos, r) > best) continue;
      this.toLocal(m, o, d, lo, ld);
      const t = this.rayParts(m, lo, ld) * m.scale;
      if (t < best) {
        best = t;
        out.mob = m;
      }
    }
    return out.mob ? best : Infinity;
  }

  /**
   * Aim assist for when the exact pick misses: each mob whose body crosses the slice counts
   * as an upright capsule (its hitbox) inflated by `assist` blocks. Returns t or Infinity.
   */
  pickAssist(o: ArrayLike<number>, d: ArrayLike<number>, maxT: number, assist: number, hidden: ArrayLike<number>, out: { mob: Mob | null }): number {
    let best = maxT;
    out.mob = null;
    const a = this.pa, b = this.pb;
    for (const m of this.list) {
      // Only mobs you can actually see (their body crosses the view hyperplane).
      let dh = 0;
      for (let k = 0; k < 4; k++) dh += (m.pos[k]! - o[k]!) * hidden[k]!;
      const wdt = m.width;
      if (Math.abs(dh) > wdt * 0.85) continue;
      // An upright capsule along the body's height, as wide as the hitbox plus the assist.
      const r = wdt + assist;
      const ht = m.height;
      for (let k = 0; k < 4; k++) {
        a[k] = m.pos[k]!;
        b[k] = m.pos[k]!;
      }
      a[1] = a[1]! + Math.min(0.2, ht * 0.25);
      b[1] = b[1]! + Math.max(ht - 0.2, ht * 0.75);
      const t = rayCapsule(o, d, a, b, r);
      if (t < best) {
        best = t;
        out.mob = m;
      }
    }
    return out.mob ? best : Infinity;
  }

  private toLocal(m: Mob, o: ArrayLike<number>, d: ArrayLike<number>, lo: Float64Array, ld: Float64Array): void {
    const R = m.R, F = m.F, H = m.H;
    const ox = o[0]! - m.pos[0]!, oy = o[1]! - m.pos[1]!, oz = o[2]! - m.pos[2]!, ow = o[3]! - m.pos[3]!;
    const s = 1 / m.scale;
    lo[0] = (ox * R[0]! + oz * R[2]! + ow * R[3]!) * s;
    lo[1] = oy * s;
    lo[2] = (ox * F[0]! + oz * F[2]! + ow * F[3]!) * s;
    lo[3] = (ox * H[0]! + oz * H[2]! + ow * H[3]!) * s;
    ld[0] = d[0]! * R[0]! + d[2]! * R[2]! + d[3]! * R[3]!;
    ld[1] = d[1]!;
    ld[2] = d[0]! * F[0]! + d[2]! * F[2]! + d[3]! * F[3]!;
    ld[3] = d[0]! * H[0]! + d[2]! * H[2]! + d[3]! * H[3]!;
  }

  private rayParts(m: Mob, lo: Float64Array, ld: Float64Array): number {
    let best = Infinity;
    const parts = m.def.parts;
    const a = this.pa, b = this.pb;
    for (let i = 0; i < parts.length; i++) {
      const pt = parts[i]!;
      this.animate(m, i, a, b);
      const t = pt.kind === 'box' ? rayBox(lo, ld, a, pt.size!) : pt.kind === 'ball' ? rayBall(lo, ld, a, pt.r!) : rayCapsule(lo, ld, a, b, pt.r!);
      if (t < best) best = t;
    }
    return best;
  }

  /** Animated part position (A and, for capsules, B) in local coordinates. */
  private animate(m: Mob, i: number, a: Float64Array, b: Float64Array): void {
    const pt = m.def.parts[i]!;
    for (let k = 0; k < 4; k++) {
      a[k] = pt.at[k]!;
      b[k] = pt.to ? pt.to[k]! : 0;
    }
    const ph = pt.phase ?? 0;
    const moving = Math.min(1, Math.hypot(m.vel[0]!, m.vel[2]!, m.vel[3]!) / Math.max(0.5, m.def.speed));
    switch (pt.anim) {
      case 'leg': {
        const s = Math.sin(m.walk + ph) * 0.14 * moving;
        a[2] = a[2]! + s;
        b[2] = b[2]! + s;
        break;
      }
      case 'head':
        a[1] = a[1]! + Math.sin(m.age * 2 + ph) * 0.02;
        break;
      case 'wing': {
        const s = Math.sin(m.age * 18 + ph) * 0.08;
        a[1] = a[1]! + s;
        break;
      }
      case 'tail': {
        const s = Math.sin(m.age * 4 + ph) * 0.08;
        b[0] = b[0]! + s;
        break;
      }
      case 'pulse':
        break;
    }
    // Exploder fuse: the body pulses through its own W axis (the cross-section flickers).
    if (m.mode === 'fuse' && m.def.blast) {
      const s = Math.sin(m.fuse * 30) * 0.3 * Math.min(1, m.fuse / m.def.blast.fuse + 0.3);
      a[3] = a[3]! + s;
      b[3] = b[3]! + s;
    }
  }

  /**
   * Pack mobs whose bounding 4-ball crosses the view hyperplane into the entity texture
   * buffer. `origin` = window origin (world coords of the texture space). Returns the count.
   */
  pack(eye: ArrayLike<number>, cam: Frame4, maxDist: number, origin: ArrayLike<number>): number {
    const g = this.gpu;
    const H = cam.hidden;
    let n = 0;
    const a = this.pa, b = this.pb;
    let part = 0;
    for (const m of this.list) {
      if (n >= MAX_GPU_MOBS) break;
      const r = m.cm.radius * m.scale;
      let dh = 0, d2 = 0;
      for (let k = 0; k < 4; k++) {
        const dk = m.pos[k]! - eye[k]!;
        dh += dk * H[k]!;
        d2 += dk * dk;
      }
      if (Math.abs(dh) > r || d2 > (maxDist + r) * (maxDist + r)) continue;
      const parts = m.def.parts;
      const e = n * MOB_TEXELS * 4;
      for (let k = 0; k < 4; k++) {
        g[e + k] = m.pos[k]! - origin[k]!;
        g[e + 4 + k] = m.R[k]!;
        g[e + 8 + k] = m.F[k]!;
        g[e + 12 + k] = m.H[k]!;
      }
      g[e + 16] = r;
      g[e + 17] = part;
      g[e + 18] = parts.length;
      g[e + 19] = m.hurt > 0 ? 1 : 0;
      g[e + 20] = m.scale;
      g[e + 21] = m.mode === 'fuse' ? 0.5 + 0.5 * Math.sin(m.fuse * 30) : 0;
      g[e + 22] = 0;
      g[e + 23] = 0;
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i]!;
        this.animate(m, i, a, b);
        const o = (PART_BASE + (part + i) * PART_TEXELS) * 4;
        g[o] = pt.kind === 'box' ? 0 : pt.kind === 'ball' ? 1 : 2;
        g[o + 1] = pt.r ?? 0;
        g[o + 2] = pt.glow ? 1 : 0;
        g[o + 3] = 0;
        for (let k = 0; k < 4; k++) {
          g[o + 4 + k] = a[k]!;
          g[o + 8 + k] = pt.kind === 'box' ? pt.size![k]! : b[k]!;
        }
        g[o + 12] = m.cm.colors[i * 3]!;
        g[o + 13] = m.cm.colors[i * 3 + 1]!;
        g[o + 14] = m.cm.colors[i * 3 + 2]!;
        g[o + 15] = 0;
      }
      part += parts.length;
      n++;
    }
    this.packed = n;
    return n;
  }

  /** Nearest hostile mobs for the proximity indicator (R2). */
  threats(p: ArrayLike<number>, radius: number, out: Mob[]): number {
    out.length = 0;
    for (const m of this.list) if (m.def.hostile && dist4(m.pos, p) < radius) out.push(m);
    out.sort((x, y) => dist4(x.pos, p) - dist4(y.pos, p));
    return out.length;
  }
}

/**
 * A random unit direction in the horizontal 3-space (x, z, w); with `hidden`, restricted to
 * the plane orthogonal to it (the player's slice).
 */
function randomHorizontal(out: Float64Array, hidden: ArrayLike<number> | null): void {
  for (let tries = 0; tries < 8; tries++) {
    let x = Math.random() * 2 - 1, z = Math.random() * 2 - 1, w = Math.random() * 2 - 1;
    if (hidden) {
      const d = x * hidden[0]! + z * hidden[2]! + w * hidden[3]!;
      x -= d * hidden[0]!;
      z -= d * hidden[2]!;
      w -= d * hidden[3]!;
    }
    const l = Math.hypot(x, z, w);
    if (l < 0.1 || l > 1) continue;
    out[0] = x / l;
    out[1] = 0;
    out[2] = z / l;
    out[3] = w / l;
    return;
  }
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
}

function dist4(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dx = a[0]! - b[0]!, dy = a[1]! - b[1]!, dz = a[2]! - b[2]!, dw = a[3]! - b[3]!;
  return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
}
