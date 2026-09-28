// Game orchestration: owns every engine system and runs the frame loop.
//
// Per frame (allocation-free in steady state):
//   input -> camera/physics -> fixed 20 Hz ticks (time, weather, fluids) -> streaming ->
//   light BFS (budgeted) -> GPU sync (budgeted) -> picking -> hazards -> render -> HUD.

import { REG, makeVoxel, voxelId, FLUID_LAVA, VARIANT_HORIZONTAL6, VARIANT_VERTICAL2, FLUID_WATER } from '../content/registry';
import { hashString } from '../math/rng';
import { Environment, TICKS_PER_DAY } from '../env/Environment';
import { Input } from '../input/Input';
import { Player, type MoveInput } from '../physics/Player';
import { Renderer, type RenderParams } from '../render/Renderer';
import { ResolutionScaler } from '../render/ResolutionScaler';
import { World } from '../world/World';
import { Streamer } from '../world/Streamer';
import { WorkerPool } from '../world/gen/WorkerPool';
import { LightEngine } from '../world/light/LightEngine';
import { FluidSim } from '../world/fluids/Fluids';
import { makeRayHit, raycast, type RayHit } from '../world/raycast';
import { createGenerator } from '../world/gen/generators';
import { VOID_VOXEL } from '../world/constants';
import { COLLISION_NONE } from '../content/registry';
import type { Settings } from './Settings';
import type { WeatherKind } from '../content/types';

export const HOTBAR = [
  'stone',
  'dirt',
  'grass',
  'planks',
  'glass',
  'lumen',
  'water',
  'lava',
  'stone_slab',
  'stone_stairs',
  'ladder',
  'torch',
  'leaves',
  'bricks',
  'ice',
  'marker_w',
];

const WEATHER_CYCLE: WeatherKind[] = ['clear', 'rain', 'snow', 'thunder', 'phase_storm'];
const HOTBAR_ACTIONS = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9'] as const;

export interface GameOptions {
  settings: Settings;
  test: boolean;
  workers: number;
}

export class Game {
  readonly settings: Settings;
  readonly seed: number;
  readonly test: boolean;
  readonly world: World;
  readonly light: LightEngine;
  readonly pool: WorkerPool;
  readonly streamer: Streamer;
  readonly renderer: Renderer;
  readonly env: Environment;
  readonly fluids: FluidSim;
  readonly player: Player;
  readonly input: Input;
  readonly scaler: ResolutionScaler;
  readonly canvas: HTMLCanvasElement;
  readonly spawn: [number, number, number, number];

  readonly params: RenderParams;
  readonly target: RayHit = makeRayHit();
  hasTarget = false;
  hotbarIndex = 0;
  hotbarVersion = 0;
  showDebug = false;
  running = false;
  paused = true;
  loaded = false;
  frameCount = 0;
  fps = 0;
  frameMs = 16;
  cpuMs = 0;
  lightMsFrame = 0;
  uploadMsFrame = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private last = 0;
  private tickAcc = 0;
  private readonly eyePos = new Float64Array(4);
  private readonly tmp4 = new Float64Array(4);
  private readonly tmpMin = new Float64Array(4);
  private readonly tmpMax = new Float64Array(4);
  private readonly move: MoveInput = { forward: 0, strafe: 0, ana: 0, jump: false, sneak: false, sprint: false };
  private hazardTimer = 0;
  private snapping = false;
  private breakCooldown = 0;
  private placeCooldown = 0;
  private resIdx = 0;
  onFrame: ((g: Game) => void) | null = null;
  /** 'manual' renders only when requested (tests on software GL, where a frame can take ~1 s). */
  renderMode: 'continuous' | 'manual' = 'continuous';
  renderRequested = false;
  message: ((text: string) => void) | null = null;
  readonly hotbar: number[];

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.canvas = canvas;
    this.settings = opts.settings;
    this.test = opts.test;
    this.seed = hashString(opts.settings.seed);
    const realm = REG.realm('surface');
    this.world = new World(realm, opts.settings.renderDistance);
    this.light = new LightEngine(this.world);
    this.pool = new WorkerPool(opts.workers, this.seed, realm.name);
    this.streamer = new Streamer(this.world, this.pool, this.light);
    this.streamer.hiddenStretch = opts.settings.hiddenStretch;
    this.renderer = new Renderer(canvas, this.world);
    this.env = new Environment(realm, this.seed);
    this.fluids = new FluidSim(this.world);
    this.player = new Player(realm.gravityAxis, realm.gravity);
    this.input = new Input(canvas);
    this.input.freeMouse = opts.test;
    this.scaler = new ResolutionScaler();
    if (opts.settings.resolution !== 'auto') {
      this.scaler.mode = 'fixed';
      this.scaler.fixedHeight = opts.settings.resolution;
    }
    this.hotbar = HOTBAR.map((n) => REG.id(n));

    this.world.onBlockChange((x, y, z, w, o, n) => {
      this.light.onBlockChanged(x, y, z, w, o, n);
      this.fluids.onBlockChanged(x, y, z, w, o, n);
    });
    this.world.columnAdded = (c) => this.renderer.gpu.onColumnAdded(c);
    this.world.columnRemoved = (c) => this.renderer.gpu.onColumnRemoved(c);

    const gen = createGenerator(this.seed, realm);
    this.spawn = gen.spawnPoint();
    this.player.setPosition(...this.spawn);
    this.player.mode = 'creative';

    this.params = {
      cam: this.player.cam,
      eye: this.eyePos,
      fovY: (opts.settings.fov * Math.PI) / 180,
      maxDist: opts.settings.renderDistance * 16,
      maxSteps: opts.settings.maxSteps,
      outline: opts.settings.outline,
      wire: false,
      selectOn: false,
      select: new Int32Array(4),
      underwater: 0,
      hazard: new Float32Array(2),
      blocked: new Float32Array(2),
      vignette: opts.settings.vignette,
      damage: 0,
      yaw: 0,
      pitch: 0,
      pixelated: opts.settings.pixelated,
    };
    this.env.setTime(1500);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    this.pool.dispose();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Selected hotbar voxel. */
  get selectedBlock(): number {
    return this.hotbar[this.hotbarIndex]!;
  }

  frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.frameMs = now - this.last;
    this.last = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.frameCount++;
    this.resize();
    const p = this.player;
    const input = this.input;
    const active = !this.paused && input.enabled;

    if (active) this.handleInput(dt);

    // Physics.
    if (!this.loaded) this.checkLoaded();
    p.update(this.world, this.move, dt);

    // Fixed-rate world ticks.
    this.tickAcc += dt;
    let ticks = 0;
    while (this.tickAcc >= 0.05 && ticks < 5) {
      this.tickAcc -= 0.05;
      this.env.tick();
      this.fluids.tick();
      ticks++;
    }
    if (ticks >= 5) this.tickAcc = 0;

    p.eye(this.eyePos);
    // Streaming, lighting, uploads.
    this.streamer.update(now, this.eyePos, p.cam.hidden);
    const lt = performance.now();
    this.light.process(this.test ? 400000 : 60000);
    const ut = performance.now();
    this.lightMsFrame = ut - lt;
    this.renderer.gpu.sync(this.test ? 50 : 5);
    this.uploadMsFrame = performance.now() - ut;

    // Picking.
    this.hasTarget = p.frozen ? false : raycast(this.world, this.eyePos, p.cam.fwd, p.mode === 'survival' ? 5 : 7, this.target);
    this.params.selectOn = this.hasTarget;
    if (this.hasTarget) {
      const s = this.params.select;
      s[0] = this.target.x;
      s[1] = this.target.y;
      s[2] = this.target.z;
      s[3] = this.target.w;
    }
    this.buildOverlay();

    // Environment + screen effects.
    const ex = Math.floor(this.eyePos[0]!), ez = Math.floor(this.eyePos[2]!), ew = Math.floor(this.eyePos[3]!);
    const bi = this.world.biomeAt(ex, ez, ew);
    const exposure = this.world.skyHeight(ex, ez, ew) <= this.eyePos[1]! ? 1 : 0;
    this.env.update(dt, bi >= 0 ? REG.biomes[bi]! : null, exposure);
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = 0.2;
      this.scanHazards();
    }
    const pr = this.params;
    pr.underwater += ((p.eyeInWater ? 1 : 0) - pr.underwater) * Math.min(1, dt * 8);
    pr.damage = Math.max(0, pr.damage - dt * 2);
    if (p.inLava) pr.damage = 1;
    pr.yaw = Math.atan2(p.cam.F[0]!, p.cam.F[2]!);
    pr.pitch = p.cam.pitch;
    pr.fovY = (this.settings.fov * Math.PI) / 180;
    pr.maxDist = this.world.radius * 16;
    pr.outline = this.settings.outline;
    pr.pixelated = this.settings.pixelated;

    this.cpuMs = performance.now() - t0;
    this.renderer.collectStats = this.showDebug || this.test;
    if (this.renderMode === 'continuous' || this.renderRequested) {
      this.renderRequested = false;
      this.renderer.render(pr, this.env.sky, this.world, this.scaler.current(this.canvas.height), now);
      this.scaler.update(now, this.frameMs, this.renderer.hasGpuTimer ? this.renderer.stats.gpuMs : 0);
    }
    this.onFrame?.(this);
    input.endFrame();
  }

  /** Render the current state immediately (tests/benchmarks); returns nothing, use gl.finish to time. */
  renderImmediate(): void {
    this.player.eye(this.eyePos);
    this.renderer.render(this.params, this.env.sky, this.world, this.scaler.current(this.canvas.height), performance.now());
  }

  private checkLoaded(): void {
    const p = this.player;
    const cx = Math.floor(p.pos[0]! / 16), cz = Math.floor(p.pos[2]! / 16), cw = Math.floor(p.pos[3]! / 16);
    const col = this.world.column(cx, cz, cw);
    if (col && this.light.pending() === 0) {
      this.loaded = true;
      p.frozen = false;
      // Make sure we are not inside terrain.
      const up = p.up;
      for (let i = 0; i < 64; i++) {
        const v = this.world.getBlock(Math.floor(p.pos[0]!), Math.floor(p.pos[up]!), Math.floor(p.pos[2]!), Math.floor(p.pos[3]!));
        const v2 = this.world.getBlock(Math.floor(p.pos[0]!), Math.floor(p.pos[up]!) + 1, Math.floor(p.pos[2]!), Math.floor(p.pos[3]!));
        if (REG.collision[v & 0xfff] === COLLISION_NONE && REG.collision[v2 & 0xfff] === COLLISION_NONE) break;
        p.pos[up] = Math.floor(p.pos[up]!) + 1.001;
      }
    }
  }

  private handleInput(dt: number): void {
    const input = this.input;
    const p = this.player;
    const cam = p.cam;
    const sens = 0.0022 * this.settings.sensitivity;
    // Mouse look / slice rotation.
    if (input.held('rotateSliceMouse')) {
      cam.tiltRH(input.mouseDX * sens);
      cam.tiltFH(-input.mouseDY * sens);
    } else {
      cam.yaw(input.mouseDX * sens);
      cam.addPitch(-input.mouseDY * sens * (this.settings.invertY ? -1 : 1));
    }
    // Keyboard slice rotation (90°/s).
    const rs = dt * Math.PI * 0.5;
    if (input.held('tiltRightPlus')) cam.tiltRH(rs);
    if (input.held('tiltRightMinus')) cam.tiltRH(-rs);
    if (input.held('tiltForwardPlus')) cam.tiltFH(rs);
    if (input.held('tiltForwardMinus')) cam.tiltFH(-rs);
    if (input.pressed('snapSlice')) this.snapping = true;
    if (this.snapping) {
      if (cam.approachSnap(Math.min(1, dt * 10))) {
        cam.snapToAxes();
        this.snapping = false;
      }
    }

    const m = this.move;
    m.forward = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
    m.strafe = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    m.ana = (input.held('ana') ? 1 : 0) - (input.held('kata') ? 1 : 0);
    m.jump = input.held('jump');
    m.sneak = input.held('sneak');
    m.sprint = input.held('sprint');
    if (input.doubleJump && p.mode === 'creative') {
      p.flying = !p.flying;
      this.message?.(p.flying ? 'Flying' : 'Walking');
    }

    // Hotbar.
    for (let i = 0; i < 9; i++) {
      if (input.pressed(HOTBAR_ACTIONS[i]!)) this.hotbarIndex = i;
    }
    if (input.wheel !== 0) this.hotbarIndex = (this.hotbarIndex + input.wheel + this.hotbar.length) % this.hotbar.length;

    if (input.pressed('debug')) this.showDebug = !this.showDebug;
    if (input.pressed('wireframe')) {
      this.params.wire = !this.params.wire;
      this.message?.(this.params.wire ? 'Cross-section wireframe ON (P)' : 'Cross-section wireframe OFF');
    }
    if (input.pressed('gameMode')) {
      p.mode = p.mode === 'creative' ? 'survival' : p.mode === 'survival' ? 'spectator' : 'creative';
      this.message?.(`Game mode: ${p.mode}`);
    }
    if (input.pressed('timeSkip')) this.env.setTime(this.env.timeOfDay + TICKS_PER_DAY / 8);
    if (input.pressed('weather')) {
      const i = WEATHER_CYCLE.indexOf(this.env.weather);
      const next = WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length]!;
      this.env.setWeather(next);
      this.message?.(`Weather: ${next}`);
    }
    if (input.pressed('resolution')) this.cycleResolution();

    // Break / place / pick.
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    if (input.buttonPressed(0) || (input.buttonHeld(0) && this.breakCooldown <= 0)) {
      this.breakTarget();
      this.breakCooldown = 0.25;
    }
    if (input.buttonPressed(2) || (input.buttonHeld(2) && this.placeCooldown <= 0)) {
      this.placeAtTarget(this.selectedBlock);
      this.placeCooldown = 0.25;
    }
    if (input.buttonPressed(1) && this.hasTarget) {
      const id = voxelId(this.target.voxel);
      const idx = this.hotbar.indexOf(id);
      if (idx >= 0) this.hotbarIndex = idx;
      else {
        this.hotbar[this.hotbarIndex] = id;
        this.hotbarVersion++;
      }
    }
  }

  cycleResolution(): void {
    const opts: ('auto' | number)[] = ['auto', 270, 360, 480, 540, 720, 1080];
    this.resIdx = (this.resIdx + 1) % opts.length;
    const o = opts[this.resIdx]!;
    if (o === 'auto') this.scaler.mode = 'auto';
    else {
      this.scaler.mode = 'fixed';
      this.scaler.fixedHeight = o;
    }
    this.message?.(`Internal resolution: ${o === 'auto' ? 'auto' : o + 'p'}`);
  }

  breakTarget(): boolean {
    if (!this.hasTarget) return false;
    const t = this.target;
    const id = voxelId(t.voxel);
    if (REG.hardness[id]! < 0 && this.player.mode === 'survival') return false;
    return this.world.setBlock(t.x, t.y, t.z, t.w, 0);
  }

  /** Place `voxelOrId` against the targeted facet (in the 4D neighbour across that facet). */
  placeAtTarget(voxelOrId: number): boolean {
    if (!this.hasTarget) return false;
    const t = this.target;
    const tid = voxelId(t.voxel);
    let x = t.x, y = t.y, z = t.z, w = t.w;
    // Replaceable targets (tall grass) are replaced in place.
    if (!REG.replaceable[tid]) {
      if (t.axis === 0) x += t.sign;
      else if (t.axis === 1) y += t.sign;
      else if (t.axis === 2) z += t.sign;
      else w += t.sign;
    }
    const cur = this.world.getBlock(x, y, z, w);
    if (cur === VOID_VOXEL || (cur !== 0 && !REG.replaceable[cur & 0xfff])) return false;
    const id = voxelId(voxelOrId);
    let meta = (voxelOrId >>> 12) & 15;
    const mode = REG.variantMode[id]!;
    if (mode === VARIANT_VERTICAL2) {
      // Top slab if placed on the upper half of a side face or under a ceiling.
      const fy = t.p[1]! - Math.floor(t.p[1]!);
      meta = t.axis === 1 ? (t.sign < 0 ? 1 : 0) : fy > 0.5 ? 1 : 0;
    } else if (mode === VARIANT_HORIZONTAL6) {
      if (REG.climbable[id] && t.axis !== 1) {
        // Ladders hug the face we clicked: facing toward the clicked block.
        meta = facingIndex(t.axis, -t.sign);
      } else {
        meta = facingIndex(dominantHorizontal(this.player.cam.F), Math.sign(this.player.cam.F[dominantHorizontal(this.player.cam.F)]!) || 1);
      }
    }
    const v = makeVoxel(id, meta);
    // Do not place solid blocks inside the player.
    if (REG.collision[id] !== COLLISION_NONE && this.player.mode !== 'spectator' && this.intersectsPlayer(x, y, z, w)) return false;
    return this.world.setBlock(x, y, z, w, v);
  }

  private intersectsPlayer(x: number, y: number, z: number, w: number): boolean {
    const p = this.player;
    const up = p.up;
    const c = [x, y, z, w];
    for (let i = 0; i < 4; i++) {
      const lo = i === up ? p.pos[i]! : p.pos[i]! - 0.3;
      const hi = i === up ? p.pos[i]! + p.height : p.pos[i]! + 0.3;
      if (hi <= c[i]! + 1e-3 || lo >= c[i]! + 1 - 1e-3) return false;
    }
    return true;
  }

  /** Selection polytope (always) and P-mode polytopes of nearby exposed cells. */
  private buildOverlay(): void {
    const lines = this.renderer.lines;
    lines.clear();
    const e = this.eyePos;
    const cam = this.player.cam;
    const mn = this.tmpMin, mx = this.tmpMax;
    if (this.params.wire) {
      const cx = this.hasTarget ? this.target.x : Math.floor(e[0]!);
      const cy = this.hasTarget ? this.target.y : Math.floor(e[1]! - 1);
      const cz = this.hasTarget ? this.target.z : Math.floor(e[2]!);
      const cw = this.hasTarget ? this.target.w : Math.floor(e[3]!);
      const R = 2;
      for (let dw = -R; dw <= R; dw++)
        for (let dz = -R; dz <= R; dz++)
          for (let dy = -R; dy <= R; dy++)
            for (let dx = -R; dx <= R; dx++) {
              const x = cx + dx, y = cy + dy, z = cz + dz, w = cw + dw;
              const v = this.world.getBlock(x, y, z, w);
              if (v === 0 || v === VOID_VOXEL || !REG.solid[v & 0xfff]) continue;
              if (!this.exposed(x, y, z, w)) continue;
              mn[0] = x - e[0]!;
              mn[1] = y - e[1]!;
              mn[2] = z - e[2]!;
              mn[3] = w - e[3]!;
              mx[0] = mn[0] + 1;
              mx[1] = mn[1] + 1;
              mx[2] = mn[2] + 1;
              mx[3] = mn[3] + 1;
              lines.addBox(mn, mx, cam, 0.35, 0.95, 1.0, 0.55);
            }
    }
    if (this.hasTarget) {
      const t = this.target;
      mn[0] = t.x + t.bmin[0]! - e[0]!;
      mn[1] = t.y + t.bmin[1]! - e[1]!;
      mn[2] = t.z + t.bmin[2]! - e[2]!;
      mn[3] = t.w + t.bmin[3]! - e[3]!;
      mx[0] = t.x + t.bmax[0]! - e[0]!;
      mx[1] = t.y + t.bmax[1]! - e[1]!;
      mx[2] = t.z + t.bmax[2]! - e[2]!;
      mx[3] = t.w + t.bmax[3]! - e[3]!;
      lines.addBox(mn, mx, cam, 0.05, 0.05, 0.08, 0.9);
    }
  }

  private exposed(x: number, y: number, z: number, w: number): boolean {
    const wd = this.world;
    const o = REG.opaque;
    return (
      !o[wd.getBlock(x + 1, y, z, w) & 0xfff] ||
      !o[wd.getBlock(x - 1, y, z, w) & 0xfff] ||
      !o[wd.getBlock(x, y + 1, z, w) & 0xfff] ||
      !o[wd.getBlock(x, y - 1, z, w) & 0xfff] ||
      !o[wd.getBlock(x, y, z + 1, w) & 0xfff] ||
      !o[wd.getBlock(x, y, z - 1, w) & 0xfff] ||
      !o[wd.getBlock(x, y, z, w + 1) & 0xfff] ||
      !o[wd.getBlock(x, y, z, w - 1) & 0xfff]
    );
  }

  /**
   * R2 fairness: look along ±H (the hidden axis) for lava within 4 blocks (floor, feet and head
   * height), and for walls right next to the player that block kata/ana movement.
   */
  private scanHazards(): void {
    const p = this.player;
    const H = p.cam.H;
    const pos = p.pos;
    const up = p.up;
    const out = this.params.hazard;
    const blk = this.params.blocked;
    const q = this.tmp4;
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? -1 : 1;
      let hz = 0;
      for (let dist = 1; dist <= 4; dist++) {
        // Below the feet (stepping into it), at the feet and at head height.
        for (let hgt = -1; hgt < 2; hgt++) {
          for (let i = 0; i < 4; i++) q[i] = pos[i]! + H[i]! * s * dist;
          q[up] = pos[up]! + 0.2 + hgt;
          const v = this.world.getBlock(Math.floor(q[0]!), Math.floor(q[1]!), Math.floor(q[2]!), Math.floor(q[3]!));
          if (REG.fluid[v & 0xfff] === FLUID_LAVA || REG.damage[v & 0xfff]! > 0) hz = Math.max(hz, 1 - (dist - 1) / 4);
        }
      }
      out[side] = hz;
      // Blocked: a solid voxel within 0.5 along ±H at body height.
      let b = 0;
      for (let hgt = 0; hgt < 2; hgt++) {
        for (let i = 0; i < 4; i++) q[i] = pos[i]! + H[i]! * s * 0.55;
        q[up] = pos[up]! + 0.5 + hgt;
        const v = this.world.getBlock(Math.floor(q[0]!), Math.floor(q[1]!), Math.floor(q[2]!), Math.floor(q[3]!));
        if (REG.solid[v & 0xfff] && REG.fluid[v & 0xfff] !== FLUID_WATER) b = 1;
      }
      blk[side] = b;
    }
  }

  /** Light at the eye (packed sky<<4|block). */
  eyeLight(): number {
    const e = this.eyePos;
    return this.world.getLight(Math.floor(e[0]!), Math.floor(e[1]!), Math.floor(e[2]!), Math.floor(e[3]!));
  }

  eye(): Float64Array {
    return this.eyePos;
  }
}

function dominantHorizontal(v: Float64Array): number {
  let best = 0;
  let bv = -1;
  for (const i of [0, 2, 3]) {
    if (Math.abs(v[i]!) > bv) {
      bv = Math.abs(v[i]!);
      best = i;
    }
  }
  return best;
}

/** Facing index for horizontal6 shapes: +X, -X, +Z, -Z, +W, -W. */
function facingIndex(axis: number, sign: number): number {
  const base = axis === 0 ? 0 : axis === 2 ? 2 : 4;
  return base + (sign > 0 ? 0 : 1);
}

