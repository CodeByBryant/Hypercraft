// Ambient biome particles (dust, leaves, petals, snow, spores, fireflies, ash, embers,
// bubbles, motes), driven by each biome's `particles` list.
//
// Every particle is a tiny 4-ball in world space. What you see is its cross-section with
// the view hyperplane: a disc whose radius is sqrt(R^2 - d^2), d being the particle's
// distance from the slice. Particles spawn inside that thin slab and drift slowly along W,
// so they swell and fade as they cross your slice, and moving kata/ana sweeps through them.
// The update path allocates nothing.

import type { BiomeDef, ParticleDef } from '../content/types';
import { FLUID_LAVA, FLUID_NONE, FLUID_WATER, REG, hexToRgb } from '../content/registry';
import type { Frame4 } from '../math/frame';
import type { SpriteBatch } from '../render/SpriteBatch';
import { SPRITE_FLAKE, SPRITE_GLOW, SPRITE_SOFT, SPRITE_SQUARE } from '../render/SpriteBatch';
import type { World } from '../world/World';

/** Biome particle kinds plus effect kinds used by bursts (hits, deaths, explosions). */
type Kind = ParticleDef['kind'] | 'smoke' | 'spark' | 'poof';
export type BurstKind = 'smoke' | 'spark' | 'poof';

interface KindCfg {
  shape: number;
  /** 4-ball radius. */
  size: number;
  life: [number, number];
  /** Vertical speed range (up is +). */
  vy: [number, number];
  /** Random horizontal drift speed. */
  drift: number;
  /** Sideways sway amplitude (m/s). */
  sway: number;
  spin: number;
  /** Spawn height range relative to the eye. */
  y: [number, number];
  /** Needs open sky above the spawn point (weather-like particles). */
  sky: boolean;
  /** Only in water. */
  water: boolean;
  /** Random-walk (fireflies). */
  wander: number;
  /** Downward acceleration (effect particles) and velocity damping per second. */
  gravity?: number;
  drag?: number;
}

const K: Record<Kind, KindCfg> = {
  dust: { shape: SPRITE_SOFT, size: 0.035, life: [5, 8], vy: [-0.05, 0.05], drift: 0.25, sway: 0.1, spin: 0, y: [-2, 5], sky: false, water: false, wander: 0 },
  leaf: { shape: SPRITE_SQUARE, size: 0.075, life: [7, 10], vy: [-0.7, -0.4], drift: 0.3, sway: 0.9, spin: 2.2, y: [3, 11], sky: false, water: false, wander: 0 },
  petal: { shape: SPRITE_SQUARE, size: 0.06, life: [7, 10], vy: [-0.55, -0.3], drift: 0.4, sway: 1.1, spin: 2.6, y: [3, 11], sky: false, water: false, wander: 0 },
  snow: { shape: SPRITE_FLAKE, size: 0.06, life: [6, 9], vy: [-1.3, -0.8], drift: 0.3, sway: 0.45, spin: 0.8, y: [5, 14], sky: true, water: false, wander: 0 },
  ash: { shape: SPRITE_SQUARE, size: 0.045, life: [6, 10], vy: [-0.45, -0.2], drift: 0.45, sway: 0.3, spin: 1.4, y: [2, 12], sky: true, water: false, wander: 0 },
  spore: { shape: SPRITE_GLOW, size: 0.05, life: [6, 10], vy: [0.08, 0.3], drift: 0.15, sway: 0.25, spin: 0, y: [-3, 5], sky: false, water: false, wander: 0 },
  firefly: { shape: SPRITE_GLOW, size: 0.06, life: [5, 9], vy: [-0.1, 0.1], drift: 0.2, sway: 0, spin: 0, y: [-1, 3], sky: false, water: false, wander: 1.4 },
  ember: { shape: SPRITE_GLOW, size: 0.045, life: [3, 6], vy: [0.6, 1.3], drift: 0.35, sway: 0.2, spin: 0, y: [-3, 4], sky: false, water: false, wander: 0 },
  bubble: { shape: SPRITE_SOFT, size: 0.05, life: [3, 6], vy: [0.7, 1.2], drift: 0.1, sway: 0.2, spin: 0, y: [-4, 3], sky: false, water: true, wander: 0 },
  mote: { shape: SPRITE_GLOW, size: 0.05, life: [6, 11], vy: [-0.1, 0.15], drift: 0.2, sway: 0.2, spin: 0, y: [-2, 7], sky: false, water: false, wander: 0.4 },
  smoke: { shape: SPRITE_SOFT, size: 0.22, life: [0.9, 1.6], vy: [0.6, 1.2], drift: 0, sway: 0.1, spin: 0, y: [0, 0], sky: false, water: false, wander: 0, drag: 1.8 },
  spark: { shape: SPRITE_GLOW, size: 0.06, life: [0.4, 0.8], vy: [0, 0], drift: 0, sway: 0, spin: 0, y: [0, 0], sky: false, water: false, wander: 0, gravity: 14, drag: 1.2 },
  poof: { shape: SPRITE_SOFT, size: 0.14, life: [0.5, 0.9], vy: [0.3, 0.8], drift: 0, sway: 0.05, spin: 0, y: [0, 0], sky: false, water: false, wander: 0, drag: 2.5 },
};

const MAX = 768;
/** Spawn disc radius around the player, in the slice. */
const SPAWN_R = 14;

export class Particles {
  private readonly pos = new Float64Array(MAX * 4);
  private readonly vel = new Float32Array(MAX * 4);
  private readonly age = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly rad = new Float32Array(MAX);
  private readonly col = new Float32Array(MAX * 3);
  private readonly kind = new Uint8Array(MAX);
  private readonly glow = new Uint8Array(MAX);
  private readonly phase = new Float32Array(MAX);
  private count = 0;
  private readonly acc = new Float32Array(16);
  private readonly kinds: Kind[] = Object.keys(K) as Kind[];
  private readonly colors = new Map<string, [number, number, number]>();
  /** 0 = off, 1 = full. */
  density = 1;
  /** Visible particles last frame (debug). */
  visible = 0;

  get alive(): number {
    return this.count;
  }

  clear(): void {
    this.count = 0;
  }

  private rgb(hex: string): [number, number, number] {
    let c = this.colors.get(hex);
    if (!c) {
      const [r, g, b] = hexToRgb(hex);
      c = [r, g, b];
      this.colors.set(hex, c);
    }
    return c;
  }

  /**
   * Advance, spawn for the biome around the eye, and emit sprites. `biome` may be null
   * (unloaded); `daylight` 0..1 drives night-only particles and lighting.
   */
  update(dt: number, world: World, eye: Float64Array, cam: Frame4, biome: BiomeDef | null, daylight: number, eyeInWater: boolean, out: SpriteBatch): void {
    dt = Math.min(dt, 0.1);
    this.step(dt, world);
    if (biome?.particles && this.density > 0) this.spawn(dt, world, eye, cam, biome.particles, daylight, eyeInWater);
    this.emit(world, eye, cam, daylight, out);
  }

  /**
   * Effect burst at a 4D point (hits, deaths, explosions). Particles fly out within the
   * current slice (R, up, F) with a tiny spread along the hidden axis, so a burst you see
   * happen stays visible; `spread` scatters the start points (explosions).
   */
  burst(x: number, y: number, z: number, w: number, cam: Frame4, kind: BurstKind, color: string, n: number, speed: number, spread = 0.2, glow = false): void {
    const cfg = K[kind];
    const c = this.rgb(color);
    const R = cam.R, F = cam.F, H = cam.hidden;
    const up = cam.upAxis;
    for (let j = 0; j < n && this.count < MAX; j++) {
      const i = this.count++;
      const o = i * 4;
      // Random direction in the slice's 3-space (R, up, F).
      let a = Math.random() * 2 - 1, b = Math.random() * 2 - 1, f = Math.random() * 2 - 1;
      const l = Math.hypot(a, b, f) || 1;
      a /= l;
      b /= l;
      f /= l;
      const s = speed * (0.4 + Math.random() * 0.6);
      const r0 = spread * Math.random();
      const size = cfg.size * (0.7 + Math.random() * 0.6);
      const dh = (Math.random() * 2 - 1) * size * 0.5;
      for (let k = 0; k < 4; k++) {
        const dir = a * R[k]! + f * F[k]! + (k === up ? b : 0);
        this.pos[o + k] = (k === 0 ? x : k === 1 ? y : k === 2 ? z : w) + dir * r0 + dh * H[k]!;
        this.vel[o + k] = dir * s;
      }
      this.vel[o + up] = this.vel[o + up]! + cfg.vy[0] + Math.random() * (cfg.vy[1] - cfg.vy[0]);
      this.col[i * 3] = c[0];
      this.col[i * 3 + 1] = c[1];
      this.col[i * 3 + 2] = c[2];
      this.age[i] = 0;
      this.life[i] = cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]);
      this.rad[i] = size;
      this.kind[i] = this.kinds.indexOf(kind);
      this.glow[i] = glow ? 1 : 0;
      this.phase[i] = Math.random() * 6.28;
    }
  }

  private step(dt: number, world: World): void {
    let n = this.count;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < n; i++) {
      this.age[i] = this.age[i]! + dt;
      let dead = this.age[i]! >= this.life[i]!;
      if (!dead) {
        const cfg = K[this.kinds[this.kind[i]!]!];
        const o = i * 4;
        if (cfg.wander > 0) {
          for (let a = 0; a < 4; a++) {
            const j = a === 1 ? 0.3 : a === 3 ? 0.15 : 1;
            V[o + a] = V[o + a]! * (1 - dt * 0.8) + (Math.random() - 0.5) * cfg.wander * dt * 4 * j;
          }
        }
        if (cfg.gravity) V[o + 1] = V[o + 1]! - cfg.gravity * dt;
        if (cfg.drag) {
          const k = Math.max(0, 1 - cfg.drag * dt);
          for (let a = 0; a < 4; a++) V[o + a] = V[o + a]! * k;
        }
        const ph = this.phase[i]! + this.age[i]! * 1.7;
        const sway = cfg.sway * Math.sin(ph);
        P[o] = P[o]! + (V[o]! + sway * 0.7) * dt;
        P[o + 1] = P[o + 1]! + V[o + 1]! * dt;
        P[o + 2] = P[o + 2]! + (V[o + 2]! + sway * 0.7 * Math.cos(ph * 0.7)) * dt;
        P[o + 3] = P[o + 3]! + V[o + 3]! * dt;
        // Particles die inside solid blocks (and bubbles when they leave water).
        const v = world.getBlock(Math.floor(P[o]!), Math.floor(P[o + 1]!), Math.floor(P[o + 2]!), Math.floor(P[o + 3]!)) & 0xfff;
        if (cfg.water ? REG.fluid[v] === FLUID_NONE : REG.opaque[v] === 1 || REG.fluid[v] === FLUID_LAVA) dead = true;
      }
      if (dead) {
        n--;
        if (i !== n) this.move(n, i);
        i--;
      }
    }
    this.count = n;
  }

  private move(from: number, to: number): void {
    for (let a = 0; a < 4; a++) {
      this.pos[to * 4 + a] = this.pos[from * 4 + a]!;
      this.vel[to * 4 + a] = this.vel[from * 4 + a]!;
    }
    for (let a = 0; a < 3; a++) this.col[to * 3 + a] = this.col[from * 3 + a]!;
    this.age[to] = this.age[from]!;
    this.life[to] = this.life[from]!;
    this.rad[to] = this.rad[from]!;
    this.kind[to] = this.kind[from]!;
    this.glow[to] = this.glow[from]!;
    this.phase[to] = this.phase[from]!;
  }

  private spawn(dt: number, world: World, eye: Float64Array, cam: Frame4, defs: ParticleDef[], daylight: number, eyeInWater: boolean): void {
    for (let d = 0; d < defs.length && d < this.acc.length; d++) {
      const def = defs[d]!;
      if (def.night && daylight > 0.35) continue;
      const cfg = K[def.kind];
      if (cfg.water !== eyeInWater) continue; // bubbles only underwater, the rest only in air
      this.acc[d] = this.acc[d]! + def.rate * this.density * dt;
      while (this.acc[d]! >= 1) {
        this.acc[d] = this.acc[d]! - 1;
        if (this.count >= MAX) return;
        this.spawnOne(world, eye, cam, def, cfg);
      }
    }
  }

  private spawnOne(world: World, eye: Float64Array, cam: Frame4, def: ParticleDef, cfg: KindCfg): void {
    // Position: a disc in the slice's horizontal plane, a height band, and a sliver of W
    // around the slice (inside the particle's own radius, so it is visible).
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * SPAWN_R;
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    const h = cfg.y[0] + Math.random() * (cfg.y[1] - cfg.y[0]);
    const d = (Math.random() * 2 - 1) * cfg.size * 0.9;
    const R = cam.R, F = cam.F, H = cam.hidden;
    const up = cam.upAxis;
    const i = this.count;
    const o = i * 4;
    for (let k = 0; k < 4; k++) this.pos[o + k] = eye[k]! + u * R[k]! + v * F[k]! + d * H[k]!;
    this.pos[o + up] = this.pos[o + up]! + h;
    const x = Math.floor(this.pos[o]!), y = Math.floor(this.pos[o + 1]!), z = Math.floor(this.pos[o + 2]!), w = Math.floor(this.pos[o + 3]!);
    const blk = world.getBlock(x, y, z, w) & 0xfff;
    if (cfg.water ? REG.fluid[blk] !== FLUID_WATER : blk !== 0) return;
    if (cfg.sky && world.skyHeight(x, z, w) > y) return;
    const ang = Math.random() * Math.PI * 2;
    const sp = cfg.drift * Math.random();
    this.vel[o] = Math.cos(ang) * sp;
    this.vel[o + 1] = cfg.vy[0] + Math.random() * (cfg.vy[1] - cfg.vy[0]);
    this.vel[o + 2] = Math.sin(ang) * sp;
    // Slow drift along W: enough to cross the slice now and then, not enough to blink out.
    this.vel[o + 3] = (Math.random() - 0.5) * 0.04;
    if (up !== 1) {
      // Mirror Realm etc.: swap the vertical component onto the realm's up axis.
      const t = this.vel[o + 1]!;
      this.vel[o + 1] = this.vel[o + up]!;
      this.vel[o + up] = t;
    }
    const c = this.rgb(def.color);
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.age[i] = 0;
    this.life[i] = cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]);
    this.rad[i] = cfg.size * (0.8 + Math.random() * 0.4);
    this.kind[i] = this.kinds.indexOf(def.kind);
    this.glow[i] = def.glow ? 1 : 0;
    this.phase[i] = Math.random() * 6.28;
    this.count++;
  }

  private emit(world: World, eye: Float64Array, cam: Frame4, daylight: number, out: SpriteBatch): void {
    const P = this.pos;
    const Rt = cam.right, Up = cam.up, Fw = cam.fwd, H = cam.hidden;
    let vis = 0;
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      const rx = P[o]! - eye[0]!, ry = P[o + 1]! - eye[1]!, rz = P[o + 2]! - eye[2]!, rw = P[o + 3]! - eye[3]!;
      const d = rx * H[0]! + ry * H[1]! + rz * H[2]! + rw * H[3]!;
      const R = this.rad[i]!;
      if (d >= R || d <= -R) continue; // not in the slice
      const rr = Math.sqrt(R * R - d * d);
      const x = rx * Rt[0]! + ry * Rt[1]! + rz * Rt[2]! + rw * Rt[3]!;
      const y = rx * Up[0]! + ry * Up[1]! + rz * Up[2]! + rw * Up[3]!;
      const z = rx * Fw[0]! + ry * Fw[1]! + rz * Fw[2]! + rw * Fw[3]!;
      if (z < 0.1) continue;
      const cfg = K[this.kinds[this.kind[i]!]!];
      const t = this.age[i]! / this.life[i]!;
      let alpha = Math.min(1, t * 6, (1 - t) * 4);
      let bright: number;
      if (this.glow[i]) {
        bright = 1;
        if (cfg.wander > 0) alpha *= 0.55 + 0.45 * Math.sin(this.age[i]! * 3.1 + this.phase[i]! * 5); // blink
      } else {
        const l = world.getLight(Math.floor(P[o]!), Math.floor(P[o + 1]!), Math.floor(P[o + 2]!), Math.floor(P[o + 3]!));
        bright = Math.max(0.12, ((l >> 4) / 15) * (0.15 + 0.85 * daylight), (l & 15) / 15);
      }
      const spin = cfg.spin * (this.age[i]! + this.phase[i]!);
      out.add(x, y, z, rr, this.col[i * 3]! * bright, this.col[i * 3 + 1]! * bright, this.col[i * 3 + 2]! * bright, alpha * (cfg.shape === SPRITE_GLOW ? 0.9 : 0.85), cfg.shape, spin);
      vis++;
    }
    this.visible = vis;
  }
}
