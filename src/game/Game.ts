// Game orchestration: owns every engine system and runs the frame loop.
//
// Per frame (allocation-free in steady state):
//   input -> camera/physics -> fixed 20 Hz ticks (time, weather, fluids) -> streaming ->
//   light BFS (budgeted) -> GPU sync (budgeted) -> picking -> hazards -> render -> HUD.

import { REG, makeVoxel, voxelId, voxelMeta, hexToRgb, FLUID_LAVA, VARIANT_HORIZONTAL6, VARIANT_VERTICAL2, VARIANT_DOOR, FLUID_WATER, FACING_AXES, FACING_SIGNS } from '../content/registry';
import { Particles } from '../env/Particles';
import { Environment, TICKS_PER_DAY, DAY_FRACTION } from '../env/Environment';
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
import { IREG, toolCode } from '../content/itemRegistry';
import { MOB_REG } from '../content/mobRegistry';
import { Inventory, HOTBAR_SIZE } from './items/Inventory';
import { ItemEntities } from './items/ItemEntities';
import { BlockEntities } from './items/BlockEntities';
import { breakInfo, canHarvest, rollDrops, wearFor } from './items/Mining';
import { countIn, enchLevel, loadStack, removeFrom, stackOf, withCount, type ItemStack } from './items/ItemStack';
import { LOVE_TIME, MobManager, type Mob, type MobHost } from './mobs/MobManager';
import { Projectiles, type ProjectileHost } from './mobs/Projectiles';
import { MAX_AIR, MAX_HEALTH, Vitals } from './Vitals';
import { newVillager, offend, price, recordTrade, restock, soldOut, type VillagerData } from './Trading';
import { LEVEL_NAMES } from '../content/trades';
import type { SavedMob } from './mobs/MobManager';
import type { Column } from '../world/World';
import { ARROW_SPEED, CRIT_MULTIPLIER, arrowDamage, attackCooldown, attackDamage, bowPower, hitWear, swingStrength, shieldCovers } from './combat';
import type { BiomeDef } from '../content/types';
import type { FurnaceKind } from '../content/types';
import { IconAtlas, SHEET_H, SHEET_W } from '../ui/IconAtlas';
import { particleDensity, type Settings } from './Settings';
import type { WeatherKind } from '../content/types';
import type { Persistence } from '../save/Persistence';
import type { SavedState, WorldInfo } from '../save/WorldInfo';
import type { GameMode } from '../physics/Player';
import type { Located } from '../world/gen/protocol';
import { BossDirector } from './Boss';
import { FireSystem } from './Fire';
import { BURN_FIRE, BURN_LAVA } from '../content/fire';
import { findPortal, framedAxes, portalCenter, portalDestination, scalePosition, frameCells, interiorCells, type PortalBox, type PortalRecord, type PortalShape } from './Portals';
import { EffectList } from './Effects';
import { EFFECT_BY_NAME } from '../content/effects';
import { potionEffect } from '../content/potions';
import { Experience, Hunger, MAX_FOOD, armorApplies, armorReduce, armorWear, epfReduce, isFireDamage, type DamageKind } from './Survival';
import { KeyBlocks } from './KeyBlocks';
import { applyOffer, countBookshelves, enchantOffers, type EnchantOffer } from './Stations';
import { Farming } from './Farming';
import { BUSHES, PLANTS } from '../content/farming';
import { ARROWS } from '../content/ores';
import { THROWN, ANCHOR_COOLDOWN, ROPE_SPEED } from '../content/tools4d';
import { anaSheetCells } from './Tools4D';
import { DOOR_OTHER, DOOR_PART, STRIP_ID, doorPartner, isDoor, toggledDoor } from './WoodBlocks';
import { LOOT } from '../content/lootRegistry';
import { MAX_GRAVES, STARTER_KIT } from '../content/survival';
import type { Container } from './items/ItemStack';
import { XpOrbs } from './XpOrbs';
import { Vision4D } from './Vision4D';
import { ARMOR_START, OFFHAND } from './items/Inventory';
import { ARRIVAL_POS, gatewayAt } from '../content/void';
import { GATE, fillFrame, gateProgress } from './VoidGate';
import { VoidBoss } from './VoidBoss';
import { ROCKET_TIME } from '../physics/glide';

/** How the player arrives in a realm: through a portal (find or build its twin) or a respawn. */
export interface Arrival {
  kind: 'portal' | 'respawn' | 'void';
  /** Shape of the portal left behind (the arrival portal copies it). */
  axis?: number;
  /** Flat portals: the second normal axis. */
  thin?: number;
}

/**
 * Beds (sleep through the night, set your respawn point) are two cells: a foot (the item)
 * and a head one cell further along the bed's facing. BED_IDS: 1 foot, 2 head.
 */
const BED_IDS = new Uint8Array(REG.count);
/** Foot block id -> its head block id, and back. */
const BED_OTHER = new Int16Array(REG.count).fill(-1);
REG.blocks.forEach((b, i) => {
  if (!b.tags?.includes('bed')) return;
  const head = b.tags.includes('bed_head');
  BED_IDS[i] = head ? 2 : 1;
  const other = head ? b.name.replace(/_head$/, '') : `${b.name}_head`;
  if (REG.has(other)) BED_OTHER[i] = REG.id(other);
});
const isBed = (v: number): boolean => v !== VOID_VOXEL && BED_IDS[voxelId(v)]! > 0;
const SWORD_KIND = toolCode('sword');
const HOE_KIND = toolCode('hoe');
const PICKAXE_KIND = toolCode('pickaxe');
const AXE_KIND = toolCode('axe');
/** 4D Vision colours: stations, containers, beds, spawners. */
const KEY_COLORS: [number, number, number][] = [
  [1, 0.8, 0.3],
  [0.4, 0.85, 1],
  [1, 0.45, 0.6],
  [1, 0.3, 0.3],
];
/** Portal frame blocks (obsidian, voidstone) and fire (a portal can be lit through it). */
const PORTAL_FRAME = new Uint8Array(REG.count);
const FIRE_IDS = new Uint8Array(REG.count);
REG.blocks.forEach((b, i) => {
  if (b.name === 'obsidian' || b.tags?.includes('portal_frame')) PORTAL_FRAME[i] = 1;
  if (b.tags?.includes('fire')) FIRE_IDS[i] = 1;
});

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
  | { kind: 'trade'; mob: number }
  | { kind: 'enchanting'; pos: [number, number, number, number] }
  | { kind: 'anvil'; pos: [number, number, number, number] }
  | { kind: 'grindstone'; pos: [number, number, number, number] }
  | { kind: 'smithing'; pos: [number, number, number, number] }
  | { kind: 'brewing'; pos: [number, number, number, number] };

/** Stations that open a screen of their own (block name -> screen kind). */
const STATION_SCREENS: Record<string, 'enchanting' | 'anvil' | 'grindstone' | 'smithing'> = { enchanting_table: 'enchanting', anvil: 'anvil', grindstone: 'grindstone', smithing_table: 'smithing' };

const WEATHER_CYCLE: WeatherKind[] = ['clear', 'rain', 'snow', 'thunder', 'phase_storm'];
const DIFFICULTY: Record<string, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };
/** Attack reach (blocks) in survival and creative. */
const REACH_ATTACK = [3.5, 5];
/** How far an atlas looks for structures (blocks, 4D distance in x, z, w). */
export const ATLAS_RANGE = 1600;
/** Beds work from dusk to just before dawn (Minecraft: ticks 12542..23459 of its day). */
const SLEEP_FROM = Math.round(DAY_FRACTION * TICKS_PER_DAY) + 300;
const SLEEP_UNTIL = TICKS_PER_DAY - 400;
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
  /** Start in this realm (test worlds: ?realm=ember); saves carry their own realm. */
  realm?: string;
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
  /** Boss fights: attacks, telegraphs and the HUD boss bar. */
  readonly bosses: BossDirector;
  /** The Void Sovereign's fight (Hollow Void). */
  voidBoss!: VoidBoss;
  /** Fire spread and burn-out (every lit or spreading fire). */
  readonly fire: FireSystem;
  /** Night vision toggle (creative and spectator only; N, or the touch button). */
  nightVision = false;

  // ---- Phase 7: effects, hunger, experience, armour, 4D vision
  readonly effects = new EffectList();
  readonly hunger = new Hunger();
  readonly xp = new Experience();
  readonly orbs = new XpOrbs();
  readonly vision = new Vision4D();
  /** Phase Strike: a mob kata/ana of the slice under the crosshair, and the cooldown. */
  phaseTarget: Mob | null = null;
  private phaseCd = 0;
  /** Reach Through: the targeted block is this far along the hidden axis (0 = in the slice). */
  targetShift = 0;
  private readonly reachHit: RayHit = makeRayHit();
  private surgeT = 30;
  /** Key blocks for 4D Vision. */
  readonly keyBlocks: KeyBlocks;
  /** Crops, saplings, bushes and farmland growing (Phase 7). */
  readonly farming: Farming;
  /** Frost Walker ice: world key -> seconds until it melts. */
  private readonly frosted = new Map<string, [number, number, number, number, number]>();
  private frostT = 0;
  private sliceSense: number[] = [];
  private sliceSenseT = 0;
  /** Holding up a shield (main hand or off hand). */
  blocking = false;
  /** Hyper Rope: climbing along the hidden axis (+1 ana, -1 kata, 0 not) and distance climbed. */
  private roping = 0;
  private ropeTravel = 0;
  private readonly ropeFrom = new Float64Array(4);
  /** W-Anchor recall cooldown (seconds). */
  anchorCd = 0;
  /** Graves you left (newest last), by realm: where your things wait after a death. */
  graves: { realm: string; pos: [number, number, number, number] }[] = [];
  /** The last cell you stood on safely (a grave goes there after a fall into the void or lava). */
  private lastSafe: [number, number, number, number] | null = null;
  /** A cast fishing line: the bobber's water cell, seconds waiting, when it bites, the bite window left. */
  fishing: { pos: [number, number, number, number]; t: number; biteAt: number; bite: number } | null = null;
  /** Crossbow: loaded, waiting for the use button to be let go. */
  private crossbowLatch = false;
  /** A mob hit off the slice by a spear's reach (outlined). */
  private reachTarget: Mob | null = null;
  /** Phase Lens: walls of the neighbouring slices, [x, y, z, w, side] (refreshed 5x a second). */
  private lensCells: number[] = [];
  private lensTimer = 0;
  /** Lit TNT: seconds left on each fuse (keyed by cell). */
  private readonly tnt = new Map<string, { x: number; y: number; z: number; w: number; fuse: number }>();
  private readonly tntId = REG.id('tnt');
  private readonly tntLitId = REG.id('tnt_lit');
  private shieldUp = 0;
  /** Enchanting table seed: the offers stay the same until you enchant something. */
  enchSeed = (Math.random() * 0x7fffffff) | 0;
  /** Hold-to-use in progress (eating, drinking): the item, its hotbar slot, seconds so far / needed. */
  using: { item: number; slot: number; t: number; need: number } | null = null;
  private effectTick = 0;
  private lastPos = new Float64Array(4);
  private wasOnGround = true;
  /** Seconds left breathing underwater after a dive with a Reefshell Helmet. */
  private reefAir = 0;
  /** Seconds the player keeps burning (touching fire 8 s, lava 15 s; water puts it out). */
  burning = 0;
  private burnTick = 0;
  private flameT = 0;
  /** Lit portals in every realm (saved with the world): arrivals look for their twins. */
  portals: PortalRecord[] = [];
  /** Seconds spent standing in a portal (the trip starts at 4 s, 1 s in creative). */
  portalTime = 0;
  /** Just arrived through a portal: no trip back until you step out of it. */
  private portalCooldown = false;
  /** Seconds spent standing in a lit Void Gate, and the cooldown after a gateway beam. */
  gateTime = 0;
  private gatewayCd = 0;
  /** A realm trip is under way (the page reloads into the destination): its display name. */
  traveling: string | null = null;
  /** Pending arrival in this realm (handled once the columns around the player load). */
  arrival: Arrival | null = null;
  private arrivalWait = 0;
  /** Change realms: save `state` and reload into it (main.ts). */
  onTravel: ((state: SavedState) => void) | null = null;
  private collapsing = false;
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
        u[i] = x / SHEET_W;
        v[i] = y / SHEET_H;
      }
      this.items.iconU = u;
      this.items.iconV = v;
    }
    return this.iconAtlas;
  }
  /** An experience orb reached the player. */
  private readonly collectXp = (points: number): void => {
    // Mending: experience repairs a damaged mending item (2 durability per point) first.
    const slots = [this.hotbarIndex, ARMOR_START, ARMOR_START + 1, ARMOR_START + 2, ARMOR_START + 3, ARMOR_START + 4];
    const damaged = slots.filter((i) => {
      const s = this.inv.get(i);
      return s && s.damage > 0 && enchLevel(s, 'mending') > 0;
    });
    if (damaged.length) {
      const i = damaged[Math.floor(Math.random() * damaged.length)]!;
      const s = this.inv.get(i)!;
      const fix = Math.min(s.damage, points * 2);
      s.damage -= fix;
      this.inv.set(i, s);
      points -= Math.ceil(fix / 2);
    }
    this.xp.add(points);
  };

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
    const realm = REG.realm(opts.realm ?? opts.world.state?.realm ?? 'surface');
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
    this.blockEntities.onGraveXp = (x, y, z, w, pts) => this.orbs.spawn(x, y, z, w, pts);

    this.fire = new FireSystem({
      world: this.world,
      random: Math.random,
      rainingAt: (x, y, z, w) => this.rainingAt(x, y, z, w),
      difficulty: () => DIFFICULTY[this.info.difficulty] ?? 2,
      ignited: (x, y, z, w) => void this.lightPortal(x, y, z, w),
      primeTnt: (x, y, z, w) => this.primeTnt(x, y, z, w),
    });
    this.keyBlocks = new KeyBlocks(this.world);
    this.farming = new Farming({
      world: this.world,
      drop: (x, y, z, w, st) => this.dropAtCell(x, y, z, w, st),
      raining: (x, y, z, w) => this.rainingAt(x, y, z, w),
      growTree: (b, x, y, z, w, n, X, Z, W) => {
        if (!this.generator.growTreeAt) return false;
        this.generator.growTreeAt(b, x, y, z, w, n, X, Z, W);
        return true;
      },
      height: this.world.height,
    });
    this.world.onBlockChange((x, y, z, w, o, n) => {
      this.light.onBlockChanged(x, y, z, w, o, n);
      this.keyBlocks.blockChanged(x, z, w, o, n);
      this.voidBoss.blockChanged(x, y, z, w, o, n);
      this.farming.blockChanged(x, y, z, w, o, n);
      this.portalBlockChanged(x, y, z, w, o, n);
      this.fire.blockChanged(x, y, z, w, o, n);
      this.fluids.onBlockChanged(x, y, z, w, o, n);
      // Breaking a chest or furnace spills its contents.
      const spill = this.blockEntities.onBlockChanged(x, y, z, w, o, n);
      for (const st of spill) this.dropAtCell(x, y, z, w, st);
      if (this.blockEntities.isGrave(o & 0xfff) && !this.blockEntities.isGrave(n & 0xfff)) {
        const gi = this.graves.findIndex((q) => q.realm === this.world.realm.name && q.pos[0] === x && q.pos[1] === y && q.pos[2] === z && q.pos[3] === w);
        if (gi >= 0) this.graves.splice(gi, 1);
      }
    });
    this.world.columnAdded = (c) => {
      this.renderer.gpu.onColumnAdded(c);
      this.blockEntities.onColumnAdded(c);
      this.farming.columnAdded(c);
      this.columnMobsIn(c);
    };
    this.world.columnRemoved = (c) => {
      this.renderer.gpu.onColumnRemoved(c);
      this.keyBlocks.columnRemoved(c);
      this.farming.columnRemoved(c);
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
    // Taking smelted items out of a furnace pays out its stored experience.
    this.blockEntities.onXp = (points) => {
      const p = this.player.pos;
      this.orbs.spawn(p[0]!, p[1]! + 0.9, p[2]!, p[3]!, points);
    };
    this.caveFn = gen.caveBiomeAt ? (x, y, z, w) => gen.caveBiomeAt!(x, y, z, w) : null;
    const game = this;
    this.mobHost = {
      world: this.world,
      get day() {
        return game.env.day;
      },
      playerPos: this.player.pos,
      playerHidden: this.player.cam.H,
      playerEye: this.eyePos,
      playerFwd: this.player.cam.fwd,
      inflict: (effect, seconds, amp) => void this.applyEffect(effect, seconds, amp),
      puff: (x, y, z, w, color) => this.particles.burst(x, y, z, w, this.player.cam, 'spark', color, 12, 1.4, 0.4, true),
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
      hurtPlayer: (amount, from, cause, kind, attacker) => void this.hurtPlayer(amount, from, cause, kind ?? 'melee', attacker ?? null),
      explode: (x, y, z, w, r) => this.explode(x, y, z, w, r),
      dropXp: (x, y, z, w, n) => this.orbs.spawn(x, y, z, w, n),
      shovePlayer: (d, what) => void this.shove(d, what),
      get heldItem() {
        return game.held?.id ?? -1;
      },
      hearts: (x, y, z, w) => this.particles.burst(x, y, z, w, this.player.cam, 'spark', '#ff5a8a', 2, 0.6, 0.3, true),
      leadBroke: (x, y, z, w) => this.dropInSlice(x, y, z, w, { id: IREG.id('lead'), count: 1, damage: 0 }),
      get playerStealth() {
        return game.effects.has('invisibility') ? 0.25 : 1;
      },
      shoot: (from, vel, damage, item, byPlayer) => this.projectiles.spawn(from, vel, damage, item, byPlayer),
      mobDied: (m) => {
        const h = m.height * 0.5;
        this.particles.burst(m.pos[0]!, m.pos[1]! + h, m.pos[2]!, m.pos[3]!, this.player.cam, 'poof', '#e8e8e8', 14, 1.6, m.width);
        if (m.def.boss) {
          this.particles.burst(m.pos[0]!, m.pos[1]! + h, m.pos[2]!, m.pos[3]!, this.player.cam, 'spark', '#ffb030', 60, 5, 1.2, true);
          this.bosses.clear();
          this.message?.(`${m.def.displayName} is defeated!`);
          if (m.def.name === 'void_sovereign') this.voidBoss.onDefeat(m);
        }
      },
    };
    this.bosses = new BossDirector({
      world: this.world,
      mobs: this.mobs,
      playerPos: this.player.pos,
      playerRight: this.player.cam.R,
      playerHidden: this.player.cam.H,
      playerTargetable: () => this.mobHost.playerTargetable,
      shoot: (from, vel, damage, item, byPlayer) => this.projectiles.spawn(from, vel, damage, item, byPlayer),
      flame: (x, y, z, w) => this.particles.burst(x, y, z, w, this.player.cam, 'spark', '#ff8a1a', 3, 2.4, 0.3, true),
      message: (t) => this.message?.(t),
    });
    this.voidBoss = new VoidBoss({
      world: this.world,
      mobs: this.mobs,
      playerPos: this.player.pos,
      playerRight: this.player.cam.R,
      playerHidden: this.player.cam.H,
      playerTargetable: () => this.mobHost.playerTargetable,
      difficulty: () => DIFFICULTY[this.info.difficulty] ?? 2,
      shoot: (from, vel, damage, item, byPlayer) => this.projectiles.spawn(from, vel, damage, item, byPlayer),
      glow: (x, y, z, w, color, n = 3) => this.particles.burst(x, y, z, w, this.player.cam, 'spark', color, n, 2.4, 0.5, true),
      message: (t) => this.message?.(t),
      dropItem: (x, y, z, w, st) => this.dropAtCell(x, y, z, w, st),
      blind: (seconds) => void this.applyEffect('blindness', seconds, 0),
    });
    this.projHost = {
      playerPos: this.player.pos,
      get playerHeight() {
        return game.player.height;
      },
      hurtPlayer: (amount, from, cause) => void this.hurtPlayer(amount, from, cause, 'projectile'),
      blockHit: (x, y, z, w, id, byPlayer) => this.voidBoss.projectileHit(x, y, z, w, id, byPlayer),
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
      impact: (item, pos) => this.burstAt(item, pos),
      returnStack: (st) => {
        // The chakram back in hand (its slot if free), else anywhere, else at your feet.
        if (!this.inv.get(this.hotbarIndex)) this.inv.set(this.hotbarIndex, st);
        else if (this.inv.add(st) > 0) this.dropInSlice(this.player.pos[0]!, this.player.pos[1]! + 0.5, this.player.pos[2]!, this.player.pos[3]!, st);
      },
      dropStack: (pos, st) => this.dropInSlice(pos[0]!, pos[1]!, pos[2]!, pos[3]!, { id: st.id, count: 1, damage: st.damage }),
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
      nightVision: 0,
      xray: false,
      handLight: 0,
    };
    this.particles.density = particleDensity(opts.settings);
    this.env.setTime(1500);
    if (opts.world.state) this.restore(opts.world.state);
    else if (!opts.test && !this.demo && opts.world.mode === 'survival') {
      // A new survival world starts with the means to get through the first night.
      for (const [name, n] of STARTER_KIT) if (IREG.has(name)) this.inv.add(stackOf(name, n));
    }
    else if (this.player.mode === 'creative') this.giveKit();
    if (this.demo) {
      this.player.mode = 'spectator';
      this.player.flying = true;
    }
  }

  /** Restore player/world state from a save. */
  private restore(st: SavedState): void {
    // Save version 1: the Surface was 128 blocks tall with the sea at 48; it is now 192 with
    // the sea at 104. Move everything on the Surface up with it.
    if ((this.info.version ?? 1) < 2) {
      const lift = 56;
      if (st.realm === 'surface' && st.player.pos.length === 4) st.player.pos[1] = st.player.pos[1]! + lift;
      const bed = st.player.data?.bed;
      if (Array.isArray(bed) && bed.length === 4) bed[1] = (bed[1] as number) + lift;
      const portals = st.data?.portals;
      if (Array.isArray(portals))
        for (const r of portals as PortalRecord[])
          if (r.realm === 'surface') {
            r.min[1] += lift;
            r.max[1] += lift;
          }
      this.info.version = 2;
    }
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
    this.nightVision = sp.data?.nightVision === true;
    this.hunger.load(sp.data?.hunger);
    this.xp.load(sp.data?.xp);
    this.effects.load(sp.data?.effects);
    if (typeof sp.data?.enchSeed === 'number') this.enchSeed = sp.data.enchSeed | 0;
    const ab = sp.data?.absorption;
    if (typeof ab === 'number' && this.effects.has('absorption')) this.vitals.absorption = Math.max(0, Math.min(20, ab));
    const bed = sp.data?.bed;
    if (Array.isArray(bed) && bed.length === 4 && bed.every((v) => Number.isInteger(v))) this.bed = bed as [number, number, number, number];
    const wd = st.data ?? {};
    if (Array.isArray(wd.portals)) this.portals = wd.portals as PortalRecord[];
    this.voidBoss.load(wd.voidSovereign);
    if (Array.isArray(wd.graves)) this.graves = (wd.graves as Game['graves']).filter((g) => typeof g.realm === 'string' && Array.isArray(g.pos) && g.pos.length === 4).slice(-MAX_GRAVES);
    if (wd.arrival && typeof wd.arrival === 'object') {
      this.arrival = wd.arrival as Arrival;
      delete wd.arrival;
    }
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
    const away = dead && this.world.realm.name !== 'surface';
    return {
      realm: away ? 'surface' : this.world.realm.name,
      data: away ? { portals: this.portals, graves: this.graves, voidSovereign: this.voidBoss.save(), arrival: { kind: 'respawn' } } : { portals: this.portals, graves: this.graves, voidSovereign: this.voidBoss.save() },
      player: {
        pos: dead ? (away ? this.surfaceRespawnPoint() : this.respawnPoint()) : Array.from(p.pos),
        F: Array.from(p.cam.F),
        R: Array.from(p.cam.R),
        H: Array.from(p.cam.H),
        pitch: p.cam.pitch,
        mode: dead && this.info.hardcore ? 'spectator' : p.mode,
        flying: p.flying,
        data: {
          inventory: this.inv.save(),
          vitals: dead ? { health: MAX_HEALTH, air: MAX_AIR } : this.vitals.save(),
          bed: this.bed,
          nightVision: this.nightVision,
          hunger: dead ? { food: MAX_FOOD, sat: 5, exh: 0 } : this.hunger.save(),
          xp: dead && !this.info.keepInventory ? 0 : this.xp.save(),
          effects: dead ? [] : this.effects.save(),
          absorption: dead ? 0 : this.vitals.absorption,
          enchSeed: this.enchSeed,
        },
      },
      ticks: this.env.ticks,
      weather: this.env.weather,
      weatherLeft: this.env.weatherLeft,
      hotbarIndex: this.hotbarIndex,
    };
  }

  /** Save dirty columns and the world metadata. */
  async saveAll(force = false): Promise<void> {
    const ps = this.persistence;
    if (!ps || this.demo) return;
    // Mid-trip the destination state is already saved: do not overwrite it on unload.
    if (this.traveling && !force) return;
    this.snapshotMobs();
    ps.saveDirty(this.world);
    ps.info.state = this.snapshot();
    await ps.saveMeta();
    await ps.flush();
  }

  /** Night vision is on and allowed (creative and spectator). */
  get nightVisionOn(): boolean {
    return this.nightVision && (this.player.mode === 'creative' || this.player.mode === 'spectator');
  }

  /** N / the touch button: night vision on or off (creative and spectator only). */
  toggleNightVision(): void {
    const m = this.player.mode;
    if (m !== 'creative' && m !== 'spectator') {
      this.message?.('Night vision is for creative and spectator mode');
      return;
    }
    this.nightVision = !this.nightVision;
    this.message?.(this.nightVision ? 'Night vision ON (N)' : 'Night vision OFF');
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
    this.movementModifiers();
    this.glideControl(dt);
    p.update(this.world, this.move, dt);
    this.glideAftermath();
    if (this.phaseStepCd > 0) this.phaseStepCd -= dt;
    if (p.hanging) this.ropeWear();
    if (this.anchorCd > 0) this.anchorCd -= dt;
    this.updateLens(dt);
    this.updateFishing(dt);
    if (!this.demo) this.updateVitals(dt);
    this.items.update(dt, this.world, p.up, this.world.realm.gravity, this.loaded && p.mode !== 'spectator' && !this.vitals.dead ? p.pos : null, p.height, this.collect);
    this.orbs.update(dt, this.world, p.up, this.loaded && p.mode !== 'spectator' && !this.vitals.dead ? p.pos : null, p.height, this.collectXp);
    if (this.loaded && !this.demo) {
      p.eye(this.eyePos);
      this.mobs.update(dt, this.mobHost, this.biomeFn, this.caveFn);
      this.projectiles.update(dt, this.world, this.mobs, this.projHost);
      this.bosses.update(dt);
      if (this.world.realm.name === 'void') this.voidBoss.update(dt);
      this.villageTimer -= dt;
      if (this.villageTimer <= 0) {
        this.villageTimer = 1;
        this.villageTick();
      }
      this.updateAtlas();
      if (!this.traveling) {
        this.updatePortal(dt);
        this.updateVoidGate(dt);
        this.updateGateways(dt);
      }
      this.burnEffects(dt);
      this.enchantTick(dt);
    }

    // Fixed-rate world ticks.
    this.tickAcc += dt;
    let ticks = 0;
    while (this.tickAcc >= 0.05 && ticks < 5) {
      this.tickAcc -= 0.05;
      this.env.tick();
      this.fluids.tick();
      this.fire.tick();
      this.blockEntities.tick(0.05);
      this.farming.tick();
      this.tickTnt(0.05);
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
    this.params.selectOn = this.hasTarget && !this.targetMob && this.targetShift === 0;
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
    const tanY = Math.tan(this.params.fovY / 2);
    this.params.entityCount = this.mobs.pack(this.eyePos, p.cam, this.params.maxDist, org, tanY * (this.canvas.width / Math.max(1, this.canvas.height)), tanY);
    this.params.entityData = this.mobs.gpuData;

    // Environment + screen effects.
    const ex = Math.floor(this.eyePos[0]!), ez = Math.floor(this.eyePos[2]!), ew = Math.floor(this.eyePos[3]!);
    // Enclosed realms (the Ember Depths) have 3D biomes: the one around you, at your height.
    const bi = this.env.enclosed && this.generator.caveBiomeAt ? this.generator.caveBiomeAt(ex, Math.floor(this.eyePos[1]!), ez, ew) : this.world.biomeAt(ex, ez, ew);
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
    this.orbs.draw(this.renderer.sprites, this.eyePos, p.cam);
    this.projectiles.draw(this.renderer.sprites, this.eyePos, p.cam, this.items.iconU, this.items.iconV);
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = 0.2;
      this.scanHazards();
      this.scanThreats();
    }
    const pr = this.params;
    pr.underwater += ((p.eyeInWater ? 1 : 0) - pr.underwater) * Math.min(1, dt * 8);
    pr.xray = p.mode === 'spectator';
    // Torches and other lights carried in either hand light the area around you.
    let hl = 0;
    for (const st of [this.held, this.inv.get(OFFHAND)]) {
      if (!st) continue;
      const b = IREG.itemBlock[st.id]!;
      if (b >= 0) hl = Math.max(hl, REG.emission[b]!);
    }
    pr.handLight += (Math.max(0, hl - 1) - pr.handLight) * Math.min(1, dt * 8);
    // Night vision: the creative toggle, or the effect (fading out over its last 10 s).
    const nvEff = this.effects.map.get('night_vision');
    const nvGoal = this.nightVisionOn ? 1 : nvEff ? Math.min(1, nvEff.time / 10) : 0;
    pr.nightVision += (nvGoal - pr.nightVision) * Math.min(1, dt * 6);
    if (Math.abs(pr.nightVision - nvGoal) < 0.002) pr.nightVision = nvGoal;
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
      if (this.arrival) {
        // Arriving: wait for the columns around (an arrival portal can straddle borders).
        this.arrivalWait++;
        // (Columns far kata/ana are not streamed at small render distances: once nothing more
        // is coming, go ahead.)
        if (!this.neighboursLoaded(cx, cz, cw) && this.streamer.pendingCount > 0 && this.arrivalWait < 900) return;
        if (!this.arrive()) return; // moved to a portal farther away: wait for its columns
      }
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
    if (input.pressed('nightVision')) this.toggleNightVision();
    if (input.pressed('swapHands')) this.swapHands();

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
    const whip = heldNow ? IREG.def(heldNow.id).weapon?.area : undefined;
    if (whip && mode !== 'spectator') {
      // 4D Whip: a swing hits everything in a small hypersphere ahead (no mining with it).
      this.resetMining();
      if (input.buttonPressed(0) || (input.buttonHeld(0) && this.sinceSwing >= attackCooldown(heldId))) this.whipSwing(whip);
    } else if (this.targetMob && mode !== 'spectator') {
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
    const heldUse = heldNow ? IREG.def(heldNow.id).use : undefined;
    this.roping = 0;
    if (!input.buttonHeld(2)) this.crossbowLatch = false;
    // What hold-use acts on: the main hand, or the off hand when the main hand has nothing to do.
    const off = this.inv.get(OFFHAND);
    const mainIdle = this.mainIdle(heldNow);
    const eatSlot = heldNow !== null && this.consumable(heldNow) ? this.hotbarIndex : mainIdle && off && this.consumable(off) ? OFFHAND : -1;
    const consumable = eatSlot >= 0 && mode !== 'spectator' && !this.stationTargeted() && !(this.targetMob && this.targetMob.def.profession);
    const shield = mode !== 'spectator' && !this.stationTargeted() && ((heldNow && IREG.def(heldNow.id).use === 'shield') || (mainIdle && off && IREG.def(off.id).use === 'shield'));
    if (consumable) {
      // Eating and drinking: hold the use button.
      this.bowDraw = 0;
      this.blocking = false;
      if (input.buttonHeld(2)) this.useStep(dt, this.inv.get(eatSlot)!, eatSlot);
      else this.using = null;
    } else if (shield) {
      // Shields: hold the use button to block (up after a quarter second). A click on a mob
      // still trades, shears, leads...
      this.using = null;
      this.bowDraw = 0;
      if (input.buttonPressed(2) && this.targetMob && this.useOnMob(this.targetMob)) this.shieldUp = -1e9;
      this.shieldUp = input.buttonHeld(2) ? this.shieldUp + dt : 0;
      this.blocking = this.shieldUp >= 0.25;
    } else if (heldUse === 'crossbow' && mode !== 'spectator' && !this.stationTargeted()) {
      // Crossbow: hold to load (one arrow), use again to shoot.
      this.using = null;
      this.blocking = false;
      if (heldNow!.tag?.ammo) {
        this.bowDraw = 0;
        if (input.buttonPressed(2) && !this.crossbowLatch) this.fireCrossbow();
      } else if (input.buttonHeld(2) && !this.crossbowLatch) {
        this.bowDraw += dt;
        if (this.bowDraw >= THROWN.bolt.load) {
          this.bowDraw = 0;
          this.crossbowLatch = true;
          this.loadCrossbow();
        }
      } else this.bowDraw = 0;
    } else if (heldUse === 'hyper_rope' && mode !== 'spectator') {
      // Hyper Rope: hold to climb ana (sneak: kata) along the hidden axis.
      this.using = null;
      this.blocking = false;
      this.bowDraw = 0;
      if (input.buttonHeld(2)) this.roping = input.held('sneak') ? -1 : 1;
    } else if (bow && mode !== 'spectator' && !this.stationTargeted()) {
      this.using = null;
      this.blocking = false;
      // Bow: hold to draw, release to shoot.
      if (input.buttonHeld(2)) this.bowDraw += dt;
      else if (this.bowDraw > 0) {
        this.releaseBow();
        this.bowDraw = 0;
      }
    } else {
      this.bowDraw = 0;
      this.using = null;
      this.blocking = false;
      this.shieldUp = 0;
      if (mode !== 'spectator' && input.buttonPressed(2) && this.targetMob && this.useOnMob(this.targetMob)) {
        // Right click on a mob: trade, feed, shear, milk, lead, name.
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
    const reachB = p.mode === 'survival' ? 5 : 7;
    this.hasTarget = p.frozen ? false : raycast(this.world, this.eyePos, dir, reachB, this.target);
    this.targetShift = 0;
    // Reach Through: with nothing in reach in your slice, look 1..level slices kata and ana.
    if (!this.hasTarget && !p.frozen && p.mode !== 'spectator') {
      const rt = enchLevel(this.held, 'reach_through');
      if (rt > 0) {
        const H = p.cam.H, o = this.tmp4, hit = this.reachHit;
        for (let k = 1; k <= rt && !this.hasTarget; k++)
          for (const sgn of [1, -1]) {
            for (let i = 0; i < 4; i++) o[i] = this.eyePos[i]! + H[i]! * k * sgn;
            if (!raycast(this.world, o, dir, reachB, hit)) continue;
            if (this.hasTarget && hit.t >= this.target.t) continue;
            const t = this.target;
            t.x = hit.x;
            t.y = hit.y;
            t.z = hit.z;
            t.w = hit.w;
            t.axis = hit.axis;
            t.sign = hit.sign;
            t.t = hit.t;
            t.voxel = hit.voxel;
            t.p.set(hit.p);
            t.bmin.set(hit.bmin);
            t.bmax.set(hit.bmax);
            this.hasTarget = true;
            this.targetShift = k * sgn;
          }
      }
    }
    this.targetMob = null;
    this.phaseTarget = null;
    this.reachTarget = null;
    if (!p.frozen && p.mode !== 'spectator' && this.mobs.list.length > 0) {
      const wd = this.held ? IREG.def(this.held.id).weapon : undefined;
      const reach = wd?.reach ? wd.reach + (p.mode === 'creative' ? 1.5 : 0) : REACH_ATTACK[p.mode === 'creative' ? 1 : 0]!;
      const limit = this.hasTarget ? Math.min(reach, this.target.t + 0.3) : reach;
      if (this.mobs.pick(this.eyePos, dir, limit, this.pickOut) < limit) this.targetMob = this.pickOut.mob;
      else if (this.mobs.pickAssist(this.eyePos, dir, limit, this.touchMode ? 0.45 : 0.12, p.cam.H, this.pickOut) < limit) this.targetMob = this.pickOut.mob;
      // Spears reach kata and ana of the slice too (a body within `hiddenReach` of it).
      if (!this.targetMob && wd?.hiddenReach && this.mobs.pickProjected(this.eyePos, dir, limit, p.cam.H, wd.hiddenReach + 1, this.pickOut) < limit) {
        this.targetMob = this.pickOut.mob;
        this.reachTarget = this.pickOut.mob;
      }
      // Phase Strike: a mob kata or ana of your slice whose shadow is under the crosshair.
      if (!this.targetMob && this.phaseCd <= 0) {
        const ps = enchLevel(this.held, 'phase_strike');
        if (ps > 0 && this.mobs.pickProjected(this.eyePos, dir, limit, p.cam.H, 2 + 2 * ps, this.pickOut) < limit) {
          this.targetMob = this.pickOut.mob;
          this.phaseTarget = this.pickOut.mob;
        }
      }
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
      if (!this.useOnMob(this.targetMob)) this.attack(this.targetMob);
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
    // Animals live where the land is: some columns arrive with a herd.
    if (this.world.realm.name === 'surface' && this.world.realm.dayCycle) this.mobs.herdIn(c.cx, c.cz, c.cw, this.seed, this.biomeFn);
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
        if (m.def.hostile) {
          // Guards and bosses from structures; bosses remember their arena.
          if (m.def.boss) m.home = Float64Array.from([n.x, n.y, n.z, n.w]);
          continue;
        }
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
      if (!m.persistent) continue;
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
      if (!m.persistent) continue;
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

  /**
   * Right click on a mob (Phase 7 husbandry): trade with villagers; feed animals their food
   * (love mode, babies grow faster), shear sheep, milk cows, put on or take off a lead, name
   * it with a name tag. Returns true if the click was used.
   */
  useOnMob(m: Mob): boolean {
    if (this.talkTo(m)) return true;
    if (m.def.hostile || this.player.mode === 'spectator') return false;
    const held = this.held;
    const name = held ? IREG.name(held.id) : '';
    const survival = this.player.mode === 'survival';
    const use1 = () => {
      if (!held || !survival) return;
      held.count--;
      this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
    };
    const at = (k = 0.5): [number, number, number, number] => [m.pos[0]!, m.pos[1]! + m.height * k, m.pos[2]!, m.pos[3]!];
    if (m.leash) {
      // Take the lead off (it drops back to you).
      m.leash = null;
      if (survival) this.dropInSlice(...at(), { id: IREG.id('lead'), count: 1, damage: 0 });
      return true;
    }
    if (name === 'lead') {
      m.leash = 'player';
      m.kept = true;
      use1();
      return true;
    }
    if (name === 'name_tag' && held?.tag?.name) {
      m.customName = held.tag.name;
      m.kept = true;
      use1();
      this.message?.(`Named it ${m.customName}`);
      return true;
    }
    if (name === 'shears' && m.def.name === 'kata_sheep' && !m.sheared && m.baby === 0) {
      this.mobs.shear(m, true);
      this.dropInSlice(...at(0.7), { id: IREG.id('wool'), count: 1 + Math.floor(Math.random() * 3), damage: 0 });
      this.wearHeld(1);
      return true;
    }
    if (name === 'bucket' && (m.def.name === 'ana_cow' || m.def.name === 'crag_goat') && m.baby === 0) {
      const milk: ItemStack = { id: IREG.id('milk_bucket'), count: 1, damage: 0 };
      if (!survival) return true;
      if (held!.count === 1) this.inv.set(this.hotbarIndex, milk);
      else {
        use1();
        if (this.inv.add(milk) > 0) this.throwStack(milk);
      }
      return true;
    }
    if (held && m.def.breed?.includes(name)) {
      if (m.baby > 0) m.baby *= 0.9; // babies grow up faster
      else if (m.breedCd <= 0 && m.love <= 0) m.love = LOVE_TIME;
      else return false;
      m.health = Math.min(m.def.health * Math.max(0.5, m.scale), m.health + 2);
      use1();
      for (let k = 0; k < 4; k++) this.particles.burst(m.pos[0]!, m.pos[1]! + m.height, m.pos[2]!, m.pos[3]!, this.player.cam, 'spark', '#ff5a8a', 2, 0.8, 0.4, true);
      return true;
    }
    return false;
  }

  /** Tie every animal on your lead to the fence post at (x, y, z, w). */
  private tieToFence(x: number, y: number, z: number, w: number): boolean {
    let n = 0;
    for (const m of this.mobs.list) {
      if (m.leash !== 'player') continue;
      m.leash = [x, y, z, w];
      n++;
    }
    return n > 0;
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
    if (o.tag) res.tag = JSON.parse(JSON.stringify(o.tag));
    const left = this.inv.add(res);
    if (left > 0) this.throwStack(withCount(res, left));
    const up = recordTrade(v.data, o);
    const m = v.mob;
    this.particles.burst(m.pos[0]!, m.pos[1]! + m.height + 0.2, m.pos[2]!, m.pos[3]!, this.player.cam, 'spark', '#6aff8a', 8, 1.2, 0.3, true);
    // Trading teaches you something too (Minecraft: 3-6 experience per trade).
    this.orbs.spawn(m.pos[0]!, m.pos[1]! + 1, m.pos[2]!, m.pos[3]!, 3 + Math.floor(Math.random() * 4));
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
    if (this.world.realm.bedsExplode) {
      // Like the Nether: beds blow up here.
      const bv = this.world.getBlock(x, y, z, w);
      this.world.setBlock(x, y, z, w, 0);
      this.removePartner(x, y, z, w, bv);
      this.explode(x + 0.5, y + 0.5, z + 0.5, w + 0.5, 3.5);
      say('The bed explodes! Beds don’t work in this realm');
      return false;
    }
    if (!this.world.realm.dayCycle) {
      say('You can’t sleep here: this realm has no nights');
      return false;
    }
    // Either half works; the respawn point is the foot.
    const v = this.world.getBlock(x, y, z, w);
    if (BED_IDS[voxelId(v)] === 2 && v !== VOID_VOXEL) {
      const f = this.bedPartner(x, y, z, w, v);
      if (f) [x, y, z, w] = f;
    }
    const b = this.bed;
    const moved = !b || b[0] !== x || b[1] !== y || b[2] !== z || b[3] !== w;
    this.bed = [x, y, z, w];
    if (!this.isSleepTime()) {
      say(moved ? 'Respawn point set · you can only sleep at night or in a thunderstorm' : 'You can only sleep at night or in a thunderstorm');
      return false;
    }
    const blocked = this.sleepBlockedBy(x + 0.5, y + 0.5, z + 0.5, w + 0.5);
    if (blocked) {
      say(blocked);
      return false;
    }
    this.sleeping = { t: 0, skipped: false };
    this.resetMining();
    this.bowDraw = 0;
    if (moved) say('Respawn point set');
    return true;
  }

  private isSleepTime(): boolean {
    const tod = this.env.timeOfDay;
    const storm = this.env.weather === 'thunder' || this.env.weather === 'phase_storm';
    return (tod >= SLEEP_FROM && tod <= SLEEP_UNTIL) || storm;
  }

  /** A hostile mob close to a place to rest (Minecraft's rule: 8 blocks around, 5 up and down), as a message. */
  private sleepBlockedBy(cx: number, cy: number, cz: number, cw: number): string | null {
    const p = this.player;
    if (p.mode !== 'survival' && p.mode !== 'adventure') return null;
    for (const m of this.mobs.list) {
      if (!m.def.hostile) continue;
      const dx = m.pos[0]! - cx, dz = m.pos[2]! - cz, dw = m.pos[3]! - cw;
      if (dx * dx + dz * dz + dw * dw > 64 || Math.abs(m.pos[1]! - cy) > 5) continue;
      let dh = 0;
      for (let k = 0; k < 4; k++) dh += (m.pos[k]! - this.eyePos[k]!) * p.cam.H[k]!;
      const where = Math.abs(dh) < 0.5 ? 'in your slice' : `${Math.round(Math.abs(dh))} m ${dh > 0 ? 'ana' : 'kata'} of your slice`;
      return `You may not rest now: a ${m.def.displayName} is nearby (${where})`;
    }
    return null;
  }

  /** Sleeping bag: sleep right here through the night (it does not set your respawn point). */
  private useSleepingBag(held: ItemStack): void {
    if (this.world.realm.bedsExplode) {
      this.message?.('You cannot sleep in this realm');
      return;
    }
    if (!this.world.realm.dayCycle) {
      this.message?.('You can’t sleep here: this realm has no nights');
      return;
    }
    if (!this.isSleepTime()) {
      this.message?.('You can only sleep at night or in a thunderstorm');
      return;
    }
    const p = this.player.pos;
    const blocked = this.sleepBlockedBy(p[0]!, p[1]!, p[2]!, p[3]!);
    if (blocked) {
      this.message?.(blocked);
      return;
    }
    this.sleeping = { t: 0, skipped: false };
    this.resetMining();
    this.bowDraw = 0;
    this.message?.('You curl up in the sleeping bag');
    if (this.player.mode === 'survival') this.wearHeld(1);
    void held;
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

  // ------------------------------------------------------------------ the Void Gate

  /**
   * Void Eye: used on a gate frame it takes the frame's place (and lights the gate cell once all
   * six frames hold one). Held anywhere it points at the nearest Stronghold (the atlas readout).
   */
  private useVoidEye(held: ItemStack): void {
    if (!this.hasTarget) return;
    const t = this.target;
    if (voxelId(t.voxel) !== GATE.frame) return;
    const survival = this.player.mode === 'survival';
    const lit = fillFrame(this.world, t.x, t.y, t.z, t.w);
    if (!lit) return;
    if (survival) {
      held.count--;
      this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
    }
    this.particles.burst(t.x + 0.5, t.y + 0.9, t.z + 0.5, t.w + 0.5, this.player.cam, 'spark', '#9affc8', 8, 1.4, 0.5, true);
    if (lit.length === 0) {
      // Say how the gate stands: the cell is the empty one next to the frame.
      const around = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
      for (const d of around) {
        const c = [t.x + d[0]!, t.y, t.z + d[2]!, t.w + d[3]!];
        if (this.world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) !== 0) continue;
        const pr = gateProgress(this.world, c[0]!, c[1]!, c[2]!, c[3]!);
        this.message?.(`The eye settles into the frame · ${pr.eyes} of 6 filled`);
        return;
      }
      this.message?.('The eye settles into the frame');
      return;
    }
    const c = lit[0]!;
    this.particles.burst(c[0] + 0.5, c[1] + 0.8, c[2] + 0.5, c[3] + 0.5, this.player.cam, 'spark', '#6affc0', 40, 3, 1, true);
    this.message?.('The Void Gate opens · step into it');
  }

  /** The id of a block the body overlaps (feet or head cell), with that cell, else null. */
  private bodyCell(id: number): number[] | null {
    const p = this.player.pos;
    for (const dy of [0.2, 1.4]) {
      const c = [Math.floor(p[0]!), Math.floor(p[1]! + dy), Math.floor(p[2]!), Math.floor(p[3]!)];
      if ((this.world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === id) return c;
    }
    return null;
  }

  /** Standing in a lit gate: the view swirls, then you travel (to the Void, or home from it). */
  private updateVoidGate(dt: number): void {
    if (this.vitals.dead || !this.bodyCell(GATE.gate)) {
      this.gateTime = Math.max(0, this.gateTime - dt * 2);
      return;
    }
    this.gateTime += dt;
    const fast = this.player.mode === 'creative' || this.player.mode === 'spectator';
    const need = fast ? 0.3 : 1.5;
    this.portalTime = Math.max(this.portalTime, Math.min(1, this.gateTime / need) * (fast ? 1 : 4));
    if (this.gateTime < need) return;
    this.gateTime = 0;
    const realm = this.world.realm.name;
    if (realm === 'surface') this.beginTravel('void', ARRIVAL_POS, { kind: 'void' });
    else if (realm === 'void') this.beginTravel('surface', this.surfaceRespawnPoint(), { kind: 'respawn' });
    else this.message?.('The gate is dormant here: it leads between the Surface and the Void');
  }

  /** Gateway Spires: standing in a beam sends you to the beam's twin (the same realm, 1024 blocks away). */
  private updateGateways(dt: number): void {
    if (this.gatewayCd > 0) this.gatewayCd -= dt;
    if (this.world.realm.name !== 'void' || this.gatewayCd > 0 || this.vitals.dead) return;
    const c = this.bodyCell(GATE.beam);
    if (!c) return;
    const hit = gatewayAt(c[0]!, c[1]!, c[2]!, c[3]!);
    if (!hit) return;
    this.gatewayCd = 3;
    this.message?.(hit.kind === 'out' ? 'The beam carries you out across the dark…' : 'The beam carries you home to the central island');
    this.teleportTo(hit.to[0], hit.to[1], hit.to[2], hit.to[3]);
  }

  /** Move the player to a (possibly far) point and wait for the columns there to stream in. */
  teleportTo(x: number, y: number, z: number, w: number): void {
    this.player.setPosition(x, y, z, w);
    this.player.vel.fill(0);
    this.loaded = false;
    this.player.frozen = true;
    this.streamer.invalidate();
  }

  // ------------------------------------------------------------------ Phase Wings

  /** The wings in your chest slot, with some wear left, or null. */
  private wings(): ItemStack | null {
    const s = this.armorPiece(1);
    return s && IREG.name(s.id) === 'phase_wings' ? s : null;
  }
  private jumpWas = false;
  private glideWear = 0;
  /** Seconds until the Phase Step set bonus can phase another hit away. */
  phaseStepCd = 0;

  /**
   * Phase Wings: in the air, falling, press jump to glide. Your 4D view direction is the heading,
   * so rotating the slice mid-flight banks you through W. Landing, water, a ladder, or no wings
   * ends it; the wings wear one point a second.
   */
  private glideControl(dt: number): void {
    const p = this.player;
    const pressed = this.move.jump && !this.jumpWas;
    this.jumpWas = this.move.jump;
    const wings = this.wings();
    const grounded = p.onGround || p.inWater || p.inLava || p.flying || p.hanging || p.onClimbable || p.mode === 'spectator' || this.vitals.dead;
    if (p.gliding) {
      if (!wings || grounded) {
        p.gliding = false;
        p.rocket = 0;
        return;
      }
      this.glideWear += dt;
      if (this.glideWear >= 1) {
        this.glideWear -= 1;
        if (p.mode !== 'creative') this.wearArmorPiece(1, 1);
      }
      return;
    }
    this.glideWear = 0;
    if (pressed && wings && !grounded && this.loaded && p.vel[p.up]! < -1.5) {
      p.gliding = true;
      this.message?.('Gliding · look to steer, rotate your slice to bank through W');
    }
  }

  /** Hit points lost striking a wall or the ground at speed while gliding. */
  private glideAftermath(): void {
    const p = this.player;
    if (p.glideImpact <= 0) return;
    const dmg = p.glideImpact;
    p.glideImpact = 0;
    this.hurtPlayer(dmg, null, 'Kinetic energy', 'fall');
  }

  /**
   * Whisper Fruit: like a chorus fruit, you step through the dark to a nearby safe spot within
   * 8 blocks, kata and ana included.
   */
  private whisperTeleport(): void {
    const p = this.player, up = p.up;
    const solid = (x: number, y: number, z: number, w: number) => {
      const v = this.world.getBlock(x, y, z, w);
      return v === VOID_VOXEL || REG.collision[v & 0xfff] !== COLLISION_NONE;
    };
    for (let k = 0; k < 24; k++) {
      const x = Math.floor(p.pos[0]! + (Math.random() * 2 - 1) * 8), z = Math.floor(p.pos[2]! + (Math.random() * 2 - 1) * 8), w = Math.floor(p.pos[3]! + (Math.random() * 2 - 1) * 8);
      const y0 = Math.floor(p.pos[up]!) + Math.floor(Math.random() * 9) - 4;
      for (let dy = 0; dy < 8; dy++) {
        const y = y0 - dy;
        if (y < 1 || solid(x, y, z, w) || solid(x, y + 1, z, w) || !solid(x, y - 1, z, w)) continue;
        const e = this.eyePos;
        this.particles.burst(e[0]!, e[1]!, e[2]!, e[3]!, p.cam, 'spark', '#c87aff', 14, 2, 0.5, true);
        p.setPosition(x + 0.5, y, z + 0.5, w + 0.5);
        this.particles.burst(x + 0.5, y + 1, z + 0.5, w + 0.5, p.cam, 'spark', '#c87aff', 14, 2, 0.5, true);
        return;
      }
    }
    this.message?.('The fruit fizzles: nowhere safe to step');
  }

  // ------------------------------------------------------------------ portals & realm travel

  private isPortalFrame(v: number): boolean {
    return v !== VOID_VOXEL && PORTAL_FRAME[voxelId(v)] === 1;
  }

  /**
   * Flint and steel / fire charge on a block: light a portal frame there, or start a fire in
   * the cell in front of the clicked face.
   */
  ignite(): boolean {
    if (!this.hasTarget) return false;
    const t = this.target;
    if (this.primeTnt(t.x, t.y, t.z, t.w)) return true;
    const c = [t.x, t.y, t.z, t.w];
    c[t.axis] = c[t.axis]! + t.sign;
    if (this.lightPortal(c[0]!, c[1]!, c[2]!, c[3]!)) return true;
    return this.startFire(c[0]!, c[1]!, c[2]!, c[3]!);
  }

  /** Light the TNT at a cell (if there is some): it blows after `fuse` seconds. */
  primeTnt(x: number, y: number, z: number, w: number, fuse = 4): boolean {
    if ((this.world.getBlock(x, y, z, w) & 0xfff) !== this.tntId) return false;
    this.world.setBlock(x, y, z, w, this.tntLitId);
    this.tnt.set(`${x},${y},${z},${w}`, { x, y, z, w, fuse });
    return true;
  }

  /** The stack named `name` in either hand, or null. */
  private handStack(name: string): ItemStack | null {
    for (const s of [this.held, this.inv.get(OFFHAND)]) if (s && IREG.name(s.id) === name) return s;
    return null;
  }

  private holding(name: string): boolean {
    return this.handStack(name) !== null;
  }

  /**
   * Phase Lens: walls in the slices next to yours (a step ana or kata along the hidden axis)
   * where your own slice is open, nearest first: what you would walk into. Five times a second.
   */
  /** Fishing: cast the line at water, wait for the bite, reel in to catch something. */
  private castOrReel(held: ItemStack): void {
    const f = this.fishing;
    if (f) {
      if (f.bite > 0) this.catchFish(held);
      else this.message?.('You reel in the line');
      this.fishing = null;
      return;
    }
    const hit = this.fluidHit;
    if (!raycast(this.world, this.eyePos, this.pickDir, 22, hit, true) || REG.fluid[voxelId(hit.voxel)] !== FLUID_WATER) {
      this.message?.('Cast at water to fish');
      return;
    }
    // The bobber floats at the surface: find the top water cell of the column hit.
    let y = hit.y;
    const up = this.player.up;
    const c: [number, number, number, number] = [hit.x, hit.y, hit.z, hit.w];
    for (let k = 0; k < 8; k++) {
      c[up] = y + 1;
      if (REG.fluid[voxelId(this.world.getBlock(c[0], c[1], c[2], c[3]))] !== FLUID_WATER) break;
      y++;
    }
    c[up] = y;
    const rain = this.env.weather === 'rain' || this.env.weather === 'thunder';
    this.fishing = { pos: c, t: 0, biteAt: (5 + Math.random() * 20) * (rain ? 0.6 : 1), bite: 0 };
    this.message?.('Line cast: wait for a bite');
  }

  private updateFishing(dt: number): void {
    const f = this.fishing;
    if (!f) return;
    const held = this.held;
    const e = this.eyePos;
    const far = Math.hypot(f.pos[0] + 0.5 - e[0]!, f.pos[1] + 0.5 - e[1]!, f.pos[2] + 0.5 - e[2]!, f.pos[3] + 0.5 - e[3]!) > 32;
    if (!held || IREG.def(held.id).use !== 'fishing' || far || REG.fluid[voxelId(this.world.getBlock(f.pos[0], f.pos[1], f.pos[2], f.pos[3]))] !== FLUID_WATER) {
      this.fishing = null;
      return;
    }
    f.t += dt;
    if (f.bite > 0) {
      f.bite -= dt;
      if (f.bite <= 0) {
        this.message?.('It got away');
        f.t = 0;
        f.biteAt = 5 + Math.random() * 15;
      }
    } else if (f.t >= f.biteAt) {
      f.bite = 1.2;
      this.message?.('A bite! Use the rod to reel in');
      this.particles.burst(f.pos[0] + 0.5, f.pos[1] + 0.95, f.pos[2] + 0.5, f.pos[3] + 0.5, this.player.cam, 'poof', '#cfe8ff', 10, 1.4, 0.3);
    }
  }

  private catchFish(held: ItemStack): void {
    const got = LOOT.roll('fishing', Math.random, 1).find((s) => s !== null);
    if (!got) return;
    const st: ItemStack = { id: IREG.id(got[0]), count: got[1], damage: got[2] ?? 0, ...(got[3] ? { tag: got[3] } : {}) };
    const p = this.player.pos;
    if (this.inv.add(st) > 0) this.throwStack(st);
    this.orbs.spawn(p[0]!, p[1]! + 0.9, p[2]!, p[3]!, 1 + Math.floor(Math.random() * 3));
    this.message?.(`You caught ${IREG.displayName(st.id)}`);
    this.hunger.exhaust(0.02);
    if (this.player.mode === 'survival') this.wearHeld(1);
    void held;
  }

  private updateLens(dt: number): void {
    this.lensTimer -= dt;
    if (this.lensTimer > 0) return;
    this.lensTimer = 0.2;
    const out = this.lensCells;
    out.length = 0;
    const lensOn = this.player.mode !== 'spectator' && (this.wearing('phase_lens') || this.holding('phase_lens') || this.effects.has('phase_sight'));
    if (!lensOn) return;
    const e = this.eyePos, cam = this.player.cam, H = cam.H, R = cam.R, F = cam.F, up = this.player.up;
    const cand: number[] = [];
    const seen = new Set<string>();
    const solid = (v: number) => v !== VOID_VOXEL && REG.opaque[v & 0xfff] === 1;
    for (let a = -5; a <= 5; a++)
      for (let b = -3; b <= 4; b++)
        for (let c = -5; c <= 5; c++) {
          const p = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) p[k] = e[k]! + R[k]! * a + F[k]! * c + (k === up ? b : 0);
          if (solid(this.world.getBlock(Math.floor(p[0]!), Math.floor(p[1]!), Math.floor(p[2]!), Math.floor(p[3]!)))) continue;
          for (const side of [1, -1]) {
            const q = [0, 0, 0, 0].map((_, k) => Math.floor(p[k]! + H[k]! * side));
            if (!solid(this.world.getBlock(q[0]!, q[1]!, q[2]!, q[3]!))) continue;
            const key = q.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            cand.push(a * a + b * b + c * c, q[0]!, q[1]!, q[2]!, q[3]!, side);
          }
        }
    const idx = Array.from({ length: cand.length / 6 }, (_, i) => i).sort((x, y) => cand[x * 6]! - cand[y * 6]!);
    for (const i of idx.slice(0, 140)) out.push(cand[i * 6 + 1]!, cand[i * 6 + 2]!, cand[i * 6 + 3]!, cand[i * 6 + 4]!, cand[i * 6 + 5]!);
  }

  /** 4D Whip: everything within the whip's 4D radius of a point ahead is hit, kata and ana too. */
  private whipSwing(radius: number): void {
    const p = this.player, held = this.held!;
    const cd = attackCooldown(held.id);
    let dmg = attackDamage(held.id) * swingStrength(this.sinceSwing, cd);
    const sharp = enchLevel(held, 'sharpness');
    if (sharp > 0) dmg += 0.5 * sharp + 0.5;
    const str = this.effects.amp('strength');
    if (str >= 0) dmg += 3 * (str + 1);
    this.sinceSwing = 0;
    this.hunger.exhaust(0.1);
    const e = this.eyePos, F = p.cam.F;
    const c = this.tmp4;
    for (let k = 0; k < 4; k++) c[k] = e[k]! + F[k]! * radius * 0.9;
    let n = 0;
    for (const m of this.mobs.list) {
      if (m.def.profession) continue;
      const d = Math.hypot(m.pos[0]! - c[0]!, m.pos[1]! + m.height * 0.5 - c[1]!, m.pos[2]! - c[2]!, m.pos[3]! - c[3]!);
      if (d > radius + m.width) continue;
      const smite = enchLevel(held, 'smite');
      this.mobs.damage(m, dmg + (smite > 0 && m.def.undead ? 2.5 * smite : 0), e, null, p.cam.H, true, 1 + enchLevel(held, 'knockback'));
      const fa = enchLevel(held, 'fire_aspect');
      if (fa > 0 && !m.def.fireproof) m.burning = Math.max(m.burning, 4 * fa);
      m.looting = enchLevel(held, 'looting');
      n++;
    }
    this.particles.burst(c[0]!, c[1]!, c[2]!, c[3]!, p.cam, 'spark', '#c86aff', 16, 3, radius * 0.6, true);
    if (n > 0) {
      this.mobs.noise(c);
      if (p.mode === 'survival') this.wearHeld(1);
    }
  }

  /** Throw a dagger (stackable, falls where it hits) or the Hyper-Chakram (comes back). */
  private throwWeapon(held: ItemStack, use: 'dagger' | 'chakram'): void {
    const p = this.player;
    const survival = p.mode === 'survival' || p.mode === 'adventure';
    if (use === 'chakram' && this.projectiles.list.some((a) => a.boomerang)) return; // one in the air
    const e = this.eyePos, f = p.cam.fwd;
    const from = this.tmp4, v = this.tmpMin;
    for (let k = 0; k < 4; k++) from[k] = e[k]! + f[k]! * 0.5;
    from[p.up] = from[p.up]! - 0.1;
    if (use === 'dagger') {
      for (let k = 0; k < 4; k++) v[k] = f[k]! * THROWN.dagger.speed;
      this.projectiles.spawn(from, v, THROWN.dagger.damage, held.id, true, { gravity: THROWN.dagger.gravity, stack: { id: held.id, count: 1, damage: 0 } });
      if (survival) {
        held.count--;
        this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      }
    } else {
      for (let k = 0; k < 4; k++) v[k] = f[k]! * THROWN.chakram.speed;
      const sharp = enchLevel(held, 'sharpness');
      const st = withCount(held, 1);
      if (survival) st.damage++;
      if (st.damage >= IREG.durability[st.id]!) {
        this.inv.set(this.hotbarIndex, null);
        this.message?.('The chakram shattered');
        return;
      }
      this.projectiles.spawn(from, v, THROWN.chakram.damage + (sharp > 0 ? 0.5 * sharp + 0.5 : 0), held.id, true, { gravity: 0, boomerang: { out: THROWN.chakram.out, hidden: THROWN.chakram.hidden }, stack: st });
      this.inv.set(this.hotbarIndex, null);
    }
    this.sinceSwing = 0;
  }

  /** Crossbow: take an arrow (off hand first, then hotbar, then the rest) and load it. */
  private loadCrossbow(): void {
    const p = this.player;
    const held = this.held;
    if (!held) return;
    const survival = p.mode === 'survival' || p.mode === 'adventure';
    let slot = -1;
    for (const i of [OFFHAND, ...Array.from({ length: 36 }, (_, k) => k)]) {
      const s = this.inv.get(i);
      if (s && IREG.tags[s.id]!.has('arrow')) {
        slot = i;
        break;
      }
    }
    if (slot < 0 && survival) {
      this.message?.('No arrows');
      return;
    }
    const ammo = slot >= 0 ? IREG.name(this.inv.get(slot)!.id) : 'arrow';
    if (survival) {
      const s = this.inv.get(slot)!;
      s.count--;
      this.inv.set(slot, s.count > 0 ? s : null);
    }
    held.tag = { ...(held.tag ?? {}), ammo };
    this.inv.set(this.hotbarIndex, held);
  }

  /** Shoot the loaded bolt: flat, fast and hard. */
  private fireCrossbow(): void {
    const p = this.player;
    const held = this.held!;
    const ammo = held.tag?.ammo ?? 'arrow';
    const kind = ARROWS[ammo] ?? ARROWS.arrow!;
    const e = this.eyePos, f = p.cam.fwd;
    const from = this.tmp4, v = this.tmpMin;
    for (let k = 0; k < 4; k++) {
      from[k] = e[k]! + f[k]! * 0.4;
      v[k] = f[k]! * THROWN.bolt.speed;
    }
    from[p.up] = from[p.up]! - 0.1;
    this.projectiles.spawn(from, v, THROWN.bolt.damage * kind.damage, IREG.id(ammo), true, { gravity: 10, undead: kind.undead, glow: kind.glow });
    const tag = { ...held.tag };
    delete tag.ammo;
    held.tag = Object.keys(tag).length ? tag : undefined;
    this.inv.set(this.hotbarIndex, held);
    if (p.mode === 'survival') this.wearHeld(1);
  }

  /** Hyper Rope wear: one durability every two blocks climbed along the hidden axis. */
  private ropeWear(): void {
    const p = this.player;
    if (p.mode !== 'survival') return;
    let d = 0;
    for (let k = 0; k < 4; k++) d += (p.pos[k]! - this.ropeFrom[k]!) ** 2;
    this.ropeTravel += Math.sqrt(d);
    while (this.ropeTravel >= 2) {
      this.ropeTravel -= 2;
      this.wearHeld(1);
    }
  }

  /** W-Anchor: sneak-use (or the first use) marks where you stand; use brings you back. */
  private useAnchor(held: ItemStack): void {
    const p = this.player;
    const realm = this.world.realm.name;
    const mark = held.tag?.mark;
    if (this.input.held('sneak') || !mark) {
      const m: [string, number, number, number, number] = [realm, Math.floor(p.pos[0]!) + 0.5, Math.floor(p.pos[1]! + 1e-3), Math.floor(p.pos[2]!) + 0.5, Math.floor(p.pos[3]!) + 0.5];
      held.tag = { ...(held.tag ?? {}), mark: m };
      this.inv.set(this.hotbarIndex, held);
      this.particles.burst(m[1], m[2] + 0.5, m[3], m[4], p.cam, 'spark', '#c86aff', 20, 2, 0.4, true);
      this.message?.(`W-Anchor set at ${Math.floor(m[1])}, ${m[2]}, ${Math.floor(m[3])}, ${Math.floor(m[4])}`);
      return;
    }
    if (mark[0] !== realm) {
      this.message?.('The anchor is set in another realm');
      return;
    }
    if (this.anchorCd > 0) {
      this.message?.(`The anchor is recharging (${Math.ceil(this.anchorCd)} s)`);
      return;
    }
    const e = this.eyePos;
    this.particles.burst(e[0]!, e[1]! - 0.5, e[2]!, e[3]!, p.cam, 'spark', '#c86aff', 24, 3, 0.5, true);
    p.setPosition(mark[1], mark[2], mark[3], mark[4]);
    p.vel.fill(0);
    p.fallStart = mark[2];
    if (!this.world.column(Math.floor(mark[1] / 16), Math.floor(mark[3] / 16), Math.floor(mark[4] / 16))) {
      // Far away: wait for the destination to stream in.
      this.loaded = false;
      p.frozen = true;
    }
    this.streamer.invalidate();
    this.anchorCd = ANCHOR_COOLDOWN;
    if (p.mode === 'survival') this.wearHeld(1);
    this.message?.('Back to the anchor');
  }

  /** Burn down the fuses; a fuse that ends on its lit TNT block sets off a blast. */
  private tickTnt(dt: number): void {
    if (!this.tnt.size) return;
    for (const [k, t] of this.tnt) {
      t.fuse -= dt;
      if (Math.random() < dt * 6) this.particles.burst(t.x + 0.5, t.y + 1.05, t.z + 0.5, t.w + 0.5, this.player.cam, 'smoke', '#8a8a8a', 1, 0.6, 0.1);
      if (t.fuse > 0) continue;
      this.tnt.delete(k);
      if ((this.world.getBlock(t.x, t.y, t.z, t.w) & 0xfff) !== this.tntLitId) continue; // mined
      this.world.setBlock(t.x, t.y, t.z, t.w, 0);
      this.explode(t.x + 0.5, t.y + 0.5, t.z + 0.5, t.w + 0.5, 4);
    }
  }

  /**
   * Start a fire in an air cell that stands on something solid or touches something that
   * burns (soul fire on soul sand and soul soil).
   */
  startFire(x: number, y: number, z: number, w: number): boolean {
    const world = this.world;
    if (world.getBlock(x, y, z, w) !== 0) return false;
    const bv = world.getBlock(x, y - 1, z, w);
    const below = bv === VOID_VOXEL ? 0 : voxelId(bv);
    let fuel = false;
    for (let a = 0; a < 4 && !fuel; a++)
      for (const s of [-1, 1]) {
        const v = world.getBlock(x + (a === 0 ? s : 0), y + (a === 1 ? s : 0), z + (a === 2 ? s : 0), w + (a === 3 ? s : 0));
        if (v !== VOID_VOXEL && REG.ignite[voxelId(v)]! > 0) fuel = true;
      }
    if (!REG.solid[below] && !fuel) return false;
    if (below === REG.id('soul_sand') || below === REG.id('soul_soil')) return world.setBlock(x, y, z, w, REG.id('soul_fire'));
    return this.fire.setFire(x, y, z, w);
  }

  /** Rain is falling on a cell: rain or thunder, a rainy biome there, and open sky above. */
  rainingAt(x: number, y: number, z: number, w: number): boolean {
    const wx = this.env.weather;
    if (wx !== 'rain' && wx !== 'thunder') return false;
    const b = this.world.biomeAt(x, z, w);
    if (b >= 0 && REG.biomes[b]!.precipitation !== 'rain') return false;
    return this.world.skyHeight(x, z, w) <= y;
  }

  /** Fill a valid portal frame around (x, y, z, w) with portal membrane. */
  lightPortal(x: number, y: number, z: number, w: number): boolean {
    const get = (a: number, b: number, c: number, d: number) => this.world.getBlock(a, b, c, d);
    const open = (v: number) => v === 0 || FIRE_IDS[voxelId(v)] === 1;
    const box = findPortal(get, x, y, z, w, open, (v) => this.isPortalFrame(v));
    if (!box) return false;
    const portal = REG.id('portal');
    for (const c of interiorCells(box)) this.world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, portal);
    this.portals.push({ realm: this.world.realm.name, ...box });
    const ctr = portalCenter(box);
    this.particles.burst(ctr[0], ctr[1] + 1, ctr[2], ctr[3], this.player.cam, 'spark', '#c86aff', 24, 2.5, 0.8, true);
    this.message?.(`The portal opens · it leads to ${REG.realm(portalDestination(this.world.realm.name)).displayName}`);
    return true;
  }

  /** The portal (box) whose membrane contains the cell, if any. */
  portalAt(x: number, y: number, z: number, w: number): PortalBox | null {
    const portal = REG.id('portal');
    const get = (a: number, b: number, c: number, d: number) => this.world.getBlock(a, b, c, d);
    return findPortal(get, x, y, z, w, (v) => voxelId(v) === portal && v !== VOID_VOXEL, (v) => this.isPortalFrame(v));
  }

  /** Is the player's body inside portal membrane? */
  private inPortal(): number[] | null {
    const p = this.player.pos, portal = REG.id('portal');
    for (const dy of [0.2, 1.4]) {
      const c = [Math.floor(p[0]!), Math.floor(p[1]! + dy), Math.floor(p[2]!), Math.floor(p[3]!)];
      if ((this.world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === portal) return c;
    }
    return null;
  }

  /** Standing in a portal: the view swirls, and after 4 s (1 s in creative) you travel. */
  private updatePortal(dt: number): void {
    const cell = this.inPortal();
    if (!cell) {
      this.portalCooldown = false;
      this.portalTime = Math.max(0, this.portalTime - dt * 2);
      return;
    }
    if (this.portalCooldown || this.vitals.dead) return;
    this.portalTime += dt;
    const need = this.player.mode === 'creative' || this.player.mode === 'spectator' ? 1 : 4;
    if (this.portalTime < need) return;
    this.portalTime = 0;
    const from = this.world.realm, to = REG.realm(portalDestination(from.name));
    const box = this.portalAt(cell[0]!, cell[1]!, cell[2]!, cell[3]!);
    const arrival: Arrival = { kind: 'portal', axis: box?.axis ?? 0 };
    if (box?.thin !== undefined) arrival.thin = box.thin;
    this.beginTravel(to.name, scalePosition(this.player.pos, from, to), arrival);
  }

  /** Save and hand over to main.ts, which reloads the game in the destination realm. */
  beginTravel(realm: string, pos: ArrayLike<number>, arrival: Arrival): void {
    if (this.traveling) return;
    const dest = REG.realm(realm);
    this.traveling = dest.displayName;
    this.player.frozen = true;
    this.message?.(`Entering ${dest.displayName}…`);
    const st = this.snapshot();
    st.realm = realm;
    st.player.pos = Array.from(pos);
    st.data = { ...(st.data ?? {}), portals: this.portals, arrival };
    this.onTravel?.(st);
  }

  private neighboursLoaded(cx: number, cz: number, cw: number): boolean {
    for (let dw = -1; dw <= 1; dw++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) if (!this.world.column(cx + dx, cz + dz, cw + dw)) return false;
    return true;
  }

  /**
   * Arrive in this realm. Through a portal: step into a known portal near the scaled point
   * (within 128 blocks on the Surface, 16 in the Ember Depths, like Minecraft), or build a new
   * one on the nearest free ground. Returns false if the player moved to columns that are not
   * loaded yet (a known portal farther away): the caller waits again.
   */
  private arrive(): boolean {
    const a = this.arrival!;
    this.arrival = null;
    this.arrivalWait = 0;
    if (a.kind === 'respawn' || a.kind === 'void') {
      this.checkBed = a.kind === 'respawn' && this.bed !== null;
      return true;
    }
    const realm = this.world.realm.name;
    const p = this.player.pos;
    const R = realm === 'surface' ? 128 : 16;
    let best: PortalRecord | null = null, bd = R;
    for (const r of this.portals) {
      if (r.realm !== realm) continue;
      const c = portalCenter(r);
      const d = Math.hypot(c[0] - p[0]!, c[2] - p[2]!, c[3] - p[3]!);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    const portal = REG.id('portal');
    if (best) {
      let intact: boolean | null = true;
      for (const c of interiorCells(best)) {
        const v = this.world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!);
        if (v === VOID_VOXEL) {
          intact = null;
          break;
        }
        if ((v & 0xfff) !== portal) {
          intact = false;
          break;
        }
      }
      if (intact !== false) {
        const c = portalCenter(best);
        this.player.setPosition(c[0], c[1], c[2], c[3]);
        this.portalCooldown = true;
        if (intact === null) {
          this.streamer.invalidate();
          return false;
        }
        return true;
      }
      this.portals = this.portals.filter((r) => r !== best);
    }
    const shape: PortalShape = { axis: a.axis ?? 0 };
    if (a.thin !== undefined) shape.thin = a.thin;
    const box = this.buildArrivalPortal(p, shape);
    this.portals.push({ realm, ...box });
    const c = portalCenter(box);
    this.player.setPosition(c[0], c[1], c[2], c[3]);
    this.portalCooldown = true;
    return true;
  }

  /**
   * Build an arrival portal shaped like the one left behind (a flat 2 x 3 portal like
   * Minecraft's, or a 2 x 3 x 2 hyper-portal), framed with obsidian, with a platform to step
   * out on, near `at`: on free ground within a few blocks if there is some, else carved in place.
   */
  private buildArrivalPortal(at: ArrayLike<number>, shape: PortalShape): PortalBox {
    // Search offsets run along the two horizontal axes other than the normal.
    const [ha, hb] = [0, 2, 3].filter((a) => a !== shape.axis) as [number, number];
    const wide = framedAxes(shape).filter((a) => a !== 1);
    const world = this.world;
    const realm = world.realm;
    const make = (x: number, y: number, z: number, w: number): PortalBox => {
      const min: PortalBox['min'] = [x, y, z, w];
      const max: PortalBox['max'] = [x, y + 2, z, w];
      for (const a of wide) max[a] = min[a] + 1;
      const box: PortalBox = { axis: shape.axis, min, max };
      if (shape.thin !== undefined) box.thin = shape.thin;
      return box;
    };
    // The volume a portal needs: the box grown by one cell along every axis (the frame, and a
    // slab of air on both sides of the membrane). Its bottom row is the floor.
    const volume = (box: PortalBox, f: (x: number, y: number, z: number, w: number, floor: boolean) => boolean): boolean => {
      for (let y = box.min[1] - 1; y <= box.max[1] + 1; y++)
        for (let x = box.min[0] - 1; x <= box.max[0] + 1; x++)
          for (let z = box.min[2] - 1; z <= box.max[2] + 1; z++)
            for (let w = box.min[3] - 1; w <= box.max[3] + 1; w++) if (!f(x, y, z, w, y === box.min[1] - 1)) return false;
      return true;
    };
    const free = (box: PortalBox) =>
      volume(box, (x, y, z, w, floor) => {
        const v = world.getBlock(x, y, z, w);
        if (v === VOID_VOXEL) return false;
        const id = v & 0xfff;
        if (floor) return REG.fluid[id] === 0; // the floor row may be solid (or air: we build it)
        return !REG.solid[id] && REG.fluid[id] === 0;
      });
    // Mostly solid ground under the platform.
    const grounded = (box: PortalBox) => {
      let solid = 0, n = 0;
      for (let x = box.min[0] - 1; x <= box.max[0] + 1; x++)
        for (let z = box.min[2] - 1; z <= box.max[2] + 1; z++)
          for (let w = box.min[3] - 1; w <= box.max[3] + 1; w++) {
            n++;
            if (REG.solid[world.getBlock(x, box.min[1] - 2, z, w) & 0xfff]) solid++;
          }
      return solid >= n * 0.6;
    };
    const top = realm.heightChunks * 16 - 8;
    const x0 = Math.floor(at[0]!), y0 = Math.max(realm.seaLevel + 2, Math.min(top - 6, Math.floor(at[1]!))), z0 = Math.floor(at[2]!), w0 = Math.floor(at[3]!);
    let pick: PortalBox | null = null;
    let floating: PortalBox | null = null;
    search: for (let r = 0; r <= 8 && !pick; r += 2)
      for (let dy = 0; dy <= 60; dy++) {
        const yy = y0 + (dy % 2 === 0 ? -dy / 2 : (dy + 1) / 2);
        if (yy < realm.seaLevel + 2 || yy > top - 6) continue;
        for (let s = 0; s < (r === 0 ? 1 : 8); s++) {
          const q = [x0, yy, z0, w0];
          if (r > 0) {
            q[ha] = q[ha]! + Math.round(Math.cos((s * Math.PI) / 4) * r);
            q[hb] = q[hb]! + Math.round(Math.sin((s * Math.PI) / 4) * r);
          }
          const box = make(q[0]!, q[1]!, q[2]!, q[3]!);
          if (!free(box)) continue;
          if (grounded(box)) {
            pick = box;
            break search;
          }
          floating ??= box;
        }
      }
    const box = pick ?? floating ?? make(x0, y0, z0, w0);
    // Carve, then build: platform, frame (flat portals get Minecraft's corners), membrane.
    const obs = REG.id('obsidian'), portal = REG.id('portal');
    volume(box, (x, y, z, w, floor) => {
      world.setBlock(x, y, z, w, floor ? obs : 0);
      return true;
    });
    for (const c of frameCells(box, box.thin !== undefined)) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, obs);
    for (const c of interiorCells(box)) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, portal);
    return box;
  }

  /**
   * A portal cell or frame block changed. Each connected body of membrane next to it must
   * still be exactly one valid portal; otherwise it collapses (every connected membrane cell),
   * like Minecraft's. A block next to a flat portal's membrane that was never part of its
   * frame (say, obsidian kata of it) does not matter.
   */
  private portalBlockChanged(x: number, y: number, z: number, w: number, o: number, n: number): void {
    if (this.collapsing) return;
    const portal = REG.id('portal');
    const wasPortal = (o & 0xfff) === portal && (n & 0xfff) !== portal;
    const wasFrame = this.isPortalFrame(o) && !this.isPortalFrame(n);
    if (!wasPortal && !wasFrame) return;
    const around = [
      [1, 0, 0, 0],
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, -1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, -1, 0],
      [0, 0, 0, 1],
      [0, 0, 0, -1],
    ];
    const membrane = (c: number[]) => (this.world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === portal;
    const seen = new Set<string>();
    const collapsed: number[][] = [];
    for (const d of around) {
      const seed = [x + d[0]!, y + d[1]!, z + d[2]!, w + d[3]!];
      if (seen.has(seed.join()) || !membrane(seed)) continue;
      // The connected body of membrane.
      const stack = [seed], cells: number[][] = [];
      while (stack.length && cells.length < 4000) {
        const c = stack.pop()!;
        const k = c.join();
        if (seen.has(k)) continue;
        seen.add(k);
        if (!membrane(c)) continue;
        cells.push(c);
        for (const e of around) stack.push([c[0]! + e[0]!, c[1]! + e[1]!, c[2]! + e[2]!, c[3]! + e[3]!]);
      }
      const box = this.portalAt(seed[0]!, seed[1]!, seed[2]!, seed[3]!);
      if (box) {
        let count = 0;
        for (const c of interiorCells(box)) if (membrane(c)) count++;
        if (count === cells.length) continue; // still one whole, valid portal
      }
      collapsed.push(...cells);
    }
    if (!collapsed.length) return;
    this.collapsing = true;
    for (const c of collapsed) this.world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
    this.collapsing = false;
    const realm = this.world.realm.name;
    this.portals = this.portals.filter(
      (r) => r.realm !== realm || !collapsed.some((c) => c[0]! >= r.min[0] && c[0]! <= r.max[0] && c[1]! >= r.min[1] && c[1]! <= r.max[1] && c[2]! >= r.min[2] && c[2]! <= r.max[2] && c[3]! >= r.min[3] && c[3]! <= r.max[3]),
    );
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
      if (tod >= DAY_FRACTION * TICKS_PER_DAY) this.env.ticks += TICKS_PER_DAY - tod;
      if (this.env.weather !== 'clear') this.env.setWeather('clear', false);
      this.message?.(`Good morning! Day ${this.env.day + 1}`);
    }
    if (s.t >= SLEEP_FADE + WAKE_FADE) this.sleeping = null;
  }

  /** No movement input (paused, dead, a screen is open). */
  // ------------------------------------------------------------------ enchantments over time

  private enchantTick(dt: number): void {
    const p = this.player;
    if (this.phaseCd > 0) this.phaseCd -= dt;
    // Frost Walker: water under and around your feet freezes (a 4D disc in x, z and w).
    const fw = enchLevel(this.armorPiece(3), 'frost_walker');
    if (fw > 0 && p.onGround && !p.inWater && p.mode !== 'spectator') this.frostWalk(2 + fw);
    if (this.frosted.size) {
      this.frostT -= dt;
      if (this.frostT <= 0) {
        this.frostT = 0.25;
        const ice = REG.id('frosted_ice'), water = REG.id('water');
        for (const [k, f] of this.frosted) {
          f[4] -= 0.25;
          if (f[4] > 0) continue;
          // Not while you stand on it.
          const under = Math.abs(f[0] + 0.5 - p.pos[0]!) < 1 && Math.abs(f[2] + 0.5 - p.pos[2]!) < 1 && Math.abs(f[3] + 0.5 - p.pos[3]!) < 1 && Math.abs(f[1] + 1 - p.pos[1]!) < 0.5;
          if (under) {
            f[4] = 1;
            continue;
          }
          this.frosted.delete(k);
          if ((this.world.getBlock(f[0], f[1], f[2], f[3]) & 0xfff) === ice) this.world.setBlock(f[0], f[1], f[2], f[3], water);
        }
      }
    }
    // Slice Sense: refresh the ores kata and ana of your slice a few times a second.
    this.sliceSenseT -= dt;
    if (this.sliceSenseT <= 0) {
      this.sliceSenseT = 0.25;
      const held = this.held;
      const ss = held && IREG.toolKind[held.id] === PICKAXE_KIND ? enchLevel(held, 'slice_sense') : 0;
      this.sliceSense.length = 0;
      if (ss > 0 && p.mode !== 'spectator') this.scanSliceSense(ss);
    }
    // Phase storms surge now and then: out under the sky you may be shoved kata or ana.
    if (this.env.weather === 'phase_storm' && this.world.realm.name === 'surface' && (p.mode === 'survival' || p.mode === 'adventure')) {
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surgeT = 20 + Math.random() * 25;
        const e = this.eyePos;
        if (this.world.skyHeight(Math.floor(e[0]!), Math.floor(e[2]!), Math.floor(e[3]!)) <= e[1]! && Math.random() < 0.6) {
          this.particles.burst(e[0]!, e[1]! - 0.5, e[2]!, e[3]!, p.cam, 'spark', '#c86aff', 30, 3, 1.2, true);
          this.shove((Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2)), 'A phase surge');
        }
      }
    }
  }

  private frostWalk(r: number): void {
    const p = this.player;
    const water = REG.id('water'), ice = REG.id('frosted_ice');
    const x0 = Math.floor(p.pos[0]!), y = Math.floor(p.pos[1]! - 0.5), z0 = Math.floor(p.pos[2]!), w0 = Math.floor(p.pos[3]!);
    for (let dw = -r; dw <= r; dw++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz + dw * dw > r * r) continue;
          const x = x0 + dx, z = z0 + dz, w = w0 + dw;
          const v = this.world.getBlock(x, y, z, w);
          if ((v & 0xfff) !== water || v >>> 12 !== 0) continue;
          if (this.world.getBlock(x, y + 1, z, w) !== 0) continue;
          if (!this.world.setBlock(x, y, z, w, ice)) continue;
          this.frosted.set(`${x},${y},${z},${w}`, [x, y, z, w, 3 + Math.random() * 3]);
        }
  }

  /** Ores within reach whose cells lie off your slice, up to 1 + level blocks kata or ana. */
  private scanSliceSense(level: number): void {
    const e = this.eyePos, cam = this.player.cam;
    const R = 6;
    const ex = Math.floor(e[0]!), ey = Math.floor(e[1]!), ez = Math.floor(e[2]!), ew = Math.floor(e[3]!);
    const out = this.sliceSense;
    for (let dw = -R; dw <= R; dw++)
      for (let dz = -R; dz <= R; dz++)
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const x = ex + dx, y = ey + dy, z = ez + dz, w = ew + dw;
            const id = this.world.getBlock(x, y, z, w) & 0xfff;
            if (IREG.mineXp[id] === null || IREG.mineXp[id] === undefined) continue;
            const dh = Math.abs(Vision4D.dh(e, cam, x + 0.5, y + 0.5, z + 0.5, w + 0.5));
            if (dh < 0.75 || dh > level + 1.5) continue;
            out.push(x, y, z, w, id);
            if (out.length >= 64 * 5) return;
          }
  }

  /**
   * Shove the player `dist` blocks along the hidden axis (kata < 0 < ana), into open space
   * only. Anchor stops it; Kata Grip boots resist it (30% per level).
   */
  shove(dist: number, what: string): boolean {
    const p = this.player;
    if (p.mode === 'creative' || p.mode === 'spectator') return false;
    if (this.effects.has('anchor')) {
      this.message?.(`${what} cannot move you: anchored`);
      return false;
    }
    const grip = enchLevel(this.armorPiece(3), 'kata_grip');
    if (grip > 0 && Math.random() < 0.3 * grip) {
      this.message?.(`Kata Grip holds you in your slice`);
      return false;
    }
    const H = p.cam.H;
    const step = Math.sign(dist);
    for (let d = Math.abs(dist); d >= 1; d--) {
      const q = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) q[k] = p.pos[k]! + H[k]! * d * step;
      let free = true;
      for (let hgt = 0; hgt < 2 && free; hgt++) {
        const v = this.world.getBlock(Math.floor(q[0]!), Math.floor(q[1]! + 0.1 + hgt), Math.floor(q[2]!), Math.floor(q[3]!));
        if (v === VOID_VOXEL || REG.solid[v & 0xfff]) free = false;
      }
      if (!free) continue;
      p.setPosition(q[0]!, q[1]!, q[2]!, q[3]!);
      this.message?.(`${what} shoves you ${step > 0 ? 'ana' : 'kata'}!`);
      this.params.damage = Math.max(this.params.damage, 0.25);
      return true;
    }
    return false;
  }

  /** Effects, hunger, armour and items in use change how the player moves. */
  private movementModifiers(): void {
    const p = this.player;
    const e = this.effects;
    let k = 1;
    const sp = e.amp('speed'), sl = e.amp('slowness');
    if (sp >= 0) k *= 1 + 0.2 * (sp + 1);
    if (sl >= 0) k *= Math.max(0, 1 - 0.15 * (sl + 1));
    if (this.using) k *= 0.25;
    if (this.blocking) k *= 0.3;
    p.speedMul = k;
    p.jumpBoost = e.level('jump_boost');
    p.slowFall = e.has('slow_falling');
    p.lavaSwim = this.setBonus('slag');
    p.depthStrider = enchLevel(this.armorPiece(3), 'depth_strider');
    p.hanging = this.roping !== 0;
    p.hangSpeed = ROPE_SPEED;
    if (p.hanging) this.move.ana = this.roping;
    for (let k = 0; k < 4; k++) this.ropeFrom[k] = p.pos[k]!;
    if (p.mode === 'survival' || p.mode === 'adventure') {
      // Too hungry to sprint (and no sprinting while eating).
      if (!this.hunger.canSprint || this.using) this.move.sprint = false;
    }
  }

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
    return REG.blocks[tid]!.name === 'crafting_table' || STATION_SCREENS[REG.blocks[tid]!.name] !== undefined || this.blockEntities.hasEntity(tid) || isBed(this.target.voxel);
  }

  // ------------------------------------------------------------------ combat & health

  /** Melee attack on a mob with the held item. Returns true if it landed. */
  attack(m: Mob): boolean {
    const p = this.player;
    const held = this.held;
    const heldId = held ? held.id : -1;
    const cd = attackCooldown(heldId);
    const full = this.sinceSwing >= cd * 0.9;
    let dmg = attackDamage(heldId);
    const str = this.effects.amp('strength'), weak = this.effects.amp('weakness');
    if (str >= 0) dmg += 3 * (str + 1);
    if (weak >= 0) dmg = Math.max(0, dmg - 4);
    // Weapon enchantments.
    const sharp = enchLevel(held, 'sharpness'), smite = enchLevel(held, 'smite'), bane = enchLevel(held, 'bane_of_arthropods');
    if (sharp > 0) dmg += 0.5 * sharp + 0.5;
    if (smite > 0 && m.def.undead) dmg += 2.5 * smite;
    if (bane > 0 && m.def.arthropod) dmg += 2.5 * bane;
    const strength = swingStrength(this.sinceSwing, cd);
    dmg *= strength;
    this.hunger.exhaust(0.1);
    // Critical hit: a full-strength swing while falling.
    const crit = full && !p.onGround && !p.flying && p.vel[p.up]! < 0 && !p.inWater && !p.onClimbable;
    if (crit) dmg *= CRIT_MULTIPLIER;
    this.sinceSwing = 0;
    // Knockback along your forward direction: it stays inside the slice.
    const from = this.tmp4;
    const F = p.cam.F;
    for (let k = 0; k < 4; k++) from[k] = m.pos[k]! - F[k]!;
    const phase = this.phaseTarget === m;
    const offSlice = phase || this.reachTarget === m;
    if (!this.mobs.damage(m, dmg, from, offSlice ? null : this.eyePos, p.cam.H, true, 1 + enchLevel(held, 'knockback'))) return false;
    if (phase) {
      this.phaseCd = 1;
      this.particles.burst(m.pos[0]!, m.pos[1]! + m.height * 0.5, m.pos[2]!, m.pos[3]!, p.cam, 'spark', '#c86aff', 14, 2, m.width, true);
    }
    const fa = enchLevel(held, 'fire_aspect');
    if (fa > 0 && !m.def.fireproof) m.burning = Math.max(m.burning, 4 * fa);
    if (bane > 0 && m.def.arthropod) this.mobs.applyEffect(m, 'slowness', 1 + Math.random() * 0.5 * bane, 3);
    m.looting = enchLevel(held, 'looting');
    // Sweeping: a full swing with a sword on the ground also hits everything around the target,
    // in all four dimensions (a sweep catches mobs kata and ana of it).
    if (full && p.onGround && !p.sprinting && heldId >= 0 && IREG.toolKind[heldId] === SWORD_KIND) {
      const sw = enchLevel(held, 'sweeping');
      const sd = 1 + (sw > 0 ? dmg * (sw / (sw + 1)) : 0);
      for (const o of this.mobs.list) {
        if (o === m || o.def.profession) continue;
        const d = Math.hypot(o.pos[0]! - m.pos[0]!, o.pos[1]! - m.pos[1]!, o.pos[2]! - m.pos[2]!, o.pos[3]! - m.pos[3]!);
        if (d > 1.6 + o.width) continue;
        this.mobs.damage(o, sd, from, this.eyePos, p.cam.H, true);
      }
    }
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
    if (held) this.wearHeld(hitWear(heldId));
    return true;
  }

  /** Let go of a drawn bow: shoot an arrow along the view direction (inside the slice). */
  private releaseBow(): void {
    const p = this.player;
    const power = bowPower(this.bowDraw);
    if (power < 0.1) return;
    const survival = p.mode === 'survival' || p.mode === 'adventure';
    const bowStack = this.held;
    // Ammunition: the off hand first, then the hotbar, then the rest (Minecraft's order).
    let slot = -1;
    for (const i of [OFFHAND, ...Array.from({ length: 36 }, (_, k) => k)]) {
      const s = this.inv.get(i);
      if (s && IREG.tags[s.id]!.has('arrow')) {
        slot = i;
        break;
      }
    }
    const arrow = slot >= 0 ? this.inv.get(slot)!.id : IREG.id('arrow');
    const kind = ARROWS[IREG.name(arrow)] ?? ARROWS.arrow!;
    if (survival) {
      if (slot < 0) {
        this.message?.('No arrows');
        return;
      }
      // Infinity: one plain arrow is enough (silver and spectral arrows are used up).
      if (enchLevel(bowStack, 'infinity') === 0 || IREG.name(arrow) !== 'arrow') {
        const s = this.inv.get(slot)!;
        s.count--;
        this.inv.set(slot, s.count > 0 ? s : null);
      }
    }
    const e = this.eyePos, f = p.cam.fwd;
    const from = this.tmp4;
    for (let k = 0; k < 4; k++) from[k] = e[k]! + f[k]! * 0.4;
    from[p.up] = from[p.up]! - 0.1;
    const v = this.tmpMin;
    for (let k = 0; k < 4; k++) v[k] = f[k]! * ARROW_SPEED * power;
    const pw = enchLevel(bowStack, 'power');
    const dmg = arrowDamage(power) * (pw > 0 ? 1 + 0.25 * (pw + 1) : 1) * kind.damage;
    this.projectiles.spawn(from, v, dmg, arrow, true, { fire: enchLevel(bowStack, 'flame') > 0, knock: enchLevel(bowStack, 'punch'), undead: kind.undead, glow: kind.glow });
    if (survival) this.wearHeld(1);
  }

  /**
   * Damage the player (survival/adventure only; creative and spectator are invulnerable).
   * `from` (a 4D point) sets the knockback direction, which is kept inside the slice so a hit
   * never shifts your view kata/ana.
   */
  hurtPlayer(amount: number, from: ArrayLike<number> | null, cause: string, kind: DamageKind = from ? 'melee' : 'generic', attacker: Mob | null = null): boolean {
    if (this.sleeping && amount > 0) this.wake();
    const p = this.player;
    const vulnerable = this.loaded && (p.mode === 'survival' || p.mode === 'adventure');
    if (!vulnerable || amount <= 0 || this.vitals.dead || this.vitals.hurtCooldown > 0) return false;
    // Fire immunity: Fire Resistance, or a full set of Ancient Slag armour.
    if (isFireDamage(kind) && (this.effects.has('fire_resistance') || this.setBonus('slag'))) return false;
    // Phase Step (a full Starlight set): the first blow every ten seconds passes through you, and you slip two blocks along W.
    if (this.phaseStepCd <= 0 && (kind === 'melee' || kind === 'projectile' || kind === 'explosion' || kind === 'contact') && this.setBonus('starlight')) {
      this.phaseStepCd = 10;
      this.vitals.hurtCooldown = 0.5;
      this.particles.burst(p.pos[0]!, p.pos[1]! + 1, p.pos[2]!, p.pos[3]!, p.cam, 'spark', '#9ad8ff', 16, 2.5, 0.5, true);
      this.message?.('Phase Step: the blow passes through you');
      void this.shove(Math.random() < 0.5 ? -2 : 2, 'Phase Step');
      return false;
    }
    if (this.blocking && from && (kind === 'melee' || kind === 'projectile' || kind === 'explosion') && this.shieldBlocks(from, amount, attacker)) return false;
    const dmg = this.reduceDamage(amount, kind);
    // Thorns: a chance to hurt whatever hit you in melee.
    if (attacker && kind === 'melee') {
      for (let k = 0; k < 4; k++) {
        const t = enchLevel(this.armorPiece(k), 'thorns');
        if (t > 0 && Math.random() < 0.15 * t) {
          attacker.hurt = 0;
          this.mobs.damage(attacker, 1 + Math.floor(Math.random() * 4), p.pos, undefined, undefined, true);
          this.wearArmorPiece(k, 2);
        }
      }
    }
    if (this.vitals.damage(dmg, cause, false) <= 0) {
      // Fully soaked by armour: still a hit (invulnerability frames, knockback).
      if (dmg > 0) return false;
      this.vitals.hurtCooldown = 0.5;
    }
    if (this.vitals.dead) this.tryCharm();
    this.hunger.exhaust(0.1);
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

  // ------------------------------------------------------------------ armour & effects (Phase 7)

  /** The armour stack in slot k (0 helmet .. 3 boots). */
  armorPiece(k: number): ItemStack | null {
    return this.inv.get(ARMOR_START + k);
  }

  /** Is an item with this name worn (any armour slot)? */
  wearing(name: string): boolean {
    for (let k = 0; k < 4; k++) {
      const s = this.armorPiece(k);
      if (s && IREG.name(s.id) === name) return true;
    }
    return false;
  }

  /** All four pieces of an armour set are worn (Reefshell is a one-piece set). */
  setBonus(set: string): boolean {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const s = this.armorPiece(k);
      if (s && IREG.armor[s.id]?.set === set) n++;
    }
    return set === 'reefshell' ? n >= 1 : n >= 4;
  }

  /** Total armour points and toughness of what is worn. */
  armorTotals(): [number, number] {
    let a = 0, t = 0;
    for (let k = 0; k < 4; k++) {
      const s = this.armorPiece(k);
      const st = s ? IREG.armor[s.id] : null;
      if (!st) continue;
      a += st.points;
      t += st.toughness;
    }
    return [a, t];
  }

  /** Armour, enchantments, Resistance: what is left of a hit of `amount`. */
  private reduceDamage(amount: number, kind: DamageKind): number {
    let dmg = amount;
    if (armorApplies(kind)) {
      const [armor, tough] = this.armorTotals();
      dmg = armorReduce(dmg, armor, tough);
      this.wearArmor(amount);
    }
    // Protection enchantments (enchantment protection factor, capped at 20: 80% off).
    if (kind !== 'void' && kind !== 'starve') {
      let epf = 0;
      for (let k = 0; k < 4; k++) {
        for (const [n, l] of this.armorPiece(k)?.tag?.ench ?? []) {
          if (n === 'protection') epf += l;
          else if (n === 'fire_protection' && isFireDamage(kind)) epf += 2 * l;
          else if (n === 'blast_protection' && kind === 'explosion') epf += 2 * l;
          else if (n === 'projectile_protection' && kind === 'projectile') epf += 2 * l;
          else if (n === 'feather_falling' && kind === 'fall') epf += 3 * l;
        }
      }
      if (epf > 0) dmg = epfReduce(dmg, epf);
    }
    const res = this.effects.amp('resistance');
    if (res >= 0) dmg *= Math.max(0, 1 - 0.2 * (res + 1));
    return dmg;
  }

  /** Wear one armour piece (Thorns costs extra). */
  private wearArmorPiece(k: number, n: number): void {
    const i = ARMOR_START + k;
    const s = this.inv.get(i);
    if (!s || IREG.durability[s.id] === 0) return;
    s.damage += n;
    if (s.damage >= IREG.durability[s.id]!) {
      this.inv.set(i, null);
      this.message?.(`${IREG.displayName(s.id)} broke`);
    } else this.inv.set(i, s);
  }

  /** Armour wears out as it takes hits (a quarter of the damage per piece). */
  private wearArmor(amount: number): void {
    const wear = armorWear(amount);
    for (let k = 0; k < 4; k++) {
      const i = ARMOR_START + k;
      const s = this.inv.get(i);
      if (!s || !IREG.armor[s.id] || IREG.durability[s.id] === 0) continue;
      // Unbreaking on armour: 60% + 40% / (level + 1) of hits wear it.
      const ub = enchLevel(s, 'unbreaking');
      if (ub > 0 && Math.random() >= 0.6 + 0.4 / (ub + 1)) continue;
      s.damage += wear;
      if (s.damage >= IREG.durability[s.id]!) {
        this.inv.set(i, null);
        this.message?.(`${IREG.displayName(s.id)} broke`);
      } else this.inv.set(i, s);
    }
  }

  /** Highest level of an enchantment across the armour worn. */
  armorEnch(name: string): number {
    let m = 0;
    for (let k = 0; k < 4; k++) m = Math.max(m, enchLevel(this.armorPiece(k), name));
    return m;
  }

  /** Burn time after Fire Protection (15% less per level). */
  private burnTime(base: number): number {
    return base * Math.max(0, 1 - 0.15 * this.armorEnch('fire_protection'));
  }

  /**
   * Use `amount` durability of the held item (Unbreaking may spare it); breaks it when worn
   * out. Survival only.
   */
  wearHeld(amount: number): void {
    const held = this.held;
    if (!held || amount <= 0 || this.player.mode !== 'survival' || IREG.durability[held.id] === 0) return;
    const ub = enchLevel(held, 'unbreaking');
    for (let k = 0; k < amount; k++) if (ub === 0 || Math.random() < 1 / (ub + 1)) held.damage++;
    if (held.damage >= IREG.durability[held.id]!) {
      this.inv.set(this.hotbarIndex, null);
      this.message?.(`${IREG.displayName(held.id)} broke`);
      this.particles.burst(this.eyePos[0]!, this.eyePos[1]! - 0.3, this.eyePos[2]!, this.eyePos[3]!, this.player.cam, 'poof', '#8a8a8a', 8, 1.2, 0.2);
    } else this.inv.set(this.hotbarIndex, held);
  }

  /**
   * Give the player an effect (potions, food, mobs). Instant effects act at once; returns
   * whether anything happened.
   */
  applyEffect(name: string, seconds: number, amp = 0): boolean {
    const def = EFFECT_BY_NAME.get(name);
    if (!def) return false;
    const v = this.vitals;
    if (def.instant) {
      if (name === 'instant_health') v.heal(4 << Math.min(5, amp));
      else if (name === 'instant_damage') this.hurtDirect(6 << Math.min(5, amp), 'Killed by magic', 'magic');
      else if (name === 'saturation') this.hunger.eat(amp + 1, 2 * (amp + 1));
      return true;
    }
    if (!this.effects.add(name, seconds, amp)) return false;
    if (name === 'absorption') v.absorption = Math.max(v.absorption, 4 * (amp + 1));
    return true;
  }

  /** Damage that ignores the hit cooldown and knockback (poison, magic, starving). */
  private hurtDirect(amount: number, cause: string, kind: DamageKind): void {
    const p = this.player;
    if (!this.loaded || (p.mode !== 'survival' && p.mode !== 'adventure') || this.vitals.dead) return;
    const dmg = this.reduceDamage(amount, kind);
    const cd = this.vitals.hurtCooldown;
    this.vitals.hurtCooldown = 0;
    this.vitals.damage(dmg, cause, false);
    this.vitals.hurtCooldown = Math.max(cd, 0);
    if (this.vitals.dead) this.tryCharm();
  }

  /**
   * A raised shield stops hits from in front, in a wide arc of your slice, but not from the
   * hidden axis: an attacker mostly kata or ana of you gets around it. Costs durability.
   */
  private shieldBlocks(from: ArrayLike<number>, amount: number, attacker: Mob | null): boolean {
    const p = this.player, F = p.cam.F;
    const e = this.eyePos;
    const d = this.tmpMax;
    for (let k = 0; k < 4; k++) d[k] = from[k]! - e[k]!;
    if (!shieldCovers(d, F, p.cam.H, p.up)) return false;
    // Blocked: the shield wears, attackers are pushed back.
    const slot = this.held && IREG.def(this.held.id).use === 'shield' ? this.hotbarIndex : OFFHAND;
    const sh = this.inv.get(slot);
    if (sh && this.player.mode === 'survival') {
      const ub = enchLevel(sh, 'unbreaking');
      if (amount >= 3 && (ub === 0 || Math.random() < 1 / (ub + 1))) sh.damage += 1 + Math.floor(amount);
      if (sh.damage >= IREG.durability[sh.id]!) {
        this.inv.set(slot, null);
        this.blocking = false;
        this.message?.('Shield broke');
      } else this.inv.set(slot, sh);
    }
    if (attacker) {
      attacker.hurt = 0;
      this.mobs.damage(attacker, 0, p.pos, undefined, undefined, false, 0.6);
    }
    this.particles.burst(e[0]! + F[0]! * 0.6, e[1]! - 0.3, e[2]! + F[2]! * 0.6, e[3]! + F[3]! * 0.6, p.cam, 'spark', '#d8d8e0', 8, 2, 0.2, true);
    this.vitals.hurtCooldown = 0.4;
    return true;
  }

  /** The Anchor Charm (in either hand) keeps you in this world once. */
  private tryCharm(): boolean {
    const v = this.vitals;
    for (const i of [this.hotbarIndex, OFFHAND]) {
      const s = this.inv.get(i);
      if (!s || IREG.name(s.id) !== 'anchor_charm') continue;
      this.inv.set(i, null);
      v.dead = false;
      v.deathCause = '';
      v.health = 1;
      this.effects.clear();
      v.absorption = 0;
      this.applyEffect('regeneration', 45, 1);
      this.applyEffect('absorption', 5, 1);
      this.applyEffect('fire_resistance', 40, 0);
      this.applyEffect('anchor', 60, 0);
      const e = this.eyePos;
      this.particles.burst(e[0]!, e[1]! - 0.5, e[2]!, e[3]!, this.player.cam, 'spark', '#f4d03f', 40, 4, 1, true);
      this.particles.burst(e[0]!, e[1]! - 0.5, e[2]!, e[3]!, this.player.cam, 'spark', '#6aff8a', 30, 3, 1, true);
      this.message?.('The Anchor Charm holds you in this world!');
      return true;
    }
    return false;
  }

  /** H: swap the item in your hand with the off hand. */
  swapHands(): void {
    if (this.player.mode === 'spectator') return;
    const a = this.inv.get(this.hotbarIndex), b = this.inv.get(OFFHAND);
    this.inv.set(this.hotbarIndex, b);
    this.inv.set(OFFHAND, a);
    this.using = null;
  }

  /** Per-frame effect upkeep: regeneration, poison, wither, hunger; expiry. */
  private tickEffects(dt: number): void {
    const e = this.effects;
    if (e.size === 0) return;
    const v = this.vitals;
    this.effectTick += dt;
    const ticks = Math.floor(this.effectTick / 0.05);
    this.effectTick -= ticks * 0.05;
    for (let t = 0; t < ticks; t++) {
      for (const a of e.map.values()) {
        const k = Math.round((a.total - a.time) / 0.05);
        if (a.name === 'regeneration' && k % Math.max(1, 50 >> a.amp) === 0) v.heal(1);
        else if (a.name === 'poison' && k % Math.max(1, 25 >> a.amp) === 0 && v.health > 1) this.hurtDirect(1, 'Poisoned', 'magic');
        else if (a.name === 'wither' && k % Math.max(1, 40 >> a.amp) === 0) this.hurtDirect(1, 'Withered away', 'wither');
        else if (a.name === 'hunger') this.hunger.exhaust(0.005 * (a.amp + 1));
      }
    }
    for (const n of e.tick(dt)) if (n === 'absorption') v.absorption = 0;
  }

  /** Falls, lava, damaging blocks, the void, drowning; death and the death screen. */
  private updateVitals(dt: number): void {
    const p = this.player;
    const v = this.vitals;
    const vulnerable = this.loaded && (p.mode === 'survival' || p.mode === 'adventure');
    if (p.lastFall > 0) {
      const fall = p.lastFall;
      p.lastFall = 0;
      // Landing hard on farmland tramples it back to dirt.
      if (fall > 1.2 && p.mode !== 'spectator') {
        const fx = Math.floor(p.pos[0]!), fy = Math.floor(p.pos[1]! - 0.2), fz = Math.floor(p.pos[2]!), fw = Math.floor(p.pos[3]!);
        if (REG.blocks[this.world.getBlock(fx, fy, fz, fw) & 0xfff]?.tags?.includes('farmland') && enchLevel(this.armorPiece(3), 'feather_falling') === 0) this.world.setBlock(fx, fy, fz, fw, REG.id('dirt'));
      }
      if (vulnerable && !p.inWater && !p.onClimbable && p.slow >= 1 && !this.effects.has('slow_falling')) {
        // Jump Boost softens landings by a block per level.
        const dmg = Vitals.fallDamage(fall - this.effects.level('jump_boost'));
        if (dmg > 0) this.hurtPlayer(dmg, null, 'Fell from a high place', 'fall');
      }
    }
    // Water Breathing, or a Reefshell Helmet's 10 s of air after a dive.
    if (this.setBonus('reefshell') && !p.eyeInWater) this.reefAir = 10;
    else if (p.eyeInWater) this.reefAir = Math.max(0, this.reefAir - dt);
    const breathing = this.effects.has('water_breathing') || this.reefAir > 0;
    const drown = v.update(dt, p.eyeInWater, !vulnerable, breathing ? 0 : 1 / (1 + enchLevel(this.armorPiece(0), 'respiration')));
    if (drown > 0) this.hurtPlayer(drown, null, 'Drowned', 'drown');
    const fireproof = this.effects.has('fire_resistance') || this.setBonus('slag');
    this.envDamageTimer -= dt;
    if (this.envDamageTimer <= 0 && vulnerable && !p.frozen) {
      this.envDamageTimer = 0.5;
      if (p.inLava) {
        this.hurtPlayer(4, null, 'Tried to swim in lava', 'lava');
        if (!fireproof) this.burning = Math.max(this.burning, this.burnTime(BURN_LAVA));
      } else {
        const c = this.contactDamage();
        if (c > 0) {
          const fire = FIRE_IDS[c] === 1;
          this.hurtPlayer(REG.damage[c]!, null, fire ? 'Went up in flames' : (REG.blocks[c]!.displayName ?? REG.blocks[c]!.name), fire ? 'fire' : 'contact');
          if (fire && !fireproof) this.burning = Math.max(this.burning, this.burnTime(BURN_FIRE));
        }
      }
      if (p.pos[p.up]! < -32) this.hurtPlayer(4, null, 'Fell out of the world', 'void');
    }
    if (fireproof) this.burning = 0;
    this.updateBurning(dt, vulnerable);
    // Hunger: movement and actions tire you; a full bar heals, an empty one starves.
    v.naturalRegen = false;
    if (vulnerable && !v.dead) {
      let moved = 0;
      for (let k = 0; k < 4; k++) if (k !== p.up) moved += (p.pos[k]! - this.lastPos[k]!) ** 2;
      moved = Math.min(2, Math.sqrt(moved));
      if (p.inWater) this.hunger.exhaust(0.01 * moved);
      else if (p.sprinting) this.hunger.exhaust(0.1 * moved);
      if (this.wasOnGround && !p.onGround && p.vel[p.up]! > 4) this.hunger.exhaust(p.sprinting ? 0.2 : 0.05);
      const diff = DIFFICULTY[this.info.difficulty] ?? 2;
      const h = this.hunger.tick(dt, v.health, MAX_HEALTH, diff);
      if (h > 0) v.heal(h);
      else if (h < 0) this.hurtDirect(1, 'Starved to death', 'starve');
      this.tickEffects(dt);
    } else if (!vulnerable) this.effects.tick(dt);
    for (let k = 0; k < 4; k++) this.lastPos[k] = p.pos[k]!;
    this.wasOnGround = p.onGround;
    if (p.onGround && !p.inWater && !p.inLava && !v.dead && this.loaded) this.lastSafe = [Math.floor(p.pos[0]!), Math.floor(p.pos[1]!), Math.floor(p.pos[2]!), Math.floor(p.pos[3]!)];
    if (v.dead && !this.deathHandled) {
      this.deathHandled = true;
      this.bowDraw = 0;
      this.resetMining();
      const x = Math.floor(p.pos[0]!), y = Math.floor(p.pos[1]! + 0.5), z = Math.floor(p.pos[2]!), w = Math.floor(p.pos[3]!);
      if (this.info.keepInventory && !this.info.hardcore) {
        // Keep inventory: you keep your things and your experience.
        this.message?.('You kept your inventory');
      } else {
        this.leaveGrave(x, y, z, w);
        this.xp.clear();
      }
      this.effects.clear();
      this.using = null;
      this.onDeath?.(v.deathCause);
    }
  }

  /**
   * Death: everything you carried goes into a grave where you fell (or, falling into lava or
   * the void, where you last stood safely), with some of your experience; a pointer on the
   * HUD leads back to it. With no room for a grave, things spill like they used to.
   */
  private leaveGrave(x: number, y: number, z: number, w: number): void {
    const slots = this.inv.save().map((st, i) => {
      const s = this.inv.get(i);
      return s && enchLevel(s, 'curse_of_vanishing') > 0 ? null : st; // gone with the curse
    });
    const xp = this.xp.deathDrop();
    const spot = this.graveSpot(x, y, z, w) ?? (this.lastSafe ? this.graveSpot(...this.lastSafe) : null);
    this.inv.clear();
    if (!spot) {
      for (const st of slots) {
        const s = loadStack(st);
        if (s) this.dropAtCell(x, y, z, w, s);
      }
      if (xp > 0) this.orbs.spawn(x + 0.5, y + 0.5, z + 0.5, w + 0.5, xp);
      return;
    }
    this.blockEntities.placeGrave(spot[0], spot[1], spot[2], spot[3], slots, xp);
    this.graves.push({ realm: this.world.realm.name, pos: spot });
    while (this.graves.length > MAX_GRAVES) this.graves.shift();
    this.message?.(`Your things are in a grave at ${spot[0]}, ${spot[1]}, ${spot[2]}, ${spot[3]}`);
  }

  /** A free cell on solid ground near (x, y, z, w) for a grave, or null. */
  private graveSpot(x: number, y: number, z: number, w: number): [number, number, number, number] | null {
    let best: [number, number, number, number] | null = null, bd = 1e9;
    for (let dw = -4; dw <= 4; dw++)
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++)
          for (let dy = -3; dy <= 3; dy++) {
            const d = dx * dx + dz * dz + dw * dw + dy * dy * 2;
            if (d >= bd) continue;
            const cur = this.world.getBlock(x + dx, y + dy, z + dz, w + dw);
            if (cur === VOID_VOXEL) continue;
            const id = cur & 0xfff;
            if ((id !== 0 && !REG.replaceable[id]) || REG.fluid[id] !== 0) continue;
            const below = this.world.getBlock(x + dx, y + dy - 1, z + dz, w + dw);
            if (below === VOID_VOXEL || !REG.solid[below & 0xfff] || REG.fluid[below & 0xfff] !== 0) continue;
            bd = d;
            best = [x + dx, y + dy, z + dz, w + dw];
          }
    return best;
  }

  /** Use a grave: everything goes back to its slots (what no longer fits drops), and the grave goes. */
  private openGrave(x: number, y: number, z: number, w: number): void {
    const g = this.blockEntities.takeGrave(x, y, z, w);
    this.world.setBlock(x, y, z, w, 0);
    const i = this.graves.findIndex((q) => q.realm === this.world.realm.name && q.pos[0] === x && q.pos[1] === y && q.pos[2] === z && q.pos[3] === w);
    if (i >= 0) this.graves.splice(i, 1);
    if (!g) return;
    let spilled = 0;
    g.slots.forEach((st, slot) => {
      const s = loadStack(st);
      if (!s) return;
      if (!this.inv.get(slot) && (!this.inv.accepts || this.inv.accepts(slot, s))) this.inv.set(slot, s);
      else if (this.inv.add(s) > 0) {
        this.throwStack(s);
        spilled++;
      }
    });
    const p = this.player.pos;
    if (g.xp > 0) this.orbs.spawn(p[0]!, p[1]! + 0.9, p[2]!, p[3]!, g.xp);
    this.message?.(spilled ? 'You took your things back (some did not fit)' : 'You took your things back');
  }

  /** HUD: which way and how far your nearest grave is, or null. */
  graveHint(): string | null {
    const e = this.eyePos, cam = this.player.cam;
    let best: [number, number, number, number] | null = null, bd = 1e18;
    for (const g of this.graves) {
      if (g.realm !== this.world.realm.name) continue;
      let d2 = 0;
      for (let k = 0; k < 4; k++) d2 += (g.pos[k]! + 0.5 - e[k]!) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = g.pos;
      }
    }
    if (!best) return null;
    let df = 0, dr = 0, dh = 0;
    for (let k = 0; k < 4; k++) {
      const dk = best[k]! + 0.5 - e[k]!;
      df += dk * cam.F[k]!;
      dr += dk * cam.R[k]!;
      dh += dk * cam.H[k]!;
    }
    const up = this.player.up;
    const dy = best[up]! + 0.5 - e[up]!;
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const a = Math.atan2(dr, df); // 0 straight ahead, positive to the right
    const arrow = Math.hypot(df, dr) < 1.5 ? '•' : arrows[(Math.round(a / (Math.PI / 4)) + 8) % 8]!;
    const parts = [`✝ Grave ${Math.round(Math.sqrt(bd))} m ${arrow}`];
    if (Math.abs(dh) >= 0.6) parts.push(`${Math.round(Math.abs(dh))} ${dh > 0 ? 'ana' : 'kata'}`);
    if (Math.abs(dy) >= 3) parts.push(`${Math.round(Math.abs(dy))} ${dy > 0 ? 'up' : 'down'}`);
    return parts.join(' · ');
  }

  /** Flames on burning mobs, smoke over fires near the player. */
  private burnEffects(dt: number): void {
    this.flameT -= dt;
    if (this.flameT > 0) return;
    this.flameT = 0.08;
    const p = this.player.pos, cam = this.player.cam;
    for (const m of this.mobs.list) {
      if (m.burning <= 0) continue;
      if (Math.abs(m.pos[0]! - p[0]!) > 32 || Math.abs(m.pos[2]! - p[2]!) > 32 || Math.abs(m.pos[3]! - p[3]!) > 32) continue;
      const r = m.width * 0.5;
      this.particles.burst(m.pos[0]! + (Math.random() - 0.5) * r * 2, m.pos[1]! + Math.random() * m.height, m.pos[2]! + (Math.random() - 0.5) * r * 2, m.pos[3]!, cam, 'flame', Math.random() < 0.5 ? '#ff7a1a' : '#ffc040', 2, 0.4, 0.05, true);
    }
    // Wisps of smoke and sparks over the fires near you (not in your face).
    let n = 0;
    for (const f of this.fire.cells()) {
      if (n >= 24) break;
      const d = Math.max(Math.abs(f.x + 0.5 - p[0]!), Math.abs(f.z + 0.5 - p[2]!), Math.abs(f.w + 0.5 - p[3]!));
      if (d > 24 || d < 2 || Math.random() < 0.6) continue;
      n++;
      if (Math.random() < 0.5) this.particles.burst(f.x + 0.5, f.y + 1, f.z + 0.5, f.w + 0.5, cam, 'poof', '#7a7470', 1, 0.15, 0.2, false);
      else this.particles.burst(f.x + 0.5, f.y + 0.5, f.z + 0.5, f.w + 0.5, cam, 'flame', '#ffb040', 1, 0.3, 0.3, true);
    }
  }

  /** Burning: 1 damage a second until it runs out; water and rain put it out. */
  private updateBurning(dt: number, vulnerable: boolean): void {
    const p = this.player;
    if (this.burning > 0) {
      const head = Math.floor(p.pos[1]! + p.height);
      if (!vulnerable || p.inWater || this.rainingAt(Math.floor(p.pos[0]!), head, Math.floor(p.pos[2]!), Math.floor(p.pos[3]!))) this.burning = 0;
    }
    if (this.burning <= 0) {
      this.burnTick = 0;
      return;
    }
    this.burning = Math.max(0, this.burning - dt);
    this.burnTick += dt;
    if (this.burnTick >= 1) {
      this.burnTick -= 1;
      if (!p.inLava) this.hurtPlayer(1, null, 'Burned to death', 'burn');
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

  /** The Surface respawn point from any realm (your bed, else the Surface's spawn point). */
  surfaceRespawnPoint(): number[] {
    if (this.world.realm.name === 'surface') return this.respawnPoint();
    if (this.bed) return this.respawnPoint();
    this.surfaceSpawn ??= createGenerator(this.seed, REG.realm('surface'), this.genOptions).spawnPoint();
    return [...this.surfaceSpawn];
  }
  private surfaceSpawn: [number, number, number, number] | null = null;

  /** Where you come back after dying: on your bed if you slept in one, else the world spawn. */
  respawnPoint(): number[] {
    const b = this.bed;
    return b ? [b[0] + 0.5, b[1] + 0.6, b[2] + 0.5, b[3] + 0.5] : [...this.spawn];
  }

  /** Back to the spawn point with full health (hardcore worlds turn into spectator mode). */
  respawn(): void {
    const p = this.player;
    this.hunger.reset();
    this.effects.clear();
    this.reefAir = 0;
    if (this.world.realm.name !== 'surface' && !this.info.hardcore) {
      // Like Minecraft: dying in another realm sends you back to your bed / spawn on the Surface.
      this.vitals.respawn();
      this.deathHandled = false;
      this.beginTravel('surface', this.surfaceRespawnPoint(), { kind: 'respawn' });
      return;
    }
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
            // TNT in the blast lights with a short fuse (chain reactions).
            if (id === this.tntId) {
              this.primeTnt(bx, by, bz, bw, 0.5 + Math.random());
              continue;
            }
            if (id === this.tntLitId) continue;
            const hard = REG.hardness[id]!;
            if (hard < 0 || hard >= 30 || REG.fluid[id] !== 0 || this.blockEntities.isGrave(id)) continue;
            if (this.voidBoss.protects(bx, by, bz, bw, id)) continue;
            if (!this.world.setBlock(bx, by, bz, bw, 0)) continue;
            if (BED_IDS[id] || DOOR_PART[id]) this.removePartner(bx, by, bz, bw, v);
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
    // Damage falls off over twice the radius (a gentler curve than Minecraft's); armour helps.
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
      this.hurtPlayer(Math.round(((impact * impact + impact) / 2) * 3.5 * reach * mult + 1), center, 'Blown up', 'explosion');
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
    const wet = this.player.eyeInWater && enchLevel(this.armorPiece(0), 'aqua_affinity') === 0;
    this.mineSeconds = this.arenaLocked(t.x, t.y, t.z, t.w, voxelId(t.voxel), false) ? Infinity : breakInfo(voxelId(t.voxel), heldId, this.player.onGround || this.player.flying, wet, enchLevel(held, 'efficiency')).seconds;
    const haste = this.effects.amp('haste'), fatigue = this.effects.amp('mining_fatigue');
    if (haste >= 0) this.mineSeconds /= 1 + 0.2 * (haste + 1);
    if (fatigue >= 0) this.mineSeconds /= Math.pow(0.3, Math.min(4, fatigue + 1));
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

  /**
   * The Void Sovereign's arena: while it lives nothing in it may be broken or built (except its
   * pylons), so there is no pillaring up or tunnelling under it. Creative players are exempt.
   * Says why, at most every few seconds.
   */
  private arenaLocked(x: number, y: number, z: number, w: number, id: number, speak = true): boolean {
    if (this.world.realm.name !== 'void' || this.player.mode === 'creative' || this.player.mode === 'spectator') return false;
    if (!this.voidBoss.protects(x, y, z, w, id)) return false;
    const now = performance.now() / 1000;
    if (speak && now - this.arenaMsgAt > 3) {
      this.arenaMsgAt = now;
      this.message?.('The arena stone will not yield while the Void Sovereign lives · only its pylons break');
    }
    return true;
  }
  private arenaMsgAt = -99;

  /** Break the targeted block as a survival player: drops, tool wear. */
  harvestTarget(): boolean {
    if (!this.hasTarget) return false;
    const t = this.target;
    const id = voxelId(t.voxel);
    if (this.arenaLocked(t.x, t.y, t.z, t.w, id)) return false;
    const held = this.held;
    const heldId = held ? held.id : -1;
    const drops = rollDrops(id, heldId, Math.random, enchLevel(held, 'silk_touch') > 0, enchLevel(held, 'fortune'));
    if (!this.world.setBlock(t.x, t.y, t.z, t.w, 0)) return false;
    this.removePartner(t.x, t.y, t.z, t.w, t.voxel);
    for (const d of drops) this.dropAtCell(t.x, t.y, t.z, t.w, d);
    this.mobs.noise([t.x + 0.5, t.y + 0.5, t.z + 0.5, t.w + 0.5]); // Lurkers hear mining
    this.hunger.exhaust(0.005);
    // Ores give experience (not when the block itself drops: Silk Touch).
    const xr = IREG.mineXp[id];
    if (xr && drops.length && !drops.some((d) => IREG.itemBlock[d.id] === id)) {
      const n = xr[0] + Math.floor(Math.random() * (xr[1] - xr[0] + 1));
      if (n > 0) this.orbs.spawn(t.x + 0.5, t.y + 0.5, t.z + 0.5, t.w + 0.5, n);
    }
    this.wearHeld(wearFor(id, heldId));
    if (held && IREG.tags[held.id]!.has('ana_pick')) this.anaSheet(t.x, t.y, t.z, t.w, id, true);
    return true;
  }

  /**
   * Ana Pick: also break the 3x3 sheet around a broken block in the plane of up and the
   * hidden axis (the slices next to yours), what the pick can harvest and no harder than it.
   */
  private anaSheet(x: number, y: number, z: number, w: number, centre: number, drops: boolean): void {
    const held = this.held;
    if (!held) return;
    const hard = REG.hardness[centre]!;
    for (const c of anaSheetCells(x, y, z, w, this.player.cam.H, this.player.up)) {
      const v = this.world.getBlock(c[0], c[1], c[2], c[3]);
      if (v === 0 || v === VOID_VOXEL) continue;
      const id = voxelId(v);
      const h = REG.hardness[id]!;
      if (h < 0 || h > hard + 1.5 || REG.fluid[id] !== 0 || BED_IDS[id] || DOOR_PART[id] || this.voidBoss.protects(c[0], c[1], c[2], c[3], id)) continue;
      if (drops && !canHarvest(id, held.id)) continue;
      const out = drops ? rollDrops(id, held.id, Math.random, enchLevel(held, 'silk_touch') > 0, enchLevel(held, 'fortune')) : [];
      if (!this.world.setBlock(c[0], c[1], c[2], c[3], 0)) continue;
      for (const d of out) this.dropAtCell(c[0], c[1], c[2], c[3], d);
      if (drops) {
        this.wearHeld(1);
        if (!this.held) return; // broke
      }
    }
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
    const out: ItemStack = withCount(held, n);
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

  // ------------------------------------------------------------------ stations (Phase 7)

  /** Bookshelves around an enchanting table. */
  shelvesAt(pos: ArrayLike<number>): number {
    return countBookshelves(this.world, pos[0]!, pos[1]!, pos[2]!, pos[3]!);
  }

  enchantOffersFor(item: ItemStack | null, pos: ArrayLike<number>): (EnchantOffer | null)[] {
    return enchantOffers(item, this.shelvesAt(pos), this.enchSeed);
  }

  /** Can the player pay `levels` (creative always can)? */
  canPayLevels(levels: number): boolean {
    return this.player.mode === 'creative' || this.xp.level >= levels;
  }

  /**
   * Enchant the item in `work` slot 0 with offer `i`, paying azurite from slot 1 and
   * experience levels. Returns true on success.
   */
  enchantWith(work: Container, i: number, pos: ArrayLike<number>): boolean {
    const item = work.get(0);
    const offer = this.enchantOffersFor(item, pos)[i];
    if (!item || !offer) return false;
    const creative = this.player.mode === 'creative';
    const az = work.get(1);
    if (!creative && (this.xp.level < offer.level || !az || IREG.name(az.id) !== 'azurite' || az.count < offer.cost)) return false;
    work.set(0, applyOffer(item, offer));
    if (!creative) {
      az!.count -= offer.cost;
      work.set(1, az!.count > 0 ? az! : null);
      this.xp.spendLevels(offer.cost);
    }
    this.enchSeed = (Math.random() * 0x7fffffff) | 0;
    this.particles.burst(pos[0]! + 0.5, pos[1]! + 1.2, pos[2]! + 0.5, pos[3]! + 0.5, this.player.cam, 'spark', '#c8a0ff', 24, 2, 0.6, true);
    return true;
  }

  /** Pay for an anvil job (false: not enough levels, or too expensive in survival). */
  payAnvil(cost: number): boolean {
    if (this.player.mode === 'creative') return true;
    if (cost >= 40 || this.xp.level < cost) return false;
    return this.xp.spendLevels(cost);
  }

  /** Experience back from a grindstone. */
  grindXp(points: number): void {
    const p = this.player.pos;
    if (points > 0) this.orbs.spawn(p[0]!, p[1]! + 0.9, p[2]!, p[3]!, points);
  }

  // ------------------------------------------------------------------ farming (Phase 7)

  /** Where the held seed would be planted (on top of the targeted block), or null. */
  private plantTarget(st: ItemStack): [number, number, number, number, number] | null {
    if (!this.hasTarget || this.targetMob) return null;
    const t = this.target;
    if (t.axis !== 1 || t.sign < 0) return null; // the top face
    const below = voxelId(t.voxel);
    const plant = this.farming.plantFor(st.id, below);
    if (plant < 0 || this.world.getBlock(t.x, t.y + 1, t.z, t.w) !== 0) return null;
    return [t.x, t.y + 1, t.z, t.w, plant];
  }

  private pickBerries(): boolean {
    const t = this.target;
    const name = REG.blocks[voxelId(t.voxel)]!.name;
    const bush = BUSHES.find((b) => b.mature === name);
    if (!bush || this.player.mode === 'spectator') return false;
    this.world.setBlock(t.x, t.y, t.z, t.w, REG.id(bush.young));
    this.dropAtCell(t.x, t.y, t.z, t.w, { id: IREG.id(bush.berry), count: 2 + Math.floor(Math.random() * 2), damage: 0 });
    return true;
  }

  /** Hoes till, seeds plant, bone meal grows. Returns true if the click was used. */
  private farmUse(held: ItemStack): boolean {
    const t = this.target;
    const survival = this.player.mode === 'survival';
    const tid = voxelId(t.voxel);
    // Hoe: grassy and dirt blocks with air above become farmland.
    if (IREG.toolKind[held.id] === HOE_KIND) {
      if (!this.farming.isSoil(tid) || REG.blocks[tid]!.tags?.includes('farmland') || t.sign < 0 && t.axis === 1) return false;
      if (this.world.getBlock(t.x, t.y + 1, t.z, t.w) !== 0) return false;
      this.world.setBlock(t.x, t.y, t.z, t.w, REG.id('farmland'));
      this.particles.burst(t.x + 0.5, t.y + 1, t.z + 0.5, t.w + 0.5, this.player.cam, 'poof', '#6b4a2e', 6, 1, 0.4);
      this.wearHeld(1);
      return true;
    }
    if (PLANTS[IREG.name(held.id)]) {
      const at = this.plantTarget(held);
      if (!at) return IREG.def(held.id).use === 'seeds';
      this.world.setBlock(at[0], at[1], at[2], at[3], at[4]);
      if (survival) {
        held.count--;
        this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      }
      return true;
    }
    if (IREG.def(held.id).use === 'bone_meal') {
      const plants = this.bonemealPlants();
      if (!this.farming.boneMeal(t.x, t.y, t.z, t.w, plants)) return true;
      this.particles.burst(t.x + 0.5, t.y + 0.8, t.z + 0.5, t.w + 0.5, this.player.cam, 'spark', '#8aff6a', 10, 1.2, 0.5, true);
      if (survival) {
        held.count--;
        this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      }
      return true;
    }
    return false;
  }

  /** What bone meal sprouts on grass: the biome's own plants, else tall grass and poppies. */
  private bonemealPlants(): number[] {
    const e = this.eyePos;
    const bi = this.world.biomeAt(Math.floor(e[0]!), Math.floor(e[2]!), Math.floor(e[3]!));
    const b = bi >= 0 ? REG.biomes[bi] : null;
    const list = (b?.plants ?? []).filter((p) => (p.placement ?? 'surface') === 'surface').map((p) => REG.id(p.block));
    return list.length ? list : [REG.id('tall_grass'), REG.id('poppy')];
  }

  /** A thrown potion or bottle o' enchanting burst at `pos`. */
  burstAt(item: number, pos: ArrayLike<number>): void {
    const name = IREG.name(item);
    const [x, y, z, w] = [pos[0]!, pos[1]!, pos[2]!, pos[3]!];
    if (name === 'xp_bottle') {
      this.particles.burst(x, y, z, w, this.player.cam, 'spark', '#a8ff4a', 14, 2, 0.4, true);
      this.orbs.spawn(x, y + 0.3, z, w, 3 + Math.floor(Math.random() * 9));
      return;
    }
    if (name === 'egg') {
      // An egg hatches a chick now and then (Minecraft: 1 in 8, sometimes four).
      this.particles.burst(x, y, z, w, this.player.cam, 'poof', '#f0e4c8', 6, 1, 0.2);
      if (Math.random() < 1 / 8) {
        const n = Math.random() < 1 / 32 ? 4 : 1;
        for (let k = 0; k < n; k++) this.mobs.spawnBaby('hyperchicken', x, y + 0.2, z, w);
      }
      return;
    }
    const color = IREG.def(item).icon?.colors[0] ?? '#3f76e4';
    this.particles.burst(x, y, z, w, this.player.cam, 'poof', color, 24, 2.5, 0.8);
    this.particles.burst(x, y, z, w, this.player.cam, 'spark', color, 12, 3, 0.4, true);
    const eff = potionEffect(name);
    // Everything within 4 blocks (in 4D) is splashed, less the further it is.
    const p = this.player;
    const dp = Math.hypot(p.pos[0]! - x, p.pos[1]! + 0.9 - y, p.pos[2]! - z, p.pos[3]! - w);
    if (dp < 4) {
      const k = 1 - dp / 4;
      if (!eff) this.burning = 0; // plain water puts you out
      else if (EFFECT_BY_NAME.get(eff[0])?.instant) this.applyEffect(eff[0], 0, k > 0.5 ? eff[2] : Math.max(0, eff[2] - 1));
      else if (eff[1] * k >= 1) this.applyEffect(eff[0], eff[1] * k, eff[2]);
    }
    for (const m of [...this.mobs.list]) {
      const dm = Math.hypot(m.pos[0]! - x, m.pos[1]! + m.height * 0.5 - y, m.pos[2]! - z, m.pos[3]! - w);
      if (dm >= 4) continue;
      const k = 1 - dm / 4;
      if (!eff) {
        m.burning = 0;
        continue;
      }
      m.playerHit = Math.max(m.playerHit, 3);
      if (EFFECT_BY_NAME.get(eff[0])?.instant) this.mobs.applyEffect(m, eff[0], 0, k > 0.5 ? eff[2] : Math.max(0, eff[2] - 1));
      else if (eff[1] * k >= 1) this.mobs.applyEffect(m, eff[0], eff[1] * k, eff[2]);
    }
  }

  // ------------------------------------------------------------------ eating and drinking

  /** Can this be eaten or drunk right now (hold use)? */
  private consumable(st: ItemStack): boolean {
    const f = IREG.food[st.id];
    if (!f) return false;
    // Carrots, potatoes and berries plant when aimed at somewhere they grow.
    if (PLANTS[IREG.name(st.id)] && this.plantTarget(st) !== null) return false;
    if (f.always) return true;
    return this.player.mode === 'creative' || this.hunger.hungry;
  }

  /** One frame of holding use on food: crumbs, then the meal. */
  private useStep(dt: number, st: ItemStack, slot = this.hotbarIndex): void {
    const f = IREG.food[st.id]!;
    if (!this.using || this.using.slot !== slot || this.using.item !== st.id) this.using = { item: st.id, slot, t: 0, need: f.seconds ?? 1.6 };
    const u = this.using;
    const before = Math.floor(u.t / 0.25);
    u.t += dt;
    if (Math.floor(u.t / 0.25) !== before) {
      const e = this.eyePos, fw = this.player.cam.fwd;
      const col = IREG.def(st.id).icon?.colors[0] ?? '#c8a060';
      this.particles.burst(e[0]! + fw[0]! * 0.5, e[1]! - 0.3, e[2]! + fw[2]! * 0.5, e[3]! + fw[3]! * 0.5, this.player.cam, 'poof', col, 3, 0.8, 0.1);
    }
    if (u.t >= u.need) {
      this.using = null;
      this.consume(slot);
    }
  }

  /** Finish eating / drinking the stack in a hotbar slot. */
  private consume(slot: number): void {
    const st = this.inv.get(slot);
    if (!st) return;
    const f = IREG.food[st.id];
    if (!f) return;
    this.hunger.eat(f.nutrition, f.saturation);
    if (f.clears) {
      this.effects.clear();
      this.vitals.absorption = 0;
      this.burning = 0;
    }
    for (const [name, secs, amp, chance] of f.effects ?? []) if (Math.random() < chance) this.applyEffect(name, secs, amp);
    if (IREG.name(st.id) === 'whisper_fruit') this.whisperTeleport();
    if (this.player.mode === 'creative') return;
    st.count--;
    const rem = f.remainder ? { id: IREG.id(f.remainder), count: 1, damage: 0 } : null;
    if (st.count <= 0) this.inv.set(slot, rem);
    else {
      this.inv.set(slot, st);
      if (rem && this.inv.add(rem) > 0) this.throwStack(rem);
    }
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
      if (name.includes('fence') && this.tieToFence(t.x, t.y, t.z, t.w)) return;
      const station = STATION_SCREENS[name];
      if (station) {
        this.onOpenScreen?.({ kind: station, pos });
        return;
      }
      if (isBed(t.voxel)) {
        this.useBed(t.x, t.y, t.z, t.w);
        return;
      }
      if (isDoor(t.voxel)) {
        this.toggleDoor(t.x, t.y, t.z, t.w);
        return;
      }
      if (this.blockEntities.isGrave(tid)) {
        this.openGrave(t.x, t.y, t.z, t.w);
        return;
      }
      if (this.blockEntities.hasEntity(tid)) {
        // Opening a chest in the Void's vaults wakes the sentinels guarding it.
        if (this.world.realm.islandSpawns && this.mobs.wakeNear(t.x, t.y, t.z, t.w, 16) > 0) this.message?.('The sentinels stir…');
        const fk = this.blockEntities.furnaceKind(tid);
        this.onOpenScreen?.(fk ? { kind: 'furnace', pos, furnace: fk } : this.blockEntities.isBrewing(tid) ? { kind: 'brewing', pos } : { kind: 'chest', pos });
        return;
      }
    }
    // Ripe berry bushes: pick the berries (the bush stays).
    if (this.hasTarget && this.pickBerries()) return;
    if (!held) {
      this.useOffhand();
      return;
    }
    const def = IREG.def(held.id);
    if (this.hasTarget && this.stripLog(held)) return;
    if (this.hasTarget && this.farmUse(held)) return;
    const armorSlot = IREG.armorSlot[held.id]!;
    if (armorSlot >= 0) {
      // Put it on (swapping with what was worn there).
      const i = ARMOR_START + armorSlot;
      const worn = this.inv.get(i);
      this.inv.set(i, held);
      this.inv.set(this.hotbarIndex, worn);
      this.message?.(`Equipped ${IREG.displayName(held.id)}`);
      return;
    }
    if (def.use) {
      this.useItem(held, def.use);
      return;
    }
    const bid = IREG.itemBlock[held.id]!;
    if (bid < 0) {
      this.useOffhand();
      return;
    }
    if (this.placeAtTarget(bid) && this.player.mode === 'survival') {
      held.count--;
      this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
    }
  }

  /**
   * The main hand has nothing of its own to do on a right click (empty, a weapon or tool,
   * a plain material), so the off hand acts: raise its shield, eat its food, place its block.
   */
  private mainIdle(st: ItemStack | null): boolean {
    if (!st) return true;
    const id = st.id;
    if (IREG.toolKind[id] === HOE_KIND) return false;
    if (IREG.toolKind[id]! > 0) return true;
    return IREG.itemBlock[id]! < 0 && !IREG.def(id).use && !IREG.food[id] && IREG.armorSlot[id]! < 0 && !PLANTS[IREG.name(id)];
  }

  /** Nothing to do with the main hand: place the off-hand block (torches...). */
  private useOffhand(): void {
    const off = this.inv.get(OFFHAND);
    if (!off) return;
    const bid = IREG.itemBlock[off.id]!;
    if (bid < 0 || !this.placeAtTarget(bid) || this.player.mode !== 'survival') return;
    off.count--;
    this.inv.set(OFFHAND, off.count > 0 ? off : null);
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
    if (use === 'sleeping_bag') {
      this.useSleepingBag(held);
      return;
    }
    if (use === 'void_eye') {
      this.useVoidEye(held);
      return;
    }
    if (use === 'starlight_rocket') {
      const p = this.player;
      if (!p.gliding) {
        this.message?.('Launch a rocket while gliding');
        return;
      }
      p.rocket = ROCKET_TIME;
      const e = this.eyePos, f = p.cam.fwd;
      this.particles.burst(e[0]! - f[0]! * 0.5, e[1]! - 0.4, e[2]! - f[2]! * 0.5, e[3]! - f[3]! * 0.5, p.cam, 'spark', '#9affc8', 18, 3, 0.6, true);
      if (survival) {
        held.count--;
        this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      }
      return;
    }
    if (use === 'fishing') {
      this.castOrReel(held);
      return;
    }
    if (use === 'water_bucket' && this.world.realm.waterEvaporates) {
      if (!this.hasTarget) return;
      const t = this.target;
      this.particles.burst(t.x + 0.5, t.y + 1.2, t.z + 0.5, t.w + 0.5, this.player.cam, 'smoke', '#e8e8f0', 16, 1.5, 0.7, false);
      this.message?.('The water boils away');
      if (survival) this.inv.set(this.hotbarIndex, { id: IREG.id('bucket'), count: 1, damage: 0 });
      return;
    }
    if (use === 'water_bucket' || use === 'lava_bucket') {
      if (!this.hasTarget) return;
      const placed = this.placeAtTarget(use === 'water_bucket' ? REG.id('water') : REG.id('lava'));
      if (placed && survival) this.inv.set(this.hotbarIndex, { id: IREG.id('bucket'), count: 1, damage: 0 });
      return;
    }
    if (use === 'glass_bottle') {
      // Fill from water (the source stays, like Minecraft's).
      const hit = this.fluidHit;
      if (!raycast(this.world, this.eyePos, this.pickDir, reach, hit, true) || REG.fluid[voxelId(hit.voxel)] !== FLUID_WATER) return;
      const water: ItemStack = { id: IREG.id('potion_water'), count: 1, damage: 0 };
      if (!survival) {
        if (this.inv.add(water) > 0) this.throwStack(water);
        return;
      }
      held.count--;
      this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      if (held.count <= 0) this.inv.set(this.hotbarIndex, water);
      else if (this.inv.add(water) > 0) this.throwStack(water);
      return;
    }
    if (use === 'splash_potion' || use === 'xp_bottle' || use === 'throw') {
      // Throw it: it bursts where it lands.
      const p = this.player, e = this.eyePos, f = p.cam.fwd;
      const from = this.tmp4;
      for (let k = 0; k < 4; k++) from[k] = e[k]! + f[k]! * 0.4;
      const v = this.tmpMin;
      for (let k = 0; k < 4; k++) v[k] = f[k]! * 13;
      v[p.up] = v[p.up]! + 3;
      this.projectiles.spawn(from, v, 0, held.id, true, { burst: true });
      if (survival) {
        held.count--;
        this.inv.set(this.hotbarIndex, held.count > 0 ? held : null);
      }
      return;
    }
    if (use === 'dagger' || use === 'chakram') {
      this.throwWeapon(held, use);
      return;
    }
    if (use === 'w_anchor') {
      this.useAnchor(held);
      return;
    }
    if (use === 'slicer_compass') {
      // Snap the slice axis-aligned (the Slicer Compass's job; C does the same).
      this.snapping = true;
      return;
    }
    if (use === 'flint_and_steel') {
      if (!this.ignite() || !survival) return;
      if (IREG.name(held.id) === 'fire_charge') held.count--;
      else held.damage++;
      const gone = held.count <= 0 || held.damage >= (IREG.durability[held.id] || Infinity);
      this.inv.set(this.hotbarIndex, gone ? null : held);
    }
  }

  /** Middle click: select (or, in creative, create) the targeted block's item in the hotbar. */
  private pickBlock(): void {
    const tid = voxelId(this.target.voxel);
    const item = IREG.blockItem[BED_IDS[tid] === 2 ? BED_OTHER[tid]! : DOOR_PART[tid] === 2 ? DOOR_OTHER[tid]! : tid]!;
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
    if (this.arenaLocked(t.x, t.y, t.z, t.w, id)) return false;
    if (!this.world.setBlock(t.x, t.y, t.z, t.w, 0)) return false;
    this.removePartner(t.x, t.y, t.z, t.w, t.voxel);
    const held = this.held;
    if (held && IREG.tags[held.id]!.has('ana_pick')) this.anaSheet(t.x, t.y, t.z, t.w, id, false);
    return true;
  }

  /**
   * The other half of the bed at (x, y, z, w) whose voxel is `v` (same facing, other part),
   * or null if it is missing.
   */
  bedPartner(x: number, y: number, z: number, w: number, v: number): [number, number, number, number] | null {
    const id = voxelId(v);
    const part = BED_IDS[id]!;
    if (!part || v === VOID_VOXEL) return null;
    const m = voxelMeta(v) % 6;
    const p: [number, number, number, number] = [x, y, z, w];
    p[FACING_AXES[m]!] += part === 1 ? FACING_SIGNS[m]! : -FACING_SIGNS[m]!;
    const pv = this.world.getBlock(p[0], p[1], p[2], p[3]);
    return pv !== VOID_VOXEL && voxelId(pv) === BED_OTHER[id] && voxelMeta(pv) % 6 === m ? p : null;
  }

  /** A bed or door half was removed: remove the other half too (the removed half made the drop). */
  private removePartner(x: number, y: number, z: number, w: number, v: number): void {
    const p = this.bedPartner(x, y, z, w, v) ?? doorPartner(this.world, x, y, z, w, v);
    if (p) this.world.setBlock(p[0], p[1], p[2], p[3], 0);
  }

  /** Open or close the door at (x, y, z, w) (both halves). Not onto the player standing in it. */
  toggleDoor(x: number, y: number, z: number, w: number): boolean {
    const v = this.world.getBlock(x, y, z, w);
    if (!isDoor(v)) return false;
    const nv = toggledDoor(v);
    const p = doorPartner(this.world, x, y, z, w, v);
    if (this.player.mode !== 'spectator' && (this.shapeHitsPlayer(x, y, z, w, nv) || (p && this.shapeHitsPlayer(p[0], p[1], p[2], p[3], nv)))) return false;
    this.world.setBlock(x, y, z, w, nv);
    if (p) this.world.setBlock(p[0], p[1], p[2], p[3], makeVoxel(DOOR_OTHER[voxelId(v)]!, voxelMeta(nv)));
    return true;
  }

  /** Would voxel `v` placed at (x, y, z, w) overlap the player's body? */
  private shapeHitsPlayer(x: number, y: number, z: number, w: number, v: number): boolean {
    const pl = this.player;
    const up = pl.up;
    const sh = REG.shapes[REG.shapeIndex(v)]!;
    const c = [x, y, z, w];
    for (let b = 0; b < sh.boxCount; b++) {
      let hit = true;
      for (let i = 0; i < 4 && hit; i++) {
        const lo = i === up ? pl.pos[i]! : pl.pos[i]! - 0.3;
        const hi = i === up ? pl.pos[i]! + pl.height : pl.pos[i]! + 0.3;
        if (hi <= c[i]! + sh.boxes[b * 8 + i]! + 1e-3 || lo >= c[i]! + sh.boxes[b * 8 + 4 + i]! - 1e-3) hit = false;
      }
      if (hit) return true;
    }
    return false;
  }

  /** An axe used on a log strips off its bark (a stripped log, same orientation). */
  private stripLog(held: ItemStack): boolean {
    if (IREG.toolKind[held.id] !== AXE_KIND) return false;
    const t = this.target;
    const to = STRIP_ID[voxelId(t.voxel)]!;
    if (to < 0) return false;
    if (!this.world.setBlock(t.x, t.y, t.z, t.w, makeVoxel(to, voxelMeta(t.voxel)))) return false;
    this.particles.burst(t.p[0]!, t.p[1]!, t.p[2]!, t.p[3]!, this.player.cam, 'poof', '#b08a5a', 6, 1.2, 0.2);
    this.wearHeld(1);
    return true;
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
    if (this.arenaLocked(x, y, z, w, voxelId(cur))) return false;
    const id = voxelId(voxelOrId);
    let meta = (voxelOrId >>> 12) & 15;
    const mode = REG.variantMode[id]!;
    if (mode === VARIANT_VERTICAL2) {
      // Top slab if placed on the upper half of a side face or under a ceiling.
      const fy = t.p[1]! - Math.floor(t.p[1]!);
      meta = t.axis === 1 ? (t.sign < 0 ? 1 : 0) : fy > 0.5 ? 1 : 0;
    } else if (mode === VARIANT_HORIZONTAL6 || mode === VARIANT_DOOR) {
      if (REG.climbable[id] && t.axis !== 1) {
        // Ladders hug the face we clicked: facing toward the clicked block.
        meta = facingIndex(t.axis, -t.sign);
      } else {
        meta = facingIndex(dominantHorizontal(this.player.cam.F), Math.sign(this.player.cam.F[dominantHorizontal(this.player.cam.F)]!) || 1);
      }
    }
    const v = makeVoxel(id, meta);
    // Saplings only go on soil.
    if (REG.blocks[id]!.tags?.includes('sapling') && !this.farming.isSoil(this.world.getBlock(x, y - 1, z, w) & 0xfff)) return false;
    // Do not place solid blocks inside the player.
    if (REG.collision[id] !== COLLISION_NONE && this.player.mode !== 'spectator' && this.intersectsPlayer(x, y, z, w)) return false;
    if (DOOR_PART[id] === 1) {
      // Doors are two cells tall, on solid ground: the upper half goes on top (closed).
      const tv = this.world.getBlock(x, y + 1, z, w);
      if (tv === VOID_VOXEL || (tv !== 0 && !REG.replaceable[tv & 0xfff])) return false;
      if (REG.collision[this.world.getBlock(x, y - 1, z, w) & 0xfff] === COLLISION_NONE) return false;
      if (this.player.mode !== 'spectator' && this.intersectsPlayer(x, y + 1, z, w)) return false;
      if (!this.world.setBlock(x, y, z, w, v)) return false;
      this.world.setBlock(x, y + 1, z, w, makeVoxel(DOOR_OTHER[id]!, meta));
      return true;
    }
    if (BED_IDS[id] === 1) {
      // Beds are two cells: the head goes one cell further along the facing (where you look).
      const h = [x, y, z, w];
      h[FACING_AXES[meta % 6]!] += FACING_SIGNS[meta % 6]!;
      const hv = this.world.getBlock(h[0]!, h[1]!, h[2]!, h[3]!);
      if (hv === VOID_VOXEL || (hv !== 0 && !REG.replaceable[hv & 0xfff])) return false;
      if (this.player.mode !== 'spectator' && this.intersectsPlayer(h[0]!, h[1]!, h[2]!, h[3]!)) return false;
      if (!this.world.setBlock(x, y, z, w, v)) return false;
      this.world.setBlock(h[0]!, h[1]!, h[2]!, h[3]!, makeVoxel(BED_OTHER[id]!, meta));
      return true;
    }
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
    // 4D Glasses: every mob near you, wherever your slice is. 4D Vision (any other helmet):
    // mobs and key blocks. The Phase Lens (worn or held) and Phase Sight (the potion): faint
    // outlines of mobs and walls in the slices next to yours.
    const helm = this.armorPiece(0);
    const vision4d = helm !== null && IREG.name(helm.id) !== '4d_glasses' && enchLevel(helm, '4d_vision') > 0;
    const spect = this.player.mode === 'spectator';
    const lens = !spect && (this.wearing('phase_lens') || this.holding('phase_lens') || this.effects.has('phase_sight'));
    if (!spect && (this.wearing('4d_glasses') || vision4d)) this.vision.mobs(lines, e, cam, this.mobs, 32);
    else if (lens) this.vision.mobs(lines, e, cam, this.mobs, 24, 24, 8, 0.55);
    else this.vision.drawnMobs = 0;
    if (lens) {
      for (let i = 0; i < this.lensCells.length && !lines.full; i += 5) {
        const ana = this.lensCells[i + 4]! > 0;
        this.vision.cell(lines, e, cam, this.lensCells[i]!, this.lensCells[i + 1]!, this.lensCells[i + 2]!, this.lensCells[i + 3]!, ana ? 1 : 0.4, ana ? 0.5 : 0.65, ana ? 0.9 : 1, 1.3, 0.08);
      }
    }
    // W-Anchor in hand: its mark, outlined wherever it is in 4D, with a beam above it.
    const anchor = this.handStack('w_anchor');
    const mk = anchor?.tag?.mark;
    if (mk && mk[0] === this.world.realm.name) {
      const x = Math.floor(mk[1]), y = mk[2], z = Math.floor(mk[3]), w = Math.floor(mk[4]);
      this.vision.cell(lines, e, cam, x, y, z, w, 0.8, 0.45, 1, 1.95, 0.02);
      lines.addSegment4(mk[1] - e[0]!, y + 1 - e[1]!, mk[3] - e[2]!, mk[4] - e[3]!, mk[1] - e[0]!, y + 12 - e[1]!, mk[3] - e[2]!, mk[4] - e[3]!, cam, 0.8, 0.45, 1, 1.9);
    }
    // Spear reach off the slice: what you are about to hit.
    if (this.reachTarget) this.vision.mobOne(lines, e, cam, this.mobs, this.reachTarget, 1, 1, 1, 1.9);
    if (vision4d && this.player.mode !== 'spectator') {
      const ex = Math.floor(e[0]!), ey = Math.floor(e[1]!), ez = Math.floor(e[2]!), ew = Math.floor(e[3]!);
      this.keyBlocks.near(ex, ey, ez, ew, 24, 24, 3, (x, y, z, w, id) => {
        const dh = Vision4D.dh(e, cam, x + 0.5, y + 0.5, z + 0.5, w + 0.5);
        const c = KEY_COLORS[REG.blocks[id]!.tags?.includes('container') ? 1 : REG.blocks[id]!.tags?.includes('bed') ? 2 : REG.blocks[id]!.name === 'mob_spawner' ? 3 : 0]!;
        this.vision.cell(lines, e, cam, x, y, z, w, c[0], c[1], c[2], (Math.abs(dh) < 0.6 ? 0.35 : 0.9) + 1);
      });
    } else this.keyBlocks.found = 0;
    // Phase Strike target: its 4D outline, so you know what you are swinging at.
    if (this.phaseTarget) this.vision.mobOne(lines, e, cam, this.mobs, this.phaseTarget, 0.85, 0.45, 1, 1.95);
    // Spectral arrows: a hit mob glows through walls and off the slice.
    for (const m of this.mobs.list) if (m.glowing > 0 && !lines.full) this.vision.mobOne(lines, e, cam, this.mobs, m, 1, 0.92, 0.45, 1.95);
    // Slice Sense: ores in the slices kata and ana of yours.
    for (let i = 0; i < this.sliceSense.length; i += 5) {
      const id = this.sliceSense[i + 4]!;
      const tex = REG.textures[REG.texSide[id]!];
      const col = tex ? hexToRgb(tex.colors[tex.colors.length - 1]!) : [1, 1, 1];
      this.vision.cell(lines, e, cam, this.sliceSense[i]!, this.sliceSense[i + 1]!, this.sliceSense[i + 2]!, this.sliceSense[i + 3]!, col[0]!, col[1]!, col[2]!, 1.85, 0.12);
    }
    // Leads: a line from each leashed animal to your hand or its fence post.
    for (const m of this.mobs.list) {
      if (!m.leash) continue;
      const a0 = m.pos[0]! - e[0]!, a1 = m.pos[1]! + m.height * 0.75 - e[1]!, a2 = m.pos[2]! - e[2]!, a3 = m.pos[3]! - e[3]!;
      let b0: number, b1: number, b2: number, b3: number;
      if (m.leash === 'player') {
        const R = cam.right;
        b0 = R[0]! * 0.35;
        b1 = -0.45 + R[1]! * 0.35;
        b2 = R[2]! * 0.35;
        b3 = R[3]! * 0.35;
      } else {
        b0 = m.leash[0] + 0.5 - e[0]!;
        b1 = m.leash[1] + 0.7 - e[1]!;
        b2 = m.leash[2] + 0.5 - e[2]!;
        b3 = m.leash[3] + 0.5 - e[3]!;
      }
      lines.addSegment4(a0, a1, a2, a3, b0, b1, b2, b3, cam, 0.5, 0.33, 0.16, 0.95);
    }
    // Reach Through target: outlined in violet (the slice does not cut it).
    if (this.hasTarget && this.targetShift !== 0 && !this.targetMob) {
      const t = this.target;
      this.vision.cell(lines, e, cam, t.x, t.y, t.z, t.w, 0.8, 0.4, 1, 1.95, 0.02);
    }
    if (this.hasTarget && this.targetShift === 0) {
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
    // Your graves, outlined (also through walls) when within 64 blocks.
    for (const g of this.graves) {
      if (g.realm !== this.world.realm.name) continue;
      let d2 = 0;
      for (let k = 0; k < 4; k++) d2 += (g.pos[k]! + 0.5 - e[k]!) ** 2;
      if (d2 > 64 * 64) continue;
      for (let k = 0; k < 4; k++) {
        mn[k] = g.pos[k]! - e[k]!;
        mx[k] = mn[k]! + 1;
      }
      lines.addBox(mn, mx, cam, 0.95, 0.95, 1, 0.8);
    }
    // The fishing bobber: a small red box on the water, bright and dipping on a bite.
    const fb = this.fishing;
    if (fb) {
      const dip = fb.bite > 0 ? 0.3 : 0;
      const up = this.player.up;
      for (let k = 0; k < 4; k++) {
        const base = fb.pos[k]! + 0.5 - e[k]!;
        mn[k] = base - 0.09;
        mx[k] = base + 0.09;
      }
      mn[up] = fb.pos[up]! + 0.8 - dip - e[up]!;
      mx[up] = mn[up]! + 0.2;
      lines.addBox(mn, mx, cam, 1, fb.bite > 0 ? 0.9 : 0.15, 0.1, 1);
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

