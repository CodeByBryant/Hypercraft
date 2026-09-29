// Game orchestration: owns every engine system and runs the frame loop.
//
// Per frame (allocation-free in steady state):
//   input -> camera/physics -> fixed 20 Hz ticks (time, weather, fluids) -> streaming ->
//   light BFS (budgeted) -> GPU sync (budgeted) -> picking -> hazards -> render -> HUD.

import { REG, makeVoxel, voxelId, FLUID_LAVA, VARIANT_HORIZONTAL6, VARIANT_VERTICAL2, FLUID_WATER } from '../content/registry';
import { Particles } from '../env/Particles';
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
import { createGenerator, type WorldGenerator } from '../world/gen/generators';
import { VOID_VOXEL } from '../world/constants';
import { COLLISION_NONE } from '../content/registry';
import { IREG } from '../content/itemRegistry';
import { MOB_REG } from '../content/mobRegistry';
import { Inventory, HOTBAR_SIZE } from './items/Inventory';
import { ItemEntities } from './items/ItemEntities';
import { BlockEntities } from './items/BlockEntities';
import { breakInfo, rollDrops, wearFor } from './items/Mining';
import { countIn, removeFrom, type ItemStack } from './items/ItemStack';
import { MobManager, type Mob, type MobHost } from './mobs/MobManager';
import { Projectiles, type ProjectileHost } from './mobs/Projectiles';
import { MAX_AIR, MAX_HEALTH, Vitals } from './Vitals';
import { newVillager, offend, price, recordTrade, restock, soldOut, type VillagerData } from './Trading';
import { LEVEL_NAMES } from '../content/trades';
import type { SavedMob } from './mobs/MobManager';
import type { Column } from '../world/World';
import { ARROW_SPEED, CRIT_MULTIPLIER, arrowDamage, attackCooldown, attackDamage, bowPower, hitWear, swingStrength } from './combat';
import type { BiomeDef } from '../content/types';
import type { FurnaceKind } from '../content/types';
import { IconAtlas, SHEET } from '../ui/IconAtlas';
import { particleDensity, type Settings } from './Settings';
import type { WeatherKind } from '../content/types';
import type { Persistence } from '../save/Persistence';
import type { SavedState, WorldInfo } from '../save/WorldInfo';
import type { GameMode } from '../physics/Player';
import type { Located } from '../world/gen/protocol';

/** Blocks tagged 'bed' (sleep through the night, set your respawn point). */
const BED_IDS = new Uint8Array(REG.count);
REG.blocks.forEach((b, i) => {
  if (b.tags?.includes('bed')) BED_IDS[i] = 1;
});
const isBed = (v: number): boolean => v !== VOID_VOXEL && BED_IDS[voxelId(v)] === 1;

/** Creative starter inventory (hotbar first). Survival worlds start empty. */
export const CREATIVE_KIT: [string, number][] = [
  ['stone', 64],
  ['dirt', 64],
  ['grass', 64],
  ['planks', 64],
  ['glass', 64],
  ['torch', 64],
  ['water_bucket', 1],
  ['lava_bucket', 1],
  ['stone_slab', 64],
  ['lumen', 64],
  ['stone_stairs', 64],
  ['ladder', 64],
  ['leaves', 64],
  ['bricks', 64],
  ['ice', 64],
  ['marker_w', 64],
  ['crafting_table', 64],
  ['furnace', 64],
  ['chest', 64],
  ['hyperite_pickaxe', 1],
  ['hyperite_axe', 1],
  ['hyperite_shovel', 1],
  ['shears', 1],
  ['bucket', 16],
];

/** A UI screen the game wants opened (handled by main.ts / the inventory screen). */
export type ScreenRequest =
  | { kind: 'inventory' }
  | { kind: 'crafting'; pos: [number, number, number, number] }
  | { kind: 'chest'; pos: [number, number, number, number] }
  | { kind: 'furnace'; pos: [number, number, number, number]; furnace: FurnaceKind }
  | { kind: 'trade'; mob: number };

const WEATHER_CYCLE: WeatherKind[] = ['clear', 'rain', 'snow', 'thunder', 'phase_storm'];
const DIFFICULTY: Record<string, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };
/** Attack reach (blocks) in survival and creative. */
const REACH_ATTACK = [3.5, 5];
/** How far an atlas looks for structures (blocks, 4D distance in x, z, w). */
export const ATLAS_RANGE = 1600;
/** Beds work from dusk to just before dawn (Minecraft: ticks 12542..23459 of its day). */
const SLEEP_FROM = 12500;
const SLEEP_UNTIL = 23450;
/** Seconds to fall asleep (the screen fades out) and to wake up once the night has passed. */
const SLEEP_FADE = 2.2;
const WAKE_FADE = 1.3;
const HOTBAR_ACTIONS = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9'] as const;

export interface GameOptions {
  settings: Settings;
  test: boolean;
  workers: number;
  world: WorldInfo;
  persistence: Persistence | null;
  /** Title-screen background: no input, automatic camera. */
  demo?: boolean;
}

export class Game {
  readonly settings: Settings;
  readonly seed: number;
  readonly test: boolean;
  readonly demo: boolean;
  readonly info: WorldInfo;
  readonly persistence: Persistence | null;
  private autosaveTimer = 30;
  readonly world: World;
  readonly light: LightEngine;
  readonly pool: WorkerPool;
  readonly streamer: Streamer;
  readonly renderer: Renderer;
  readonly env: Environment;
  readonly particles = new Particles();
  readonly fluids: FluidSim;
  readonly player: Player;
  readonly input: Input;
  readonly scaler: ResolutionScaler;
  readonly canvas: HTMLCanvasElement;
  readonly spawn: [number, number, number, number];
  /** Main-thread instance of the realm generator (spawn, biome queries). */
  readonly generator: WorldGenerator;
  readonly genOptions: { garden?: boolean };

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
  /** Player inventory (hotbar = slots 0..8). */
  readonly inv = new Inventory();
  readonly items = new ItemEntities();
  readonly blockEntities: BlockEntities;
  /** Called when the game wants a UI screen (inventory, crafting table, chest, furnace). */
  onOpenScreen: ((r: ScreenRequest) => void) | null = null;
  /** Called when items are picked up (HUD toast). */
  onPickup: ((id: number, count: number) => void) | null = null;
  private mineCell = new Int32Array(4).fill(-2147483648);
  private mineProgress = 0;
  private mineSeconds = 0;
  private mineDelay = 0;
  private readonly fluidHit: RayHit = makeRayHit();
  private iconAtlas: IconAtlas | null = null;

  // ---- Phase 4: mobs, combat, health
  readonly mobs: MobManager;
  readonly projectiles = new Projectiles();
  readonly vitals = new Vitals();
  /** Mob under the crosshair (nearer than the targeted block), or null. */
  targetMob: Mob | null = null;
  /** Hostile mobs near the player, nearest first (HUD proximity warning). */
  readonly threats: Mob[] = [];
  /** Seconds the bow has been drawn (0 = not drawing). */
  bowDraw = 0;
  /** Your respawn point, set by using a bed (null: the world spawn). */
  bed: [number, number, number, number] | null = null;
  /** Asleep in a bed: seconds so far, and whether the night has been skipped yet. */
  sleeping: { t: number; skipped: boolean } | null = null;
  /** After respawning at a bed, check it is still there once its column has loaded. */
  private checkBed = false;
  /** The held atlas's target: the nearest structure it marks (searched by a worker). */
  atlas: { item: number; target: Located | null; at: [number, number, number] } | null = null;
  private atlasPending = false;
  /** Called once when the player dies (death screen); `respawn()` brings them back. */
  onDeath: ((cause: string) => void) | null = null;
  private readonly pickOut: { mob: Mob | null } = { mob: null };
  private readonly aimDir = new Float64Array(4);
  /** Direction of the last pick (crosshair or touch aim). */
  private pickDir: Float64Array;
  /** Touch controls are in use (bigger aim assist). */
  touchMode = false;
  private sinceSwing = 99;
  private envDamageTimer = 0;
  private sprintNoise = 0;
  private deathHandled = false;
  private readonly origin = new Float64Array(4);
  private readonly mobHost: MobHost;
  private readonly projHost: ProjectileHost;
  private readonly biomeFn = (x: number, z: number, w: number): BiomeDef | null => {
    const b = this.world.biomeAt(x, z, w);
    return b >= 0 ? REG.biomes[b]! : null;
  };
  private readonly caveFn: ((x: number, y: number, z: number, w: number) => number) | null;

  /** Item icon sheet (built on first use; also feeds dropped-item sprites). */
  get icons(): IconAtlas {
    if (!this.iconAtlas) {
      const gw = this.renderer.gpu;
      const a = new IconAtlas(gw.atlasData, gw.atlasSize[0]);
      this.iconAtlas = a;
      this.renderer.sprites.setIcons(a.canvas);
      const u = new Float32Array(IREG.count), v = new Float32Array(IREG.count);
      for (let i = 0; i < IREG.count; i++) {
        const [x, y] = a.cell(i);
        u[i] = x / SHEET;
        v[i] = y / SHEET;
      }
      this.items.iconU = u;
      this.items.iconV = v;
    }
    return this.iconAtlas;
  }
  private readonly collect = (s: ItemStack): number => {
    const before = s.count;
    const left = this.inv.add(s);
    if (left < before) this.onPickup?.(s.id, before - left);
    return left;
  };

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.canvas = canvas;
    this.settings = opts.settings;
    this.test = opts.test;
    this.demo = opts.demo ?? false;
    this.info = opts.world;
    this.persistence = opts.persistence;
    this.seed = opts.world.seed >>> 0;
    const realm = REG.realm(opts.world.state?.realm ?? 'surface');
    this.world = new World(realm, opts.settings.renderDistance);
    this.light = new LightEngine(this.world);
    this.genOptions = { garden: opts.test && !opts.demo };
    this.pool = new WorkerPool(opts.workers, this.seed, realm.name, this.genOptions);
    this.streamer = new Streamer(this.world, this.pool, this.light);
    this.streamer.hiddenStretch = opts.settings.hiddenStretch;
    this.renderer = new Renderer(canvas, this.world);
    this.env = new Environment(realm, this.seed);
    this.fluids = new FluidSim(this.world);
    this.player = new Player(realm.gravityAxis, realm.gravity);
    this.pickDir = this.player.cam.fwd;
    this.input = new Input(canvas);
    this.input.freeMouse = opts.test;
    this.scaler = new ResolutionScaler();
    if (opts.settings.resolution !== 'auto') {
      this.scaler.mode = 'fixed';
      this.scaler.fixedHeight = opts.settings.resolution;
    }
    this.blockEntities = new BlockEntities(this.world);

    this.world.onBlockChange((x, y, z, w, o, n) => {
      this.light.onBlockChanged(x, y, z, w, o, n);
      this.fluids.onBlockChanged(x, y, z, w, o, n);
      // Breaking a chest or furnace spills its contents.
      const spill = this.blockEntities.onBlockChanged(x, y, z, w, o, n);
      for (const st of spill) this.dropAtCell(x, y, z, w, st);
    });
    this.world.columnAdded = (c) => {
      this.renderer.gpu.onColumnAdded(c);
      this.blockEntities.onColumnAdded(c);
      this.columnMobsIn(c);
    };
    this.world.columnRemoved = (c) => {
      this.renderer.gpu.onColumnRemoved(c);
      this.blockEntities.onColumnRemoved(c);
      this.columnMobsOut(c);
      if (this.persistence && c.dirty) void this.persistence.saveColumn(c);
    };
    this.world.retainEdited = !this.persistence;
    this.streamer.source = this.persistence;

    const gen = createGenerator(this.seed, realm, this.genOptions);
    this.generator = gen;
    this.spawn = gen.spawnPoint();
    this.player.setPosition(...this.spawn);
    this.player.mode = opts.world.mode as GameMode;

    // Mobs: natural spawning is off in test worlds (tests spawn what they need).
    this.mobs = new MobManager(this.world);
    this.mobs.enabled = !opts.test && !this.demo;
    // Spawners (dungeons, outposts) work while natural spawning does.
    this.blockEntities.playerPos = this.player.pos;
    this.blockEntities.spawnMob = (name, x, y, z, w) => {
      if (!this.mobs.enabled || this.demo) return false;
      const hostile = MOB_REG.get(name).def.hostile;
      if (hostile && (DIFFICULTY[this.info.difficulty] ?? 2) === 0) return false;
      return this.mobs.spawn(name, x, y, z, w) !== null;
    };
    this.blockEntities.countNear = (name, x, y, z, w, r) => {
      let n = 0;
      for (const m of this.mobs.list) if (m.def.name === name && Math.hypot(m.pos[0]! - x, m.pos[1]! - y, m.pos[2]! - z, m.pos[3]! - w) < r) n++;
      return n;
    };
    this.caveFn = gen.caveBiomeAt ? (x, y, z, w) => gen.caveBiomeAt!(x, y, z, w) : null;
    const game = this;
    this.mobHost = {
      world: this.world,
      playerPos: this.player.pos,
      playerHidden: this.player.cam.H,
      get playerTargetable() {
        const m = game.player.mode;
        return game.loaded && !game.vitals.dead && (m === 'survival' || m === 'adventure');
      },
      get playerInWater() {
        return game.player.inWater;
      },
      get daylight() {
        return game.env.sky.daylight;
      },
      get difficulty() {
        return DIFFICULTY[game.info.difficulty] ?? 2;
      },
      dropItem: (x, y, z, w, st) => this.dropInSlice(x, y, z, w, st),
      hurtPlayer: (amount, from, cause) => void this.hurtPlayer(amount, from, cause),
      explode: (x, y, z, w, r) => this.explode(x, y, z, w, r),
      shoot: (from, vel, damage, item, byPlayer) => this.projectiles.spawn(from, vel, damage, item, byPlayer),
      mobDied: (m) => {
        const h = m.height * 0.5;
        this.particles.burst(m.pos[0]!, m.pos[1]! + h, m.pos[2]!, m.pos[3]!, this.player.cam, 'poof', '#e8e8e8', 14, 1.6, m.width);
      },
    };
    this.projHost = {
      playerPos: this.player.pos,
      get playerHeight() {
        return game.player.height;
      },
      hurtPlayer: (amount, from, cause) => void this.hurtPlayer(amount, from, cause),
      collect: (item) => {
        if (this.player.mode === 'spectator') return false;
        if (this.player.mode === 'creative') return true;
        const st = { id: item, count: 1, damage: 0 };
        if (this.inv.add(st) > 0) return false;
        this.onPickup?.(item, 1);
        return true;
      },
      eye: this.eyePos,
      hidden: this.player.cam.H,
    };

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
      breakProgress: 0,
      entityCount: 0,
      entityData: null,
      underwater: 0,
      hazard: new Float32Array(2),
      blocked: new Float32Array(2),
      threat: new Float32Array(2),
      vignette: opts.settings.vignette,
      damage: 0,
      yaw: 0,
      pitch: 0,
      pixelated: opts.settings.pixelated,
    };
    this.particles.density = particleDensity(opts.settings);
    this.env.setTime(1500);
    if (opts.world.state) this.restore(opts.world.state);
    else if (this.player.mode === 'creative') this.giveKit();
    if (this.demo) {
      this.player.mode = 'spectator';
      this.player.flying = true;
    }
  }

  /** Restore player/world state from a save. */
  private restore(st: SavedState): void {
    const p = this.player;
    const sp = st.player;
    if (sp.pos.length === 4) p.setPosition(sp.pos[0]!, sp.pos[1]!, sp.pos[2]!, sp.pos[3]!);
    if (sp.F.length === 4 && sp.R.length === 4 && sp.H.length === 4) {
      for (let i = 0; i < 4; i++) {
        p.cam.F[i] = sp.F[i]!;
        p.cam.R[i] = sp.R[i]!;
        p.cam.H[i] = sp.H[i]!;
      }
      p.cam.pitch = sp.pitch;
      p.cam.orthonormalize();
    }
    p.mode = sp.mode as GameMode;
    p.flying = sp.flying;
    this.env.ticks = st.ticks;
    if (st.weather && st.weather !== 'clear') this.env.setWeather(st.weather as WeatherKind, false);
    this.env.weatherLeft = st.weatherLeft;
    const inv = sp.data?.inventory;
    this.vitals.load(sp.data?.vitals);
    const bed = sp.data?.bed;
    if (Array.isArray(bed) && bed.length === 4 && bed.every((v) => Number.isInteger(v))) this.bed = bed as [number, number, number, number];
    if (inv) this.inv.load(inv);
    else if (st.hotbar) {
      // 0.1.x saves had a creative block palette instead of an inventory.
      st.hotbar.forEach((n, i) => {
        if (i < HOTBAR_SIZE && IREG.has(n)) this.inv.set(i, { id: IREG.id(n), count: 64, damage: 0 });
      });
    }
    if (st.hotbarIndex !== undefined) this.hotbarIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, st.hotbarIndex));
  }

  /** Fill the inventory with the creative starter kit. */
  giveKit(): void {
    this.inv.clear();
    for (const [name, n] of CREATIVE_KIT) this.inv.add({ id: IREG.id(name), count: n, damage: 0 });
  }

  /** Snapshot of the player/world state for saving. */
  snapshot(): SavedState {
    const p = this.player;
    // Quitting from the death screen saves the player as respawned (the inventory has
    // already spilled where they died).
    const dead = this.vitals.dead;
    return {
      realm: this.world.realm.name,
      player: {
        pos: dead ? this.respawnPoint() : Array.from(p.pos),
        F: Array.from(p.cam.F),
        R: Array.from(p.cam.R),
        H: Array.from(p.cam.H),
        pitch: p.cam.pitch,
        mode: dead && this.info.hardcore ? 'spectator' : p.mode,
        flying: p.flying,
        data: { inventory: this.inv.save(), vitals: dead ? { health: MAX_HEALTH, air: MAX_AIR } : this.vitals.save(), bed: this.bed },
      },
      ticks: this.env.ticks,
      weather: this.env.weather,
      weatherLeft: this.env.weatherLeft,
      hotbarIndex: this.hotbarIndex,
    };
  }

  /** Save dirty columns and the world metadata. */
  async saveAll(): Promise<void> {
    const ps = this.persistence;
    if (!ps || this.demo) return;
    this.snapshotMobs();
    ps.saveDirty(this.world);
    ps.info.state = this.snapshot();
    await ps.saveMeta();
    await ps.flush();
  }

  /** Cheat keys (time, weather, game mode) are allowed in creative or with cheats on. */
  get cheatsAllowed(): boolean {
    return this.info.cheats || this.player.mode === 'creative' || this.test;
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

  /** The stack in the selected hotbar slot. */
  get held(): ItemStack | null {
    return this.inv.get(this.hotbarIndex);
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

    if (this.sleeping) this.updateSleep(dt, active);
    else if (active && !this.demo && !this.vitals.dead) this.handleInput(dt);
    else this.stopMoving();
    if (this.demo) this.demoCamera(dt);
    // Autosave.
    if (this.persistence && this.loaded && !this.demo) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 30;
        void this.saveAll();
      }
    }

    // Physics.
    if (!this.loaded) this.checkLoaded();
    p.update(this.world, this.move, dt);
    if (!this.demo) this.updateVitals(dt);
    this.items.update(dt, this.world, p.up, this.world.realm.gravity, this.loaded && p.mode !== 'spectator' && !this.vitals.dead ? p.pos : null, p.height, this.collect);
    if (this.loaded && !this.demo) {
      p.eye(this.eyePos);
      this.mobs.update(dt, this.mobHost, this.biomeFn, this.caveFn);
      this.projectiles.update(dt, this.world, this.mobs, this.projHost);
      this.villageTimer -= dt;
      if (this.villageTimer <= 0) {
        this.villageTimer = 1;
        this.villageTick();
      }
      this.updateAtlas();
    }

    // Fixed-rate world ticks.
    this.tickAcc += dt;
    let ticks = 0;
    while (this.tickAcc >= 0.05 && ticks < 5) {
      this.tickAcc -= 0.05;
      this.env.tick();
      this.fluids.tick();
      this.blockEntities.tick(0.05);
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

    // Picking (crosshair, or the touch aim point while one is active).
    this.updateTargets();
    this.params.selectOn = this.hasTarget && !this.targetMob;
    if (this.hasTarget) {
      const s = this.params.select;
      s[0] = this.target.x;
      s[1] = this.target.y;
      s[2] = this.target.z;
      s[3] = this.target.w;
    }
    this.buildOverlay();
    // Mob cross-sections for the ray marcher (coordinates relative to the window origin).
    const org = this.origin;
    org[0] = this.world.ox * 16;
    org[1] = 0;
    org[2] = this.world.oz * 16;
    org[3] = this.world.ow * 16;
    this.params.entityCount = this.mobs.pack(this.eyePos, p.cam, this.params.maxDist, org);
    this.params.entityData = this.mobs.gpuData;

    // Environment + screen effects.
    const ex = Math.floor(this.eyePos[0]!), ez = Math.floor(this.eyePos[2]!), ew = Math.floor(this.eyePos[3]!);
    const bi = this.world.biomeAt(ex, ez, ew);
    const exposure = this.world.skyHeight(ex, ez, ew) <= this.eyePos[1]! ? 1 : 0;
    this.env.update(dt, bi >= 0 ? REG.biomes[bi]! : null, exposure);
    // Ambient particles: the surface biome, or the cave biome when well underground.
    let pb = bi >= 0 ? REG.biomes[bi]! : null;
    const ey = Math.floor(this.eyePos[1]!);
    if (!exposure && this.generator.caveBiomeAt && this.world.skyHeight(ex, ez, ew) > ey + 8) {
      const cb = this.generator.caveBiomeAt(ex, ey, ez, ew);
      pb = cb >= 0 ? REG.biomes[cb]! : null;
    }
    this.renderer.sprites.clear();
    this.particles.update(dt, this.world, this.eyePos, p.cam, pb, this.env.sky.daylight, p.eyeInWater, this.renderer.sprites);
    this.items.draw(this.renderer.sprites, this.eyePos, p.cam, this.world);
    this.projectiles.draw(this.renderer.sprites, this.eyePos, p.cam, this.items.iconU, this.items.iconV);
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = 0.2;
      this.scanHazards();
      this.scanThreats();
    }
    const pr = this.params;
    pr.underwater += ((p.eyeInWater ? 1 : 0) - pr.underwater) * Math.min(1, dt * 8);
    pr.damage = Math.max(pr.damage - dt * 2, this.vitals.flash * 0.8, this.vitals.dead ? 0.6 : 0);
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

  private demoT = 0;
  /** Title-screen camera: slow yaw plus a slice rotation through W so the prisms morph. */
  private demoCamera(dt: number): void {
    this.demoT += dt;
    const cam = this.player.cam;
    cam.yaw(dt * 0.07);
    cam.tiltRH(Math.sin(this.demoT * 0.21) * dt * 0.18);
    cam.setPitch(-0.22 + Math.sin(this.demoT * 0.13) * 0.08);
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
      if (this.checkBed) {
        this.checkBed = false;
        const b = this.bed;
        if (b && !isBed(this.world.getBlock(b[0], b[1], b[2], b[3]))) {
          this.bed = null;
          this.message?.('Your bed was missing, so you woke up at the world spawn');
          p.setPosition(...this.spawn);
          this.loaded = false;
          p.frozen = true;
          this.streamer.invalidate();
        }
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
    // Arrow keys look around (150°/s yaw, 110°/s pitch); touch/gamepad add their deltas.
    const ky = (input.held('lookRight') ? 1 : 0) - (input.held('lookLeft') ? 1 : 0);
    const kp = (input.held('lookUp') ? 1 : 0) - (input.held('lookDown') ? 1 : 0);
    const kyaw = ky * dt * 2.6 + input.lookYaw;
    const kpitch = kp * dt * 1.9 + input.lookPitch;
    if (kyaw !== 0) cam.yaw(kyaw);
    if (kpitch !== 0) cam.addPitch(kpitch);
    if (input.sliceRH !== 0) cam.tiltRH(input.sliceRH);
    if (input.sliceFH !== 0) cam.tiltFH(input.sliceFH);
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
    m.forward = Math.max(-1, Math.min(1, (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0) + input.analogForward));
    m.strafe = Math.max(-1, Math.min(1, (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) + input.analogStrafe));
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
    if (input.wheel !== 0) this.hotbarIndex = (((this.hotbarIndex + input.wheel) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (input.pressed('inventory')) this.onOpenScreen?.({ kind: 'inventory' });
    if (input.pressed('drop')) this.dropHeld(input.held('sprint'));

    if (input.pressed('debug')) this.showDebug = !this.showDebug;
    if (input.pressed('wireframe')) {
      this.params.wire = !this.params.wire;
      this.message?.(this.params.wire ? 'Cross-section wireframe ON (P)' : 'Cross-section wireframe OFF');
    }
    if (input.pressed('gameMode') && this.cheatsAllowed) {
      p.mode = p.mode === 'creative' ? 'survival' : p.mode === 'survival' ? 'spectator' : 'creative';
      this.message?.(`Game mode: ${p.mode}`);
    }
    if (input.pressed('timeSkip') && this.cheatsAllowed) this.env.setTime(this.env.timeOfDay + TICKS_PER_DAY / 8);
    if (input.pressed('weather') && this.cheatsAllowed) {
      const i = WEATHER_CYCLE.indexOf(this.env.weather);
      const next = WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length]!;
      this.env.setWeather(next);
      this.message?.(`Weather: ${next}`);
    }
    if (input.pressed('resolution')) this.cycleResolution();

    // Touch aim: re-pick at a new aim point before acting on it; a tap interacts once.
    if (input.aimDirty) {
      input.aimDirty = false;
      p.eye(this.eyePos);
      this.updateTargets();
    }
    this.sinceSwing += dt;
    if (input.tapInteract) {
      input.tapInteract = false;
      this.interact(input.held('sneak'));
      input.clearAim();
    }

    // Attack / break / place / pick.
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    const mode = p.mode;
    const heldNow = this.held;
    const heldId = heldNow ? heldNow.id : -1;
    if (this.targetMob && mode !== 'spectator') {
      // Holding the button keeps swinging at full strength (touch controls, auto-attack).
      this.resetMining();
      if (input.buttonPressed(0) || (input.buttonHeld(0) && this.sinceSwing >= attackCooldown(heldId))) this.attack(this.targetMob);
    } else if (mode === 'creative') {
      this.params.breakProgress = 0;
      if (input.buttonPressed(0) || (input.buttonHeld(0) && this.breakCooldown <= 0)) {
        this.breakTarget();
        this.breakCooldown = 0.25;
      }
    } else if (mode === 'survival' && input.buttonHeld(0) && this.hasTarget) {
      this.mineStep(dt);
    } else {
      this.resetMining();
      if (input.buttonPressed(0)) this.sinceSwing = 0; // a swing at the air still resets the cooldown
    }
    const bow = heldNow !== null && IREG.def(heldNow.id).use === 'bow';
    if (bow && mode !== 'spectator' && !this.stationTargeted()) {
      // Bow: hold to draw, release to shoot.
      if (input.buttonHeld(2)) this.bowDraw += dt;
      else if (this.bowDraw > 0) {
        this.releaseBow();
        this.bowDraw = 0;
      }
    } else {
      this.bowDraw = 0;
      if (mode !== 'spectator' && input.buttonPressed(2) && this.targetMob && this.talkTo(this.targetMob)) {
        // Right click on a villager: trade.
      } else if (mode !== 'spectator' && (input.buttonPressed(2) || (input.buttonHeld(2) && this.placeCooldown <= 0))) {
        this.useHeld(input.held('sneak'));
        this.placeCooldown = 0.25;
      }
    }
    if (input.buttonPressed(1) && this.hasTarget) this.pickBlock();
    // Sprinting is loud (Lurkers hunt by sound).
    if (p.sprinting && p.onGround) {
      this.sprintNoise -= dt;
      if (this.sprintNoise <= 0) {
        this.sprintNoise = 1;
        this.mobs.noise(p.pos);
      }
    }
  }

  /**
   * Block and mob under the crosshair, or under the touch aim point (tap to interact). A mob
   * nearer than the block wins; when the exact test misses, a little aim assist picks a mob
   * whose body passes close to the ray (more on touch screens).
   */
  private updateTargets(): void {
    const p = this.player;
    const dir = this.input.aimOn ? this.aimDirection() : p.cam.fwd;
    this.pickDir = dir;
    this.hasTarget = p.frozen ? false : raycast(this.world, this.eyePos, dir, p.mode === 'survival' ? 5 : 7, this.target);
    this.targetMob = null;
    if (!p.frozen && p.mode !== 'spectator' && this.mobs.list.length > 0) {
      const reach = REACH_ATTACK[p.mode === 'creative' ? 1 : 0]!;
      const limit = this.hasTarget ? Math.min(reach, this.target.t + 0.3) : reach;
      if (this.mobs.pick(this.eyePos, dir, limit, this.pickOut) < limit) this.targetMob = this.pickOut.mob;
      else if (this.mobs.pickAssist(this.eyePos, dir, limit, this.touchMode ? 0.45 : 0.12, p.cam.H, this.pickOut) < limit) this.targetMob = this.pickOut.mob;
    }
  }

  /** Ray direction through the touch aim point (same projection as the ray marcher). */
  private aimDirection(): Float64Array {
    const cam = this.player.cam;
    const d = this.aimDir;
    const tanY = Math.tan(this.params.fovY / 2);
    const tanX = tanY * (this.canvas.width / Math.max(1, this.canvas.height));
    const ax = this.input.aimX * tanX, ay = this.input.aimY * tanY;
    let l = 0;
    for (let k = 0; k < 4; k++) {
      d[k] = cam.fwd[k]! + ax * cam.right[k]! + ay * cam.up[k]!;
      l += d[k]! * d[k]!;
    }
    l = Math.sqrt(l);
    for (let k = 0; k < 4; k++) d[k] = d[k]! / l;
    return d;
  }

  /** Touch tap: hit the mob there, otherwise use / place like a right click. */
  private interact(sneaking: boolean): void {
    if (this.player.mode === 'spectator') return;
    if (this.targetMob) {
      if (!this.talkTo(this.targetMob)) this.attack(this.targetMob);
      return;
    }
    this.useHeld(sneaking);
  }

  // ------------------------------------------------------------------ villagers & persistence

  /**
   * A column arrived: bring back the villagers saved in it, and spawn the villagers its
   * structures generated (once: the column is then marked edited so it is saved without them).
   */
  private columnMobsIn(c: Column): void {
    if (this.demo) return;
    const ex = c.extra as { mobs?: SavedMob[]; npcs?: { mob: string; x: number; y: number; z: number; w: number; data?: Record<string, unknown> }[] };
    if (ex.mobs) {
      for (const sm of ex.mobs) this.mobs.restore(sm);
      delete ex.mobs;
    }
    if (ex.npcs) {
      for (const n of ex.npcs) {
        if (!MOB_REG.has(n.mob)) continue;
        const m = this.mobs.spawn(n.mob, n.x, n.y, n.z, n.w);
        if (!m) continue;
        const prof = m.def.profession;
        if (prof) {
          const d = newVillager(prof, (Math.imul(Math.floor(n.x), 73856093) ^ Math.imul(Math.floor(n.z), 19349663) ^ Math.imul(Math.floor(n.w), 83492791)) >>> 0);
          d.home = [n.x, n.y, n.z, n.w];
          d.village = String(n.data?.village ?? '');
          m.data = d;
        } else m.data = { profession: 'none', level: 0, xp: 0, offers: [], rep: 0, restock: -1, seed: 0, home: [n.x, n.y, n.z, n.w], village: String(n.data?.village ?? '') };
      }
      delete ex.npcs;
      c.edited = true;
      c.dirty = true;
    }
  }

  /** A column is leaving: persistent mobs standing in it are saved into its data. */
  private columnMobsOut(c: Column): void {
    const out: SavedMob[] = [];
    for (let i = this.mobs.list.length - 1; i >= 0; i--) {
      const m = this.mobs.list[i]!;
      if (!m.def.persistent) continue;
      if (Math.floor(m.pos[0]! / 16) !== c.cx || Math.floor(m.pos[2]! / 16) !== c.cz || Math.floor(m.pos[3]! / 16) !== c.cw) continue;
      out.push(this.mobs.serialize(m));
      this.mobs.list.splice(i, 1);
    }
    if (out.length) {
      (c.extra as { mobs?: SavedMob[] }).mobs = out;
      c.edited = true;
      c.dirty = true;
    }
  }

  /** Before a save: write every loaded column's persistent mobs into its data (they stay live). */
  private snapshotMobs(): void {
    const byCol = new Map<Column, SavedMob[]>();
    for (const m of this.mobs.list) {
      if (!m.def.persistent) continue;
      const c = this.world.column(Math.floor(m.pos[0]! / 16), Math.floor(m.pos[2]! / 16), Math.floor(m.pos[3]! / 16));
      if (!c) continue;
      let l = byCol.get(c);
      if (!l) byCol.set(c, (l = []));
      l.push(this.mobs.serialize(m));
    }
    for (const c of this.world.columns.values()) {
      const ex = c.extra as { mobs?: SavedMob[] };
      const now = byCol.get(c);
      if (!now && !ex.mobs) continue;
      if (now) ex.mobs = now;
      else delete ex.mobs;
      c.dirty = true;
    }
  }

  /** Right click / tap on a villager: open trading (their data is created on first contact). */
  talkTo(m: Mob): boolean {
    const prof = m.def.profession;
    if (!prof) return false;
    m.data ??= newVillager(prof, m.id * 2654435761);
    if (!m.data.home) m.data.home = [m.pos[0]!, m.pos[1]!, m.pos[2]!, m.pos[3]!];
    this.onOpenScreen?.({ kind: 'trade', mob: m.id });
    return true;
  }

  /** The villager behind a trade screen (or null if it has gone). */
  villager(id: number): { mob: Mob; data: VillagerData } | null {
    const m = this.mobs.list.find((x) => x.id === id);
    return m?.data ? { mob: m, data: m.data } : null;
  }

  /**
   * Trade once with offer `i` of villager `id`: pays the (reputation- and demand-adjusted)
   * price from the inventory and hands over the result. Returns false if it cannot.
   */
  trade(id: number, i: number): boolean {
    const v = this.villager(id);
    if (!v) return false;
    const o = v.data.offers[i];
    if (!o || soldOut(o)) return false;
    const prices = o.cost.map((c, k) => [IREG.id(c[0]), price(o, k, v.data.rep)] as [number, number]);
    const creative = this.player.mode === 'creative';
    if (!creative) {
      for (const [item, n] of prices) if (countIn(this.inv, item) < n) return false;
      for (const [item, n] of prices) removeFrom(this.inv, (st) => st.id === item, n);
    }
    const res: ItemStack = { id: IREG.id(o.result[0]), count: o.result[1], damage: 0 };
    const left = this.inv.add(res);
    if (left > 0) this.throwStack({ ...res, count: left });
    const up = recordTrade(v.data, o);
    const m = v.mob;
    this.particles.burst(m.pos[0]!, m.pos[1]! + m.height + 0.2, m.pos[2]!, m.pos[3]!, this.player.cam, 'spark', '#6aff8a', 8, 1.2, 0.3, true);
    if (up) this.message?.(`${m.def.displayName} is now ${LEVEL_NAMES[v.data.level]}`);
    return true;
  }

  /** Twice a day villagers restock; now and then a Wandering Merchant turns up. */
  private villageTick(): void {
    const half = Math.floor(this.env.ticks / (TICKS_PER_DAY / 2));
    for (const m of this.mobs.list) if (m.data && m.def.profession && m.def.profession !== 'merchant') restock(m.data, half);
    // Merchants leave after about a day and a half.
    const life = (TICKS_PER_DAY / 20) * 1.5;
    for (let i = this.mobs.list.length - 1; i >= 0; i--) {
      const m = this.mobs.list[i]!;
      if (m.def.profession === 'merchant' && m.age > life) this.mobs.list.splice(i, 1);
    }
    const day = this.env.day;
    if (!this.mobs.enabled || day === this.merchantDay || this.env.timeOfDay > 4000) return;
    this.merchantDay = day;
    if (this.mobs.list.some((m) => m.def.profession === 'merchant') || Math.random() > 0.35) return;
    const p = this.player, F = p.cam.F, R = p.cam.R;
    const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 10;
    const x = p.pos[0]! + (Math.cos(a) * F[0]! + Math.sin(a) * R[0]!) * d, z = p.pos[2]! + (Math.cos(a) * F[2]! + Math.sin(a) * R[2]!) * d, w = p.pos[3]! + (Math.cos(a) * F[3]! + Math.sin(a) * R[3]!) * d;
    const y = this.world.skyHeight(Math.floor(x), Math.floor(z), Math.floor(w));
    const m = this.mobs.spawn('wandering_merchant', x, y, z, w);
    if (m) {
      m.data = newVillager('merchant', (Math.random() * 2 ** 32) >>> 0);
      m.data.home = [x, y, z, w];
      this.message?.('A Wandering Merchant has arrived nearby');
    }
  }
  private merchantDay = -1;
  private villageTimer = 0;

  /** Keep the held atlas pointing at the nearest marked structure (new search on travel). */
  private updateAtlas(): void {
    const st = this.held;
    const names = st ? IREG.def(st.id).atlas : undefined;
    if (!st || !names || this.atlasPending) return;
    const e = this.player.pos, a = this.atlas;
    if (a && a.item === st.id && Math.hypot(a.at[0] - e[0]!, a.at[1] - e[2]!, a.at[2] - e[3]!) < 48) return;
    const item = st.id, at: [number, number, number] = [e[0]!, e[2]!, e[3]!];
    this.atlasPending = true;
    void this.pool.locate(names, at[0], at[1], at[2], ATLAS_RANGE).then((target) => {
      this.atlasPending = false;
      this.atlas = { item, target, at };
    });
  }

  // ------------------------------------------------------------------ beds & sleeping

  /**
   * Use a bed: it becomes your respawn point, and at night (or in a thunderstorm) you sleep
   * until morning, unless monsters are near. R2: the refusal names the monster and where it
   * is, including how far kata/ana of your slice, since you may not be able to see it.
   */
  useBed(x: number, y: number, z: number, w: number): boolean {
    const say = (t: string) => this.message?.(t);
    if (!this.world.realm.dayCycle) {
      say('You can’t sleep here: this realm has no nights');
      return false;
    }
    const b = this.bed;
    const moved = !b || b[0] !== x || b[1] !== y || b[2] !== z || b[3] !== w;
    this.bed = [x, y, z, w];
    const tod = this.env.timeOfDay;
    const storm = this.env.weather === 'thunder' || this.env.weather === 'phase_storm';
    if ((tod < SLEEP_FROM || tod > SLEEP_UNTIL) && !storm) {
      say(moved ? 'Respawn point set · you can only sleep at night or in a thunderstorm' : 'You can only sleep at night or in a thunderstorm');
      return false;
    }
    const p = this.player;
    if (p.mode === 'survival' || p.mode === 'adventure') {
      const c = [x + 0.5, y + 0.5, z + 0.5, w + 0.5];
      for (const m of this.mobs.list) {
        if (!m.def.hostile) continue;
        // Minecraft's rule: 8 blocks horizontally (here x, z and w) and 5 vertically.
        const dx = m.pos[0]! - c[0]!, dz = m.pos[2]! - c[2]!, dw = m.pos[3]! - c[3]!;
        if (dx * dx + dz * dz + dw * dw > 64 || Math.abs(m.pos[1]! - c[1]!) > 5) continue;
        let dh = 0;
        for (let k = 0; k < 4; k++) dh += (m.pos[k]! - this.eyePos[k]!) * p.cam.H[k]!;
        const where = Math.abs(dh) < 0.5 ? 'in your slice' : `${Math.round(Math.abs(dh))} m ${dh > 0 ? 'ana' : 'kata'} of your slice`;
        say(`You may not rest now: a ${m.def.displayName} is nearby (${where})`);
        return false;
      }
    }
    this.sleeping = { t: 0, skipped: false };
    this.resetMining();
    this.bowDraw = 0;
    if (moved) say('Respawn point set');
    return true;
  }

  /** 0..1 darkness of the sleep fade (the HUD draws it). */
  get sleepFade(): number {
    const s = this.sleeping;
    if (!s) return 0;
    return s.skipped ? Math.max(0, 1 - (s.t - SLEEP_FADE) / WAKE_FADE) : Math.min(1, s.t / SLEEP_FADE);
  }

  /** Get out of bed (before the screen is dark, the night does not pass). */
  wake(): void {
    this.sleeping = null;
  }

  /** Asleep: fade out, then the night passes (storms clear) and the screen fades back in. */
  private updateSleep(dt: number, active: boolean): void {
    const s = this.sleeping!;
    this.stopMoving();
    if (!active || this.vitals.dead) return;
    if (!s.skipped && (this.input.pressed('jump') || this.input.pressed('sneak'))) {
      this.wake();
      return;
    }
    s.t += dt;
    if (!s.skipped && s.t >= SLEEP_FADE) {
      s.skipped = true;
      const tod = this.env.timeOfDay;
      if (tod >= TICKS_PER_DAY / 2) this.env.ticks += TICKS_PER_DAY - tod;
      if (this.env.weather !== 'clear') this.env.setWeather('clear', false);
      this.message?.(`Good morning! Day ${this.env.day + 1}`);
    }
    if (s.t >= SLEEP_FADE + WAKE_FADE) this.sleeping = null;
  }

  /** No movement input (paused, dead, a screen is open). */
  private stopMoving(): void {
    const m = this.move;
    m.forward = 0;
    m.strafe = 0;
    m.ana = 0;
    m.jump = false;
    m.sneak = false;
    m.sprint = false;
    this.bowDraw = 0;
  }

  /** Is the crosshair on a crafting table or container (right click opens it)? */
  private stationTargeted(): boolean {
    if (!this.hasTarget || this.input.held('sneak')) return false;
    const tid = voxelId(this.target.voxel);
    return REG.blocks[tid]!.name === 'crafting_table' || this.blockEntities.hasEntity(tid) || isBed(this.target.voxel);
  }

  // ------------------------------------------------------------------ combat & health

  /** Melee attack on a mob with the held item. Returns true if it landed. */
  attack(m: Mob): boolean {
    const p = this.player;
    const held = this.held;
    const heldId = held ? held.id : -1;
    const cd = attackCooldown(heldId);
    const full = this.sinceSwing >= cd * 0.9;
    let dmg = attackDamage(heldId) * swingStrength(this.sinceSwing, cd);
    // Critical hit: a full-strength swing while falling.
    const crit = full && !p.onGround && !p.flying && p.vel[p.up]! < 0 && !p.inWater && !p.onClimbable;
    if (crit) dmg *= CRIT_MULTIPLIER;
    this.sinceSwing = 0;
    // Knockback along your forward direction: it stays inside the slice.
    const from = this.tmp4;
    const F = p.cam.F;
    for (let k = 0; k < 4; k++) from[k] = m.pos[k]! - F[k]!;
    if (!this.mobs.damage(m, dmg, from, this.eyePos, p.cam.H)) return false;
    if (m.data && m.def.profession) {
      // Hitting a villager: it and its neighbours think less of you (prices go up).
      offend(m.data, 5);
      for (const o of this.mobs.list) if (o !== m && o.data?.village && o.data.village === m.data.village) offend(o.data, 2);
    }
    // Hit particles where the ray met the body.
    const e = this.eyePos, f = this.pickDir;
    let t = 0;
    for (let k = 0; k < 4; k++) t += (m.pos[k]! - e[k]!) * f[k]!;
    t = Math.max(0.5, t - m.width);
    this.particles.burst(e[0]! + f[0]! * t, e[1]! + f[1]! * t, e[2]! + f[2]! * t, e[3]! + f[3]! * t, p.cam, crit ? 'spark' : 'poof', crit ? '#fff2a0' : '#b02020', crit ? 12 : 6, crit ? 3 : 1.2, 0.1, crit);
    if (crit) this.message?.('Critical hit!');
    this.mobs.noise(m.pos);
    // Weapon wear (survival).
    if (held && p.mode === 'survival') {
      const wear = hitWear(heldId);
      if (wear > 0) {
        held.damage += wear;
        if (held.damage >= IREG.durability[held.id]!) {
          this.inv.set(this.hotbarIndex, null);
          this.message?.(`${IREG.displayName(held.id)} broke`);
        } else this.inv.set(this.hotbarIndex, held);
      }
    }
    return true;
  }

  /** Let go of a drawn bow: shoot an arrow along the view direction (inside the slice). */
  private releaseBow(): void {
    const p = this.player;
    const power = bowPower(this.bowDraw);
    if (power < 0.1) return;
    const arrow = IREG.id('arrow');
    const survival = p.mode === 'survival' || p.mode === 'adventure';
    if (survival) {
      if (countIn(this.inv, arrow) <= 0) {
        this.message?.('No arrows');
        return;
      }
      removeFrom(this.inv, (s) => s.id === arrow, 1);
    }
    const e = this.eyePos, f = p.cam.fwd;
    const from = this.tmp4;
    for (let k = 0; k < 4; k++) from[k] = e[k]! + f[k]! * 0.4;
    from[p.up] = from[p.up]! - 0.1;
    const v = this.tmpMin;
    for (let k = 0; k < 4; k++) v[k] = f[k]! * ARROW_SPEED * power;
    this.projectiles.spawn(from, v, arrowDamage(power), arrow, true);
    const held = this.held;
    if (held && survival) {
      held.damage += 1;
      if (held.damage >= IREG.durability[held.id]!) {
        this.inv.set(this.hotbarIndex, null);
        this.message?.(`${IREG.displayName(held.id)} broke`);
      } else this.inv.set(this.hotbarIndex, held);
    }
  }

  /**
   * Damage the player (survival/adventure only; creative and spectator are invulnerable).
   * `from` (a 4D point) sets the knockback direction, which is kept inside the slice so a hit
   * never shifts your view kata/ana.
   */
  hurtPlayer(amount: number, from: ArrayLike<number> | null, cause: string): boolean {
    if (this.sleeping && amount > 0) this.wake();
    const p = this.player;
    const vulnerable = this.loaded && (p.mode === 'survival' || p.mode === 'adventure');
    if (this.vitals.damage(amount, cause, !vulnerable) <= 0) return false;
    if (from) {
      const H = p.cam.H;
      const up = p.up;
      const d = this.tmpMax;
      let dh = 0;
      for (let k = 0; k < 4; k++) {
        d[k] = k === up ? 0 : p.pos[k]! - from[k]!;
        dh += d[k]! * H[k]!;
      }
      // Which side of the slice the attacker was on (HUD damage indicator).
      this.vitals.lastHitSide = dh < -0.3 ? 1 : dh > 0.3 ? -1 : 0;
      let l = 0;
      for (let k = 0; k < 4; k++) {
        d[k] = d[k]! - dh * H[k]!;
        l += d[k]! * d[k]!;
      }
      l = Math.sqrt(l);
      if (l > 1e-3) for (let k = 0; k < 4; k++) if (k !== up) p.vel[k] = (d[k]! / l) * 6;
      p.vel[up] = Math.max(p.vel[up]!, 5);
    } else this.vitals.lastHitSide = 0;
    return true;
  }

  /** Falls, lava, damaging blocks, the void, drowning; death and the death screen. */
  private updateVitals(dt: number): void {
    const p = this.player;
    const v = this.vitals;
    const vulnerable = this.loaded && (p.mode === 'survival' || p.mode === 'adventure');
    if (p.lastFall > 0) {
      const fall = p.lastFall;
      p.lastFall = 0;
      if (vulnerable && !p.inWater && !p.onClimbable && p.slow >= 1) {
        const dmg = Vitals.fallDamage(fall);
        if (dmg > 0) this.hurtPlayer(dmg, null, 'Fell from a high place');
      }
    }
    const drown = v.update(dt, p.eyeInWater, !vulnerable);
    if (drown > 0) this.hurtPlayer(drown, null, 'Drowned');
    this.envDamageTimer -= dt;
    if (this.envDamageTimer <= 0 && vulnerable && !p.frozen) {
      this.envDamageTimer = 0.5;
      if (p.inLava) this.hurtPlayer(4, null, 'Tried to swim in lava');
      else {
        const c = this.contactDamage();
        if (c > 0) this.hurtPlayer(REG.damage[c]!, null, REG.blocks[c]!.displayName ?? REG.blocks[c]!.name);
      }
      if (p.pos[p.up]! < -32) this.hurtPlayer(4, null, 'Fell out of the world');
    }
    if (v.dead && !this.deathHandled) {
      this.deathHandled = true;
      this.bowDraw = 0;
      this.resetMining();
      // Spill the inventory where you fell.
      const x = Math.floor(p.pos[0]!), y = Math.floor(p.pos[1]! + 0.5), z = Math.floor(p.pos[2]!), w = Math.floor(p.pos[3]!);
      for (let i = 0; i < this.inv.size; i++) {
        const s = this.inv.get(i);
        if (!s) continue;
        this.inv.set(i, null);
        this.dropAtCell(x, y, z, w, s);
      }
      this.onDeath?.(v.deathCause);
    }
  }

  /** Id of a damaging block (cactus, magma...) touching the player's body, or 0. */
  private contactDamage(): number {
    const p = this.player;
    const up = p.up;
    const mn = this.tmpMin, mx = this.tmpMax;
    for (let k = 0; k < 4; k++) {
      mn[k] = k === up ? p.pos[k]! - 0.05 : p.pos[k]! - 0.35;
      mx[k] = k === up ? p.pos[k]! + p.height : p.pos[k]! + 0.35;
    }
    let best = 0;
    for (let y = Math.floor(mn[1]!); y <= Math.floor(mx[1]!); y++)
      for (let w = Math.floor(mn[3]!); w <= Math.floor(mx[3]!); w++)
        for (let z = Math.floor(mn[2]!); z <= Math.floor(mx[2]!); z++)
          for (let x = Math.floor(mn[0]!); x <= Math.floor(mx[0]!); x++) {
            const id = this.world.getBlock(x, y, z, w) & 0xfff;
            if (REG.damage[id]! > (best ? REG.damage[best]! : 0)) best = id;
          }
    return best;
  }

  /** Where you come back after dying: on your bed if you slept in one, else the world spawn. */
  respawnPoint(): number[] {
    const b = this.bed;
    return b ? [b[0] + 0.5, b[1] + 0.6, b[2] + 0.5, b[3] + 0.5] : [...this.spawn];
  }

  /** Back to the spawn point with full health (hardcore worlds turn into spectator mode). */
  respawn(): void {
    const p = this.player;
    this.vitals.respawn();
    this.deathHandled = false;
    if (this.info.hardcore) p.mode = 'spectator';
    const [x, y, z, w] = this.respawnPoint();
    p.setPosition(x!, y!, z!, w!);
    this.checkBed = this.bed !== null;
    this.sleeping = null;
    p.lastFall = 0;
    this.params.damage = 0;
    // Wait for the spawn column again (checkLoaded also lifts us out of any terrain).
    this.loaded = false;
    p.frozen = true;
    this.streamer.invalidate();
  }

  /**
   * An explosion: removes blocks in a 4D ball (hardness-limited), drops some of them, and
   * hurts the player and mobs nearby.
   */
  explode(x: number, y: number, z: number, w: number, radius: number): void {
    const ri = Math.ceil(radius);
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z), cw = Math.floor(w);
    const counts = new Map<number, number>();
    for (let dw = -ri; dw <= ri; dw++)
      for (let dz = -ri; dz <= ri; dz++)
        for (let dy = -ri; dy <= ri; dy++)
          for (let dx = -ri; dx <= ri; dx++) {
            const bx = cx + dx, by = cy + dy, bz = cz + dz, bw = cw + dw;
            const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z, bw + 0.5 - w);
            if (d > radius * (0.7 + 0.3 * Math.random())) continue;
            const v = this.world.getBlock(bx, by, bz, bw);
            if (v === 0 || v === VOID_VOXEL) continue;
            const id = v & 0xfff;
            const hard = REG.hardness[id]!;
            if (hard < 0 || hard >= 30 || REG.fluid[id] !== 0) continue;
            if (!this.world.setBlock(bx, by, bz, bw, 0)) continue;
            if (Math.random() < 0.3) for (const st of rollDrops(id, -1, Math.random)) counts.set(st.id, (counts.get(st.id) ?? 0) + st.count);
          }
    for (const [id, n] of counts) {
      let left = n;
      while (left > 0) {
        const c = Math.min(left, IREG.maxStack[id]!);
        left -= c;
        this.dropAtCell(cx, cy, cz, cw, { id, count: c, damage: 0 });
      }
    }
    // Damage falls off over twice the radius (a gentler curve than Minecraft's: no armour yet).
    const diff = DIFFICULTY[this.info.difficulty] ?? 2;
    const mult = diff === 1 ? 0.5 : diff === 3 ? 1.5 : 1;
    const p = this.player;
    const reach = radius * 2;
    const pc = this.tmp4;
    for (let k = 0; k < 4; k++) pc[k] = p.pos[k]!;
    pc[p.up] = pc[p.up]! + 0.9;
    const dp = Math.hypot(pc[0]! - x, pc[1]! - y, pc[2]! - z, pc[3]! - w);
    if (dp < reach) {
      const impact = 1 - dp / reach;
      const center = [x, y, z, w];
      this.hurtPlayer(Math.round(((impact * impact + impact) / 2) * 3.5 * reach * mult + 1), center, 'Blown up');
    }
    for (const m of this.mobs.list) {
      const dm = Math.hypot(m.pos[0]! - x, m.pos[1]! + m.height * 0.5 - y, m.pos[2]! - z, m.pos[3]! - w);
      if (dm >= reach) continue;
      const impact = 1 - dm / reach;
      m.hurt = 0;
      this.mobs.damage(m, ((impact * impact + impact) / 2) * 3.5 * reach + 1, [x, y, z, w]);
    }
    this.particles.burst(x, y, z, w, p.cam, 'smoke', '#6a6a6a', 40, 4, radius * 0.6);
    this.particles.burst(x, y, z, w, p.cam, 'spark', '#ffb040', 24, 7, radius * 0.3, true);
    this.params.damage = Math.max(this.params.damage, 0.3);
    this.mobs.noise([x, y, z, w]);
  }

  /** Drop a stack at a 4D point, moved onto the view hyperplane when it is close to it. */
  dropInSlice(x: number, y: number, z: number, w: number, st: ItemStack): void {
    const H = this.player.cam.H, e = this.eyePos;
    const d = (x - e[0]!) * H[0]! + (y - e[1]!) * H[1]! + (z - e[2]!) * H[2]! + (w - e[3]!) * H[3]!;
    if (Math.abs(d) < 1.5) {
      x -= d * H[0]!;
      y -= d * H[1]!;
      z -= d * H[2]!;
      w -= d * H[3]!;
    }
    const a = Math.random() * Math.PI * 2;
    const R = this.player.cam.R, F = this.player.cam.F;
    const v = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) v[k] = (Math.cos(a) * R[k]! + Math.sin(a) * F[k]!) * 1.5;
    v[this.player.up] = 3;
    this.items.spawn(x, y, z, w, st, v, 0.3);
  }

  /**
   * R2 proximity warning: hostile mobs within 16 blocks that are (mostly) out of the slice
   * light the screen edge of the side they are on, brighter when closer.
   */
  private scanThreats(): void {
    const t = this.params.threat;
    t[0] = 0;
    t[1] = 0;
    const p = this.player;
    this.mobs.threats(p.pos, 16, this.threats);
    if (p.mode === 'creative' || p.mode === 'spectator') return;
    const e = this.eyePos, H = p.cam.H;
    for (const m of this.threats) {
      let dh = 0, d2 = 0;
      for (let k = 0; k < 4; k++) {
        const dk = m.pos[k]! - e[k]!;
        dh += dk * H[k]!;
        d2 += dk * dk;
      }
      if (Math.abs(dh) < 0.25) continue; // in your slice: you can see it
      const s = Math.max(0, Math.min(1, 1.15 - Math.sqrt(d2) / 14));
      const side = dh < 0 ? 0 : 1;
      t[side] = Math.max(t[side]!, s);
    }
  }

  // ------------------------------------------------------------------ items & mining

  private resetMining(): void {
    this.mineProgress = 0;
    this.mineCell[0] = -2147483648;
    this.params.breakProgress = 0;
  }

  /** Survival mining: accumulate progress on the targeted block while the button is held. */
  private mineStep(dt: number): void {
    const t = this.target;
    const c = this.mineCell;
    const held = this.held;
    const heldId = held ? held.id : -1;
    if (c[0] !== t.x || c[1] !== t.y || c[2] !== t.z || c[3] !== t.w) {
      c[0] = t.x;
      c[1] = t.y;
      c[2] = t.z;
      c[3] = t.w;
      this.mineProgress = 0;
    }
    // Break time depends on the held tool, whether we stand on the ground and are underwater.
    this.mineSeconds = breakInfo(voxelId(t.voxel), heldId, this.player.onGround || this.player.flying, this.player.eyeInWater).seconds;
    if (this.mineDelay > 0) {
      this.mineDelay -= dt;
      return;
    }
    if (!Number.isFinite(this.mineSeconds)) {
      this.params.breakProgress = 0;
      return;
    }
    this.mineProgress += this.mineSeconds <= 0 ? 1 : dt / this.mineSeconds;
    this.params.breakProgress = Math.min(1, this.mineProgress);
    if (this.mineProgress >= 1) {
      this.harvestTarget();
      this.resetMining();
      this.mineDelay = 0.2;
    }
  }

  /** Break the targeted block as a survival player: drops, tool wear. */
  harvestTarget(): boolean {
    if (!this.hasTarget) return false;
    const t = this.target;
    const id = voxelId(t.voxel);
    const held = this.held;
    const heldId = held ? held.id : -1;
    const drops = rollDrops(id, heldId, Math.random);
    if (!this.world.setBlock(t.x, t.y, t.z, t.w, 0)) return false;
    for (const d of drops) this.dropAtCell(t.x, t.y, t.z, t.w, d);
    this.mobs.noise([t.x + 0.5, t.y + 0.5, t.z + 0.5, t.w + 0.5]); // Lurkers hear mining
    const wear = wearFor(id, heldId);
    if (held && wear > 0) {
      held.damage += wear;
      if (held.damage >= IREG.durability[held.id]!) {
        this.inv.set(this.hotbarIndex, null);
        this.message?.(`${IREG.displayName(held.id)} broke`);
      } else this.inv.set(this.hotbarIndex, held);
    }
    return true;
  }

  /**
   * Spawn a dropped stack at a block cell. The drop is placed where the view hyperplane
   * crosses the cell (the part of the block you saw), so it is visible in your slice.
   */
  dropAtCell(x: number, y: number, z: number, w: number, st: ItemStack): void {
    const H = this.player.cam.hidden;
    const e = this.eyePos;
    const c = this.tmp4;
    c[0] = x + 0.5;
    c[1] = y + 0.3;
    c[2] = z + 0.5;
    c[3] = w + 0.5;
    let d = 0;
    for (let i = 0; i < 4; i++) d += (c[i]! - e[i]!) * H[i]!;
    const cell = [x, y, z, w];
    for (let i = 0; i < 4; i++) c[i] = Math.max(cell[i]! + 0.08, Math.min(cell[i]! + 0.92, c[i]! - d * H[i]!));
    const R = this.player.cam.R, F = this.player.cam.F;
    const a = Math.random() * Math.PI * 2, sp = 1.2;
    const v = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) v[i] = (Math.cos(a) * R[i]! + Math.sin(a) * F[i]!) * sp;
    v[this.player.up] = 3.5;
    this.items.spawn(c[0]!, c[1]!, c[2]!, c[3]!, st, v, 0.4);
  }

  /** Throw the held item (one, or the whole stack) forward, in the slice. */
  dropHeld(all: boolean): void {
    const held = this.held;
    if (!held || this.player.mode === 'spectator') return;
    const n = all ? held.count : 1;
    const out: ItemStack = { id: held.id, count: n, damage: held.damage };
    held.count -= n;
    this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
    this.throwStack(out);
  }

  /** Throw a stack forward from the eye (also used by the UI for items dropped outside it). */
  throwStack(st: ItemStack): void {
    const e = this.eyePos, f = this.player.cam.fwd;
    const v = [f[0]! * 5, f[1]! * 5 + 2, f[2]! * 5, f[3]! * 5];
    this.items.spawn(e[0]! + f[0]! * 0.4, e[1]! - 0.35, e[2]! + f[2]! * 0.4, e[3]! + f[3]! * 0.4, st, v, 1.5);
  }

  /** Right click: open a station/container, use an item, or place the held block. */
  private useHeld(sneaking: boolean): void {
    const held = this.held;
    if (this.hasTarget && !(sneaking && held)) {
      const t = this.target;
      const tid = voxelId(t.voxel);
      const pos: [number, number, number, number] = [t.x, t.y, t.z, t.w];
      const name = REG.blocks[tid]!.name;
      if (name === 'crafting_table') {
        this.onOpenScreen?.({ kind: 'crafting', pos });
        return;
      }
      if (isBed(t.voxel)) {
        this.useBed(t.x, t.y, t.z, t.w);
        return;
      }
      if (this.blockEntities.hasEntity(tid)) {
        const fk = this.blockEntities.furnaceKind(tid);
        this.onOpenScreen?.(fk ? { kind: 'furnace', pos, furnace: fk } : { kind: 'chest', pos });
        return;
      }
    }
    if (!held) return;
    const def = IREG.def(held.id);
    if (def.use) {
      this.useItem(held, def.use);
      return;
    }
    const bid = IREG.itemBlock[held.id]!;
    if (bid < 0) return;
    if (this.placeAtTarget(bid) && this.player.mode === 'survival') {
      held.count--;
      this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
    }
  }

  private useItem(held: ItemStack, use: NonNullable<ReturnType<typeof IREG.def>['use']>): void {
    const survival = this.player.mode === 'survival';
    const reach = survival ? 5 : 7;
    if (use === 'bucket') {
      const hit = this.fluidHit;
      if (!raycast(this.world, this.eyePos, this.pickDir, reach, hit, true)) return;
      const v = hit.voxel;
      const fl = REG.fluid[voxelId(v)]!;
      if (fl === 0 || (v >>> 12) !== 0) return; // only sources can be scooped
      this.world.setBlock(hit.x, hit.y, hit.z, hit.w, 0);
      const filled = { id: IREG.id(fl === FLUID_WATER ? 'water_bucket' : 'lava_bucket'), count: 1, damage: 0 };
      if (!survival) return;
      if (held.count === 1) this.inv.set(this.hotbarIndex, filled);
      else {
        held.count--;
        this.inv.set(this.hotbarIndex, held);
        if (this.inv.add(filled) > 0) this.throwStack(filled);
      }
      return;
    }
    if (use === 'water_bucket' || use === 'lava_bucket') {
      if (!this.hasTarget) return;
      const placed = this.placeAtTarget(use === 'water_bucket' ? REG.id('water') : REG.id('lava'));
      if (placed && survival) this.inv.set(this.hotbarIndex, { id: IREG.id('bucket'), count: 1, damage: 0 });
      return;
    }
    if (use === 'flint_and_steel') {
      this.message?.('Nothing to light here yet (portals arrive with the Ember Depths).');
    }
  }

  /** Middle click: select (or, in creative, create) the targeted block's item in the hotbar. */
  private pickBlock(): void {
    const item = IREG.blockItem[voxelId(this.target.voxel)]!;
    if (item < 0) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.inv.get(i)?.id === item) {
        this.hotbarIndex = i;
        return;
      }
    }
    if (this.player.mode === 'creative') {
      this.inv.set(this.hotbarIndex, { id: item, count: IREG.maxStack[item]!, damage: 0 });
      return;
    }
    // Survival: swap from the main inventory into the selected hotbar slot.
    for (let i = HOTBAR_SIZE; i < 36; i++) {
      const s = this.inv.get(i);
      if (s?.id !== item) continue;
      const cur = this.inv.get(this.hotbarIndex);
      this.inv.set(this.hotbarIndex, s);
      this.inv.set(i, cur);
      return;
    }
  }

  /** Apply settings that need more than a per-frame read (render distance, resolution). */
  applySettings(): void {
    const s = this.settings;
    if (s.resolution === 'auto') this.scaler.mode = 'auto';
    else {
      this.scaler.mode = 'fixed';
      this.scaler.fixedHeight = s.resolution;
    }
    this.particles.density = particleDensity(s);
    if (s.renderDistance !== this.world.radius) {
      this.world.resize(s.renderDistance);
      this.renderer.gpu.resize(this.world.N, this.world.heightChunks);
      this.streamer.invalidate();
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

